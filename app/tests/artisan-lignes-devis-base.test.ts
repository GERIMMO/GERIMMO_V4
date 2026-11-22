/**
 * ARTISAN : SES LIGNES DE DEVIS RÉUTILISABLES — audit palier 1 du 22/11/2026, P2-04 (troisième partie).
 *
 * Ces tests tiennent, sous les vrais rôles et par les vraies fonctions :
 *  1. l'artisan garde une ligne (libellé, prix et TVA facultatifs), la relit, la retire ; le même libellé, à la casse
 *     près, met la ligne à jour au lieu de la doubler ; 200 lignes au plus ;
 *  2. un libellé vide, un prix négatif ou démesuré, un taux de TVA hors liste sont refusés en français ;
 *  3. chacun ne voit et ne retire que les siennes : ni un autre artisan, ni un gestionnaire, ni un locataire, ni un
 *     visiteur ;
 *  4. la table est fermée ; la migration se rejoue ; son retour garde la table et les lignes.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122235900_artisan_lignes_devis";
const CODE = "20261122235900";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const FONCTIONS = ["public.mes_lignes_devis()", "public.garder_ma_ligne_devis(text,bigint,integer)", "public.retirer_ma_ligne_devis(uuid)"];

describe("lignes de devis gardées — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/artisan-lignes-devis-base.test.ts"');
  });

  it("elle ne touche à aucun devis, ne cite ni le jour ni aucune fonction d'un autre lot métier, et n'ouvre rien au public", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/incident_devis|artisan_devis_preparations|artisan_devis_externes/);
    expect(sql).not.toMatch(/aujourdhui_paris|current_date|poser_gardes_abonnement|poser_gardes_diagnostic_artisan/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // Même plafond de prix unitaire que le devis lui-même (10 000 000 €).
    expect(sql).toContain("between 0 and 1000000000");
    expect(readFileSync("src/lib/devis-structure.ts", "utf8")).toContain("const PRIX_UNITAIRE_MAX_CENTS = 1_000_000_000;");
  });

  it("le retour ne supprime ni table ni ligne", () => {
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop table|truncate|delete from public\./i);
    for (const f of FONCTIONS) expect(retour.replace(/\s+/g, ""), f).toContain(`dropfunctionifexists${f}`);
  });
});

describe.skipIf(!url)("lignes de devis gardées (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", cptLoc = "", cptArtisan = "", cptAutre = "", artisan = "", autre = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  async function compte(prefixe: string) {
    const c = await id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
        $1||gen_random_uuid()||'@test.local','x',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','') returning id`, [prefixe]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$1)", [c]);
    return c;
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2", session_id: compteId } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const garder = async (libelle: string | null, prix: number | null = null, tva: number | null = null, par = cptArtisan) => {
    await agir(par);
    await db.query("savepoint garde");
    try {
      const r = String((await db.query("select public.garder_ma_ligne_devis($1,$2,$3) id", [libelle, prix, tva])).rows[0].id);
      await db.query("release savepoint garde");
      return { id: r, erreur: "" };
    } catch (e) { await db.query("rollback to savepoint garde"); return { id: "", erreur: (e as Error).message }; }
  };
  const mesLignes = async (par = cptArtisan) => {
    await agir(par);
    return (await db.query("select id, libelle, prix_unitaire_ht_cents::int prix, tva_bps tva from public.mes_lignes_devis()")).rows;
  };

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,status) values('Agence fictive des lignes','active') returning id");
    gerant = await compte("gerant"); cptLoc = await compte("locataire"); cptArtisan = await compte("artisan"); cptAutre = await compte("autre-artisan");
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$2,'locataire')", [gerant, org, cptLoc]);
    artisan = await id(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Plomberie fictive',lpad((floor(random()*99999999999999))::text,14,'0'),'0611111111','valide','verifie') returning id`, [cptArtisan]);
    autre = await id(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Autre artisan fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0622222222','valide','verifie') returning id`, [cptAutre]);
    await base();
  });

  it("garder, relire dans l'ordre des libellés, retirer ; prix et TVA sont facultatifs", async () => {
    expect(await mesLignes()).toEqual([]);
    const joint = await garder("  Remplacement du joint  ", 4500, 1000);
    const deplacement = await garder("Déplacement");
    const mitigeur = await garder("mitigeur thermostatique", 18990, 2000);
    expect([joint.erreur, deplacement.erreur, mitigeur.erreur]).toEqual(["", "", ""]);
    expect(await mesLignes()).toEqual([
      { id: deplacement.id, libelle: "Déplacement", prix: null, tva: null },
      { id: mitigeur.id, libelle: "mitigeur thermostatique", prix: 18990, tva: 2000 },
      { id: joint.id, libelle: "Remplacement du joint", prix: 4500, tva: 1000 },
    ]);
    await agir(cptArtisan);
    expect(await refus("select public.retirer_ma_ligne_devis($1)", [deplacement.id])).toBe("");
    expect((await mesLignes()).map((l) => l.libelle)).toEqual(["mitigeur thermostatique", "Remplacement du joint"]);
    await agir(cptArtisan);
    expect(await refus("select public.retirer_ma_ligne_devis($1)", [deplacement.id])).toBe("Ligne introuvable");
  });

  it("le même libellé, à la casse près, met la ligne à jour : jamais deux fois la même", async () => {
    const premiere = await garder("Remplacement du joint", 4500, 1000);
    const seconde = await garder("REMPLACEMENT DU JOINT", 5200, 550);
    expect(seconde).toEqual({ id: premiere.id, erreur: "" });
    expect(await mesLignes()).toEqual([{ id: premiere.id, libelle: "REMPLACEMENT DU JOINT", prix: 5200, tva: 550 }]);
    // Garder de nouveau sans prix ni TVA les efface : la ligne gardée est ce que l'artisan a sous les yeux.
    expect((await garder("Remplacement du joint")).id).toBe(premiere.id);
    expect(await mesLignes()).toEqual([{ id: premiere.id, libelle: "Remplacement du joint", prix: null, tva: null }]);
  });

  it("libellé vide ou trop long, prix négatif ou démesuré, TVA hors liste : refusés en français, rien n'est écrit", async () => {
    expect((await garder(null)).erreur).toBe("Écrivez la prestation ou la fourniture avant de la garder");
    expect((await garder(" \n\t ")).erreur).toBe("Écrivez la prestation ou la fourniture avant de la garder");
    expect((await garder("x".repeat(241))).erreur).toBe("Raccourcissez le libellé (240 caractères au plus)");
    expect((await garder("Ligne", -1)).erreur).toBe("Le prix unitaire de cette ligne n'est pas valide (10 000 000 € au plus)");
    expect((await garder("Ligne", 1000000001)).erreur).toBe("Le prix unitaire de cette ligne n'est pas valide (10 000 000 € au plus)");
    expect((await garder("Ligne", 100, 1960)).erreur).toBe("Le taux de TVA de cette ligne n'est pas valide");
    expect(await mesLignes()).toEqual([]);
    // Les bornes exactes passent : 240 caractères, 10 000 000 €, 0 %.
    expect((await garder("y".repeat(240), 1000000000, 0)).erreur).toBe("");
    expect(await mesLignes()).toHaveLength(1);
  });

  it("200 lignes au plus ; à la limite, mettre à jour une ligne existante reste possible", async () => {
    await base();
    await db.query("insert into public.artisan_lignes_devis(artisan_id,libelle) select $1, 'Ligne ' || n from generate_series(1,200) n", [artisan]);
    expect((await garder("Une de plus")).erreur).toBe("Vous gardez déjà 200 lignes : retirez-en une avant d'en garder une autre");
    expect((await garder("ligne 7", 990, 1000)).erreur).toBe("");
    expect(await mesLignes()).toHaveLength(200);
    // Le plafond est par artisan : l'autre garde les siennes.
    expect((await garder("Une de plus", null, null, cptAutre)).erreur).toBe("");
  });

  it("chacun ses lignes : un autre artisan ne les lit pas et ne les retire pas ; le même libellé reste libre pour lui", async () => {
    const mienne = await garder("Déplacement", 3500, 2000);
    const sienne = await garder("Déplacement", 5000, 1000, cptAutre);
    expect(sienne.erreur).toBe("");
    expect(sienne.id).not.toBe(mienne.id);
    expect(await mesLignes(cptAutre)).toEqual([{ id: sienne.id, libelle: "Déplacement", prix: 5000, tva: 1000 }]);
    await agir(cptAutre);
    expect(await refus("select public.retirer_ma_ligne_devis($1)", [mienne.id])).toBe("Ligne introuvable");
    expect(await mesLignes()).toEqual([{ id: mienne.id, libelle: "Déplacement", prix: 3500, tva: 2000 }]);
    await base();
    expect((await db.query("select artisan_id from public.artisan_lignes_devis order by created_at, id")).rows.map((r) => r.artisan_id).sort()).toEqual([artisan, autre].sort());
  });

  it("ni gestionnaire, ni locataire, ni visiteur : aucun ne garde, ne lit ni ne retire", async () => {
    const mienne = await garder("Déplacement");
    for (const c of [gerant, cptLoc]) {
      expect((await garder("Ligne d'un autre", null, null, c)).erreur).toMatch(/compte réel de l'artisan/);
      expect(await mesLignes(c)).toEqual([]);
      await agir(c);
      expect(await refus("select public.retirer_ma_ligne_devis($1)", [mienne.id])).toMatch(/compte réel de l'artisan/);
    }
    await agir(null, "anon");
    for (const sql of ["select * from public.mes_lignes_devis()", "select public.garder_ma_ligne_devis('x',null,null)", `select public.retirer_ma_ligne_devis('${mienne.id}')`]) {
      expect(await refus(sql)).toMatch(/permission denied/);
    }
    expect(await mesLignes()).toHaveLength(1);
  });

  it("la table est fermée : ni lecture ni écriture directe", async () => {
    await garder("Déplacement");
    for (const c of [cptArtisan, gerant]) {
      await agir(c);
      expect(await refus("select * from public.artisan_lignes_devis")).toMatch(/permission denied/);
      expect(await refus("insert into public.artisan_lignes_devis(artisan_id,libelle) values($1,'Directe')", [artisan])).toMatch(/permission denied/);
      expect(await refus("delete from public.artisan_lignes_devis")).toMatch(/permission denied/);
    }
    await base();
    expect((await db.query(`select
      (select relrowsecurity from pg_class where oid='public.artisan_lignes_devis'::regclass) rls,
      has_table_privilege('authenticated','public.artisan_lignes_devis','select') lecture,
      has_table_privilege('anon','public.artisan_lignes_devis','select') anonyme`)).rows[0]).toEqual({ rls: true, lecture: false, anonyme: false });
    for (const f of FONCTIONS) {
      expect((await db.query("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') u", [f])).rows[0], f).toEqual({ a: false, u: true });
    }
    // La base tient elle-même les bornes : un libellé entouré d'espaces ou un taux hors liste n'entre pas.
    expect(await refus("insert into public.artisan_lignes_devis(artisan_id,libelle) values($1,' Espaces ')", [artisan])).toMatch(/artisan_lignes_devis_libelle/);
    expect(await refus("insert into public.artisan_lignes_devis(artisan_id,libelle,tva_bps) values($1,'Taux',1960)", [artisan])).toMatch(/artisan_lignes_devis_tva/);
  });

  it("la migration se rejoue ; le retour supprime les fonctions et garde la table et les lignes", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const existent = async () => {
      await base();
      return Number((await db.query("select count(*)::int n from unnest($1::text[]) f where to_regprocedure(f) is not null", [FONCTIONS])).rows[0].n);
    };
    const gardee = await garder("Remplacement du joint", 4500, 1000);
    await base();
    await db.query(migration);
    await db.query(migration);
    expect(await existent()).toBe(3);
    expect(await mesLignes()).toEqual([{ id: gardee.id, libelle: "Remplacement du joint", prix: 4500, tva: 1000 }]);

    await base();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'artisan_lignes_devis') on conflict do nothing", [CODE]);
    await db.query(retour);
    expect(await existent()).toBe(0);
    expect(Number((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version=$1", [CODE])).rows[0].n)).toBe(0);
    expect((await db.query("select libelle, prix_unitaire_ht_cents::int prix from public.artisan_lignes_devis where artisan_id=$1", [artisan])).rows).toEqual([{ libelle: "Remplacement du joint", prix: 4500 }]);
    await db.query(retour);
    expect(await existent()).toBe(0);

    await db.query(migration);
    expect(await existent()).toBe(3);
    expect(await mesLignes()).toEqual([{ id: gardee.id, libelle: "Remplacement du joint", prix: 4500, tva: 1000 }]);
  });
});
