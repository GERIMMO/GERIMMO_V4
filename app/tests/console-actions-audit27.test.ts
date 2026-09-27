/**
 * Audit console du 27/09 — les actions serveur de la console :
 * - majeur 1 : une décision du point relit l'état COURANT de sa source ;
 * - majeur 5 : les gestes (lancement de mission, publication…) sont journalisés ;
 * - majeur 6 : « demande traitée » gardée côté serveur, erreur explicite ;
 * - majeurs 7 et 8 : renvoi d'invitation et gestes sur un compte, confirmés,
 *   journalisés avant l'appel, jamais sur son propre compte ni un superviseur.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), service: vi.fn(), revalidate: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.service }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { marquerDevisTraitee } from "../src/app/actions/devis-admin";
import { controlerCompte, controlerOrganisation, renvoyerInvitation } from "../src/app/actions/controle-supervision";
import { deciderDecisionDuMatin } from "../src/app/admin/brief/actions";
import { publierPublication } from "../src/app/actions/publications";
import { commanderMission } from "../src/app/actions/equipes";

const ID = "11111111-1111-4111-8111-111111111111";
const MOI = "22222222-2222-4222-8222-222222222222";
const form = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f; };

/** Un client : `rpc` répond selon la table `reponses`, `from` rend `lignes[table]`. */
function client(reponses: Record<string, { data?: unknown; error?: { message: string } | null }> = {}, lignes: Record<string, unknown> = {}) {
  const appels: [string, unknown][] = [];
  const rpc = vi.fn(async (fn: string, args?: unknown) => { appels.push([fn, args]); return { data: reponses[fn]?.data ?? true, error: reponses[fn]?.error ?? null }; });
  const from = vi.fn((table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "update", "is", "or", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: lignes[table] ?? null, error: null });
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: lignes[table] ?? [], error: null }).then(ok);
    return q;
  });
  const auth = { getUser: vi.fn(async () => ({ data: { user: { id: MOI } } })), resetPasswordForEmail: vi.fn(async () => ({ error: null })) };
  mocks.createClient.mockResolvedValue({ rpc, from, auth });
  return { rpc, from, auth, appels };
}

beforeEach(() => vi.resetAllMocks());

describe("marquerDevisTraitee (majeur 6)", () => {
  it("refuse sans superviseur permanent en double vérification, sans rien écrire", async () => {
    const c = client({ is_permanent_super_admin: { data: false } });
    expect((await marquerDevisTraitee(ID)).erreur).toMatch(/double vérification/);
    expect(c.appels.map(([f]) => f)).toEqual(["is_permanent_super_admin"]);
  });
  it("passe par la fonction qui journalise, et dit quand rien n'a changé", async () => {
    const c = client({ demande_devis_traitee: { data: true } });
    expect(await marquerDevisTraitee(ID)).toEqual({ succes: "Demande marquée traitée." });
    expect(c.appels).toContainEqual(["demande_devis_traitee", { p_demande: ID }]);
    client({ demande_devis_traitee: { data: false } });
    expect((await marquerDevisTraitee(ID)).erreur).toMatch(/déjà marquée traitée/);
  });
});

describe("décision du point du matin : l'état courant d'abord (majeur 1)", () => {
  it("n'appelle pas decider_veille quand l'information a été écartée depuis son écran", async () => {
    const c = client({}, {
      decisions_du_matin: { id: ID, source: "veille", source_id: ID, statut: "en_attente", cle: `veille:${ID}`, gestes: {} },
      regulatory_watch: { statut: "ecarte" },
    });
    const r = await deciderDecisionDuMatin(ID, true, "");
    expect(r.erreur).toMatch(/déjà été tranchée sur son écran/);
    expect(c.appels.map(([f]) => f)).not.toContain("decider_veille");
  });
  it("une décision déjà « sans objet » ne se rejoue pas", async () => {
    const c = client({}, { decisions_du_matin: { id: ID, source: "veille", source_id: ID, statut: "sans_objet", cle: "x", gestes: {} } });
    expect((await deciderDecisionDuMatin(ID, true, "")).erreur).toMatch(/tranchée sur son écran/);
    expect(c.appels.map(([f]) => f)).not.toContain("decider_veille");
  });
  it("une évolution s'autorise sur la version PRÉSENTÉE, pas sur celle du clic", async () => {
    const c = client({}, {
      decisions_du_matin: { id: ID, source: "developpement", source_id: ID, statut: "en_attente", cle: "d", gestes: { revision: "a".repeat(40) } },
      development_proposals: { statut: "autorisation", revision: "b".repeat(40) },
    });
    expect((await deciderDecisionDuMatin(ID, true, "")).erreur).toMatch(/autre version/);
    expect(c.appels.map(([f]) => f)).not.toContain("decider_amelioration");
  });
});

describe("journal des gestes (majeur 5)", () => {
  it("faire paraître un article écrit sa ligne d'audit", async () => {
    const c = client({}, { publications: { titre: "Le dépôt", slug: "le-depot" } });
    await publierPublication(ID);
    expect(c.appels).toContainEqual(["journaliser_supervision", { p_action: "publication_parue", p_organisation: null, p_details: { publication: ID } }]);
  });
});

