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
 *
 * Relecture du 14/10/2026 : le double de la base ignorait les filtres (`eq`, `neq`) et le nom de la table, si bien que
 * l'inversion de deux filtres, ou leur suppression, dans `abandonnerPdfDepose` passait inaperçue — alors que la relecture
 * qui sert à ne PAS effacer un PDF référencé repose entièrement sur eux. Le double lit maintenant comme la base : il
 * applique les filtres sur des lignes (dont deux lignes « leurres », celles d'une autre demande et d'un autre artisan),
 * refuse une table ou une colonne inconnue, rend une erreur s'il trouve plusieurs lignes (comme `maybeSingle`), et
 * consigne chaque requête pour qu'on puisse relire ses filtres.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ligne = Record<string, unknown>;
type Requete = { table: string; op: "select" | "update" | "insert"; colonnes: string; eq: [string, unknown][]; neq: [string, unknown][] };
const m = vi.hoisted(() => ({
  acces: vi.fn(), pdf: vi.fn(), upload: vi.fn(), remove: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn(), service: vi.fn(), client: vi.fn(),
  /** Les lignes de `artisan_devis_preparations`, telles que la base les a en ce moment. */
  base: [] as Ligne[],
  /** Chaque requête passée au service, dans l'ordre, avec ses filtres. */
  requetes: [] as Requete[],
  /** Une relecture qui échoue : une erreur rendue, ou une exception levée. */
  lectureEnPanne: null as "erreur" | "exception" | null,
}));
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
import { abandonnerPdfDepose, COMPARTIMENT_PREPARATIONS, effacerPdfPreparation, pdfRemplace } from "../src/lib/devis-pdf-stockage";

const contexte = { params: Promise.resolve({ sollicitationId: "demande-a" }) };
const octets = Buffer.from("%PDF-validated");
const ANCIEN = "org-a/devis-gerimmo/ancien-pdf.pdf";
const TABLE = "artisan_devis_preparations";
const COLONNES = ["sollicitation_id", "artisan_id", "revision", "statut", "pdf_bucket", "pdf_path", "reference_id"];

/** La ligne de CET artisan pour CETTE demande, et deux leurres qui ne diffèrent que par un identifiant. */
const lignesParDefaut = (): Ligne[] => [
  { sollicitation_id: "demande-a", artisan_id: "artisan-a", revision: 1, statut: "valide", pdf_bucket: "devis-preparations", pdf_path: ANCIEN },
  { sollicitation_id: "demande-b", artisan_id: "artisan-a", revision: 1, statut: "valide", pdf_bucket: "devis-preparations", pdf_path: "org-a/devis-gerimmo/autre-demande.pdf" },
  { sollicitation_id: "demande-a", artisan_id: "artisan-b", revision: 1, statut: "valide", pdf_bucket: "devis-preparations", pdf_path: "org-a/devis-gerimmo/autre-artisan.pdf" },
];
/** La ligne de l'artisan connecté pour la demande en cours : la seule que la relecture doit trouver. */
const maLigne = () => m.base[0];

/** Une lecture comme la fait PostgREST : filtres appliqués, table et colonnes connues, plusieurs lignes = erreur. */
async function lire(r: Requete): Promise<{ data: Ligne | null; error: { message: string } | null }> {
  if (m.lectureEnPanne === "exception") throw new Error("panne");
  if (m.lectureEnPanne === "erreur") return { data: null, error: { message: "indisponible" } };
  if (r.table !== TABLE) return { data: null, error: { message: `relation « ${r.table} » inconnue` } };
  const colonnes = r.colonnes.split(",").map((c) => c.trim());
  const inconnue = [...colonnes, ...r.eq.map(([c]) => c), ...r.neq.map(([c]) => c)].find((c) => !COLONNES.includes(c));
  if (inconnue) return { data: null, error: { message: `colonne « ${inconnue} » inconnue` } };
  const trouvees = m.base.filter((l) => r.eq.every(([c, v]) => l[c] === v) && r.neq.every(([c, v]) => l[c] !== v));
  if (trouvees.length > 1) return { data: null, error: { message: "plusieurs lignes rendues" } };
  if (!trouvees.length) return { data: null, error: null };
  return { data: Object.fromEntries(colonnes.map((c) => [c, trouvees[0][c]])), error: null };
}

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

