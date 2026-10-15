/**
 * Décision D18 du 14/10/2026 (devis révisable), relecture du 15/10 : le parcours TypeScript de la VERSION SUIVANTE côté
 * artisan n'était couvert par aucun test. Revenir, dans la route de validation du PDF ou dans l'enregistrement du
 * brouillon, à « la demande doit être envoyée » laissait toute la suite au vert, alors qu'aucun artisan ne pouvait plus
 * valider ni enregistrer sa version 2. Même chose pour le numéro de version affiché, la pastille « devis à chiffrer »,
 * « ce qui change » perdu par la copie locale, ou rendu facultatif dans le formulaire.
 *
 * Ce fichier garde chacun de ces points : la demande en révision ouvre la route et l'enregistrement ; une demande close
 * (déclinée, refusée, expirée) les ferme ; la page annonce la version suivante (version courante + 1) ; la pastille compte
 * les révisions ; la copie locale garde « ce qui change » ; le champ est obligatoire. Banc simulé, aucun accès réel.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  acces: vi.fn(), pdf: vi.fn(), upload: vi.fn(), remove: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn(),
  sollicitations: vi.fn(), formulaire: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: vi.fn(), useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/parcours-devis-serveur", () => ({ chargerPreparationDevis: m.acces }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: vi.fn() }));
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: m.pdf }));
vi.mock("@/lib/notifications", () => ({ notifierDevisRecu: vi.fn() }));
vi.mock("@/lib/proposition-devis-ia", () => ({ proposerDevis: vi.fn() }));
vi.mock("@/app/actions/artisan", () => ({ declinerMaSollicitation: vi.fn() }));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({ user: { id: "u1" } }),
  verifierArtisanAction: vi.fn(),
  chargerFicheArtisan: async () => ({
    user: { id: "u1" },
    fiche: { artisan_id: "a1", raison_sociale: "Plomberie Durand", statut_plateforme: "valide", decennale_valide: true },
    supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
  }),
  chargerSollicitations: m.sollicitations,
  chargerAgenda: async () => ({ lignes: [] }),
  chargerPieces: async () => ({ lignes: [{ jours_avant_echeance: 300, expiree: false }], erreur: false }),
  chargerPhotosDemande: async () => ({ photos: [], erreur: false }),
  chargerVersionsDevis: async () => ({ lignes: [], erreur: false }),
}));
// La page transmet au formulaire la version qu'il prépare : on ne garde du composant client que ces propriétés.
vi.mock("../src/app/artisan/devis/[sollicitationId]/formulaire-avec-reprise", () => ({
  FormulaireAvecReprise: (props: { versionSuivante?: number }) => {
    m.formulaire(props);
    return createElement("div", { "data-test": "formulaire", "data-version-suivante": String(props.versionSuivante ?? "") });
  },
}));
// La pastille de la navigation : seul le nombre de devis à chiffrer nous intéresse.
vi.mock("@/components/nav-artisan", () => ({
  NavArtisan: (p: { devisAChiffrer: number }) => createElement("span", { "data-test": "pastille-devis" }, String(p.devisAChiffrer)),
}));
vi.mock("@/components/menu-compte", () => ({ MenuCompte: () => null }));
vi.mock("@/components/bouton-assistance", () => ({ LienAssistance: () => null }));
vi.mock("@/components/bandeau-session-supervision", () => ({ BandeauSessionSupervision: () => null }));

import { POST } from "../src/app/api/devis/[sollicitationId]/pdf/route";
import { enregistrerBrouillonDevis } from "../src/app/artisan/devis/actions-preparation";
import PageRepondreDevis from "@/app/artisan/devis/[sollicitationId]/page";
import LayoutArtisan from "@/app/artisan/layout";
import { FormulaireDevis } from "@/app/artisan/devis/[sollicitationId]/formulaire-devis";
import { cleDevisLocal, contenuDevisLocal, lireDevisLocal, sauverDevisLocal, type BrouillonDevisLocal } from "@/lib/brouillon-devis-local";

const NOTE = "Main-d’œuvre détaillée par heure, prix du joint ramené au tarif fournisseur.";
const contexte = { params: Promise.resolve({ sollicitationId: "s1" }) };

function requeteServeur() {
  const q = {
    select: () => q,
    update: (d: unknown) => { m.update(d); return q; },
    insert: (d: unknown) => { m.insert(d); return q; },
    eq: () => q, neq: () => q,
    single: () => m.single(),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return q;
}

function banc(statut: string, preparation: Record<string, unknown> | null = { revision: 4, statut: "brouillon", reference_id: "11111111-1111-1111-1111-111111111111", pdf_bucket: "devis-preparations", pdf_path: null }) {
  m.acces.mockResolvedValue({
    supabase: {}, preparation,
    service: { from: () => requeteServeur(), storage: { from: () => ({ upload: m.upload, remove: m.remove, download: vi.fn() }) } },
    profil: { adresse: "Adresse entreprise test", mentions: "Mentions entreprise" },
    fiche: { artisan_id: "a1", raison_sociale: "Plomberie Durand", siret: "12345678900012", telephone: null, email: null },
    demande: { statut, organization_id: "org-a", agence_nom: "Agence TEST", incident_numero: "INC-A", ville: "Paris", code_postal: "75012" },
  });
}

function saisie(revision = "4") {
  const f = new FormData();
  Object.entries({
    revision, validation_artisan: "oui", diagnostic: "Joint usé", delai: "Sous cinq jours", duree: "Une heure", valide_jusqu_au: "2099-01-30",
    note_revision: NOTE,
    lignes_devis: JSON.stringify([{ code: "plomberie_heure", libelle: "Remplacement du joint", quantite: 2, prix_unitaire_ht_cents: 2500, tva_bps: 1000 }]),
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}

const demandeArtisan = (statut: string, extra: Record<string, unknown> = {}) => ({
  sollicitation_id: "s1", organization_id: "o1", agence_nom: "Agence TEST", incident_numero: "INC-1", categorie: "plomberie",
  description: "Fuite sous l’évier", urgence: "normale", metier: "plombier", nature_travaux: "reparation", decennale_requise: false,
  code_postal: "75011", ville: "Paris", envoyee_le: "2026-10-13T08:00:00.000Z", statut, valide_jusqu_au: null, montant_ttc_cents: null,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.single.mockResolvedValue({ data: { revision: 5 }, error: null });
  m.upload.mockResolvedValue({ error: null });
  m.remove.mockResolvedValue({ data: [], error: null });
  m.pdf.mockResolvedValue(Buffer.from("%PDF-v2"));
});

describe("route de validation du PDF : la demande en révision est ouverte, une demande close ne l'est pas", () => {
  it("révision demandée : le PDF de la version suivante est généré et « ce qui change » est enregistré", async () => {
    banc("revision_demandee");
    const r = await POST(new Request("http://localhost/api/devis/s1/pdf", { method: "POST", body: saisie() }), contexte);
    expect(r.status).toBe(200);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update.mock.calls[0][0].saisie.noteRevision).toBe(NOTE);
  });

  it.each(["declinee", "refusee", "expiree", "retenue", "non_retenue"])("demande « %s » : 409, rien n'est déposé ni enregistré", async (statut) => {
    banc(statut);
    const r = await POST(new Request("http://localhost/api/devis/s1/pdf", { method: "POST", body: saisie() }), contexte);
    expect(r.status).toBe(409);
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe("enregistrement du brouillon : la demande en révision est ouverte, une demande close ne l'est pas", () => {
  it("révision demandée : le brouillon de la version suivante s'enregistre, « ce qui change » compris", async () => {
    banc("revision_demandee");
    const r = await enregistrerBrouillonDevis("s1", saisie());
    expect(r).toEqual({ revision: 5 });
    expect(m.update.mock.calls[0][0].saisie.noteRevision).toBe(NOTE);
  });

  it.each(["declinee", "refusee", "expiree"])("demande « %s » : refusé, rien n'est écrit", async (statut) => {
    banc(statut);
    const r = await enregistrerBrouillonDevis("s1", saisie());
    expect(r.erreur).toMatch(/déjà été envoyé/);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});

describe("page de l'artisan : la version préparée est la version courante + 1", () => {
  it.each([[1, 2], [2, 3]])("demande en révision sur la version %i : « Préparer la version %i », et le formulaire prépare cette version", async (courante, suivante) => {
    m.sollicitations.mockResolvedValue({ lignes: [demandeArtisan("revision_demandee", { version: courante, revision_motif: "Revoir le prix", revision_avant: "2026-10-22" })] });
    m.acces.mockResolvedValue({ preparation: null });
    const page = renderToStaticMarkup((await PageRepondreDevis({ params: Promise.resolve({ sollicitationId: "s1" }) } as never)) as never);
    expect(page).toContain(`Préparer la version ${suivante}`);
    expect(page).not.toContain(`Préparer la version ${suivante + 1}`);
    expect(page).toContain(`data-version-suivante="${suivante}"`);
    expect(page).toContain("Révision demandée");
  });

  it("demande envoyée (première version) : pas de numéro de version, le formulaire ne prépare pas de version suivante", async () => {
    m.sollicitations.mockResolvedValue({ lignes: [demandeArtisan("envoyee")] });
    m.acces.mockResolvedValue({ preparation: null });
    const page = renderToStaticMarkup((await PageRepondreDevis({ params: Promise.resolve({ sollicitationId: "s1" }) } as never)) as never);
    expect(page).toContain("Préparer votre devis");
    expect(page).toContain('data-version-suivante=""');
  });
});

describe("pastille « devis à chiffrer » de l'espace artisan", () => {
  it("compte les demandes envoyées ET les révisions demandées, pas les demandes closes", async () => {
    m.sollicitations.mockResolvedValue({
      lignes: [demandeArtisan("envoyee"), demandeArtisan("revision_demandee"), demandeArtisan("refusee"), demandeArtisan("declinee"), demandeArtisan("expiree")],
    });
    const html = renderToStaticMarkup((await LayoutArtisan({ children: null } as never)) as never);
    const pastilles = [...html.matchAll(/data-test="pastille-devis">(\d+)</g)].map((r) => r[1]);
    expect(pastilles.length).toBeGreaterThan(0);
    expect(new Set(pastilles)).toEqual(new Set(["2"]));
  });
});

describe("« ce qui change » dans le formulaire et dans la copie locale", () => {
  const donnees = new Map<string, string>();
  beforeEach(() => {
    donnees.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => donnees.get(k) ?? null, setItem: (k: string, v: string) => donnees.set(k, v), removeItem: (k: string) => donnees.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la copie sur l'appareil garde « ce qui change » et le rend tel quel", () => {
    const f = new FormData();
    f.set("diagnostic", "Joint usé");
    f.set("note_revision", NOTE);
    f.set("lignes_devis_saisie", JSON.stringify([{ code: "", libelle: "Joint", quantite: "1", prix: "", tva: "" }]));
    const contenu = contenuDevisLocal(f);
    expect(contenu.note_revision).toBe(NOTE);
    const cle = cleDevisLocal("compte-a", "s1");
    const copie: BrouillonDevisLocal = { version: 1, copieId: "d1d71ee6-931f-40be-9c34-3106053d4993", enregistreLe: Date.now(), revision: 4, contenu };
    expect(sauverDevisLocal(cle, copie)).toBe(true);
    expect(lireDevisLocal(cle)?.contenu.note_revision).toBe(NOTE);
  });

  it("en révision, le champ « ce qui change » est obligatoire et prérempli depuis la préparation ; absent pour une première version", () => {
    const preparation = {
      sollicitation_id: "s1", artisan_id: "a1", reference_id: "11111111-1111-1111-1111-111111111111", revision: 4,
      saisie: { diagnostic: "Joint usé", delai: "", duree: "", contraintes: "", observations: "", valideJusquAu: "2099-01-30", lignes: [], noteRevision: NOTE },
      proposition: null, entreprise: null, statut: "brouillon" as const, pdf_path: null, pdf_sha: null, pdf_taille: null,
      pdf_bucket: "devis-preparations" as const, devis_id: null, email_statut: "non_envoye" as const,
    };
    const rendu = (versionSuivante?: number) => renderToStaticMarkup(createElement(FormulaireDevis, {
      sollicitationId: "s1", echeanceParDefaut: "2099-01-30", initiale: preparation, cleLocale: "cle", versionSuivante,
    }));
    const champ = rendu(2).match(/<textarea[^>]*name="note_revision"[^>]*>[^<]*/)?.[0] ?? "";
    expect(champ).toMatch(/\brequired\b/);
    expect(champ).toContain(NOTE);
    expect(rendu(2)).toContain("Ce qui change dans la version 2");
    expect(rendu(undefined)).not.toContain('name="note_revision"');
  });
});
