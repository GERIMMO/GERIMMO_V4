/**
 * Décision D18 du 14/10/2026, livraison 2 (révision et versions). La base est essayée dans
 * devis-revision-versions.test.ts ; ici, la partie application : libellés des nouveaux états, événements et alerte
 * (jamais de clair technique), action du gérant (texte transmis, clé d'envoi, e-mail seulement si la décision est
 * nouvelle), e-mails (révision demandée, nouvelle version), volet du gérant (étiquette de version, bouton « Demander une
 * révision », « Dernière version possible » à la troisième, historique repliable), carte et historique de l'artisan.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), notifier: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push() {}, refresh() {} }), notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant" }, role: "proprietaire_direct", supabase: { rpc: banc.rpc } }),
  verifierLocataire: async () => ({ user: null, supabase: {} }),
}));
vi.mock("@/lib/notifications", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...reel, notifierRevisionDemandee: banc.notifier };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { demanderRevisionDevis } from "@/app/actions/incidents";
import { ConsultationOuverte } from "@/app/agence/[orgId]/incidents/volet-artisan";
import { DELAI_REVISION_DEVIS_JOURS, STATUTS_DEVIS, STATUTS_SOLLICITATION as STATUTS_GERANT, VERSIONS_DEVIS_MAX } from "@/app/agence/[orgId]/artisans/referentiel";
import { CarteSollicitation } from "@/app/artisan/carte-sollicitation";
import { VersionsPrecedentes } from "@/app/artisan/devis/[sollicitationId]/versions-precedentes";
import { demandeAChiffrer, STATUTS_SOLLICITATION as STATUTS_ARTISAN } from "@/app/artisan/libelles";
import { cheminFicheAlerte, gesteAlerte } from "@/lib/chemin-alerte";
import { TYPES_EVENEMENT_INCIDENT } from "@/lib/incidents";
import { messageDevisRecu, messageRevisionDemandee } from "@/lib/notifications";
import { brouillonDepuisFormulaire } from "@/lib/parcours-devis-artisan";

const CLE = "aaaaaaaa-1111-4111-8111-111111111111";
const MOTIF = "Merci de détailler la main-d'œuvre et de revoir le prix du joint.";
const NOTE = "Main-d'œuvre détaillée par heure, prix du joint ramené au tarif fournisseur.";

function formulaire(champs: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(champs)) form.set(k, v);
  return form;
}

describe("libellés et constantes ratifiées", () => {
  it("nomme les trois événements, l'état « révisé » du devis et « révision demandée » de la demande, des deux côtés", () => {
    expect(TYPES_EVENEMENT_INCIDENT.devis_revision_demandee).toBe("Révision de devis demandée");
    expect(TYPES_EVENEMENT_INCIDENT.devis_revise).toBe("Nouvelle version du devis");
    expect(TYPES_EVENEMENT_INCIDENT.devis_revision_expiree).toMatch(/sans réponse/);
    expect(STATUTS_DEVIS.revise).toBe("Révision demandée");
    expect(STATUTS_GERANT.revision_demandee).toBe("Révision demandée");
    expect(STATUTS_ARTISAN.revision_demandee).toBe("Révision demandée");
  });
  it("trois versions au plus (A.15-2) et sept jours de réponse (A.15-3)", () => {
    expect(VERSIONS_DEVIS_MAX).toBe(3);
    expect(DELAI_REVISION_DEVIS_JOURS).toBe(7);
  });
  it("une demande en révision est de nouveau à chiffrer pour l'artisan", () => {
    expect(demandeAChiffrer("envoyee")).toBe(true);
    expect(demandeAChiffrer("revision_demandee")).toBe(true);
    for (const s of ["devis_depose", "retenue", "non_retenue", "refusee", "declinee", "expiree", "annulee", null]) expect(demandeAChiffrer(s)).toBe(false);
  });
  it("l'alerte « révision sans réponse » mène au dossier et se ferme à la main", () => {
    const a = { type: "devis_revision_expiree", details: { incident_id: "inc-7", sollicitation_id: "s-1" } };
    expect(cheminFicheAlerte(a, "org")).toBe("/agence/org/incidents?sel=inc-7");
    expect(gesteAlerte(a, "org")).toEqual({ href: "/agence/org/incidents?sel=inc-7", libelle: "Reprendre le dossier après la révision sans réponse", seFermeSeule: false });
  });
  it("« ce qui change » entre dans le brouillon de l'artisan, borné à 4 000 caractères", () => {
    const b = brouillonDepuisFormulaire(formulaire({ diagnostic: "D", delai: "2 j", duree: "1 h", valide_jusqu_au: "2026-12-31", lignes_devis: "[]", note_revision: ` ${NOTE} ` }));
    expect(b.noteRevision).toBe(NOTE);
    expect(brouillonDepuisFormulaire(formulaire({ lignes_devis: "[]", note_revision: "x".repeat(5000) })).noteRevision).toHaveLength(4000);
  });
});

describe("l'action « demander une révision »", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    banc.rpc.mockResolvedValue({ data: true, error: null });
    banc.notifier.mockResolvedValue({ envoyee: true });
  });
  it("refuse un texte de moins de dix caractères et un envoi sans clé avant tout appel en base", async () => {
    expect((await demanderRevisionDevis("org", "devis", {}, formulaire({ motif: "Trop cher", cle_envoi: CLE }))).erreur).toMatch(/dix caractères au moins/);
    expect((await demanderRevisionDevis("org", "devis", {}, formulaire({ motif: MOTIF }))).erreur).toMatch(/Rechargez la page/);
    expect(banc.rpc).not.toHaveBeenCalled();
  });
  it("appelle demander_revision_devis, puis prévient l'artisan une fois ; un rejeu n'envoie rien", async () => {
    const r = await demanderRevisionDevis("org", "devis", {}, formulaire({ motif: MOTIF, cle_envoi: CLE }));
    expect(banc.rpc).toHaveBeenCalledWith("demander_revision_devis", { p_org: "org", p_devis: "devis", p_motif: MOTIF, p_cle: CLE });
    expect(banc.notifier).toHaveBeenCalledTimes(1);
    expect(r.succes).toMatch(/Révision demandée — l'artisan est prévenu/);
    banc.rpc.mockResolvedValue({ data: false, error: null });
    const rejeu = await demanderRevisionDevis("org", "devis", {}, formulaire({ motif: MOTIF, cle_envoi: CLE }));
    expect(rejeu.succes).toMatch(/déjà demandée/);
    expect(banc.notifier).toHaveBeenCalledTimes(1);
  });
  it("rend le message de la base tel quel (dernière version possible)", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "Dernière version possible : ce devis ne peut plus être révisé (trois versions au plus). Retenez-le ou refusez-le." } });
    const r = await demanderRevisionDevis("org", "devis", {}, formulaire({ motif: MOTIF, cle_envoi: CLE }));
    expect(r.erreur).toMatch(/^Dernière version possible/);
    expect(banc.notifier).not.toHaveBeenCalled();
  });
});

describe("les e-mails", () => {
  it("« révision demandée » porte le texte du client, la version, l'échéance et le geste attendu", () => {
    const m = messageRevisionDemandee({ emetteur: "Agence Test", categorie: "plomberie_canalisation", numero: "INC-0007", version: 1, montantCents: 48000, motif: MOTIF, revisionAvant: "2026-10-22", lien: "https://x/artisan/devis/s1" });
    expect(m.sujet).toBe("Une révision de votre devis est demandée — Agence Test — dossier INC-0007");
    expect(m.html).toContain("version 1");
    expect(m.html).toContain("480,00");
    expect(m.html).toContain("Ce qui est demandé : Merci de détailler");
    expect(m.html).toContain("avant le 22/10/2026");
    expect(m.html).toContain("Préparer la nouvelle version");
    expect(m.html).not.toContain("plomberie_canalisation");
  });
  it("« devis reçu » devient « nouvelle version » à partir de la version 2, avec ce qui change", () => {
    const v1 = messageDevisRecu({ emetteur: "Agence Test", artisan: "Plomberie Durand", montantCents: 45000, numero: "INC-0007", categorie: "plomberie_canalisation", lien: null });
    expect(v1.sujet).toMatch(/^Devis reçu/);
    const v2 = messageDevisRecu({ emetteur: "Agence Test", artisan: "Plomberie Durand", montantCents: 45000, numero: "INC-0007", categorie: "plomberie_canalisation", lien: null, version: 2, noteRevision: NOTE });
    expect(v2.sujet).toBe("Nouvelle version du devis (v2) — Plomberie Durand — 450,00 € — INC-0007");
    expect(v2.html).toContain("version 2");
    // Le gabarit échappe l'apostrophe de « Main-d'œuvre » : on vérifie le début et la fin du texte transmis.
    expect(v2.html).toContain("Ce qui change : Main-d");
    expect(v2.html).toContain("prix du joint ramené au tarif fournisseur.");
    expect(v2.html).toContain("Voir la nouvelle version");
  });
});

describe("le volet artisan du gérant", () => {
  const consultation = {
    id: "c1", metier: "plomberie", nature_travaux: "entretien_courant", decennale_requise: false,
    devis_unique_assume: false, validite_jours: 30, statut: "ouverte", created_at: "2026-09-20T08:00:00.000Z",
  };
  const sollicitation = (id: string, artisan: string, statut: string, extra: Record<string, unknown> = {}) =>
    ({ id, consultation_id: "c1", artisan_id: artisan, statut, envoyee_le: "2026-09-21T08:00:00.000Z", repondue_le: null, refus_motif: null, ...extra });
  const devis = (id: string, s: string, artisan: string, statut: string, extra: Record<string, unknown> = {}) => ({
    id, sollicitation_id: s, artisan_id: artisan, montant_ttc_cents: 34000, description: "Remplacement du flexible",
    lignes: [], valide_jusqu_au: "2026-12-31", document_id: null, statut, depose_le: "2026-09-22T08:00:00.000Z", ...extra,
  });
  const NOMS: Record<string, string> = { a1: "Plomberie Martin", a2: "Dubois Sanitaire" };
  const rendre = (props: { sollicitations: ReturnType<typeof sollicitation>[]; devis: ReturnType<typeof devis>[] }) =>
    renderToStaticMarkup(createElement(ConsultationOuverte, {
      orgId: "o1", consultation, sollicitations: props.sollicitations, devis: props.devis,
      affectables: [] as never, noteDe: new Map(), nom: (id: string) => NOMS[id] ?? "Artisan",
      aujourdhui: "2026-10-15", commune: "Paris",
    }));

  it("propose « Demander une révision » à côté de « Retenir » et « Refuser », avec l'échéance à sept jours de Paris", () => {
    const html = rendre({ sollicitations: [sollicitation("s1", "a1", "devis_depose")], devis: [devis("d1", "s1", "a1", "depose", { version: 1 })] });
    expect(html).toContain("Retenir ce devis");
    // Le bouton (son libellé précède le nom accessible), distinct de la phrase d'aide qui emploie les mêmes mots.
    expect(html).toContain("Demander une révision<span");
    expect(html).toContain("Refuser<span");
    expect(html).not.toContain("Dernière version possible");
  });

  it("une version 2 reçue porte son étiquette, « ce qui change », et l'historique repliable de la v1 avec la demande du gérant", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "devis_depose")],
      devis: [
        devis("d1", "s1", "a1", "revise", { version: 1, decision: "revision", decision_motif: MOTIF, decide_le: "2026-10-10T09:00:00.000Z" }),
        devis("d2", "s1", "a1", "depose", { version: 2, devis_precedent_id: "d1", note_revision: NOTE, montant_ttc_cents: 31000 }),
      ],
    });
    expect(html).toContain(">v2<");
    // React échappe l'apostrophe (&#x27;) : on vérifie le texte tel qu'il est servi.
    expect(html).toContain("Ce qui change : « Main-d&#x27;œuvre détaillée par heure, prix du joint ramené au tarif fournisseur. »");
    expect(html).toContain("Versions précédentes (1)");
    expect(html).toContain(">v1<");
    expect(html).toContain("Ce que vous avez demandé : « Merci de détailler la main-d&#x27;œuvre et de revoir le prix du joint. »");
    expect(html).toContain("Révision demandée le");
    expect(html).toContain("10/10/2026");
    // Une version révisée ne se retient pas : un seul bouton « Retenir », celui de la v2.
    expect(html.match(/Retenir ce devis/g)).toHaveLength(1);
    // L'état est nommé, jamais en clair technique.
    expect(html).not.toContain(">revise<");
  });

  it("à la troisième version, plus de révision : « Dernière version possible », retenir ou refuser", () => {
    const html = rendre({ sollicitations: [sollicitation("s1", "a1", "devis_depose")], devis: [devis("d3", "s1", "a1", "depose", { version: 3, devis_precedent_id: "d2", note_revision: "Remise de 5 %." })] });
    expect(html).toContain("Dernière version possible");
    expect(html).not.toContain("Demander une révision<span");
    expect(html).toContain("Retenir ce devis");
    expect(html).toContain("Refuser<span");
  });

  it("une demande en révision tient sa place dans le plafond et affiche l'échéance de réponse", () => {
    const html = rendre({
      sollicitations: [sollicitation("s1", "a1", "revision_demandee", { revision_avant: "2026-10-22" }), sollicitation("s2", "a2", "envoyee")],
      devis: [devis("d1", "s1", "a1", "revise", { version: 1, decision: "revision", decision_motif: MOTIF, decide_le: "2026-10-15T09:00:00.000Z" })],
    });
    expect(html).toContain("Révision demandée");
    expect(html).toContain("réponse attendue avant le 22/10/2026");
    expect(html).toContain("Deux artisans sont déjà en lice");
    expect(html).not.toContain(">revision_demandee<");
  });
});

describe("les écrans de l'artisan", () => {
  const ligne = {
    sollicitation_id: "s1", organization_id: "o1", agence_nom: "Agence Test", incident_numero: "INC-0007", categorie: "plomberie_canalisation",
    description: "Fuite sous l'évier", urgence: "normale" as const, metier: "plomberie", nature_travaux: "entretien_courant", decennale_requise: false,
    code_postal: "75011", ville: "Paris", envoyee_le: "2026-10-13T08:00:00.000Z", statut: "revision_demandee" as const, valide_jusqu_au: "2026-12-31",
    montant_ttc_cents: 48000, decision_motif: MOTIF, version: 1, revision_motif: MOTIF, revision_avant: "2026-10-22",
  };
  it("la carte d'une demande en révision annonce la nouvelle version attendue et son échéance", () => {
    const html = renderToStaticMarkup(createElement(CarteSollicitation, { ligne }));
    expect(html).toContain("Révision demandée");
    // dateSimple écrit la date en toutes lettres, à Paris (« 22 octobre 2026 »).
    expect(html).toContain("Nouvelle version attendue avant le 22 octobre 2026");
    expect(html).toContain("Préparer la nouvelle version");
    expect(html).not.toContain("revision_demandee");
  });
  it("l'historique montre la v1 révisée avec ce que le client demandait, puis la v2 et ce qui changeait", () => {
    const html = renderToStaticMarkup(createElement(VersionsPrecedentes, { sollicitationId: "s-1",
      versions: [
        { devis_id: "d1", version: 1, statut: "revise", montant_ttc_cents: 48000, valide_jusqu_au: "2026-12-31", depose_le: "2026-10-01T08:00:00.000Z", note_revision: null, decision: "revision", decision_motif: MOTIF, decide_le: "2026-10-10T09:00:00.000Z", description: "x", lignes: [] },
        { devis_id: "d2", version: 2, statut: "depose", montant_ttc_cents: 45000, valide_jusqu_au: "2026-12-31", depose_le: "2026-10-12T08:00:00.000Z", note_revision: NOTE, decision: null, decision_motif: null, decide_le: null, description: "y", lignes: [] },
      ],
      erreur: false,
      versionCourante: null,
    }));
    expect(html).toContain("Vos versions (2)");
    expect(html).toContain("/api/devis/s-1/pdf?version=1");
    expect(html).toContain("/api/devis/s-1/pdf?version=2");
    expect(html).toContain("Version 1");
    expect(html).toContain("Révision demandée par le client");
    expect(html).toContain("Ce que le client demandait : « Merci de détailler la main-d&#x27;œuvre et de revoir le prix du joint. »");
    expect(html).toContain("Version 2");
    expect(html).toContain("Ce qui changeait : « Main-d&#x27;œuvre détaillée par heure, prix du joint ramené au tarif fournisseur. »");
    expect(html).toContain("Envoyée, en attente de décision");
  });
  it("une seule version sans révision : rien de plus que la carte « Ma réponse »", () => {
    const html = renderToStaticMarkup(createElement(VersionsPrecedentes, { sollicitationId: "s-1",
      versions: [{ devis_id: "d1", version: 1, statut: "depose", montant_ttc_cents: 48000, valide_jusqu_au: "2026-12-31", depose_le: "2026-10-01T08:00:00.000Z", note_revision: null, decision: null, decision_motif: null, decide_le: null, description: "x", lignes: [] }],
      erreur: false,
      versionCourante: null,
    }));
    expect(html).toBe("");
  });
});
