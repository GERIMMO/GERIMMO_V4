/**
 * LA SUPERVISION EXAMINE ET RETIRE UNE ÉVALUATION CONTESTÉE — audit palier 1 du 22/11/2026, P1-07.
 *
 * Le défaut, vérifié : l'artisan lit « une évaluation retirée est exclue du calcul », mais aucun écran ne retirait
 * rien, et l'ancienne fonction `retirer_evaluation` est refusée depuis que la supervision n'écrit plus dans les
 * tables d'une organisation (D08-C, 20261016172453). Aucun test ne l'exerçait.
 *
 * Ces tests tiennent, sous les vrais rôles (référentiel, module 11, §11.4) :
 *  1. le détail — commentaires compris — ne se lit que derrière une contestation, par le super admin seulement,
 *     et chaque lecture laisse une ligne au journal (RM-11.4.5, RM-11.4.6) ;
 *  2. le retrait est motivé, borné à l'artisan de la contestation, définitif ; la moyenne se recalcule ; l'artisan
 *     le lit dans son suivi (sans auteur ni dossier), l'organisation reçoit une alerte informative (sans le motif) ;
 *  3. le garde de traversée n'est pas affaibli : hors de ce geste, la supervision n'écrit toujours pas ;
 *  4. l'ancien chemin sans contestation n'est plus exécutable ; la migration se rejoue ; son retour rend l'état d'avant.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { gesteAlerte } from "../src/lib/chemin-alerte";
import { libelleActionAudit } from "../src/lib/libelles-journaux";

const NOM = "20261122150000_evaluation_contestee";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const MOTIF = "Note déposée sur le mauvais dossier : l'artisan n'est pas intervenu.";

describe("évaluation contestée — manifeste, retour et libellés (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/evaluation-contestee-base.test.ts"');
  });

  it("le journal sait nommer les deux gestes, et l'alerte mène au dossier sans se dire automatique", () => {
    expect(libelleActionAudit("consultation_evaluations_contestation")).toBe("Consultation des évaluations d’un artisan (contestation)");
    expect(libelleActionAudit("evaluation_retiree")).toBe("Retrait d’une évaluation d’artisan après contestation");
    expect(gesteAlerte({ type: "evaluation_retiree", details: { incident_id: "i-1" } }, "org-1"))
      .toEqual({ href: "/agence/org-1/incidents?sel=i-1", libelle: "Ouvrir le dossier de l’intervention", seFermeSeule: false });
    expect(gesteAlerte({ type: "evaluation_retiree", details: { incident_id: "i-1" } }, "org-1", "/espace")?.href).toBe("/espace/org-1/incidents?sel=i-1");
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).toContain("not between 10 and 1000");
  });
});

describe.skipIf(!url)("évaluation contestée (avec base)", () => {
  let db: Client;
  let org = "", gerant = "", sa = "", compteArtisan = "", compteAutreArtisan = "";
  let artisan = "", autreArtisan = "", incident = "", lot = "";
  let evalLocataire = "", evalGerant = "", evalAutre = "", contestation = "", question = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const compte = (prefixe: string) => id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
      $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`, [prefixe]);
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
  const lire = (retour = contestation) => db.query("select * from public.evaluations_contestation($1)", [retour]);
  const retirer = (evaluation: string, motif: string | null = MOTIF, retour = contestation) =>
    refus("select public.retirer_evaluation_contestee($1,$2,$3)", [retour, evaluation, motif]);
  const etat = async (evaluation: string) => {
    await base();
    return (await db.query("select retiree_le is not null retiree, retrait_motif, retiree_par from public.artisan_evaluations where id=$1", [evaluation])).rows[0];
  };
  const note = async (a = artisan) => { await base(); return (await db.query("select nb_evaluations, note_publiee::float8 note from public.artisan_note($1)", [a])).rows[0]; };
  const journal = async (action: string) => { await base(); return (await db.query("select organization_id, details from public.audit_log where account_id=$1 and action=$2", [sa, action])).rows; };
  const soumettre = (nature: string) => id("select public.soumettre_retour(gen_random_uuid(),$1,'Demande fictive','Je conteste cette note fictive, déposée par erreur.',null,'/artisan/note',null,'navigation') id", [nature]);

  beforeEach(async () => {
    await db.query("begin");
    org = await id("insert into public.organizations(name,status,type) values('Agence fictive des évaluations','active','agence') returning id");
    gerant = await compte("gerant"); sa = await compte("sa"); compteArtisan = await compte("artisan"); compteAutreArtisan = await compte("autre");
    await db.query("insert into auth.sessions(id,user_id) select x,x from unnest($1::uuid[]) x", [[gerant, sa, compteArtisan, compteAutreArtisan]]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,null,'super_admin')", [gerant, org, sa]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien fictif','appartement','1 rue Test','75001','Paris') returning id", [org]);
    lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot fictif','loue') returning id", [org, bien]);
    // Une seule mission vivante par incident : chaque évaluation a donc son dossier.
    const dossier = (suffixe: string) => id(`insert into public.incidents(organization_id,numero,lot_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,$2,$3,'agence','plomberie_canalisation','TEST fuite fictive','qualifie','proprietaire','TEST fictif') returning id`, [org, `TEST-EVAL-${Date.now()}-${suffixe}`, lot]);
    incident = await dossier("A");
    const [incidentB, incidentC] = [await dossier("B"), await dossier("C")];
    const creerArtisan = (nom: string, proprietaire: string) => id(`insert into public.artisans(raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id)
      values($1,lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000','valide','verifie','publique',$2) returning id`, [nom, proprietaire]);
    artisan = await creerArtisan("Artisan fictif contesté", compteArtisan);
    autreArtisan = await creerArtisan("Autre artisan fictif", compteAutreArtisan);
    const mission = (a: string, i: string) => id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id", [org, i, a]);
    const [m1, m2, m3] = [await mission(artisan, incident), await mission(artisan, incidentB), await mission(autreArtisan, incidentC)];
    evalLocataire = await id("insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,commentaire) values($1,$2,$3,'locataire',1,'Commentaire privé du locataire') returning id", [org, m1, artisan]);
    evalGerant = await id(`insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale,note_qualite,note_delai,note_prix,commentaire,evaluateur_account_id)
      values($1,$2,$3,'gerant',5,5,5,4,'Commentaire privé de l''agence',$4) returning id`, [org, m2, artisan, gerant]);
    evalAutre = await id("insert into public.artisan_evaluations(organization_id,intervention_id,artisan_id,source,note_globale) values($1,$2,$3,'locataire',2) returning id", [org, m3, autreArtisan]);
    await agir(compteArtisan);
    contestation = await soumettre("contestation");
    question = await soumettre("question");
    await base();
  });

  it("le détail se lit derrière une contestation, par le super admin seulement, commentaires compris", async () => {
    await agir(sa);
    const lignes = (await lire()).rows;
    expect(lignes.map((l) => l.evaluation_id).sort()).toEqual([evalLocataire, evalGerant].sort());
    const duGerant = lignes.find((l) => l.evaluation_id === evalGerant);
    expect(duGerant).toMatchObject({ source: "gerant", note_globale: 5, note_qualite: 5, note_delai: 5, note_prix: 4,
      commentaire: "Commentaire privé de l'agence", organisation: "Agence fictive des évaluations", retiree_le: null, retrait_motif: null });
    expect(String(duGerant.incident_numero)).toMatch(/^TEST-EVAL-/);
    // Jamais l'évaluation d'un autre artisan.
    expect(lignes.some((l) => l.evaluation_id === evalAutre)).toBe(false);

    // Une demande qui n'est pas une contestation n'ouvre pas le détail ; une référence inconnue non plus.
    expect(await refus("select * from public.evaluations_contestation($1)", [question])).toMatch(/Contestation introuvable/);
    expect(await refus("select * from public.evaluations_contestation(gen_random_uuid())")).toMatch(/Contestation introuvable/);

    for (const autre of [gerant, compteArtisan, compteAutreArtisan]) {
      await agir(autre);
      expect(await refus("select * from public.evaluations_contestation($1)", [contestation]), autre).toMatch(/réservée à la supervision/);
    }
    await agir(null, "anon");
    expect(await refus("select * from public.evaluations_contestation($1)", [contestation])).toMatch(/permission denied|réservée à la supervision/);
  });

  it("chaque consultation laisse sa ligne au journal, sans se répéter au rechargement", async () => {
    await agir(sa);
    await lire(); await lire();
    const lignes = await journal("consultation_evaluations_contestation");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toEqual({ organization_id: null, details: { retour_id: contestation, artisan_id: artisan } });
    // Un refus n'écrit rien.
    await agir(sa);
    await refus("select * from public.evaluations_contestation($1)", [question]);
    expect(await journal("consultation_evaluations_contestation")).toHaveLength(1);
  });

  it("le retrait motivé retire UNE évaluation, recalcule la moyenne, et informe l'artisan et l'organisation", async () => {
    expect(await note()).toEqual({ nb_evaluations: 2, note: 3.67 });
    await agir(sa);
    expect(await retirer(evalLocataire, `  ${MOTIF}  `)).toBe("");

    expect(await etat(evalLocataire)).toEqual({ retiree: true, retrait_motif: MOTIF, retiree_par: sa });
    expect(await etat(evalGerant)).toEqual({ retiree: false, retrait_motif: null, retiree_par: null });
    expect(await note()).toEqual({ nb_evaluations: 1, note: 5 });

    // L'organisation : une alerte informative, ouverte à tous, qui mène au dossier — sans le motif.
    await base();
    const alertes = (await db.query("select criticite::text, statut::text, assigned_all, titre, details, origine_id from public.alerts where organization_id=$1 and type='evaluation_retiree'", [org])).rows;
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatchObject({ criticite: "informative", statut: "ouverte", assigned_all: true, origine_id: null });
    expect(alertes[0].titre).toMatch(/^Évaluation d'artisan retirée — TEST-EVAL-/);
    expect(alertes[0].details).toMatchObject({ incident_id: incident, lot_id: lot, source: "locataire" });
    expect(alertes[0].details.libelle).toContain("l'évaluation donnée par le locataire");
    expect(JSON.stringify(alertes[0])).not.toContain("mauvais dossier");
    // Le gestionnaire la lit bien, sous ses droits.
    await agir(gerant);
    expect((await db.query("select count(*)::int n from public.alerts where organization_id=$1 and type='evaluation_retiree'", [org])).rows[0].n).toBe(1);

    // L'artisan : une ligne dans le suivi de SA contestation, sans auteur, sans dossier, sans motif.
    await agir(compteArtisan);
    const suivi = (await db.query("select evenement, message from public.retours_historique where retour_id=$1 and evenement='evaluation_retiree'", [contestation])).rows;
    expect(suivi).toEqual([{ evenement: "evaluation_retiree", message: "Après examen de votre contestation, une évaluation a été retirée. Elle ne compte plus dans votre moyenne, qui est recalculée." }]);
    // … et toujours aucun accès direct aux évaluations.
    expect((await db.query("select count(*)::int n from public.artisan_evaluations")).rows[0].n).toBe(0);

    // Le journal de la supervision garde le geste, rattaché à l'organisation ; aucun permis ne reste.
    const trace = await journal("evaluation_retiree");
    expect(trace).toEqual([{ organization_id: org, details: { retour_id: contestation, evaluation_id: evalLocataire, artisan_id: artisan, source: "locataire" } }]);
    expect((await db.query("select count(*)::int n from support_interne.maintenance_lignes")).rows[0].n).toBe(0);

    // Définitif : un second retrait de la même évaluation est refusé.
    await agir(sa);
    expect(await retirer(evalLocataire)).toMatch(/déjà retirée/);
  });

  it("l'alerte parle à l'organisation de SON évaluation quand c'est la sienne qui est retirée", async () => {
    await agir(sa);
    expect(await retirer(evalGerant)).toBe("");
    await base();
    const { details } = (await db.query("select details from public.alerts where organization_id=$1 and type='evaluation_retiree'", [org])).rows[0];
    expect(details.source).toBe("gerant");
    expect(details.libelle).toContain("Gerimmo a retiré votre évaluation de cette intervention");
    expect(await note()).toEqual({ nb_evaluations: 1, note: 1 });
  });

  it("refuse le retrait sans motif réel, hors contestation, ou pour l'évaluation d'un autre artisan", async () => {
    await agir(sa);
    for (const motif of [null, "", "   ", "neuf car.", "x".repeat(1001)]) {
      expect(await retirer(evalLocataire, motif), String(motif).slice(0, 12)).toMatch(/Précisez le motif du retrait/);
    }
    expect(await retirer(evalLocataire, "x".repeat(1000))).toBe("");
    expect(await retirer(evalAutre)).toMatch(/ne concerne pas l'artisan de cette contestation/);
    expect(await retirer(evalGerant, MOTIF, question)).toMatch(/Contestation introuvable/);
    expect(await refus("select public.retirer_evaluation_contestee($1,gen_random_uuid(),$2)", [contestation, MOTIF])).toMatch(/ne concerne pas l'artisan/);
    expect(await etat(evalAutre)).toMatchObject({ retiree: false });
    expect(await etat(evalGerant)).toMatchObject({ retiree: false });
  });

  it("personne d'autre que le super admin ne retire : ni le gestionnaire, ni l'artisan, ni un visiteur", async () => {
    for (const autre of [gerant, compteArtisan, compteAutreArtisan]) {
      await agir(autre);
      expect(await retirer(evalLocataire), autre).toMatch(/Accès refusé/);
    }
    await agir(null, "anon");
    expect(await retirer(evalLocataire)).toMatch(/permission denied|Accès refusé/);
    expect(await etat(evalLocataire)).toMatchObject({ retiree: false });
    await base();
    expect((await db.query("select count(*)::int n from public.alerts where organization_id=$1 and type='evaluation_retiree'", [org])).rows[0].n).toBe(0);
  });

  it("le garde de traversée n'est pas affaibli : hors de ce geste, la supervision n'écrit toujours pas", async () => {
    await agir(sa);
    expect(await refus("update public.artisan_evaluations set note_globale=5 where id=$1", [evalLocataire])).toMatch(/permission denied|Traversée en lecture seule/);
    await base();
    // Même par une fonction à droits élevés : sans permis décrivant la ligne exacte, le garde refuse.
    await db.query("create function public.zz_essai_ecriture_supervision(p uuid) returns void language sql security definer set search_path='' as $f$ update public.artisan_evaluations set note_globale=5 where id=p $f$");
    await db.query("grant execute on function public.zz_essai_ecriture_supervision(uuid) to authenticated");
    await agir(sa);
    expect(await refus("select public.zz_essai_ecriture_supervision($1)", [evalLocataire])).toMatch(/Traversée en lecture seule/);
    // Après un retrait réussi, aucun permis ne traîne : la même écriture reste refusée.
    expect(await retirer(evalGerant)).toBe("");
    expect(await refus("select public.zz_essai_ecriture_supervision($1)", [evalLocataire])).toMatch(/Traversée en lecture seule/);
    await base();
    expect((await db.query("select note_globale from public.artisan_evaluations where id=$1", [evalLocataire])).rows[0].note_globale).toBe(1);
  });

  it("l'ancien chemin sans contestation est fermé ; la migration se rejoue ; son retour rend l'état d'avant", async () => {
    const droit = async (fonction: string, role = "authenticated") =>
      (await db.query("select to_regprocedure($1) is not null and has_function_privilege($2,$1,'execute') ok", [fonction, role])).rows[0].ok as boolean;
    const existe = async (fonction: string) => (await db.query("select to_regprocedure($1) is not null ok", [fonction])).rows[0].ok as boolean;
    const LIRE = "public.evaluations_contestation(uuid)", RETIRER = "public.retirer_evaluation_contestee(uuid,uuid,text)", ANCIENNE = "public.retirer_evaluation(uuid,text)";
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");

    await base();
    expect([await droit(LIRE), await droit(RETIRER), await droit(ANCIENNE)]).toEqual([true, true, false]);
    expect([await droit(LIRE, "anon"), await droit(RETIRER, "anon"), await droit(ANCIENNE, "anon")]).toEqual([false, false, false]);
    await db.query(migration);
    expect([await droit(LIRE), await droit(RETIRER), await droit(ANCIENNE)]).toEqual([true, true, false]);

    // Une évaluation retirée, puis le retour : rien n'est effacé, les deux fonctions disparaissent.
    await agir(sa);
    expect(await retirer(evalLocataire)).toBe("");
    await base();
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122150000','evaluation_contestee') on conflict do nothing");
    await db.query(retour);
    expect([await existe(LIRE), await existe(RETIRER), await droit(ANCIENNE)]).toEqual([false, false, true]);
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122150000'")).rows[0].n).toBe(0);
    expect(await etat(evalLocataire)).toMatchObject({ retiree: true, retrait_motif: MOTIF });
    expect((await db.query("select count(*)::int n from public.alerts where organization_id=$1 and type='evaluation_retiree'", [org])).rows[0].n).toBe(1);
    // L'état d'avant, tel qu'il était : l'ancienne fonction est refusée par le garde de traversée.
    await agir(sa);
    expect(await refus("select public.retirer_evaluation($1,$2)", [evalGerant, MOTIF])).toMatch(/Traversée en lecture seule/);
    await base();
    await db.query(retour);
    expect(await existe(LIRE)).toBe(false);

    await db.query(migration);
    expect([await droit(LIRE), await droit(RETIRER), await droit(ANCIENNE)]).toEqual([true, true, false]);
    await agir(sa);
    expect(await retirer(evalGerant)).toBe("");
  });
});
