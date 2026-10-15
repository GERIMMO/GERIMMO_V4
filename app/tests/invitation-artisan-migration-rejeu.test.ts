/**
 * Invitation d'un artisan par un propriétaire direct (décision du 15/10/2026) : la migration 20261014840000 se rejoue
 * sans effet, et son retour arrière défait exactement ce qu'elle avait créé.
 *
 *  - REJEU. Rejouée deux fois sur une base migrée : définitions et droits des fonctions, colonnes, contraintes, index,
 *    déclencheurs, droits et RLS de la table identiques ; aucune invitation touchée.
 *  - RETOUR. Supprime les douze fonctions et la table ; CONSERVE les rattachements au carnet déjà faits par une acceptation
 *    (`artisan_agences`) et les traces du journal ; se rejoue sans effet ; refuse de se jouer dans un lot.
 *    Aller, retour, aller : l'état migré est retrouvé à l'identique.
 *  - La migration ne modifie AUCUNE fonction existante (elle n'en crée que de nouvelles) : aucune migration antérieure
 *    n'a donc de rejeu à revérifier (règle 4 des vagues précédentes).
 *
 * DDL tenu pendant l'essai (création et suppression d'une table qui référence organizations, accounts et artisans) :
 * ce fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts). Tout se joue dans une transaction annulée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = readFileSync("supabase/migrations/20261014840000_invitation_artisan_proprietaire.sql", "utf8");
/**
 * Les migrations suivantes du lot qui modifient, PAR MARQUE, une fonction créée par 20261014840000 (seconde relecture du
 * 15/10). Rejouer 840000 seule rétablirait ces fonctions dans leur première forme ; rejouer le lot dans l'ordre redonne
 * l'état migré (chaque correctif retrouve son ancre et se repose).
 */
const SUITE_DU_LOT = ["20261014844000_invitation_artisan_budget_distinct.sql", "20261014845000_invitation_artisan_soi_meme.sql",
  "20261014846000_invitation_artisan_annulation_suspendue.sql",
  "20261014847000_invitation_artisan_echeance_jour_paris.sql"].map((f) =>
  readFileSync(`supabase/migrations/${f}`, "utf8")
);
const RETOUR = readFileSync("supabase/retours-arriere/20261014840000_invitation_artisan_proprietaire.retour.sql", "utf8");
const FONCTIONS = [
  "public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)",
  "public.renvoyer_invitation_artisan(uuid)",
  "public.annuler_invitation_artisan(uuid)",
  "public.noter_envoi_invitation_artisan(uuid,boolean)",
  "public.carnet_artisans_proprietaire(uuid)",
  "public.mon_invitation_artisan(uuid)",
  "public.repondre_invitation_artisan(uuid,boolean)",
  "public.invitations_des_artisans_a_valider()",
  "public.invitation_artisan_par_proprietaire(uuid)",
  "public.adresse_canonique_invitation_artisan(text)",
  "public.autoriser_invitation_artisan_cle(text,integer,integer)",
  "public.limiter_envoi_invitation_artisan(uuid,text)",
];

/** Le script de retour gère sa propre transaction et refuse de se jouer dans un lot : on lui retire cette enveloppe seule. */
function sansEnveloppe(script: string): string {
  return script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");
}

