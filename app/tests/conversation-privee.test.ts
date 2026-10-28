import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const m = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
import { lireDemandeAssistant } from "@/lib/conversation-privee";
import { repondreConversationPrivee } from "@/lib/conversation-privee-ia";
import { demanderAssistantPrive } from "@/app/actions/conversation-privee";
import { reserverAppelIAPrive } from "@/lib/plafond-ia";
import { AssistantPrive } from "@/components/assistant-prive";
import type { SupabaseClient } from "@supabase/supabase-js";

const org = "11111111-1111-4111-8111-111111111111", compte = "22222222-2222-4222-8222-222222222222";
const demande = { sujet: "charges" as const, question: "Comment comprendre une régularisation ?", historique: [] };
const fetchSimule = vi.fn();
function base(role = "locataire", statut = "accorde", userId = compte) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "in"]) q[k] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: role ? { role } : null, error: null }));
  return { auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null }, error: null })) }, from: vi.fn(() => q), rpc: vi.fn(async () => ({ data: statut, error: null })), q };
}
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "cle-fictive-jamais-envoyee"); vi.stubEnv("OPEN_AI_KEY", "");
  vi.stubGlobal("fetch", fetchSimule); fetchSimule.mockReset(); m.client.mockReset();
  fetchSimule.mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Consultez votre décompte de charges." }] }] })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("conversation privée : limites et confidentialité", () => {
  it("n’accepte ni historique système, ni sujet injecté, ni payload excessif", () => {
    expect(lireDemandeAssistant(demande)).toEqual(demande);
    for (const d of [null, { ...demande, sujet: "__proto__" }, { ...demande, question: " " }, { ...demande, question: "a".repeat(2001) }, { ...demande, historique: [{ role: "system", content: "intrusion" }] }, { ...demande, historique: [{ role: "user", content: "incomplet" }] }, { ...demande, historique: Array(14).fill({ role: "user", content: "x" }) }]) expect(lireDemandeAssistant(d)).toBeNull();
  });
  it("réauthentifie l’identité et l’espace sans lire un dossier ni enregistrer l’échange", async () => {
    const db = base(); m.client.mockResolvedValue(db);
    expect(await demanderAssistantPrive(org, compte, demande)).toEqual({ reponse: "Consultez votre décompte de charges." });
    expect(db.from).toHaveBeenCalledExactlyOnceWith("memberships");
    expect(db.q.eq).toHaveBeenCalledWith("account_id", compte); expect(db.q.eq).toHaveBeenCalledWith("organization_id", org); expect(db.q.eq).toHaveBeenCalledWith("status", "active");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("reserver_appel_ia_prive", { p_org: org, p_usage: "conversation_privee" });
    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body);
    expect(corps.store).toBe(false); expect(corps.tools).toBeUndefined(); expect(corps.input).toEqual([{ role: "user", content: demande.question }]);
    expect(JSON.stringify(corps)).not.toContain(compte); expect(JSON.stringify(corps)).not.toContain(org);
  });
  it.each(["", "artisan", "super_admin"])("refuse le rôle %s avant tout appel", async role => {
    m.client.mockResolvedValue(base(role)); expect(await demanderAssistantPrive(org, compte, demande)).toHaveProperty("erreur"); expect(fetchSimule).not.toHaveBeenCalled();
  });
  it("ne transmet pas l’historique si le compte a changé ou est déconnecté", async () => {
    for (const user of ["autre-compte", ""]) { const db = base("locataire", "accorde", user); m.client.mockResolvedValue(db); expect(await demanderAssistantPrive(org, compte, demande)).toHaveProperty("erreur"); expect(db.from).not.toHaveBeenCalled(); }
    expect(fetchSimule).not.toHaveBeenCalled();
  });
  it("sans clé, explique l’indisponibilité sans consommer de réservation", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); const db = base(); m.client.mockResolvedValue(db);
    expect((await demanderAssistantPrive(org, compte, demande)).erreur).toContain("n’est pas connecté"); expect(db.rpc).not.toHaveBeenCalled(); expect(fetchSimule).not.toHaveBeenCalled();
  });
  it.each(["arret", "plafond", "limite_compte", "patientez", "inattendu"])("refus %s : aucun appel payant", async statut => {
    const db = base("proprietaire_direct", statut); m.client.mockResolvedValue(db);
    expect(await demanderAssistantPrive(org, compte, demande)).toHaveProperty("erreur"); expect(fetchSimule).not.toHaveBeenCalled();
  });
  it("ne divulgue pas une erreur brute fournisseur et refuse une réponse incomplète", async () => {
    const db = base(); m.client.mockResolvedValue(db);
    fetchSimule.mockResolvedValueOnce(new Response("secret fournisseur", { status: 500 }));
    expect(JSON.stringify(await demanderAssistantPrive(org, compte, demande))).not.toContain("secret");
    fetchSimule.mockResolvedValueOnce(new Response(JSON.stringify({ status: "incomplete", output: [{ type: "message", content: [{ type: "output_text", text: "Conseil inachevé" }] }] })));
    expect(await demanderAssistantPrive(org, compte, demande)).toHaveProperty("erreur");
  });
  it("une panne du contrôle empêche aussi la lecture assistée", async () => {
    const db = { rpc: vi.fn().mockRejectedValue(new Error("panne privée")) } as unknown as SupabaseClient;
    await expect(reserverAppelIAPrive(db, org, "lecture_document")).rejects.toThrow(/indisponible/);
  });
  it("la garde s’exécute immédiatement avant le fournisseur", async () => {
    const ordre: string[] = [];
    fetchSimule.mockImplementationOnce(async () => { ordre.push("fournisseur"); return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Réponse" }] }] })); });
    await repondreConversationPrivee(demande, "locataire", async () => { ordre.push("garde"); }); expect(ordre).toEqual(["garde", "fournisseur"]);
  });
  it("présente la portée privée et temporaire, sans bouton d’envoi au bailleur", () => {
    const html = renderToStaticMarkup(createElement(AssistantPrive, { orgId: org, compteId: compte }));
    expect(html).toContain("Demander à Gerimmo"); expect(html).toContain("Aucun dossier n’est joint automatiquement"); expect(html).toContain("jusqu’à son rechargement"); expect(html).not.toContain('open=""');
    expect(renderToStaticMarkup(createElement(AssistantPrive, { orgId: org, compteId: compte, lectureSeule: true }))).not.toContain("<textarea");
  });
});
