/**
 * Les onglets de /veille suivent le périmètre de la V1 publique (décision D33,
 * 14/10/2026 ; fiches DES-A-07 point 4 et VUI-05).
 *
 * Avant : « Tout voir · Propriétaires bailleurs · Agences et agents
 * immobiliers · Locataires » pour tout le monde, y compris pour un propriétaire
 * direct et son locataire, qui n'ont aucune notion d'agence dans leur espace.
 * Après : l'onglet « Agences » n'est proposé à personne. L'audience « agence »
 * reste une donnée valide (étude, écran de validation, base) : seul l'onglet
 * est masqué.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, auth: { getUser: mocks.getUser } }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import Page from "../src/app/veille/page";
import { ONGLETS_VEILLE, PUBLICS_VEILLE } from "../src/lib/veille-reglementaire";

let filtresContains: unknown[][];

beforeEach(() => {
  vi.clearAllMocks();
  filtresContains = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: "compte" } } });
  mocks.from.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "order", "range"]) q[methode] = () => q;
    q.contains = (...args: unknown[]) => {
      filtresContains.push(args);
      return q;
    };
    q.then = (suite: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(suite);
    return q;
  });
});

const rendre = async (params: { public?: string; page?: string; retour?: string } = {}) =>
  renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));

/** Le sélecteur d'audiences, seul. */
const onglets = (html: string) => {
  const debut = html.indexOf('aria-label="Informations par public"');
  expect(debut).toBeGreaterThan(-1);
  return html.slice(debut, html.indexOf("</nav>", debut));
};

describe("l'onglet « Agences » de /veille est masqué pour tous", () => {
  it.each([
    ["sans filtre", {}],
    ["propriétaire bailleur", { public: "bailleur" }],
    ["locataire", { public: "locataire" }],
  ])("%s : le sélecteur propose « Tout voir », bailleurs et locataires, et pas les agences", async (_nom, params) => {
    const nav = onglets(await rendre(params));
    expect(nav).toContain("Tout voir");
    expect(nav).toContain("Propriétaires bailleurs");
    expect(nav).toContain("Locataires");
    expect(nav).not.toContain("Agences");
    expect(nav).not.toContain("agents immobiliers");
    expect(nav).not.toContain("public=agence");
    // Les artisans lisent leurs règles dans leur espace (/artisan/regles) : pas d'onglet non plus.
    expect(nav).not.toContain("Artisans");
  });

  it("le menu d'un espace qui renvoie encore vers ?public=agence n'y retrouve pas non plus l'onglet", async () => {
    const nav = onglets(await rendre({ public: "agence", retour: "/agence/3c1d2f4a-0000-4000-8000-000000000001" }));
    expect(nav).not.toContain("Agences");
    expect(nav).toContain("Tout voir");
  });

  it("la liste des onglets est celle de la V1, dans l'ordre d'affichage", () => {
    expect([...ONGLETS_VEILLE]).toEqual(["bailleur", "locataire"]);
  });

  it("l'audience « agence » reste une donnée valide : on masque l'onglet, pas la valeur", () => {
    expect(PUBLICS_VEILLE.agence).toBe("Agences et agents immobiliers");
    expect(Object.keys(PUBLICS_VEILLE)).toEqual(["artisan", "bailleur", "agence", "locataire"]);
  });

  it("l'onglet bailleur filtre toujours sur l'audience « bailleur »", async () => {
    await rendre({ public: "bailleur" });
    expect(filtresContains).toEqual([["publics", ["bailleur"]]]);
  });

  it("?public=artisan renvoie toujours vers l'espace artisan", async () => {
    await expect(rendre({ public: "artisan" })).rejects.toThrow("REDIRECT:/artisan/regles");
  });
});
