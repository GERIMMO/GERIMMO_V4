/**
 * Lot « avoir-facture-externe » — décision D24-C (fiches ARC-07, ARC-04) : les écrans et l'action serveur.
 *
 * Sur la fiche du chantier, la facture en vigueur porte une action « Annuler cette facture » (motif obligatoire,
 * confirmation en deux temps) ; une facture annulée reste affichée avec son avoir, et le dépôt d'une nouvelle facture
 * redevient possible. Le registre (facturation) et la fiche de suivi montrent la facture annulée ET son avoir.
 * Les pages sont des composants serveur : on les appelle comme Next le fait, puis on rend l'arbre obtenu.
 */
process.env.TZ = "UTC";

import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ activite: null as unknown, rpc: vi.fn(), exclusion: null as string | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: [] }),
  verifierArtisanMutation: async () => ({
    supabase: { rpc: sim.rpc, storage: { from: () => ({ upload: vi.fn(), download: async () => ({}), remove: async () => ({}) }) } },
    fiche: { artisan_id: "a1" },
  }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return {
    ...reel,
    environnementArtisanLocal: () => true,
    activationModuleArtisan: () => true,
    chargerActivitePrivee: async () => ({ data: sim.activite }),
  };
});

import PageChantier from "@/app/artisan/chantiers/[chantierId]/page";
import PageFacture from "@/app/artisan/facturation/[factureId]/page";
import { ReglementsDansFacturation } from "@/app/artisan/clients/resumes";
import { RelectureAnnulation } from "@/app/artisan/clients/relecture-annulation";
import { libelleActionPrive } from "@/app/artisan/clients/elements";
import { enregistrerActivitePrivee } from "@/app/artisan/clients/actions";
import { bilanReglements, type FactureArtisanPrivee, type ReglementArtisan } from "@/lib/artisan-prive";
import { messageErreurPrive } from "@/lib/artisan-prive-erreurs";
import { MESSAGE_FACTURE_DEFINITIVE } from "@/lib/artisan-prive-facture";
import { MESSAGE_ECRITURE_FERMEE } from "@/lib/artisan-prive-exclusion";
import {
  LIBELLE_CONFIRMER_ANNULATION,
  MESSAGE_ANNULATION_CONSEQUENCES,
  MESSAGE_AVOIR_SANS_PIECE,
  MESSAGE_MOTIF_ANNULATION,
  MESSAGE_REGLEMENTS_A_ANNULER,
  avoirDeLaFacture,
  resumerAnnulation,
  type AvoirArtisan,
} from "@/lib/artisan-prive-avoir";

const entreprise = { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" };
const FACTURE_ANNULEE = { id: "f1", origine: "externe", chantier_id: "h1", numero: "ART-1", montant_ttc_cents: 12000, piece_id: "p1", client: "Mme Test", created_at: "2026-10-13T10:00:00.000Z", annulee_le: "2026-10-14T08:00:00.000Z" };
const FACTURE_REMPLACANTE = { id: "f2", origine: "externe", chantier_id: "h1", numero: "ART-2", montant_ttc_cents: 12500, piece_id: "p2", client: "Mme Test", created_at: "2026-10-14T09:00:00.000Z", annulee_le: null };
const AVOIR: AvoirArtisan = {
  id: "v1", facture_id: "f1", facture_numero: "ART-1", chantier_id: "h1", rang: 1, numero: "AV-0001", montant_ttc_cents: 12000,
  motif: "Erreur de numéro sur la pièce jointe", jour: "2026-10-14", auteur: "a1", created_at: "2026-10-14T08:00:00.000Z",
};
const reglement = (surcharge: Partial<ReglementArtisan> = {}): ReglementArtisan => ({
  id: "g1", facture_externe_id: "f2", facture_gerimmo_id: null, montant_cents: 2000, date_reglement: "2026-10-14", moyen: "virement", reference: "Virement TEST",
  preuve_id: "p3", auteur: "a1", created_at: "2026-10-14T10:00:00.000Z", annule_le: null, annulation_motif: null, annulation_preuve_id: null, ...surcharge,
});

function activite({ factures = [] as unknown[], avoirs = [] as AvoirArtisan[] | undefined, reglements = [] as ReglementArtisan[], exclusion = null as string | null, evenements = [] as unknown[] } = {}) {
  return {
    clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le: null }],
    chantiers: [{ id: "h1", client_id: "c1", titre: "Chantier TEST", adresse: "1 rue des Tests", description: "Fuite sous l’évier", statut: "termine", revision: 7, bilan: "Fuite réparée", photo_id: "p9" }],
    devis: [{
      id: "d1", chantier_id: "h1", version: 1, statut: "accepte", description: "Réparation", lignes: [], montant_ht_cents: 10000,
      montant_tva_cents: 2000, montant_ttc_cents: 12000, entreprise, client: { nom: "Mme Test" }, valide_jusqu_au: "2026-11-12",
      pdf_id: null, preuve_acceptation_id: null, created_at: "2026-10-13T08:00:00.000Z",
    }],
    rendez_vous: [], factures, pieces: [], reglements, evenements,
    ...(avoirs === undefined ? {} : { avoirs }),
    activation: { clients: true, reglements: true, exclusion },
  };
}
const html = async (element: unknown) => renderToStaticMarkup((await element) as never);
const chantier = () => html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
const facture = (factureId: string) => html(PageFacture({ params: Promise.resolve({ factureId }) }));
/** Le formulaire (de `<form` à `</form>`) qui contient ce texte. */
const formulaireAvec = (page: string, texte: string) => page.split("<form").slice(1).map((f) => `<form${f.split("</form>")[0]}</form>`).find((f) => f.includes(texte));

