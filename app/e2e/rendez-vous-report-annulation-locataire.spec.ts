import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LE LOCATAIRE NE PEUT PLUS ÊTRE LÀ (décision D22 du 14/10/2026, option B) — vérification finale du palier 1.
//
// Aucun parcours navigateur ne jouait jusqu'ici le report ni l'annulation d'un rendez-vous par le locataire, ni la
// réponse de l'artisan (constat de préparation de la vérification finale, 23/11/2026). Ici, de bout en bout, sur
// téléphone, avec un vrai compte locataire et l'artisan du banc :
//   1. le locataire demande un report (motif, trois disponibilités) ; son rendez-vous reste valable en attendant ;
//   2. l'artisan lit la demande et retient l'une des dates : le rendez-vous est déplacé, le locataire le lit ;
//   3. second report : l'artisan refuse les dates en disant pourquoi ; le rendez-vous est maintenu, le locataire lit
//      la réponse ;
//   4. deux reports sont faits : l'écran dit pourquoi il n'en propose plus, et le locataire annule (motif, case à
//      cocher, puis envoi) ;
//   5. l'artisan lit l'annulation et en prend acte.
// Chaque étape est vérifiée à l'écran ET en base. Aucune date n'est inventée hors du formulaire : les dates sont celles
// que le locataire saisit, au jour de Paris.
//
// Ce parcours ne lit ni n'ouvre le réglage des envois automatiques : la phrase du rappel de la veille, qui en dépend,
// est tenue par le parcours des envois automatiques (un autre fichier peut l'ouvrir pendant que celui-ci tourne).

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 15_000 });

/** Rien de ce contenu n'est plus large que l'écran, ni coupé par une carte. */
async function tientDansLEcran(p: Page, cible: Locator) {
  await cible.scrollIntoViewIfNeeded();
  const boite = (await cible.boundingBox())!;
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(p.viewportSize()!.width + 1);
  expect(await cible.evaluate((el) => {
    for (let n = el.parentElement; n && n.tagName !== "BODY"; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== "visible" && (n.scrollWidth > n.clientWidth + 1 || n.scrollLeft > 0)) return `${n.tagName}.${n.className}`;
    }
    return null;
  })).toBeNull();
  expect(await debordementHorizontal(p)).toBeLessThanOrEqual(1);
}

