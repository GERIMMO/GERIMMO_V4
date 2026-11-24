/**
 * LE MOTIF DU RETRAIT D'UNE NOTE N'EST LU QUE PAR L'AUTEUR DE CETTE NOTE — décision du dirigeant du 24/11/2026 (Q20),
 * reprise du lot D1 (M5), migration 20261124120000.
 *
 * Ces tests tiennent, sous les vrais rôles de la base (jamais sous le rôle d'administration) :
 *  a. l'organisation ne lit plus le motif du retrait de la note de son LOCATAIRE, même par l'API (lecture directe de
 *     la colonne refusée) ;
 *  b. le locataire auteur lit le motif du retrait de SA note ;
 *  c. l'organisation lit le motif du retrait de SA propre note ;
 *  d. l'artisan, un autre locataire, une autre organisation et un visiteur ne lisent rien ;
 *  e. la supervision garde sa lecture tracée (`evaluations_contestation`) et n'a aucun chemin non tracé ;
 *  f. aucune règle de lecture n'est élargie ; la migration se rejoue ; son retour rend l'état d'avant.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261124120000_motif_retrait_reserve_a_l_auteur";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const MOTIF_ORG = "Note de l'agence déposée sur le mauvais dossier fictif.";
const MOTIF_LOC = "Note du locataire fictif : l'artisan n'est pas intervenu ce jour-là.";
const lireFichier = (chemin: string) => readFileSync(chemin, "utf8");

describe("motif du retrait réservé à l'auteur — manifeste et écriture de la migration (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé et son test en série", () => {
    const manifeste = lireFichier("e2e/local/ordre-migrations.txt").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(lireFichier("supabase/retours-arriere/LISEZ-MOI.md")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(lireFichier("tests/relais-migrations-manifeste.test.ts")).toContain(`"${NOM}.sql",`);
    expect(lireFichier("vitest.config.ts")).toContain('"tests/motif-retrait-auteur-base.test.ts"');
  });

  it("la migration ne touche à aucune politique, n'ouvre rien au visiteur et ne supprime rien", () => {
    const sql = lireFichier(`supabase/migrations/${NOM}.sql`).replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\bpolicy\b/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/\b(delete|truncate|drop table|drop column|update)\b/i);
    // Le droit rendu colonne par colonne ne cite pas le motif.
    expect(sql.match(/grant select \(([^)]*)\)/i)?.[1]).not.toContain("retrait_motif");
  });

  it("l'application ne lit jamais la colonne du motif : elle passe par la fonction réservée à l'auteur", () => {
    const volet = lireFichier("src/app/agence/[orgId]/incidents/volet-artisan.tsx");
    expect(volet).toContain('.select("id, intervention_id, source, note_globale, retiree_le")');
    // Aucune lecture de table ne demande la colonne dans ce fichier, le seul de l'application qui lit `artisan_evaluations`.
    expect(volet).not.toMatch(/\.select\([^)]*retrait_motif/);
    const lecteurs = execSync("grep -rlw artisan_evaluations src --include=*.ts --include=*.tsx", { encoding: "utf8" }).trim().split("\n").sort();
    expect(lecteurs).toEqual(["src/app/agence/[orgId]/incidents/volet-artisan.tsx", "src/lib/evaluation-retiree.ts"]);
    expect(lireFichier("src/lib/evaluation-retiree.ts")).toContain('db.rpc("retraits_de_mes_notes", { p_org: orgId })');
  });
});

describe.skipIf(!url)("motif du retrait réservé à l'auteur (avec base)", () => {
  let db: Client;
  let org = "", autreOrg = "";
  let gerant = "", agent = "", sa = "", compteArtisan = "", locataire = "", autreLocataire = "", autreGerant = "";
  let artisan = "", missionLocataire = "", missionOrg = "", missionIntacte = "";
  let evalLocataire = "", evalOrg = "", contestation = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const compte = (prefixe: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
  /** Agir sous le vrai rôle d'un compte connecté (ou d'un visiteur) : droits et règles de lecture s'appliquent. */
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2", session_id: compteId } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  /** Le message du refus, ou "" si la requête passe. */
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  /** Ce que la fonction rend à la personne connectée, pour une organisation. */
  const mesRetraits = async (o = org) =>
    (await db.query("select intervention_id, source::text, note_globale, retrait_motif from public.retraits_de_mes_notes($1) order by source", [o])).rows;
  const REFUS_COLONNE = /permission denied for table artisan_evaluations/;

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Agence fictive du motif','active','agence') returning id");
    autreOrg = await id("insert into public.organizations(name,status,type) values('Autre agence fictive','active','agence') returning id");
    gerant = await compte("gerant"); agent = await compte("agent"); sa = await compte("sa"); compteArtisan = await compte("artisan");
    locataire = await compte("locataire"); autreLocataire = await compte("autrelocataire"); autreGerant = await compte("autregerant");
    await db.query("insert into auth.sessions(id,user_id) select x,x from unnest($1::uuid[]) x", [[gerant, agent, sa, compteArtisan, locataire, autreLocataire, autreGerant]]);
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'admin_agence'),($3,$2,'agent'),($4,null,'super_admin'),($5,$2,'locataire'),($6,$2,'locataire'),($7,$8,'admin_agence')`,
      [gerant, org, agent, sa, locataire, autreLocataire, autreGerant, autreOrg]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','appartement','1 rue Test','75001','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    // Une seule mission vivante par incident : chaque note a donc son dossier.
    const dossier = (suffixe: string) => id(`insert into public.incidents(organization_id,numero,lot_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,$2,$3,'agence','plomberie_canalisation','TEST fuite fictive','qualifie','proprietaire','TEST fictif') returning id`, [org, `TEST-MOTIF-${Date.now()}-${suffixe}`, lot]);
    artisan = await id(`insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id)
      values('Artisan fictif noté',lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000','valide','verifie','publique',$1) returning id`, [compteArtisan]);
    const mission = async (suffixe: string) => id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id", [org, await dossier(suffixe), artisan]);
    [missionLocataire, missionOrg, missionIntacte] = [await mission("A"), await mission("B"), await mission("C")];
    // La note du locataire porte le compte qui l'a déposée, comme le fait `noter_artisan_locataire`.
    evalLocataire = await id(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,commentaire,evaluateur_account_id)
      values($1,$2,$3,'locataire',1,'Commentaire fictif du locataire',$4) returning id`, [org, missionLocataire, artisan, locataire]);
    evalOrg = await id(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,note_qualite,note_delai,note_prix,evaluateur_account_id)
      values($1,$2,$3,'gerant',2,2,2,2,$4) returning id`, [org, missionOrg, artisan, gerant]);
    // Une troisième note, jamais retirée : elle ne doit apparaître nulle part.
    await db.query(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,note_qualite,note_delai,note_prix,evaluateur_account_id)
      values($1,$2,$3,'gerant',5,5,5,5,$4)`, [org, missionIntacte, artisan, gerant]);
    // Le retrait passe par le vrai chemin : la contestation de l'artisan, puis le geste de la supervision.
    await agir(compteArtisan);
    contestation = await id("select public.soumettre_retour(gen_random_uuid(),'contestation','Demande fictive','Je conteste ces notes fictives, déposées par erreur.',null,'/artisan/note',null,'navigation') id");
    await agir(sa);
    await db.query("select public.retirer_evaluation_contestee($1,$2,$3)", [contestation, evalLocataire, MOTIF_LOC]);
    await db.query("select public.retirer_evaluation_contestee($1,$2,$3)", [contestation, evalOrg, MOTIF_ORG]);
    await base();
  });

  it("(a) l'organisation ne lit plus le motif de la note de son locataire, même par une lecture directe de la colonne", async () => {
    await agir(gerant);
    // La lecture directe de la colonne est refusée par la base, pour toute ligne (c'est ce que ferait un appel à l'API).
    expect(await refus("select retrait_motif from public.artisan_evaluations where id=$1", [evalLocataire])).toMatch(REFUS_COLONNE);
    expect(await refus("select retrait_motif from public.artisan_evaluations where id=$1", [evalOrg])).toMatch(REFUS_COLONNE);
    expect(await refus("select * from public.artisan_evaluations where organization_id=$1", [org])).toMatch(REFUS_COLONNE);
    expect(await refus("select id from public.artisan_evaluations where retrait_motif ilike '%locataire%'")).toMatch(REFUS_COLONNE);
    // Le reste de la table se lit comme avant : l'écran sait toujours qu'une note existe et qu'elle est retirée.
    const lignes = (await db.query("select id, source::text, note_globale, retiree_le is not null retiree from public.artisan_evaluations where organization_id=$1 order by note_globale", [org])).rows;
    expect(lignes).toEqual([
      { id: evalLocataire, source: "locataire", note_globale: 1, retiree: true },
      { id: evalOrg, source: "gerant", note_globale: 2, retiree: true },
      expect.objectContaining({ source: "gerant", note_globale: 5, retiree: false }),
    ]);
    // Par la fonction : jamais la note du locataire.
    const rendus = await mesRetraits();
    expect(rendus.filter((r) => r.source === "locataire")).toEqual([]);
    expect(JSON.stringify(rendus)).not.toContain("locataire fictif");
  });

  it("(c) l'organisation lit le motif du retrait de SA propre note, et de celle-là seulement", async () => {
    await agir(gerant);
    expect(await mesRetraits()).toEqual([{ intervention_id: missionOrg, source: "gerant", note_globale: 2, retrait_motif: MOTIF_ORG }]);
  });

  it("(b) le locataire auteur lit le motif du retrait de SA note, et rien de la note de l'organisation", async () => {
    await agir(locataire);
    expect(await mesRetraits()).toEqual([{ intervention_id: missionLocataire, source: "locataire", note_globale: 1, retrait_motif: MOTIF_LOC }]);
    // La table lui reste fermée (aucune politique ne la lui ouvre), colonne du motif comprise.
    expect((await db.query("select count(*)::int n from public.artisan_evaluations")).rows[0].n).toBe(0);
    expect(await refus("select retrait_motif from public.artisan_evaluations")).toMatch(REFUS_COLONNE);
  });

  it("(d) l'artisan, un autre locataire, une autre organisation et un visiteur ne lisent rien", async () => {
    for (const [qui, compteId] of [["artisan", compteArtisan], ["autre locataire", autreLocataire], ["autre organisation", autreGerant]] as const) {
      await agir(compteId);
      // Ni par la fonction (pour l'organisation de la note, comme pour la leur)…
      expect(await mesRetraits(org), qui).toEqual([]);
      expect(await mesRetraits(autreOrg), qui).toEqual([]);
      // … ni par une lecture directe.
      expect(await refus("select retrait_motif from public.artisan_evaluations"), qui).toMatch(REFUS_COLONNE);
      expect((await db.query("select count(*)::int n from public.artisan_evaluations where organization_id=$1", [org])).rows[0].n, qui).toBe(0);
    }
    // Ce que l'artisan lit dans le suivi de sa contestation ne reprend aucun motif.
    await agir(compteArtisan);
    const suivi = (await db.query("select message from public.retours_historique where retour_id=$1", [contestation])).rows;
    expect(JSON.stringify(suivi)).not.toMatch(/mauvais dossier|pas intervenu/);

    await agir(null, "anon");
    expect(await refus("select * from public.retraits_de_mes_notes($1)", [org])).toMatch(/permission denied for function retraits_de_mes_notes/);
    expect(await refus("select retrait_motif from public.artisan_evaluations")).toMatch(REFUS_COLONNE);
  });

  it("(e) la supervision garde sa lecture tracée, et n'a aucun chemin non tracé vers le motif", async () => {
    await agir(sa);
    const lus = (await db.query("select evaluation_id, retrait_motif from public.evaluations_contestation($1)", [contestation])).rows;
    expect(lus.find((l) => l.evaluation_id === evalLocataire)).toMatchObject({ retrait_motif: MOTIF_LOC });
    expect(lus.find((l) => l.evaluation_id === evalOrg)).toMatchObject({ retrait_motif: MOTIF_ORG });
    // La fonction du client exige une adhésion réelle : la traversée de la supervision n'y lit rien.
    expect(await mesRetraits()).toEqual([]);
    expect(await refus("select retrait_motif from public.artisan_evaluations where id=$1", [evalOrg])).toMatch(REFUS_COLONNE);
    // Sa lecture a laissé sa ligne au journal.
    await base();
    const journal = (await db.query("select details from public.audit_log where account_id=$1 and action='consultation_evaluations_contestation'", [sa])).rows;
    expect(journal).toEqual([{ details: { retour_id: contestation, artisan_id: artisan } }]);
  });

  it("(f) la fonction ne montre jamais plus que la règle de lecture de la table : l'agent n'y lit que ce qu'il voit déjà", async () => {
    await agir(agent);
    const visibles = (await db.query("select intervention_id from public.artisan_evaluations where organization_id=$1 and source='gerant' and retiree_le is not null", [org])).rows.map((r) => r.intervention_id);
    expect((await mesRetraits()).map((r) => r.intervention_id)).toEqual(visibles);
    expect((await mesRetraits()).every((r) => r.source === "gerant")).toBe(true);
  });

  it("(f) droits, politiques inchangées, rejeu, puis retour à l'état d'avant et nouvelle application", async () => {
    const migration = lireFichier(`supabase/migrations/${NOM}.sql`);
    const retour = lireFichier(`supabase/retours-arriere/${NOM}.retour.sql`);
    const FONCTION = "public.retraits_de_mes_notes(uuid)";
    const droits = async () => (await db.query(`select
        has_column_privilege('authenticated','public.artisan_evaluations','retrait_motif','SELECT') motif_connecte,
        has_column_privilege('authenticated','public.artisan_evaluations','note_globale','SELECT') note_connecte,
        has_table_privilege('authenticated','public.artisan_evaluations','SELECT') table_connecte,
        has_any_column_privilege('anon','public.artisan_evaluations','SELECT') visiteur,
        has_table_privilege('authenticated','public.artisan_evaluations','INSERT') ecriture,
        to_regprocedure($1) is not null fonction,
        coalesce(has_function_privilege('authenticated',to_regprocedure($1),'execute'),false) fonction_connecte,
        coalesce(has_function_privilege('anon',to_regprocedure($1),'execute'),false) fonction_visiteur`, [FONCTION])).rows[0];
    const politiques = async () => (await db.query(`select polname, polcmd, polpermissive, polroles::regrole[]::text roles, pg_get_expr(polqual,polrelid) lecture
      from pg_policy where polrelid='public.artisan_evaluations'::regclass order by polname`)).rows;
    const APRES = { motif_connecte: false, note_connecte: true, table_connecte: false, visiteur: false, ecriture: false, fonction: true, fonction_connecte: true, fonction_visiteur: false };

    await base();
    expect(await droits()).toEqual(APRES);
    const reglesAvant = await politiques();
    expect(reglesAvant.map((p) => p.polname)).toEqual(["artisan_evaluations_agent_portefeuille", "artisan_evaluations_select"]);

    // Rejeu : sans effet.
    await db.query(migration);
    expect(await droits()).toEqual(APRES);
    expect(await politiques()).toEqual(reglesAvant);

    // Retour : l'état d'avant (la table entière lisible par les gestionnaires, plus de fonction) ; aucune note effacée.
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261124120000','motif_retrait_reserve_a_l_auteur') on conflict do nothing");
    await db.query(retour);
    expect(await droits()).toEqual({ ...APRES, motif_connecte: true, table_connecte: true, fonction: false, fonction_connecte: false });
    expect(await politiques()).toEqual(reglesAvant);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261124120000'")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int n from public.artisan_evaluations where organization_id=$1 and retrait_motif is not null", [org])).rows[0].n).toBe(2);
    await agir(gerant);
    expect((await db.query("select retrait_motif from public.artisan_evaluations where id=$1", [evalLocataire])).rows).toEqual([{ retrait_motif: MOTIF_LOC }]);
    await base();
    await db.query(retour); // rejouable

    // Nouvelle application : la lecture se referme.
    await db.query(migration);
    expect(await droits()).toEqual(APRES);
    await agir(gerant);
    expect(await refus("select retrait_motif from public.artisan_evaluations where id=$1", [evalLocataire])).toMatch(REFUS_COLONNE);
    expect(await mesRetraits()).toEqual([{ intervention_id: missionOrg, source: "gerant", note_globale: 2, retrait_motif: MOTIF_ORG }]);
  });
});
