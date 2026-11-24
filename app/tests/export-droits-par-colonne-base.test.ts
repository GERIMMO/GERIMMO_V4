/**
 * L'EXPORT COMPLET D'UN ESPACE RETROUVE LA TABLE DES NOTES D'ARTISANS — seconde reprise du lot D1 des décisions du
 * 24/11/2026 (constat C1), migration 20261124140000.
 *
 * Depuis 20261124120000, les comptes connectés lisent `artisan_evaluations` colonne par colonne (tout sauf
 * `retrait_motif`). `lignes_lisibles_par` exigeait le droit de lecture de la table entière : la table avait disparu de
 * l'archive. Ces tests tiennent :
 *  a. la table est de nouveau dans l'export du gérant, avec ses lignes, SANS la clé `retrait_motif` ;
 *  b. les autres tables à droits par colonne ne gagnent rien : la liste de ces tables est figée ici (une nouvelle
 *     table le fait échouer, pour qu'on la relise), et les deux files d'envoi restent hors de l'archive ;
 *  c. l'artisan ne reçoit toujours aucune note dans son propre export ;
 *  d. la fonction garde sa sécurité (fermée à tous les rôles, SECURITY DEFINER, search_path vide) ;
 *  e. la migration se rejoue ; son retour rend l'état d'avant (la table disparaît de nouveau de l'export).
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier test rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124140000_export_droits_par_colonne";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const FONCTION = "public.lignes_lisibles_par(regclass,text,uuid,uuid)";
const MOTIF_ORG = "MOTIF-FICTIF-AGENCE : note déposée sur le mauvais dossier.";
const MOTIF_LOC = "MOTIF-FICTIF-LOCATAIRE : l'artisan n'est pas intervenu ce jour-là.";
const lireFichier = (chemin: string) => readFileSync(chemin, "utf8");
/** Le SQL sans ses lignes de commentaire (la ligne entière est retirée). */
const sansCommentaires = (sql: string) => sql.replace(/^\s*--.*\n/gm, "");

describe("export et droits par colonne — manifeste et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé et son test en série", () => {
    const manifeste = lireFichier("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    // Seconde reprise du lot D2 (24/11) : la migration 20261124150000 la suit au manifeste ; elle n'est plus la dernière,
    // mais elle reste après celle qu'elle complète.
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261124120000_motif_retrait_reserve_a_l_auteur.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(lireFichier("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lireFichier("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lireFichier("vitest.config.ts")).toContain('"tests/export-droits-par-colonne-base.test.ts"');
  });

  it("une seule ligne de la fonction change ; aucune politique, aucun droit ouvert, rien de supprimé", () => {
    const origine = lireFichier("supabase/migrations/20261024130000_fermeture_comptes.sql");
    /** La définition de la fonction dans un fichier, de son `create` jusqu'au retrait de ses droits. */
    const corps = (sql: string) => {
      const debut = sql.indexOf("create or replace function public.lignes_lisibles_par");
      return sql.slice(debut, sql.indexOf("from public, anon, authenticated, service_role;", debut));
    };
    const AVANT = "if not pg_catalog.has_table_privilege('authenticated', p_table, 'SELECT') then return '[]'::jsonb; end if;";
    const APRES = "if not pg_catalog.has_any_column_privilege('authenticated', p_table, 'SELECT') then return '[]'::jsonb; end if;";
    const migration = lireFichier(`supabase/migrations/${NOM}.sql`);
    expect(corps(origine)).toContain(AVANT);
    // La définition de la migration = celle d'origine, à cette ligne près.
    expect(sansCommentaires(corps(migration))).toBe(sansCommentaires(corps(origine).replace(AVANT, APRES)));
    // Le retour rend la définition d'origine, mot pour mot.
    expect(corps(lireFichier(`supabase/retours-arriere/${NOM}.retour.sql`))).toBe(corps(origine));
    const sql = sansCommentaires(migration);
    expect(sql).toContain("revoke all on function public.lignes_lisibles_par(regclass, text, uuid, uuid) from public, anon, authenticated, service_role;");
    expect(sql).not.toMatch(/\bpolicy\b/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\b(delete|truncate|drop|update|alter)\b/i);
  });
});

