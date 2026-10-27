/**
 * Audit #264 — côté navigateur, avant tout transfert :
 *  - DOC-13 : un fichier déjà en transit (nouvel essai) n'est pas renvoyé ;
 *  - DOC-10 : une image dont seule la signature est valide est refusée ;
 *  - DOC-11 : un fichier vide est nommé comme tel dès la sélection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ reserver: vi.fn(), upload: vi.fn() }));
vi.mock("@/app/actions/depot-direct", () => ({ preparerDepotDirect: m.reserver }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: m.upload }) } }) }));
import { preparerDepotsDirects } from "@/lib/depot-direct-client";
import { MARQUEUR_DEPOT, PREFIXE_DEPOT } from "@/lib/depot-direct-commun";
import { fichierVide } from "@/components/champ-fichier";

const id = "22222222-2222-4222-8222-222222222222";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
function form(file: File) {
  const f = new FormData();
  f.set("fichier", file);
  f.set(MARQUEUR_DEPOT, JSON.stringify({ id: "champ", nom: "fichier" }));
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("document", { getElementById: () => null });
  vi.stubGlobal("HTMLInputElement", class {});
  m.upload.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("nouvel essai d’un fichier déjà en transit", () => {
  it("reprend la référence sans renvoyer les octets", async () => {
    m.reserver.mockResolvedValue({ id, chemin: "compte/" + id, transfere: true });
    const f = form(new File(["%PDF-1.7 rapport %%EOF"], "Rapport.pdf", { type: "application/pdf" }));
    await preparerDepotsDirects(f);
    expect(f.get("fichier")).toBe(PREFIXE_DEPOT + id);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("une réservation sans jeton ni transfert reste une erreur", async () => {
    m.reserver.mockResolvedValue({ id, chemin: "compte/" + id });
    await expect(preparerDepotsDirects(form(new File(["%PDF-1.7 rapport %%EOF"], "Rapport.pdf")))).rejects.toThrow("ne peut pas être préparé");
    expect(m.upload).not.toHaveBeenCalled();
  });
});

describe("image illisible", () => {
  it("refusée avant toute réservation quand le navigateur ne sait pas la décoder", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new DOMException("The source image could not be decoded.", "InvalidStateError"); }));
    const file = new File([PNG], "photo.png", { type: "image/png" }), f = form(file);
    await expect(preparerDepotsDirects(f)).rejects.toThrow("L’image « photo.png » est endommagée ou illisible");
    expect(m.reserver).not.toHaveBeenCalled();
    expect(f.get("fichier")).toBe(file);
  });

  it("transférée quand elle se décode", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ close })));
    m.reserver.mockResolvedValue({ id, chemin: "compte/" + id, jeton: "jeton" });
    await preparerDepotsDirects(form(new File([PNG], "photo.png", { type: "image/png" })));
    expect(close).toHaveBeenCalled();
    expect(m.upload).toHaveBeenCalledTimes(1);
  });
});

describe("fichier vide", () => {
  it("nomme le fichier vide choisi", () => {
    expect(fichierVide([new File([], "VDD-vide.pdf")])).toBe("Le fichier « VDD-vide.pdf » est vide : choisissez le document complet.");
  });
  it("ne dit rien sans sélection ou pour un fichier non vide", () => {
    expect(fichierVide(null)).toBeNull();
    expect(fichierVide([new File(["x"], "plein.pdf")])).toBeNull();
  });
});
