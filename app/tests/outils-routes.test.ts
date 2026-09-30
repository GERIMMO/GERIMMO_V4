/**
 * Les outils gratuits (29/09) sont publics : servis sans session, dans le plan
 * du site, ouverts aux robots, reliés depuis le pied de page et l'accueil, et
 * chaque page porte ses métadonnées et l'invitation à l'essai.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OUTILS } from "../src/lib/outils/catalogue";
import { DUREE_ESSAI } from "../src/lib/tarifs";

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

  it("l'invitation mène à l'inscription, 2 mois d'essai", () => {
    const coquille = lire("components/outils/coquille-outil.tsx");
    expect(coquille).toContain('href="/inscription"');
    expect(coquille).toContain("Créer mon compte — {DUREE_ESSAI} d&apos;essai");
    expect(DUREE_ESSAI).toBe("2 mois");
  });

  it("le pied de page public et l'accueil y renvoient", () => {
    expect(lire("components/chrome-public.tsx")).toContain('["/outils", "Outils gratuits"]');
    expect(lire("app/page.tsx")).toContain('href="/outils"');
  });

  it("l'en-tête public les montre à toutes les largeurs (30/09)", () => {
    const chrome = lire("components/chrome-public.tsx");
    const entete = chrome.slice(chrome.indexOf("export function EnTetePublic"), chrome.indexOf("function BandeauPublic"));
    // La ligne du téléphone (jusqu'à 768 px) et le lien de la navigation (au-delà).
    expect(entete).toMatch(/aria-label="Outils gratuits"[\s\S]*md:hidden/);
    expect(chrome).toMatch(/href="\/outils"\s+className="hidden [^"]*md:inline-flex"/);
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
