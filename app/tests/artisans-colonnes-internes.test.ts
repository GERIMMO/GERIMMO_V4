/**
 * Colonnes internes de la fiche artisan (relecture du 15/10/2026 du lot « invitation-artisan », migration 20261014842000).
 *
 * Constat : toute organisation cliente qui a l'artisan dans son carnet (propriétaire direct après une invitation acceptée,
 * agence par l'ajout par SIRET ou une sollicitation) lisait, par une requête directe sur `public.artisans`, les colonnes
 * de décision internes à Gerimmo : motifs de refus et d'exclusion, auteur et date des décisions, échéances de purge,
 * organisation qui a créé la fiche. Le droit de lecture de `authenticated` porte désormais sur une liste de colonnes ; les
 * écrans légitimes (espace de l'artisan, console de supervision) passent par des fonctions SECURITY DEFINER.
 *
 * Chaque cas agit avec les droits réels du profil (rôle `authenticated`, jeton simulé), dans une transaction annulée.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);

/** Les colonnes de décision internes : jamais lisibles par un client, ni par `select *`, ni nommément. */
const INTERNES = [
  "statut_motif",
  "statut_decide_le",
  "statut_decide_par",
  "blacklist_globale_motif",
  "blacklist_globale_par",
  "purge_motif_le",
  "purge_prevue_le",
  "cree_par_organization_id",
];
/** Ce que les écrans clients lisent (carnet, fiche de l'agence, réseau, documents) : inchangé. */
const OUVERTES = [
  "id",
  "account_id",
  "raison_sociale",
  "siret",
  "siret_etat",
  "email",
  "telephone",
  "visibilite",
  "statut_plateforme",
  "blacklist_globale_le",
  "created_at",
  "updated_at",
];

