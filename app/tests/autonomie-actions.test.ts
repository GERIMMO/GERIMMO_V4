/**
 * Les actions de la supervision sur l'autonomie : actualiser les dossiers, ouvrir ou révoquer un relais, décider d'une
 * amélioration, constater une correction, bilan de contact d'un incident. Audit final (COD-15, relecture du 28/10) : aucun
 * test n'importait ce fichier. Sans base ni GitHub : chaque geste exige le superadmin permanent, les saisies sont bornées
 * avant tout appel, les refus sont dits en français.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ superadmin: true, rpc: vi.fn(), revalidate: vi.fn(), proposition: null as null | Record<string, unknown>, verifierCorrection: vi.fn(), verifierPublication: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/suivi-corrections", () => ({ verifierCorrection: m.verifierCorrection }));
vi.mock("@/lib/suivi-publication", () => ({ verifierPublication: m.verifierPublication }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    from: () => { const q = { select: () => q, eq: () => q, single: async () => ({ data: m.proposition, error: m.proposition ? null : { message: "absent" } }) }; return q; },
  }),
}));

import { actualiserCorrection, actualiserDossiers, creerDelegation, deciderAmelioration, enregistrerBilanContact, revoquerDelegation, signalerPresence } from "@/app/actions/autonomie";

const form = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const appels = () => m.rpc.mock.calls.map(([n]) => n);

beforeEach(() => {
  vi.clearAllMocks(); m.superadmin = true; m.proposition = null;
  m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: m.superadmin, error: null } : { data: null, error: null }));
});

describe("gestes réservés au superadmin permanent", () => {
  it("sans double vérification, aucun geste n'atteint la base", async () => {
    m.superadmin = false;
    expect((await actualiserDossiers()).erreur).toContain("compte de supervision");
    expect((await creerDelegation({}, form({ email: "a@b.fr", jours: "7", motif: "Congés" }))).erreur).toContain("double vérification");
    expect((await revoquerDelegation("r"))).toEqual({ erreur: "Accès réservé à la supervision." });
    expect((await deciderAmelioration("p", "abc", false))).toEqual({ erreur: "Accès réservé à la supervision." });
    expect((await actualiserCorrection("p"))).toEqual({ erreur: "Accès réservé à la supervision." });
    await signalerPresence();
    expect(appels().every((n) => n === "is_permanent_super_admin")).toBe(true);
  });

  it("actualiser les dossiers : succès, ou échec dit sans perte", async () => {
    expect((await actualiserDossiers()).succes).toBe("Les prochaines étapes sont à jour.");
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: null, error: { message: "x" } }));
    expect((await actualiserDossiers()).erreur).toContain("Les dossiers restent conservés");
  });
});

describe("relais de suivi", () => {
  it.each([
    [{ email: "pas-une-adresse", jours: "7", motif: "Congés" }],
    [{ email: "relais@exemple.fr", jours: "0", motif: "Congés" }],
    [{ email: "relais@exemple.fr", jours: "91", motif: "Congés" }],
    [{ email: "relais@exemple.fr", jours: "2.5", motif: "Congés" }],
    [{ email: "relais@exemple.fr", jours: "7", motif: "ok" }],
  ])("refuse une saisie hors bornes %j avant tout appel", async (champs) => {
    expect((await creerDelegation({}, form(champs))).erreur).toContain("1 à 90 jours");
    expect(appels()).not.toContain("creer_relais_supervision");
  });

  it("ouvre le relais (adresse normalisée) et révoque ; les deux écrans sont rafraîchis", async () => {
    expect((await creerDelegation({}, form({ email: " Relais@Exemple.FR ", jours: "14", motif: " Congés d'été " }))).succes).toContain("expire automatiquement");
    expect(m.rpc).toHaveBeenCalledWith("creer_relais_supervision", { p_email: "relais@exemple.fr", p_jours: 14, p_motif: "Congés d'été" });
    expect((await revoquerDelegation("r1")).succes).toBe("L’accès du relais est révoqué.");
    expect(m.rpc).toHaveBeenCalledWith("revoquer_relais_supervision", { p_id: "r1" });
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual(["/admin/autonomie", "/admin/relais", "/admin/autonomie", "/admin/relais"]);
  });
});

describe("améliorations et corrections", () => {
  it("refuser une amélioration passe par la base, avec la révision affichée", async () => {
    expect((await deciderAmelioration("p", "abc123", false)).succes).toBe("La publication est refusée.");
    expect(m.rpc).toHaveBeenCalledWith("decider_developpement", { p_id: "p", p_revision: "abc123", p_accepter: false });
  });

  it("accepter une proposition introuvable, ou dont les contrôles ont changé, ne décide rien", async () => {
    expect((await deciderAmelioration("p", "abc", true)).erreur).toBe("La proposition ne peut pas être vérifiée.");
    m.proposition = { rapport_controles: { preparation: "ok", resultat: "reussi" } };
    m.verifierCorrection.mockResolvedValue({ revision: "autre", rapport: { preparation: "ok", resultat: "reussi" } });
    expect((await deciderAmelioration("p", "abc", true)).erreur).toContain("ont changé");
    expect(appels()).not.toContain("decider_developpement");
  });

  it("une proposition terminée ou introuvable ne se réactualise pas", async () => {
    expect((await actualiserCorrection("p")).erreur).toBe("Cette proposition est introuvable.");
    m.proposition = { statut: "publiee" };
    expect((await actualiserCorrection("p")).erreur).toContain("terminée");
    expect(m.verifierCorrection).not.toHaveBeenCalled();
  });
});

describe("bilan de contact d'un incident", () => {
  it("exige la réponse sur l'appel et un résumé de 5 à 1 000 caractères", async () => {
    expect((await enregistrerBilanContact("org", "inc", {}, form({ note: "Tout s'est bien passé" }))).erreur).toBe("Précisez si un appel a été nécessaire.");
    expect((await enregistrerBilanContact("org", "inc", {}, form({ appel: "oui", note: "ok" }))).erreur).toBe("Résumez le déroulement en quelques mots.");
    expect(appels()).toEqual([]);
  });

  it("enregistre le bilan et rafraîchit les incidents de l'agence et la supervision", async () => {
    expect((await enregistrerBilanContact("org", "inc", {}, form({ appel: "non", note: " Réglé par message " }))).succes).toContain("bilan est enregistré");
    expect(m.rpc).toHaveBeenCalledWith("confirmer_bilan_contact", { p_incident: "inc", p_appel: false, p_note: "Réglé par message" });
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual(["/agence/org/incidents", "/admin/autonomie", "/admin"]);
  });
});
