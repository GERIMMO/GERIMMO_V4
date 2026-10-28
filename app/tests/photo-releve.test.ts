import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { joindrePhotoReleve } from "@/lib/photo-releve";

const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], "compteur.png", { type: "image/png" });
function client(reservation: object, finalisation: object) {
  const rpc = vi.fn().mockResolvedValueOnce(reservation).mockResolvedValueOnce(finalisation);
  const upload = vi.fn().mockResolvedValue({ error: null });
  return { db: { rpc, storage: { from: vi.fn().mockReturnValue({ upload }) } } as unknown as SupabaseClient, rpc, upload };
}
describe("photo de compteur : contenu contrôlé, enregistrement confirmé et reprise", () => {
  it("refuse un fichier dont seule l'extension prétend être une photo", async () => {
    const { db, rpc } = client({}, {});
    expect(await joindrePhotoReleve(db, "demande", new File(["<html>faux</html>"], "compteur.png", { type: "image/png" }))).toHaveProperty("erreur");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("réutilise un document confirmé sans nouvel upload", async () => {
    const { db, upload } = client({ data: { document_id: "doc" } }, {});
    expect(await joindrePhotoReleve(db, "demande", png())).toEqual({ documentId: "doc" });
    expect(upload).not.toHaveBeenCalled();
  });
  it("résout une réponse d'upload perdue par la vérification en base", async () => {
    const { db, upload } = client({ data: { id: "depot", storage_path: "org/releves/depot.png" } }, { data: "doc" });
    upload.mockRejectedValueOnce(new Error("réseau interrompu"));
    expect(await joindrePhotoReleve(db, "demande", png())).toEqual({ documentId: "doc" });
    expect(upload).toHaveBeenCalledWith("org/releves/depot.png", expect.any(Uint8Array), { contentType: "image/png", upsert: false });
  });
  it("n'annonce jamais un succès sans confirmation de la GED", async () => {
    const { db } = client({ data: { id: "depot", storage_path: "org/releves/depot.png" } }, { error: { message: "manquant" } });
    expect(await joindrePhotoReleve(db, "demande", png())).toHaveProperty("erreur");
  });
});