function fabriquerRequete(table: string) {
  const r: Requete = { table, op: "select", colonnes: "", eq: [], neq: [] };
  m.requetes.push(r);
  const q = {
    select: (colonnes: string) => { r.colonnes = colonnes; return q; },
    update: (donnees: unknown) => { m.update(donnees); r.op = "update"; return q; },
    insert: (donnees: unknown) => { m.insert(donnees); r.op = "insert"; return q; },
    eq: (colonne: string, valeur: unknown) => { r.eq.push([colonne, valeur]); return q; },
    neq: (colonne: string, valeur: unknown) => { r.neq.push([colonne, valeur]); return q; },
    single: () => m.single(),
    maybeSingle: () => lire(r),
  };
  return q;
}

function acces(preparation: Record<string, unknown> | null) {
  const compartiments: string[] = [];
  const service = {
    from: vi.fn((table: string) => fabriquerRequete(table)),
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
  m.requetes.length = 0;
  a = acces(preparation);
  m.acces.mockResolvedValue(a);
  m.service.mockReturnValue(a.service);
}

beforeEach(() => {
  vi.resetAllMocks();
  m.single.mockResolvedValue({ data: { revision: 2 }, error: null });
  // Relecture de la base après un échec : par défaut elle référence encore l'ANCIEN PDF (la mise à jour n'a pas eu lieu).
  m.base.splice(0, m.base.length, ...lignesParDefaut());
  m.requetes.length = 0;
  m.lectureEnPanne = null;
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

  it("la mise à jour ne vise que la ligne de l'artisan pour cette demande, à la révision lue, et jamais un devis envoyé", async () => {
    preparer(prepValide());
    await POST(requete(), contexte);
    const majs = m.requetes.filter((r) => r.op === "update");
    expect(majs).toHaveLength(1);
    expect(majs[0].table).toBe(TABLE);
    expect([...majs[0].eq].sort()).toEqual([["artisan_id", "artisan-a"], ["revision", 1], ["sollicitation_id", "demande-a"]]);
    expect(majs[0].neq).toEqual([["statut", "envoye"]]);
  });

  it("première validation : une insertion dans la bonne table, sans aucun filtre de mise à jour", async () => {
    preparer(null);
    await POST(requete(saisie("0")), contexte);
    const ecritures = m.requetes.filter((r) => r.op !== "select");
    expect(ecritures.map((r) => [r.table, r.op, r.eq, r.neq])).toEqual([[TABLE, "insert", [], []]]);
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
    // La base a bien enregistré le nouveau PDF ; c'est la réponse qui s'est perdue en route.
    m.single.mockImplementation(async () => { maLigne().pdf_path = deposes()[0]; throw new Error("réseau"); });
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(503);
    expect(supprimes()).toEqual([]);
  });

  it("conflit signalé alors que la base référence déjà le PDF déposé : il n'est PAS effacé", async () => {
    preparer(prepValide());
    m.single.mockImplementation(async () => { maLigne().pdf_path = deposes()[0]; return { data: null, error: { message: "délai dépassé" } }; });
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(409);
    expect(supprimes()).toEqual([]);
  });

  it("relecture impossible (erreur ou panne) : dans le doute, aucun effacement", async () => {
    preparer(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "conflit" } });
    m.lectureEnPanne = "erreur";
    expect((await POST(requete(), contexte)).status).toBe(409);
    expect(supprimes()).toEqual([]);
    m.lectureEnPanne = "exception";
    expect((await POST(requete(), contexte)).status).toBe(409);
    expect(supprimes()).toEqual([]);
  });

  it("première validation perdue contre un autre onglet (insertion refusée) : le PDF déposé est effacé", async () => {
    preparer(null);
    m.single.mockResolvedValue({ data: null, error: { message: "duplicate key" } });
    maLigne().pdf_path = "org-a/devis-gerimmo/autre-onglet.pdf";
    const r = await POST(requete(saisie("0")), contexte);
    expect(r.status).toBe(409);
    expect(supprimes()).toEqual([deposes()[0]]);
  });

  it("la relecture porte sur la ligne de CET artisan pour CETTE demande, dans la bonne table, et sur la seule colonne du chemin", async () => {
    preparer(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "conflit" } });
    await POST(requete(), contexte);
    const lectures = m.requetes.filter((r) => r.op === "select");
    expect(lectures).toHaveLength(1);
    expect(lectures[0].table).toBe(TABLE);
    expect(lectures[0].colonnes).toBe("pdf_path");
    expect([...lectures[0].eq].sort()).toEqual([["artisan_id", "artisan-a"], ["sollicitation_id", "demande-a"]]);
    expect(lectures[0].neq).toEqual([]);
  });

  it("les PDF des autres demandes et des autres artisans ne sont jamais touchés par un abandon", async () => {
    preparer(prepValide());
    m.single.mockResolvedValue({ data: null, error: { message: "conflit" } });
    await POST(requete(), contexte);
    expect(supprimes()).toEqual([deposes()[0]]);
    expect(supprimes().join(" ")).not.toMatch(/autre-demande|autre-artisan|ancien-pdf/);
  });

  it("devis déjà envoyé : la mise à jour est refusée par son filtre sur le statut ; seul le PDF déposé est effacé, jamais celui du devis", async () => {
    preparer(prepValide({ statut: "envoye" }));
    maLigne().statut = "envoye";
    // La base applique « statut <> 'envoye' » : aucune ligne n'est mise à jour, `single()` rend une erreur.
    m.single.mockResolvedValue({ data: null, error: { message: "aucune ligne" } });
    const r = await POST(requete(), contexte);
    expect(r.status).toBe(409);
    expect(m.requetes.find((q) => q.op === "update")?.neq).toEqual([["statut", "envoye"]]);
    expect(supprimes()).toEqual([deposes()[0]]);
    expect(supprimes()).not.toContain(ANCIEN);
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

  it("la mise à jour ne vise que la ligne de l'artisan pour cette demande, à la révision lue, et jamais un devis envoyé", async () => {
    brouillon(prepValide());
    await enregistrerBrouillonDevis("demande-a", formulaire());
    const majs = m.requetes.filter((r) => r.op === "update");
    expect(majs).toHaveLength(1);
    expect(majs[0].table).toBe(TABLE);
    expect([...majs[0].eq].sort()).toEqual([["artisan_id", "artisan-a"], ["revision", 1], ["sollicitation_id", "demande-a"]]);
    expect(majs[0].neq).toEqual([["statut", "envoye"]]);
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

describe("X17 — pdfRemplace : quel PDF la mise à jour remplace-t-elle ?", () => {
  const NOUVEAU = "org-a/devis-gerimmo/nouveau-pdf.pdf";
  const validee = (extra: Record<string, unknown> = {}) => ({ statut: "valide", pdf_bucket: COMPARTIMENT_PREPARATIONS, pdf_path: ANCIEN, ...extra });

  it("devis validé dont le PDF est dans le compartiment de préparation : rend l'ancien chemin", () => {
    expect(pdfRemplace(validee(), NOUVEAU)).toBe(ANCIEN);
  });

  it("retour au brouillon (plus de nouveau chemin) : rend l'ancien chemin", () => {
    expect(pdfRemplace(validee(), null)).toBe(ANCIEN);
  });

  it("première validation (aucune préparation encore) : rien à effacer", () => {
    expect(pdfRemplace(null, NOUVEAU)).toBeNull();
    expect(pdfRemplace(undefined, NOUVEAU)).toBeNull();
  });

  it("devis déjà ENVOYÉ : jamais, même si son PDF est dans le compartiment de préparation", () => {
    expect(pdfRemplace(validee({ statut: "envoye" }), NOUVEAU)).toBeNull();
    expect(pdfRemplace(validee({ statut: "envoye" }), null)).toBeNull();
  });

  it("PDF classé ailleurs que dans le compartiment de préparation (documents, ou compartiment inconnu) : jamais", () => {
    expect(pdfRemplace(validee({ pdf_bucket: "documents" }), NOUVEAU)).toBeNull();
    expect(pdfRemplace(validee({ pdf_bucket: "devis-preparations-autre" }), NOUVEAU)).toBeNull();
    expect(pdfRemplace(validee({ pdf_bucket: null }), NOUVEAU)).toBeNull();
    expect(pdfRemplace(validee({ pdf_bucket: undefined }), NOUVEAU)).toBeNull();
  });

  it("aucun chemin enregistré : rien à effacer", () => {
    expect(pdfRemplace(validee({ pdf_path: null }), NOUVEAU)).toBeNull();
    expect(pdfRemplace(validee({ pdf_path: undefined }), NOUVEAU)).toBeNull();
    expect(pdfRemplace(validee({ pdf_path: "" }), NOUVEAU)).toBeNull();
  });

  it("même chemin que le nouveau : rien (on n'efface jamais le PDF qu'on vient d'enregistrer)", () => {
    expect(pdfRemplace(validee({ pdf_path: NOUVEAU }), NOUVEAU)).toBeNull();
  });

  it("un brouillon qui garde un PDF dans le compartiment de préparation est remplaçable, comme un devis validé", () => {
    expect(pdfRemplace(validee({ statut: "brouillon" }), NOUVEAU)).toBe(ANCIEN);
  });
});

describe("X17 — effacerPdfPreparation et abandonnerPdfDepose, appelés directement", () => {
  const DEPOSE = "org-a/devis-gerimmo/depose-pdf.pdf";
  const service = () => a.service as unknown as SupabaseClient;

  describe("effacerPdfPreparation", () => {
    it("n'efface que le chemin donné, dans le compartiment devis-preparations", async () => {
      preparer(prepValide());
      await effacerPdfPreparation(service(), ANCIEN);
      expect(a.compartiments).toEqual(["devis-preparations"]);
      expect(m.remove.mock.calls).toEqual([[[ANCIEN]]]);
    });

    it("sans chemin : aucun appel au stockage", async () => {
      preparer(prepValide());
      for (const vide of [null, undefined, ""]) await effacerPdfPreparation(service(), vide);
      expect(m.remove).not.toHaveBeenCalled();
      expect(a.compartiments).toEqual([]);
    });

    it("un refus ou une panne du stockage ne lève jamais, et reste consigné", async () => {
      preparer(prepValide());
      const consigne = vi.spyOn(console, "error").mockImplementation(() => {});
      m.remove.mockResolvedValueOnce({ data: null, error: { message: "refus" } });
      await expect(effacerPdfPreparation(service(), ANCIEN)).resolves.toBeUndefined();
      m.remove.mockRejectedValueOnce(new Error("panne"));
      await expect(effacerPdfPreparation(service(), ANCIEN)).resolves.toBeUndefined();
      expect(consigne).toHaveBeenCalledTimes(2);
      consigne.mockRestore();
    });
  });

  describe("abandonnerPdfDepose", () => {
    it("relit la ligne de l'artisan pour la demande, puis efface le PDF déposé, lui seul, quand la base ne le référence pas", async () => {
      preparer(prepValide());
      await abandonnerPdfDepose(service(), "demande-a", "artisan-a", DEPOSE);
      expect(m.requetes).toHaveLength(1);
      expect(m.requetes[0]).toMatchObject({ table: TABLE, op: "select", colonnes: "pdf_path", neq: [] });
      expect([...m.requetes[0].eq].sort()).toEqual([["artisan_id", "artisan-a"], ["sollicitation_id", "demande-a"]]);
      expect(m.remove.mock.calls).toEqual([[[DEPOSE]]]);
      expect(a.compartiments).toEqual(["devis-preparations"]);
    });

    it("la base référence le PDF déposé : rien n'est effacé", async () => {
      preparer(prepValide());
      maLigne().pdf_path = DEPOSE;
      await abandonnerPdfDepose(service(), "demande-a", "artisan-a", DEPOSE);
      expect(m.remove).not.toHaveBeenCalled();
    });

    it("c'est la ligne de la bonne demande et du bon artisan qui compte, pas celle d'une autre", async () => {
      preparer(prepValide());
      // Seules les lignes leurres référencent le PDF déposé : pour (demande-a, artisan-a), il n'est référencé par personne.
      m.base[1].pdf_path = DEPOSE;
      m.base[2].pdf_path = DEPOSE;
      await abandonnerPdfDepose(service(), "demande-a", "artisan-a", DEPOSE);
      expect(m.remove.mock.calls).toEqual([[[DEPOSE]]]);
      // À l'inverse, vu depuis l'autre demande, c'est bien lui qui le référence : on n'efface pas.
      m.remove.mockClear();
      await abandonnerPdfDepose(service(), "demande-b", "artisan-a", DEPOSE);
      expect(m.remove).not.toHaveBeenCalled();
    });

    it("aucune ligne pour cette demande : le PDF déposé n'est référencé par personne, il est effacé", async () => {
      preparer(prepValide());
      m.base.splice(0, m.base.length);
      await abandonnerPdfDepose(service(), "demande-a", "artisan-a", DEPOSE);
      expect(m.remove.mock.calls).toEqual([[[DEPOSE]]]);
    });

    it("relecture en erreur ou en exception : dans le doute, rien n'est effacé et rien ne lève", async () => {
      preparer(prepValide());
      for (const panne of ["erreur", "exception"] as const) {
        m.lectureEnPanne = panne;
        await expect(abandonnerPdfDepose(service(), "demande-a", "artisan-a", DEPOSE)).resolves.toBeUndefined();
      }
      expect(m.remove).not.toHaveBeenCalled();
    });

    it("sans chemin déposé : aucune relecture, aucun effacement", async () => {
      preparer(prepValide());
      await abandonnerPdfDepose(service(), "demande-a", "artisan-a", null);
      expect(m.requetes).toEqual([]);
      expect(m.remove).not.toHaveBeenCalled();
    });
  });
});
