/**
 * Audit final (28/10/2026), décision du dirigeant pour BAIL-09 et BAIL-10 : les documents générés ne se présentent
 * pas comme des textes officiels qu'ils ne reproduisent pas ; ils renvoient au texte publié sur Légifrance.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte } from "./fixtures/contexte-document";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerNotice, MENTION_NOTICE_OFFICIELLE } from "@/lib/documents/modeles/notice";
import { assemblerCongeBailleur, RAPPEL_NOTICE_CONGE } from "@/lib/documents/modeles/conge-bailleur";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
const html = (d: { document: { html: string } } | { erreur: string }) => ("erreur" in d ? d.erreur : d.document.html);
const echappe = (t: string) => t.replaceAll("&", "&amp;");
const client = { rpc: vi.fn(async () => ({ data: "2029-08-31", error: null })) } as unknown as SupabaseClient;

describe("BAIL-09 — la notice générée est un résumé et renvoie au texte officiel", () => {
  it("titre « Notice d'information — résumé », mention et lien Légifrance en tête, plus de visa de l'arrêté", async () => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const r = await assemblerNotice({} as SupabaseClient, "org", "b1");
    const h = html(r);
    expect(h).toContain("<h1>Notice d'information — résumé</h1>");
    expect(h).toContain(echappe(MENTION_NOTICE_OFFICIELLE));
    expect(MENTION_NOTICE_OFFICIELLE).toContain("https://www.legifrance.gouv.fr/loda/id/JORFTEXT000030649868");
    expect(h).not.toContain("Arrêté du 29 mai 2015 pris en application");
    expect(h).not.toContain("fait\n    partie intégrante");
    // Le titre rangé dans Documents ne change pas : la signature reconnaît la pièce par ce titre.
    expect("titreGed" in r && r.titreGed).toBe("Notice d'information (annexe au bail)");
  });
});

describe("BAIL-10 — le congé pour vente ou reprise rappelle la notice à joindre", () => {
  it.each([["vente", true], ["reprise", true], ["motif_legitime", false]] as const)("motif %s : rappel %s", async (motif, attendu) => {
    vi.mocked(chargerContexteBail).mockResolvedValue(contexte());
    const options: Record<string, string> = { motif, prix_vente: "245 000", beneficiaire_nom: "Durand Paul", beneficiaire_lien: "fils", motif_detail: "impayés répétés" };
    const h = html(await assemblerCongeBailleur(client, "org", "b1", options));
    expect(h.includes("JORFTEXT000036219156")).toBe(attendu);
    expect(RAPPEL_NOTICE_CONGE).toContain("arrêté du 13 décembre 2017");
  });
});