describe.skipIf(!DB)("Fiche artisan : colonnes internes fermées aux clients", () => {
  let db: Client;
  let proprietaire: string, adminAgence: string, agent: string, artisanCompte: string, superviseur: string;
  let org: string, agence: string, artisan: string;

  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (email: string) =>
    id(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,'x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`,
      [email]
    );
  const devenir = async (qui: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]);
    await db.query("set local role authenticated");
  };
  const postgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const echec = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as Error).message;
    }
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB });
    await db.connect();
    await db.query("begin");
    const s = Math.random().toString(36).slice(2, 10);
    [proprietaire, adminAgence, agent, artisanCompte, superviseur] = [
      await compte(`proprio-${s}@test.local`), await compte(`admin-${s}@test.local`), await compte(`agent-${s}@test.local`),
      await compte(`artisan-${s}@test.local`), await compte(`sa-${s}@test.local`),
    ];
    org = await id("insert into public.organizations(name,type,status) values('Parc colonnes internes','proprietaire_direct','active') returning id");
    agence = await id("insert into public.organizations(name,type,status) values('Agence colonnes internes','agence','active') returning id");
    await db.query(
      `insert into public.memberships(account_id,organization_id,role) values
        ($1,$2,'proprietaire_direct'),($3,$4,'admin_agence'),($5,$4,'agent'),($6,null,'super_admin')`,
      [proprietaire, org, adminAgence, agence, agent, superviseur]
    );
    // Une fiche refusée, exclue de la plateforme, avec échéances de purge : toutes les colonnes internes sont remplies.
    artisan = await id(
      `insert into public.artisans(account_id,raison_sociale,siret,telephone,email,statut_plateforme,statut_motif,statut_decide_le,statut_decide_par,
         blacklist_globale_le,blacklist_globale_motif,blacklist_globale_par,purge_motif_le,purge_prevue_le,cree_par_organization_id)
       values($1,'Plomberie Colonnes',$2,'0611223344','pro@colonnes.test','refuse','Attestation illisible',now(),$3,
         now(),'Faux document',$3,current_date+1800,current_date+90,$4) returning id`,
      [artisanCompte, `8${String(Date.now()).slice(-13)}`, superviseur, agence]
    );
    // Le propriétaire (invitation acceptée) et l'agence (ajout par SIRET) ont l'artisan dans leur carnet.
    await db.query(
      "insert into public.artisan_agences(organization_id,artisan_id,statut,created_by) values($1,$3,'actif',$4),($2,$3,'actif',$5)",
      [org, agence, artisan, proprietaire, adminAgence]
    );
  });
  beforeEach(async () => {
    await postgres();
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("les droits de lecture portent sur une liste de colonnes : aucune colonne interne pour authenticated, rien pour anon", async () => {
    const { rows } = await db.query(
      "select attname as colonne, has_column_privilege('authenticated','public.artisans',attname,'SELECT') as c, has_column_privilege('anon','public.artisans',attname,'SELECT') as a from pg_attribute where attrelid='public.artisans'::regclass and attnum>0 and not attisdropped order by attnum"
    );
    const lisibles = rows.filter((r) => r.c).map((r) => r.colonne).sort();
    expect(lisibles).toEqual([...OUVERTES].sort());
    expect(rows.filter((r) => r.a)).toEqual([]);
    // Toutes les colonnes de la table sont classées : une colonne ajoutée plus tard reste fermée tant qu'on ne l'ouvre pas.
    expect(rows.map((r) => r.colonne).sort()).toEqual([...OUVERTES, ...INTERNES].sort());
    expect((await db.query("select has_table_privilege('authenticated','public.artisans','SELECT') t")).rows[0].t).toBe(false);
  });

  it.each(["proprietaire", "adminAgence", "agent"])("%s : ni `select *`, ni une colonne interne nommée", async (profil) => {
    const qui = { proprietaire, adminAgence, agent }[profil]!;
    await devenir(qui);
    // La fiche reste lisible (relation dans le carnet) pour les colonnes ouvertes.
    const fiche = (await db.query(`select ${OUVERTES.join(",")} from public.artisans where id=$1`, [artisan])).rows;
    expect(fiche).toHaveLength(1);
    expect(fiche[0]).toMatchObject({ raison_sociale: "Plomberie Colonnes", statut_plateforme: "refuse", telephone: "0611223344" });
    expect(fiche[0].blacklist_globale_le).not.toBeNull();
    expect(await echec("select * from public.artisans where id=$1", [artisan])).toMatch(/permission denied/);
    expect(await echec("select a.* from public.artisans a where a.id=$1", [artisan])).toMatch(/permission denied/);
    expect(await echec("select to_jsonb(a) from public.artisans a where a.id=$1", [artisan])).toMatch(/permission denied/);
    for (const colonne of INTERNES) {
      expect(await echec(`select ${colonne} from public.artisans where id=$1`, [artisan]), colonne).toMatch(/permission denied/);
      // Ni par un filtre ou un tri, qui révéleraient la valeur sans la rendre.
      expect(await echec(`select id from public.artisans where ${colonne} is not null`), colonne).toMatch(/permission denied/);
    }
  });

  it("l'artisan lit toujours son motif, dans son espace (mon_artisan)", async () => {
    await devenir(artisanCompte);
    expect((await db.query("select statut_plateforme, statut_motif from public.mon_artisan()")).rows).toEqual([
      { statut_plateforme: "refuse", statut_motif: "Attestation illisible" },
    ]);
  });

  it("la supervision lit les décisions et leurs motifs par ses fonctions ; aucun client ne les appelle", async () => {
    await devenir(superviseur);
    const liste = (await db.query("select * from public.decisions_artisans_supervision(0, 500)")).rows;
    expect(liste.find((l) => l.id === artisan)).toMatchObject({
      raison_sociale: "Plomberie Colonnes", statut_plateforme: "refuse", statut_motif: "Attestation illisible",
    });
    expect(liste.find((l) => l.id === artisan).statut_decide_le).not.toBeNull();
    const fiche = (await db.query("select * from public.decisions_artisan_supervision($1)", [artisan])).rows;
    expect(fiche).toHaveLength(1);
    expect(fiche[0]).toMatchObject({ blacklist_globale_motif: "Faux document" });
    expect(fiche[0].statut_decide_le).not.toBeNull();
    expect(fiche[0].purge_prevue_le).not.toBeNull();
    // Ce que l'écran n'affiche pas n'est pas rendu (auteurs des décisions, organisation créatrice).
    expect(Object.keys(fiche[0]).sort()).toEqual(["blacklist_globale_motif", "purge_prevue_le", "statut_decide_le"]);
    expect(Object.keys(liste[0]).sort()).toEqual(["id", "raison_sociale", "statut_decide_le", "statut_motif", "statut_plateforme"]);

    for (const qui of [proprietaire, adminAgence, agent, artisanCompte]) {
      await devenir(qui);
      expect(await echec("select * from public.decisions_artisans_supervision(0, 20)")).toMatch(/Accès refusé/);
      expect(await echec("select * from public.decisions_artisan_supervision($1)", [artisan])).toMatch(/Accès refusé/);
    }
    await postgres();
    for (const signature of ["public.decisions_artisans_supervision(integer,integer)", "public.decisions_artisan_supervision(uuid)"]) {
      const { rows } = await db.query("select has_function_privilege('anon',$1::regprocedure,'execute') a, has_function_privilege('authenticated',$1::regprocedure,'execute') c", [signature]);
      expect(rows[0], signature).toEqual({ a: false, c: true });
    }
  });

  it("la liste des décisions est triée (plus récente d'abord) et paginée comme l'écran, bornée", async () => {
    await devenir(superviseur);
    const tout = (await db.query("select * from public.decisions_artisans_supervision(0, 500)")).rows;
    const page = (await db.query("select * from public.decisions_artisans_supervision(1, 2)")).rows;
    expect(page.map((l) => l.id)).toEqual(tout.slice(1, 3).map((l) => l.id));
    for (let i = 1; i < tout.length; i++) {
      const [a, b] = [tout[i - 1].statut_decide_le, tout[i].statut_decide_le];
      if (a && b) expect(new Date(a).getTime()).toBeGreaterThanOrEqual(new Date(b).getTime());
      if (!a) expect(b).toBeNull();
    }
    expect(tout.every((l) => ["valide", "refuse"].includes(l.statut_plateforme))).toBe(true);
    expect(await echec("select * from public.decisions_artisans_supervision(-1, 20)")).toMatch(/Page invalide/);
    expect(await echec("select * from public.decisions_artisans_supervision(0, 501)")).toMatch(/Page invalide/);
  });
});