/** Un bouton client ne répond qu'une fois la page démarrée : on le redemande tant que la suite attendue n'est pas là. */
async function ouvrir(p: Page, bouton: Locator, attendu: Locator) {
  await p.waitForLoadState("networkidle");
  await expect(async () => {
    if (!(await attendu.isVisible())) await bouton.click({ timeout: 3_000 });
    await expect(attendu).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test("locataire : report demandé puis accepté, report refusé, puis annulation dont l'artisan prend acte", async ({ page, browser }, info) => {
  test.setTimeout(300_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(
    process.env.E2E_CI !== "1" || !cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible),
    "Banc local isolé uniquement",
  );
  const db = new Client({ connectionString: cible });
  await db.connect();
  const [org, compte, bailleur, bien, lot, cptLocataire, locataire, bail, incident, mission] = Array.from({ length: 10 }, () => randomUUID());
  const marque = org.slice(0, 8), nom = `ESSAI Report ${marque}`;
  const email = `report-${org}@example.invalid`, emailLocataire = `report-loc-${org}@example.invalid`, motDePasse = randomUUID();
  const motifRefus = `Je suis en chantier toute la semaine (essai ${marque})`;
  let artisanId = "";
  const systeme = async (travail: () => Promise<void>) => {
    await db.query("begin");
    try { await db.query("select public.tache_systeme()"); await travail(); await db.query("commit"); }
    catch (e) { await db.query("rollback").catch(() => {}); throw e; }
  };
  // Les jours, au calendrier de Paris : J+15 à J+17 pour le premier report, J+20 à J+22 pour le second.
  const jours = (await db.query("select array_agg((public.aujourdhui_paris() + n)::text order by n) j from unnest(array[5,15,16,17,20,21,22]) n")).rows[0].j as string[];
  const [jRdv, j15, j16, j17, j20, j21, j22] = jours;
  const demandes = async () => (await db.query(
    "select type::text, statut::text, motif_code, reponse_motif, annulation_vue_le is not null vue from intervention_demandes_rdv where intervention_id=$1 order by demandee_le", [mission])).rows;
  const rdv = async () => (await db.query(
    "select statut::text, to_char(debut_prevu at time zone 'Europe/Paris','YYYY-MM-DD HH24:MI') debut from incident_interventions where id=$1", [mission])).rows[0];

  const chezLocataire = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const l = await chezLocataire.newPage();
  await sansSyntheseAlertes(l);
  await sansSyntheseAlertes(page);
  for (const c of [chezLocataire, page.context()]) await c.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));

  try {
    artisanId = (await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'")).rows[0].id;
    await systeme(async () => {
      for (const [id, adresse, meta] of [[compte, email, '{"prenom":"Propriétaire","nom":"Essai report"}'], [cptLocataire, emailLocataire, '{"prenom":"Camille","nom":"Essai report"}']] as const) {
        await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
          values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',$4::jsonb,now(),now(),'','','','','')`, [id, adresse, motDePasse, meta]);
      }
      await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75012','Paris',$3)", [org, nom, email]);
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire')", [compte, org, cptLocataire]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$2,$3,'Essai report','Propriétaire',$4,'Personne physique','1 rue des Essais','75012','Paris')", [bailleur, org, compte, email]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email) values($1,$2,$3,'Essai report','Camille',$4)", [locataire, org, cptLocataire, emailLocataire]);
      await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Essais','75012','Paris')", [bien, org, nom]);
      await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'loue',40)", [lot, org, bien, `${nom} A`]);
      await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-300)", [lot, org, bailleur]);
      await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-200,750,50,5)", [bail, org, lot, locataire]);
      await db.query("insert into artisan_agences(organization_id,artisan_id,statut) values($1,$2,'actif')", [org, artisanId]);
      await db.query(`insert into incidents(id,organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,imputation,imputation_justification)
        values($1,$2,$3,$4,$5,$6,'espace_locataire','plomberie_canalisation',$7,'affecte','proprietaire','Essai fictif')`, [incident, org, lot, bail, locataire, `ESSAI-${marque}-R`, `ESSAI report : fuite fictive ${marque}`]);
      // Un rendez-vous confirmé dans cinq jours, à midi (heure de Paris) : le report est encore possible.
      await db.query(`insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le,debut_prevu,fin_prevue)
        values($1,$2,$3,$4,'entretien_courant','planifiee',now()-interval '1 day',
          ($5::date + time '12:00') at time zone 'Europe/Paris', ($5::date + time '14:00') at time zone 'Europe/Paris')`, [mission, org, incident, artisanId, jRdv]);
      await db.query("insert into intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin,statut) select organization_id,id,'artisan',1,debut_prevu,fin_prevue,'retenu' from incident_interventions where id=$1", [mission]);
    });

    // ── 1. Le locataire demande un report : motif, trois disponibilités.
    await connecterVers(l, emailLocataire, motDePasse, `/locataire/${org}/demandes`);
    const carte = l.locator("main:visible").first();
    await expect(carte).toContainText("Rendez-vous", { timeout: 30_000 });
    const plusLa = carte.getByRole("button", { name: "Je ne peux plus être là", exact: true });
    const demanderReport = carte.getByRole("button", { name: "Demander un report", exact: true });
    await ouvrir(l, plusLa, demanderReport);
    await demanderReport.click();
    await expect(carte).toContainText("reste valable tant que l'artisan n'a pas répondu");
    await carte.getByLabel("Motif", { exact: true }).selectOption("travail");
    for (const [i, jour] of [j15, j16, j17].entries()) {
      await carte.getByLabel(`Date ${i + 1}`, { exact: true }).fill(jour);
      await carte.getByLabel(`Moment ${i + 1}`, { exact: true }).selectOption("apres_midi");
    }
    await tientDansLEcran(l, carte.getByLabel("Date 3", { exact: true }));
    await l.screenshot({ path: info.outputPath("locataire-report-formulaire.png"), fullPage: true });
    await carte.getByRole("button", { name: "Envoyer à l'artisan", exact: true }).click();
    await expect(async () => expect(await demandes()).toEqual([{ type: "report", statut: "en_attente", motif_code: "travail", reponse_motif: null, vue: false }])).toPass({ timeout: 30_000 });
    await expect(carte).toContainText("Report demandé", { timeout: 30_000 });
    await expect(carte).toContainText("Votre rendez-vous actuel reste valable tant que l'artisan n'a pas répondu");
    await expect(carte.getByRole("button", { name: "Retirer ma demande", exact: true })).toBeVisible();
    // Tant que l'artisan n'a pas répondu, ni nouveau report ni annulation ne se proposent par-dessus.
    await expect(plusLa).toHaveCount(0);
    expect(await rdv()).toEqual({ statut: "planifiee", debut: `${jRdv} 12:00` });
    await l.screenshot({ path: info.outputPath("locataire-report-en-attente.png"), fullPage: true });

    // ── 2. L'artisan lit la demande et retient la deuxième date : le rendez-vous est déplacé.
    await page.goto(`/artisan/missions/${mission}`);
    await expect(page.getByText("Le locataire demande un report", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText("Motif : Une contrainte de travail");
    await expect(page.locator("body")).toContainText("Le rendez-vous actuel reste valable tant que vous n'avez pas répondu");
    const dates = page.locator("li").filter({ has: page.getByRole("button", { name: "Je retiens cette date", exact: true }) });
    await expect(dates).toHaveCount(3);
    await tientDansLEcran(page, dates.nth(2));
    await page.screenshot({ path: info.outputPath("artisan-report-demande.png"), fullPage: true });
    await page.waitForLoadState("networkidle");
    await dates.nth(1).getByRole("button", { name: "Je retiens cette date", exact: true }).click();
    await expect(async () => expect(await rdv()).toEqual({ statut: "planifiee", debut: `${j16} 14:00` })).toPass({ timeout: 30_000 });
    expect((await demandes())[0]).toMatchObject({ type: "report", statut: "acceptee" });
    await expect(page.getByText("Le locataire demande un report", { exact: true })).toHaveCount(0, { timeout: 30_000 });

    // Le locataire lit le nouveau rendez-vous.
    await l.reload();
    await expect(carte).toContainText("L'artisan a accepté : nouveau rendez-vous le", { timeout: 30_000 });
    await expect(carte).toContainText("Votre ancien rendez-vous est annulé.");
    await l.screenshot({ path: info.outputPath("locataire-report-accepte.png"), fullPage: true });

    // ── 3. Second report : l'artisan refuse les dates et dit pourquoi ; le rendez-vous est maintenu.
    await ouvrir(l, plusLa, demanderReport);
    await demanderReport.click();
    await carte.getByLabel("Motif", { exact: true }).selectOption("empechement");
    for (const [i, jour] of [j20, j21, j22].entries()) {
      await carte.getByLabel(`Date ${i + 1}`, { exact: true }).fill(jour);
      await carte.getByLabel(`Moment ${i + 1}`, { exact: true }).selectOption("matin");
    }
    await carte.getByRole("button", { name: "Envoyer à l'artisan", exact: true }).click();
    await expect(async () => expect((await demandes()).map((d) => d.statut)).toEqual(["acceptee", "en_attente"])).toPass({ timeout: 30_000 });

    await page.goto(`/artisan/missions/${mission}`);
    await expect(page.getByText("Le locataire demande un report", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText("Motif : Un empêchement");
    const aucune = page.getByRole("button", { name: "Aucune de ces dates ne me convient", exact: true });
    const pourquoi = page.getByLabel("Pourquoi ?", { exact: true });
    await ouvrir(page, aucune, pourquoi);
    await pourquoi.fill(motifRefus);
    await tientDansLEcran(page, pourquoi);
    await page.screenshot({ path: info.outputPath("artisan-report-refus.png"), fullPage: true });
    await page.getByRole("button", { name: "Refuser ces dates", exact: true }).click();
    await expect(async () => expect((await demandes()).map((d) => d.statut)).toEqual(["acceptee", "refusee"])).toPass({ timeout: 30_000 });
    expect((await demandes())[1].reponse_motif).toBe(motifRefus);
    expect(await rdv()).toEqual({ statut: "planifiee", debut: `${j16} 14:00` });
    // Le gestionnaire est prévenu : une alerte ouverte de son espace.
    expect((await db.query("select count(*)::int n from alerts where organization_id=$1 and statut='ouverte'", [org])).rows[0].n).toBeGreaterThan(0);

    await l.reload();
    await expect(carte).toContainText("L'artisan ne peut pas : votre gestionnaire va vous appeler", { timeout: 30_000 });
    await expect(carte).toContainText(`Sa réponse : « ${motifRefus} ».`);
    await expect(carte).toContainText("Votre rendez-vous actuel est maintenu en attendant.");
    await l.screenshot({ path: info.outputPath("locataire-report-refuse.png"), fullPage: true });

    // ── 4. Deux reports sont faits : l'écran dit pourquoi il n'en propose plus ; le locataire annule.
    const annulerChoix = carte.getByRole("button", { name: "Annuler le rendez-vous", exact: true });
    await ouvrir(l, plusLa, annulerChoix);
    await expect(demanderReport).toHaveCount(0);
    await expect(carte).toContainText("Ce rendez-vous a déjà fait l'objet de 2 demandes de report : pour le changer encore, appelez votre gestionnaire.");
    await annulerChoix.click();
    await expect(carte).toContainText("L'annulation prend effet tout de suite");
    await carte.getByLabel("Motif", { exact: true }).selectOption("sante");
    const envoyerAnnulation = carte.getByRole("button", { name: "Annuler le rendez-vous", exact: true });
    // Confirmation à deux temps : l'envoi reste inactif tant que la case n'est pas cochée.
    await expect(envoyerAnnulation).toBeDisabled();
    await carte.getByRole("checkbox").check();
    await expect(envoyerAnnulation).toBeEnabled();
    await tientDansLEcran(l, envoyerAnnulation);
    await l.screenshot({ path: info.outputPath("locataire-annulation.png"), fullPage: true });
    await envoyerAnnulation.click();
    // Une annulation prend effet tout de suite : la base l'enregistre « acceptée » (annuler_rdv_locataire).
    await expect(async () => expect((await demandes()).map((d) => `${d.type}:${d.statut}`)).toEqual(["report:acceptee", "report:refusee", "annulation:acceptee"])).toPass({ timeout: 30_000 });
    expect((await rdv()).statut).toBe("acceptee");
    await l.reload();
    await expect(carte).toContainText("Vous avez annulé le rendez-vous", { timeout: 30_000 });
    await expect(carte).toContainText("L'artisan et votre gestionnaire sont prévenus.");
    await l.screenshot({ path: info.outputPath("locataire-annule.png"), fullPage: true });

    // ── 5. L'artisan lit l'annulation et en prend acte.
    await page.goto(`/artisan/missions/${mission}`);
    await expect(page.locator("body")).toContainText("Le locataire a annulé le rendez-vous", { timeout: 30_000 });
    await expect(page.locator("body")).toContainText("Motif : Un problème de santé");
    await expect(page.locator("body")).toContainText("Ne vous déplacez pas à cette date");
    const acte = page.getByRole("button", { name: "J’en prends acte", exact: true });
    await tientDansLEcran(page, acte);
    await page.screenshot({ path: info.outputPath("artisan-annulation.png"), fullPage: true });
    await page.waitForLoadState("networkidle");
    await acte.click();
    await expect(page.getByText("Vous avez pris acte de l’annulation.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(async () => expect((await demandes())[2].vue).toBe(true)).toPass({ timeout: 30_000 });

    // La chronologie du dossier garde chaque geste, dans l'ordre.
    const types = (await db.query("select type::text from incident_evenements where incident_id=$1 and type::text like 'rdv\\_%' order by created_at", [incident])).rows.map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(["rdv_report_demande", "rdv_report_accepte", "rdv_report_refuse"]));
    expect(types.some((t) => t.startsWith("rdv_annule"))).toBe(true);
  } finally {
    await db.query("rollback").catch(() => {});
    await chezLocataire.close();
    // L'artisan du banc retrouve son état d'avant ; l'espace de l'essai (comptes, logement, incident) reste dans la base du banc.
    try {
      await systeme(async () => {
        await db.query("delete from alerts where organization_id=$1", [org]);
        await db.query("delete from notification_intentions where organization_id=$1", [org]);
        await db.query("with d as (delete from intervention_demandes_rdv where intervention_id=$1), c as (delete from intervention_creneaux where intervention_id=$1) select 1", [mission]);
        await db.query("delete from incident_evenements where organization_id=$1", [org]);
        await db.query("delete from incident_interventions where id=$1", [mission]);
        await db.query("delete from artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisanId]);
      });
    } finally { await db.end(); }
  }
});
