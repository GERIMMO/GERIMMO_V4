import { expect, test, type Browser } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

/**
 * LES ÉCRANS DU PROPRIÉTAIRE DIRECT VIVENT SOUS /espace/<id> (décision D27, fiche DES-A-08, option B).
 *
 * Le proxy sert l'alias /espace/<id>/… (réécriture vers les écrans de /agence/<id>/…) pour le seul propriétaire direct, et
 * redirige à vie (308, chemin et requête conservés, Cache-Control private, no-cache) ses anciens liens /agence/<id>/… Les
 * agences restent sous /agence. Ce parcours le vérifie dans un vrai navigateur, sur les comptes du jeu de démonstration :
 *  · le propriétaire navigue dans tout son espace sous /espace (menu cliqué, liens émis, adresse affichée) ;
 *  · un ancien lien /agence est redirigé en 308 vers /espace, sans boucle ;
 *  · une action serveur (POST) postée sous /espace aboutit ;
 *  · l'alias ne donne ACCÈS À RIEN de plus : l'espace d'une autre organisation ne s'atteint pas en écrivant « espace » ;
 *  · la porte de /admin et la connexion exigée sont inchangées ; une agence reste sous /agence.
 */
const PD = "3c1d1e95-3570-400b-8012-44530be145b1"; // organisation du propriétaire direct de démonstration
const AGENCE = "c14c3187-1258-4e58-8822-368c6007e3fa"; // Agence Alpha
const INEXISTANTE = "00000000-0000-4000-8000-000000000000";

const etat = (nom: string) => path.join(__dirname, ".auth", `${nom}.json`);

/** Une requête sans suivre les redirections, avec la session d'un profil (ou sans session). */
async function sansSuivre(browser: Browser, nom: string | null, chemin: string) {
  const context = await browser.newContext(nom ? { storageState: etat(nom) } : {});
  try {
    const reponse = await context.request.get(chemin, { maxRedirects: 0 });
    return { statut: reponse.status(), lieu: reponse.headers()["location"] ?? "", cache: reponse.headers()["cache-control"] ?? "" };
  } finally {
    await context.close();
  }
}

/** La base API locale du banc (jamais une autre) : pour poser une seconde organisation de propriétaire direct. */
function baseLocale(): string | null {
  const url = process.env.SUPALOCAL_DB;
  return url && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url) ? url : null;
}

