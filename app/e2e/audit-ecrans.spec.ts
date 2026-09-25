import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Audit visuel mobile : parcourt la matrice d'écrans par persona, capture
// chaque page à 390×844 et mesure le débordement horizontal (le symptôme
// le plus objectif d'un écran cassé sur téléphone). Produit un rapport JSON
// et des captures ; un écran en erreur, en 404 ou qui déborde fait échouer le run.
type Ecran = { path: string; persona: string; label: string };

const MATRICE: Ecran[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "matrice-ecrans.json"), "utf8"),
);

const SORTIE = process.env.E2E_AUDIT_DIR ?? path.join(__dirname, ".audit");

const PERSONAS = ["public", "agent", "admin", "locataire", "proprietaire", "superadmin", "artisan"] as const;

for (const persona of PERSONAS) {
  const ecrans = MATRICE.filter((e) => e.persona === persona);
  if (!ecrans.length) continue;

  test(`audit ${persona} (${ecrans.length} écrans)`, async ({ browser }) => {
    test.setTimeout(30_000 + ecrans.length * 25_000);
    const dossier = path.join(SORTIE, persona);
    fs.mkdirSync(dossier, { recursive: true });
    const storageState =
      persona === "public" ? undefined : path.join(__dirname, ".auth", `${persona}.json`);
    const context = await browser.newContext({ storageState });
    const rapport: Array<Record<string, unknown>> = [];

    for (const ecran of ecrans) {
      const page = await context.newPage();
      const erreursConsole: string[] = [];
      const erreursPage: string[] = [];
      page.on("pageerror", (e) => erreursPage.push(e.message.slice(0, 300)));
      page.on("console", (m) => {
        if (m.type() === "error") erreursConsole.push(m.text().slice(0, 300));
      });
      const slug = ecran.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "racine";
      try {
        const reponse = await page.goto(ecran.path, { waitUntil: "load", timeout: 20_000 });
        await page.locator("h1").first().waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(350);
        // Le rappel d'arrivée est testé dans son propre parcours. Pour juger
        // chaque page et ses boutons, fermer son panneau au-dessus du contenu.
        const fermerRappel = page.locator('.fixed.z-50 button[aria-label="Fermer"]').first();
        if (await fermerRappel.isVisible().catch(() => false)) {
          await fermerRappel.click();
        }
        const mesure = await page.evaluate(() => {
          const doc = document.documentElement;
          const larges: string[] = [];
          for (const el of Array.from(document.querySelectorAll("body *"))) {
            const r = el.getBoundingClientRect();
            if (r.width > window.innerWidth + 2 || r.right > window.innerWidth + 8) {
              const e = el as HTMLElement;
              larges.push(
                `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.split(" ").slice(0, 3).join(".") : ""} (${Math.round(r.width)}px)`,
              );
              if (larges.length >= 5) break;
            }
          }
          const h1 = document.querySelector("h1")?.textContent?.trim() ?? null;
          const photos = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 20 || r.height < 20) return false;
            if (el instanceof HTMLImageElement) return el.complete && el.naturalWidth > 0;
            return /url\([^)]*illustrations\//.test(getComputedStyle(el).backgroundImage);
          }).length;
          const commandes = Array.from(document.querySelectorAll<HTMLElement>("button, summary, [role='button']"))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            });
          return {
            overflowPx: Math.max(0, doc.scrollWidth - window.innerWidth),
            photos,
            boutonsVisibles: commandes.length,
            boutonsSansNom: commandes.filter((el) =>
              !(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim()
            ).length,
            larges,
            titre: document.title,
            h1,
            // Un 404 App Router répond 200 : on le détecte au contenu
            soft404: h1 === "404" || document.body.innerText.includes("could not be found"),
          };
        });
        await page.screenshot({ path: path.join(dossier, `${slug}.png`), fullPage: true });
        rapport.push({
          ...ecran,
          statut: reponse?.status() ?? 0,
          cheminFinal: new URL(page.url()).pathname,
          redirection: new URL(page.url()).pathname !== new URL(ecran.path, page.url()).pathname,
          ...mesure,
          erreursConsole: erreursConsole.slice(0, 5),
          erreursPage: erreursPage.slice(0, 5),
        });
      } catch (err) {
        rapport.push({ ...ecran, statut: "erreur", erreur: String(err).slice(0, 300) });
      }
      await page.close();
    }
    await context.close();
    fs.writeFileSync(
      path.join(SORTIE, `rapport-${persona}.json`),
      JSON.stringify(rapport, null, 2),
    );
    console.log(
      `Audit ${persona} : ${rapport.length} écrans, ${rapport.filter((r) => r.redirection).length} redirections, ` +
      `${rapport.reduce((n, r) => n + Number(r.boutonsVisibles ?? 0), 0)} commandes visibles, ` +
      `${rapport.reduce((n, r) => n + Number(r.boutonsSansNom ?? 0), 0)} sans nom`,
    );
    const casses = rapport.filter((r) =>
      r.statut === "erreur" ||
      (typeof r.statut === "number" && r.statut >= 400) ||
      r.soft404 === true ||
      !r.h1 ||
      (Array.isArray(r.erreursPage) && r.erreursPage.length > 0) ||
      (Array.isArray(r.erreursConsole) && r.erreursConsole.length > 0) ||
      (typeof r.boutonsSansNom === "number" && r.boutonsSansNom > 0) ||
      (typeof r.overflowPx === "number" && r.overflowPx > 2)
      // Plus d'exigence de photo par écran (24/09) : le porteur a retiré le
      // bandeau photo des espaces, « en trop ». Le compte reste au rapport.
    ).map((r) => ({ path: r.path, statut: r.statut, h1: r.h1, boutonsSansNom: r.boutonsSansNom, soft404: r.soft404, overflowPx: r.overflowPx, photos: r.photos, erreur: r.erreur, erreursPage: r.erreursPage, erreursConsole: r.erreursConsole }));
    expect(casses, `Écrans ${persona} cassés ou débordants`).toEqual([]);
  });
}
