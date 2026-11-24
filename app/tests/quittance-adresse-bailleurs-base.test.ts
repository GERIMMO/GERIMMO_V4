/**
 * LA QUITTANCE DÉLIVRÉE D'UN PROPRIÉTAIRE QUI GÈRE LUI-MÊME IMPRIME L'ADRESSE DES BAILLEURS, COMME LE PDF — phase 3 de la
 * mission palier 1, lot 48 (U07), côté base : migration 20261123230000.
 *
 * Le défaut : `quittance_document` (que le LOCATAIRE appelle : page /quittance/[id], « Mes documents », lien des e-mails) ne
 * rendait pas l'adresse des bailleurs ; la page l'empruntait au profil de l'espace, quand le PDF de la même quittance imprime
 * celle des détenteurs.
 *
 * Reprise du lot 48 : la page gardait l'e-mail et le téléphone du profil de l'espace quand le PDF imprime ceux des détenteurs ;
 * la migration (amendée, la même) rend aussi `email` et `telephone`, et complète une fonction convertie par sa première version.
 *
 * Ces tests tiennent :
 *  1. chez un propriétaire direct, chaque bailleur porte `adresse`, `code_postal`, `ville`, `email`, `telephone` (sa fiche,
 *     ce que le PDF imprime en en-tête), rien d'autre de nouveau (ni naissance, ni identifiant) ; le locataire le lit ; dans
 *     un espace d'agence, le bailleur est rendu comme avant ;
 *  2. les contrôles d'accès ne changent pas (compte étranger : rien ; anon : refusé), les droits non plus ;
 *  3. la migration se rejoue sans effet ; elle refuse une définition inattendue sans rien modifier ;
 *  4. le retour rend la définition d'avant mot pour mot, retire sa ligne d'historique, se rejoue, refuse une fonction réécrite
 *     depuis ; la migration se rejoue ensuite ;
 *  5. une fonction laissée par la première version du lot (adresse seule) est complétée par la migration, et ramenée à
 *     avant par le retour.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le fichier rejoue du DDL : il tourne en série
 * (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const CODE = "20261123230000";
const NOM = `${CODE}_quittance_adresse_bailleurs`;
const FONCTION = "public.quittance_document(uuid)";
const MARQUE = "jsonb_build_object('adresse', p.address_line1";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const migration = () => lire(`supabase/migrations/${NOM}.sql`);
const retour = () => lire(`supabase/retours-arriere/${NOM}.retour.sql`);
const compter = (texte: string, motif: string) => texte.split(motif).length - 1;
/** Le fragment de la première version du lot (adresse seule), tel que la migration le reconnaît. */
const premiere = () => /c_premiere constant text := \$sql\$([\s\S]*?)\$sql\$;/.exec(migration())![1];
const pose = () => /c_pose constant text := \$sql\$([\s\S]*?)\$sql\$;/.exec(migration())![1];
const COORDONNEES = { email: "claire@example.invalid", telephone: "0611111111" };

describe("adresse des bailleurs de la quittance délivrée — manifeste, retour et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, après le plafond de la colocation, avec son retour listé", () => {
    const manifeste = lire("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261123170000_contrat_individuel_message_plafond.sql"));
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261119200200_quittance_representant_societe.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(lire("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lire("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lire("vitest.config.ts")).toContain('"tests/quittance-adresse-bailleurs-base.test.ts"');
  });

  it("la migration ne lit ni n'écrit aucune ligne, ne recopie aucune fonction et n'ouvre rien aux visiteurs", () => {
    const sql = migration().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\b(update|delete from|insert into)\s+public\./i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    // Reprise du lot 48 : l'en-tête du PDF imprime aussi l'e-mail et le téléphone des détenteurs ; ils sont rendus (fragment
    // posé seulement), et rien d'autre de la fiche : ni naissance, ni identifiant, ni compte.
    expect(sql).not.toMatch(/p\.(date_naissance|commune_naissance|siren|qualite|account_id)/);
    expect(compter(pose(), "'email', p.email, 'telephone', p.telephone")).toBe(1);
    expect(compter(sql, "p.email")).toBe(1);
    expect(compter(sql, "p.telephone")).toBe(1);
  });

  it("le retour ne supprime ni table, ni colonne, ni fonction ; il retire sa ligne d'historique", () => {
    const sql = retour().replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/drop table|drop column|drop function|truncate|delete from public\./i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
  });
});

