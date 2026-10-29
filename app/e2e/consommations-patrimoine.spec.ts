import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { sansSyntheseAlertes, debordementHorizontal, connecterVers } from "./aides";
import { pdfFictif } from "./pdf-fictif";
import { CONDITIONS_VERSION } from "../src/lib/editeur";

for (const largeur of [390, 768, 1440]) test(`consommations : relevé locataire, facture et décompte à ${largeur}px`, async ({ browser }, info) => {
  test.setTimeout(180000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base fictive locale requise");
  const owner = await browser.newContext({ viewport: { width: largeur, height: 900 }, isMobile: largeur < 640, hasTouch: largeur < 640, locale: "fr-FR", baseURL: process.env.E2E_BASE_URL });
  const page = await owner.newPage();
  const db = new Client({ connectionString: url }); await db.connect();
  const org = randomUUID(), bien = randomUUID(), lot = randomUUID(), bail = randomUUID();
  const compteProprietaire = randomUUID(), compteLocataire = randomUUID(), personne = randomUUID(), bailleur = randomUUID();
  const emailProprietaire = `conso-proprietaire-${org}@example.invalid`, emailLocataire = `conso-locataire-${org}@example.invalid`;
  const motDePasse = randomUUID();
  const nom = `TEST Consommations ${lot.slice(0, 8)}`;
  const tenant = await browser.newContext({ viewport: { width: largeur, height: 900 }, isMobile: largeur < 640, hasTouch: largeur < 640, locale: "fr-FR", baseURL: process.env.E2E_BASE_URL });
  const tp = await tenant.newPage();
  try {
    const dates = (await db.query("select aujourdhui_paris()::text aujourd, (aujourdhui_paris()-30)::text debut, (aujourdhui_paris()-1)::text echeance")).rows[0];
    await db.query("begin");
    // Chaque scénario possède ses comptes et son parc : rejouer les trois formats
    // ne modifie ni les lots de démonstration, ni les sessions des autres parcours.
    for (const [compte, email, prenom, document] of [
      [compteProprietaire, emailProprietaire, "Propriétaire", "conditions_clients"],
      [compteLocataire, emailLocataire, "Locataire", "regles_invites"],
    ]) {
      await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
        values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('prenom',$4::text,'nom','Test Consommations'),now(),now(),'','','','','')`, [compte, email, motDePasse, prenom]);
      await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription',$3)", [compte, CONDITIONS_VERSION, document]);
    }
    await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Tests','75001','Paris',$3)", [org, nom, emailProprietaire]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$3,'proprietaire_direct'),($2,$3,'locataire')", [compteProprietaire, compteLocataire, org]);
    await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$3,$4,'Test Consommations','Propriétaire',$6,'Personne physique','1 rue des Tests','75001','Paris'),($2,$3,$5,'Test Consommations','Locataire',$7,'Personne physique','1 rue des Tests','75001','Paris')", [bailleur, personne, org, compteProprietaire, compteLocataire, emailProprietaire, emailLocataire]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue des Tests','75001','Paris')", [bien, org, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'loue',50)", [lot, org, bien, nom]);
    await db.query("insert into detentions(lot_id,organization_id,person_id,quote_part,date_debut) values($1,$2,$3,100,$4)", [lot, org, bailleur, dates.debut]);
    await db.query("insert into baux(id,organization_id,lot_id,type,etat,loyer_hc,charges,charges_mode,date_debut,locataire_principal) values($1,$2,$3,'nu','actif',700,50,'provision',$4,$5)", [bail, org, lot, dates.debut, personne]);
    await db.query("commit");
    await info.attach("fixture-consommations", { contentType: "application/json", body: Buffer.from(JSON.stringify({ org, bien, lot, bail, compteProprietaire, compteLocataire, largeur })) });
    await page.setViewportSize({ width: largeur, height: 900 }); await sansSyntheseAlertes(page);
    const chemin = `/espace/${org}/parc/${bien}/lots/${lot}`;
    await connecterVers(page, emailProprietaire, motDePasse, chemin);
    const bloc = page.locator("section#consommations");
    await expect(bloc.getByRole("heading", { name: "Contrats & consommations" })).toBeVisible();
    await bloc.getByRole("button", { name: "Ajouter un compteur", exact: true }).click();
    const meter = bloc.locator('form:has(input[name="action"][value="compteur"])');
    await meter.getByLabel("Dernier index connu", { exact: true }).fill("100,125");
    await meter.getByLabel("Date de ce relevé", { exact: true }).fill(dates.debut);
    await meter.getByLabel("Prochaine demande", { exact: true }).fill(dates.echeance);
    await expect(meter.locator('[name="bail_referent"]')).toHaveValue(bail);
    await meter.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(bloc.getByText(/Compteur enregistré/)).toBeVisible();
    expect((await db.query("select count(*)::int n from demandes_releves d join compteurs_consommation c on c.id=d.compteur_id where c.lot_id=$1 and statut='attendue'", [lot])).rows[0].n).toBe(1);
    await sansSyntheseAlertes(tp); await connecterVers(tp, emailLocataire, motDePasse, `/locataire/${org}/releves`);
    const releve = tp.locator("section").filter({ has: tp.getByText(nom, { exact: true }) });
    await releve.getByLabel("Index affiché (m³)", { exact: true }).fill("99");
    await releve.getByRole("button", { name: "Transmettre mon relevé" }).click();
    await expect(releve.getByRole("alert")).toBeVisible();
    await expect(releve.getByLabel("Index affiché (m³)", { exact: true })).toHaveValue("99");
    await releve.getByLabel("Index affiché (m³)", { exact: true }).fill("112,125");
    await releve.getByRole("button", { name: "Transmettre mon relevé" }).click();
    await expect(releve.getByRole("button", { name: "Transmettre mon relevé" })).toHaveCount(0);
    await expect.poll(async () => (await db.query("select count(*)::int n from releves_consommation r join compteurs_consommation c on c.id=r.compteur_id where c.lot_id=$1 and r.index_releve=112.125", [lot])).rows[0].n).toBe(1);
    await tp.screenshot({ path: info.outputPath("releve-transmis.png"), fullPage: true });
    await page.reload(); await expect(bloc.getByText(/^112,125 m³ au/)).toBeVisible();
    await bloc.getByRole("button", { name: "Ajouter un contrat ou une charge" }).click();
    const contrat = bloc.locator('form:has(input[name="action"][value="contrat"])');
    await contrat.getByLabel("Fournisseur ou organisme").fill("EAU TEST");
    await contrat.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(bloc.getByText("EAU TEST", { exact: true })).toBeVisible();
    await bloc.getByRole("button", { name: "Ajouter une facture" }).click();
    const facture = bloc.locator('form:has(input[name="action"][value="facture"])');
    await facture.locator('input[type="file"]').setInputFiles({ name: "facture-test.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await facture.getByLabel("Référence de la facture").fill("EAU-TEST-01"); await facture.getByLabel("Total TTC (€)", { exact: true }).fill("100,01");
    await facture.getByLabel("Période du", { exact: true }).fill(dates.debut); await facture.getByLabel("Au", { exact: true }).fill(dates.aujourd);
    await facture.locator("summary").filter({ hasText: "Consommation, abonnement et paiement" }).click();
    await facture.getByLabel("Consommation facturée (unité du compteur)").fill("12"); await facture.getByLabel("Dont abonnement / frais fixes (€)").fill("10");
    await facture.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(facture).toHaveCount(0);
    await bloc.locator("summary").filter({ hasText: /1 facture/ }).click();
    const article = bloc.locator("article"); await expect(article.getByText(/EAU-TEST-01/)).toBeVisible();
    const tabs = page.context().pages().length; await article.getByRole("button", { name: /^Aperçu/ }).click(); await expect(page.getByRole("dialog")).toBeVisible(); expect(page.context().pages().length).toBe(tabs); await page.keyboard.press("Escape");
    await article.getByRole("button", { name: "Répartir cette facture" }).click();
    await article.locator('select[name="mode"]').selectOption("consommations"); await article.getByRole("checkbox", { name: /Cette dépense est récupérable/ }).check();
    await article.getByRole("button", { name: "Préparer le décompte" }).click();
    await expect(article.getByText(/Locataires : 100,01/)).toBeVisible();
    await article.getByRole("checkbox", { name: /J’ai vérifié les montants/ }).check(); await article.getByRole("button", { name: "Valider et conserver ce décompte" }).click();
    await expect.poll(async () => (await db.query("select count(*)::int n from repartitions_fourniture r join factures_fourniture f on f.id=r.facture_id join contrats_fourniture c on c.id=f.contrat_id where c.lot_id=$1 and r.statut='validee'", [lot])).rows[0].n).toBe(1);
    const accessibilite = await new AxeBuilder({ page }).include("#consommations").analyze();
    expect(accessibilite.violations.filter(v => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    expect(await debordementHorizontal(page)).toBe(0); expect(await debordementHorizontal(tp)).toBe(0);
    await article.getByRole("button", { name: "Indiquer le paiement" }).click();
    const paiement = article.locator('form:has(input[name="action"][value="facture_payee"])');
    await paiement.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(article.getByText(/^Payée le/)).toBeVisible();
    await expect.poll(async () => (await db.query("select count(*)::int n from paiements_factures_fourniture p join factures_fourniture f on f.id=p.facture_id join contrats_fourniture c on c.id=f.contrat_id where c.lot_id=$1", [lot])).rows[0].n).toBe(1);
    await page.screenshot({ path: info.outputPath("facture-repartie.png"), fullPage: true });
    await bloc.screenshot({ path: info.outputPath("suivi-consommations.png") });
    await article.getByRole("link", { name: /Préparer la régularisation de/ }).click();
    const regularisation = page.locator("#regularisation-fournitures");
    await expect(regularisation.getByRole("button", { name: "Préparer depuis les factures" })).toBeVisible();
    await regularisation.locator('[name="annee"]').fill(dates.aujourd.slice(0, 4));
    await regularisation.getByRole("button", { name: "Préparer depuis les factures" }).click();
    await expect(regularisation.getByText(/Brouillon à vérifier/)).toBeVisible();
    await expect(regularisation.getByText("Provisions appelées", { exact: true })).toBeVisible();
    await regularisation.getByRole("checkbox", { name: /toutes les charges de cet exercice/ }).check();
    await regularisation.getByRole("checkbox", { name: /L’année n’est pas terminée/ }).check();
    await regularisation.getByRole("button", { name: "Valider la régularisation et créer le décompte" }).click();
    await expect(regularisation.getByRole("status")).toContainText("Régularisation enregistrée", { timeout: 30000 });
    await expect(regularisation.getByText(/Régularisation validée/)).toBeVisible();
    await expect(regularisation.getByText(/Brouillon à vérifier/)).toHaveCount(0);
    await expect(regularisation.getByRole("button", { name: /Recalculer/ })).toHaveCount(0);
    await expect(regularisation.getByRole("button", { name: "Valider la régularisation et créer le décompte" })).toHaveCount(0);
    await expect(regularisation.getByText("Charges réelles", { exact: true })).toBeVisible();
    const reg = (await db.query("select justificatif_document from regularisations_charges where bail_id=$1", [bail])).rows;
    expect(reg).toHaveLength(1); expect(reg[0].justificatif_document).toBeTruthy();
    await regularisation.screenshot({ path: info.outputPath("regularisation-annuelle.png") });
    await regularisation.locator('[name="annee"]').fill(String(Number(dates.aujourd.slice(0, 4)) - 1));
    await expect(regularisation.getByRole("button", { name: "Préparer depuis les factures" })).toBeVisible();
    await expect(regularisation.getByText(/Régularisation validée/)).toHaveCount(0);
    await regularisation.locator('[name="annee"]').fill(dates.aujourd.slice(0, 4));
    await expect(regularisation.getByRole("status")).toContainText("Régularisation enregistrée");
    await expect(regularisation.getByRole("button", { name: /Recalculer/ })).toHaveCount(0);
    await tp.goto(`/locataire/${org}/documents`);
    await tp.getByRole("tab", { name: "Mes fichiers", exact: true }).click();
    await expect(tp.getByText(/Décompte annuel de charges/).first()).toBeVisible();
    const manifeste = await tp.request.get(`/locataire/${org}/documents/${reg[0].justificatif_document}/fichier?apercu=integre`);
    expect(manifeste.status()).toBe(200);
    const lien = await manifeste.json();
    expect(lien.mime).toBe("application/pdf");
    expect(new URL(lien.url).origin).toBe(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin);
    const fichierLocataire = await tp.request.get(lien.url);
    expect(fichierLocataire.status()).toBe(200);
    expect(fichierLocataire.headers()["content-type"]).toContain("application/pdf");
    expect((await fichierLocataire.body()).subarray(0, 5).toString()).toBe("%PDF-");
  } finally {
    await db.query("rollback");
    await tenant.close(); await owner.close();
    // Les preuves restent dans cette organisation fictive propre au scénario.
    // Aucun lot ni compte du parc de démonstration partagé n’a été utilisé.
    // Aucune facture signée ni commande externe n'a été créée.
    await db.end();
  }
});
