import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "https://www.gerimmo.app";
const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";
const SORTIE = process.env.E2E_AUDIT_DIR ?? path.join(import.meta.dirname, ".audit-production");
const MAX_PAGES = Number(process.env.E2E_MAX_PAGES ?? 120);
const TESTER_INTERACTIONS = process.env.E2E_INTERACTIONS !== "0";
const LARGEUR = Number(process.env.E2E_VIEWPORT_WIDTH ?? 390);
const HAUTEUR = Number(process.env.E2E_VIEWPORT_HEIGHT ?? 844);

const PERSONAS = [
  { nom: "public", departs: ["/", "/connexion", "/inscription", "/journal", "/conditions", "/confidentialite", "/mentions-legales", "/mot-de-passe-oublie"] },
  { nom: "agent", email: "agent.alpha@gerimmo-demo.fr", departs: ["/espaces"], racines: ["/agence/", "/espaces", "/compte", "/assistance"] },
  { nom: "admin", email: "admin.alpha@gerimmo-demo.fr", departs: ["/espaces"], racines: ["/agence/", "/espaces", "/compte", "/assistance"] },
  { nom: "locataire", email: "locataire.alpha@gerimmo-demo.fr", departs: ["/espaces"], racines: ["/locataire/", "/espaces", "/compte", "/assistance", "/quittance/", "/attestation-loyer/"] },
  { nom: "proprietaire", email: "proprietaire@gerimmo-demo.fr", departs: ["/espaces"], racines: ["/agence/", "/espaces", "/compte", "/assistance"] },
  { nom: "artisan", email: "artisan.alpha@gerimmo-demo.fr", departs: ["/espaces", "/artisan"], racines: ["/artisan", "/espaces", "/compte", "/assistance"] },
];

const ignorer = /\/(api|auth\/|comptabilite\/export|documents\/[^/]+\/fichier|bail\/fichier|attestations\/[^/]+\/fichier)(\/|$)|\/modele$/;
const commandeSure = /^(fermer|ouvrir le menu|menu|afficher|masquer|plus|moins|filtrer)/i;

function admissible(persona, pathname) {
  if (ignorer.test(pathname)) return false;
  if (persona.nom === "public") return !/^\/(admin|agence|artisan|locataire|compte|espaces|securite)(\/|$)/.test(pathname);
  return persona.racines.some((racine) => pathname === racine || pathname.startsWith(racine));
}

async function connecter(page, persona) {
  if (!persona.email) return;
  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(persona.email);
  await page.locator("#mot-de-passe").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(espaces|agence|locataire|artisan)/, { timeout: 20_000 });
}

async function auditerPersona(browser, persona) {
  const context = await browser.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR }, isMobile: LARGEUR < 700, hasTouch: LARGEUR < 700,
    locale: "fr-FR", timezoneId: "Europe/Paris",
  });
  const page = await context.newPage();
  await connecter(page, persona);
  const file = [...persona.departs];
  const vus = new Set();
  const rapport = [];

  while (file.length && vus.size < MAX_PAGES) {
    const brut = file.shift();
    const url = new URL(brut, BASE);
    url.search = ""; url.hash = "";
    if (url.origin !== new URL(BASE).origin || !admissible(persona, url.pathname) || vus.has(url.pathname)) continue;
    vus.add(url.pathname);
    const erreurs = [];
    const onErreur = (e) => erreurs.push(String(e).slice(0, 240));
    page.on("pageerror", onErreur);
    let statut = 0; let mesure = {};
    try {
      const reponse = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 25_000 });
      statut = reponse?.status() ?? 0;
      await page.waitForTimeout(url.pathname === "/espaces" ? 900 : 250);
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      const cheminFinal = new URL(page.url()).pathname;
      if (admissible(persona, cheminFinal) && !vus.has(cheminFinal)) file.push(cheminFinal);
      mesure = await page.evaluate(() => {
        const visibles = (el) => {
          const r = el.getBoundingClientRect(), s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        const commandes = [...document.querySelectorAll("button,summary,[role=button]")].filter(visibles);
        return {
          titre: document.title,
          h1: document.querySelector("h1")?.textContent?.trim() ?? null,
          texteErreur: /application error|internal server error|une erreur est survenue/i.test(document.body?.innerText ?? ""),
          overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
          boutons: commandes.length,
          boutonsSansNom: commandes.filter((el) => !(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim()).length,
          images: document.querySelectorAll("img").length + [...document.querySelectorAll("body *")].filter((el) => {
            if (!visibles(el)) return false;
            const r = el.getBoundingClientRect();
            if (r.width < 80 || r.height < 48) return false;
            if (el instanceof HTMLImageElement) return false;
            return /url\([^)]+\)/.test(getComputedStyle(el).backgroundImage);
          }).length,
        };
      });
      mesure.cheminFinal = cheminFinal;

      for (const lien of await page.locator("a[href]").evaluateAll((els) => els.map((a) => a.href))) {
        const cible = new URL(lien, BASE);
        if (cible.origin === new URL(BASE).origin && admissible(persona, cible.pathname)) file.push(cible.pathname);
      }

      // Les commandes d'affichage sont testées réellement. Les boutons métier
      // restent couverts par les tests d'actions : l'audit de production ne
      // crée, ne paie, ne publie et ne supprime aucune donnée.
      const commandes = page.locator("button:visible, summary:visible, [role=button]:visible");
      let interactions = 0;
      for (let i = 0; TESTER_INTERACTIONS && i < Math.min(await commandes.count(), 15); i++) {
        const bouton = commandes.nth(i);
        const nom = ((await bouton.getAttribute("aria-label")) || (await bouton.textContent()) || "").trim();
        const expanded = await bouton.getAttribute("aria-expanded");
        const tag = await bouton.evaluate((el) => el.tagName.toLowerCase());
        if (!(expanded !== null || tag === "summary" || commandeSure.test(nom))) continue;
        await bouton.click({ timeout: 600 }).catch(() => {});
        interactions++;
      }
      mesure.interactionsSures = interactions;
    } catch (e) {
      mesure = { erreur: String(e).slice(0, 300) };
    } finally {
      page.off("pageerror", onErreur);
    }
    rapport.push({ persona: persona.nom, chemin: url.pathname, statut, ...mesure, erreurs });
  }
  await context.close();
  return rapport;
}

fs.mkdirSync(SORTIE, { recursive: true });
const browser = await chromium.launch({ headless: true });
const tout = [];
for (const persona of PERSONAS) {
  const rapport = await auditerPersona(browser, persona);
  tout.push(...rapport);
  fs.writeFileSync(path.join(SORTIE, `rapport-${persona.nom}.json`), JSON.stringify(rapport, null, 2));
  console.log(`${persona.nom}: ${rapport.length} écrans, ${rapport.reduce((n, r) => n + (r.interactionsSures ?? 0), 0)} interactions d'affichage`);
}
await browser.close();
fs.writeFileSync(path.join(SORTIE, "rapport.json"), JSON.stringify(tout, null, 2));
const echecs = tout.filter((r) => r.statut >= 400 || !r.h1 || r.texteErreur || r.overflowPx > 2 || r.boutonsSansNom > 0 || r.erreur || r.erreurs?.length);
fs.writeFileSync(path.join(SORTIE, "echecs.json"), JSON.stringify(echecs, null, 2));
console.log(`TOTAL: ${tout.length} écrans ; ${echecs.length} à corriger`);
if (echecs.length) process.exitCode = 1;
