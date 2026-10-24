import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ acces: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: m.acces }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: m.service }));
import { lirePresentationSignatures } from "@/lib/lecture-presentation-signatures";
const org = "00000000-0000-4000-8000-000000000001", bail = "00000000-0000-4000-8000-000000000002";
function client() {
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), in: vi.fn(() => q), or: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(async () => ({ data: [] as unknown[], error: null as unknown })) };
  return { from: vi.fn(() => q), rpc: vi.fn(async () => ({ data: true, error: null as unknown })), q };
}
beforeEach(() => vi.resetAllMocks());
describe("Lecture minimale des états de signature", () => {
  it("garde le client de session et la RLS du propriétaire", async () => {
    const db = client(); m.acces.mockResolvedValue({ supabase: db, traverseeLectureSeule: false });
    expect(await lirePresentationSignatures(org, { baux: [bail] })).toEqual({ circuits: [], erreur: false });
    expect(m.service).not.toHaveBeenCalled();
    expect(db.q.eq).toHaveBeenCalledWith("organization_id", org);
    expect(db.q.eq).toHaveBeenCalledWith("modele", "bail");
    expect(db.q.in).toHaveBeenCalledWith("bail_id", [bail]);
    expect(db.q.select).toHaveBeenCalledWith("bail_id,modele,etat,document_id,document_signe,created_at");
  });
  it.each([false, null])("refuse la lecture privilégiée si le second contrôle refuse (%s)", async autorise => {
    const db = client(); db.rpc.mockResolvedValue({ data: autorise as boolean, error: null });
    m.acces.mockResolvedValue({ supabase: db, traverseeLectureSeule: true });
    expect((await lirePresentationSignatures(org, { baux: [bail] })).erreur).toBe(true);
    expect(m.service).not.toHaveBeenCalled(); expect(db.from).not.toHaveBeenCalled();
  });
  it("borne la supervision à l'organisation et aux références affichées, sans signataires", async () => {
    const db = client(), service = client(); m.acces.mockResolvedValue({ supabase: db, traverseeLectureSeule: true }); m.service.mockReturnValue(service);
    await lirePresentationSignatures(org, { documents: [bail] });
    expect(db.rpc).toHaveBeenCalledWith("is_super_admin");
    expect(service.q.eq).toHaveBeenCalledWith("organization_id", org);
    expect(service.q.or).toHaveBeenCalledWith(`document_id.in.(${bail}),document_signe.in.(${bail})`);
    expect(service.q.select).toHaveBeenCalledWith("bail_id,modele,etat,document_id,document_signe,created_at");
  });
  it("ne présente jamais un échec de lecture ou une troncature comme une absence de signature", async () => {
    const db = client(); m.acces.mockResolvedValue({ supabase: db, traverseeLectureSeule: false });
    db.q.limit.mockResolvedValue({ data: [], error: new Error("indisponible") });
    expect((await lirePresentationSignatures(org, { baux: [bail] })).erreur).toBe(true);
    db.q.limit.mockResolvedValue({ data: Array.from({ length: 1001 }, () => ({})), error: null });
    expect(await lirePresentationSignatures(org, { baux: [bail] })).toEqual({ circuits: [], erreur: true });
  });
  it("refuse un identifiant qui pourrait détourner le filtre avant toute lecture", async () => {
    expect((await lirePresentationSignatures(org, { documents: ["x),organization_id.neq.y"] })).erreur).toBe(true);
    expect(m.acces).not.toHaveBeenCalled();
  });
});
