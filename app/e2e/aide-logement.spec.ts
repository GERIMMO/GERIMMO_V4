import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createBrowserClient } from "@supabase/ssr";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { baseApiFictive } from "./local/base-api-fictive";
import { appelerTermeNonEchu, creerEspaceLot61, creerLocataireLot61 } from "./local/lot61-locataires";

// Le parcours vérifie les paiements et les documents. Les deux sessions sont
// ouvertes auprès de l’API fictive, avec les mêmes cookies que le site.
async function ouvrirSession(context: BrowserContext, site: string, email: string, password: string) {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!api || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(api) || !cle) {
    throw new Error("API Supabase fictive locale obligatoire.");
  }
  const cookies = new Map<string, string>();
  const client = createBrowserClient(api, cle, {
    isSingleton: false,
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (nouveaux) => nouveaux.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  expect(cookies.size).toBeGreaterThan(0);
  await context.addCookies(Array.from(cookies, ([name, value]) => ({ name, value, url: site })));
}

test("CAF : reçu, quittance, Mes paiements et signalement préparé par le bailleur", async ({ browser, page, baseURL }, info) => {
  test.setTimeout(240_000);
  const url = process.env.SUPALOCAL_DB;
  baseApiFictive(url);
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseURL)) {
    throw new Error("Application fictive locale obligatoire.");
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  const contexteBailleur = await browser.newContext({ locale: "fr-FR", timezoneId: "Europe/Paris" });
  try {
    const espace = await creerEspaceLot61(db, "proprietaire_direct", true);
    const locataire = await creerLocataireLot61(db, espace, "actif");
    const compteBailleur = randomUUID();
    const emailBailleur = `caf-${compteBailleur}@example.invalid`;
    const motDePasseBailleur = randomUUID();
    await db.query(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')`,
      [compteBailleur, emailBailleur, motDePasseBailleur]);
    await db.query(`insert into memberships(organization_id,account_id,role)
      values($1,$2,'proprietaire_direct')`, [espace.org, compteBailleur]);
    await appelerTermeNonEchu(db, espace, locataire.bail, 0);

    await db.query(`update appels_loyer set date_echeance=public.aujourdhui_paris()-1, loyer_hc=560, charges=40, montant_du=600
      where bail_id=$1`, [locataire.bail]);
    await db.query(`insert into encaissements(organization_id,bail_id,montant,date_paiement,mode)
      values($1,$2,210,public.aujourdhui_paris(),'caf')`, [espace.org, locataire.bail]);
    const { rows: [{ jour, hier }] } = await db.query(
      "select public.aujourdhui_paris()::text as jour, (public.aujourdhui_paris()-1)::text as hier",
    );

    const bailleur = await contexteBailleur.newPage();
    await sansSyntheseAlertes(bailleur);
    const ficheBail = `/espace/${espace.org}/baux/${locataire.bail}#loyers`;
    await ouvrirSession(contexteBailleur, baseURL, emailBailleur, motDePasseBailleur);
    await bailleur.goto(ficheBail);
    const alerte = bailleur.locator("details").filter({ has: bailleur.getByText(/Impayé avec versement CAF enregistré/, { exact: false }) }).last();
    await expect(alerte).toBeVisible();
    await alerte.getByRole("checkbox").check();
    if (jour < "2027-01-01") {
      await alerte.getByLabel(/Loyer mensuel et charges après déduction/).fill("390");
    }
    await alerte.getByLabel("Date du solde 1").fill(hier);
    await alerte.getByLabel("Dette restante en euros").fill("800");
    await expect(alerte.getByText(/Signalez vous-même l’impayé à votre caisse/)).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await bailleur.setViewportSize({ width, height: 1000 });
      await alerte.evaluate((encart) => encart.scrollIntoView({ block: "center" }));
      await alerte.screenshot({ path: info.outputPath(`signalement-${width}.png`), scale: "css", animations: "disabled" });
    }

    const paiements = `/locataire/${espace.org}/loyers`;
    await ouvrirSession(page.context(), baseURL, locataire.email, locataire.mot);
    await page.goto(paiements);
    await expect(page.getByText(/Dont aide au logement versée par la CAF : 210,00/)).toBeVisible();
    const ouvrirDocument = async () => {
      const lien = page.locator('a[href^="/quittance/"]');
      await expect(lien).toBeVisible();
      const href = await lien.getAttribute("href");
      if (!href) throw new Error("Le lien du document est absent.");
      const document = await page.context().newPage();
      await document.goto(href);
      await expect(document.frameLocator("iframe[srcdoc]").locator("body"))
        .toContainText("Dont aide au logement versée par la CAF");
      return document;
    };
    const style = "nextjs-portal { display: none !important; }";
    const capturerDocument = async (document: Page, nom: string) => {
      for (const width of [390, 768, 1440]) {
        await document.setViewportSize({ width, height: 1000 });
        // Le cadre est ouvert sur toute la hauteur pour la capture, y compris
        // lorsque l’hydratation du serveur de développement est encore en cours.
        await document.locator("iframe[srcdoc]").evaluate((cadre: HTMLIFrameElement) => {
          const hauteur = cadre.contentDocument?.documentElement.scrollHeight;
          if (hauteur) cadre.style.height = `${hauteur + 8}px`;
        });
        await document.locator("main").screenshot({
          path: info.outputPath(`${nom}-${width}.png`), style, scale: "css", animations: "disabled",
        });
      }
      await document.close();
    };
    await capturerDocument(await ouvrirDocument(), "recu");

    await db.query(`insert into encaissements(organization_id,bail_id,montant,date_paiement,mode)
      values($1,$2,390,public.aujourdhui_paris(),'virement')`, [espace.org, locataire.bail]);
    await page.goto(paiements);
    await expect(page.getByText(/Versé par le locataire : 390,00/)).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`paiements-${width}.png`), fullPage: true, style, scale: "css", animations: "disabled" });
    }
    await capturerDocument(await ouvrirDocument(), "quittance");
  } finally {
    await contexteBailleur.close();
    await db.end();
  }
});
