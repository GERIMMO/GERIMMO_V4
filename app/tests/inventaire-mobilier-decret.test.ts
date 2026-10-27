/**
 * Décision du 27/10 (audit #264, CB-14) : l'inventaire du bail meublé reçoit les onze
 * éléments du décret n° 2015-981 en un geste, sans doublon au second clic, et chaque
 * ligne se complète (quantité, état) sur place. La liste est unique (lib/inventaire-meuble).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILIER_DECRET_2015_981, cleDesignation, mobilierDecretManquant } from "@/lib/inventaire-meuble";
const mocks = vi.hoisted(() => ({ acces: vi.fn(), revalider: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: mocks.acces }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalider }));
import { ajouterMobilierDecret, modifierInventaireLigne } from "@/app/actions/baux";
beforeEach(() => vi.clearAllMocks());

describe("liste du décret", () => {
  it("compte onze éléments distincts", () => {
    expect(MOBILIER_DECRET_2015_981).toHaveLength(11);
    expect(new Set(MOBILIER_DECRET_2015_981.map(cleDesignation)).size).toBe(11);
  });
  it("reconnaît un élément déjà présent malgré la casse, les accents et les espaces", () => {
    expect(mobilierDecretManquant(["  LITERIE (couette/couverture) ", "Etageres de  rangement", "Canapé"])).toEqual(
      MOBILIER_DECRET_2015_981.filter((e) => !/^Literie|^Étagères/.test(e))
    );
    expect(mobilierDecretManquant([...MOBILIER_DECRET_2015_981])).toEqual([]);
  });
});

function client(existantes: { designation: string }[], erreurInsertion: unknown = null) {
  const inserts: unknown[] = [];
  const lectureFiltres: unknown[] = [];
  const lecture = { select: () => lecture, eq: (k: string, v: unknown) => { lectureFiltres.push([k, v]); return lecture; }, then: (r: (x: unknown) => void) => r({ data: existantes, error: null }) };
  const table = { select: () => lecture, insert: async (lignes: unknown) => { inserts.push(lignes); return { error: erreurInsertion }; } };
  mocks.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { from: () => table } });
  return { inserts, lectureFiltres };
}

describe("ajouterMobilierDecret", () => {
  it("crée les onze lignes d'un inventaire vide, en un exemplaire, sans état, dans l'ordre du décret", async () => {
    const { inserts, lectureFiltres } = client([]);
    const retour = await ajouterMobilierDecret("org", "bail", {}, new FormData());
    expect(retour.succes).toBe("11 éléments ajoutés à l'inventaire : précisez l'état et la quantité de chacun.");
    expect(lectureFiltres).toEqual([["bail_id", "bail"], ["organization_id", "org"]]);
    const lignes = inserts[0] as Record<string, unknown>[];
    expect(lignes.map((l) => l.designation)).toEqual([...MOBILIER_DECRET_2015_981]);
    expect(lignes.map((l) => l.ordre)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(lignes.every((l) => l.bail_id === "bail" && l.organization_id === "org" && l.quantite === 1 && !("etat" in l))).toBe(true);
    expect(mocks.revalider).toHaveBeenCalledWith("/agence/org/baux/bail");
  });
  it("saute les éléments déjà présents et les compte dans le message", async () => {
    const { inserts } = client([{ designation: "luminaires" }, { designation: "Table et sièges" }, { designation: "Canapé" }]);
    const retour = await ajouterMobilierDecret("org", "bail", {}, new FormData());
    expect(retour.succes).toBe("9 éléments ajoutés à l'inventaire : précisez l'état et la quantité de chacun. 2 éléments déjà présents.");
    const lignes = inserts[0] as Record<string, unknown>[];
    expect(lignes).toHaveLength(9);
    expect(lignes.map((l) => l.designation)).not.toContain("Luminaires");
    expect(lignes.find((l) => l.designation === "Plaques de cuisson")?.ordre).toBe(3);
  });
  it("n'écrit rien au second clic : les onze éléments sont déjà là", async () => {
    const { inserts } = client(MOBILIER_DECRET_2015_981.map((designation) => ({ designation })));
    expect(await ajouterMobilierDecret("org", "bail", {}, new FormData())).toEqual({ succes: "Aucun élément ajouté : 11 éléments déjà présents." });
    expect(inserts).toEqual([]);
    expect(mocks.revalider).not.toHaveBeenCalled();
  });
  it("refuse sans gérant de l'organisation, avant toute lecture", async () => {
    const from = vi.fn();
    mocks.acces.mockResolvedValue({ user: null, supabase: { from } });
    expect(await ajouterMobilierDecret("org", "bail", {}, new FormData())).toEqual({ erreur: "Accès refusé." });
    expect(from).not.toHaveBeenCalled();
  });
  it("remonte le refus de la base sans confirmer", async () => {
    client([], { message: "new row violates row-level security policy" });
    const retour = await ajouterMobilierDecret("org", "autre-bail", {}, new FormData());
    expect(retour.erreur).toBeTruthy();
    expect(retour.succes).toBeUndefined();
    expect(mocks.revalider).not.toHaveBeenCalled();
  });
});

function clientModification(data: unknown, error: unknown = null) {
  const filtres: unknown[] = [];
  let valeurs: unknown;
  const q = { update: (v: unknown) => { valeurs = v; return q; }, eq: (k: string, v: unknown) => { filtres.push([k, v]); return q; }, select: async () => ({ data, error }) };
  mocks.acces.mockResolvedValue({ user: { id: "gerant" }, supabase: { from: () => q } });
  return { filtres, valeurs: () => valeurs };
}
function saisie(quantite: string, etat: string) {
  const f = new FormData(); f.set("quantite", quantite); f.set("etat", etat); return f;
}

describe("modifierInventaireLigne", () => {
  it("complète la quantité et l'état de la ligne du bail affiché", async () => {
    const c = clientModification([{ id: "meuble" }]);
    expect(await modifierInventaireLigne("org", "bail", "meuble", {}, saisie("2", "bon"))).toHaveProperty("succes");
    expect(c.valeurs()).toEqual({ quantite: 2, etat: "bon" });
    expect(c.filtres).toEqual([["id", "meuble"], ["bail_id", "bail"], ["organization_id", "org"]]);
    expect(mocks.revalider).toHaveBeenCalledWith("/agence/org/baux/bail");
  });
  it("laisse l'état « à préciser » vide en base", async () => {
    const c = clientModification([{ id: "meuble" }]);
    await modifierInventaireLigne("org", "bail", "meuble", {}, saisie("1", ""));
    expect(c.valeurs()).toEqual({ quantite: 1, etat: null });
  });
  it("refuse une quantité nulle ou un état inconnu en reposant la saisie, sans écrire", async () => {
    const c = clientModification([{ id: "meuble" }]);
    expect(await modifierInventaireLigne("org", "bail", "meuble", {}, saisie("0", "bon"))).toMatchObject({ erreur: expect.stringContaining("quantité"), valeurs: { quantite: "0", etat: "bon" } });
    expect(await modifierInventaireLigne("org", "bail", "meuble", {}, saisie("1", "cassé"))).toMatchObject({ erreur: expect.stringContaining("état") });
    expect(c.valeurs()).toBeUndefined();
  });
  it("ne confirme pas une modification hors du bail ou sans gérant", async () => {
    clientModification([]);
    expect(await modifierInventaireLigne("org", "bail", "autre", {}, saisie("1", "bon"))).toHaveProperty("erreur");
    expect(mocks.revalider).not.toHaveBeenCalled();
    mocks.acces.mockResolvedValue({ user: null });
    expect(await modifierInventaireLigne("org", "bail", "meuble", {}, saisie("1", "bon"))).toEqual({ erreur: "Accès refusé." });
  });
});
