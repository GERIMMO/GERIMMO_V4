import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { sansSyntheseAlertes } from "./aides";
import { baseApiFictive } from "./local/base-api-fictive";

test("sur téléphone, un nouvel inscrit peut rouvrir son essai expiré et ajouter son premier bien", async ({ page, context, baseURL }, info) => {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const origine = new URL(baseURL!).origin;
  expect(origine).toMatch(/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/);
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await sansSyntheseAlertes(page);
  const email = `reprise-${randomUUID()}@example.invalid`;
  await page.goto("/inscription");
  await page.getByLabel("Votre nom", { exact: true }).fill("Morel");
  await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Ouvrir mon espace", exact: true }).click();
  await expect(page.getByText(/Vérifiez votre boîte mail/)).toBeVisible();
  const courriers = await (await page.request.get("http://127.0.0.1:55520/messages")).json() as { to: string[]; html: string }[];
  const courrier = courriers.findLast(m => m.to.includes(email));
  expect(courrier).toBeDefined();
  const confirmation = new URL(courrier!.html.match(/href="([^"]*\/auth\/confirm[^"]*)"/)![1].replaceAll("&amp;", "&"));
  expect(confirmation.origin).toBe(origine);
  await page.goto(confirmation.href);
  await page.getByRole("button", { name: /Confirmer mon adresse|Choisir mon mot de passe/ }).click();
  await page.locator("summary").filter({ hasText: "Coordonnées et parrainage (facultatif)" }).click();
  for (const [nom, valeur] of [["Prénom", "Élise"], ["Adresse", "3 rue du Test"], ["Code postal", "69003"], ["Ville", "Lyon"]]) {
    await page.getByLabel(nom, { exact: true }).fill(valeur);
  }
  const mot = randomUUID() + "!aA";
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(mot);
  await page.getByLabel("Confirmation", { exact: true }).fill(mot);
  await page.getByRole("checkbox", { name: /accepte les conditions/ }).check();
  await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  await expect(page).toHaveURL(/\/espace\/[a-f0-9-]{36}$/);
  const espace = new URL(page.url()).pathname;
  const org = espace.split("/").at(-1);

  const db = new Client({ connectionString: process.env.SUPALOCAL_DB });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('gerimmo.systeme','on',true)");
    await db.query("update public.organizations set essai_fin=public.aujourdhui_paris()-1 where id=$1", [org]);
    await db.query("commit");
    await page.goto(espace + "/abonnement");
    const reprise = page.getByRole("button", { name: "Rouvrir mon espace 7 jours pour ajouter mon premier bien" });
    await expect(reprise).toBeVisible();
    await expect(page.getByRole("button", { name: /paiement sécurisé/ })).toHaveCount(0);
    if (!process.env.CI) {
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.screenshot({ path: info.outputPath(`reprise-${width}.png`), fullPage: true, animations: "disabled", style: "nextjs-portal {display:none!important}" });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await reprise.click();
    await expect(page).toHaveURL(espace + "/parc/nouveau");
    for (const [nom, valeur] of [["Nom du bien", "Premier logement fictif"], ["Adresse", "9 rue du Test"], ["Code postal", "69003"], ["Ville", "Lyon"], ["Année de construction", "1998"], ["Parties communes", "Hall"], ["Accès internet", "Fibre"]]) {
      await page.getByLabel(nom, { exact: ["Nom du bien", "Adresse"].includes(nom) }).fill(valeur);
    }
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByLabel(/Surface.*m²/).fill("42");
    await page.getByLabel("Nombre de pièces").fill("2");
    await page.getByRole("button", { name: "Créer le lot et continuer" }).click();
    await expect(page).toHaveURL(/\/lots\/[a-f0-9-]{36}/);

    await page.goto(espace + "/abonnement");
    await expect(reprise).toHaveCount(0);
    const tarifs = page.locator("main");
    await expect(tarifs).toContainText("1 bien en gestion");
    await expect(tarifs).toContainText(/5,99\s*€/);
    const trace = await db.query("select details from public.audit_log where organization_id=$1 and action='reprise_essai_premier_bien'", [org]);
    expect(trace.rows).toEqual([{ details: { jours: 7, essai_fin: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } }]);
  } finally {
    await db.end();
  }
});
