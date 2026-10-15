/**
 * X17 (SUP-09, décision du 14/10/2026) — plus de PDF de devis orphelin dans le compartiment `devis-preparations`.
 *
 * Hypothèse de l'audit, vérifiée ici : chaque validation d'un devis téléverse un NOUVEAU PDF (chemin aléatoire) et
 * n'efface jamais l'ancien ; une validation qui perd une course (conflit 409) laisse aussi son PDF. L'artisan qui valide,
 * modifie, revalide trois fois avant l'envoi laissait trois objets pour une seule référence en base.
 *
 * Correction décidée : après une mise à jour réussie, effacer l'ancien chemin ; si l'enregistrement échoue, effacer le
 * chemin qu'on vient de déposer. Seul le compartiment `devis-preparations` est concerné, jamais `documents`, jamais un
 * devis déjà envoyé. Un échec d'effacement ne fait jamais échouer la validation (l'objet reste, on le consigne).
 *
 * Banc simulé : aucun objet réel n'est lu ni supprimé.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ acces: vi.fn(), pdf: vi.fn(), upload: vi.fn(), remove: vi.fn(), update: vi.fn(), insert: vi.fn(), select: vi.fn(), single: vi.fn(), lecture: vi.fn(), service: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/parcours-devis-serveur", () => ({ chargerPreparationDevis: m.acces }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: m.service }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: m.pdf }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifierDevisRecu: vi.fn() }));
vi.mock("@/app/artisan/acces", () => ({ verifierArtisanAction: vi.fn(async () => ({ fiche: { artisan_id: "artisan-a" } })) }));

import { POST } from "../src/app/api/devis/[sollicitationId]/pdf/route";
import { enregistrerBrouillonDevis } from "../src/app/artisan/devis/actions-preparation";

const contexte = { params: Promise.resolve({ sollicitationId: "demande-a" }) };
const octets = Buffer.from("%PDF-validated");
const ANCIEN = "org-a/devis-gerimmo/ancien-pdf.pdf";

function saisie(revision = "1") {
  const f = new FormData();
  Object.entries({
    revision, validation_artisan: "oui", diagnostic: "Joint usé", delai: "Sous cinq jours", duree: "Une heure", valide_jusqu_au: "2099-01-30",
    contraintes: "Couper l’eau",
    lignes_devis: JSON.stringify([{ code: "plomberie_heure", libelle: "Remplacement du joint", quantite: 2, prix_unitaire_ht_cents: 2500, tva_bps: 1000, montant_ttc_cents: 1 }]),
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}
const requete = (f = saisie()) => new Request("http://localhost/api/devis/demande-a/pdf", { method: "POST", body: f });

/** Les appels de stockage, avec leur compartiment. */
const supprimes = () => m.remove.mock.calls.map(([chemins]) => chemins as string[]).flat();
const deposes = () => m.upload.mock.calls.map(([chemin]) => chemin as string);

function acces(preparation: Record<string, unknown> | null) {
  const q = { update: m.update, insert: m.insert, select: m.select, eq: vi.fn(), neq: vi.fn(), single: m.single, maybeSingle: m.lecture };
  q.eq.mockReturnValue(q); q.neq.mockReturnValue(q); m.select.mockReturnValue(q); m.update.mockReturnValue(q); m.insert.mockReturnValue(q);
  const compartiments: string[] = [];
  const service = {
    from: vi.fn(() => q),
    storage: { from: vi.fn((bucket: string) => { compartiments.push(bucket); return { upload: m.upload, remove: m.remove, download: vi.fn() }; }) },
  };
  return {
    service, compartiments,
    supabase: {}, preparation,
    profil: { adresse: "Adresse entreprise test", mentions: "Mentions entreprise" },
    fiche: { artisan_id: "artisan-a", raison_sociale: "Artisan connecté", siret: "12345678900012", telephone: null, email: null },
    demande: { statut: "envoyee", organization_id: "org-a", agence_nom: "Client destinataire", incident_numero: "INC-A", ville: "Paris", code_postal: "75012" },
  };
}

