import { beforeEach, describe, expect, it, vi } from "vitest";
import { rechercherDansSupervision } from "@/app/actions/recherche-supervision";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

type LigneReference = { type_objet: string; organisation_id: string; organisation_nom: string; nombre: number; groupes: number };

function preparer(options: { autorise?: boolean; erreur?: string; references?: LigneReference[] } = {}) {
  const lectures: { table: string; appels: unknown[][] }[] = [];
  const lignes: Record<string, Record<string, unknown>[]> = {
    organizations: [
      { id: "org", name: "Agence Alpha", type: "agence", status: "active", city: "Paris", email_contact: "alpha@test.fr" },
      // Sans `type` : une agence, comme sur la page Clients (25/09).
      { id: "sans-type", name: "Alpha Gestion", type: null, status: "essai", city: null, email_contact: null },
      { id: "direct", name: "Alpha Bailleur", type: "proprietaire_direct", status: "active", city: null, email_contact: null },
    ],
    artisans: [{ id: "artisan", raison_sociale: "Plomberie Alpha", statut_plateforme: "valide", email: "artisan@test.fr", siret: "123" }],
  };
  const from = vi.fn((table: string) => {
    const appels: unknown[][] = [];
    lectures.push({ table, appels });
    const q: Record<string, unknown> = {};
    for (const methode of ["select", "or", "order"])
      q[methode] = (...args: unknown[]) => { appels.push([methode, ...args]); return q; };
    q.limit = (n: number) => {
      appels.push(["limit", n]);
      return Promise.resolve({ data: lignes[table] ?? [], error: options.erreur === table ? { message: "indisponible" } : null });
    };
    return q;
  });
  const rpc = vi.fn(async (fonction: string) => {
    if (fonction === "is_super_admin") return { data: options.autorise ?? true, error: null };
    if (fonction === "rechercher_reference_supervision") {
      return options.erreur === fonction ? { data: null, error: { message: "indisponible" } } : { data: options.references ?? [], error: null };
    }
    return { data: [], error: options.erreur === fonction ? { message: "indisponible" } : null };
  });
  mocks.createClient.mockResolvedValue({ from, rpc });
  return { from, rpc, lectures };
}

beforeEach(() => vi.resetAllMocks());

describe("recherche transversale de la supervision", () => {
  it("refuse avant toute lecture si le compte n'est pas Super Admin", async () => {
    const c = preparer({ autorise: false });
    await expect(rechercherDansSupervision("alpha")).rejects.toThrow("supervision");
    expect(c.from).not.toHaveBeenCalled();
  });

  it("retrouve organisations et artisans et ouvre leurs fiches", async () => {
    const c = preparer();
    const r = await rechercherDansSupervision(" alpha ");
    expect(r.resultats.map((x) => x.href)).toEqual([
      "/admin/organisations/org",
      "/admin/organisations/sans-type",
      "/admin/organisations/direct",
      "/admin/clients/artisans/artisan",
    ]);
    // Le même classement que Clients, et des statuts en français.
    expect(r.resultats[1].detail).toBe("Agence · En essai");
    expect(r.resultats[2].detail).toBe("Propriétaire bailleur · Active");
    expect(r.resultats[3].detail).toContain("Validé");
    expect(r.resultats[3].detail).not.toContain("valide ");
    for (const lecture of c.lectures) {
      expect(lecture.appels.find((a) => a[0] === "or")?.[1]).toContain("alpha");
      expect(lecture.appels).toContainEqual(["limit", 8]);
    }
  });

  it("distingue une lecture en panne d'une recherche vide", async () => {
    preparer({ erreur: "artisans" });
    expect(await rechercherDansSupervision("alpha")).toMatchObject({ erreur: expect.any(String) });
  });
});

