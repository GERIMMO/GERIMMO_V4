import AxeBuilder from "@axe-core/playwright";
import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Balayage d'accessibilité (axe-core) des écrans porteurs, au gabarit mobile.
// Audit, pas barrage : le rapport JSON liste les violations sérieuses et
// critiques — à corriger, puis à re-passer.
type Cible = { chemin: string; persona: string };

const SORTIE = process.env.E2E_AUDIT_DIR ?? path.join(__dirname, ".audit");

const MATRICE: Cible[] = (() => {
  try {
    const ecrans = JSON.parse(
      fs.readFileSync(path.join(__dirname, "matrice-ecrans.json"), "utf8"),
    ) as { path: string; persona: string }[];
    const porteurs = [
      /\/agence\/[^/]+$/, // tableau de bord
      /\/parc$/,
      /\/baux\//,
      /\/incidents$/,
      /\/incident$/,
      /\/comptabilite$/,
      /\/alertes$/,
      /\/locataire\/[^/]+$/,
      /\/loyers$/,
      /\/connexion$/,
      /\/inscription$/,
    ];
    return ecrans
      .filter((e) => porteurs.some((p) => p.test(e.path)))
      .map((e) => ({ chemin: e.path, persona: e.persona }));
  } catch {
    return [{ chemin: "/connexion", persona: "public" }];
  }
})();

test("axe-core : violations sérieuses et critiques des écrans porteurs", async ({ browser }) => {
  test.setTimeout(30_000 + MATRICE.length * 25_000);
  fs.mkdirSync(SORTIE, { recursive: true });
  const rapport: Array<Record<string, unknown>> = [];
  for (const cible of MATRICE) {
    const storageState =
      cible.persona === "public"
        ? undefined
        : path.join(__dirname, ".auth", `${cible.persona}.json`);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
      await page.goto(cible.chemin, { waitUntil: "load", timeout: 20_000 });
      await page.waitForTimeout(800);
      const resultat = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const graves = resultat.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );
      rapport.push({
        chemin: cible.chemin,
        persona: cible.persona,
        violations: graves.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          noeuds: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
          nb: v.nodes.length,
        })),
      });
    } catch (err) {
      rapport.push({ chemin: cible.chemin, persona: cible.persona, erreur: String(err).slice(0, 200) });
    }
    await context.close();
  }
  fs.writeFileSync(path.join(SORTIE, "rapport-a11y.json"), JSON.stringify(rapport, null, 2));
});