let a: ReturnType<typeof acces>;
function preparer(preparation: Record<string, unknown> | null) {
  a = acces(preparation);
  m.acces.mockResolvedValue(a);
  m.service.mockReturnValue(a.service);
}

beforeEach(() => {
  vi.resetAllMocks();
  m.single.mockResolvedValue({ data: { revision: 2 }, error: null });
  // Relecture de la base après un échec : par défaut elle référence encore l'ANCIEN PDF (la mise à jour n'a pas eu lieu).
  m.lecture.mockResolvedValue({ data: { pdf_path: ANCIEN }, error: null });
  m.upload.mockResolvedValue({ error: null });
  m.remove.mockResolvedValue({ data: [], error: null });
  m.pdf.mockResolvedValue(octets);
});

const prepValide = (extra: Record<string, unknown> = {}) => ({
  revision: 1, reference_id: "11111111-1111-1111-1111-111111111111", statut: "valide",
  pdf_bucket: "devis-preparations", pdf_path: ANCIEN, ...extra,
});

describe("X17 — validation d'un devis : l'ancien PDF est effacé après la mise à jour", () => {
  it("revalidation réussie : l'ancien chemin part du compartiment, le nouveau reste", async () => {
    preparer(prepValide());
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(200);
    const [nouveau] = deposes();
    expect(nouveau).toMatch(/^org-a\/devis-gerimmo\/.+\.pdf$/);
    expect(nouveau).not.toBe(ANCIEN);
    expect(supprimes()).toEqual([ANCIEN]);
    expect(supprimes()).not.toContain(nouveau);
  });

  it("l'effacement vise le compartiment devis-preparations, et lui seul", async () => {
    preparer(prepValide());
    await POST(requete(), contexte);
    expect(new Set(a.compartiments)).toEqual(new Set(["devis-preparations"]));
  });

  it("l'ancien PDF n'est effacé qu'APRÈS l'enregistrement réussi", async () => {
    preparer(prepValide());
    const ordre: string[] = [];
    m.upload.mockImplementation(async () => { ordre.push("depot"); return { error: null }; });
    m.single.mockImplementation(async () => { ordre.push("enregistrement"); return { data: { revision: 2 }, error: null }; });
    m.remove.mockImplementation(async () => { ordre.push("effacement"); return { data: [], error: null }; });
    await POST(requete(), contexte);
    expect(ordre).toEqual(["depot", "enregistrement", "effacement"]);
  });

  it("première validation : rien à effacer", async () => {
    preparer(null);
    const r = await POST(requete(saisie("0")), contexte);
    expect(r.status).toBe(200);
    expect(deposes()).toHaveLength(1);
    expect(supprimes()).toEqual([]);
  });

  it("brouillon sans PDF, ou PDF rangé dans un autre compartiment : jamais d'effacement", async () => {
    preparer(prepValide({ statut: "brouillon", pdf_path: null }));
    await POST(requete(), contexte);
    expect(supprimes()).toEqual([]);
    vi.clearAllMocks();
    m.single.mockResolvedValue({ data: { revision: 2 }, error: null });
    m.upload.mockResolvedValue({ error: null });
    m.remove.mockResolvedValue({ data: [], error: null });
    m.pdf.mockResolvedValue(octets);
    preparer(prepValide({ pdf_bucket: "documents", pdf_path: "org-a/classe/devis-envoye.pdf" }));
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(200);
    expect(supprimes()).toEqual([]);
  });
});

