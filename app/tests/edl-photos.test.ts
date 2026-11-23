/**
 * ÉTAT DES LIEUX : UNE PHOTO PAR ÉLÉMENT, REPRISE DANS LE DOCUMENT — audit palier 1 du 22/11/2026, P2-01. Sans base.
 *
 * Ces tests tiennent :
 *  1. le document : chaque photo reçoit un numéro dans l'ordre de la grille, la ligne de l'élément y renvoie, l'image
 *     est imprimée avec sa légende ; une photo illisible garde sa légende et le dit ; sans photo, rien ne change ;
 *     seules des images JPEG ou PNG encodées par l'assemblage sont imprimées (rien d'autre ne passe dans le document) ;
 *  2. le chargement : les photos sont lues dans les documents DE L'ESPACE ; une pièce purgée, d'un autre type ou
 *     absente reste en légende seule ;
 *  3. les actions : refus après signature, refus de ce qui n'est pas une image, dépôt comme document « autre » rattaché
 *     au bail, lien posé sur la ligne de CET état des lieux ; retrait du lien sans suppression du fichier.
 * La base est tenue par tests/edl-photos-base.test.ts, l'écran et le PDF réel par e2e/edl-photos.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  signe: false,
  ligne: null as null | Record<string, unknown>,
  refus: null as null | string,
  ecritures: [] as { table: string; operation: string; valeurs: unknown; filtres: Record<string, unknown> }[],
  deposer: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: banc.deposer, preparerFichierGed: vi.fn(), abandonnerPieceGed: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "gerant-test" },
    supabase: {
      from(table: string) {
        const filtres: Record<string, unknown> = {};
        let operation = "select";
        let valeurs: unknown = null;
        const q = {
          select() { return q; },
          eq(c: string, v: unknown) { filtres[c] = v; return q; },
          update(v: unknown) { operation = "update"; valeurs = v; banc.ecritures.push({ table, operation, valeurs, filtres }); return q; },
          upsert: async (v: unknown) => { banc.ecritures.push({ table, operation: "upsert", valeurs: v, filtres }); return { error: null }; },
          maybeSingle: async () => ({ data: table === "etats_des_lieux" ? { etat: banc.signe ? "signe" : "brouillon" } : banc.ligne, error: null }),
          then: (suite: (r: { data: unknown; error: null | { message: string } }) => unknown) =>
            Promise.resolve(operation === "update" && banc.refus ? { data: null, error: { message: banc.refus } } : { data: operation === "update" ? [{ id: filtres.id }] : [], error: null }).then(suite),
        };
        return q;
      },
    },
  }),
}));

import { joindrePhotoLigneEdl, retirerPhotoLigneEdl } from "@/app/actions/edl";
import { Fusion } from "@/lib/documents/gabarit";
import { chargerPhotosEdl, construireEdl, type DonneesEdl, type LigneEdl } from "@/lib/documents/modeles/edl";

const ORG = "11111111-1111-4111-8111-111111111111", BAIL = "22222222-2222-4222-8222-222222222222";
const EDL = "33333333-3333-4333-8333-333333333333", LIGNE = "44444444-4444-4444-8444-444444444444";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

function donnees(lignes: LigneEdl[], photos?: DonneesEdl["photos"], type: "entree" | "sortie" = "entree"): DonneesEdl {
  const f = new Fusion();
  return {
    type, reference: "EDL-1", dateEdl: "2026-09-01", signeLe: null, personnesPresentes: "Le bailleur et le locataire",
    detecteurFumeePresent: true, detecteurFumeeEtat: "Fonctionnel", attestationAssuranceFournie: true,
    adresseRestitutionDepot: "12 rue des Lilas, 69003 Lyon", observations: "Néant", lignes, photos,
    compteurs: [{ type: "Électricité", numero: "E-1", releve: "100" }], cles: [{ libelle: "Clé", nombre: 2, reference: null }],
    comparatif: [], retenues: [], bailleurNom: "Claire Moreau", locatairesNoms: "Julie Leblanc",
    logementAdresse: "12 rue des Lilas, 69003 Lyon", referenceBail: "BAIL-1",
    exp: { nom: "Parc", adresse: "8 avenue des Tilleuls, 69006 Lyon", email: "c@example.invalid", telephone: null, ville: "Lyon" }, typeOrganisation: "proprietaire_direct", f,
  };
}
const ligne = (libelle: string, piece: string | null, photo?: string | null, sur: Partial<LigneEdl> = {}): LigneEdl =>
  ({ categorie: piece ? "piece" : "equipement", piece, libelle, etat: "bon", commentaire: null, photo_document_id: photo, ...sur });
const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("document de l'état des lieux : les photos", () => {
  it("numérotées dans l'ordre de la grille ; la ligne renvoie au numéro ; l'image est imprimée avec sa légende", () => {
    const lignes = [ligne("Sols", "Séjour", "d1", { commentaire: "Rayure près de la fenêtre" }), ligne("Murs", "Séjour"), ligne("Évier", "Cuisine", "d2"), ligne("Réfrigérateur", null, "d3")];
    const doc = construireEdl(donnees(lignes, { d1: JPEG, d2: PNG, d3: JPEG }));
    expect(texte(doc.html)).toContain("Rayure près de la fenêtre (photo n° 1)");
    expect(texte(doc.html)).toContain("3 photos sont jointes au présent état des lieux");
    expect(texte(doc.html)).toContain("Photo n° 1 — Séjour — Sols");
    expect(texte(doc.html)).toContain("Photo n° 2 — Cuisine — Évier");
    expect(texte(doc.html)).toContain("Photo n° 3 — Équipements — Réfrigérateur");
    expect(doc.html.match(/<figure data-photo-edl="\d+"/g)).toHaveLength(3);
    expect(doc.html.match(/<img src="data:image\/(?:jpeg|png);base64,[^"]+"/g)).toHaveLength(3);
    expect(doc.html.match(/data-renvoi-photo/g)).toHaveLength(3);
    // Les photos précèdent les observations et les signatures : elles font partie de ce qui est signé.
    expect(doc.html.indexOf("data-photo-edl")).toBeLessThan(doc.html.indexOf("Observations des parties"));
    expect(doc.manquants).toEqual([]);
  });

  it("une seule photo : phrase au singulier ; une ligne sans observation porte quand même son renvoi", () => {
    const doc = construireEdl(donnees([ligne("Sols", "Séjour", "d1")], { d1: JPEG }));
    expect(texte(doc.html)).toContain("Une photo est jointe au présent état des lieux");
    expect(texte(doc.html)).toContain("— (photo n° 1)");
  });

  it("photo illisible à l'édition : la légende reste, sans image, et le dit ; le numéro est gardé", () => {
    const doc = construireEdl(donnees([ligne("Sols", "Séjour", "d1"), ligne("Murs", "Séjour", "d2")], { d1: null, d2: JPEG }));
    expect(doc.html).toContain('data-photo-edl="1" data-photo-indisponible');
    expect(texte(doc.html)).toContain("Photo n° 1 — Séjour — Sols — image indisponible au moment de l'édition ; elle reste consultable dans les documents du bail.");
    expect(texte(doc.html)).toContain("Photo n° 2 — Séjour — Murs");
    expect(doc.html.match(/<img src="data:image/g)).toHaveLength(1);
    expect(doc.manquants).toEqual([]);
  });

  it.each([
    ["une adresse externe", "https://exemple.invalid/photo.jpg"],
    ["un type non prévu", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["du code glissé dans la valeur", 'data:image/jpeg;base64,AAAA" onerror="alert(1)'],
    ["un script", "javascript:alert(1)"],
  ])("seules des images JPEG ou PNG encodées s'impriment : %s n'entre pas dans le document", (_cas, valeur) => {
    const doc = construireEdl(donnees([ligne("Sols", "Séjour", "d1")], { d1: valeur }));
    expect(doc.html).not.toContain("<img src=");
    expect(doc.html).not.toContain("onerror");
    expect(doc.html).not.toContain("exemple.invalid");
    expect(doc.html).toContain("data-photo-indisponible");
  });

  it("la légende échappe le libellé et la pièce", () => {
    const doc = construireEdl(donnees([ligne("<b>Sols</b>", "Séjour & <i>salon</i>", "d1")], { d1: JPEG }));
    expect(doc.html).toContain("Photo n° 1 — Séjour &amp; &lt;i&gt;salon&lt;/i&gt; — &lt;b&gt;Sols&lt;/b&gt;");
  });

  it("sans photo, ou sans chargement des photos, le document est celui d'avant", () => {
    const sans = construireEdl(donnees([ligne("Sols", "Séjour"), ligne("Murs", "Séjour")]));
    expect(sans.html).not.toContain("data-photo-edl");
    expect(sans.html).not.toContain("data-renvoi-photo");
    expect(texte(sans.html)).not.toMatch(/Photo n°|photos sont jointes/);
    // Une ligne qui porte un identifiant que l'assemblage n'a pas chargé n'invente pas de photo.
    const nonChargee = construireEdl(donnees([ligne("Sols", "Séjour", "d1")], {}));
    expect(nonChargee.html).not.toContain("data-photo-edl");
    expect(construireEdl(donnees([ligne("Sols", "Séjour", "d1")])).html).not.toContain("data-photo-edl");
  });

  it("un état des lieux de sortie imprime ses photos de la même façon", () => {
    const doc = construireEdl(donnees([ligne("Sols", "Séjour", "d1")], { d1: JPEG }, "sortie"));
    expect(texte(doc.html)).toContain("Photo n° 1 — Séjour — Sols");
  });
});

describe("chargement des photos pour l'édition", () => {
  const stockage = (fichiers: Record<string, Uint8Array | null>, documents: Record<string, unknown>[]) => {
    const lectures: { filtres: Record<string, unknown>; ids: string[] }[] = [];
    const telecharges: string[] = [];
    return {
      lectures, telecharges,
      client: {
        from: () => {
          const filtres: Record<string, unknown> = {};
          const q = {
            select: () => q,
            eq: (c: string, v: unknown) => { filtres[c] = v; return q; },
            in: async (_c: string, ids: string[]) => { lectures.push({ filtres, ids }); return { data: documents.filter((d) => ids.includes(String(d.id))), error: null }; },
          };
          return q;
        },
        storage: { from: (bucket: string) => ({ download: async (chemin: string) => { telecharges.push(`${bucket}:${chemin}`); const o = fichiers[chemin]; return { data: o ? new Blob([o as BlobPart]) : null, error: null }; } }) },
      } as never,
    };
  };
  const octets = new Uint8Array([255, 216, 255, 224]);

  it("aucune photo : aucune lecture", async () => {
    const s = stockage({}, []);
    expect(await chargerPhotosEdl(s.client, ORG, [null, undefined])).toEqual({});
    expect(s.lectures).toEqual([]);
  });

  it("lit les documents de l'espace, une fois chacun, et encode les images", async () => {
    const s = stockage({ "org/a.jpg": octets, "org/b.png": octets }, [
      { id: "d1", storage_path: "org/a.jpg", mime_type: "image/jpeg", purged_at: null },
      { id: "d2", storage_path: "org/b.png", mime_type: "image/png", purged_at: null },
    ]);
    const photos = await chargerPhotosEdl(s.client, ORG, ["d1", null, "d2", "d1"]);
    expect(s.lectures).toEqual([{ filtres: { organization_id: ORG }, ids: ["d1", "d2"] }]);
    expect(s.telecharges).toEqual(["documents:org/a.jpg", "documents:org/b.png"]);
    expect(photos).toEqual({ d1: `data:image/jpeg;base64,${Buffer.from(octets).toString("base64")}`, d2: `data:image/png;base64,${Buffer.from(octets).toString("base64")}` });
  });

  it("pièce purgée, d'un autre type, absente de l'espace ou fichier illisible : légende seule (null), jamais d'erreur", async () => {
    const s = stockage({ "org/c.pdf": octets, "org/purge.jpg": octets }, [
      { id: "purgee", storage_path: "org/purge.jpg", mime_type: "image/jpeg", purged_at: "2026-01-01T00:00:00Z" },
      { id: "pdf", storage_path: "org/c.pdf", mime_type: "application/pdf", purged_at: null },
      { id: "illisible", storage_path: "org/absent.jpg", mime_type: "image/jpeg", purged_at: null },
    ]);
    expect(await chargerPhotosEdl(s.client, ORG, ["purgee", "pdf", "illisible", "ailleurs"])).toEqual({ purgee: null, pdf: null, illisible: null, ailleurs: null });
    // Seul le fichier d'une image non purgée est demandé au stockage.
    expect(s.telecharges).toEqual(["documents:org/absent.jpg"]);
  });
});

describe("actions : ajouter, remplacer, retirer la photo d'un élément", () => {
  const jpeg = () => new File([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1])], "sol.jpg", { type: "image/jpeg" });
  const envoi = (fichier?: File) => { const f = new FormData(); if (fichier) f.set("photo", fichier); return f; };
  beforeEach(() => {
    banc.signe = false;
    banc.refus = null;
    banc.ligne = { id: LIGNE, libelle: "Sols", piece: "Séjour", photo_document_id: null };
    banc.ecritures = [];
    banc.deposer.mockReset().mockResolvedValue({ documentId: "doc-neuf" });
  });

  it("dépose la photo comme document « autre » rattaché au bail, puis pose le lien sur la ligne de cet état des lieux", async () => {
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(jpeg()))).toEqual({ succes: "Photo ajoutée." });
    expect(banc.deposer).toHaveBeenCalledTimes(1);
    expect(banc.deposer.mock.calls[0].slice(2, 6)).toEqual([ORG, expect.any(File), "autre", "Photo d’état des lieux — Séjour — Sols"]);
    expect(banc.ecritures).toEqual([
      // L'essai à blanc réécrit la valeur actuelle AVANT le dépôt : la base y dit ses refus.
      { table: "edl_lignes", operation: "update", valeurs: { photo_document_id: null }, filtres: { id: LIGNE, edl_id: EDL, organization_id: ORG } },
      { table: "document_liens", operation: "upsert", valeurs: { document_id: "doc-neuf", organization_id: ORG, entite: "bail", entite_id: BAIL }, filtres: {} },
      { table: "edl_lignes", operation: "update", valeurs: { photo_document_id: "doc-neuf" }, filtres: { id: LIGNE, edl_id: EDL, organization_id: ORG } },
    ]);
  });

  it("refus de la base à l'essai à blanc (circuit de signature en cours) : le message est rendu, aucun fichier n'est déposé", async () => {
    banc.refus = "Annulez le circuit de signature de cet état des lieux avant de modifier son relevé.";
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(jpeg()))).toEqual({ erreur: "Annulez le circuit de signature de cet état des lieux avant de modifier son relevé." });
    expect(banc.deposer).not.toHaveBeenCalled();
    expect(banc.ecritures.map((e) => e.table)).toEqual(["edl_lignes"]);
    expect(banc.ecritures[0].valeurs).toEqual({ photo_document_id: null });
  });

  it("une image déjà déposée dans l'espace est rattachée, sans second fichier ; une photo existante est remplacée", async () => {
    banc.deposer.mockResolvedValue({ doublonId: "doc-existant", erreur: "Ce fichier existe déjà." });
    banc.ligne = { id: LIGNE, libelle: "Sols", piece: null, photo_document_id: "doc-ancien" };
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(jpeg()))).toEqual({ succes: "Photo remplacée." });
    expect(banc.deposer.mock.calls[0][5]).toBe("Photo d’état des lieux — Sols");
    expect(banc.ecritures.at(-1)).toMatchObject({ table: "edl_lignes", valeurs: { photo_document_id: "doc-existant" } });
  });

  it("état des lieux signé, élément d'un autre état des lieux, fichier absent ou qui n'est pas une image : refus, rien n'est écrit", async () => {
    banc.signe = true;
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(jpeg()))).toEqual({ erreur: "Cet état des lieux est signé — ses photos sont figées." });
    expect(await retirerPhotoLigneEdl(ORG, BAIL, EDL, LIGNE)).toEqual({ erreur: "Cet état des lieux est signé — ses photos sont figées." });
    banc.signe = false;
    banc.ligne = null;
    expect((await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(jpeg()))).erreur).toMatch(/Élément introuvable/);
    expect((await joindrePhotoLigneEdl(ORG, BAIL, EDL, "pas-un-identifiant", envoi(jpeg()))).erreur).toMatch(/Élément introuvable/);
    banc.ligne = { id: LIGNE, libelle: "Sols", piece: "Séjour", photo_document_id: null };
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi())).toEqual({ erreur: "Choisissez une photo." });
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(new File(["du texte"], "sol.jpg", { type: "image/jpeg" })))).toEqual({ erreur: "Une photo doit être une image JPEG ou PNG." });
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "sol.pdf", { type: "application/pdf" })))).toEqual({ erreur: "Une photo doit être une image JPEG ou PNG." });
    expect(banc.deposer).not.toHaveBeenCalled();
    expect(banc.ecritures).toEqual([]);
  });

  it("si le dépôt échoue, aucun lien n'est posé", async () => {
    banc.deposer.mockResolvedValue({ erreur: "Fichier refusé par le stockage." });
    expect(await joindrePhotoLigneEdl(ORG, BAIL, EDL, LIGNE, envoi(jpeg()))).toEqual({ erreur: "Fichier refusé par le stockage." });
    // Seul l'essai à blanc (valeur inchangée) a été écrit.
    expect(banc.ecritures).toEqual([{ table: "edl_lignes", operation: "update", valeurs: { photo_document_id: null }, filtres: { id: LIGNE, edl_id: EDL, organization_id: ORG } }]);
  });

  it("retirer : le lien est levé sur la ligne ; le fichier n'est pas supprimé et l'écran le dit", async () => {
    banc.ligne = { id: LIGNE, libelle: "Sols", piece: "Séjour", photo_document_id: "doc-neuf" };
    expect(await retirerPhotoLigneEdl(ORG, BAIL, EDL, LIGNE)).toEqual({ succes: "Photo retirée de l’état des lieux. Le fichier reste dans les documents du bail." });
    expect(banc.ecritures).toEqual([{ table: "edl_lignes", operation: "update", valeurs: { photo_document_id: null }, filtres: { id: LIGNE, edl_id: EDL, organization_id: ORG } }]);
    banc.ligne = { id: LIGNE, libelle: "Sols", piece: "Séjour", photo_document_id: null };
    banc.ecritures = [];
    expect(await retirerPhotoLigneEdl(ORG, BAIL, EDL, LIGNE)).toEqual({ succes: "Aucune photo sur cet élément." });
    expect(banc.ecritures).toEqual([]);
  });
});
