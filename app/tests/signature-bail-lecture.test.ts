/**
 * Lot B7 — lecture de la vue de signature quand le cautionnement est fermé.
 *
 * `lireSignatureBail` rend `mode: "indisponible"` et le message exact dans `fermeture` pour le seul acte de
 * cautionnement lorsque `ZOHO_SIGN_CAUTIONNEMENT_FERME` vaut « 1 » (ou « true ») ; le bail et les autres actes ne
 * changent pas, et la préparation du PDF reste possible (seul l'envoi est fermé).
 *
 * Correction du 19/10 (relecture) : la fermeture ne concerne qu'un NOUVEL envoi. Un circuit déjà envoyé (préparation,
 * en cours, à vérifier) garde le mode d'avant et aucun message : ses invitations sont parties, rien n'est suspendu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), assembler: vi.fn(), rendu: vi.fn(), circuits: [] as Record<string, unknown>[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({}) }));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: vi.fn() }));
vi.mock("@/lib/signature-bail", () => ({
  configurationSignatureBail: () => ({ prestataire: "zoho", environnement: "production" }),
  configurationSuiviSignatureBail: () => null,
}));
vi.mock("@/lib/signature-document", () => ({
  assemblerSignatureDocument: m.assembler,
  selectionDuCircuit: (c: { modele?: string; cible_id?: string; bail_id?: string; options?: Record<string, string> }) => ({ code: c.modele ?? "bail", cibleId: c.cible_id ?? c.bail_id, options: c.options ?? {} }),
}));
vi.mock("@/lib/marque-organisation-serveur", () => ({ chargerMarque: async () => null }));
vi.mock("@/lib/documents/marque", () => ({ appliquerMarqueDocument: (d: unknown) => d }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: m.rendu }));
import { lireSignatureBail, preparerSignatureBail } from "@/app/actions/signature-bail";
import { MESSAGE_CAUTIONNEMENT_FERME } from "@/lib/signature-interrupteurs";

const ORG = "org";
const BAIL = "11111111-1111-4111-8111-111111111111";
const GARANT = "22222222-2222-4222-8222-222222222222";
const CAUTION = { code: "cautionnement" as const, cibleId: BAIL, options: { garant: GARANT } };

beforeEach(() => {
  vi.resetAllMocks();
  m.circuits = [];
  m.rpc.mockResolvedValue({ data: true, error: null });
  const db = {
    rpc: m.rpc,
    from: () => {
      const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: async () => ({ data: m.circuits, error: null }), maybeSingle: async () => ({ data: null, error: null }) };
      return q;
    },
  };
  m.acces.mockResolvedValue({ supabase: db, user: { id: "owner" } });
  m.assembler.mockResolvedValue({ bailId: BAIL, signataires: [{ personId: "g" }], manquants: [], annexes: [], empreinte: "x", document: {}, titreGed: "Acte", liens: [] });
  m.rendu.mockRejectedValue(new Error("Rendu PDF fictif atteint."));
});
afterEach(() => vi.unstubAllEnvs());

describe("Fermeture du cautionnement à la lecture", () => {
  it("rend le mode indisponible et le message exact pour l’acte de cautionnement", async () => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    const vue = await lireSignatureBail(ORG, BAIL, CAUTION);
    expect(vue.erreur).toBeUndefined();
    expect(vue.mode).toBe("indisponible");
    expect(vue.fermeture).toBe(MESSAGE_CAUTIONNEMENT_FERME);
  });
  it("sans la variable, le cautionnement garde le mode d’avant", async () => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "");
    const vue = await lireSignatureBail(ORG, BAIL, CAUTION);
    expect(vue.mode).toBe("production");
    expect(vue.fermeture).toBeUndefined();
  });
  it("la fermeture s’applique aussi aux organisations d’essai", async () => {
    const org = "33333333-3333-4333-8333-333333333333";
    vi.stubEnv("SIGNATURE_BAIL_ORGS_ESSAI", org);
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    m.acces.mockResolvedValue({ supabase: (await m.acces()).supabase, user: { id: "owner", app_metadata: { gerimmo_recette: "permanente-v1" } } });
    const vue = await lireSignatureBail(org, BAIL, CAUTION);
    expect(vue.erreur).toBeUndefined();
    expect(vue.mode).toBe("indisponible");
    expect(vue.fermeture).toBe(MESSAGE_CAUTIONNEMENT_FERME);
    expect(vue.essai).toBe(true);
  });
  it("ne touche ni le bail ni un autre acte", async () => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    const bail = await lireSignatureBail(ORG, BAIL, { code: "bail", cibleId: BAIL });
    expect(bail.mode).toBe("production");
    expect(bail.fermeture).toBeUndefined();
    const avenant = await lireSignatureBail(ORG, BAIL, { code: "avenant", cibleId: BAIL });
    expect(avenant.mode).toBe("production");
    expect(avenant.fermeture).toBeUndefined();
  });
  it.each(["preparation", "en_cours", "a_verifier"] as const)("un acte déjà envoyé (%s) reste consultable, garde le mode d’avant et ne porte pas le message", async (etat) => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    m.circuits = [{ id: "c1", bail_id: BAIL, modele: "cautionnement", cible_id: BAIL, options: { garant: GARANT }, prestataire: "zoho", etat, signataires: [], annexes: [], essai: false }];
    const vue = await lireSignatureBail(ORG, BAIL, CAUTION);
    expect(vue.erreur).toBeUndefined();
    expect(vue.circuit?.id).toBe("c1");
    // Les invitations sont parties : aucun nouvel envoi n'est en jeu, le texte « suspendu … hors ligne » serait trompeur.
    expect(vue.mode).toBe("production");
    expect(vue.fermeture).toBeUndefined();
    expect(m.assembler).not.toHaveBeenCalled();
  });
  it("« true » ferme aussi la lecture du cautionnement (décision du 19/10)", async () => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "true");
    const vue = await lireSignatureBail(ORG, BAIL, CAUTION);
    expect(vue.mode).toBe("indisponible");
    expect(vue.fermeture).toBe(MESSAGE_CAUTIONNEMENT_FERME);
  });
  it("un PDF déjà préparé reste listé avec le message", async () => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    m.circuits = [{ id: "c2", bail_id: BAIL, modele: "cautionnement", cible_id: BAIL, options: { garant: GARANT }, prestataire: "zoho", etat: "pret", empreinte: "x", expire_le: new Date(Date.now() + 30 * 86400000).toISOString(), signataires: [], annexes: [] }];
    const vue = await lireSignatureBail(ORG, BAIL, CAUTION);
    expect(vue.circuit?.id).toBe("c2");
    expect(vue.mode).toBe("indisponible");
    expect(vue.fermeture).toBe(MESSAGE_CAUTIONNEMENT_FERME);
    expect(vue.versionDepassee).toBe(false);
  });
  it("la préparation du PDF n’est pas refusée par la fermeture", async () => {
    vi.stubEnv("ZOHO_SIGN_DOCUMENTS_ACTIF", "true");
    vi.stubEnv("ZOHO_SIGN_CAUTIONNEMENT_FERME", "1");
    const vue = await preparerSignatureBail(ORG, BAIL, CAUTION);
    // Le parcours atteint le rendu du PDF (mock qui s'interrompt là) : la fermeture n'a pas bloqué la préparation.
    expect(m.assembler).toHaveBeenCalled();
    expect(m.rendu).toHaveBeenCalled();
    expect(vue.erreur).toBe("Rendu PDF fictif atteint.");
  });
});
