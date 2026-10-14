/**
 * Décision D26 B (fiche DES-A-06 du 13/10/2026) : une page de repli hors ligne SANS service worker. Hors ligne, un clic
 * sur un lien de l'application menait à la page d'erreur du navigateur (« No internet », en anglais), qui ne se
 * corrigeait pas au retour du réseau. Désormais, quand l'appareil n'a plus de réseau, le clic sur un lien qui quitte la
 * page est retenu : l'utilisateur reste dans l'application, voit un message en français et un bouton « Réessayer ».
 *
 * Pas de service worker, donc aucune page authentifiée mise en cache sur l'appareil (l'option C, à ne pas faire avant D14).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TEXTES_HORS_LIGNE, doitRetenirLeClic, messageDuRepli } from "../src/lib/repli-hors-ligne";

const RACINE = path.resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(path.join(RACINE, chemin), "utf8");
function fichiers(dossier: string, ext: RegExp): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === "node_modules" || nom === ".next" ? [] : fichiers(chemin, ext);
    return ext.test(chemin) ? [chemin] : [];
  });
}

const clicSimple = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const lien = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: "", download: false, ...extra });
const PAGE = "https://gerimmo.example/agence/abc/parc";

describe("quel clic est retenu hors ligne ?", () => {
  it("retient un clic simple sur un lien de l'application quand l'appareil est hors ligne", () => {
    expect(doitRetenirLeClic(clicSimple, lien("https://gerimmo.example/agence/abc/finances"), PAGE, false)).toBe(true);
    expect(doitRetenirLeClic(clicSimple, lien("/agence/abc/finances"), PAGE, false)).toBe(true);
  });

  it("ne retient rien quand le réseau est là : Next.js navigue comme avant", () => {
    expect(doitRetenirLeClic(clicSimple, lien("https://gerimmo.example/agence/abc/finances"), PAGE, true)).toBe(false);
  });

  it("laisse passer ce qui ne quitte pas la page : ancre, nouvel onglet, téléchargement, clic modifié, lien non web", () => {
    expect(doitRetenirLeClic(clicSimple, lien(`${PAGE}#bas`), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic(clicSimple, lien("https://gerimmo.example/x", { target: "_blank" }), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic(clicSimple, lien("https://gerimmo.example/quittance.pdf", { download: true }), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic({ ...clicSimple, ctrlKey: true }, lien("https://gerimmo.example/x"), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic({ ...clicSimple, button: 1 }, lien("https://gerimmo.example/x"), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic({ ...clicSimple, defaultPrevented: true }, lien("https://gerimmo.example/x"), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic(clicSimple, lien("mailto:aide@gerimmo.example"), PAGE, false)).toBe(false);
    expect(doitRetenirLeClic(clicSimple, lien("tel:+33100000000"), PAGE, false)).toBe(false);
  });
});

describe("les textes (français, sans jargon)", () => {
  it("dit la perte de connexion, que l'on reste sur la page, et propose « Réessayer »", () => {
    expect(TEXTES_HORS_LIGNE.titre).toBe("Connexion perdue");
    expect(TEXTES_HORS_LIGNE.reessayer).toBe("Réessayer");
    expect(messageDuRepli({ connexionRevenue: false, echecReessai: false })).toMatch(/plus connecté à Internet/);
    expect(messageDuRepli({ connexionRevenue: false, echecReessai: false })).toMatch(/Vous restez sur cette page/);
  });

  it("change de message quand on réessaie sans réseau, et quand le réseau revient", () => {
    const hors = messageDuRepli({ connexionRevenue: false, echecReessai: false });
    const echec = messageDuRepli({ connexionRevenue: false, echecReessai: true });
    const revenue = messageDuRepli({ connexionRevenue: true, echecReessai: false });
    expect(new Set([hors, echec, revenue]).size).toBe(3);
    expect(echec).toMatch(/pas revenue/);
    expect(revenue).toMatch(/connexion est revenue/);
    expect(revenue).toMatch(/Réessayer/);
  });

  it("ne contient ni anglais ni code d'erreur du navigateur", () => {
    for (const texte of Object.values(TEXTES_HORS_LIGNE)) expect(texte).not.toMatch(/offline|ERR_|network|retry/i);
  });
});

describe("l'application (D26 B)", () => {
  it("le gabarit racine monte le repli, pour tous les espaces", () => {
    const layout = lire("src/app/layout.tsx");
    expect(layout).toContain('import { RepliHorsLigne } from "@/components/repli-hors-ligne"');
    expect(layout).toMatch(/<RepliHorsLigne\s*\/>/);
  });

  it("le composant retient le clic avant les autres gardes (capture sur window), annonce le message et rend la main", () => {
    const composant = lire("src/components/repli-hors-ligne.tsx");
    expect(composant).toMatch(/window\.addEventListener\("click",\s*\w+,\s*true\)/);
    expect(composant).toContain('role="alert"');
    expect(composant).toContain("TEXTES_HORS_LIGNE.reessayer");
    expect(composant).toMatch(/Escape/);
    expect(composant).toMatch(/navigator\.onLine/);
  });

  it("aucun service worker, aucun cache de pages authentifiées (D26 B, pas C)", () => {
    const sources = fichiers(path.join(RACINE, "src"), /\.(ts|tsx|js|mjs)$/)
      .filter((f) => !f.endsWith(`${path.sep}repli-hors-ligne.test.ts`));
    const enregistrement = sources.filter((f) => /serviceWorker|\.register\(\s*["'`]\/?[^"'`]*sw|workbox|CacheStorage|caches\.open/i.test(readFileSync(f, "utf8")));
    expect(enregistrement.map((f) => path.relative(RACINE, f))).toEqual([]);
    for (const nom of ["sw.js", "service-worker.js", "serwist.js", "workbox-sw.js", "manifest.json", "manifest.webmanifest"]) {
      expect(existsSync(path.join(RACINE, "public", nom)), `public/${nom}`).toBe(false);
    }
    expect(existsSync(path.join(RACINE, "src", "app", "sw.ts"))).toBe(false);
    expect(lire("next.config.ts")).not.toMatch(/Service-Worker-Allowed/i);
  });
});