describe("« Lancer maintenant » est journalisé avant l'appel (majeur 5)", () => {
  it("sans ligne d'audit, le passage n'est pas lancé", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);
    client({ journaliser_supervision: { error: { message: "panne" } } });
    expect((await commanderMission({}, form({ mission: "veille", commande: "lancer" }))).erreur).toMatch(/journal d’audit/);
    expect(appel).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("renvoyer l'invitation (majeur 7)", () => {
  it("n'envoie qu'au responsable rattaché, et journalise le renvoi", async () => {
    const c = client({}, { memberships: [{ account: { email: "resp@agence.fr" } }] });
    expect((await renvoyerInvitation(ID, {}, form({ email: "autre@pirate.fr", confirmation: "oui" }))).erreur).toMatch(/responsable rattaché/);
    expect(c.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect((await renvoyerInvitation(ID, {}, form({ email: "resp@agence.fr" }))).erreur).toMatch(/Confirmez/);
    const r = await renvoyerInvitation(ID, {}, form({ email: "resp@agence.fr", confirmation: "oui" }));
    expect(r.succes).toMatch(/Invitation renvoyée/);
    expect(c.appels).toContainEqual(["journaliser_supervision", { p_action: "invitation_renvoyee", p_organisation: ID, p_details: { envoyee: true } }]);
  });
});

describe("gestes sur une organisation et un compte (majeur 8)", () => {
  it("l'organisation : confirmation et motif exigés, puis la fonction gardée", async () => {
    const c = client();
    expect((await controlerOrganisation(ID, {}, form({ geste: "suspendre", motif: "Impayé" }))).erreur).toMatch(/confirmation/);
    expect((await controlerOrganisation(ID, {}, form({ geste: "suspendre", confirmation: "oui" }))).erreur).toMatch(/Motivez/);
    expect((await controlerOrganisation(ID, {}, form({ geste: "supprimer", confirmation: "oui" }))).erreur).toMatch(/geste proposé/);
    expect((await controlerOrganisation(ID, {}, form({ geste: "suspendre", motif: "Impayé constaté", confirmation: "oui" }))).succes).toMatch(/suspendue/);
    expect(c.appels).toContainEqual(["controler_organisation", { p_org: ID, p_geste: "suspendre", p_jours: null, p_motif: "Impayé constaté" }]);
  });
  it("le compte : jamais le sien, jamais un superviseur, journalisé AVANT l'appel d'administration", async () => {
    const admin = { updateUserById: vi.fn(async () => ({ error: null })), mfa: { listFactors: vi.fn(async () => ({ data: { factors: [{ id: "f1" }] }, error: null })), deleteFactor: vi.fn(async () => ({ error: null })) } };
    mocks.service.mockReturnValue({ auth: { admin } });
    client();
    expect((await controlerCompte(MOI, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }))).erreur).toMatch(/propre compte/);
    client({ dossier_compte_supervision: { data: [{ est_super_admin: true }] } });
    expect((await controlerCompte(ID, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }))).erreur).toMatch(/supervision ne se bloque pas/);
    expect(admin.updateUserById).not.toHaveBeenCalled();

    const ordre: string[] = [];
    const c = client({ dossier_compte_supervision: { data: [{ est_super_admin: false }] } });
    c.rpc.mockImplementation(async (fn: string) => { ordre.push(fn); return { data: fn === "dossier_compte_supervision" ? [{ est_super_admin: false }] : true, error: null }; });
    admin.updateUserById.mockImplementation(async () => { ordre.push("ban"); return { error: null }; });
    expect((await controlerCompte(ID, {}, form({ geste: "bloquer", motif: "Accès frauduleux", confirmation: "oui" }))).succes).toMatch(/Compte bloqué/);
    expect(ordre.indexOf("journaliser_supervision")).toBeLessThan(ordre.indexOf("ban"));
    expect(admin.updateUserById).toHaveBeenCalledWith(ID, { ban_duration: "876000h" });

    expect((await controlerCompte(ID, {}, form({ geste: "reinitialiser_mfa", motif: "Téléphone perdu", confirmation: "oui" }))).succes).toMatch(/Second facteur/);
    expect(admin.mfa.deleteFactor).toHaveBeenCalledWith({ id: "f1", userId: ID });
  });
  it("sans ligne d'audit, le geste sur un compte n'est pas appliqué", async () => {
    const admin = { updateUserById: vi.fn(async () => ({ error: null })) };
    mocks.service.mockReturnValue({ auth: { admin } });
    const c = client({ dossier_compte_supervision: { data: [{ est_super_admin: false }] }, journaliser_supervision: { error: { message: "panne" } } });
    void c;
    expect((await controlerCompte(ID, {}, form({ geste: "debloquer", confirmation: "oui" }))).erreur).toMatch(/journal d’audit/);
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });
});

describe("détails de la console (audit 27/09)", () => {
  it("un écran se nomme, jamais par son chemin brut", async () => {
    const { nomEcran } = await import("../src/lib/retours");
    expect(nomEcran("/agence/[dossier]/loyers")).toBe("Espace agence — Loyers");
    expect(nomEcran("/admin/sante")).toBe("Console — Santé");
    expect(nomEcran("/")).toBe("Site public");
  });
});