beforeEach(() => { sim.activite = activite(); });

describe("resumerAnnulation — ce que l'artisan relit avant d'annuler", () => {
  it("un motif de 10 caractères au moins est prêt ; espaces de bord retirés", () => {
    expect(resumerAnnulation({ numero: "ART-1", montantCents: 12000, motif: "  Erreur de numéro  " })).toEqual({ numero: "ART-1", montantCents: 12000, motif: "Erreur de numéro", alertes: [], pret: true });
  });

  it.each(["", "   ", "court", "123456789"])("le motif « %s » bloque la confirmation, avec le message de la base", (motif) => {
    const r = resumerAnnulation({ numero: "ART-1", montantCents: 12000, motif });
    expect(r.pret).toBe(false);
    expect(r.alertes).toEqual([MESSAGE_MOTIF_ANNULATION]);
  });

  it("les lettres accentuées comptent pour un caractère, comme en base ; plus de 4000 caractères est refusé", () => {
    expect(resumerAnnulation({ numero: "A", montantCents: 1, motif: "éééééééééé" }).pret).toBe(true);
    expect(resumerAnnulation({ numero: "A", montantCents: 1, motif: "x".repeat(4001) }).pret).toBe(false);
  });
});

describe("RelectureAnnulation — l'écran de confirmation", () => {
  const rendu = (motif = "Erreur de numéro sur la pièce jointe") => renderToStaticMarkup(createElement(RelectureAnnulation, { resume: resumerAnnulation({ numero: "ART-1", montantCents: 12000, motif }) }));

  it("dit ce qui sera enregistré : facture annulée, montant de l'avoir, motif, et les conséquences", () => {
    const page = rendu();
    expect(page).toContain("Relisez l’annulation avant de la confirmer");
    expect(page).toContain(MESSAGE_ANNULATION_CONSEQUENCES);
    expect(page).toMatch(/Facture annulée<\/dt><dd[^>]*>ART-1/);
    expect(page).toMatch(/Montant de l’avoir \(TTC\)<\/dt><dd[^>]*>120,00\s€/);
    expect(page).toContain("Erreur de numéro sur la pièce jointe");
    expect(page).not.toContain('role="alert"');
  });

  it("un motif trop court est annoncé en alerte", () => {
    const page = rendu("court");
    expect(page).toContain('role="alert"');
    expect(page).toContain(MESSAGE_MOTIF_ANNULATION);
  });

  it("le texte est en français soigné : jamais de code interne", () => {
    expect(rendu()).not.toMatch(/undefined|null|NaN|cents|\[object|annuler_facture/i);
  });
});

describe("fiche du chantier — annuler la facture en vigueur, puis déposer celle qui la remplace", () => {
  it("facture en vigueur : l'action « Annuler cette facture » (motif, relecture en deux temps) ; plus de formulaire de dépôt", async () => {
    sim.activite = activite({ factures: [{ ...FACTURE_ANNULEE, annulee_le: null }], avoirs: [] });
    const page = await chantier();
    expect(page).toContain("Annuler cette facture");
    const form = formulaireAvec(page, 'name="facture_id"')!;
    expect(form).toBeDefined();
    expect(form).toContain('value="annuler_facture"');
    expect(form).toContain('name="facture_id" value="f1"');
    expect(form).toContain('name="motif"');
    expect(form).toContain("Relire avant d’annuler");
    expect(form).not.toMatch(/<fieldset[^>]*disabled/);
    expect(page).not.toContain("Relire avant de déposer");
  });

  it("le texte d'avant le dépôt ne dit plus « ne s'annule pas » : il annonce l'avoir", async () => {
    const page = await chantier();
    expect(page).toContain("Déposer la facture");
    expect(page).not.toMatch(/ne se corrige ni ne s’annule/);
    expect(page).toContain("annuler par un avoir");
    expect(MESSAGE_FACTURE_DEFINITIVE).toContain("annuler par un avoir");
    expect(MESSAGE_FACTURE_DEFINITIVE).not.toMatch(/ni l’annuler/);
  });

  it("facture annulée : elle reste affichée avec son avoir, et le dépôt d'une nouvelle facture est rouvert", async () => {
    sim.activite = activite({ factures: [FACTURE_ANNULEE], avoirs: [AVOIR] });
    const page = await chantier();
    expect(page).toContain("Facture ART-1 — annulée");
    expect(page).toContain("Avoir AV-0001");
    expect(page).toMatch(/14\/10\/2026/);
    expect(page).toContain("Erreur de numéro sur la pièce jointe");
    expect(page).toMatch(/120,00\s€/);
    // Le dépôt est rouvert, et l'écran rappelle que le numéro annulé reste réservé.
    expect(page).toContain("Relire avant de déposer");
    expect(page).toContain("La facture ART-1 a été annulée par l’avoir AV-0001");
    expect(page).toMatch(/un autre numéro/);
    // Rien à annuler : la seule facture est déjà annulée.
    expect(page).not.toContain("Relire avant d’annuler");
  });

  it("facture annulée puis remplacée : les deux figurent ; seule la facture en vigueur peut être annulée", async () => {
    sim.activite = activite({ factures: [FACTURE_ANNULEE, FACTURE_REMPLACANTE], avoirs: [AVOIR] });
    const page = await chantier();
    expect(page).toContain("Facture ART-1 — annulée");
    expect(page).toContain("Facture ART-2");
    expect(page.match(/name="facture_id"/g)).toHaveLength(1);
    expect(page).toContain('name="facture_id" value="f2"');
    expect(page).not.toContain("Relire avant de déposer");
  });

  it("un règlement déclaré actif sur la facture : l'écran le dit et l'annulation est fermée ; annulé, il ne bloque plus", async () => {
    sim.activite = activite({ factures: [FACTURE_REMPLACANTE], avoirs: [], reglements: [reglement()] });
    let form = formulaireAvec(await chantier(), 'name="facture_id"')!;
    expect(form).toMatch(/<fieldset[^>]*disabled/);
    expect(await chantier()).toContain(MESSAGE_REGLEMENTS_A_ANNULER);
    sim.activite = activite({ factures: [FACTURE_REMPLACANTE], avoirs: [], reglements: [reglement({ annule_le: "2026-10-14T11:00:00.000Z", annulation_motif: "Erreur", annulation_preuve_id: "p4" })] });
    form = formulaireAvec(await chantier(), 'name="facture_id"')!;
    expect(form).not.toMatch(/<fieldset[^>]*disabled/);
  });

  it("artisan refusé (D25-B) : le formulaire d'annulation est fermé, la facture et son avoir restent lisibles", async () => {
    sim.activite = activite({ factures: [FACTURE_ANNULEE, FACTURE_REMPLACANTE], avoirs: [AVOIR], exclusion: "refuse" });
    const page = await chantier();
    expect(page).toContain(MESSAGE_ECRITURE_FERMEE.refuse);
    expect(formulaireAvec(page, 'name="facture_id"')).toMatch(/<fieldset[^>]*disabled/);
    expect(page).toContain("Avoir AV-0001");
  });

  it("une base pas encore migrée (sans clé « avoirs ») s'affiche comme avant, sans erreur", async () => {
    sim.activite = activite({ factures: [{ ...FACTURE_ANNULEE, annulee_le: undefined }], avoirs: undefined });
    const page = await chantier();
    expect(page).toContain("Facture ART-1");
    expect(page).not.toContain("— annulée");
    expect(page).not.toContain("Avoir AV-");
  });

  it("l'historique nomme l'annulation en français", async () => {
    expect(libelleActionPrive("annuler_facture")).toBe("Facture annulée par un avoir");
    sim.activite = activite({ factures: [FACTURE_ANNULEE], avoirs: [AVOIR], evenements: [{ id: "e1", objet_id: "h1", action: "annuler_facture", created_at: "2026-10-14T08:00:00.000Z", auteur: "a1", details: {} }] });
    expect(await chantier()).toContain("Facture annulée par un avoir");
  });
});

describe("registre et suivi de la facture : la facture annulée et son avoir figurent tous deux", () => {
  it("bilanReglements : une facture annulée a un reste dû nul et le dit ; une facture en vigueur, comme avant", () => {
    const annulee = bilanReglements(FACTURE_ANNULEE as FactureArtisanPrivee, [], [AVOIR]);
    expect(annulee).toMatchObject({ declare: 0, solde: 0, etat: "Annulée par l’avoir AV-0001", avoir: AVOIR });
    const enVigueur = bilanReglements(FACTURE_REMPLACANTE as FactureArtisanPrivee, [reglement()], [AVOIR]);
    expect(enVigueur).toMatchObject({ declare: 2000, solde: 10500, etat: "Règlement partiel déclaré", avoir: null });
    expect(avoirDeLaFacture("f1", undefined)).toBeNull();
  });

  it("le registre de facturation liste la facture annulée, son avoir, et la facture qui la remplace", async () => {
    sim.activite = activite({ factures: [FACTURE_ANNULEE, FACTURE_REMPLACANTE], avoirs: [AVOIR] });
    const page = await html(ReglementsDansFacturation());
    expect(page).toContain("ART-1 · Mme Test");
    expect(page).toContain("Annulée par l’avoir AV-0001");
    expect(page).toMatch(/Avoir AV-0001 du 14\/10\/2026 · annule la facture ART-1 · 120,00\s€/);
    expect(page).toContain("ART-2 · Mme Test");
    expect(page).toMatch(/Facturé 125,00\s€ · Déclaré reçu 0,00\s€ · Solde 125,00\s€/);
  });

  it("suivi d'une facture annulée : l'avoir, le motif, un reste dû nul ; aucune déclaration de règlement proposée", async () => {
    sim.activite = activite({ factures: [FACTURE_ANNULEE, FACTURE_REMPLACANTE], avoirs: [AVOIR] });
    const page = await facture("f1");
    expect(page).toContain("Annulée par l’avoir AV-0001");
    expect(page).toContain("Erreur de numéro sur la pièce jointe");
    expect(page).toMatch(/Avoir AV-0001<\/dt><dd[^>]*>120,00\s€/);
    expect(page).toMatch(/Reste dû<\/dt><dd[^>]*>0,00\s€/);
    expect(page).not.toContain("Déclarer un règlement reçu");
  });

  it("suivi de la facture en vigueur : inchangé (déclaration de règlement possible)", async () => {
    sim.activite = activite({ factures: [FACTURE_ANNULEE, FACTURE_REMPLACANTE], avoirs: [AVOIR] });
    const page = await facture("f2");
    expect(page).toContain("Déclarer un règlement reçu");
    expect(page).not.toContain("Annulée par l’avoir");
  });
});

describe("l'avoir n'est pas une pièce à remettre au client : aucun texte ne le laisse croire (relecture du 15/10)", () => {
  // Gerimmo n'en produit aucun document (ni PDF, ni lien de téléchargement) : l'avoir est une ligne du registre privé.
  // Ces formulations supposent une pièce transmissible : « transmettez-lui l'avoir », « figure sur l'avoir », « émettre ».
  const PIECE_SUPPOSEE = /transmettez|figure sur l’avoir|émettre l’avoir|émet un avoir|[ée]mis le/i;
  /** Les propriétés des éléments de l'arbre rendu par une page serveur (avant le rendu de ses composants). */
  function elements(noeud: unknown, garder: (p: Record<string, unknown>) => boolean): Record<string, unknown>[] {
    if (Array.isArray(noeud)) return noeud.flatMap((n) => elements(n, garder));
    if (!noeud || typeof noeud !== "object" || !("props" in noeud)) return [];
    const props = (noeud as { props: Record<string, unknown> }).props;
    return [...(garder(props) ? [props] : []), ...elements(props.children, garder)];
  }

  it("avant de confirmer, l'artisan lit que Gerimmo ne produit pas de document d'avoir et n'envoie rien à son client", () => {
    expect(MESSAGE_AVOIR_SANS_PIECE).toMatch(/ne produit pas de document d’avoir/);
    expect(MESSAGE_AVOIR_SANS_PIECE).toMatch(/ne lui envoie rien/);
    expect(MESSAGE_ANNULATION_CONSEQUENCES).toContain(MESSAGE_AVOIR_SANS_PIECE);
    for (const texte of [MESSAGE_ANNULATION_CONSEQUENCES, MESSAGE_MOTIF_ANNULATION, LIBELLE_CONFIRMER_ANNULATION])
      expect(texte).not.toMatch(PIECE_SUPPOSEE);
    expect(renderToStaticMarkup(createElement(RelectureAnnulation, { resume: resumerAnnulation({ numero: "ART-1", montantCents: 12000, motif: "Erreur de numéro" }) }))).not.toMatch(PIECE_SUPPOSEE);
  });

  it("le bouton de confirmation de la fiche du chantier « enregistre » l'avoir, il ne l'« émet » pas", async () => {
    sim.activite = activite({ factures: [{ ...FACTURE_ANNULEE, annulee_le: null }], avoirs: [] });
    const arbre = await PageChantier({ params: Promise.resolve({ chantierId: "h1" }) });
    const [annulation] = elements(arbre, (p) => p.action === "annuler_facture");
    expect(annulation?.libelle).toBe(LIBELLE_CONFIRMER_ANNULATION);
    expect(LIBELLE_CONFIRMER_ANNULATION).toBe("Confirmer l’annulation et enregistrer l’avoir");
  });

  it("fiche du chantier, suivi et registre : aucune formulation de pièce transmissible ; le suivi de l'avoir le rappelle", async () => {
    sim.activite = activite({ factures: [{ ...FACTURE_ANNULEE, annulee_le: null }], avoirs: [] });
    const enVigueur = await chantier();
    expect(enVigueur).toContain("Motif de l’annulation (il est enregistré avec l’avoir, dans votre registre)");
    sim.activite = activite({ factures: [FACTURE_ANNULEE, FACTURE_REMPLACANTE], avoirs: [AVOIR] });
    const suivi = await facture("f1");
    for (const page of [enVigueur, await chantier(), suivi, await html(ReglementsDansFacturation())]) expect(page).not.toMatch(PIECE_SUPPOSEE);
    expect(suivi).toContain(MESSAGE_AVOIR_SANS_PIECE);
    expect(suivi).toMatch(/Enregistré le 14\/10\/2026 · 120,00\s€ TTC · annule la facture ART-1/);
  });
});

describe("action serveur : « annuler_facture » part vers artisan_externe_ecrire, sans pièce", () => {
  const formulaire = (champs: Record<string, string>) => {
    const f = new FormData();
    f.set("cle", randomUUID());
    for (const [k, v] of Object.entries(champs)) f.set(k, v);
    return f;
  };
  beforeEach(() => {
    sim.exclusion = null;
    sim.rpc.mockReset();
    sim.rpc.mockImplementation(async (nom: string) => (nom === "artisan_exclusion_plateforme" ? { data: sim.exclusion, error: null } : { data: "h1", error: null }));
  });

  it("transmet la facture et le motif, la révision du chantier, et revient sur la fiche du chantier", async () => {
    const r = await enregistrerActivitePrivee(formulaire({ action: "annuler_facture", id: "h1", revision: "7", facture_id: "f1", motif: "  Erreur de numéro sur la pièce jointe " }));
    expect(r).toEqual({ succes: "Enregistré dans votre espace privé.", href: "/artisan/chantiers/h1" });
    const appel = sim.rpc.mock.calls.find(([nom]) => nom === "artisan_externe_ecrire")!;
    expect(appel[1]).toMatchObject({ p_action: "annuler_facture", p_id: "h1", p_revision: 7, p_donnees: { facture_id: "f1", motif: "Erreur de numéro sur la pièce jointe" } });
    expect(appel[1].p_donnees).not.toHaveProperty("piece_id");
  });

  it("un artisan refusé est arrêté avant tout appel d'écriture", async () => {
    sim.exclusion = "refuse";
    const r = await enregistrerActivitePrivee(formulaire({ action: "annuler_facture", id: "h1", revision: "7", facture_id: "f1", motif: "Erreur de numéro" }));
    expect(r.erreur).toBe(MESSAGE_ECRITURE_FERMEE.refuse);
    expect(sim.rpc.mock.calls.filter(([nom]) => nom !== "artisan_exclusion_plateforme")).toHaveLength(0);
  });

  it("les messages de la base passent tels quels ; un doublon technique est traduit pour cette action", () => {
    expect(messageErreurPrive("annuler_facture", MESSAGE_REGLEMENTS_A_ANNULER)).toBe(MESSAGE_REGLEMENTS_A_ANNULER);
    expect(messageErreurPrive("annuler_facture", "Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer")).toMatch(/vient d’être annulée/);
    expect(messageErreurPrive("annuler_facture", 'new row for relation "artisan_avoirs_externes" violates check constraint "artisan_avoirs_externes_motif_check"')).toBe(MESSAGE_MOTIF_ANNULATION);
  });
});
