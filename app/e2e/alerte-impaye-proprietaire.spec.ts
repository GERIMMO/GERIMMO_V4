import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";

// Audit de la PR #264 (27/10) : un impayé de deux mois se lit sur sa ligne (LAT-03), la confirmation des deux
// réceptions ferme l'alerte d'impayé sans attendre la nuit (LAT-01), et la carte « À vérifier » passe axe avec
// wcag21a (TRV-06), en lien (demandes courantes) comme en bouton (loyers à confirmer).
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const region = (page: Page) => page.getByRole("region", { name: "Votre patrimoine en bref" });
// Le bouton de la carte est nommé par son texte visible : actions prioritaires, loyers à confirmer ou « À vérifier ».
const carte = (page: Page) => region(page).getByRole("button", { name: /^(?:\d+ actions? prioritaires?|\d+ loyers? à confirmer|À vérifier) / });

for (const largeur of [390, 1440]) test(`impayé de deux mois à ${largeur}px : total sur la ligne, alerte fermée à la réception complète`, async ({ page }, info) => {
  test.setTimeout(180000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  const db = new Client({ connectionString: url }); await db.connect();
  const [bien, lot, personne, bail] = Array.from({ length: 4 }, () => randomUUID());
  const nom = `TEST Impayé ${largeur} ${lot.slice(0, 6)}`;
  const prenom = `Impaye${largeur}`;
  try {
    await page.setViewportSize({ width: largeur, height: 950 }); await sansSyntheseAlertes(page);
    await page.goto("/connexion"); await page.locator("#email").fill("proprietaire@example.com");
    await page.locator("#mot-de-passe").fill(process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click(); await page.waitForURL(/\/espace\//);
    // TRV-06 : la carte telle que le compte la présente, avec l'étiquette wcag21a (label-content-name-mismatch).
    await expect(region(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).include('[aria-label="Votre patrimoine en bref"]').withTags(TAGS).analyze()).violations).toEqual([]);

    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'Fictif',$3,'locataire@example.invalid')", [personne, ORG, prenom]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-70,500,20,5)", [bail, ORG, lot, personne]);
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$2,date_trunc('month',public.aujourdhui_paris()-40),public.aujourdhui_paris()-40,500,20,520),
      ($1,$2,date_trunc('month',public.aujourdhui_paris()-10),public.aujourdhui_paris()-10,500,20,520)`, [ORG, bail]);
    await db.query("commit");
    // Le passage de nuit pose l'alerte critique (deux termes échus).
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    const alertes = async () => (await db.query("select statut::text, criticite::text, closed_action from alerts where details->>'bail_id'=$1", [bail])).rows;
    expect(await alertes()).toMatchObject([{ statut: "ouverte", criticite: "critique" }]);

    await page.reload();
    // TRV-06 : la même carte, devenue bouton « loyers à confirmer », garde son texte visible pour nom accessible.
    await expect(carte(page)).toHaveAttribute("aria-haspopup", "dialog");
    await expect(carte(page)).toHaveAccessibleName((await carte(page).innerText()).replace(/\s+/g, " ").trim());
    expect((await new AxeBuilder({ page }).include('[aria-label="Votre patrimoine en bref"]').withTags(TAGS).analyze()).violations).toEqual([]);
    await carte(page).click();
    const fenetre = page.getByRole("dialog"); await expect(fenetre).toBeVisible();
    const ligne = fenetre.locator("li").filter({ hasText: nom });
    await expect(ligne).toContainText("Prioritaire");
    await expect(ligne).toContainText("1 autre mois à recevoir sur ce bail");
    await expect(ligne).toContainText(/1[\s ]040,00\s€ au total/);
    await expect(ligne.getByRole("link", { name: nom, exact: true })).toHaveAttribute("href", `/espace/${ORG}/baux/${bail}#loyers`);
    expect(await debordementHorizontal(page)).toBe(0);
    expect((await new AxeBuilder({ page }).include('[aria-labelledby="reception-loyers-titre"]').withTags(TAGS).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`impaye-deux-mois-${largeur}.png`) });

    for (const mois of [1, 2]) {
      await ligne.getByRole("button", { name: "J’ai reçu le loyer", exact: true }).click();
      await ligne.getByRole("button", { name: "Confirmer la réception", exact: true }).click();
      await expect(fenetre.getByRole("status").filter({ hasText: "520,00" }).first()).toBeVisible();
      if (mois === 1) await expect(ligne).not.toContainText("Prioritaire");
    }
    await expect(ligne).toHaveCount(0);
    // LAT-01 : l'alerte est fermée par la réception, une seule, sans attendre la tâche de nuit.
    expect(await alertes()).toEqual([{ statut: "fermee", criticite: "normale", closed_action: "Impayé soldé" }]);
    await page.reload();
    await expect(region(page)).toBeVisible();
    await expect(region(page)).not.toContainText(`Fictif ${prenom}`);
    // Le bail garde ses tâches (état des lieux, DPE), mais plus aucun impayé.
    await expect(page.locator("#taches-proprietaire")).toContainText(nom);
    await expect(page.locator("#taches-proprietaire")).not.toContainText("Loyer impayé");
  } finally {
    await db.query("rollback").catch(() => {});
    try {
      await db.query("begin");
      await db.query("delete from alerts where organization_id=$1 and details->>'bail_id'=$2", [ORG, bail]);
      await db.query("delete from commandes_encaissement_reste where bail_id=$1", [bail]);
      await db.query("delete from fiscal_encaissements_composantes where organization_id=$1 and ecriture_id in (select id from ecritures where bail_id=$2)", [ORG, bail]);
      await db.query("delete from ecritures where bail_id=$1", [bail]); await db.query("delete from encaissements where bail_id=$1", [bail]);
      // Le retrait des encaissements rouvre l'alerte fermée d'elle-même : on la retire à nouveau.
      await db.query("delete from alerts where organization_id=$1 and details->>'bail_id'=$2", [ORG, bail]);
      await db.query("delete from quittances where bail_id=$1", [bail]); await db.query("delete from appels_loyer where bail_id=$1", [bail]);
      await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2", [ORG, bail]);
      await db.query("delete from baux where id=$1", [bail]); await db.query("delete from lots where id=$1", [lot]); await db.query("delete from biens where id=$1", [bien]); await db.query("delete from persons where id=$1", [personne]);
      await db.query("delete from audit_log where organization_id=$1 and (details->>'bail_id'=$2 or details->>'lot_id'=$3 or details->>'bien_id'=$4)", [ORG, bail, lot, bien]);
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; } finally { await db.end(); }
  }
});
