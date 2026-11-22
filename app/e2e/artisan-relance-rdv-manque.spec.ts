import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

// ARTISAN : RENDEZ-VOUS MANQUÉ CONSIGNÉ ET RELANCE D'UNE FACTURE (audit palier 1 du 22/11/2026, P2-04).
//
// Dans trois navigateurs (artisan du banc, propriétaire et locataire fictifs d'un espace propre à l'essai) :
//   1. le rendez-vous confirmé est passé : l'artisan consigne que le locataire était absent ; le rendez-vous tombe ;
//   2. le propriétaire le lit à la chronologie du dossier (avec la précision), le locataire dans « Mes demandes »
//      (sans la précision) ;
//   3. un autre rendez-vous passe : le propriétaire consigne cette fois que l'artisan ne s'est pas présenté ; l'artisan
//      le lit dans sa mission et dans « Mes évaluations », le locataire lit la nouvelle version ;
//   4. une facture déposée depuis 31 jours : l'artisan relance ; le propriétaire lit la relance sur la facture et à la
//      chronologie ; l'artisan voit quand la suivante sera possible. Aucun e-mail ne part.
// L'espace, ses comptes, le logement et les incidents sont fictifs et restent dans la base du banc. Tout ce qui touche
// l'artisan du banc (missions, facture, rendez-vous manqués, présence au carnet) est retiré à la fin.

const LOCAUX = ["localhost", "127.0.0.1"];
test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 15_000 });

/** Rien de ce contenu n'est plus large que l'écran, ni coupé par une carte (voir le parcours des absences). */
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

