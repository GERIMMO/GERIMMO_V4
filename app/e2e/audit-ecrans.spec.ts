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
      page.on("console", (m) => {
        if (m.type() === "error") erreursConsole.push(m.text().slice(0, 300));
      });
      const slug = ecran.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "racine";
      try {
        const reponse = await page.goto(ecran.path, { waitUntil: "load", timeout: 20_000 });
        await page.waitForTimeout(1_200);
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
          return {
            overflowPx: Math.max(0, doc.scrollWidth - window.innerWidth),
            photos,
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
          ...mesure,
          erreursConsole: erreursConsole.slice(0, 5),
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
    const casses = rapport.filter((r) =>
      r.statut === "erreur" ||
      (typeof r.statut === "number" && r.statut >= 400) ||
      r.soft404 === true ||
      (typeof r.overflowPx === "number" && r.overflowPx > 2) ||
      (!String(r.path).startsWith("/quittance/") &&
       !String(r.path).startsWith("/attestation-loyer/") && r.photos === 0)
    ).map((r) => ({ path: r.path, statut: r.statut, soft404: r.soft404, overflowPx: r.overflowPx, photos: r.photos, erreur: r.erreur }));
    expect(casses, `Écrans ${persona} cassés ou débordants`).toEqual([]);
  });
}