describe.skipIf(!url)("adresse des bailleurs de la quittance délivrée (avec base)", () => {
  let db: Client;
  let org = "", lot = "", bailleur = "", locataire = "", etranger = "", quittance = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as Record<string, unknown>;
  const id = async (sql: string, p: unknown[] = []) => String((await un(sql, p)).id);
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const definition = async () => String((await un("select pg_get_functiondef($1::text::regprocedure) as d", [FONCTION])).d);
  const empreinte = async () => un(
    "select md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl, p.prosecdef as definer from pg_proc p where p.oid = $1::text::regprocedure",
    [FONCTION]
  );
  async function agir(compte: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [compte]);
    await db.query("set local role authenticated");
  }
  const compte = (prefixe: string) => id(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1 || '-' || gen_random_uuid() || '@example.invalid', 'x', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
     returning id`, [prefixe]);
  const document = async () => (await un("select public.quittance_document($1) d", [quittance])).d as { bailleurs: Record<string, unknown>[]; organisation: Record<string, unknown> } | null;

  /** Un dossier complet (bailleresse, locataire, bail actif, quittance) dans un espace du type donné. */
  async function dossier(type: "proprietaire_direct" | "agence") {
    org = await id(`insert into public.organizations (name, type, status, address_line1, postal_code, city, email_contact)
                    values ('Parc fictif',$1,'active','8 avenue des Tilleuls','69006','Lyon','parc@example.invalid') returning id`, [type]);
    const proprietaire = await compte("proprietaire");
    locataire = await compte("locataire");
    etranger = await compte("etranger");
    await db.query("insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct'),($3,$2,'locataire')", [proprietaire, org, locataire]);
    const bien = await id(`insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
                           values ($1,'Résidence fictive','immeuble','18 rue des Acacias','69003','Lyon') returning id`, [org]);
    lot = await id("insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Appartement 2','loue') returning id", [bien, org]);
    bailleur = await id(`insert into public.persons (organization_id, account_id, nom, prenom, email, telephone, address_line1, postal_code, city)
                         values ($1,$2,'Moreau','Claire','claire@example.invalid','0611111111','3 rue du Domicile','69100','Villeurbanne') returning id`, [org, proprietaire]);
    const fiche = await id("insert into public.persons (organization_id, account_id, nom, prenom) values ($1,$2,'Fictif','Hugo') returning id", [org, locataire]);
    await db.query("insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut) values ($1,$2,$3,100,current_date - 400)", [lot, org, bailleur]);
    const bail = await id(`insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
                           values ($1,$2,$3,'actif', current_date - 200, 650, 50) returning id`, [org, lot, fiche]);
    const appel = await id(`insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
                            values ($1,$2,'2026-11-01',650,50,700,'2026-11-05') returning id`, [org, bail]);
    quittance = await id(`insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant, date_emission)
                          values ($1,$2,$3,true,700,'2026-11-05') returning id`, [org, bail, appel]);
  }
  beforeEach(async () => {
    await db.query("begin");
    await dossier("proprietaire_direct");
  });

  // Reprise du lot 48 : ce cas affirmait que ni l'e-mail ni le téléphone de la bailleresse n'étaient rendus ; la page les
  // empruntait alors au profil de l'espace, quand le PDF de la même quittance imprime les siens. Ils sont rendus, comme
  // l'adresse (même portée : propriétaire direct) ; le reste de sa fiche ne l'est toujours pas.
  it("propriétaire direct : le locataire lit les coordonnées de la bailleresse que le PDF imprime, et rien d'autre de sa fiche", async () => {
    await db.query("update public.persons set date_naissance = '1970-01-02', commune_naissance = 'Valence' where id = $1", [bailleur]);
    await agir(locataire);
    const d = (await document())!;
    expect(d.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire", adresse: "3 rue du Domicile", code_postal: "69100", ville: "Villeurbanne", ...COORDONNEES }]);
    expect(JSON.stringify(d)).not.toContain("1970-01-02");
    expect(JSON.stringify(d)).not.toContain("Valence");
    // L'en-tête de l'espace reste rendu tel quel (contact de gestion, à défaut d'e-mail des bailleurs).
    expect(d.organisation).toMatchObject({ adresse: "8 avenue des Tilleuls", ville: "Lyon", email: "parc@example.invalid" });
  });

  it("bailleresse sans coordonnées : les clés sont là, vides (la quittance délivrée les demande, comme le PDF)", async () => {
    await db.query("update public.persons set address_line1 = null, postal_code = null, city = null, email = null, telephone = null where id = $1", [bailleur]);
    await agir(locataire);
    expect((await document())!.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire", adresse: null, code_postal: null, ville: null, email: null, telephone: null }]);
  });

  it("espace d'agence : le bailleur est rendu comme avant, sans adresse", async () => {
    // Le type d'un espace ne change pas après coup (réservé au super admin) : un second dossier, dans une agence.
    await dossier("agence");
    await agir(locataire);
    expect((await document())!.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire" }]);
  });

  it("les contrôles d'accès ne changent pas : un compte étranger ne lit rien, anon n'appelle pas ; droits inchangés", async () => {
    await agir(etranger);
    expect(await document()).toBeNull();
    await db.query("reset role");
    await db.query("set local role anon");
    expect(await refus("select public.quittance_document($1)", [quittance])).toMatch(/permission denied/);
    await db.query("reset role");
    const droits = await un(
      "select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') connecte",
      [FONCTION]
    );
    expect(droits).toEqual({ anon: false, connecte: true });
    const def = await definition();
    expect(compter(def, MARQUE)).toBe(1);
    expect(def).toMatch(/SECURITY DEFINER/);
    // Le représentant d'une société (20261119200200) est toujours là, avant l'adresse.
    expect(def.indexOf("jsonb_build_object('representant'")).toBeGreaterThan(0);
    expect(def.indexOf("jsonb_build_object('representant'")).toBeLessThan(def.indexOf(MARQUE));
  });

  it("rejouée deux fois, la migration ne change rien ; une définition inattendue l'arrête sans rien modifier", async () => {
    const avant = await empreinte();
    await db.query(migration());
    expect(await empreinte()).toEqual(avant);
    await db.query(migration());
    expect(await empreinte()).toEqual(avant);

    // Une seconde adresse ajoutée ailleurs : forme inconnue, refusée.
    await db.query((await definition()).replace("'vue_gestionnaire',", `'autre', (select ${MARQUE}) from public.persons p limit 1),\n    'vue_gestionnaire',`));
    const modifiee = await empreinte();
    expect(modifiee).not.toEqual(avant);
    expect(await refus(migration())).toMatch(/quittance_document\(uuid\) contient \d+ fois la fin de liste attendue, \d+ fois celle de ce lot et 2 fois une adresse de bailleur : définition inattendue, rien n'est modifié/);
    expect(await empreinte()).toEqual(modifiee);
  });

  it("le retour rend la définition d'avant, retire sa ligne d'historique, se rejoue ; la migration se rejoue ensuite", async () => {
    const migre = await empreinte();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'quittance_adresse_bailleurs') on conflict do nothing", [CODE]);
    await db.query(retour());
    const def = await definition();
    expect(compter(def, MARQUE)).toBe(0);
    expect(compter(def, "jsonb_build_object('representant'")).toBe(1);
    expect(Number((await un("select count(*) n from supabase_migrations.schema_migrations where version = $1", [CODE])).n)).toBe(0);
    await agir(locataire);
    expect((await document())!.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire" }]);
    await db.query("reset role");
    const revenu = await empreinte();
    expect(revenu.acl).toEqual(migre.acl);
    await db.query(retour());
    expect(await empreinte()).toEqual(revenu);
    await db.query(migration());
    expect(await empreinte()).toEqual(migre);
  });

  it("une fonction de la première version du lot (adresse seule) est complétée ; le retour la ramène aussi à avant", async () => {
    const migre = await empreinte();
    const def = await definition();
    expect(compter(def, pose())).toBe(1);
    // La fonction telle que l'a laissée la première version (banc du 23/11) : adresse seule.
    await db.query(def.replace(pose(), premiere()));
    const ancienne = await empreinte();
    expect(ancienne.def).not.toEqual(migre.def);
    await agir(locataire);
    expect((await document())!.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire", adresse: "3 rue du Domicile", code_postal: "69100", ville: "Villeurbanne" }]);
    await db.query("reset role");
    await db.query(migration());
    expect(await empreinte()).toEqual(migre);
    await agir(locataire);
    expect((await document())!.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire", adresse: "3 rue du Domicile", code_postal: "69100", ville: "Villeurbanne", ...COORDONNEES }]);
    await db.query("reset role");
    // Le retour, depuis la première version, rend la liste d'avant.
    await db.query(def.replace(pose(), premiere()));
    await db.query(retour());
    expect(compter(await definition(), MARQUE)).toBe(0);
    await agir(locataire);
    expect((await document())!.bailleurs).toEqual([{ nom: "Moreau", prenom: "Claire" }]);
  });

  it("le retour n'écrase pas une fonction réécrite depuis : il s'arrête et ne modifie rien", async () => {
    await db.query((await definition()).replace("'vue_gestionnaire',", `'autre', (select ${MARQUE}) from public.persons p limit 1),\n    'vue_gestionnaire',`));
    const avant = await empreinte();
    expect(await refus(retour())).toMatch(/quittance_document\(uuid\) contient 1 fois le fragment de la migration, 2 fois une adresse de bailleur et 0 fois la fin de liste d'avant : définition réécrite depuis, rien n'est modifié/);
    expect(await empreinte()).toEqual(avant);
  });
});