describe.skipIf(!DB_URL)("invitation d'artisan — rejeu de la migration et retour arrière", () => {
  let db: Client;

  async function empreinte(): Promise<Record<string, string>> {
    const etat: Record<string, string> = {};
    for (const signature of FONCTIONS) {
      const { rows } = await db.query(
        `select case when to_regprocedure($1) is null then 'absente'
                else md5(pg_get_functiondef(to_regprocedure($1))) || ' ' || coalesce((select proacl::text from pg_proc where oid = to_regprocedure($1)), '') end as v`,
        [signature]
      );
      etat[signature] = rows[0].v;
    }
    const table = await db.query(`select coalesce((select relacl::text || ' rls=' || relrowsecurity from pg_class where oid = to_regclass('public.invitations_artisans')), 'absente') v`);
    etat.table = table.rows[0].v;
    const colonnes = await db.query(
      `select string_agg(column_name || ':' || data_type || ':' || coalesce(column_default, '') || ':' || is_nullable, ',' order by ordinal_position) v
         from information_schema.columns where table_schema = 'public' and table_name = 'invitations_artisans'`
    );
    etat.colonnes = colonnes.rows[0].v ?? "";
    const contraintes = await db.query(
      `select string_agg(conname || '=' || pg_get_constraintdef(oid), ',' order by conname) v from pg_constraint
        where conrelid = coalesce(to_regclass('public.invitations_artisans'), 0::oid)`
    );
    etat.contraintes = contraintes.rows[0].v ?? "";
    const index = await db.query(`select string_agg(indexdef, ',' order by indexname) v from pg_indexes where schemaname = 'public' and tablename = 'invitations_artisans'`);
    etat.index = index.rows[0].v ?? "";
    const declencheurs = await db.query(
      `select string_agg(pg_get_triggerdef(oid), ',' order by tgname) v from pg_trigger
        where tgrelid = coalesce(to_regclass('public.invitations_artisans'), 0::oid) and not tgisinternal`
    );
    etat.declencheurs = declencheurs.rows[0].v ?? "";
    return etat;
  }

  async function echoue(sql: string): Promise<string> {
    await db.query("savepoint essai");
    try {
      await db.query(sql);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as Error).message;
    }
  }

  /** Une invitation acceptée : un propriétaire, un artisan inscrit, la ligne du carnet. Renvoie les identifiants. */
  async function invitationAcceptee() {
    const compte = async (email: string) =>
      (await db.query(
        `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
         values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,'x',now(),'{}','{}',now(),now(),'','','','','') returning id`,
        [email]
      )).rows[0].id as string;
    const suffixe = Math.random().toString(36).slice(2, 10);
    const org = (await db.query("insert into public.organizations(name,type,status) values('Parc rejeu','proprietaire_direct','active') returning id")).rows[0].id as string;
    const proprietaire = await compte(`proprio-rejeu-${suffixe}@test.local`);
    const email = `artisan-rejeu-${suffixe}@test.local`;
    const artisanCompte = await compte(email);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [proprietaire, org]);
    const artisan = (await db.query(
      "insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'Artisan rejeu',$2,'0600000000') returning id",
      [artisanCompte, `8${String(Date.now()).slice(-13)}`]
    )).rows[0].id as string;
    const devenir = async (qui: string) => {
      await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated')::text,true)", [qui]);
      await db.query("set local role authenticated");
    };
    await devenir(proprietaire);
    const invitation = (await db.query("select public.preparer_invitation_artisan($1,$2) r", [org, email])).rows[0].r.id as string;
    await db.query("reset role");
    await devenir(artisanCompte);
    expect((await db.query("select public.repondre_invitation_artisan($1,true) r", [invitation])).rows[0].r).toEqual({ etat: "acceptee" });
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
    return { org, artisan, invitation };
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("la base visée est migrée : table et douze fonctions présentes", async () => {
    const e = await empreinte();
    for (const signature of FONCTIONS) expect(e[signature], signature).not.toBe("absente");
    expect(e.table).not.toBe("absente");
    expect(e.table).toContain("rls=true");
  });

  it("rejouée deux fois, la migration ne change rien, ni aux objets ni aux invitations", async () => {
    const { invitation, org, artisan } = await invitationAcceptee();
    const avant = await empreinte();
    const lignes = async () =>
      (await db.query("select row_to_json(i)::text v from public.invitations_artisans i where organization_id=$1", [org])).rows.map((r) => r.v);
    const invitationsAvant = await lignes();
    for (let fois = 0; fois < 2; fois++) {
      await db.query(MIGRATION);
      for (const suite of SUITE_DU_LOT) await db.query(suite);
    }
    expect(await empreinte()).toEqual(avant);
    expect(await lignes()).toEqual(invitationsAvant);
    expect((await db.query("select etat, artisan_id from public.invitations_artisans where id=$1", [invitation])).rows[0]).toEqual({ etat: "acceptee", artisan_id: artisan });
  });

  it("le retour refuse de se jouer dans un lot (migrations.yml, begin;) : la garde l'interdit", async () => {
    expect(await echoue(RETOUR)).toMatch(/Retour arrière refusé/);
    expect((await empreinte()).table).not.toBe("absente");
  });

  it("le retour supprime table et fonctions, conserve le carnet et le journal, se rejoue sans effet ; aller, retour, aller redonne l'état migré", async () => {
    const migre = await empreinte();
    const { org, artisan } = await invitationAcceptee();
    await db.query(sansEnveloppe(RETOUR));
    const apres = await empreinte();
    for (const signature of FONCTIONS) expect(apres[signature], signature).toBe("absente");
    expect(apres.table).toBe("absente");
    // Conservés : le rattachement fait par l'acceptation, et ses traces.
    expect((await db.query("select statut from public.artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisan])).rows).toEqual([{ statut: "actif" }]);
    expect((await db.query("select count(*)::int n from public.audit_log where organization_id=$1 and action like 'invitation_artisan%'", [org])).rows[0].n).toBe(2);
    // Rejouable : déjà défait, rien à faire.
    await db.query(sansEnveloppe(RETOUR));
    expect(await empreinte()).toEqual(apres);
    // Aller de nouveau (840000 puis la suite du lot) : identique à l'état migré.
    await db.query(MIGRATION);
    for (const suite of SUITE_DU_LOT) await db.query(suite);
    expect(await empreinte()).toEqual(migre);
  });
});

/**
 * Relecture du 15/10 (constat bloquant) : 20261014841000 retire `proprietaire_direct` des rôles admis par
 * `artisan_definir_metiers_zones` (fonction de 20260911180000, modifiée par marque). Rejouée, elle ne fait rien ; son
 * retour rétablit EXACTEMENT la définition d'origine (comparée à celle que crée 20260911180000), se rejoue sans effet,
 * et refuse de se jouer dans un lot.
 */
const MIGRATION_ZONES = readFileSync("supabase/migrations/20261014841000_metiers_zones_sans_proprietaire.sql", "utf8");
const RETOUR_ZONES = readFileSync("supabase/retours-arriere/20261014841000_metiers_zones_sans_proprietaire.retour.sql", "utf8");
const SIGNATURE_ZONES = "public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])";
/** La définition d'origine, telle que 20260911180000 la crée (rejouable ici en `create or replace`). */
const ORIGINE_ZONES = (() => {
  const socle = readFileSync("supabase/migrations/20260911180000_module8_artisans_socle.sql", "utf8");
  const bloc = /create function public\.artisan_definir_metiers_zones\([\s\S]*?\n\$\$;/.exec(socle);
  if (!bloc) throw new Error("Définition d'origine de artisan_definir_metiers_zones introuvable dans 20260911180000");
  return bloc[0].replace(/^create function/, "create or replace function");
})();

describe.skipIf(!DB_URL)("métiers et zone sans propriétaire direct — rejeu de 20261014841000 et retour arrière", () => {
  let db: Client;
  const empreinte = async () =>
    (await db.query(
      "select md5(pg_get_functiondef(to_regprocedure($1))) || ' ' || coalesce((select proacl::text from pg_proc where oid = to_regprocedure($1)), '') v",
      [SIGNATURE_ZONES]
    )).rows[0].v as string;
  const definition = async () => (await db.query("select pg_get_functiondef(to_regprocedure($1)) d", [SIGNATURE_ZONES])).rows[0].d as string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("la base visée est migrée : la fonction n'admet plus le propriétaire direct", async () => {
    const d = await definition();
    expect(d).toContain("Relecture du 15/10 (invitation d'artisan)");
    expect(d).toContain("m.role in ('admin_agence','agent'))");
    expect(d).not.toContain("proprietaire_direct");
  });

  it("rejouée deux fois, la migration ne change ni la définition ni les droits", async () => {
    const avant = await empreinte();
    await db.query(MIGRATION_ZONES);
    await db.query(MIGRATION_ZONES);
    expect(await empreinte()).toBe(avant);
  });

  it("le retour refuse de se jouer dans un lot", async () => {
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query(RETOUR_ZONES);
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    expect(message).toMatch(/Retour arrière refusé/);
  });

  it("le retour rétablit exactement la définition d'origine, se rejoue sans effet ; aller, retour, aller redonne l'état migré", async () => {
    const migre = await empreinte();
    await db.query(sansEnveloppe(RETOUR_ZONES));
    const apres = await empreinte();
    expect(apres).not.toBe(migre);
    expect(await definition()).toContain("m.role in ('admin_agence','agent','proprietaire_direct'))");
    // Identique, définition et droits, à ce que crée la migration d'origine.
    await db.query(ORIGINE_ZONES);
    expect(await empreinte()).toBe(apres);
    // Rejouable : déjà défait, rien à faire.
    await db.query(sansEnveloppe(RETOUR_ZONES));
    expect(await empreinte()).toBe(apres);
    // Aller de nouveau : identique à l'état migré.
    await db.query(MIGRATION_ZONES);
    expect(await empreinte()).toBe(migre);
  });
});

/**
 * Seconde relecture du 15/10 (constat « important ») : 20261014842000 ferme aux clients les colonnes de décision
 * internes de `public.artisans` (privilèges par colonne) et crée deux fonctions pour la supervision. Rejouée, elle ne
 * change rien ; son retour rétablit le droit de lecture de toute la table pour `authenticated` (et lui seul), supprime
 * les deux fonctions, se rejoue sans effet et refuse de se jouer dans un lot ; aller, retour, aller redonne l'état migré.
 */
const MIGRATION_COLONNES = readFileSync("supabase/migrations/20261014842000_artisans_colonnes_internes.sql", "utf8");
const RETOUR_COLONNES = readFileSync("supabase/retours-arriere/20261014842000_artisans_colonnes_internes.retour.sql", "utf8");
const FONCTIONS_COLONNES = ["public.decisions_artisans_supervision(integer,integer)", "public.decisions_artisan_supervision(uuid)"];

describe.skipIf(!DB_URL)("colonnes internes de la fiche artisan — rejeu de 20261014842000 et retour arrière", () => {
  let db: Client;
  const empreinte = async () => {
    const { rows: [table] } = await db.query("select relacl::text t from pg_class where oid='public.artisans'::regclass");
    const { rows: [colonnes] } = await db.query(
      "select coalesce(string_agg(attname || '=' || attacl::text, ',' order by attnum), '') c from pg_attribute where attrelid='public.artisans'::regclass and attnum>0 and attacl is not null"
    );
    const fonctions: string[] = [];
    for (const signature of FONCTIONS_COLONNES) {
      const { rows } = await db.query(
        `select case when to_regprocedure($1) is null then 'absente'
                else md5(pg_get_functiondef(to_regprocedure($1))) || ' ' || coalesce((select proacl::text from pg_proc where oid = to_regprocedure($1)), '') end as v`,
        [signature]
      );
      fonctions.push(rows[0].v);
    }
    return { table: table.t as string, colonnes: colonnes.c as string, fonctions };
  };
  /** Les droits de la table hors `authenticated` : ni la migration ni son retour n'y touchent. */
  const autresRoles = (acl: string) => acl.replace(/^\{|\}$/g, "").split(",").filter((e) => !e.startsWith("authenticated=")).sort();

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("la base visée est migrée : droit par colonne, sans droit de table, et deux fonctions", async () => {
    const e = await empreinte();
    expect(e.table).not.toMatch(/authenticated=r/);
    expect(e.colonnes).toContain("raison_sociale={authenticated=r/");
    expect(e.colonnes).not.toContain("statut_motif=");
    for (const f of e.fonctions) expect(f).not.toBe("absente");
  });

  it("rejouée deux fois, la migration ne change ni les droits ni les fonctions", async () => {
    const avant = await empreinte();
    await db.query(MIGRATION_COLONNES);
    await db.query(MIGRATION_COLONNES);
    expect(await empreinte()).toEqual(avant);
  });

  it("le retour refuse de se jouer dans un lot", async () => {
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query(RETOUR_COLONNES);
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    expect(message).toMatch(/Retour arrière refusé/);
  });

  it("le retour rouvre la table à authenticated seul, supprime les fonctions, se rejoue sans effet ; aller, retour, aller redonne l'état migré", async () => {
    const migre = await empreinte();
    await db.query(sansEnveloppe(RETOUR_COLONNES));
    const apres = await empreinte();
    expect(apres.fonctions).toEqual(["absente", "absente"]);
    expect(apres.colonnes).toBe("");
    expect(apres.table).toMatch(/authenticated=r\//);
    expect(autresRoles(apres.table)).toEqual(autresRoles(migre.table));
    expect((await db.query("select has_column_privilege('authenticated','public.artisans','statut_motif','SELECT') p")).rows[0].p).toBe(true);
    expect((await db.query("select has_table_privilege('anon','public.artisans','SELECT') p")).rows[0].p).toBe(false);
    // Rejouable : déjà défait, rien à faire.
    await db.query(sansEnveloppe(RETOUR_COLONNES));
    expect(await empreinte()).toEqual(apres);
    // Aller de nouveau : identique à l'état migré.
    await db.query(MIGRATION_COLONNES);
    expect(await empreinte()).toEqual(migre);
  });
});

/**
 * Seconde relecture du 15/10 (constat de sécurité) : 20261014843000 fait exiger à `artisan_blacklist_locale` une relation
 * préalable réelle (bloc posé devant UNE ligne d'ancre, par marque). Rejouée, elle ne fait rien ; son retour retire le
 * seul bloc (la définition redevient exactement celle d'avant : migrée moins le bloc), se rejoue sans effet et refuse de
 * se jouer dans un lot ; aller, retour, aller redonne l'état migré.
 */
const MIGRATION_LISTE_NOIRE = readFileSync("supabase/migrations/20261014843000_liste_noire_locale_relation_prealable.sql", "utf8");
const RETOUR_LISTE_NOIRE = readFileSync("supabase/retours-arriere/20261014843000_liste_noire_locale_relation_prealable.retour.sql", "utf8");
const SIGNATURE_LISTE_NOIRE = "public.artisan_blacklist_locale(uuid,uuid,text)";

describe.skipIf(!DB_URL)("liste noire locale avec relation préalable — rejeu de 20261014843000 et retour arrière", () => {
  let db: Client;
  const definition = async () => (await db.query("select pg_get_functiondef(to_regprocedure($1)) d", [SIGNATURE_LISTE_NOIRE])).rows[0].d as string;
  const empreinte = async () =>
    (await db.query(
      "select md5(pg_get_functiondef(to_regprocedure($1))) || ' ' || coalesce((select proacl::text from pg_proc where oid = to_regprocedure($1)), '') v",
      [SIGNATURE_LISTE_NOIRE]
    )).rows[0].v as string;
  const bloc = (() => {
    const m = /c_nouveau constant text := \$nouveau\$([\s\S]*?)\$nouveau\$;/.exec(MIGRATION_LISTE_NOIRE);
    const a = /c_ancre constant text := \$ancre\$([\s\S]*?)\$ancre\$;/.exec(MIGRATION_LISTE_NOIRE);
    if (!m || !a) throw new Error("Bloc ou ancre introuvable dans 20261014843000");
    return { nouveau: m[1], ancre: a[1] };
  })();

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("la base visée est migrée : le bloc est posé une fois, devant l'ancre", async () => {
    const d = await definition();
    expect(d.split("Relecture du 15/10 (liste noire à l'aveugle)")).toHaveLength(2);
    expect(d).toContain(bloc.nouveau);
  });

  it("rejouée deux fois, la migration ne change ni la définition ni les droits", async () => {
    const avant = await empreinte();
    await db.query(MIGRATION_LISTE_NOIRE);
    await db.query(MIGRATION_LISTE_NOIRE);
    expect(await empreinte()).toBe(avant);
  });

  it("le retour refuse de se jouer dans un lot", async () => {
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query(RETOUR_LISTE_NOIRE);
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    expect(message).toMatch(/Retour arrière refusé/);
  });

  it("le retour retire le seul bloc, se rejoue sans effet ; aller, retour, aller redonne l'état migré", async () => {
    const migre = await empreinte();
    const definitionMigree = await definition();
    await db.query(sansEnveloppe(RETOUR_LISTE_NOIRE));
    const apres = await empreinte();
    expect(apres).not.toBe(migre);
    expect(await definition()).toBe(definitionMigree.replace(bloc.nouveau, bloc.ancre));
    expect(await definition()).not.toContain("liste noire à l'aveugle");
    await db.query(sansEnveloppe(RETOUR_LISTE_NOIRE));
    expect(await empreinte()).toBe(apres);
    await db.query(MIGRATION_LISTE_NOIRE);
    expect(await empreinte()).toBe(migre);
  });
});

/**
 * Seconde relecture du 15/10 : les correctifs du lot posés PAR MARQUE sur une fonction (une ancre d'une ligne remplacée
 * ou précédée d'un bloc). Pour chacun : la base est migrée (marque présente une fois) ; rejouée deux fois, la migration ne
 * change ni la définition ni les droits ; le retour refuse de se jouer dans un lot ; il rétablit exactement la définition
 * d'avant (la définition migrée où le morceau de la migration redevient l'ancre), se rejoue sans effet ; aller, retour,
 * aller redonne l'état migré.
 */
function correctifParMarque(fichier: string) {
  const migration = readFileSync(`supabase/migrations/${fichier}.sql`, "utf8");
  const retour = readFileSync(`supabase/retours-arriere/${fichier}.retour.sql`, "utf8");
  // Chaque bloc `do $correctif$` : la fonction relue, sa marque, son ancre et son morceau.
  const blocs = [...migration.matchAll(/do \$correctif\$([\s\S]*?)end \$correctif\$;/g)].map((m) => {
    const signature = /pg_get_functiondef\('([^']+)'::regprocedure\)/.exec(m[1])?.[1];
    const marque = /position\(\$marque\$([\s\S]*?)\$marque\$/.exec(m[1])?.[1];
    const nouveau = /c_nouveau constant text := \$nouveau\$([\s\S]*?)\$nouveau\$;/.exec(m[1])?.[1];
    const ancre = /c_ancre constant text := \$ancre\$([\s\S]*?)\$ancre\$;/.exec(m[1])?.[1];
    if (!signature || !marque || !nouveau || !ancre) throw new Error(`Bloc incomplet dans ${fichier}`);
    return { signature: signature.replace(/\s+/g, ""), marque, nouveau, ancre };
  });
  if (blocs.length === 0) throw new Error(`Aucun bloc à marque dans ${fichier}`);

  describe.skipIf(!DB_URL)(`${fichier} — rejeu et retour arrière`, () => {
    let db: Client;
    const definition = async (signature: string) =>
      (await db.query("select pg_get_functiondef(to_regprocedure($1)) d", [signature])).rows[0].d as string;
    const empreinte = async () => {
      const etat: string[] = [];
      for (const { signature } of blocs) {
        etat.push((await db.query(
          "select md5(pg_get_functiondef(to_regprocedure($1))) || ' ' || coalesce((select proacl::text from pg_proc where oid = to_regprocedure($1)), '') v",
          [signature]
        )).rows[0].v as string);
      }
      return etat;
    };

    beforeAll(async () => {
      db = new Client({ connectionString: DB_URL });
      await db.connect();
      await db.query("begin");
    });
    afterAll(async () => {
      await db?.query("rollback");
      await db?.end();
    });
    beforeEach(async () => {
      await db.query("savepoint cas");
    });
    afterEach(async () => {
      await db.query("rollback to savepoint cas");
      await db.query("release savepoint cas");
    });

    it("la base visée est migrée : chaque marque est posée une fois", async () => {
      for (const b of blocs) {
        expect((await definition(b.signature)).split(b.marque), b.signature).toHaveLength(2);
        expect(await definition(b.signature)).toContain(b.nouveau);
      }
    });

    it("rejouée deux fois, la migration ne change ni les définitions ni les droits", async () => {
      const avant = await empreinte();
      await db.query(migration);
      await db.query(migration);
      expect(await empreinte()).toEqual(avant);
    });

    it("le retour refuse de se jouer dans un lot", async () => {
      await db.query("savepoint essai");
      let message = "";
      try {
        await db.query(retour);
      } catch (e) {
        message = (e as Error).message;
      }
      await db.query("rollback to savepoint essai");
      expect(message).toMatch(/Retour arrière refusé/);
    });

    it("le retour rétablit les définitions d'avant, se rejoue sans effet ; aller, retour, aller redonne l'état migré", async () => {
      const migre = await empreinte();
      const definitionsMigrees = await Promise.all(blocs.map((b) => definition(b.signature)));
      await db.query(sansEnveloppe(retour));
      const apres = await empreinte();
      for (const [n, b] of blocs.entries()) {
        expect(apres[n], b.signature).not.toBe(migre[n]);
        expect(await definition(b.signature)).toBe(definitionsMigrees[n].replace(b.nouveau, b.ancre));
        expect(await definition(b.signature)).not.toContain(b.marque);
      }
      await db.query(sansEnveloppe(retour));
      expect(await empreinte()).toEqual(apres);
      await db.query(migration);
      expect(await empreinte()).toEqual(migre);
    });
  });
}

correctifParMarque("20261014844000_invitation_artisan_budget_distinct");
correctifParMarque("20261014845000_invitation_artisan_soi_meme");
correctifParMarque("20261014846000_invitation_artisan_annulation_suspendue");

/**
 * Seconde relecture du 15/10 : 20261014847000 fait tomber l'échéance d'une nouvelle invitation à la fin d'un jour de
 * Paris (défaut de `invitations_artisans.expire_le`). Rejouée, elle ne change rien ; son retour rétablit le défaut de
 * 20261014840000 (`now() + 30 days`), sans toucher aux lignes, se rejoue sans effet et refuse de se jouer dans un lot.
 */
const MIGRATION_ECHEANCE = readFileSync("supabase/migrations/20261014847000_invitation_artisan_echeance_jour_paris.sql", "utf8");
const RETOUR_ECHEANCE = readFileSync("supabase/retours-arriere/20261014847000_invitation_artisan_echeance_jour_paris.retour.sql", "utf8");

describe.skipIf(!DB_URL)("échéance au jour de Paris — rejeu de 20261014847000 et retour arrière", () => {
  let db: Client;
  const defaut = async () =>
    (await db.query(
      "select column_default d, col_description('public.invitations_artisans'::regclass, ordinal_position::int) c from information_schema.columns where table_schema='public' and table_name='invitations_artisans' and column_name='expire_le'"
    )).rows[0] as { d: string; c: string | null };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("savepoint cas");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });

  it("la base visée est migrée : le défaut est la fin du 30e jour de Paris", async () => {
    expect((await defaut()).d).toContain("Europe/Paris");
  });

  it("rejouée deux fois, la migration ne change rien", async () => {
    const avant = await defaut();
    await db.query(MIGRATION_ECHEANCE);
    await db.query(MIGRATION_ECHEANCE);
    expect(await defaut()).toEqual(avant);
  });

  it("le retour refuse de se jouer dans un lot", async () => {
    await db.query("savepoint essai");
    let message = "";
    try {
      await db.query(RETOUR_ECHEANCE);
    } catch (e) {
      message = (e as Error).message;
    }
    await db.query("rollback to savepoint essai");
    expect(message).toMatch(/Retour arrière refusé/);
  });

  it("le retour rétablit le défaut de 840000 sans toucher aux lignes, se rejoue sans effet ; aller, retour, aller", async () => {
    const migre = await defaut();
    const lignes = async () => (await db.query("select md5(coalesce(string_agg(id::text || expire_le::text, ',' order by id), '')) m from public.invitations_artisans")).rows[0].m;
    const avant = await lignes();
    await db.query(sansEnveloppe(RETOUR_ECHEANCE));
    const apres = await defaut();
    expect(apres).toEqual({ d: "(now() + '30 days'::interval)", c: null });
    expect(await lignes()).toBe(avant);
    await db.query(sansEnveloppe(RETOUR_ECHEANCE));
    expect(await defaut()).toEqual(apres);
    await db.query(MIGRATION_ECHEANCE);
    expect(await defaut()).toEqual(migre);
  });
});
