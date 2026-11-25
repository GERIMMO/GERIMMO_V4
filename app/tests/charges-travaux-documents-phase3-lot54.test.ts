/**
 * Phase 3 de la mission palier 1, lot 54 — relecture des documents de la famille « charges-travaux » (passe 1).
 *
 *  - W36 : l'ordre d'une mission terminée « commandait », au jour de sa génération, des travaux qu'il disait terminés ;
 *  - W37 : « à joindre au courrier » et « Ce PDF ne déclenche aucun prélèvement ni envoi » (consignes à l'utilisateur)
 *    imprimés dans le courrier adressé au locataire ; elles sont à l'écran du catalogue ;
 *  - W38 : un bail entré en cours d'exercice : ni la période d'occupation ni le prorata n'étaient imprimés ;
 *  - W39 : courriers de charges et ordre d'intervention sans signature ni nom du signataire ;
 *  - W41 : le saut de ligne « titre / note » d'un signalement se perdait (« …cage d'escalier Trace d'humidité… ») ;
 *  - W42 : « Comparaison des offres déposées » pour un seul devis ;
 *  - W43 : un montant saisi en ligne 250 dans une colonne « Montant enregistré » ;
 *  - W44 : l'encadré d'écart de la ligne 250 passait seul en tête de la page 2 ;
 *  - W45 : le lieu des parties communes dans l'ancien format à points médians ;
 *  - W46 : « Imputation enregistrée : —. » / « Justification : —. » pour un incident clos sans qualification ;
 *  - W47 : le catalogue annonçait une « référence de la pièce corrigée » que le justificatif n'imprime pas ;
 *  - W48 : « NUE » seul sur la seconde ligne du titre du récapitulatif location nue.
 * Chaque cas échouait avant le correctif. W40 (autorisation de travaux) n'est pas modifié : son HTML est l'empreinte de son
 * circuit de signature (garde : impayes-documents-phase3-lot53-reprise), et le sens de l'autorisation est une question au juriste.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { baseSimulee } from "./fixtures/base-simulee";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
  chargerDetenteursLot: vi.fn(async () => []),
  chargerDetenteursBien: vi.fn(async () => []),
}));
import { chargerContexteBail, signatureOrganisation, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementGestion, periodeOccupation } from "@/lib/documents/modeles/catalogue-gestion";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { modeSignatureDocument } from "@/lib/politique-signature";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
const o = { organization_id: "org" };
function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[  ]/g, " ").replace(/[ \t]+/g, " ").replace(/ ([.,])/g, "$1");
const lignesDe = (html: string) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/[  ]/g, " ").trim()).join("|"));

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  vi.mocked(signatureOrganisation).mockResolvedValue(null);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const organisation = (type = "proprietaire_direct") => ({ id: "org", type, name: "Parc de Jeanne Fictive", address_line1: "12 rue des Essais", postal_code: "69003", city: "Lyon", telephone: null, email_contact: "docs@exemple.invalid" });

// ——— Charges ———
const regularisation = (sur: Ligne = {}, autres: Record<string, Ligne[]> = {}): Record<string, Ligne[]> => ({
  organizations: [organisation()],
  regularisations_charges: [{ ...o, id: "reg", bail_id: "b1", annee: 2024, provisions: 240, charges_reelles: 336, ecart: -96, tardive: true, etalement_12_mois: null, justificatif_document: "doc", note: null, date_emission: "2026-11-24",
    // Reprise du lot 54 (W38) : la phrase de période n'est imprimée que pour une régularisation dont l'enregistrement est daté
    // (après la fin de l'exercice et après le 09/09/2026) ; une vraie ligne porte toujours created_at.
    created_at: "2026-11-24T03:18:41.476691+00:00", ...sur }],
  ...autres,
});
const optionsCharges = { consultation: "Sur rendez-vous au 12 rue des Essais", detail_depenses: "Eau froide : 120 € ; entretien : 216 €" };
const CODES_CHARGES = ["regularisation_charges", "decompte_charges", "consultation_charges"] as const;
const charges = async (code: typeof CODES_CHARGES[number], tables = regularisation()) => succes(await assemblerComplementGestion(code, baseSimulee(tables).client, "org", "reg", optionsCharges));

describe("W37 — plus de consigne à l'utilisateur dans le courrier adressé au locataire", () => {
  it.each(CODES_CHARGES)("%s : ni « à joindre au courrier », ni « Ce PDF ne déclenche… »", async (code) => {
    const texte = texteDe((await charges(code)).document.html);
    expect(texte).not.toContain("à joindre au courrier");
    expect(texte).not.toContain("Ce PDF ne déclenche");
    expect(texte).not.toContain("prélèvement");
    expect(texte).toContain("Date du dossier : 24/11/2026.");
  });
  it.each(["regularisation_charges", "decompte_charges"] as const)("%s : le justificatif est dit distinct, sans être annoncé joint (C97)", async (code) => {
    const texte = texteDe((await charges(code)).document.html);
    expect(texte).toContain("Justificatif : pièce distincte de ce document, enregistrée avec la régularisation.");
    expect(texte).not.toMatch(/annexé|joint au/);
  });
  it("les consignes sont à l'écran du catalogue, sous le champ de la consultation (texte affiché, pas de repli)", () => {
    const aide = (code: string) => OPTIONS_CATALOGUE[code].find((c) => c.cle === "consultation")?.aide ?? "";
    for (const code of ["regularisation_charges", "decompte_charges"]) {
      expect(aide(code)).toContain("Le justificatif enregistré avec la régularisation n’est pas dans ce PDF : joignez-le au courrier.");
      expect(aide(code)).toContain("Ce PDF ne déclenche aucun prélèvement ni envoi.");
    }
    expect(aide("consultation_charges")).toContain("Ce PDF ne déclenche aucun prélèvement ni envoi.");
    expect(aide("consultation_charges")).not.toContain("joignez");
  });
});

describe("W38 — la période d'occupation d'un bail commencé en cours d'exercice est imprimée", () => {
  it("periodeOccupation borne le bail à l'exercice comme regulariser_charges", () => {
    expect(periodeOccupation("2024-09-01", null, 2024)).toEqual({ debut: "2024-09-01", fin: "2024-12-31", jours: 122, joursAnnee: 366 });
    expect(periodeOccupation("2022-03-01", "2025-06-30", 2025)).toEqual({ debut: "2025-01-01", fin: "2025-06-30", jours: 181, joursAnnee: 365 });
    expect(periodeOccupation("2022-03-01", null, 2025)).toBeNull();
    expect(periodeOccupation(null, null, 2025)).toBeNull();
  });
  it.each(CODES_CHARGES)("%s : bail entré le 01/09/2024 → « du 01/09/2024 au 31/12/2024, soit 122 jours sur 366 »", async (code) => {
    ctx.bail.date_debut = "2024-09-01";
    const texte = texteDe((await charges(code)).document.html);
    expect(texte).toContain("Période d’occupation sur l’exercice : du 01/09/2024 au 31/12/2024, soit 122 jours sur 366. Les charges réelles ci-dessus sont la part des charges récupérables de l’exercice ramenée à ces jours d’occupation.");
    expect(texte.indexOf("Période d’occupation")).toBeGreaterThan(texte.indexOf("Charges réelles"));
  });
  it("bail présent toute l'année : aucune phrase (aucun prorata)", async () => {
    ctx.bail.date_debut = "2023-09-01";
    expect(texteDe((await charges("regularisation_charges")).document.html)).not.toContain("Période d’occupation");
  });
  it("régularisation émise depuis les factures de fournitures (aucun nouveau prorata) : la phrase n'est pas imprimée", async () => {
    ctx.bail.date_debut = "2024-09-01";
    const tables = regularisation({}, { brouillons_regularisation_fourniture: [{ ...o, id: "br", bail_id: "b1", annee: 2024, regularisation_id: "reg" }] });
    expect(texteDe((await charges("regularisation_charges", tables)).document.html)).not.toContain("Période d’occupation");
  });
  it("contrat individuel de colocation : la période est dite, la quote-part garde sa phrase", async () => {
    ctx.bail.date_debut = "2024-09-01";
    const texte = texteDe((await charges("regularisation_charges", regularisation({ quote_part_colocation: 0.4 }))).document.html);
    expect(texte).toContain("puis au prorata des jours d’occupation.");
    expect(texte).toContain("Période d’occupation sur l’exercice : du 01/09/2024 au 31/12/2024, soit 122 jours sur 366.");
    expect(texte).not.toContain("Les charges réelles ci-dessus sont la part");
  });
});

// ——— Incidents et travaux ———
function incidents(): Record<string, Ligne[]> {
  return {
    organizations: [organisation()],
    lots: [{ ...o, id: "t2", nom: "T2", etage: "2e étage, porte gauche", bien_id: "avenue", meuble: false }],
    biens: [{ ...o, id: "avenue", nom: "Résidence des Essais", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" }],
    incidents: [
      { ...o, id: "incA", numero: "INC-2026-0001", lot_id: "t2", bien_id: null, description: "Fuite sous l'évier.", piece: "Cuisine", categorie: "plomberie_joint", etat: "clos", urgence: "normale", date_signalement: "2026-10-13", imputation: "proprietaire", imputation_justification: "Usure du joint.", clos_le: "2026-10-24T16:00:00+00:00", cloture_motif: "resolu", cloture_commentaire: "Fuite réparée." },
      { ...o, id: "incB", numero: "INC-2026-0002", lot_id: "t2", bien_id: null, description: "Le radiateur ne chauffe plus.", piece: "Séjour", categorie: "chauffage_panne", etat: "en_cours", urgence: "urgente", date_signalement: "2026-11-20", imputation: "proprietaire", imputation_justification: "Panne.", clos_le: null },
      { ...o, id: "incC", numero: "INC-2026-0003", lot_id: null, bien_id: "avenue", description: "Infiltration au plafond de la cage d'escalier\nTrace d'humidité au plafond du palier du 2e étage.", piece: null, categorie: "humidite_infiltration", etat: "clos", urgence: "normale", date_signalement: "2026-11-10", imputation: null, imputation_justification: null, clos_le: "2026-11-14T10:00:00+00:00", cloture_motif: "transmis_syndic", cloture_commentaire: "" },
    ],
    // Reprise du lot 54 (W42) : une « comparaison des offres » suppose deux entreprises ; le second devis de l'incident A venait
    // de la même entreprise que le premier (ce qu'une consultation ne produit pas : un devis vivant par entreprise sollicitée).
    artisans: [{ id: "art1", raison_sociale: "Plomberie Fictive", siret: "12345678901234", telephone: "0600000000", email: "plomberie@exemple.invalid" }, { id: "art2", raison_sociale: "Sanitaires Fictifs", siret: null, telephone: null, email: null }],
    incident_devis: [
      { ...o, id: "devA", incident_id: "incA", artisan_id: "art1", statut: "retenu", version: 1, montant_ttc_cents: 18700, depose_le: "2026-10-15T15:30:00+00:00", retenu_le: "2026-10-17T07:00:00+00:00", valide_jusqu_au: "2026-11-14", description: "Remplacement du siphon et des joints." },
      { ...o, id: "devA2", incident_id: "incA", artisan_id: "art2", statut: "non_retenu", version: 1, montant_ttc_cents: 26180, depose_le: "2026-10-16T10:10:00+00:00", retenu_le: null, valide_jusqu_au: "2026-11-15", description: "Remplacement de la bonde." },
      { ...o, id: "devB", incident_id: "incB", artisan_id: "art1", statut: "retenu", version: 1, montant_ttc_cents: 16170, depose_le: "2026-11-21T17:05:00+00:00", retenu_le: "2026-11-22T08:15:00+00:00", valide_jusqu_au: "2026-12-21", description: "Remplacement du thermostat." },
    ],
    incident_interventions: [
      { ...o, id: "mA", incident_id: "incA", devis_id: "devA", artisan_id: "art1", nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-10-17T07:00:00+00:00", debut_prevu: "2026-10-22T07:00:00+00:00", fin_prevue: "2026-10-22T09:00:00+00:00", terminee_le: "2026-10-22T08:50:00+00:00" },
      { ...o, id: "mB", incident_id: "incB", devis_id: "devB", artisan_id: "art1", nature_travaux: "entretien_courant", statut: "planifiee", confiee_le: "2026-11-22T08:15:00+00:00", debut_prevu: "2026-11-27T08:00:00+00:00", fin_prevue: "2026-11-27T10:00:00+00:00", terminee_le: null },
    ],
    intervention_comptes_rendus: [],
  };
}
const gestion = async (code: Parameters<typeof assemblerComplementGestion>[0], cible: string, options: Record<string, string> = {}) =>
  succes(await assemblerComplementGestion(code, baseSimulee(incidents()).client, "org", cible, options)).document.html;

describe("W36 — l'ordre d'une mission terminée dit qu'il est établi après l'intervention", () => {
  it("mission terminée : ne commande plus rien, date de fin réelle, établi au jour (jamais antidaté)", async () => {
    const texte = texteDe(await gestion("ordre_intervention", "mA", { acces: "Clé chez la gardienne." }));
    expect(texte).toContain("Mission terminée le 22/10/2026 : ce document est établi après l’intervention, pour le dossier. Il ne commande aucun nouveau travail. Les travaux commandés étaient ceux du devis ci-dessous.");
    expect(texte).not.toContain("sont commandés");
    expect(texte).not.toContain("Aucun travail supplémentaire n’est autorisé");
    expect(texte).toContain("Établi le 24/11/2026");
    expect(texte).toContain("Fait à Lyon, le 24/11/2026.");
  });
  it("mission planifiée : l'ordre est inchangé", async () => {
    const texte = texteDe(await gestion("ordre_intervention", "mB", { acces: "Clé chez la gardienne." }));
    expect(texte).toContain("Seuls les travaux du devis ci-dessous sont commandés. Aucun travail supplémentaire n’est autorisé par ce document sans accord préalable du donneur d’ordre.");
    expect(texte).not.toContain("établi après l’intervention");
  });
});

describe("W39 — courriers de charges et ordre d'intervention signés comme les autres courriers de l'émetteur", () => {
  it.each(["regularisation_charges", "decompte_charges", "consultation_charges"])("%s : signature enregistrée de l'émetteur", (code) => {
    expect(modeSignatureDocument(code)).toBe("enregistree");
  });
  it.each(CODES_CHARGES)("%s : « Fait à » puis le bloc de signature au nom du bailleur (zone vierge sans image)", async (code) => {
    const html = (await charges(code)).document.html;
    expect(html).toMatch(/<p class="fait-a">Fait à [\s\S]*?<\/p><div class="sig-emetteur">\s*<div class="sig-libelle">Signature<\/div>\s*<div class="sig-vide"><\/div>/);
    expect(html).toContain(`<div class="sig-nom">${ctx.bailleurs[0].nom} ${ctx.bailleurs[0].prenom}</div>`);
  });
  // Reprise du lot 54 (W39, prudence) : ce test exigeait l'image enregistrée sur l'ordre d'intervention. Le consentement
  // recueilli avec la signature ne vise que quittances, reçus, attestations et courriers ; l'ordre, qui engage le donneur
  // d'ordre, garde « Fait à » et le bloc au nom de l'émetteur, zone vierge à signer à la main, même si une image existe.
  it("ordre d'intervention : « Fait à », zone de signature vierge et nom de l'émetteur de l'en-tête, jamais l'image enregistrée", async () => {
    vi.mocked(signatureOrganisation).mockClear();
    vi.mocked(signatureOrganisation).mockResolvedValue("data:image/png;base64,AAAA");
    expect(modeSignatureDocument("ordre_intervention")).toBe("original");
    const html = await gestion("ordre_intervention", "mB", { acces: "Clé chez la gardienne." });
    expect(html).toMatch(/<p class="fait-a">Fait à [\s\S]*?<\/p><div class="sig-emetteur">\s*<div class="sig-libelle">Signature<\/div>\s*<div class="sig-vide"><\/div>/);
    expect(html).not.toContain('class="sig-image"');
    expect(html).not.toContain("data:image");
    expect(signatureOrganisation).not.toHaveBeenCalled();
    expect(html).toContain('<div class="sig-nom">Parc de Jeanne Fictive</div>');
    expect(html).not.toContain('class="signatures"');
  });
  it("les documents internes (comparatif, récapitulatif) n'ont pas de bloc", async () => {
    expect(await gestion("comparatif_devis", "incA")).not.toContain('class="sig-emetteur"');
    expect(await gestion("recap_incident", "incA")).not.toContain('class="sig-emetteur"');
  });
});

describe("W41 — le titre et la note d'un signalement restent sur deux lignes", () => {
  it("récapitulatif d'un incident déclaré depuis le bien (titre, saut de ligne, note)", async () => {
    const html = await gestion("recap_incident", "incC");
    expect(html).toContain("Signalement : <span class=\"v\">Infiltration au plafond de la cage d'escalier<br>Trace d'humidité au plafond du palier du 2e étage.</span>");
  });
  it("le texte saisi reste échappé", async () => {
    const t = incidents();
    t.incidents[2].description = "Titre <b>\nNote";
    const html = succes(await assemblerComplementGestion("recap_incident", baseSimulee(t).client, "org", "incC")).document.html;
    expect(html).toContain("Titre &lt;b&gt;<br>Note");
  });
});

describe("W42 — un seul devis n'est pas une « comparaison des offres »", () => {
  it("un devis : « Un seul devis a été déposé. » ; deux devis : la comparaison, inchangée", async () => {
    expect(texteDe(await gestion("comparatif_devis", "incB"))).toContain("Un seul devis a été déposé. Le devis de Plomberie Fictive (161,70 € TTC) a été retenu le 22/11/2026 ; ce document ne commande aucune prestation.");
    expect(texteDe(await gestion("comparatif_devis", "incA"))).toContain("Comparaison des offres déposées. Le devis de Plomberie Fictive");
  });
});

describe("W45 — le lieu des parties communes s'écrit comme un logement", () => {
  it("« rue, code postal ville, immeuble — parties communes »", async () => {
    const html = await gestion("recap_incident", "incC");
    expect(html).toContain('<div class="etiquette">Lieu</div><div>8 avenue des Essais, 69003 Lyon, Résidence des Essais — parties communes</div>');
    expect(html).not.toContain(" · Parties communes · ");
  });
});

describe("W46 — un incident clos sans qualification n'imprime plus « —. »", () => {
  it("transmis au syndic, sans commentaire : aucune imputation, motif dit, ni justification ni tiret", async () => {
    const texte = texteDe(await gestion("recap_incident", "incC"));
    expect(texte).toContain("Aucune imputation enregistrée : le dossier a été clos sans qualification.");
    expect(texte).toContain("Clôturé le 14/11/2026 ; motif : Transmis au syndic (parties communes).");
    expect(texte).not.toMatch(/Imputation enregistrée : —|Justification : —|Clôturé le [^.]*\. —/);
  });
  it("incident qualifié et résolu : imputation, justification et commentaire, comme avant", async () => {
    const texte = texteDe(await gestion("recap_incident", "incA"));
    expect(texte).toContain("Imputation enregistrée : Charge propriétaire.");
    expect(texte).toContain("Justification : Usure du joint.");
    // Reprise du lot 54 (W46) : le commentaire de clôture est introduit (« Commentaire : ») au lieu de suivre le motif à nu.
    expect(texte).toContain("Clôturé le 24/10/2026 ; motif : Résolu. Commentaire : Fuite réparée.");
  });
  it("dossier ouvert sans imputation : « pas encore décidée »", async () => {
    const t = incidents();
    Object.assign(t.incidents[1], { imputation: null, imputation_justification: null });
    const texte = texteDe(succes(await assemblerComplementGestion("recap_incident", baseSimulee(t).client, "org", "incB")).document.html);
    expect(texte).toContain("Imputation : pas encore décidée.");
    expect(texte).toContain("Le dossier est toujours ouvert.");
  });
});

// ——— Récapitulatif fiscal (location nue) ———
function fiscalNu(): Record<string, Ligne[]> {
  const loyer = (m: number) => ({ ...o, id: `loyer${m}`, lot_id: "t2", bail_id: "bail", encaissement_id: `enc${m}`, categorie: "loyer", sens: "recette", montant: 750, date_piece: `2026-0${m}-05` });
  return {
    ...incidents(),
    organizations: [organisation("agence")],
    ecritures: [loyer(1), loyer(2), loyer(3), { ...o, id: "interets", lot_id: "t2", categorie: "Intérêts d'emprunt", sens: "depense", montant: 1184.32, date_piece: "2026-10-15" }],
    fiscal_encaissements_composantes: [1, 2, 3].map((m) => ({ ...o, ecriture_id: `loyer${m}`, loyer_hc: 690, charges: 60, non_ventile: 0 })),
    fiscal_qualifications_ecritures: [{ ...o, ecriture_id: "interets", lot_id: "t2", nature: "deductible", rubrique: "250", justification: "Tableau d'amortissement", version: 1 }],
    fiscal_exercices_lots: [{ ...o, lot_id: "t2", annee: 2026, version: 1, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }], justification: "Lot nu à 100 %", regularisation230: 0, quote_part230: 100, justification230: "Aucune provision l'année précédente" }],
  };
}
const recapNu = async (interets: string) => succes(await assemblerComplementGestion("recap_fiscal_nu", baseSimulee(fiscalNu()).client, "org", "t2", { annee: "2026", interets_emprunt: interets })).document.html;

describe("W43 et W44 — ligne 250 saisie : colonne « Montant retenu », encadré d'écart rangé avec la dernière rubrique", () => {
  it("montant saisi différent du livre : « Montant retenu », l'encadré dans la dernière section insécable du tableau", async () => {
    const html = await recapNu("1200,50");
    expect(lignesDe(html)[0]).toBe("Rubrique|Libellé|Montant retenu");
    expect(lignesDe(html)).toContain("250|Intérêts d’emprunt|1 200,50 €");
    const derniere = html.match(/<tbody style="break-inside:avoid-page;page-break-inside:avoid">([\s\S]*?)<\/tbody><\/table>/)?.[1] ?? "";
    expect(derniere).toContain("Intérêts d’emprunt");
    expect(derniere).toContain('<div class="encadre"><p><strong>Écart sur la ligne 250 (intérêts d’emprunt).</strong>');
    expect(html.split('<div class="encadre">')).toHaveLength(2);
  });
  it("sans écart : « Montant enregistré », aucun encadré, tableau sans section finale", async () => {
    const html = await recapNu("");
    expect(lignesDe(html)[0]).toBe("Rubrique|Libellé|Montant enregistré");
    expect(html).not.toContain("Écart sur la ligne 250");
    expect(html).not.toContain('<tbody style="break-inside:avoid-page');
  });
});

describe("W48 — le titre long se répartit en lignes équilibrées", () => {
  it("text-wrap:balance sur le titre des documents de gestion", async () => {
    expect(await recapNu("")).toContain("h1{font-size:19pt;letter-spacing:.2em;text-wrap:balance}");
  });
});

describe("W47 — le catalogue n'annonce plus une référence que le justificatif n'imprime pas", () => {
  it("description de l'écriture rectificative", () => {
    const d = CATALOGUE_DOCUMENTS.find((m) => m.id === "ecriture_rectificative")?.description ?? "";
    expect(d).not.toMatch(/référence/);
    expect(d).toBe("Contre-écriture et pièce corrigée : libellé, sens, montant, dates et motif.");
  });
});
