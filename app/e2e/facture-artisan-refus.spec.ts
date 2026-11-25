import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// FACTURE D'ARTISAN ERRONÉE : REFUS MOTIVÉ, PUIS FACTURE CORRIGÉE (audit palier 1 du 22/11/2026, P1-03).
//
// Le défaut : une intervention ne portait qu'une facture, que le gestionnaire ne pouvait que valider. Ici, de bout en
// bout dans le navigateur : l'artisan termine sa mission et dépose une facture ; le gestionnaire la refuse en écrivant
// ce qui est à corriger ; l'artisan lit ce motif, dépose une facture corrigée ; le gestionnaire retrouve les deux —
// la corrigée en tête, à valider, la refusée dessous, intacte et sans geste — et valide la corrigée.
//
// Mission fictive créée pour l'essai (acceptée, sans devis) ; elle reste dans la base jetable du banc, comme celles du
// parcours « fin de mission ». Aucun e-mail, aucun paiement.

test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 10_000 });

test("facture d'artisan erronée : le gestionnaire la refuse avec un motif, l'artisan en dépose une autre", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const incident = randomUUID(), mission = randomUUID(), marque = randomUUID().slice(0, 8);
  const premiere = `FA-${marque}-A`, seconde = `FA-${marque}-B`;
  const MOTIF = "Le montant ne correspond pas à ce qui était convenu : merci de corriger la ligne de main-d’œuvre.";
  const bilan = "Joint du siphon remplacé. Essai d’écoulement effectué, aucune fuite constatée.";
  const gestion = await browser.newContext({ storageState: "e2e/.auth/admin.json" });
  const factures = async () => (await db.query(
    "select id, numero, montant_ttc_cents::int montant, document_id, refusee_le is not null refusee, refus_motif, validee_le is not null validee from intervention_factures where intervention_id=$1 order by deposee_le", [mission])).rows;
  try {
    // ── Décor : une mission acceptée chez l'agence fictive, pour l'artisan fictif.
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    const { rows: [lot] } = await db.query("select i.organization_id,i.lot_id from incidents i join organizations o on o.id=i.organization_id where o.name='Agence Alpha' and i.id in (select incident_id from incident_interventions where artisan_id=$1) order by i.id limit 1", [a.id]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation','ESSAI refus de facture fictif','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')", [incident, lot.organization_id, lot.lot_id, `INC-${marque}`]);
    await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())", [mission, lot.organization_id, incident, a.id]);

    // ── L'artisan fait son intervention : démarrage, photo, bilan (les mêmes gestes que le parcours « fin de mission »).
    await sansSyntheseAlertes(page);
    await page.goto(`/artisan/missions/${mission}`);
    await page.getByRole("button", { name: "Je démarre l'intervention", exact: true }).click();
    await expect.poll(async () => (await db.query("select statut from incident_interventions where id=$1", [mission])).rows[0].statut).toBe("en_cours");
    await page.goto(`/artisan/missions/${mission}/compte-rendu`);
    await page.waitForLoadState("networkidle"); // Les champs SSR précèdent leur gestionnaire onChange.
    const photo = Buffer.from(await page.evaluate((id) => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#e3edf0"; ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#17324f"; ctx.font = "16px sans-serif"; ctx.fillText("ESSAI — travail réalisé", 16, 50); ctx.font = "10px sans-serif"; ctx.fillText(id, 16, 90);
      return canvas.toDataURL("image/png").split(",")[1];
    }, mission), "base64");
    await page.locator("form").filter({ has: page.locator('[name="moment"][value="apres"]') }).locator("input[type=file]").setInputFiles({ name: "travail-fictif.png", mimeType: "image/png", buffer: photo });
    await expect(page.getByText("Photo envoyée.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Continuer — le bilan", exact: true }).click();
    await page.getByLabel("Ce que vous avez fait", { exact: true }).fill(bilan);
    await page.getByRole("button", { name: "Terminer l'intervention", exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === `/artisan/missions/${mission}` && url.searchParams.get("termine") === "1");

    // ── Première facture : déposée, à contrôler.
    await page.getByRole("link", { name: "Déposer ma facture", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Déposer ma facture", exact: true })).toBeVisible();
    await expect(page.locator("[data-facture-refusee]")).toHaveCount(0);
    await page.getByLabel("Numéro de la facture", { exact: true }).fill(premiere);
    await page.getByLabel("Montant TTC (€)", { exact: true }).fill("100,00");
    await page.getByLabel("Votre facture", { exact: true }).setInputFiles({ name: "facture-fictive.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await page.getByRole("button", { name: "Déposer ma facture", exact: true }).click();
    await expect(page).toHaveURL(/\/artisan\/facturation\?facture=[0-9a-f-]{36}/);
    const [deposee] = await factures();
    expect(deposee).toMatchObject({ numero: premiere, montant: 10000, refusee: false, validee: false });

    // ── Le gestionnaire la refuse, en écrivant ce qui est à corriger.
    const gerant = await gestion.newPage();
    await sansSyntheseAlertes(gerant);
    await gerant.goto(`/agence/${lot.organization_id}/incidents/${incident}`);
    await expect(gerant.getByRole("heading", { name: `Facture ${premiere} — 100,00 € TTC`, exact: true })).toBeVisible();
    await expect(gerant.getByRole("button", { name: "Valider cette facture" })).toBeVisible();
    const refus = gerant.locator("[data-refus-facture]");
    // Replié : le geste courant reste « valider ».
    await expect(refus.getByRole("button", { name: "Refuser et demander une correction" })).toBeHidden();
    await refus.locator("summary").click();
    await refus.getByLabel("Ce que l’artisan doit corriger").fill(MOTIF);
    await refus.getByRole("button", { name: "Refuser et demander une correction" }).click();
    await expect.poll(async () => (await factures())[0].refusee, { timeout: 15_000 }).toBe(true);
    const [refusee] = await factures();
    // Rien de la facture n'a changé : même numéro, même montant, même pièce.
    expect(refusee).toMatchObject({ id: deposee.id, numero: premiere, montant: 10000, document_id: deposee.document_id, refus_motif: MOTIF, validee: false });
    const marqueRefus = gerant.locator("[data-facture-refusee]");
    await expect(marqueRefus).toBeVisible();
    await expect(marqueRefus).toContainText(`« ${MOTIF} »`);
    await expect(marqueRefus).toContainText("Elle reste au dossier, sans être modifiée ; l’artisan peut déposer une autre facture.");
    await expect(gerant.getByRole("button", { name: "Valider cette facture" })).toHaveCount(0);
    await expect(gerant.locator("[data-refus-facture]")).toHaveCount(0);
    await expect(gerant.getByRole("link", { name: "Consulter la facture refusée", exact: true })).toBeVisible();
    // Le fil du dossier garde la trace, avec le motif ; l'alerte « facture à contrôler » est fermée.
    await expect(gerant.locator("body")).toContainText("Facture refusée, à corriger par l'artisan");
    await expect(gerant.locator("body")).toContainText(`n° ${premiere} — « ${MOTIF} »`);
    expect((await db.query("select statut::text, closed_action from alerts where type='facture_artisan_a_valider' and details->>'facture_id'=$1", [deposee.id])).rows)
      .toEqual([{ statut: "fermee", closed_action: "Facture refusée, à corriger par l’artisan" }]);
    expect(await debordementHorizontal(gerant)).toBeLessThanOrEqual(1);
    await gerant.screenshot({ path: info.outputPath("gestionnaire-facture-refusee.png"), fullPage: true });

    // ── L'artisan lit le motif : sur sa mission, dans sa facturation, puis au moment de corriger.
    await page.goto(`/artisan/missions/${mission}`);
    const avis = page.locator("[data-facture-refusee]");
    // Visible, pas seulement présent : la page arrive en flux, son contenu d'abord caché derrière « Chargement… ».
    await expect(avis).toBeVisible();
    await expect(avis).toContainText(`Votre facture n° ${premiere}`);
    await expect(avis).toContainText(`Ce qu’il vous demande de corriger : « ${MOTIF} »`);
    await expect(page.getByText("Refusée : à corriger", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Déposer une facture corrigée", exact: true })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("artisan-facture-refusee.png"), fullPage: true });
    await page.goto("/artisan/facturation");
    await expect(page.locator("main")).toContainText(`Facture n° ${premiere} refusée par votre client : « ${MOTIF} »`);
    await page.goto(`/artisan/missions/${mission}`);
    await page.getByRole("link", { name: "Déposer une facture corrigée", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Déposer une facture corrigée", exact: true })).toBeVisible();
    await expect(page.locator("[data-facture-refusee]")).toBeVisible();
    await expect(page.locator("[data-facture-refusee]")).toContainText(`« ${MOTIF} »`);

    // ── Facture corrigée : un autre numéro, un autre montant, une autre pièce.
    await page.getByLabel("Numéro de la facture", { exact: true }).fill(seconde);
    await page.getByLabel("Montant TTC (€)", { exact: true }).fill("90,00");
    await page.getByLabel("Votre facture", { exact: true }).setInputFiles({ name: "facture-corrigee-fictive.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await page.getByRole("button", { name: "Déposer ma facture", exact: true }).click();
    await expect(page).toHaveURL(/\/artisan\/facturation\?facture=[0-9a-f-]{36}/);
    const apres = await factures();
    expect(apres).toHaveLength(2);
    expect(apres[0]).toEqual(refusee);
    expect(apres[1]).toMatchObject({ numero: seconde, montant: 9000, refusee: false, validee: false });
    expect(apres[1].document_id).not.toBe(refusee.document_id);
    // Une fois remplacée, la mission ne parle plus du refus : la facture en vigueur est déposée.
    await page.goto(`/artisan/missions/${mission}`);
    await expect(page.locator("[data-facture-refusee]")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Déposer une facture corrigée", exact: true })).toHaveCount(0);

    // ── Le gestionnaire retrouve les deux : la corrigée en tête, à valider ; la refusée dessous, sans geste.
    await gerant.reload();
    const sections = gerant.locator("section.incident-facture");
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0).getByRole("heading", { name: `Facture ${seconde} — 90,00 € TTC`, exact: true })).toBeVisible();
    await expect(sections.nth(0).getByRole("button", { name: "Valider cette facture" })).toBeVisible();
    await expect(sections.nth(1).getByRole("heading", { name: `Facture ${premiere} — 100,00 € TTC`, exact: true })).toBeVisible();
    await expect(sections.nth(1).locator("[data-facture-refusee]")).toContainText(`« ${MOTIF} »`);
    await expect(sections.nth(1).getByRole("button")).toHaveCount(0);
    expect(await debordementHorizontal(gerant)).toBeLessThanOrEqual(1);
    await gerant.screenshot({ path: info.outputPath("gestionnaire-deux-factures.png"), fullPage: true });
    await sections.nth(0).getByLabel("Résultat du contrôle de la facture").fill("Facture corrigée conforme : pièce et montant vérifiés.");
    await sections.nth(0).getByRole("button", { name: "Valider cette facture" }).click();
    await expect.poll(async () => (await factures())[1].validee, { timeout: 15_000 }).toBe(true);
    // Une facture validée ne se refuse plus ; la refusée, elle, n'a pas bougé.
    await expect(gerant.locator("[data-refus-facture]")).toHaveCount(0);
    expect((await factures())[0]).toEqual(refusee);
  } finally {
    await gestion.close();
    await db.end();
  }
});
