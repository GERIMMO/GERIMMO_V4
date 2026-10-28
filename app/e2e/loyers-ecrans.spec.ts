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

// Relecture du chantier (LOY-08) : sur la liste « Alertes » de l'agence, la conséquence « Dépassée de N j — elle remonte au
// responsable… » d'un rang critique passait elle aussi en rouge vif sur fond rouge pâle (4,1:1). Une alerte critique
// fictive, échue depuis quarante jours, est posée le temps du test.
for (const largeur of [390, 1440]) test(`agence : rang critique de la liste des alertes lisible (AA) à ${largeur}px`, async ({ page }, info) => {
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  const db = new Client({ connectionString: url }); await db.connect();
  const id = randomUUID();
  try {
    await db.query(`insert into public.alerts(id,organization_id,type,titre,criticite,assigned_all,echeance)
      values($1,$2,'manuelle','TEST Écrans — alerte critique échue','critique',true,public.aujourdhui_paris()-40)`, [id, ORG_ALPHA]);
    await page.setViewportSize({ width: largeur, height: largeur < 500 ? 844 : 900 });
    await page.addInitScript(() => { try { sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1"); } catch {} });
    await connecter(page, "admin.alpha@example.com"); await page.waitForURL(/\/agence\//);
    await page.goto(`/agence/${ORG_ALPHA}/alertes`);
    const rang = page.locator(".rang-alerte.critique").filter({ hasText: "TEST Écrans — alerte critique échue" });
    await expect(rang).toBeVisible();
    await expect(rang.locator(".consequence-alerte")).toContainText("Dépassée de 40 j");
    const violations = (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.filter(v => v.id === "color-contrast");
    expect(violations).toEqual([]);
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath(`agence-alertes-critique-${largeur}.png`) });
  } finally {
    await db.query("delete from public.alerts where id=$1", [id]);
    await db.end();
  }
});

// Relectures de LOY-07, page Loyers de l'agence : un terme à échoir ne se présente plus « à relancer », qu'il soit sans
// règlement (« attendu ») ou déjà réglé en partie (acompte, APL : « partiel ») ; l'exigibilité suit la date d'échéance. Le
// seed : septembre partiellement réglé (300 € reçus, 400 € restent), octobre impayé. On repousse l'échéance d'octobre
// (terme à échoir) ; la variante « acompte » ramène aussi septembre à 100 € : les 300 € reçus soldent septembre et laissent
// 200 € d'acompte sur octobre. Tout est remis en place à la fin.
for (const acompte of [false, true]) for (const largeur of [390, 1440]) test(`agence : la page Loyers ne relance que l'exigible, terme à échoir à part${acompte ? ", acompte" : ""} (${largeur}px)`, async ({ page }, info) => {
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  const db = new Client({ connectionString: url }); await db.connect();
  const appels = (periode: string) => db.query(`select a.id, a.date_echeance::text date_echeance, a.montant_du::text montant_du from public.appels_loyer a
    join public.baux b on b.id=a.bail_id join public.persons p on p.id=b.locataire_principal
    where p.email='locataire.alpha@example.com' and a.organization_id=$1 and a.periode=${periode}`, [ORG_ALPHA]);
  const { rows: [appel] } = await appels("date_trunc('month',public.aujourdhui_paris())::date");
  const { rows: [precedent] } = await appels("(date_trunc('month',public.aujourdhui_paris())-interval '1 month')::date");
  test.skip(!appel || !precedent, "Échéances du locataire alpha absentes du seed");
  try {
    await db.query("update public.appels_loyer set date_echeance=public.aujourdhui_paris()+8 where id=$1", [appel.id]);
    if (acompte) await db.query("update public.appels_loyer set montant_du=100 where id=$1", [precedent.id]);
    await page.setViewportSize({ width: largeur, height: largeur < 500 ? 844 : 900 });
    await page.addInitScript(() => { try { sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1"); } catch {} });
    await connecter(page, "admin.alpha@example.com"); await page.waitForURL(/\/agence\//);
    await page.goto(`/agence/${ORG_ALPHA}/loyers`);
    const tuile = page.locator(".grille-kpi .kpi").filter({ hasText: "Exigible à relancer" });
    const ligne = page.locator("a").filter({ hasText: "Relancer sur le bail" });
    if (acompte) {
      // Terme « partiel » à échoir, sans dette : rien n'est exigible, la tuile est verte, aucun lien de relance.
      await expect(tuile).toContainText(/0,00[  ]€/);
      await expect(tuile).toContainText("rien à relancer");
      await expect(tuile).toContainText(/500,00[  ]€ à échoir, non compris/);
      await expect(tuile).toHaveClass(/vert/);
      await expect(ligne).toHaveCount(0);
      await expect(page.getByText(/Rien d’exigible à relancer sur [a-zé]+ \d{4} : 500,00[  ]€ restent à échoir\./)).toBeVisible();
    } else {
      // Le chiffre principal est l'exigible : la dette antérieure de 400 €, en rouge ; le terme reste à échoir.
      await expect(tuile).toContainText(/400,00[  ]€/);
      await expect(tuile).toContainText(/1 locataire à relancer/);
      await expect(tuile).toHaveClass(/rouge/);
      await expect(tuile).toContainText(/dont 400,00[  ]€ des mois précédents/);
      await expect(tuile).toContainText(/700,00[  ]€ à échoir, non compris/);
      await expect(ligne).toHaveCount(1);
      await expect(ligne).toContainText(/dette antérieure 400,00[  ]€ · 700,00[  ]€ à échoir/);
      await expect(ligne).not.toContainText("reste 700");
      // Le bouton d'encaissement dit ce que l'imputation au plus ancien fera des 700 € (RM-3.3.2).
      await expect(page.getByRole("button", { name: /Encaisser 700,00[  ]€ \(dont 400,00[  ]€ pour [a-zé]+ \d{4}\)/ }).first()).toBeVisible();
    }
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath(`agence-loyers-a-echoir${acompte ? "-acompte" : ""}-${largeur}.png`), fullPage: true });
  } finally {
    await db.query("update public.appels_loyer set date_echeance=$2::date where id=$1", [appel.id, appel.date_echeance]);
    await db.query("update public.appels_loyer set montant_du=$2::numeric where id=$1", [precedent.id, precedent.montant_du]);
    await db.end();
  }
});

// Troisième relecture de LOY-07, Finances du propriétaire direct : même cause (statut « partiel » d'un terme à échoir).
// Un bail fictif du propriétaire, échéance du mois dans huit jours, 200 € d'acompte reçus : rien n'est « Reste dû ».
for (const largeur of [390, 1440]) test(`propriétaire : Finances, un acompte sur un terme à échoir reste « à échoir » (${largeur}px)`, async ({ page }, info) => {
  test.setTimeout(120000);
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API locale fictive requise");
  const db = new Client({ connectionString: url }); await db.connect();
  const [bien, lot, personne, bail] = Array.from({ length: 4 }, () => randomUUID());
  const nom = `TEST Acompte ${lot.slice(0, 6)}`;
  try {
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')", [bien, ORG, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'Fictif','Acompte',$3)", [personne, ORG, `acompte-${lot.slice(0, 8)}@example.invalid`]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-20,650,50,5)", [bail, ORG, lot, personne]);
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values
      ($1,$2,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris()+8,650,50,700)`, [ORG, bail]);
    await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode,note) values($1,$2,200,public.aujourdhui_paris(),'virement','TEST acompte')", [ORG, bail]);
    await db.query("commit");
    const { rows: [etat] } = await db.query("select statut from public.etat_loyers_bail_brut($1)", [bail]);
    expect(etat.statut).toBe("partiel");
    await page.setViewportSize({ width: largeur, height: largeur < 500 ? 844 : 900 });
    await page.addInitScript(() => { try { sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1"); } catch {} });
    await connecter(page, "proprietaire@example.com"); await page.waitForURL(/\/espace\//);
    await page.goto(`/espace/${ORG}/loyers`);
    const chiffres = page.locator("#loyers dl").first();
    await expect(chiffres).toContainText(/Reste dû\s*0,00[  ]€/);
    await expect(page.locator("#loyers")).toContainText(/500,00[  ]€ à échoir sur ces échéances/);
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath(`proprietaire-finances-acompte-${largeur}.png`), fullPage: true });
  } finally {
    await db.query("rollback").catch(() => {});
    try {
      await db.query("begin");
      await db.query("delete from alerts where organization_id=$1 and details->>'bail_id'=$2", [ORG, bail]);
      await db.query("delete from fiscal_encaissements_composantes where organization_id=$1 and ecriture_id in (select id from ecritures where bail_id=$2)", [ORG, bail]);
      await db.query("delete from ecritures where bail_id=$1", [bail]); await db.query("delete from encaissements where bail_id=$1", [bail]);
      await db.query("delete from quittances where bail_id=$1", [bail]); await db.query("delete from appels_loyer where bail_id=$1", [bail]);
      await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2", [ORG, bail]);
      await db.query("delete from baux where id=$1", [bail]); await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]); await db.query("delete from persons where id=$1", [personne]);
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; } finally { await db.end(); }
  }
});
