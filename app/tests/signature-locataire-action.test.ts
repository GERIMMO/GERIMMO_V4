/**
 * Le retour d'un document signé par le locataire (chantier documentaire 08/09) : mêmes exigences de fichier que les autres
 * dépôts, puis la fonction de base qui crée le document, solde la demande et alerte le gestionnaire. Audit final du 27/10
 * (COD-15) : aucun test ne citait l'action. Sans base ni stockage : chaque refus intervient AVANT le transfert, et un refus
 * de la base après transfert ne se présente jamais comme un succès.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: { id: "locataire" } as { id: string } | null, rpc: vi.fn(), upload: vi.fn(), revalidate: vi.fn(),
  depotDirect: vi.fn(), mime: vi.fn(), pdfComplet: vi.fn(), limite: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user } }) },
    rpc: m.rpc,
    storage: { from: (compartiment: string) => ({ upload: (...args: unknown[]) => m.upload(compartiment, ...args) }) },
  }),
}));
vi.mock("@/lib/depot-direct", () => ({ resoudreDepotsFormulaire: m.depotDirect, limiteFichierDepose: m.limite }));
vi.mock("@/lib/file-type", () => ({ detecterMimeReel: m.mime, pdfComplet: m.pdfComplet, EXTENSIONS: { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } }));

import { retournerDocumentSigne } from "@/app/actions/signature-locataire";

const ORG = "00000000-0000-4000-8000-000000000001", DEMANDE = "00000000-0000-4000-8000-000000000002";
const form = (fichier?: File | string) => { const f = new FormData(); if (fichier !== undefined) f.set("fichier", fichier); return f; };
const pdf = (taille = 1200) => new File([new Uint8Array(taille)], "bail-signe.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "locataire" };
  m.depotDirect.mockResolvedValue(null);
  m.limite.mockReturnValue(4 * 1024 * 1024);
  m.mime.mockReturnValue("application/pdf");
  m.pdfComplet.mockReturnValue(true);
  m.upload.mockResolvedValue({ error: null });
  m.rpc.mockResolvedValue({ data: null, error: null });
});

describe("retourner un document signé (locataire)", () => {
  it("refuse sans session : ni dépôt direct, ni transfert, ni base", async () => {
    m.user = null;
    expect(await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf()))).toEqual({ erreur: "Vous n'êtes pas connecté." });
    expect(m.depotDirect).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("un dépôt direct refusé arrête tout, avec son message", async () => {
    m.depotDirect.mockResolvedValue("Transfert incomplet : renvoyez le fichier.");
    expect(await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf()))).toEqual({ erreur: "Transfert incomplet : renvoyez le fichier." });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it.each([
    ["fichier absent", form(), "Choisissez le document signé à déposer."],
    ["champ texte à la place du fichier", form("pas-un-fichier"), "Choisissez le document signé à déposer."],
    ["fichier vide", form(pdf(0)), "Choisissez le document signé à déposer."],
  ])("refuse avant transfert : %s", async (_cas, f, attendu) => {
    expect((await retournerDocumentSigne(ORG, DEMANDE, {}, f)).erreur).toBe(attendu);
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuse un fichier au-delà de la limite, en mégaoctets", async () => {
    m.limite.mockReturnValue(1024 * 1024);
    expect((await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf(1024 * 1024 + 1)))).erreur).toBe("Fichier trop volumineux (1 Mo maximum).");
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("refuse un contenu qui n'est ni PDF, ni JPEG, ni PNG, et un PDF coupé pendant l'envoi", async () => {
    m.mime.mockReturnValue(null);
    expect((await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf()))).erreur).toContain("Format refusé");
    m.mime.mockReturnValue("application/pdf");
    m.pdfComplet.mockReturnValue(false);
    expect((await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf()))).erreur).toContain("PDF est incomplet");
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("un transfert refusé par le stockage est dit en français, la base n'est pas appelée", async () => {
    m.upload.mockResolvedValue({ error: { message: "storage.objects: new row violates row-level security policy" } });
    const retour = await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf()));
    expect(retour.erreur).toMatch(/^Échec du dépôt du fichier : /);
    expect(retour.erreur).not.toContain("row-level");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("un refus de la base après transfert n'est jamais un succès, et rien n'est rafraîchi", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Cette demande est déjà soldée." } });
    const retour = await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf()));
    expect(retour).toEqual({ erreur: "Cette demande est déjà soldée." });
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("cas nominal : fichier déposé sous l'organisation, empreinte et taille transmises, espace rafraîchi", async () => {
    const retour = await retournerDocumentSigne(ORG, DEMANDE, {}, form(pdf(1200)));
    expect(retour.succes).toContain("Document signé déposé");
    const [compartiment, chemin, octets, options] = m.upload.mock.calls[0] as [string, string, Uint8Array, { contentType: string }];
    expect(compartiment).toBe("documents");
    expect(chemin).toMatch(new RegExp(`^${ORG}/[0-9a-f-]{36}\\.pdf$`));
    expect(octets.byteLength).toBe(1200);
    expect(options).toEqual({ contentType: "application/pdf" });
    expect(m.rpc).toHaveBeenCalledWith("retourner_document_signe", {
      p_org: ORG, p_demande: DEMANDE, p_storage_path: chemin, p_mime: "application/pdf", p_taille: 1200, p_empreinte: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual([`/locataire/${ORG}/documents`, `/locataire/${ORG}`]);
  });
});