// X18 (fiche SA-09), décision du 14/10/2026 : un bien, un lot ou un incident se retrouve par sa référence exacte ; le résultat
// est un lien vers la FICHE DE L'ORGANISATION (entrer dans l'espace reste la traversée tracée, D08), sans contenu.
describe("recherche par référence (bien, lot, incident)", () => {
  const ALPHA = "11111111-1111-4111-8111-111111111111";
  const BETA = "22222222-2222-4222-8222-222222222222";

  it("le non-superviseur est refusé avant toute recherche, y compris par référence", async () => {
    const c = preparer({ autorise: false });
    await expect(rechercherDansSupervision("INC-2026-0003")).rejects.toThrow("supervision");
    expect(c.rpc.mock.calls.map((a) => a[0])).toEqual(["is_super_admin"]);
  });

  it("demande la référence saisie (espaces normalisés) à la base, qui la trace", async () => {
    const c = preparer();
    await rechercherDansSupervision("  INC-2026-0003  ");
    expect(c.rpc).toHaveBeenCalledWith("rechercher_reference_supervision", { p_reference: "INC-2026-0003" });
  });

  it("un incident trouvé : un lien vers la fiche de son organisation, avec le type d'objet et rien d'autre", async () => {
    preparer({ references: [{ type_objet: "incident", organisation_id: ALPHA, organisation_nom: "Agence Alpha", nombre: 1, groupes: 1 }] });
    const r = await rechercherDansSupervision("INC-2026-0003");
    expect(r.resultats[0]).toEqual({
      id: ALPHA,
      type: "Incident",
      titre: "Agence Alpha",
      detail: "Un incident de cette organisation porte cette référence · ouvrir la fiche de l’organisation",
      href: `/admin/organisations/${ALPHA}`,
    });
    expect(r.erreur).toBeUndefined();
    expect(r.remarque).toBeUndefined();
  });

  it("les références exactes passent en tête, avant les clients trouvés par leur nom", async () => {
    preparer({
      references: [
        { type_objet: "bien", organisation_id: ALPHA, organisation_nom: "Agence Alpha", nombre: 1, groupes: 3 },
        { type_objet: "lot", organisation_id: ALPHA, organisation_nom: "Agence Alpha", nombre: 2, groupes: 3 },
        { type_objet: "lot", organisation_id: BETA, organisation_nom: "Agence Bêta", nombre: 1, groupes: 3 },
      ],
    });
    const r = await rechercherDansSupervision("alpha");
    expect(r.resultats.map((x) => [x.type, x.titre, x.href])).toEqual([
      ["Bien", "Agence Alpha", `/admin/organisations/${ALPHA}`],
      ["Lot", "Agence Alpha", `/admin/organisations/${ALPHA}`],
      ["Lot", "Agence Bêta", `/admin/organisations/${BETA}`],
      ["Organisation", "Agence Alpha", "/admin/organisations/org"],
      ["Organisation", "Alpha Gestion", "/admin/organisations/sans-type"],
      ["Organisation", "Alpha Bailleur", "/admin/organisations/direct"],
      ["Artisan", "Plomberie Alpha", "/admin/clients/artisans/artisan"],
    ]);
    expect(r.resultats[1].detail).toBe("2 lots de cette organisation portent cette référence · ouvrir la fiche de l’organisation");
  });

  it("plus de huit organisations : le dit, et invite à saisir l'identifiant complet", async () => {
    const references = Array.from({ length: 8 }, (_, i) => ({
      type_objet: "incident", organisation_id: `0000000${i}-0000-4000-8000-000000000000`, organisation_nom: `Agence ${i}`, nombre: 1, groupes: 11,
    }));
    preparer({ references });
    const r = await rechercherDansSupervision("INC-2026-0001");
    expect(r.resultats.filter((x) => x.type === "Incident")).toHaveLength(8);
    expect(r.remarque).toBe("11 résultats en tout, 8 affichés : saisissez l’identifiant complet du bien, du lot ou de l’incident pour n’en garder qu’un.");
  });

  it("une ligne inattendue de la base est ignorée plutôt qu'affichée", async () => {
    preparer({
      references: [
        { type_objet: "bail", organisation_id: ALPHA, organisation_nom: "Agence Alpha", nombre: 1, groupes: 2 },
        { type_objet: "lot", organisation_id: "pas-un-identifiant", organisation_nom: "Agence Alpha", nombre: 1, groupes: 2 },
      ],
    });
    const r = await rechercherDansSupervision("Lot 1");
    expect(r.resultats.filter((x) => ["Bien", "Lot", "Incident"].includes(x.type))).toEqual([]);
  });

  it("une recherche par référence en panne se dit, les autres résultats restent", async () => {
    preparer({ erreur: "rechercher_reference_supervision" });
    const r = await rechercherDansSupervision("alpha");
    expect(r.erreur).toEqual(expect.any(String));
    expect(r.resultats.map((x) => x.type)).toContain("Organisation");
  });
});