/** Dans le dossier d'incident du propriétaire, ouvre l'onglet qui porte la cible. */
async function dansLOnglet(p: Page, onglet: string, cible: Locator) {
  await expect(p.locator(".incident-dossier")).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    if (!(await cible.first().isVisible())) await p.getByText(onglet, { exact: true }).first().click();
    await expect(cible.first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Ouvre la chronologie du dossier chez le propriétaire : l'onglet « Historique », puis le bloc replié « Historique et
 * commentaires » (un <details> natif, fermé par défaut chez le propriétaire).
 */
async function ouvrirChronologie(p: Page) {
  const chronologie = p.locator("#chronologie");
  await dansLOnglet(p, "Historique", chronologie);
  if (!(await chronologie.evaluate((d) => (d as HTMLDetailsElement).open))) await chronologie.locator("summary").click();
  await expect(chronologie).toHaveAttribute("open", "");
  return chronologie;
}

test("artisan : rendez-vous manqué consigné des deux côtés, puis relance d'une facture ; le propriétaire et le locataire lisent ce qui les concerne", async ({ page, context, browser }, info) => {
  test.setTimeout(360_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const [org, compte, bailleur, bien, lot, cptLocataire, locataire, bail] = Array.from({ length: 8 }, () => randomUUID());
  const [incidentRdv, missionRdv, incidentFacture, missionFacture, consultation, sollicitation, devis, photo] = Array.from({ length: 8 }, () => randomUUID());
  const marque = org.slice(0, 8), nom = `ESSAI Relance ${marque}`;
  const email = `relance-${org}@example.invalid`, emailLocataire = `relance-loc-${org}@example.invalid`, motDePasse = randomUUID();
  const numeroFacture = `ESSAI-F-${marque}`, note = `Personne à l’interphone ${marque}`, noteGerant = `Précision du propriétaire ${marque}`;
  let artisanId = "", compteArtisan = "", facture = "";
  const systeme = async (travail: () => Promise<void>) => {
    await db.query("begin");
    try { await db.query("select public.tache_systeme()"); await travail(); await db.query("commit"); }
    catch (e) { await db.query("rollback").catch(() => {}); throw e; }
  };
  /** Remet un rendez-vous confirmé, déjà passé de deux heures, sur la mission. */
  const rendezVousPasse = () => systeme(async () => {
    await db.query("update incident_interventions set statut='planifiee', debut_prevu=now()-interval '2 hours', fin_prevue=now()-interval '1 hour' where id=$1", [missionRdv]);
    await db.query("update intervention_creneaux set statut='caduc' where intervention_id=$1 and statut='retenu'", [missionRdv]);
    await db.query("insert into intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin,statut) select organization_id,id,'artisan',1,debut_prevu,fin_prevue,'retenu' from incident_interventions where id=$1", [missionRdv]);
  });
  const etatMission = async () => (await db.query("select statut::text, debut_prevu is null sans_date from incident_interventions where id=$1", [missionRdv])).rows[0];
  const manques = async () => (await db.query("select absent, consigne_role, note from intervention_rdv_manques where intervention_id=$1 order by created_at, rdv_debut", [missionRdv])).rows;

  try {
    const { rows: [a] } = await db.query("select a.id, a.account_id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    artisanId = a.id; compteArtisan = a.account_id;
    await systeme(async () => {
      for (const [id, adresse, meta] of [[compte, email, '{"prenom":"Propriétaire","nom":"Essai relance"}'], [cptLocataire, emailLocataire, '{"prenom":"Camille","nom":"Essai relance"}']] as const) {
        await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
          values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',$4::jsonb,now(),now(),'','','','','')`, [id, adresse, motDePasse, meta]);
      }
      await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription','conditions_clients')", [compte, CONDITIONS_VERSION]);
      await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75012','Paris',$3)", [org, nom, email]);
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$2,'locataire')", [compte, org, cptLocataire]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$2,$3,'Essai relance','Propriétaire',$4,'Personne physique','1 rue des Essais','75012','Paris')", [bailleur, org, compte, email]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email) values($1,$2,$3,'Essai relance','Camille',$4)", [locataire, org, cptLocataire, emailLocataire]);
      await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Essais','75012','Paris')", [bien, org, nom]);
      await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'loue',40)", [lot, org, bien, `${nom} A`]);
      await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-300)", [lot, org, bailleur]);
      await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-200,750,50,5)", [bail, org, lot, locataire]);
      await db.query("insert into artisan_agences(organization_id,artisan_id,statut) values($1,$2,'actif')", [org, artisanId]);
      // Dossier 1 : une mission au rendez-vous confirmé, déjà passé.
      await db.query(`insert into incidents(id,organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,imputation,imputation_justification)
        values($1,$2,$3,$4,$5,$6,'espace_locataire','plomberie_canalisation',$7,'affecte','proprietaire','Essai fictif')`, [incidentRdv, org, lot, bail, locataire, `ESSAI-${marque}-1`, `ESSAI relance : fuite fictive ${marque}`]);
      await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now()-interval '3 days')", [missionRdv, org, incidentRdv, artisanId]);
      // Dossier 2 : une mission en cours, dont la facture sera déposée par la vraie fonction.
      await db.query(`insert into incidents(id,organization_id,lot_id,bail_id,declarant_person_id,numero,canal,categorie,description,etat,imputation,imputation_justification)
        values($1,$2,$3,$4,$5,$6,'espace_locataire','plomberie_canalisation',$7,'en_cours','proprietaire','Essai fictif')`, [incidentFacture, org, lot, bail, locataire, `ESSAI-${marque}-2`, `ESSAI relance : joint fictif ${marque}`]);
      await db.query("insert into incident_consultations(id,organization_id,incident_id,metier,nature_travaux,statut) values($1,$2,$3,'plomberie','entretien_courant','close')", [consultation, org, incidentFacture]);
      await db.query("insert into incident_sollicitations(id,organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,$5,'retenue')", [sollicitation, org, consultation, incidentFacture, artisanId]);
      await db.query("insert into incident_devis(id,organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,statut) values($1,$2,$3,$4,$5,100000,'Remplacement du joint',current_date+30,'retenu')", [devis, org, sollicitation, incidentFacture, artisanId]);
      await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,devis_id,nature_travaux,statut,acceptee_le,demarree_le) values($1,$2,$3,$4,$5,'entretien_courant','en_cours',now()-interval '40 days',now()-interval '35 days')", [missionFacture, org, incidentFacture, artisanId, devis]);
      const cheminPhoto = `${org}/apres-${marque}.jpg`;
      await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [cheminPhoto]);
      await db.query("insert into documents(id,organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,$2,'photo_incident',$3,'image/jpeg',10,$4)", [photo, org, cheminPhoto, `essai-relance-${marque}`]);
      await db.query("insert into intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')", [org, missionFacture, photo]);
    });
    await rendezVousPasse();
    // Le compte rendu et la facture, par les vraies fonctions et sous le compte de l'artisan ; puis la facture vieillit.
    const { rows: [session] } = await db.query("select id from auth.sessions where user_id=$1 order by created_at desc limit 1", [compteArtisan]);
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: compteArtisan, role: "authenticated", aal: "aal2", session_id: session?.id ?? compteArtisan })]);
      await db.query("set local role authenticated");
      await db.query("select public.deposer_compte_rendu($1,'Joint remplacé',null,null,100000,false)", [missionFacture]);
      const chemin = `${org}/factures-artisan/${missionFacture}/${randomUUID()}.pdf`;
      await db.query("insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)", [chemin, compteArtisan]);
      facture = (await db.query("select public.deposer_facture_artisan($1,$2,100000,null,$3,'application/pdf',10,$4) f", [missionFacture, numeroFacture, chemin, `essai-facture-${marque}`])).rows[0].f;
      await db.query("reset role");
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); throw e; }
    await systeme(async () => { // À midi, heure de Paris, il y a 31 jours civils : « now() - 31 jours » tomberait un jour plus tard à Paris entre
      // 23 h et minuit quand un changement d'heure sépare les deux dates, et la date attendue plus bas serait fausse.
      await db.query("update intervention_factures set deposee_le = ((public.aujourdhui_paris() - 31) + time '12:00') at time zone 'Europe/Paris' where id=$1", [facture]); });
    const { rows: [d] } = await db.query(`select to_char(public.aujourdhui_paris(),'DD/MM/YYYY') j0, to_char(public.aujourdhui_paris()+15,'DD/MM/YYYY') j15,
      to_char(public.aujourdhui_paris()-31,'DD/MM/YYYY') depot`);
    const absencesAvant = Number((await db.query(`select count(*)::int n from intervention_rdv_manques m join incident_interventions i on i.id=m.intervention_id
      where i.artisan_id=$1 and m.absent='artisan' and m.rdv_debut >= now() - interval '12 months'`, [artisanId])).rows[0].n);

    // ── 1. L'artisan consigne l'absence du locataire.
    await context.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
    await sansSyntheseAlertes(page);
    await page.goto(`/artisan/missions/${missionRdv}`);
    const passe = page.locator("[data-rdv-passe]");
    await expect(passe).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await passe.locator("summary").click();
    const formulaire = page.locator("[data-rdv-manque-artisan]");
    await expect(formulaire).toBeVisible();
    await formulaire.getByRole("checkbox").check();
    await formulaire.locator('input[name="note"]').fill(note);
    await tientDansLEcran(page, formulaire);
    await page.screenshot({ path: info.outputPath("artisan-rendez-vous-passe.png"), fullPage: true });
    await formulaire.getByRole("button", { name: "Consigner l’absence du locataire", exact: true }).click();
    const liste = page.locator("[data-rdv-manques]");
    await expect(liste.locator('li[data-absent="locataire"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(liste).toContainText("vous avez indiqué que le locataire était absent.");
    await expect(liste).toContainText(`« ${note} »`);
    // Le rendez-vous est tombé : plus de geste « rendez-vous passé », la mission attend de nouvelles dates.
    await expect(page.locator("[data-rdv-passe]")).toHaveCount(0);
    expect(await etatMission()).toEqual({ statut: "acceptee", sans_date: true });
    expect(await manques()).toEqual([{ absent: "locataire", consigne_role: "artisan", note }]);
    expect((await db.query("select statut::text, titre from alerts where organization_id=$1 and type='rdv_manque'", [org])).rows).toEqual([{ statut: "ouverte", titre: `Rendez-vous manqué — ESSAI-${marque}-1` }]);
    await tientDansLEcran(page, liste);
    await page.screenshot({ path: info.outputPath("artisan-rendez-vous-manque.png"), fullPage: true });

    const proprietaire = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    const chezLocataire = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
    try {
      for (const c of [proprietaire, chezLocataire]) await c.route("**/*", (r) => (LOCAUX.includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));

      // ── 2. Le propriétaire le lit à la chronologie, avec la précision de l'artisan.
      const p = await proprietaire.newPage();
      await sansSyntheseAlertes(p);
      await connecterVers(p, email, motDePasse, `/espace/${org}/incidents?sel=${incidentRdv}`);
      const chronologie = await ouvrirChronologie(p);
      const ligne = chronologie.getByText("Rendez-vous manqué", { exact: true });
      await expect(ligne).toBeVisible();
      await expect(chronologie).toContainText("le locataire était absent · indiqué par l’artisan");
      await expect(chronologie).toContainText(`« ${note} »`);
      await tientDansLEcran(p, ligne.first());
      await p.screenshot({ path: info.outputPath("proprietaire-chronologie.png"), fullPage: true });

      // Le locataire lit la date et qui est dit absent — jamais la précision.
      const l = await chezLocataire.newPage();
      await sansSyntheseAlertes(l);
      await connecterVers(l, emailLocataire, motDePasse, `/locataire/${org}/demandes`);
      const avis = l.locator("[data-rdv-manque]");
      await expect(avis).toHaveCount(1, { timeout: 30_000 });
      await expect(avis).toHaveAttribute("data-rdv-manque", "locataire");
      await expect(avis).toContainText("manqué");
      await expect(avis).toContainText("L’artisan a indiqué que vous étiez absent. Un nouveau rendez-vous va être convenu.");
      await expect(l.locator("body")).not.toContainText(note);
      await tientDansLEcran(l, avis);
      await l.screenshot({ path: info.outputPath("locataire-rendez-vous-manque.png"), fullPage: true });

      // ── 3. Un autre rendez-vous passe : cette fois le propriétaire consigne l'absence de l'artisan.
      await rendezVousPasse();
      // Le nouveau rendez-vous a fermé l'alerte de la première absence.
      expect((await db.query("select statut::text, closed_action from alerts where organization_id=$1 and type='rdv_manque'", [org])).rows).toEqual([{ statut: "fermee", closed_action: "Nouveau rendez-vous fixé" }]);
      await p.reload();
      const geste = p.locator("[data-rdv-passe]");
      await dansLOnglet(p, "Suivi", geste);
      await p.waitForLoadState("networkidle");
      await geste.locator("summary").click();
      const duGerant = p.locator("[data-rdv-manque-gestionnaire]");
      await expect(duGerant).toBeVisible();
      await duGerant.getByRole("radio", { name: "L’artisan", exact: true }).check();
      await duGerant.locator('input[name="note"]').fill(noteGerant);
      await tientDansLEcran(p, duGerant);
      await p.screenshot({ path: info.outputPath("proprietaire-consigne.png"), fullPage: true });
      await duGerant.getByRole("button", { name: "Consigner le rendez-vous manqué", exact: true }).click();
      await expect(async () => {
        expect(await manques()).toEqual([{ absent: "locataire", consigne_role: "artisan", note }, { absent: "artisan", consigne_role: "gestionnaire", note: noteGerant }]);
      }).toPass({ timeout: 30_000 });
      expect(await etatMission()).toEqual({ statut: "acceptee", sans_date: true });
      // Consigné par le gestionnaire lui-même : aucune alerte de plus.
      expect((await db.query("select count(*)::int n from alerts where organization_id=$1 and type='rdv_manque' and statut='ouverte'", [org])).rows[0].n).toBe(0);

      // L'artisan le lit dans sa mission (sans la précision du propriétaire) et dans ses repères.
      await page.reload();
      await expect(liste.locator('li[data-absent="artisan"]')).toHaveCount(1, { timeout: 30_000 });
      await expect(liste).toContainText("votre client a indiqué que vous ne vous êtes pas présenté.");
      await expect(page.locator("body")).not.toContainText(noteGerant);
      await expect(page.locator("body")).toContainText("Une absence qui vous est attribuée est comptée dans vos rendez-vous manqués");
      await page.goto("/artisan/note");
      const repere = page.locator("[data-rdv-manques-artisan]");
      await expect(repere).toHaveAttribute("data-rdv-manques-artisan", String(absencesAvant + 1), { timeout: 30_000 });
      await expect(repere).toContainText(`Rendez-vous manqués sur douze mois : ${absencesAvant + 1}.`);
      await expect(repere).toContainText("Ces indicateurs n’entrent pas dans le calcul de votre note.");
      await tientDansLEcran(page, repere);
      await page.screenshot({ path: info.outputPath("artisan-reperes.png"), fullPage: true });

      // Le locataire lit la dernière version : c'est l'artisan qui est dit absent.
      await l.reload();
      await expect(avis).toHaveCount(1, { timeout: 30_000 });
      await expect(avis).toHaveAttribute("data-rdv-manque", "artisan");
      await expect(avis).toContainText("Votre propriétaire a consigné que l’artisan ne s’est pas présenté.");
      await expect(l.locator("body")).not.toContainText(noteGerant);

      // ── 4. La facture déposée depuis 31 jours : l'artisan relance.
      await page.goto(`/artisan/missions/${missionFacture}`);
      const relance = page.locator("[data-relance-facture]");
      await expect(relance).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      await tientDansLEcran(page, relance);
      await page.screenshot({ path: info.outputPath("artisan-relance-possible.png"), fullPage: true });
      await relance.getByRole("button", { name: `Relancer mon client pour la facture n° ${numeroFacture}`, exact: true }).click();
      await expect(async () => {
        expect((await db.query("select relances, relancee_le is not null relancee from intervention_factures where id=$1", [facture])).rows[0]).toEqual({ relances: 1, relancee: true });
      }).toPass({ timeout: 30_000 });
      await page.reload();
      const etat = page.locator("[data-etat-relance]");
      await expect(etat).toContainText(`Relancée le ${d.j0}.`, { timeout: 30_000 });
      await expect(etat).toContainText(`Prochaine relance possible à partir du ${d.j15}.`);
      await expect(page.locator("[data-relance-facture]")).toHaveCount(0);
      await tientDansLEcran(page, etat);
      await page.screenshot({ path: info.outputPath("artisan-relance-faite.png"), fullPage: true });
      expect((await db.query("select statut::text, titre, details->>'libelle' libelle from alerts where organization_id=$1 and type='facture_artisan_relancee'", [org])).rows).toEqual([{
        statut: "ouverte", titre: `Facture relancée par l'artisan — ESSAI-${marque}-2`,
        libelle: `E2E Plomberie Dubois vous relance pour sa facture n° ${numeroFacture} déposée le ${d.depot}, pas encore contrôlée.`,
      }]);

      // Le propriétaire lit la relance sur la facture, et à la chronologie.
      await p.goto(`/espace/${org}/incidents?sel=${incidentFacture}`);
      const surFacture = p.locator("[data-facture-relancee]");
      await dansLOnglet(p, "Devis et facture", surFacture);
      await expect(surFacture).toHaveText(`L’artisan vous a relancé le ${d.j0} pour cette facture, déposée le ${d.depot}.`);
      await tientDansLEcran(p, surFacture);
      await p.screenshot({ path: info.outputPath("proprietaire-facture-relancee.png"), fullPage: true });
      const chronologieFacture = await ouvrirChronologie(p);
      await expect(chronologieFacture.getByText("Facture relancée par l'artisan", { exact: true })).toBeVisible();
      await expect(chronologieFacture).toContainText(`n° ${numeroFacture} · relance n° 1 · déposée depuis 31 jours · pas encore contrôlée`);
    } finally { await proprietaire.close(); await chezLocataire.close(); }
  } finally {
    // L'artisan du banc retrouve son état d'avant : ni mission, ni facture, ni rendez-vous manqué de l'essai. L'espace
    // de l'essai (comptes, logement, incidents) reste dans la base du banc.
    await db.query("rollback").catch(() => {});
    const missions = [missionRdv, missionFacture];
    try {
      await systeme(async () => {
        await db.query("delete from alerts where organization_id=$1", [org]);
        await db.query("delete from notification_intentions where organization_id=$1", [org]);
        await db.query("delete from intervention_facture_reglements where organization_id=$1", [org]);
        await db.query("delete from intervention_factures where intervention_id = any($1::uuid[])", [missions]);
        await db.query("delete from artisan_numeros_factures where artisan_id=$1 and numero=lower($2)", [artisanId, numeroFacture]);
        await db.query("delete from intervention_comptes_rendus where intervention_id = any($1::uuid[])", [missions]);
        await db.query("delete from intervention_photos where intervention_id = any($1::uuid[])", [missions]);
        await db.query("delete from intervention_rdv_manques where intervention_id = any($1::uuid[])", [missions]);
        await db.query("delete from intervention_creneaux where intervention_id = any($1::uuid[])", [missions]);
        await db.query("delete from incident_evenements where organization_id=$1", [org]);
        await db.query("delete from incident_interventions where id = any($1::uuid[])", [missions]);
        await db.query("delete from incident_devis where id=$1", [devis]);
        await db.query("delete from incident_sollicitations where id=$1", [sollicitation]);
        await db.query("delete from incident_consultations where id=$1", [consultation]);
        await db.query("delete from artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisanId]);
      });
    } finally {
      const restes = artisanId ? (await db.query(`select
          (select count(*)::int from incident_interventions where organization_id=$1 and artisan_id=$2) missions,
          (select count(*)::int from intervention_factures where organization_id=$1) factures,
          (select count(*)::int from intervention_rdv_manques where organization_id=$1) manques`, [org, artisanId])).rows[0] : { missions: 0, factures: 0, manques: 0 };
      await db.end();
      // Un nettoyage incomplet fausserait les repères de l'artisan du banc pour les parcours suivants : il se dit.
      expect(restes).toEqual({ missions: 0, factures: 0, manques: 0 });
    }
  }
});