test.describe("Propriétaire direct : l'alias /espace", () => {
  test.use({ storageState: etat("proprietaire") });

  test.beforeEach(async ({ page }) => {
    await sansSyntheseAlertes(page);
  });

  test("un ancien lien /agence est redirigé à vie (308) vers /espace, chemin et requête conservés", async ({ browser }) => {
    for (const suite of ["", "/parc", "/loyers?annee=2026&mois=9", "/personnes", "/comptabilite/fiscal?annee=2026"]) {
      const r = await sansSuivre(browser, "proprietaire", `/agence/${PD}${suite}`);
      expect(r.statut, suite).toBe(308);
      const lieu = new URL(r.lieu, "http://adresse.invalide");
      expect(lieu.pathname + lieu.search, suite).toBe(`/espace/${PD}${suite}`);
      // La redirection dépend de la personne connectée : aucun cache partagé, et le navigateur la revalide.
      expect(r.cache, suite).toBe("private, no-cache");
    }
  });

  test("le lien ancien ouvre le même écran à l'adresse /espace, sans boucle (le fragment survit)", async ({ page }) => {
    const redirections: string[] = [];
    // Les seules navigations du document (les préchargements de liens ne comptent pas).
    page.on("response", (r) => { if (r.request().isNavigationRequest() && r.status() >= 300 && r.status() < 400) redirections.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await page.goto(`/agence/${PD}/loyers?annee=2026&mois=9#haut`);
    await expect(page).toHaveURL(new RegExp(`/espace/${PD}/loyers\\?annee=2026&mois=9#haut$`));
    await expect(page.locator("h1").first()).toBeVisible();
    // Une seule redirection : la 308 de l'ancien lien. L'alias lui-même n'en ajoute aucune.
    expect(redirections).toEqual([`308 /agence/${PD}/loyers`]);
  });

  test("l'alias est servi tel quel (200) : l'adresse affichée reste /espace et le menu s'allume", async ({ browser, page }) => {
    const r = await sansSuivre(browser, "proprietaire", `/espace/${PD}/parc`);
    expect(r.statut).toBe(200);
    await page.goto(`/espace/${PD}/parc`);
    await expect(page).toHaveURL(new RegExp(`/espace/${PD}/parc$`));
    await expect(page.locator("h1").first()).toBeVisible();
    // Le menu s'allume sur l'écran courant malgré la réécriture vers /agence côté serveur.
    await expect(page.locator('nav a[aria-current="page"]').first()).toHaveAttribute("href", `/espace/${PD}/parc`);
  });

  test("il navigue dans tout son espace sous /espace : chaque écran s'ouvre, et aucun lien émis ne pointe vers /agence", async ({ page }) => {
    test.setTimeout(300_000);
    const ecrans = ["", "/parc", "/parc/nouveau", "/personnes", "/loyers", "/comptabilite", "/comptabilite/fiscal", "/incidents", "/incidents/nouveau", "/alertes", "/agenda", "/messages", "/profil", "/documents", "/documents/catalogue", "/artisans", "/reseau", "/abonnement", "/faq", "/journal", "/statistiques"];
    const anciens: string[] = [];
    for (const ecran of ecrans) {
      const reponse = await page.goto(`/espace/${PD}${ecran}`);
      expect(reponse?.status(), ecran).toBe(200);
      await expect(page.locator("h1").first(), ecran).toBeVisible();
      await expect(page.locator("body"), ecran).not.toContainText("Cette page est introuvable");
      const liens = await page.$$eval("a[href], form[action]", (els) => els.map((e) => e.getAttribute("href") ?? e.getAttribute("action") ?? ""));
      for (const lien of liens) if (/^\/agence(\/|$)/.test(lien)) anciens.push(`${ecran || "/"} -> ${lien}`);
      expect(page.url(), ecran).toContain(`/espace/${PD}`);
    }
    expect(anciens).toEqual([]);
  });

  test("le menu se parcourt au clic (navigation côté client) sans jamais quitter /espace", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/espace/${PD}`);
    const menu = "aside.coquille-late nav.coquille-menu";
    const liens = await page.locator(`${menu} a[href]`).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const internes = [...new Set(liens.filter((h) => h.startsWith(`/espace/${PD}`)))];
    expect(internes.length).toBeGreaterThan(6);
    expect(liens.filter((h) => /^\/agence(\/|$)/.test(h))).toEqual([]);
    for (const href of internes) {
      await page.locator(`${menu} a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${href.replace(/[?.]/g, "\\$&")}$`));
      await expect(page.locator("h1").first(), href).toBeVisible();
    }
  });

  test("une action serveur postée sous /espace aboutit et ramène sous /espace (déclarer un incident)", async ({ page }) => {
    const description = `TEST D27 alias ${randomUUID().slice(0, 8)}`;
    const posts: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST") posts.push(new URL(r.url()).pathname); });
    await page.goto(`/espace/${PD}/incidents/nouveau`);
    const lot = page.locator("#lot");
    const premier = await lot.locator("option:not([disabled])").first().getAttribute("value");
    await lot.selectOption(premier!);
    const categorie = page.locator("#categorie");
    await categorie.selectOption((await categorie.locator("option:not([disabled])").first().getAttribute("value"))!);
    await page.locator("#description").fill(description);
    await page.getByRole("button", { name: "Déclarer l'incident" }).click();
    await expect(page).toHaveURL(new RegExp(`/espace/${PD}/incidents\\?sel=[0-9a-f-]{36}$`));
    await expect(page.locator("body")).toContainText(description);
    // L'envoi est parti sur l'adresse affichée (l'alias), pas sur /agence.
    expect(posts).toContain(`/espace/${PD}/incidents/nouveau`);
    expect(posts.filter((p) => p.startsWith("/agence/"))).toEqual([]);
  });

  test("l'URL d'un autre profil n'est pas atteignable par l'alias", async ({ browser, page }) => {
    // Une agence ou une organisation inexistante n'est jamais servie sous /espace : « introuvable », sans rien dire de plus.
    for (const chemin of [`/espace/${AGENCE}`, `/espace/${AGENCE}/parc`, `/espace/${INEXISTANTE}`, `/espace/${INEXISTANTE}/parc`]) {
      const r = await sansSuivre(browser, "proprietaire", chemin);
      expect(r.statut, chemin).toBe(404);
      await page.goto(chemin);
      await expect(page.locator("body"), chemin).not.toContainText("Agence Alpha");
    }
    // L'ancienne adresse d'une agence ne lui est pas ouverte pour autant : le proxy ne la redirige pas vers /espace, et la
    // garde de la page (inchangée) le renvoie vers « Mes espaces » sans rien lui montrer de l'agence.
    for (const chemin of [`/agence/${AGENCE}`, `/agence/${AGENCE}/parc`]) {
      const r = await sansSuivre(browser, "proprietaire", chemin);
      expect(r.statut, chemin).not.toBe(308);
      expect(r.lieu, chemin).not.toContain(`/espace/${AGENCE}`);
      await page.goto(chemin);
      // Avec une seule adhésion, « Mes espaces » l'envoie droit sur le sien.
      await expect(page, chemin).toHaveURL(new RegExp(`/(espaces|espace/${PD})$`));
      await expect(page.locator("body")).not.toContainText("Agence Alpha");
    }
  });

  test("l'espace d'un AUTRE propriétaire direct n'est pas atteignable par /espace/<son id>", async ({ browser, page }) => {
    const url = baseLocale();
    test.skip(!url, "Base API fictive locale requise (SUPALOCAL_DB)");
    const db = new Client({ connectionString: url! });
    await db.connect();
    const autre = randomUUID();
    const nom = `Parc TEST D27 ${autre.slice(0, 8)}`;
    try {
      await db.query("insert into public.organizations(id, name, type, status) values ($1, $2, 'proprietaire_direct', 'essai')", [autre, nom]);
      for (const chemin of [`/espace/${autre}`, `/espace/${autre}/parc`, `/espace/${autre}/loyers`]) {
        const r = await sansSuivre(browser, "proprietaire", chemin);
        expect(r.statut, chemin).toBe(404);
        await page.goto(chemin);
        await expect(page.locator("body"), chemin).not.toContainText(nom);
      }
      // Par l'ancienne adresse : pas de redirection vers son alias, et la garde de la page le renvoie chez lui.
      const r = await sansSuivre(browser, "proprietaire", `/agence/${autre}/parc`);
      expect(r.statut).not.toBe(308);
      await page.goto(`/agence/${autre}/parc`);
      await expect(page).toHaveURL(new RegExp(`/(espaces|espace/${PD})$`));
      await expect(page.locator("body")).not.toContainText(nom);
    } finally {
      await db.query("delete from public.organizations where id = $1", [autre]);
      await db.end();
    }
  });

  test("la porte de /admin reste fermée au propriétaire direct (inchangée)", async ({ browser }) => {
    for (const chemin of ["/admin", "/admin/brief", `/admin/organisations/${PD}`]) {
      const r = await sansSuivre(browser, "proprietaire", chemin);
      expect(r.statut, chemin).toBe(307);
      expect(new URL(r.lieu, "http://adresse.invalide").pathname, chemin).toBe("/espaces");
    }
  });
});

test.describe("Autres profils : aucun accès par l'alias, aucune garde affaiblie", () => {
  for (const profil of ["admin", "agent", "locataire"] as const) {
    test(`${profil} : /espace/<propriétaire> et /espace/<agence> sont introuvables`, async ({ browser }) => {
      for (const chemin of [`/espace/${PD}`, `/espace/${PD}/parc`, `/espace/${AGENCE}`, `/espace/${AGENCE}/parc`]) {
        const r = await sansSuivre(browser, profil, chemin);
        expect(r.statut, `${profil} ${chemin}`).toBe(404);
      }
    });
  }

  test("admin : son agence reste servie sous /agence, sans redirection, et ses liens restent sous /agence", async ({ browser }) => {
    const r = await sansSuivre(browser, "admin", `/agence/${AGENCE}/parc`);
    expect(r.statut).toBe(200);
    const context = await browser.newContext({ storageState: etat("admin") });
    try {
      const page = await context.newPage();
      await sansSyntheseAlertes(page);
      await page.goto(`/agence/${AGENCE}/parc`);
      await expect(page).toHaveURL(new RegExp(`/agence/${AGENCE}/parc$`));
      const liens = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
      expect(liens.filter((h) => h.startsWith("/espace/"))).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("admin : l'ancienne adresse du propriétaire n'est pas redirigée vers /espace (rien n'y est révélé)", async ({ browser }) => {
    const r = await sansSuivre(browser, "admin", `/agence/${PD}/parc`);
    expect(r.statut).not.toBe(308);
    expect(r.lieu).not.toContain("/espace/");
  });

  test("hors connexion : /espace mène à la connexion, avec la suite à reprendre", async ({ browser }) => {
    const r = await sansSuivre(browser, null, `/espace/${PD}/parc`);
    expect(r.statut).toBe(307);
    expect(decodeURIComponent(r.lieu)).toContain("/connexion");
    expect(decodeURIComponent(r.lieu)).toContain(`/espace/${PD}/parc`);
  });
});