/** Inventaire : aucun écran ne lit une colonne interne par requête directe sur `artisans` (le droit le refuserait). */
describe("Écrans : aucune lecture directe d'une colonne interne de la fiche artisan", () => {
  const racine = path.resolve(__dirname, "../src");
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((nom) => {
      const chemin = path.join(dossier, nom);
      return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(ts|tsx)$/.test(nom) && !nom.endsWith(".d.ts") ? [chemin] : [];
    });

  it("ni `.from(\"artisans\")`, ni une jointure `artisans(…)` ne nomment une colonne interne, ni `*`", () => {
    const fautes: string[] = [];
    for (const fichier of fichiers(racine)) {
      if (fichier.endsWith(path.join("supabase", "database.types.ts"))) continue;
      const texte = readFileSync(fichier, "utf8");
      for (const m of texte.matchAll(/from\(\s*["'`]artisans["'`]\s*\)([\s\S]{0,400})/g)) {
        const selection = /\.select\(\s*(["'`])([\s\S]*?)\1/.exec(m[1]);
        const colonnes = selection?.[2] ?? "*";
        if (/(^|[\s,(])\*([\s,)]|$)/.test(colonnes) || INTERNES.some((c) => colonnes.includes(c))) {
          fautes.push(`${path.relative(racine, fichier)} : ${colonnes}`);
        }
      }
      for (const m of texte.matchAll(/artisans(?:![a-z_]+)?\(([^)]*)\)/g)) {
        if (INTERNES.some((c) => m[1].includes(c))) fautes.push(`${path.relative(racine, fichier)} : ${m[0]}`);
      }
    }
    expect(fautes).toEqual([]);
  });
});
