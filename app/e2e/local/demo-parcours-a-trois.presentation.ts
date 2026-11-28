import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { baseEspace } from "../../src/lib/racine-espace";
import { sansSyntheseAlertes } from "../aides";
import { pdfFictif } from "../pdf-fictif";
import { jouerLeSignalementEtLeRendezVous } from "./demo-signalement-et-rendez-vous";
import { imageFuite } from "./demo-image-fuite";
import { locationIntervention } from "./location-intervention";

test.use({ storageState: "e2e/.auth/artisan.json" });

test("de la fuite à l’aide à la 2044", async ({ browser, page }, info) => {
  const db = new Client({ connectionString: process.env.SUPALOCAL_DB });
  await db.connect();
  const capture = (nom: string) => async (vue: Page, repere?: Locator) => {
    if (repere) {
      await expect(repere).toBeVisible();
      await repere.evaluate(element => element.scrollIntoView({ block: "center" }));
    }
    await vue.screenshot({ path: info.outputPath(nom + ".png"), animations: "disabled", caret: "hide", style: "nextjs-portal { display: none !important; }" });
  };
  const gestion = await browser.newContext({ storageState: "e2e/.auth/proprietaire.json", viewport: page.viewportSize() });
  try {
    const { rows: [artisan] } = await db.query(
      "select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'",
    );
    const lot = await locationIntervention(db, artisan.id, false, true);
    const racine = baseEspace(lot.organization_id, true);
    const suffixe = randomUUID().slice(0, 8);
    const description = `De l’eau coule sous l’évier de la cuisine. Réf. ${suffixe}`;
    await sansSyntheseAlertes(page);
    const { incidentId, mission } = await jouerLeSignalementEtLeRendezVous(
      db, browser, page, lot.organization_id, artisan.id, { ...lot, description }, {
        signalement: vue => capture("01-signalement")(vue, vue.getByText(/1 photo jointe/)),
        alerte: async (vue, incident) => {
          const site = new URL(process.env.E2E_BASE_URL!);
          const stockage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
          // En production le stockage est en HTTPS. Sur le banc HTTP, relayer
          // uniquement l’image signée par la route authentifiée de l’application.
          await vue.route(url => url.origin === site.origin && url.pathname.startsWith(racine + "/documents/")
            && url.pathname.endsWith("/fichier") && url.searchParams.get("apercu") === "image", async route => {
            const apercu = await route.fetch({ maxRedirects: 0 });
            const adresse = apercu.headers().location;
            if (apercu.status() === 303 && adresse) {
              const cible = new URL(adresse, route.request().url());
              if (cible.origin === stockage.origin && cible.pathname.startsWith("/storage/v1/object/sign/")) {
                const image = await vue.request.get(cible.href, { maxRedirects: 0 });
                await route.fulfill({ response: image });
                return;
              }
            }
            await route.fulfill({ response: apercu });
          });
          await vue.goto(`${racine}/alertes`);
          const lien = vue.locator(`a[href$="incidents?sel=${incident}"]:visible`).first();
          await capture("02-alerte")(vue, lien);
          await lien.click();
          const signalement = vue.locator("summary").filter({ hasText: "Signalement, contacts et pièces jointes" });
          await expect(signalement).toBeVisible();
          if (await signalement.locator("..").getAttribute("open") === null) await signalement.click();
          const vignette = vue.getByRole("img", { name: /^Photo — INC-/ });
          await expect(vignette).toBeVisible();
          await expect.poll(() => vignette.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
          await expect(vue.getByText(description, { exact: false }).filter({ visible: true }).first()).toBeVisible();
          await capture("02b-dossier")(vue, vignette);
        },
        devis: vue => capture("03-devis")(vue, vue.getByRole("link", { name: "Télécharger le détail du devis (PDF)" })),
        creneaux: vue => capture("04-creneaux")(vue, vue.locator("fieldset").first()),
        rendezVous: vue => capture("05-rendez-vous")(vue, vue.getByRole("region", { name: "Rendez-vous confirmé" })),
      },
    );

    await page.goto(`/artisan/missions/${mission}`);
    await page.getByRole("button", { name: "Je démarre l'intervention", exact: true }).click();
    await expect.poll(async () => (await db.query(
      "select statut from incident_interventions where id=$1", [mission],
    )).rows[0].statut).toBe("en_cours");
    await page.goto(`/artisan/missions/${mission}/compte-rendu`);
    await page.waitForLoadState("networkidle");
    await page.locator("form").filter({ has: page.locator('[name="moment"][value="apres"]') })
      .locator('input[type="file"]').setInputFiles({ name: "travaux-fictifs.png", mimeType: "image/png", buffer: await imageFuite(page, suffixe, true) });
    await expect(page.getByText("Photo envoyée.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Continuer — le bilan" }).click();
    const bilan = "Joint remplacé et écoulement vérifié. La fuite est arrêtée.";
    await page.getByLabel("Ce que vous avez fait").fill(bilan);
    await capture("06-compte-rendu")(page, page.getByLabel("Ce que vous avez fait"));
    await page.getByRole("button", { name: "Terminer l'intervention", exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get("termine") === "1");
    await page.getByRole("link", { name: "Déposer ma facture" }).click();
    const numero = `DEMO-${suffixe.toUpperCase()}`;
    await page.getByLabel("Numéro de la facture").fill(numero);
    await page.getByLabel("Montant TTC (€)").fill("100,00");
    await page.getByLabel("Votre facture", { exact: true }).setInputFiles({
      name: numero + ".pdf", mimeType: "application/pdf", buffer: pdfFictif(),
    });
    await page.getByRole("button", { name: "Déposer ma facture", exact: true }).click();
    await expect(page).toHaveURL(/\/artisan\/facturation\?facture=/);

    const bailleur = await gestion.newPage();
    await sansSyntheseAlertes(bailleur);
    await bailleur.goto(`${racine}/incidents/${incidentId}`);
    await bailleur.getByRole("link", { name: "Suivi", exact: true }).click();
    await expect(bailleur.getByText(`« ${bilan} »`, { exact: true })).toBeVisible();
    await bailleur.getByRole("link", { name: "Devis et facture", exact: true }).click();
    const titre = bailleur.getByRole("heading", { name: `Facture ${numero} — 100,00 € TTC` });
    await expect(titre).toBeVisible();
    const justificatif = bailleur.getByRole("link", { name: "Consulter la facture avant de décider" });
    expect((await bailleur.request.get((await justificatif.getAttribute("href"))!)).ok()).toBe(true);
    await bailleur.getByLabel("Résultat du contrôle de la facture").fill("Facture fictive et compte rendu vérifiés.");
    await bailleur.getByRole("button", { name: "Valider cette facture" }).click();
    await expect(bailleur.getByLabel("Montant réglé (€)")).toHaveValue("100,00");
    await capture("07-facture-validee")(bailleur, titre);
    const etat = async () => (await db.query(
      "select validee_le is not null as validee, reglee_le is not null as reglee from intervention_factures where intervention_id=$1", [mission],
    )).rows[0];
    expect(await etat()).toEqual({ validee: true, reglee: false });
    await bailleur.getByLabel("Référence (facultative)").fill("DÉMO — règlement simulé hors Gerimmo");
    await bailleur.getByRole("button", { name: "Enregistrer le règlement" }).click();
    await expect.poll(etat).toEqual({ validee: true, reglee: true });
    const { rows: [bien] } = await db.query(
      "select l.bien_id, p.nom from lots l join detentions d on d.lot_id=l.id join persons p on p.id=d.person_id where l.id=$1",
      [lot.lot_id],
    );
    const annee = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).slice(0, 4);
    await bailleur.goto(`${racine}/comptabilite/fiscal?annee=${annee}&bien=${bien.bien_id}`);
    const profil = bailleur.locator("details").filter({ has: bailleur.locator("summary").filter({ hasText: bien.nom }) });
    await expect(profil.locator("summary")).toBeVisible();
    if (await profil.getAttribute("open") === null) await profil.locator("summary").click();
    await profil.locator('[name="location_nue"]').selectOption("reel");
    await profil.locator('[name="location_meublee"]').selectOption("non_concerne");
    await profil.locator('[name="justification"]').fill("Profil fictif de la démonstration.");
    await profil.locator('[name="confirme"]').check();
    await profil.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const exercice = bailleur.locator("details").filter({ has: bailleur.locator("summary").filter({ hasText: `Maison des Amandiers — exercice ${annee}` }) });
    if (!/confirmé v/.test(await exercice.locator("summary").innerText())) {
      await exercice.locator("summary").click();
      await exercice.locator('[name="justification"]').fill("Location nue fictive, détention de 100 % pour l’exemple.");
      await exercice.locator('[name="regularisation230"]').fill("0");
      await exercice.locator('[name="justification230"]').fill("Aucune provision dans ce scénario fictif.");
      await exercice.locator('[name="confirme"]').check();
      await exercice.getByRole("button", { name: "Conserver l’exercice" }).click();
      await expect(exercice.locator("summary")).toContainText("confirmé v");
    }
    const piece = bailleur.locator("details").filter({ has: bailleur.locator("summary").filter({ hasText: /travaux · 100\.00 € — à qualifier/i }) });
    await piece.locator("summary").click();
    await piece.locator('select[name="nature"]').selectOption("deductible");
    await piece.locator('select[name="rubrique"]').selectOption("224");
    await piece.getByLabel("Justification et référence de pièce").fill(`Exemple fictif · facture ${numero} · remplacement du joint.`);
    await piece.locator('[name="confirme"]').check();
    await piece.getByRole("button", { name: "Conserver cette qualification" }).click();
    const qualification = async () => (await db.query(`select q.rubrique from fiscal_qualifications_ecritures q
      join intervention_facture_reglements r on r.ecriture_id=q.ecriture_id
      join intervention_factures f on f.id=r.facture_id where f.intervention_id=$1`, [mission])).rows;
    await expect.poll(qualification).toEqual([{ rubrique: "224" }]);
    await bailleur.reload();
    const libelle = "Réparation, entretien et amélioration admissibles";
    const ligne = bailleur.getByRole("listitem").filter({ hasText: libelle })
      .or(bailleur.getByRole("row").filter({ hasText: libelle }));
    await expect(ligne).toContainText("100,00");
    await capture("08-aide-2044")(bailleur, ligne);
  } finally {
    await gestion.close();
    await db.end();
  }
});
