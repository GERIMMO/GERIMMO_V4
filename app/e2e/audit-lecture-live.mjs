// Audit en lecture seule du site publié. Les boutons qui soumettent ou modifient
// des données sont inventoriés, jamais actionnés sur la base de production.
// Usage : node e2e/audit-lecture-live.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ORIGINE = process.env.E2E_BASE_URL ?? "https://www.gerimmo.app";
const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";
const SORTIE = process.env.E2E_AUDIT_DIR ?? path.join(process.cwd(), "e2e", ".audit-live");
const COMPTES = [
  ["agent", "agent.alpha@gerimmo-demo.fr", "/agence/"],
  ["admin-agence", "admin.alpha@gerimmo-demo.fr", "/agence/"],
  ["locataire", "locataire.alpha@gerimmo-demo.fr", "/locataire/"],
  ["artisan", "artisan.alpha@gerimmo-demo.fr", "/artisan"],
  ["proprietaire", "proprietaire@gerimmo-demo.fr", "/agence/"],
];

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const complet = path.join(dir, item.name);
    return item.isDirectory() ? pages(complet) : item.name === "page.tsx" ? [complet] : [];
  });
}
const racine = path.join(process.cwd(), "src", "app");
const patrons = pages(racine).map((fichier) => {
  const route = fichier.slice(racine.length).replace(/\/page\.tsx$/, "") || "/";
  const motif = route.replace(/\[[^/]+\]/g, "[^/]+");
  return { route, regex: new RegExp(`^${motif}/?$`) };
});
const patron = (pathname) => patrons.find((p) => p.regex.test(pathname))?.route ?? null;
const permis = (pathname, prefixe) => pathname.startsWith(prefixe) || pathname === "/compte";
const navigateur = await chromium.launch({ headless: true });
fs.mkdirSync(SORTIE, { recursive: true });
const synthese = [];

for (const [persona, email, prefixe] of COMPTES) {
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on("pageerror", (error) => erreurs.push(error.message.slice(0, 200)));
  await page.goto(`${ORIGINE}/connexion`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#mot-de-passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => permis(url.pathname, prefixe), { timeout: 20000 }).catch(() => {});
  const depart = new URL(page.url()).pathname;
  if (!permis(depart, prefixe)) {
    synthese.push({ persona, connexion: depart, erreur: "Session non ouverte" });
    await contexte.close();
    continue;
  }

  const file = [depart];
  const vus = new Set();
  const lignes = [];
  while (file.length && vus.size < 100) {
    const chemin = file.shift();
    if (!chemin || vus.has(chemin)) continue;
    vus.add(chemin);
    const avant = erreurs.length;
    try {
      const reponse = await page.goto(`${ORIGINE}${chemin}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.locator("body").waitFor({ timeout: 10000 });
      if (new URL(page.url()).pathname === "/connexion") throw new Error("Session expirée pendant l'audit");
      await page.waitForTimeout(350);
      const fermerRappel = page.locator('.fixed.z-50 button[aria-label="Fermer"]');
      if (await fermerRappel.isVisible().catch(() => false)) await fermerRappel.click();
      const etat = await page.evaluate(() => {
        const root = document.documentElement;
        const visibles = (el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().width > 0;
        };
        const commandes = [...document.querySelectorAll("button, [role=button], summary")]
          .filter(visibles)
          .map((el) => ({
            libelle: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 90),
            type: el.getAttribute("type") || "button",
            depliable: el.tagName === "SUMMARY" || el.hasAttribute("aria-expanded"),
            inactif: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
          }));
        const photos = [...document.querySelectorAll("img")].filter(visibles).length;
        const fondsPhotos = [...document.querySelectorAll("body *")]
          .filter(visibles).filter((el) => getComputedStyle(el).backgroundImage.includes("url(")).length;
        const liens = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
        return {
          titre: document.querySelector("h1")?.textContent?.trim() || null,
          debordement: Math.max(0, root.scrollWidth - innerWidth),
          photos, fondsPhotos, commandes, liens,
          soft404: document.body.innerText.includes("could not be found") || document.querySelector("h1")?.textContent?.trim() === "404",
        };
      });
      const essais = [];
      // Les seuls contrôles actionnés sont les accordéons natifs et boutons
      // exposant explicitement aria-expanded. Aucun formulaire métier ici.
      for (let i = 0; i < etat.commandes.length; i++) {
        if (essais.length >= 1) break;
        const c = etat.commandes[i];
        if (!c.depliable || c.inactif || c.type === "submit") continue;
        try {
          const controle = page.locator("button, [role=button], summary").filter({ visible: true }).nth(i);
          const avantOuverture = await controle.getAttribute("aria-expanded");
          await controle.click({ timeout: 800 });
          const apresOuverture = await controle.getAttribute("aria-expanded").catch(() => null);
          essais.push({ libelle: c.libelle, resultat: avantOuverture === null || avantOuverture !== apresOuverture ? "actionné" : "sans changement visible" });
        } catch (error) {
          essais.push({ libelle: c.libelle, resultat: `échec: ${String(error).slice(0, 90)}` });
        }
      }
      for (const href of etat.liens) {
        if (!href || href.startsWith("#")) continue;
        const url = new URL(href, ORIGINE);
        if (url.origin !== ORIGINE || !permis(url.pathname, prefixe) || !patron(url.pathname)) continue;
        if (!vus.has(url.pathname) && !file.includes(url.pathname)) file.push(url.pathname);
      }
      lignes.push({ chemin, patron: patron(chemin), statut: reponse?.status(), titre: etat.titre,
        debordement: etat.debordement, photos: etat.photos, fondsPhotos: etat.fondsPhotos,
        soft404: etat.soft404, commandes: etat.commandes, essais, erreurs: erreurs.slice(avant) });
    } catch (error) {
      lignes.push({ chemin, patron: patron(chemin), erreur: String(error).slice(0, 250) });
    }
    fs.writeFileSync(path.join(SORTIE, `${persona}.json`), JSON.stringify(lignes, null, 2));
    console.log(`${persona}: ${lignes.length} pages, ${file.length} liens en attente`);
  }
  synthese.push({ persona, pages: lignes.length, patrons: [...new Set(lignes.map((l) => l.patron))].length,
    controles: lignes.reduce((n, l) => n + (l.commandes?.length || 0), 0),
    essais: lignes.reduce((n, l) => n + (l.essais?.length || 0), 0),
    erreurs: lignes.filter((l) => l.erreur || l.soft404 || (l.statut && l.statut >= 400)).length });
  await contexte.close();
}
await navigateur.close();
fs.writeFileSync(path.join(SORTIE, "synthese.json"), JSON.stringify(synthese, null, 2));
const routesVisitees = new Set(
  COMPTES.flatMap(([persona]) => {
    const fichier = path.join(SORTIE, `${persona}.json`);
    return fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, "utf8")).map((l) => l.patron) : [];
  }),
);
fs.writeFileSync(path.join(SORTIE, "couverture.json"), JSON.stringify({
  routesDansLeCode: patrons.length,
  routesVisitees: routesVisitees.size,
  routesNonVisitees: patrons.map((p) => p.route).filter((route) => !routesVisitees.has(route)),
}, null, 2));
console.log(JSON.stringify(synthese, null, 2));
