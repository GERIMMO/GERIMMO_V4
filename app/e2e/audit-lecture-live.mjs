// Audit en lecture seule du site publié. Les boutons qui soumettent ou modifient
// des données sont inventoriés, jamais actionnés sur la base de production.
// Usage : node e2e/audit-lecture-live.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { COMPTES_LECTURE as COMPTES, controleCouverture, fabriquerPatron, permis, routesDuCode } from "./perimetre-audit.mjs";

const ORIGINE = process.env.E2E_BASE_URL ?? "https://www.gerimmo.app";
const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";
const SORTIE = process.env.E2E_AUDIT_DIR ?? path.join(process.cwd(), "e2e", ".audit-live");

// Les routes viennent des dossiers de src/app. L'espace du propriétaire direct (/espace/<id>/…) n'a pas de dossier : le patron
// d'une adresse /espace/<id>/… est celui de la page /agence/[orgId]/… correspondante (décision D27).
const racine = path.join(process.cwd(), "src", "app");
const routes = routesDuCode(racine);
const patron = fabriquerPatron(routes);
const navigateur = await chromium.launch({ headless: true });
fs.mkdirSync(SORTIE, { recursive: true });
const synthese = [];
const couvertureManquante = [];

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
    couvertureManquante.push(controleCouverture(persona, [], [prefixe]));
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
          soft404: document.body.innerText.includes("could not be found") || ["404", "Cette page est introuvable"].includes(document.querySelector("h1")?.textContent?.trim() ?? ""),
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
  // Un profil qui n'ouvre aucun écran sous sa racine n'a pas été audité (exploration arrêtée à l'accueil) : c'est un échec.
  const manque = controleCouverture(persona, lignes.filter((l) => !l.erreur).map((l) => l.chemin), [prefixe]);
  if (manque) couvertureManquante.push(manque);
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
  routesDansLeCode: routes.length,
  routesVisitees: routesVisitees.size,
  routesNonVisitees: routes.filter((route) => !routesVisitees.has(route)),
}, null, 2));
console.log(JSON.stringify(synthese, null, 2));
fs.writeFileSync(path.join(SORTIE, "couverture-manquante.json"), JSON.stringify(couvertureManquante, null, 2));
for (const manque of couvertureManquante) console.error(`COUVERTURE: ${manque}`);
if (couvertureManquante.length) process.exitCode = 1;
