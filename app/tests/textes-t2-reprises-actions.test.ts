/**
 * Petites reprises du lot T2 — ce qui passe par les actions du serveur.
 *
 * T2R-7 : un bail nu à durée réduite, préparé et signé AVANT que Gerimmo refuse de préparer ce contrat (lot T2, R17-A2),
 * doit rester activable. Le test du lot T2 remplaçait `assemblerSignatureBail` par une imitation ; celui-ci passe par le
 * vrai recalcul (`activerBailApresSignature` → `assemblerSignatureBail` → modèle du bail → empreinte), avec l'empreinte
 * relevée sur la production (81740dec) pour ce même dossier (`riche_nu` de signature-empreinte-avant-g8.test.ts). Seuls la
 * lecture du dossier en base et l'accès sont imités.
 *
 * T2R-1 : le refus de retirer une personne d'un bail signé n'affirme plus les six mois sans condition.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte, personne } from "./fixtures/contexte-document";

const m = vi.hoisted(() => ({ acces: vi.fn(), contexte: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: vi.fn() }));
vi.mock("@/lib/email", () => ({ envoyerEmail: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({ ...(await original<typeof import("@/lib/documents/modeles/communs")>()), chargerContexteBail: m.contexte }));

import type { ContexteBail } from "@/lib/documents/modeles/communs";
import { Fusion } from "@/lib/documents/gabarit";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { REFUS_BAIL_DUREE_REDUITE } from "@/lib/documents/modeles/mentions-location";
import { assemblerSignatureBail, documentSignatureBail, partiesSignatureBail } from "@/lib/signature-bail";
import { activerBailApresSignature } from "@/app/actions/signature-bail";
import { supprimerBailPersonne } from "@/app/actions/baux";
import { REFUS_RETRAIT_BAIL_SIGNE } from "@/lib/solidarite-colocation";

const ORG = "22222222-2222-4222-8222-222222222222", BAIL = "11111111-1111-4111-8111-111111111111";
/** L'empreinte calculée par la production (81740dec) pour le dossier « riche », bail nu : voir signature-empreinte-avant-g8. */
const EMPREINTE_PRODUCTION_RICHE_NU = "83fff43b6a57098d8c525a06920ea162ee826cbdb1a7b019986d56328e66e958";

const p = (o: Record<string, unknown>) => ({
  ...personne(o as never),
  email: o.email as string,
  telephone: (o.telephone as string) ?? "+33600000001",
  qualite: "personne physique",
  siren: (o.siren as string) ?? null,
});
/** Le dossier « riche » du test des empreintes de production : indivision, travaux, et un événement de durée réduite. */
function riche(evenement: string | null = "Mutation professionnelle prévue."): ContexteBail {
  const ctx = contexte({ garants: [] } as never);
  ctx.locataires = [p({ id: "l1", nom: "Martin", prenom: "Lea", email: "locataire@example.invalid" }) as never];
  ctx.bailleurs = [
    { ...p({ id: "b1", nom: "Durand", prenom: "Paul", email: "bailleur@example.invalid", telephone: "+33600000002" }), quote_part: 62.5 } as never,
    { ...p({ id: "b2", nom: "Durand", prenom: "Anne", email: "bailleur2@example.invalid", telephone: "+33600000003", siren: "123456789" }), quote_part: 37.5 } as never,
  ];
  Object.assign(ctx.lot, { nom: "T2", etage: "2e étage, porte gauche", surface_m2: "45.00" });
  Object.assign(ctx.bail, { jour_echeance: 1, duree_reduite_evenement: evenement, travaux_recents: "Peinture refaite.", travaux_recents_montant: 1200, precedente_location: "relocation" });
  return ctx;
}

/** La base imitée : le circuit signé, un DPE de classe D, aucune annexe, aucune personne sortie. Elle note les appels RPC. */
function base(circuit: Record<string, unknown>) {
  const rpc = vi.fn(async (nom: string) => (nom === "has_org_role" ? { data: true, error: null } : nom === "representants_actifs_bail" ? { data: [], error: null } : { data: null, error: null }));
  const from = (table: string) => {
    const une = table === "bail_signature_circuits" ? circuit : table === "baux" ? { reglement_copropriete: null, etat: "brouillon" } : table === "diagnostics" ? { classe_dpe: "D" } : null;
    const q: Record<string, unknown> = { single: async () => ({ data: une, error: null }), maybeSingle: async () => ({ data: une, error: null }), then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) };
    for (const op of ["select", "eq", "is", "in", "or", "order", "limit"]) q[op] = () => q;
    return q;
  };
  return { db: { rpc, from } as unknown as SupabaseClient, rpc };
}
const circuitSigne = (empreinte: string) => ({ id: "circuit", bail_id: BAIL, modele: "bail", etat: "termine", empreinte, signataires: [], annexes: [] });
const activations = (rpc: ReturnType<typeof base>["rpc"]) => rpc.mock.calls.filter((c) => c[0] === "activer_bail_signature_electronique");

