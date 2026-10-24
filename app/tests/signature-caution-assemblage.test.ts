/**
 * Décision du 23/10/2026 : pour l'acte de cautionnement, le mobile saisi par le bailleur sur la fiche du garant n'est
 * jamais repris. L'assemblage le laisse vide (la caution le confirmera), ne le réclame pas comme manquant, et
 * l'empreinte du circuit ne dépend pas de lui : le changer ne périme pas la préparation. Le bail, lui, garde le
 * numéro de la fiche du garant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contexte } from "./fixtures/contexte-document";
const m = vi.hoisted(() => ({ contexte: vi.fn(), modele: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({ ...(await original<object>()), chargerContexteBail: m.contexte }));
vi.mock("@/lib/documents/modeles", () => ({ MODELES: { cautionnement: { assembler: m.modele }, avenant: { assembler: m.modele } } }));
import { assemblerSignatureDocument } from "@/lib/signature-document";
import { partiesSignatureBail } from "@/lib/signature-bail";

const BAIL = "11111111-1111-4111-8111-111111111111";
const GARANT = "22222222-2222-4222-8222-222222222222";
function db() {
  return { from() {
    const r = { select: () => r, eq: () => r, is: () => r, in: () => r, order: () => r, limit: () => r,
      maybeSingle: async () => ({ data: { document_id: "pdf-bail", document_signe: null }, error: null }),
      single: async () => ({ data: { id: "pdf-bail", titre: "Bail fictif", storage_path: "org/bail.pdf", empreinte: "a".repeat(64), mime_type: "application/pdf" }, error: null }) };
    return r;
  } } as unknown as SupabaseClient;
}
function ctxAvecTelephone(telephone: string | null) {
  const ctx = contexte();
  const p = { ...ctx.locataires[0], email: "personne@example.invalid", telephone: "+33600000001", prenom: "Personne", qualite: "personne physique" };
  ctx.locataires = [{ ...p, id: "locataire", email: "locataire@example.invalid" }];
  ctx.bailleurs = [{ ...p, id: "proprietaire", email: "bailleur@example.invalid", quote_part: 100 }];
  ctx.garants = [{ ...p, id: GARANT, email: "caution@example.invalid", telephone, garant_de: "locataire" }];
  return ctx;
}
beforeEach(() => {
  m.modele.mockReset().mockResolvedValue({ document: { html: "<body>Acte fictif</body>", reference: "CAUT", manquants: [] }, titreGed: "Acte", liens: [], mentionCaution: "Mention fictive" });
});

describe("cautionnement : le mobile du dossier n'est jamais repris", () => {
  it("le garant part sans numéro, sans manquant, même si sa fiche en porte un", async () => {
    m.contexte.mockResolvedValue(ctxAvecTelephone("06 00 00 00 09"));
    const r = await assemblerSignatureDocument(db(), "org", { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } });
    expect(r.signataires.find((s) => s.qualite === "Garant")!.telephone).toBe("");
    expect(JSON.stringify(r.signataires)).not.toContain("+33600000009");
    expect(r.manquants).toEqual([]);
  });

  it("l'empreinte ne change pas quand le bailleur modifie le numéro de la fiche du garant", async () => {
    m.contexte.mockResolvedValue(ctxAvecTelephone("06 00 00 00 09"));
    const avant = await assemblerSignatureDocument(db(), "org", { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } });
    m.contexte.mockResolvedValue(ctxAvecTelephone(null));
    const apres = await assemblerSignatureDocument(db(), "org", { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } });
    expect(apres.empreinte).toBe(avant.empreinte);
  });

  it("le bail garde le numéro de la fiche du garant, et le réclame s'il manque", () => {
    const ctx = ctxAvecTelephone("06 00 00 00 09");
    expect(partiesSignatureBail(ctx).signataires.find((s) => s.qualite === "Garant")!.telephone).toBe("+33600000009");
    expect(partiesSignatureBail(ctxAvecTelephone(null)).manquants.join(" ")).toContain("téléphone pour recevoir le code SMS");
  });
});

describe("relecture du 24/10 : le lien de la caution ne part jamais chez le bailleur", () => {
  it("une adresse de caution égale à celle d'un bailleur (casse ignorée) est à corriger avant la préparation", async () => {
    const ctx = ctxAvecTelephone(null);
    ctx.garants = [{ ...ctx.garants[0], email: " Bailleur@Example.invalid " }];
    m.contexte.mockResolvedValue(ctx);
    const r = await assemblerSignatureDocument(db(), "org", { code: "cautionnement", cibleId: BAIL, options: { garant: GARANT } });
    expect(r.manquants.join(" ")).toContain("l’adresse e-mail de la caution est celle d’un bailleur");
  });
});
