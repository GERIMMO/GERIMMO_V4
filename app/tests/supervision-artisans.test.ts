import { beforeEach, describe, expect, it, vi } from "vitest";
import { traiterInscriptionArtisan } from "@/app/actions/supervision-artisans";
import { GET } from "@/app/admin/artisans/pieces/[pieceId]/fichier/route";

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

function client({ sa = true, traceErreur = false, statut = "en_attente", siret = "verifie", pieceAbsente = false } = {}) {
  const rpc = vi.fn(async (nom: string) => ({ data: nom === "is_super_admin" ? sa : null, error: nom === "log_sa_access" && traceErreur ? { message: "trace en panne" } : null }));
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
  it("journalise puis appelle la décision métier existante", async () => {
    const c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("refus", { motif: " Pièce illisible " }))).toHaveProperty("succes");
    expect(c.rpc.mock.calls.map((a) => a[0])).toEqual(["is_super_admin", "log_sa_access", "artisan_decider_plateforme"]);
    expect(c.rpc).toHaveBeenLastCalledWith("artisan_decider_plateforme", { p_artisan: "artisan", p_decision: "refus", p_motif: "Pièce illisible" });
  });
  it("n’effectue pas le constat de SIRET sans confirmation ni traçabilité", async () => {
    let c = client();
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("verifier_siret"))).toHaveProperty("erreur");
    expect(c.rpc).toHaveBeenCalledTimes(1);
    c = client({ traceErreur: true });
    expect(await traiterInscriptionArtisan("artisan", {}, donnees("verifier_siret", { verification_effectuee: "oui" }))).toHaveProperty("erreur");
    expect(c.rpc).not.toHaveBeenCalledWith("artisan_definir_siret_etat", expect.anything());
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