beforeEach(() => { vi.clearAllMocks(); });

describe("T2R-7 — activation d'un bail nu à durée réduite signé avant le refus du lot T2 (vrai recalcul de l'empreinte)", () => {
  it("le rendu du jour de ce dossier est bien refusé : c'est le rendu archivé qui doit le reconnaître", async () => {
    m.contexte.mockImplementation(async () => riche());
    const { db } = base(circuitSigne(EMPREINTE_PRODUCTION_RICHE_NU));
    await expect(assemblerSignatureBail(db, ORG, BAIL, { noticeDuCircuit: null })).rejects.toThrow(REFUS_BAIL_DUREE_REDUITE);
    expect((await assemblerSignatureBail(db, ORG, BAIL, { typographieArchivee: true, noticeDuCircuit: null })).empreinte).toBe(EMPREINTE_PRODUCTION_RICHE_NU);
  });

  it("le bail signé s'active : l'empreinte de la production est retrouvée, la base reçoit l'activation", async () => {
    m.contexte.mockImplementation(async () => riche());
    const { db, rpc } = base(circuitSigne(EMPREINTE_PRODUCTION_RICHE_NU));
    m.acces.mockResolvedValue({ supabase: db, user: { id: "proprietaire" } });
    const vue = await activerBailApresSignature(ORG, BAIL, "circuit");
    expect(vue.erreur).toBeUndefined();
    expect(vue.succes).toContain("Le bail est activé");
    expect(activations(rpc)).toEqual([["activer_bail_signature_electronique", { p_circuit: "circuit" }]]);
  });

  it("le même dossier modifié après la signature (autre événement) n'est PAS activé", async () => {
    m.contexte.mockImplementation(async () => riche("Retour de mutation du bailleur en 2028."));
    const { db, rpc } = base(circuitSigne(EMPREINTE_PRODUCTION_RICHE_NU));
    m.acces.mockResolvedValue({ supabase: db, user: { id: "proprietaire" } });
    const vue = await activerBailApresSignature(ORG, BAIL, "circuit");
    expect(vue.erreur).toContain("Les informations du dossier ont changé après la préparation du contrat");
    expect(activations(rpc)).toEqual([]);
  });

  it("témoin : sans durée réduite, un bail préparé aujourd'hui s'active par le rendu du jour (le recalcul n'est pas contourné)", async () => {
    m.contexte.mockImplementation(async () => riche(null));
    const ctx = riche(null);
    const duJour = documentSignatureBail(construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() }), partiesSignatureBail(ctx as never).signataires, [], 0).empreinte;
    expect(duJour).not.toBe(EMPREINTE_PRODUCTION_RICHE_NU);
    const { db, rpc } = base(circuitSigne(duJour));
    m.acces.mockResolvedValue({ supabase: db, user: { id: "proprietaire" } });
    expect((await activerBailApresSignature(ORG, BAIL, "circuit")).erreur).toBeUndefined();
    expect(activations(rpc)).toHaveLength(1);
  });
});

describe("T2R-1 — retirer une personne d'un bail signé : le refus ne promet plus les six mois sans condition", () => {
  it("le message dit la règle de la colocation et sa limite (époux, partenaires de PACS)", async () => {
    const q: Record<string, unknown> = { maybeSingle: async () => ({ data: { etat: "actif" }, error: null }) };
    for (const op of ["select", "eq"]) q[op] = () => q;
    const supprimer = vi.fn();
    m.acces.mockResolvedValue({ supabase: { from: () => ({ ...q, delete: supprimer }) }, user: { id: "agent" } });
    const etat = await supprimerBailPersonne(ORG, BAIL, "ligne");
    expect(etat.erreur).toBe(REFUS_RETRAIT_BAIL_SIGNE);
    expect(etat.erreur).toContain("En colocation, sa solidarité et celle de son garant courent encore six mois au plus (art. 8-1 de la loi du 6 juillet 1989).");
    expect(etat.erreur).toContain("Cette règle ne s’applique pas si le bail a été consenti exclusivement à des époux ou à des partenaires liés par un PACS");
    // L'ancienne phrase, sans condition.
    expect(etat.erreur).not.toContain("courent encore six mois (art. 8-1");
    expect(supprimer).not.toHaveBeenCalled();
  });
});
