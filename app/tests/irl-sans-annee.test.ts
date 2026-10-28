/**
 * Relecture 2 de l'audit final (BAIL-02) : un brouillon dont le trimestre IRL n'a pas d'année (« T2 ») n'imprime jamais
 * « Trimestre de référence : T2 ». La génération du contrat et la préparation d'un circuit sont refusées avec un message
 * clair, et le contrôle du dossier le compte comme une information à compléter, sauf si le contrat est déjà parti en
 * signature : l'activation le recalcule alors à l'identique (empreinte).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ verifier: vi.fn(), depot: vi.fn(), assembler: vi.fn(), rendre: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.verifier }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: m.depot }));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: vi.fn() }));
vi.mock("@/lib/documents/marque", () => ({ appliquerMarqueDocument: (d: unknown) => d }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: m.rendre, copieDeTravail: vi.fn() }));
vi.mock("@/lib/documents/completude", () => ({ refusDocumentIncomplet: vi.fn(() => null) }));
vi.mock("@/lib/documents/modeles", () => ({ MODELES: { bail_nu: { assembler: m.assembler, typeGed: "bail" }, notice: { assembler: m.assembler, typeGed: "courrier" } } }));
import { genererDocument } from "../src/app/actions/documents-generes";
import { MANQUE_ANNEE_IRL, REFUS_ANNEE_IRL, trimestreIrlSansAnnee } from "../src/lib/documents/completude-brouillon-bail";
import { champsManquantsBail } from "../src/lib/reperes-bail";

function base(bail: Record<string, unknown>, circuits: unknown[] = []) {
  const table = (donnees: unknown) => { const q: Record<string, unknown> = {}; Object.assign(q, { select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, limit: () => q, upsert: async () => ({ error: null }), maybeSingle: async () => ({ data: donnees, error: null }), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: donnees, error: null }).then(ok) }); return q; };
  return { from: (t: string) => t === "baux" ? table(bail) : t === "bail_signature_circuits" ? table(circuits) : table([]) };
}
const brouillon = { id: "b1", etat: "brouillon", revision_irl: true, irl_trimestre: "T2" };

beforeEach(() => {
  vi.clearAllMocks();
  m.assembler.mockResolvedValue({ document: {}, liens: [{ entite: "bail", entiteId: "b1" }], titreGed: "Bail nu — T2 · X (à faire signer)", nomFichier: "bail" });
  m.rendre.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  m.depot.mockResolvedValue({ documentId: "doc" });
});

describe("trimestre IRL sans année (relecture 2, BAIL-02)", () => {
  it("le contrat d'un brouillon hors signature n'est pas généré : message clair et information à compléter", async () => {
    m.verifier.mockResolvedValue({ user: { id: "u" }, role: "proprietaire_direct", supabase: base(brouillon) });
    const r = await genererDocument("org", "bail_nu", "b1", "/espace/org/baux/b1");
    expect(r).toMatchObject({ erreur: REFUS_ANNEE_IRL, manquants: [MANQUE_ANNEE_IRL] });
    expect(m.depot).not.toHaveBeenCalled();
    // Le contrôle du dossier pointe le champ Trimestre IRL de l'étape Loyer.
    expect([...champsManquantsBail([MANQUE_ANNEE_IRL])]).toEqual(["bail.irl_trimestre"]);
  });
  it("un trimestre daté, une révision non prévue ou un autre document passent", async () => {
    for (const bail of [{ ...brouillon, irl_trimestre: "T2 2025" }, { ...brouillon, revision_irl: false }]) {
      m.verifier.mockResolvedValue({ user: { id: "u" }, role: "proprietaire_direct", supabase: base(bail) });
      expect((await genererDocument("org", "bail_nu", "b1", "/r")).erreur).toBeUndefined();
    }
    m.verifier.mockResolvedValue({ user: { id: "u" }, role: "proprietaire_direct", supabase: base(brouillon) });
    expect((await genererDocument("org", "notice", "b1", "/r")).erreur).toBeUndefined();
  });
  it("un contrat parti en signature ou un bail signé garde sa valeur : pas de manque imposé", async () => {
    expect(await trimestreIrlSansAnnee(base(brouillon, [{ id: "c" }]) as never, "org", brouillon)).toBe(false);
    expect(await trimestreIrlSansAnnee(base(brouillon) as never, "org", { ...brouillon, etat: "actif" })).toBe(false);
    expect(await trimestreIrlSansAnnee(base(brouillon) as never, "org", brouillon)).toBe(true);
  });
});