describe.skipIf(!url)("export et droits par colonne (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", compteArtisan = "", locataire = "", artisan = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const compte = (prefixe: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  /** L'export de l'espace, tel que le traitement le demande (clé de service) pour ce titulaire. */
  async function exportEspace(): Promise<Record<string, Record<string, unknown>[]>> {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    await db.query("set local role service_role");
    const { rows } = await db.query("select public.export_complet_donnees($1,$2) d", [org, gerant]);
    await base();
    return rows[0].d;
  }
  /** L'export de l'artisan, sous sa propre session. */
  async function exportArtisan(): Promise<Record<string, unknown>> {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compteArtisan, role: "authenticated", aal: "aal2", session_id: compteArtisan })]);
    await db.query("set local role authenticated");
    const { rows } = await db.query("select public.export_artisan_plateforme() d");
    await base();
    return rows[0].d;
  }

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Agence fictive de l''export','active','agence') returning id");
    gerant = await compte("gerant"); compteArtisan = await compte("artisan"); locataire = await compte("locataire");
    await db.query("insert into auth.sessions(id,user_id) select x,x from unnest($1::uuid[]) x", [[gerant, compteArtisan, locataire]]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$2,'locataire')", [gerant, org, locataire]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','appartement','1 rue Test','75001','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    artisan = await id(`insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id)
      values('Artisan fictif noté',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000','valide','verifie','publique',$1) returning id`, [compteArtisan]);
    // Une seule mission vivante par incident : chaque note a donc son dossier.
    const mission = async (suffixe: string) => {
      const incident = await id(`insert into public.incidents(organization_id,numero,lot_id,canal,categorie,description,etat,imputation,imputation_justification)
        values($1,$2,$3,'agence','plomberie_canalisation','TEST fuite fictive','qualifie','proprietaire','TEST fictif') returning id`, [org, `TEST-EXPORT-${Date.now()}-${suffixe}`, lot]);
      return id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id", [org, incident, artisan]);
    };
    // Deux notes retirées (celle de l'agence, celle du locataire), chacune avec son motif ; une note intacte.
    await db.query(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,note_qualite,note_delai,note_prix,evaluateur_account_id,retiree_le,retrait_motif)
      values($1,$2,$3,'gerant',2,2,2,2,$4,now(),$5)`, [org, await mission("A"), artisan, gerant, MOTIF_ORG]);
    await db.query(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,commentaire,evaluateur_account_id,retiree_le,retrait_motif)
      values($1,$2,$3,'locataire',1,'Commentaire fictif du locataire',$4,now(),$5)`, [org, await mission("B"), artisan, locataire, MOTIF_LOC]);
    await db.query(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,note_qualite,note_delai,note_prix,evaluateur_account_id)
      values($1,$2,$3,'gerant',5,5,5,5,$4)`, [org, await mission("C"), artisan, gerant]);
    // Une ligne dans chacune des deux files d'envoi de cet espace : elles ne doivent jamais entrer dans l'archive.
    const courriel = "c".repeat(64);
    await db.query("insert into public.courriels_durables(id,organization_id,empreinte,etat,motif) values($1,$2,'empreinte-fictive','en_attente','MOTIF-FILE-FICTIF')", [courriel, org]);
    await db.query("insert into public.notification_intentions(organization_id,evenement,objet,role,revision,courriel_id,motif) values($1,'evenement_fictif',gen_random_uuid(),'agence','1',$2,'MOTIF-FILE-FICTIF')", [org, courriel]);
    await base();
  });

  it("(a) l'export du gérant contient la table des notes, ses trois lignes, sans la clé retrait_motif", async () => {
    const donnees = await exportEspace();
    expect(Object.keys(donnees)).toContain("artisan_evaluations");
    const notes = donnees.artisan_evaluations;
    expect(notes.map((n) => [n.source, n.note_globale, n.retiree_le !== null]).sort()).toEqual([["gerant", 2, true], ["gerant", 5, false], ["locataire", 1, true]]);
    // Les colonnes rendues : toutes celles que le gérant lit à l'écran, et pas le motif (ni le sien, ni celui du locataire).
    for (const note of notes) {
      expect(Object.keys(note).sort()).toEqual(["artisan_id", "commentaire", "created_at", "evaluateur_account_id", "id", "intervention_id",
        "note_delai", "note_globale", "note_prix", "note_qualite", "organization_id", "retiree_le", "retiree_par", "source"]);
    }
    expect(JSON.stringify(donnees)).not.toContain("retrait_motif");
    expect(JSON.stringify(donnees)).not.toContain("MOTIF-FICTIF");
    // Le reste de l'archive est toujours là.
    expect(Object.keys(donnees)).toEqual(expect.arrayContaining(["organizations", "biens", "lots", "incidents", "incident_interventions", "memberships"]));
  });

  it("(b) les tables à droits par colonne sont connues, et les files d'envoi restent hors de l'archive", async () => {
    // Les tables où le test de droit de `lignes_lisibles_par` change de réponse avec cette migration : droit de lecture
    // sur au moins une colonne, pas sur la table entière. Si cette liste change, relire la nouvelle table (ses colonnes
    // ouvertes, ses règles de lecture) AVANT de la laisser entrer dans une archive, puis mettre la liste à jour.
    const { rows } = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p')
        and not has_table_privilege('authenticated', c.oid, 'SELECT') and has_any_column_privilege('authenticated', c.oid, 'SELECT')
      order by 1`);
    expect(rows.map((r) => r.relname)).toEqual(["artisan_evaluations", "artisans", "courriels_durables", "notification_intentions", "supervision_identite"]);

    // Les deux files portent bien une ligne de cet espace, et l'archive ne les contient pas : leur seule règle de
    // lecture est réservée à la supervision sous double authentification, que l'export (jeton simple) ne passe pas.
    // (La seconde en porte d'autres : les notifications nées des dossiers créés plus haut.)
    const files = (await db.query("select (select count(*) from public.courriels_durables where organization_id=$1)::int courriels, (select count(*) from public.notification_intentions where organization_id=$1)::int intentions", [org])).rows[0];
    expect(files.courriels).toBe(1);
    expect(files.intentions).toBeGreaterThanOrEqual(1);
    const donnees = await exportEspace();
    expect(donnees).not.toHaveProperty("courriels_durables");
    expect(donnees).not.toHaveProperty("notification_intentions");
    expect(donnees).not.toHaveProperty("artisans");
    expect(donnees).not.toHaveProperty("supervision_identite");
    expect(JSON.stringify(donnees)).not.toContain("MOTIF-FILE-FICTIF");
  });

  it("(c) l'artisan ne reçoit aucune note ni aucun motif dans son propre export", async () => {
    const donnees = await exportArtisan();
    expect(donnees).toHaveProperty("fiche");
    expect(donnees).not.toHaveProperty("artisan_evaluations");
    expect(JSON.stringify(donnees)).not.toContain("MOTIF-FICTIF");
    expect(JSON.stringify(donnees)).not.toContain("Commentaire fictif du locataire");
  });

  it("(d, e) sécurité de la fonction inchangée ; rejeu ; le retour rend l'état d'avant ; nouvelle application", async () => {
    const migration = lireFichier(`supabase/migrations/${NOM}.sql`);
    const retour = lireFichier(`supabase/retours-arriere/${NOM}.retour.sql`);
    const securite = async () => (await db.query(`select p.prosecdef definer, p.proconfig::text reglages,
        has_function_privilege('anon', p.oid, 'execute') visiteur, has_function_privilege('authenticated', p.oid, 'execute') connecte,
        has_function_privilege('service_role', p.oid, 'execute') service,
        p.prosrc like '%has_any_column_privilege(''authenticated'', p_table, ''SELECT'')%' par_colonne
      from pg_proc p where p.oid = $1::regprocedure`, [FONCTION])).rows[0];
    const APRES = { definer: true, reglages: '{"search_path=\\"\\""}', visiteur: false, connecte: false, service: false, par_colonne: true };
    const aLaTable = async () => "artisan_evaluations" in (await exportEspace());

    expect(await securite()).toEqual(APRES);
    expect(await aLaTable()).toBe(true);

    // Rejeu : sans effet.
    await db.query(migration);
    expect(await securite()).toEqual(APRES);
    expect(await aLaTable()).toBe(true);

    // Retour : la définition d'avant (droit de la table entière exigé) : la table des notes disparaît de l'archive.
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124140000','export_droits_par_colonne') on conflict do nothing");
    await db.query(retour);
    expect(await securite()).toEqual({ ...APRES, par_colonne: false });
    expect(await aLaTable()).toBe(false);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124140000'")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.artisan_evaluations where organization_id=$1", [org])).rows[0].n).toBe(3);
    await db.query(retour); // rejouable

    // Nouvelle application : la table revient, toujours sans le motif.
    await db.query(migration);
    expect(await securite()).toEqual(APRES);
    const donnees = await exportEspace();
    expect(donnees.artisan_evaluations).toHaveLength(3);
    expect(JSON.stringify(donnees)).not.toContain("retrait_motif");
  });
});
