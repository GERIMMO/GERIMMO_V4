/**
 * Phase 3 de la mission palier 1, lot 54 (reprise) — constats du relecteur sur le lot 54.
 *
 *  1. W38 : la phrase de période d'occupation et de prorata était relue sur le bail d'AUJOURD'HUI : fausse dès que la fin du bail
 *     a bougé depuis l'émission (congé posé ou annulé), pour un exercice en cours, ou pour une régularisation émise avant que
 *     le prorata n'existe (09/09/2026). Elle n'est imprimée que lorsqu'elle est certaine ; sinon rien ;
 *  2. W42 : une seule entreprise avec deux versions de son devis donnait « Comparaison des offres déposées » ;
 *  3. W48 : le titre équilibré se coupait avant le point médian (« RÉCAPITULATIF ANNUEL / · LOCATION NUE ») ;
 *  4. W46 : le commentaire de clôture suivait le motif sans être annoncé (doublon apparent) ;
 *  5. W39 : l'image de signature enregistrée était apposée sur l'ordre d'intervention (hors du consentement recueilli) ;
 *  6. W36 : l'ordre d'une mission terminée exigeait et imprimait « Accès et personne à contacter ».
 * Chaque cas échouait avant la reprise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { baseSimulee, filtresDe } from "./fixtures/base-simulee";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
  chargerDetenteursLot: vi.fn(async () => []),
  chargerDetenteursBien: vi.fn(async () => []),
}));
import { chargerContexteBail, signatureOrganisation, type ContexteBail } from "@/lib/documents/modeles/communs";
import * as gestionDocuments from "@/lib/documents/modeles/catalogue-gestion";
import { assemblerComplementGestion } from "@/lib/documents/modeles/catalogue-gestion";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { DOCUMENTS_SIGNATURE_ENREGISTREE, modeSignatureDocument } from "@/lib/politique-signature";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
const o = { organization_id: "org" };
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[\u00a0 ]/g, " ").replace(/[ \t]+/g, " ").replace(/ ([.,])/g, "$1");

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  vi.mocked(signatureOrganisation).mockReset();
  vi.mocked(signatureOrganisation).mockResolvedValue(null);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const organisation = { id: "org", type: "proprietaire_direct", name: "Parc de Jeanne Fictive", address_line1: "12 rue des Essais", postal_code: "69003", city: "Lyon", telephone: null, email_contact: "docs@exemple.invalid" };

// ——— 1. Période d'occupation ———
const regularisation = (sur: Ligne = {}, autres: Record<string, Ligne[]> = {}): Record<string, Ligne[]> => ({
  organizations: [organisation],
  regularisations_charges: [{ ...o, id: "reg", bail_id: "b1", annee: 2025, provisions: 240, charges_reelles: 336, ecart: -96, tardive: false, etalement_12_mois: null, justificatif_document: "doc", note: null, date_emission: "2026-10-01", created_at: "2026-10-01T09:00:00+00:00", ...sur }],
  ...autres,
});
const optionsCharges = { consultation: "Sur rendez-vous au 12 rue des Essais", detail_depenses: "Eau froide : 120 € ; entretien : 216 €" };
const CODES_CHARGES = ["regularisation_charges", "decompte_charges", "consultation_charges"] as const;
const courrier = async (tables: Record<string, Ligne[]>, code: typeof CODES_CHARGES[number] = "regularisation_charges") => {
  const base = baseSimulee(tables);
  return { base, texte: texteDe(succes(await assemblerComplementGestion(code, base.client, "org", "reg", optionsCharges)).document.html) };
};
const conge = (sur: Ligne = {}) => ({ ...o, id: "c1", bail_id: "b1", par: "locataire", date_effet: "2025-12-18", created_at: "2025-09-18T08:00:00+00:00", annule_le: null, ...sur });

describe("1 (W38) — la phrase de période et de prorata n'est imprimée que lorsqu'elle est certaine", () => {
  type Certaine = (annee: number, emission: unknown, enregistreeLe: unknown, conges: Ligne[]) => boolean;
  const certaine: Certaine = (...a) => (gestionDocuments as unknown as { periodeOccupationCertaine: Certaine }).periodeOccupationCertaine(...a);

  it("règle : exercice clos à l'émission, émission après le 09/09/2026, aucun congé posé ou annulé depuis", () => {
    expect(certaine(2025, "2026-10-01", "2026-10-01T09:00:00+00:00", [])).toBe(true);
    // Exercice non clos au moment de l'émission (jusqu'au 31/12 inclus).
    expect(certaine(2026, "2026-11-24", "2026-11-24T03:18:41+00:00", [])).toBe(false);
    expect(certaine(2026, "2026-12-31", "2026-12-31T10:00:00+00:00", [])).toBe(false);
    expect(certaine(2026, "2027-01-01", "2027-01-01T10:00:00+00:00", [])).toBe(true);
    // La plus ancienne des deux dates compte (date d'émission et jour d'enregistrement).
    expect(certaine(2026, "2027-01-02", "2026-12-30T10:00:00+00:00", [])).toBe(false);
    // Avant que le prorata n'existe dans regulariser_charges (migration du 09/09/2026) ; le jour même, on ne sait pas.
    expect(certaine(2025, "2026-09-08", "2026-09-08T10:00:00+00:00", [])).toBe(false);
    expect(certaine(2025, "2026-09-09", "2026-09-09T22:00:00+00:00", [])).toBe(false);
    expect(certaine(2025, "2026-09-10", "2026-09-10T08:00:00+00:00", [])).toBe(true);
    // Dates absentes ou illisibles : on ne peut pas le dire.
    expect(certaine(2025, "2026-10-01", null, [])).toBe(false);
    expect(certaine(2025, "", "2026-10-01T09:00:00+00:00", [])).toBe(false);
    expect(certaine(2025, "2026-10-01", "n'importe quoi", [])).toBe(false);
    // Congés : antérieur à l'enregistrement, la fin du bail était déjà connue ; posé ou annulé depuis, elle a bougé.
    expect(certaine(2025, "2026-10-01", "2026-10-01T09:00:00+00:00", [conge()])).toBe(true);
    expect(certaine(2025, "2026-10-01", "2026-10-01T09:00:00+00:00", [conge({ created_at: "2026-10-02T08:00:00+00:00" })])).toBe(false);
    expect(certaine(2025, "2026-10-01", "2026-10-01T09:00:00+00:00", [conge({ annule_le: "2026-10-05T08:00:00+00:00" })])).toBe(false);
    expect(certaine(2025, "2026-10-01", "2026-10-01T09:00:00+00:00", [conge({ created_at: "illisible" })])).toBe(false);
  });

  it.each(CODES_CHARGES)("%s : exercice clos, bail sorti le 18/12/2025 par un congé antérieur → la phrase est imprimée", async (code) => {
    ctx.bail.date_debut = "2023-09-01"; ctx.bail.date_fin = "2025-12-18";
    const { base, texte } = await courrier(regularisation({}, { conges: [conge()] }), code);
    expect(texte).toContain("Période d’occupation sur l’exercice : du 01/01/2025 au 18/12/2025, soit 352 jours sur 365. Les charges réelles ci-dessus sont la part des charges récupérables de l’exercice ramenée à ces jours d’occupation.");
    // Les congés lus sont ceux du bail, dans l'organisation.
    expect(filtresDe(base, "conges")).toEqual(expect.arrayContaining([{ op: "eq", col: "organization_id", val: "org" }, { op: "eq", col: "bail_id", val: "b1" }]));
  });

  it.each(CODES_CHARGES)("%s : exercice en cours à l'émission, congé posé depuis (bail au 15/12/2026) → rien, plus de « 349 jours sur 365 »", async (code) => {
    ctx.bail.date_debut = "2023-09-01"; ctx.bail.date_fin = "2026-12-15";
    const tables = regularisation({ annee: 2026, date_emission: "2026-11-01", created_at: "2026-11-01T09:00:00+00:00" }, { conges: [conge({ date_effet: "2026-12-15", created_at: "2026-11-12T08:00:00+00:00" })] });
    const { texte } = await courrier(tables, code);
    expect(texte).not.toContain("Période d’occupation");
    expect(texte).not.toContain("349");
    expect(texte).not.toContain("ramenée à ces jours");
    expect(texte).toContain("Charges de l’exercice 2026");
  });

  it("exercice clos, mais congé posé APRÈS l'émission avec un effet dans l'exercice → rien", async () => {
    ctx.bail.date_debut = "2023-09-01"; ctx.bail.date_fin = "2025-12-18";
    const { texte } = await courrier(regularisation({}, { conges: [conge({ created_at: "2026-10-03T08:00:00+00:00" })] }));
    expect(texte).not.toContain("Période d’occupation");
  });

  it("exercice clos, congé annulé APRÈS l'émission (bail entré en cours d'exercice) → rien", async () => {
    ctx.bail.date_debut = "2025-03-01"; ctx.bail.date_fin = null;
    const { texte } = await courrier(regularisation({}, { conges: [conge({ annule_le: "2026-10-20T08:00:00+00:00" })] }));
    expect(texte).not.toContain("Période d’occupation");
  });

  it("régularisation émise avant le 09/09/2026 (aucun prorata n'était appliqué) → rien", async () => {
    ctx.bail.date_debut = "2025-03-01"; ctx.bail.date_fin = null;
    const { texte } = await courrier(regularisation({ date_emission: "2026-03-10", created_at: "2026-03-10T09:00:00+00:00" }));
    expect(texte).not.toContain("Période d’occupation");
    expect(texte).not.toContain("jours sur");
  });

  it("contrat individuel de colocation : la phrase de quote-part reste, la période incertaine n'est pas imprimée", async () => {
    ctx.bail.date_debut = "2026-03-01"; ctx.bail.date_fin = null;
    const { texte } = await courrier(regularisation({ annee: 2026, date_emission: "2026-11-24", created_at: "2026-11-24T09:00:00+00:00", quote_part_colocation: 0.4 }));
    expect(texte).toContain("puis au prorata des jours d’occupation.");
    expect(texte).not.toContain("Période d’occupation");
  });

  it("bail présent toute l'année : aucune phrase, et les congés ne sont pas lus", async () => {
    ctx.bail.date_debut = "2023-09-01"; ctx.bail.date_fin = null;
    const { base, texte } = await courrier(regularisation());
    expect(texte).not.toContain("Période d’occupation");
    expect(base.lectures.some((l) => l.table === "conges")).toBe(false);
  });
});

// ——— Incidents et travaux ———
function incidents(): Record<string, Ligne[]> {
  return {
    organizations: [organisation],
    lots: [{ ...o, id: "t2", nom: "T2", etage: "2e étage, porte gauche", bien_id: "avenue", meuble: false }],
    biens: [{ ...o, id: "avenue", nom: "Résidence des Essais", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" }],
    incidents: [
      { ...o, id: "incA", numero: "INC-2026-0001", lot_id: "t2", bien_id: null, description: "Fuite sous l'évier.", piece: "Cuisine", categorie: "plomberie_joint", etat: "clos", urgence: "normale", date_signalement: "2026-10-13", imputation: "proprietaire", imputation_justification: "Usure du joint.", clos_le: "2026-10-24T16:00:00+00:00", cloture_motif: "resolu", cloture_commentaire: "Fuite réparée." },
      { ...o, id: "incB", numero: "INC-2026-0002", lot_id: "t2", bien_id: null, description: "Le radiateur ne chauffe plus.", piece: "Séjour", categorie: "chauffage_panne", etat: "en_cours", urgence: "urgente", date_signalement: "2026-11-20", imputation: "proprietaire", imputation_justification: "Panne.", clos_le: null },
      { ...o, id: "incC", numero: "INC-2026-0003", lot_id: null, bien_id: "avenue", description: "Infiltration au plafond de la cage d'escalier", piece: null, categorie: "humidite_infiltration", etat: "clos", urgence: "normale", date_signalement: "2026-11-10", imputation: null, imputation_justification: null, clos_le: "2026-11-14T10:00:00+00:00", cloture_motif: "transmis_syndic", cloture_commentaire: "Transmis au syndic de l'immeuble le 14/11/2026" },
    ],
    artisans: [
      { id: "art1", raison_sociale: "Plomberie Fictive", siret: "12345678901234", telephone: "0600000000", email: "plomberie@exemple.invalid" },
      { id: "art2", raison_sociale: "Sanitaires Fictifs", siret: null, telephone: null, email: null },
    ],
    incident_devis: [
      { ...o, id: "devA", incident_id: "incA", artisan_id: "art1", statut: "retenu", version: 1, montant_ttc_cents: 18700, depose_le: "2026-10-15T15:30:00+00:00", retenu_le: "2026-10-17T07:00:00+00:00", valide_jusqu_au: "2026-11-14", description: "Remplacement du siphon et des joints." },
      { ...o, id: "devA2", incident_id: "incA", artisan_id: "art2", statut: "non_retenu", version: 1, montant_ttc_cents: 26180, depose_le: "2026-10-16T10:10:00+00:00", retenu_le: null, valide_jusqu_au: "2026-11-15", description: "Remplacement de la bonde." },
      // Une seule entreprise, deux versions : la première renvoyée en révision, la seconde qui la remplace.
      { ...o, id: "devB1", incident_id: "incB", artisan_id: "art1", statut: "revise", version: 1, montant_ttc_cents: 19800, depose_le: "2026-11-20T17:05:00+00:00", retenu_le: null, valide_jusqu_au: "2026-12-20", description: "Remplacement du radiateur." },
      { ...o, id: "devB2", incident_id: "incB", artisan_id: "art1", statut: "depose", version: 2, devis_precedent_id: "devB1", montant_ttc_cents: 16170, depose_le: "2026-11-21T17:05:00+00:00", retenu_le: null, valide_jusqu_au: "2026-12-21", description: "Remplacement du thermostat." },
    ],
    incident_interventions: [
      { ...o, id: "mA", incident_id: "incA", devis_id: "devA", artisan_id: "art1", nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-10-17T07:00:00+00:00", debut_prevu: "2026-10-22T07:00:00+00:00", fin_prevue: "2026-10-22T09:00:00+00:00", terminee_le: "2026-10-22T08:50:00+00:00" },
      { ...o, id: "mB", incident_id: "incB", devis_id: "devB2", artisan_id: "art1", nature_travaux: "entretien_courant", statut: "planifiee", confiee_le: "2026-11-22T08:15:00+00:00", debut_prevu: "2026-11-27T08:00:00+00:00", fin_prevue: "2026-11-27T10:00:00+00:00", terminee_le: null },
    ],
    intervention_comptes_rendus: [],
  };
}
const assembler = async (code: Parameters<typeof assemblerComplementGestion>[0], cible: string, options: Record<string, string> = {}, tables = incidents()) =>
  succes(await assemblerComplementGestion(code, baseSimulee(tables).client, "org", cible, options)).document;
const gestion = async (code: Parameters<typeof assemblerComplementGestion>[0], cible: string, options: Record<string, string> = {}) => (await assembler(code, cible, options)).html;

describe("2 (W42) — deux versions du devis d'une seule entreprise ne sont pas une « comparaison des offres »", () => {
  it("une entreprise, version 1 en révision et version 2 reçue : la phrase le dit", async () => {
    const texte = texteDe(await gestion("comparatif_devis", "incB"));
    expect(texte).not.toContain("Comparaison des offres");
    expect(texte).toContain("Les devis déposés viennent d’une seule entreprise. Le choix reste à faire ; ce document ne commande aucune prestation.");
  });
  it("deux entreprises : « Comparaison des offres déposées. » ; un seul devis : « Un seul devis a été déposé. »", async () => {
    expect(texteDe(await gestion("comparatif_devis", "incA"))).toContain("Comparaison des offres déposées. Le devis de Plomberie Fictive (187,00 € TTC) a été retenu le 17/10/2026");
    const t = incidents();
    t.incident_devis = t.incident_devis.filter((d) => d.id !== "devB1");
    expect(texteDe((await assembler("comparatif_devis", "incB", {}, t)).html)).toContain("Un seul devis a été déposé. Le choix reste à faire");
  });
});

describe("3 (W48) — le titre ne se coupe plus avant le point médian", () => {
  const fiscalMeuble = (): Record<string, Ligne[]> => ({
    organizations: [organisation],
    lots: [{ ...o, id: "studio", nom: "Studio", etage: null, bien_id: "avenue", meuble: true }],
    biens: [{ ...o, id: "avenue", nom: "Résidence des Essais", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" }],
    ecritures: [{ ...o, id: "e1", lot_id: "studio", categorie: "loyer", sens: "recette", montant: 500, date_piece: "2026-02-05" }],
  });
  it("récapitulatif annuel : rien ne se coupe avant « · » dans le titre imprimé (espaces insécables) ; le nom du modèle ne change pas", async () => {
    const a = succes(await assemblerComplementGestion("recap_fiscal_meuble", baseSimulee(fiscalMeuble()).client, "org", "studio", { annee: "2026" }));
    expect(a.document.html).toContain("<h1>Récapitulatif\u00a0annuel\u00a0· meublé</h1>");
    expect(a.document.html).not.toContain("<h1>Récapitulatif annuel · meublé</h1>");
    expect(a.titreGed).toBe("Récapitulatif annuel · meublé");
  });
  it("un titre sans point médian est inchangé", async () => {
    expect(await gestion("recap_incident", "incA")).toContain("<h1>Récapitulatif d’incident</h1>");
  });
});

describe("4 (W46) — le commentaire de clôture est annoncé", () => {
  it("« motif : … . Commentaire : … » : plus de phrase accolée au motif", async () => {
    const texte = texteDe(await gestion("recap_incident", "incC"));
    expect(texte).toContain("Clôturé le 14/11/2026 ; motif : Transmis au syndic (parties communes). Commentaire : Transmis au syndic de l'immeuble le 14/11/2026.");
    expect(texte).not.toContain("(parties communes). Transmis au syndic");
  });
  it("sans commentaire : le motif seul, sans « Commentaire »", async () => {
    const t = incidents();
    t.incidents[2].cloture_commentaire = "";
    const texte = texteDe((await assembler("recap_incident", "incC", {}, t)).html);
    expect(texte).toContain("Clôturé le 14/11/2026 ; motif : Transmis au syndic (parties communes).");
    expect(texte).not.toContain("Commentaire");
  });
});

describe("5 (W39) — l'image de signature enregistrée n'est pas apposée sur l'ordre d'intervention", () => {
  it("l'ordre n'est pas un document à signature enregistrée ; les trois courriers de charges le restent", () => {
    expect(DOCUMENTS_SIGNATURE_ENREGISTREE.has("ordre_intervention")).toBe(false);
    expect(modeSignatureDocument("ordre_intervention")).toBe("original");
    for (const code of CODES_CHARGES) expect(modeSignatureDocument(code)).toBe("enregistree");
  });
  it.each(["mA", "mB"])("ordre de la mission %s, image enregistrée dans l'espace : « Fait à », cadre vide au nom de l'émetteur, image jamais lue", async (mission) => {
    vi.mocked(signatureOrganisation).mockResolvedValue("data:image/png;base64,AAAA");
    const html = await gestion("ordre_intervention", mission, { acces: "Clé chez la gardienne." });
    expect(html).toMatch(/<p class="fait-a">Fait à [\s\S]*?<\/p><div class="sig-emetteur">\s*<div class="sig-libelle">Signature<\/div>\s*<div class="sig-vide"><\/div>\s*<div class="sig-nom">Parc de Jeanne Fictive<\/div>/);
    expect(html).not.toContain('class="sig-image"');
    expect(html).not.toContain("data:image/png;base64,AAAA");
    expect(signatureOrganisation).not.toHaveBeenCalled();
  });
  it("courrier de charges : l'image enregistrée reste apposée", async () => {
    vi.mocked(signatureOrganisation).mockResolvedValue("data:image/png;base64,AAAA");
    const html = succes(await assemblerComplementGestion("regularisation_charges", baseSimulee(regularisation()).client, "org", "reg", optionsCharges)).document.html;
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="" class="sig-image"/>');
  });
});

describe("6 (W36) — l'ordre d'une mission terminée n'exige ni n'imprime « Accès et personne à contacter »", () => {
  it("mission terminée, champ laissé vide : le document est complet, sans la ligne d'accès", async () => {
    const document = await assembler("ordre_intervention", "mA");
    expect(refusDocumentIncomplet(document)).toBeNull();
    const texte = texteDe(document.html);
    expect(texte).not.toContain("Accès et personne à contacter");
    expect(texte).toContain("Mission terminée le 22/10/2026 : ce document est établi après l’intervention, pour le dossier.");
    expect(texte).toContain("Créneau prévu : le 22/10/2026 de 9 h à 11 h.");
  });
  it("mission terminée, champ saisi : il n'est pas imprimé", async () => {
    const texte = texteDe(await gestion("ordre_intervention", "mA", { acces: "Clé chez la gardienne." }));
    expect(texte).not.toContain("Accès et personne à contacter");
    expect(texte).not.toContain("Clé chez la gardienne");
  });
  it("mission planifiée : le champ reste imprimé, et exigé s'il est vide", async () => {
    expect(texteDe(await gestion("ordre_intervention", "mB", { acces: "Clé chez la gardienne." }))).toContain("Accès et personne à contacter : Clé chez la gardienne.");
    expect(refusDocumentIncomplet(await assembler("ordre_intervention", "mB"))?.manquants).toEqual(["modalités d’accès et contact sur place"]);
  });
});
