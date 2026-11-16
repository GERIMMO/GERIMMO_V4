/**
 * Les outils gratuits (29/09) sont publics : servis sans session, dans le plan
 * du site, ouverts aux robots, reliés depuis le pied de page et l'accueil, et
 * chaque page porte ses métadonnées et l'invitation à l'essai.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppelEssai } from "../src/components/outils/coquille-outil";
import { NextRequest } from "next/server";
import { OUTILS } from "../src/lib/outils/catalogue";
import { dureeEssai } from "../src/lib/tarifs";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";
import robots from "../src/app/robots";

const SRC = path.resolve(__dirname, "../src");
const lire = (p: string) => readFileSync(path.join(SRC, p), "utf8");
const CHEMINS = ["/outils", ...OUTILS.map((o) => o.chemin)];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});

describe("routes des outils gratuits", () => {
  it("le catalogue compte les cinq outils", () => {
    expect(OUTILS.map((o) => o.chemin)).toEqual([
      "/outils/calcul-irl",
      "/outils/quittance-de-loyer",
      "/outils/comparateur-gli-visale",
      "/outils/simulateur-lmnp",
      "/outils/rentabilite-locative",
    ]);
  });

  it.each(CHEMINS)("%s est servi sans session, sans détour par la connexion", async (chemin) => {
    const r = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });

  it("aucun outil n'est fermé aux robots", () => {
    const r = robots();
    const regle = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const interdits = ([] as string[]).concat(regle.disallow ?? []);
    for (const chemin of CHEMINS) expect(interdits.some((d) => chemin.startsWith(d))).toBe(false);
  });

  it.each(CHEMINS)("%s : une page, ses métadonnées canoniques et l'essai", (chemin) => {
    const fichier = `app${chemin}/page.tsx`;
    expect(existsSync(path.join(SRC, fichier))).toBe(true);
    const page = lire(fichier);
    expect(page).toContain("metadonneesPubliques(");
    expect(page).toContain(`chemin: "${chemin}"`);
    // L'invitation à l'essai vit dans la coquille commune (AppelEssai).
    expect(page).toMatch(/CoquilleOutil|AppelEssai/);
  });

  it("l'invitation mène à l'inscription, avec la durée d'essai du jour", () => {
    const coquille = lire("components/outils/coquille-outil.tsx");
    expect(coquille).toContain('href="/inscription"');
    expect(coquille).toContain("Créer mon compte — {duree} d&apos;essai");
    expect(coquille).toContain("const duree = dureeEssai();");
    expect(coquille).toContain("{badgeEssai()}");
    expect(dureeEssai()).toBe("2 mois");
  });

  it.each([
    ["/outils/calcul-irl", "vérifiez la clause et les indices"],
    ["/outils/quittance-de-loyer", "ou un reçu partiel"],
    ["/outils/comparateur-gli-visale", "estime le coût d’une garantie"],
    ["/outils/simulateur-lmnp", "simulation du meublé repose sur vos hypothèses"],
    ["/outils/rentabilite-locative", "estimation dépend de vos hypothèses"],
  ])("%s décrit son propre résultat et les fonctions réellement disponibles", (chemin, attendu) => {
    const contenu = renderToStaticMarkup(createElement(AppelEssai, { chemin }));
    expect(contenu).toContain(attendu);
    expect(contenu).toContain("Relances de loyer à préparer en PDF");
    expect(contenu).toContain("Aide à la 2044 pour la location nue au réel");
    expect(contenu).not.toMatch(/chaque mois pour vous|envoyées au locataire si|proposée à la date anniversaire/);
  });

  it("le pied de page public et l'accueil y renvoient", () => {
    expect(lire("components/chrome-public.tsx")).toContain('["/outils", "Outils gratuits"]');
    expect(lire("app/page.tsx")).toContain('href="/outils"');
  });

  it("la navigation partage les mêmes destinations sur ordinateur et mobile", () => {
    const chrome = lire("components/chrome-public.tsx");
    expect(chrome).toContain('["/outils", "Outils gratuits"]');
    expect(chrome).toContain('NAVIGATION.map(');
    expect(chrome).toContain('<MenuPublicMobile liens={NAVIGATION} />');
    const mobile = lire("components/menu-public-mobile.tsx");
    expect(mobile).toContain('aria-label="Navigation mobile"');
    expect(mobile).toContain('liens.map(');
  });

  it("l'accueil présente les outils juste sous le héros, et le héros y invite", () => {
    const accueil = lire("app/page.tsx");
    expect(accueil).toContain("Essayer nos outils gratuits");
    const vitrine = accueil.indexOf('aria-labelledby="outils-gratuits"');
    expect(vitrine).toBeGreaterThan(accueil.indexOf("</header>"));
    expect(vitrine).toBeLessThan(accueil.indexOf("Ce que Gerimmo remplace"));
    expect(accueil).toContain("outilsPresentes()");
  });

  it("les tarifs et les articles du journal renvoient aux outils", () => {
    expect(lire("app/tarifs/page.tsx")).toContain("<EncartOutils");
    expect(lire("app/journal/[slug]/page.tsx")).toContain("<EncartOutils");
  });

  it("chaque outil a son en-tête, « Comment c'est calculé » et « Bon à savoir »", () => {
    for (const o of OUTILS) {
      const page = lire(`app${o.chemin}/page.tsx`);
      expect(page).toContain(`chemin="${o.chemin}"`);
      expect(page).toMatch(/calcul=\{/);
      expect(page).toMatch(/bonASavoir=\{/);
    }
  });
});
