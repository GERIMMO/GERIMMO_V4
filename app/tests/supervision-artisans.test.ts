import { beforeEach, describe, expect, it, vi } from "vitest";
import { traiterInscriptionArtisan } from "@/app/actions/supervision-artisans";
import { GET } from "@/app/admin/artisans/pieces/[pieceId]/fichier/route";

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

function client({ sa = true, traceErreur = false, statut = "en_attente", siret = "verifie", pieceAbsente = false, decisionErreur = "" } = {}) {
  const rpc = vi.fn(async (nom: string) => ({
    data: nom === "is_super_admin" ? sa : null,
    error: nom === "traiter_inscription_artisan_atomique" && decisionErreur
      ? { message: decisionErreur }
      : nom === "log_sa_access" && traceErreur ? { message: "trace en panne" } : null,
  }));
  const download = vi.fn(async () => ({ data: new Blob(["photo"], { type: "image/png" }), error: null }));
  const from = vi.fn((table: string) => {
    const q = {
      select: vi.fn(() => q), eq: vi.fn(() => q), is: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: table === "artisans" ? { id: "artisan", statut_plateforme: statut, siret_etat: siret } : pieceAbsente ? null : { id: "piece", artisan_id: "artisan", type: "rc_pro", storage_path: "artisans/artisan/rc_pro.png" }, error: null })),
    };
    return q;
  });
  const c = { rpc, from, storage: { from: vi.fn(() => ({ download })) } };
  mocks.client.mockResolvedValue(c);
  return { ...c, download };
}
function donnees(operation: string, champs: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("operation", operation);
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}
const fichier = () => GET(new Request("http://localhost/fichier"), { params: Promise.resolve({ pieceId: "piece" }) });
beforeEach(() => vi.clearAllMocks());

describe("décisions de supervision artisan", () => {
  it("refuse un autre rôle avant toute lecture du dossier", async () => {
    const c = client({ sa: false });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation"))).toHaveProperty("erreur");
    expect(c.from).not.toHaveBeenCalled();
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("ne valide pas un SIRET non vérifié ni un dossier non relu", async () => {
    let c = client({ siret: "non_verifie" });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation", { pieces_relues: "oui" }))).toHaveProperty("erreur");
    expect(c.rpc).toHaveBeenCalledTimes(1);
    c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation"))).toHaveProperty("erreur");
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("refuse un refus sans motif et une décision sur un dossier déjà traité", async () => {
    let c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: "   " }))).toHaveProperty("erreur");
    expect(c.rpc).toHaveBeenCalledTimes(1);
    c = client({ statut: "valide" });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation", { pieces_relues: "oui" }))).toHaveProperty("erreur");
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
  it("confie le refus et sa trace à un seul appel atomique", async () => {
    const c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: " Pièce illisible " }))).toHaveProperty("succes");
    expect(c.rpc.mock.calls.map((a) => a[0])).toEqual(["is_super_admin", "traiter_inscription_artisan_atomique"]);
    expect(c.rpc).toHaveBeenLastCalledWith("traiter_inscription_artisan_atomique", {
      p_artisan: "artisan", p_operation: "refus", p_motif: "Pièce illisible",
      p_verification_effectuee: false, p_pieces_relues: false,
    });
    expect(mocks.revalidate.mock.calls.map((a) => a[0])).toEqual(["/admin/artisans", "/admin", "/artisan/entreprise"]);
  });
  it("n’effectue pas le constat de SIRET sans confirmation ni si la transaction échoue", async () => {
    let c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("verifier_siret"))).toHaveProperty("erreur");
    expect(c.rpc).toHaveBeenCalledTimes(1);
    c = client({ decisionErreur: "La décision ne peut pas être journalisée." });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("verifier_siret", { verification_effectuee: "oui" })))
      .toEqual({ erreur: "La décision ne peut pas être journalisée." });
    expect(c.rpc.mock.calls.map((a) => a[0])).toEqual(["is_super_admin", "traiter_inscription_artisan_atomique"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("transmet les confirmations de SIRET et de relecture, et le réexamen", async () => {
    let c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("verifier_siret", { verification_effectuee: "oui" }))).toHaveProperty("succes");
    expect(c.rpc).toHaveBeenLastCalledWith("traiter_inscription_artisan_atomique", {
      p_artisan: "artisan", p_operation: "verifier_siret", p_motif: null,
      p_verification_effectuee: true, p_pieces_relues: false,
    });
    c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation", { pieces_relues: "oui" }))).toHaveProperty("succes");
    expect(c.rpc).toHaveBeenLastCalledWith("traiter_inscription_artisan_atomique", {
      p_artisan: "artisan", p_operation: "validation", p_motif: null,
      p_verification_effectuee: false, p_pieces_relues: true,
    });
    c = client({ statut: "refuse" });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("remise_en_attente"))).toHaveProperty("succes");
    expect(c.rpc).toHaveBeenLastCalledWith("traiter_inscription_artisan_atomique", {
      p_artisan: "artisan", p_operation: "remise_en_attente", p_motif: null,
      p_verification_effectuee: false, p_pieces_relues: false,
    });
  });
  it("affiche le refus sous verrou si le dossier change après la première lecture", async () => {
    const c = client({ decisionErreur: "Cette inscription a déjà changé d’état. Rechargez la page." });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("validation", { pieces_relues: "oui" })))
      .toEqual({ erreur: "Cette inscription a déjà changé d’état. Rechargez la page." });
    expect(c.rpc.mock.calls.map((a) => a[0])).toEqual(["is_super_admin", "traiter_inscription_artisan_atomique"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("justificatifs globaux servis à la supervision", () => {
  it("interdit les autres rôles sans lire de pièce ni de stockage", async () => {
    const c = client({ sa: false });
    expect((await fichier()).status).toBe(403);
    expect(c.from).not.toHaveBeenCalled();
    expect(c.download).not.toHaveBeenCalled();
  });
  it("refuse une pièce absente et une consultation non journalisable", async () => {
    let c = client({ pieceAbsente: true });
    expect((await fichier()).status).toBe(404);
    expect(c.download).not.toHaveBeenCalled();
    c = client({ traceErreur: true });
    expect((await fichier()).status).toBe(503);
    expect(c.download).not.toHaveBeenCalled();
  });
  it("sert le fichier après la trace, sans cache ni interprétation MIME", async () => {
    const c = client();
    const r = await fichier();
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(c.rpc).toHaveBeenCalledWith("log_sa_access", { org: null, sa_action: "consultation_piece_artisan", sa_details: { artisan_id: "artisan", piece_id: "piece" } });
    expect(c.download).toHaveBeenCalledWith("artisans/artisan/rc_pro.png");
  });
});