describe("X17 — une validation qui échoue n'abandonne pas son PDF", () => {
  it("conflit pendant la génération (409) : le PDF qu'on vient de déposer est effacé, l'ancien reste", async () => {
    preparer(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "conflit" } });
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(409);
    const [nouveau] = deposes();
    expect(supprimes()).toEqual([nouveau]);
    expect(supprimes()).not.toContain(ANCIEN);
  });

  it("incident inattendu après le dépôt (503) : le PDF déposé est effacé, l'ancien reste", async () => {
    preparer(prepValide());
    m.single.mockRejectedValue(new Error("réseau"));
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(503);
    const [nouveau] = deposes();
    expect(supprimes()).toEqual([nouveau]);
  });

  it("réponse perdue : si la base relue référence le PDF déposé, la mise à jour a abouti — il n'est PAS effacé", async () => {
    preparer(prepValide());
    m.single.mockRejectedValue(new Error("réseau"));
    m.lecture.mockImplementation(async () => ({ data: { pdf_path: deposes()[0] }, error: null }));
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(503);
    expect(supprimes()).toEqual([]);
  });

  it("conflit signalé alors que la base référence déjà le PDF déposé : il n'est PAS effacé", async () => {
    preparer(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "délai dépassé" } });
    m.lecture.mockImplementation(async () => ({ data: { pdf_path: deposes()[0] }, error: null }));
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(409);
    expect(supprimes()).toEqual([]);
  });

  it("relecture impossible (erreur ou panne) : dans le doute, aucun effacement", async () => {
    preparer(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "conflit" } });
    m.lecture.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    expect((await POST(requete(), contexte)).status).toBe(409);
    expect(supprimes()).toEqual([]);
    m.lecture.mockRejectedValue(new Error("panne"));
    expect((await POST(requete(), contexte)).status).toBe(409);
    expect(supprimes()).toEqual([]);
  });

  it("première validation perdue contre un autre onglet (insertion refusée) : le PDF déposé est effacé", async () => {
    preparer(null);
    m.single.mockResolvedValue({ data: null, error: { message: "duplicate key" } });
    m.lecture.mockResolvedValue({ data: { pdf_path: "org-a/devis-gerimmo/autre-onglet.pdf" }, error: null });
    const r = await POST(requete(saisie("0")), contexte);
    expect(r.status).toBe(409);
    expect(supprimes()).toEqual([deposes()[0]]);
  });

  it("dépôt refusé : rien n'a été déposé, rien n'est effacé", async () => {
    preparer(prepValide());
    m.upload.mockResolvedValue({ error: { message: "stockage" } });
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(503);
    expect(supprimes()).toEqual([]);
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe("X17 — un échec d'effacement ne fait jamais échouer la validation", () => {
  it("le stockage refuse l'effacement : la validation réussit, l'objet reste", async () => {
    preparer(prepValide());
    m.remove.mockResolvedValue({ data: null, error: { message: "refus" } });
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Devis-Revision")).toBe("2");
  });

  it("le stockage plante pendant l'effacement : la validation réussit quand même", async () => {
    preparer(prepValide());
    m.remove.mockRejectedValue(new Error("panne"));
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(200);
  });
});

describe("X17 — retour au brouillon : l'ancien PDF n'est plus référencé, il est effacé", () => {
  const formulaire = () => {
    const f = new FormData();
    f.set("revision", "1"); f.set("diagnostic", "Joint usé");
    f.set("lignes_devis", JSON.stringify([]));
    return f;
  };
  function brouillon(preparation: Record<string, unknown>) {
    preparer(preparation);
    m.acces.mockResolvedValue({ ...a, demande: { ...a.demande, statut: "envoyee" } });
  }

  it("enregistrement réussi : le PDF validé, désormais sans référence, est effacé", async () => {
    brouillon(prepValide());
    m.single.mockResolvedValue({ data: { revision: 2 }, error: null });
    const r = await enregistrerBrouillonDevis("demande-a", formulaire());
    expect(r.erreur).toBeUndefined();
    expect(supprimes()).toEqual([ANCIEN]);
  });

  it("enregistrement refusé (brouillon changé ailleurs) : l'ancien PDF reste, il est toujours référencé", async () => {
    brouillon(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "conflit" } });
    const r = await enregistrerBrouillonDevis("demande-a", formulaire());
    expect(r.erreur).toBeTruthy();
    expect(supprimes()).toEqual([]);
  });

  it("un devis déjà envoyé n'est jamais touché", async () => {
    brouillon(prepValide({ statut: "envoye" }));
    const r = await enregistrerBrouillonDevis("demande-a", formulaire());
    expect(r.erreur).toMatch(/déjà été envoyé/);
    expect(supprimes()).toEqual([]);
  });
});
