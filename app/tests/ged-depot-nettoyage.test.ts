import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { deposerFichierGed } from "../src/lib/ged-depot";
const pdf = () => new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF"], "piece.pdf", { type: "application/pdf" });
const user = { id: "gestionnaire" } as User;
function client(erreur: { code?: string; message: string } | null) {
  const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }), insert: vi.fn(), single: vi.fn().mockResolvedValue({ data: erreur ? null : { id: "doc" }, error: erreur }) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.is.mockReturnValue(q); q.insert.mockReturnValue(q);
  const lien = vi.fn().mockResolvedValue({ error: { message: "rattachement refusé" } });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ error: null });
  return { db: { from: (table: string) => table === "documents" ? q : { insert: lien }, storage: { from: () => ({ upload }) }, rpc } as unknown as SupabaseClient, upload, rpc };
}
afterEach(() => vi.restoreAllMocks());
describe("nettoyage après échec du dépôt GED", () => {
  it.each([
    { code: "23505", message: "documents_empreinte_unique" },
    { code: "23505", message: "documents_remplace_id_key" },
    { code: "42501", message: "accès refusé" },
  ])("met en purge l'octet déjà monté lorsque la fiche échoue : $message", async erreur => {
    const { db, upload, rpc } = client(erreur);
    const resultat = await deposerFichierGed(db, user, "org", pdf(), "bail", "Bail");
    expect(resultat.erreur).toBeTruthy();
    expect(resultat.documentId).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("purger_fichier_sans_fiche", { p_storage_path: upload.mock.calls[0][0] });
  });
  it("préserve le refus initial si le service de purge ne répond pas", async () => {
    const { db, rpc } = client({ code: "23505", message: "documents_empreinte_unique" });
    rpc.mockRejectedValue(new Error("réseau"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await deposerFichierGed(db, user, "org", pdf(), "bail", "Bail")).erreur).toMatch(/doublon/);
  });
  it("ne purge pas un fichier dont la fiche existe, même si le classement échoue", async () => {
    const { db, rpc } = client(null);
    expect((await deposerFichierGed(db, user, "org", pdf(), "bail", "Bail")).erreur).toMatch(/classé/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
