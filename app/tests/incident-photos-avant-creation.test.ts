import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), documents: vi.fn(), remove: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierLocataire: async () => ({
    user: { id: "locataire-test" },
    supabase: { rpc: banc.rpc, from: banc.documents, storage: { from: () => ({ upload: banc.upload, remove: banc.remove }) } },
  }),
  verifierGerant: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/lib/notifications", () => ({
  notifierIncidentUrgentDeclare: vi.fn(), notifierDevisDemande: vi.fn(),
  notifierMissionAnnulee: vi.fn(), notifierMissionConfiee: vi.fn(), notifierRendezVousFixe: vi.fn(),
}));
import { declarerMonIncident } from "@/app/actions/incidents";
import { TAILLE_MAX_DEPOT_OCTETS } from "@/lib/file-type";

beforeEach(() => {
  vi.clearAllMocks();
  banc.rpc.mockImplementation(async (nom: string) => ({ data: nom === "declarer_mon_incident_reprise" ? { incident_id: "incident-test", rejoue: false } : nom === "preparer_photo_incident" ? { id: "depot-test", storage_path: "org-test/photo.jpg", etat: "en_attente" } : { document_id: "document-test" }, error: null }));
  banc.upload.mockResolvedValue({ error: null });
  const chaine = { eq: vi.fn(), then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) }; chaine.eq.mockReturnValue(chaine);
  banc.documents.mockReturnValue({ select: () => chaine });
  banc.remove.mockResolvedValue({ data: [], error: null });
});
function declaration(photos: File[] = [], description = "") {
  const f = new FormData();
  f.set("commande", "11111111-1111-4111-8111-111111111111");
  f.set("categorie", "plomberie_canalisation");
  f.set("piece", "Cuisine");
  f.set("description", description);
  f.set("urgence", "normale");
  photos.forEach(p => f.append("photos", p));
  return f;
}
const jpeg = () => new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1])], "fuite.jpg", { type: "image/jpeg" });

describe("Photos du locataire : valider avant toute création", () => {
  it.each(["", "Fuite sous l'évier, côté évacuation"])("refuse un faux JPEG et conserve la saisie (description = %s)", async description => {
    const r = await declarerMonIncident("org-test", {}, declaration([new File(["du texte"], "fuite.jpg", { type: "image/jpeg" })], description));
    expect(r.erreur).toMatch(/n'est pas une image JPEG ou PNG/);
    expect(r.valeurs).toMatchObject({ piece: "Cuisine", description });
    expect(r.succes).toBeUndefined();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.upload).not.toHaveBeenCalled();
  });
  it("refuse une photo supérieure à 4 Mo sans créer de signalement", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration([new File([new Uint8Array(TAILLE_MAX_DEPOT_OCTETS + 1)], "photo.jpg", { type: "image/jpeg" })]));
    expect(r.erreur).toMatch(/dépasse 4 Mo/);
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.upload).not.toHaveBeenCalled();
  });
  it("une photo valide suivie d'une invalide n'entraîne aucune écriture partielle", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration([jpeg(), new File(["texte"], "autre.png", { type: "image/png" })]));
    expect(r.erreur).toBeTruthy();
    expect(banc.rpc).not.toHaveBeenCalled();
    expect(banc.upload).not.toHaveBeenCalled();
  });
  it("conserve la déclaration avec une photo valide seule", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration([jpeg()]));
    expect(r.erreur).toBeUndefined();
    expect(r.avertissement).toBeUndefined();
    expect(r.succes).toContain("Signalement envoyé");
    expect(banc.upload).toHaveBeenCalledOnce();
    expect(banc.rpc).toHaveBeenCalledWith("declarer_mon_incident_reprise", expect.objectContaining({ p_description: "" }));
    expect(banc.rpc).toHaveBeenCalledWith("finaliser_photo_incident", expect.anything());
  });
  it("conserve la déclaration avec une description seule", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration([], "Fuite sous l'évier"));
    expect(r.succes).toContain("Signalement envoyé");
    expect(banc.rpc).toHaveBeenCalledOnce();
    expect(banc.upload).not.toHaveBeenCalled();
  });
  it("refuse toujours la déclaration sans photo ni description", async () => {
    const r = await declarerMonIncident("org-test", {}, declaration());
    expect(r.erreur).toMatch(/au moins une photo/);
    expect(banc.rpc).not.toHaveBeenCalled();
  });
});
