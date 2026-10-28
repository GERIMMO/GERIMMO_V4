import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { debordementHorizontal } from "./aides";

// Audit final du 27/10, chantier « loyers — écrans et textes ».
//  LOY-21 : la synthèse d'alertes fermée ne revient pas dans un second onglet de la même journée.
//  LOY-08 : sur un rang critique, l'échéance passe le contraste AA ; le titre de la synthèse est un h2 sous le h1.
//  LOY-09 : au téléphone, les cibles de « À faire » (lien du lot, « Voir mes finances ») et de Finances font 44 px.
//  LOY-10 : les rappels nomment le locataire « Nom Prénom », comme le reste de l'application.
//  LOY-11 : le titre de l'alerte d'impayé écrit « 1 040,00 € », pas « 1040,00 € ».
//  DRT-01, DRT-12 : l'accueil du locataire dit le total dû sur ses deux échéances ; la légende de l'attestation s'accorde.
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const ORG_ALPHA = "c14c3187-1258-4e58-8822-368c6007e3fa";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

async function connecter(page: import("@playwright/test").Page, email: string) {
  await page.goto("/connexion"); await page.locator("#email").fill(email);
  await page.locator("#mot-de-passe").fill(process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

test("propriétaire : la synthèse d'alertes, lisible et fermée pour la journée ; rappels et cibles au téléphone", async ({ page, context }, info) => {
  test.setTimeout(180000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  const db = new Client({ connectionString: url }); await db.connect();
  const [bien, lot, personne, bail] = Array.from({ length: 4 }, () => randomUUID());
  const nom = `TEST Écrans ${lot.slice(0, 6)}`;
  try {
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'Fictif','Ecrans',$3)", [personne, ORG, `ecrans-${lot.slice(0, 8)}@example.invalid`]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-70,500,20,5)", [bail, ORG, lot, personne]);
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$2,date_trunc('month',public.aujourdhui_paris()-40),public.aujourdhui_paris()-40,500,20,520),
      ($1,$2,date_trunc('month',public.aujourdhui_paris()-10),public.aujourdhui_paris()-10,500,20,520)`, [ORG, bail]);
    await db.query("commit");
    // Le passage de nuit pose l'alerte critique (deux termes échus, 1 040 € dus).
    await db.query("select public.suivre_impayes_bail($1)", [bail]);
    const { rows: [alerte] } = await db.query("select titre from alerts where details->>'bail_id'=$1 and statut='ouverte'", [bail]);
    expect(alerte.titre).toContain("Fictif Ecrans");
    expect(alerte.titre).toContain("1 040,00 € dus");

    await page.setViewportSize({ width: 1440, height: 900 });
    // La page de connexion remet les deux repères à zéro : la synthèse s'ouvre à la connexion.
    await connecter(page, "proprietaire@example.com"); await page.waitForURL(/\/espace\//);
    const synthese = page.getByRole("dialog");
    await expect(synthese).toBeVisible();
    await expect(synthese.getByRole("heading", { level: 2, name: /alertes? à traiter/ })).toBeVisible();
    await expect(synthese.locator(".rang-alerte.critique").filter({ hasText: nom })).toContainText(/1[  ]040,00[  ]€ dus/);
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(TAGS).analyze()).violations.filter(v => ["color-contrast", "heading-order"].includes(v.id))).toEqual([]);
    await page.screenshot({ path: info.outputPath("synthese-1440.png") });
    await synthese.getByRole("button", { name: "Fermer", exact: true }).last().click();
    await expect(synthese).toBeHidden();
    // Second onglet, même journée : la page s'affiche sans la synthèse (LOY-21).
    const second = await context.newPage();
    await second.goto(`/espace/${ORG}`); await expect(second.locator("main").first()).toBeVisible();
    await second.waitForTimeout(800);
    await expect(second.getByRole("dialog")).toHaveCount(0);
    await second.close();
    // L'alerte critique de ce test ouvrirait la synthèse des autres specs qui se connectent au même compte : on la retire
    // dès qu'elle a servi (le rappel du loyer, lui, reste porté par les échéances).
    await db.query("delete from alerts where organization_id=$1 and details->>'bail_id'=$2", [ORG, bail]);

    // « À faire » : le locataire s'écrit « Nom Prénom » (LOY-10), et au téléphone les cibles font 44 px (LOY-09).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/espace/${ORG}/alertes`);
    const ligne = page.locator('[aria-labelledby="reception-loyers-titre"] li').filter({ hasText: nom });
    await expect(ligne).toContainText("Fictif Ecrans ·");
    await expect(ligne).not.toContainText("Ecrans Fictif");
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath("afaire-390.png"), fullPage: true });
    const petites = await page.evaluate(() => [...document.querySelectorAll('[aria-labelledby="reception-loyers-titre"] a, [aria-labelledby="reception-loyers-titre"] button, [aria-labelledby="reception-loyers-titre"] summary')]
      .map(e => ({ nom: (e.textContent ?? "").trim().slice(0, 40), h: e.getBoundingClientRect().height })).filter(x => x.h > 0 && x.h < 44));
    expect(petites, "cibles de moins de 44 px dans les rappels").toEqual([]);
    // Finances : le dépliage « Gérer les N loyers » et la liste défilable des opérations (LOY-09).
    await page.goto(`/espace/${ORG}/loyers`);
    const gerer = page.locator("summary").filter({ hasText: /^Gérer les \d+ loyers/ });
    await expect(gerer).toBeVisible();
    expect((await gerer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // La liste vit dans un dépliage fermé : on lit son attribut sans l'ouvrir.
    await expect(page.locator('ul[aria-label="Historique des opérations"]')).toHaveAttribute("tabindex", "0");
    expect(await debordementHorizontal(page)).toBe(0);
  } finally {
    // Dans une transaction : le contrôle « lot loué sans bail » se vérifie à la fin, une fois le lot retiré lui aussi.
    await db.query("rollback").catch(() => {});
    try {
      await db.query("begin");
      await db.query("delete from alerts where organization_id=$1 and details->>'bail_id'=$2", [ORG, bail]);
      await db.query("delete from appels_loyer where bail_id=$1", [bail]);
      await db.query("delete from baux where id=$1", [bail]); await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]); await db.query("delete from persons where id=$1", [personne]);
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; } finally { await db.end(); }
  }
});

test("locataire : la tâche de l'accueil dit le total dû sur deux échéances, la légende de l'attestation s'accorde", async ({ page }) => {
  await page.addInitScript(() => { try { sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1"); } catch {} });
  await connecter(page, "locataire.alpha@example.com"); await page.waitForURL(/\/locataire\//);
  await page.goto(`/locataire/${ORG_ALPHA}`);
  // Le seed : septembre partiellement réglé (300 € sur 700), octobre impayé → 1 100 € dus sur deux échéances (DRT-01).
  const tache = page.locator("li").filter({ hasText: /^Loyers de septembre et octobre 2026 à régler/ });
  await expect(tache).toBeVisible();
  await expect(tache).toContainText(/1[  ]100,00[  ]€ restent dus sur 2 échéances, dont 400,00[  ]€ de septembre 2026/);
  await page.goto(`/locataire/${ORG_ALPHA}/loyers`);
  await expect(page.getByText("Disponible dès qu’octobre 2026 et 1 autre mois seront soldés.")).toBeVisible();
  await expect(page.getByText("Loyer dû le 1er du mois")).toBeVisible();
});
