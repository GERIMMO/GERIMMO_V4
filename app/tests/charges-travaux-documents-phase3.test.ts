/**
 * Phase 3 de la mission palier 1, lot 42 — charges, travaux, comptabilité.
 *
 * Défauts relevés sur les PDF des dossiers fictifs (famille « charges-travaux ») :
 *  - C77 : le courrier annonçait le décompte « communiqué un mois avant la régularisation » quand la première mensualité tombait
 *    huit jours après (la base est corrigée par la migration 20261123150000 ; le texte ne l'annonce plus quand les dates du dossier
 *    le démentent) ;
 *  - C97 : « Justificatif annexé : pièce enregistrée dans le dossier, à joindre » ;
 *  - C79 : l'ordre d'intervention perdait les heures du rendez-vous (« 26/11/2026 au 26/11/2026 ») ;
 *  - C80 : l'ordre d'intervention ne citait pas le devis retenu (travaux, montant, référence) ;
 *  - C86 : le comparatif disait le choix « soumis à la validation » quand un devis était déjà retenu ;
 *  - C88 : le logement des documents d'incident sans étage ni porte ;
 *  - C89 : le récapitulatif d'incident sans date de signalement, ni urgence, ni suivi ;
 *  - C91 : le journal sans logement ni catégorie (deux « Taxe foncière de l'année » indiscernables) ;
 *  - C93 : la contre-écriture paraissait datée de la pièce d'origine ;
 *  - C94 : la ligne 222 « à compléter » imprimée 0,00 € ;
 *  - C95 : un récapitulatif fiscal de l'année en cours sans mention provisoire ;
 *  - C96 : le récapitulatif meublé annonçait une ventilation loyers/provisions qu'il n'affiche pas.
 * Chaque cas échouait avant le correctif. La base simulée applique ses filtres (fixtures/base-simulee).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte } from "./fixtures/contexte-document";
import { baseSimulee } from "./fixtures/base-simulee";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, type ContexteBail } from "@/lib/documents/modeles/communs";
import { assemblerComplementGestion, creneauParis as creneauDuGabarit, delaiDecompteRespecte, mentionExerciceProvisoire, unMoisApres } from "@/lib/documents/modeles/catalogue-gestion";
import { libelleCategorieEcriture } from "@/lib/categories-ecriture";
import type { Assemblage } from "@/lib/documents/modeles";

type Ligne = Record<string, unknown>;
const o = { organization_id: "org" };

function succes(r: Assemblage) {
  if ("erreur" in r) throw new Error(r.erreur);
  return r;
}
/** Le texte lisible (sans feuille de style ni balises), espaces insécables ramenées à des espaces. */
const texteDe = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<br>/g, "\n").replace(/<[^>]+>/g, " ").replace(/[\u00a0\u202f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ([.,])/g, "$1");
/** Les lignes d'un tableau (en-tête compris), cellules séparées par « | ». */
const lignesDe = (html: string) => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").replace(/[\u00a0\u202f]/g, " ").trim()).join("|"));
const cartouche = (html: string, etiquette: string) => html.match(new RegExp(`<div class="etiquette">${etiquette}</div><div>([\\s\\S]*?)</div></div>`))?.[1];

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  ctx.bail.etat = "actif";
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
  // Le jour de génération des PDF du banc : 23/11/2026, à Paris.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const organisation = (type = "proprietaire_direct") => ({ id: "org", type, name: "Parc de Jeanne Fictive", address_line1: "12 rue des Essais", postal_code: "69003", city: "Lyon", telephone: null, email_contact: "docs@exemple.invalid" });

// ——— Régularisation des charges ———

/** Douze mensualités de 8 € à partir de `premiere` (1er du mois). */
const etalement = (premiere: string) => Array.from({ length: 12 }, (_, k) => {
  const [a, m] = premiere.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + k, 1)).toISOString().slice(0, 10);
  return { rang: k + 1, echeance: d, montant: 8 };
});
const regularisation = (sur: Ligne = {}): Record<string, Ligne[]> => ({
  organizations: [organisation()],
  regularisations_charges: [{ ...o, id: "reg", bail_id: "b1", annee: 2024, provisions: 240, charges_reelles: 336, ecart: -96, tardive: true, etalement_12_mois: etalement("2026-12-01"), justificatif_document: "doc", note: null, date_emission: "2026-11-23", ...sur }],
});
const optionsCharges = { consultation: "Sur rendez-vous au 12 rue des Essais", detail_depenses: "Eau froide : 120 € ; entretien des parties communes : 216 €" };
const UN_MOIS = "Le décompte par nature de charges et le mode de répartition sont communiqués un mois avant la régularisation.";

describe("C77 — « un mois avant » n'est dit que si les dates du dossier le permettent", () => {
  it("unMoisApres suit la base (jour + interval '1 month') : fin de mois ramenée au dernier jour", () => {
    expect(unMoisApres("2026-11-23")).toBe("2026-12-23");
    expect(unMoisApres("2026-01-31")).toBe("2026-02-28");
    expect(unMoisApres("2028-01-31")).toBe("2028-02-29");
    expect(unMoisApres("2026-12-31")).toBe("2027-01-31");
  });
  it("delaiDecompteRespecte : sans étalement, oui ; première mensualité moins d'un mois après l'envoi, non", () => {
    expect(delaiDecompteRespecte(null, "2026-11-23")).toBe(true);
    expect(delaiDecompteRespecte([], "2026-11-23")).toBe(true);
    expect(delaiDecompteRespecte(etalement("2026-12-01"), "2026-11-23")).toBe(false);
    expect(delaiDecompteRespecte(etalement("2027-01-01"), "2026-11-23")).toBe(true);
    // Le même dossier, généré plus tard, ne permet plus de le dire.
    expect(delaiDecompteRespecte(etalement("2027-01-01"), "2026-12-15")).toBe(false);
    expect(delaiDecompteRespecte(etalement("2026-12-01"), "2026-11-01")).toBe(true);
  });
  it.each(["regularisation_charges", "decompte_charges", "consultation_charges"] as const)("%s : première mensualité le 01/12 pour un envoi le 23/11 → la phrase n'est pas imprimée", async (code) => {
    const texte = texteDe(succes(await assemblerComplementGestion(code, baseSimulee(regularisation()).client, "org", "reg", optionsCharges)).document.html);
    expect(texte).toContain("01/12/2026");
    expect(texte).not.toContain("un mois avant la régularisation");
    expect(texte).toContain("Les justificatifs restent à disposition pendant six mois à compter de l’envoi du décompte.");
  });
  it("première mensualité au 01/01 (règle de la migration) : la phrase est imprimée", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("regularisation_charges", baseSimulee(regularisation({ etalement_12_mois: etalement("2027-01-01") })).client, "org", "reg", optionsCharges)).document.html);
    expect(texte).toContain(UN_MOIS);
  });
  it("sans étalement (trop-perçu) : la phrase reste", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("regularisation_charges", baseSimulee(regularisation({ ecart: 64.6, tardive: false, etalement_12_mois: null })).client, "org", "reg", optionsCharges)).document.html);
    expect(texte).toContain(UN_MOIS);
  });
});

describe("C97 — justificatif : une pièce séparée, à joindre au courrier", () => {
  it.each(["regularisation_charges", "decompte_charges"] as const)("%s", async (code) => {
    const r = succes(await assemblerComplementGestion(code, baseSimulee(regularisation()).client, "org", "reg", optionsCharges));
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Justificatif : pièce enregistrée dans le dossier, à joindre au courrier.");
    expect(texte).not.toMatch(/annexé/);
    expect(r.document.manquants).toEqual([]);
  });
  it("sans justificatif, le document reste à compléter, comme avant", async () => {
    const r = succes(await assemblerComplementGestion("decompte_charges", baseSimulee(regularisation({ justificatif_document: null })).client, "org", "reg", optionsCharges));
    expect(r.document.manquants).toContain("décompte justificatif à déposer et joindre");
  });
});

// ——— Incidents et travaux ———

const DESCRIPTION_B = "Diagnostic : Radiateur du séjour sans chauffe ; thermostat intégré probablement défaillant.\n\nTravaux proposés : Diagnostic du radiateur et remplacement du thermostat intégré.\nThermostat de radiateur : 1 × 52.0000000000000000 € HT — TVA 10.0000000000000000 % — 57.2000000000000000 € TTC\n\nDurée estimée : Une heure";
function incidents(): Record<string, Ligne[]> {
  return {
    organizations: [organisation()],
    lots: [
      { ...o, id: "studio", nom: "Studio meublé n° 7", etage: "1er étage, porte 7", bien_id: "quai", meuble: true },
      { ...o, id: "t2", nom: "T2", etage: "2e étage, porte gauche", bien_id: "avenue", meuble: false },
    ],
    biens: [
      { ...o, id: "quai", address_line1: "5 quai des Essais", postal_code: "69007", city: "Lyon" },
      { ...o, id: "avenue", address_line1: "8 avenue des Essais", postal_code: "69003", city: "Lyon" },
    ],
    incidents: [
      { ...o, id: "incA", numero: "INC-2026-0001", lot_id: "t2", bien_id: null, description: "Fuite sous l'évier.", piece: "Cuisine", categorie: "plomberie_joint", etat: "clos", urgence: "normale", date_signalement: "2026-10-13", created_at: "2026-10-13T08:00:00+00:00", imputation: "proprietaire", imputation_justification: "Usure du joint.", clos_le: "2026-10-24T16:00:00+00:00", cloture_commentaire: "Fuite réparée." },
      { ...o, id: "incB", numero: "INC-2026-0002", lot_id: "studio", bien_id: null, description: "Le radiateur du séjour ne chauffe plus.", piece: "Séjour", categorie: "chauffage_panne", etat: "en_cours", urgence: "urgente", date_signalement: null, created_at: "2026-11-20T09:30:00+00:00", imputation: "proprietaire", imputation_justification: "Panne d'un équipement.", clos_le: null },
      { ...o, id: "incC", numero: "INC-2026-0004", lot_id: "t2", bien_id: null, description: "Volet bloqué.", piece: "Chambre", categorie: "autre", etat: "declare", urgence: "normale", date_signalement: "2026-11-22", created_at: "2026-11-22T10:00:00+00:00", imputation: null, clos_le: null },
    ],
    artisans: [
      { id: "art1", raison_sociale: "Plomberie Fictive", siret: "12345678901234", telephone: "0600000000", email: "plomberie@exemple.invalid" },
      { id: "art2", raison_sociale: "Dépannage Essai", siret: "98765432109876", telephone: "0611111111", email: "depannage@exemple.invalid" },
    ],
    incident_devis: [
      { ...o, id: "493045af-0000", incident_id: "incA", artisan_id: "art2", statut: "non_retenu", montant_ttc_cents: 26180, depose_le: "2026-10-16T10:10:00+00:00", retenu_le: null, valide_jusqu_au: "2026-11-15", description: "Remplacement du siphon et de la bonde." },
      { ...o, id: "72fd3643-0000", incident_id: "incA", artisan_id: "art1", statut: "retenu", montant_ttc_cents: 18700, depose_le: "2026-10-15T15:30:00+00:00", retenu_le: "2026-10-17T07:00:00+00:00", valide_jusqu_au: "2026-11-14", description: "Remplacement du siphon et des joints." },
      { ...o, id: "7ffd8cf9-2a06-4de4-993d-712e2ca6cf22", incident_id: "incB", artisan_id: "art1", statut: "retenu", montant_ttc_cents: 16170, depose_le: "2026-11-21T17:05:00+00:00", retenu_le: "2026-11-22T08:15:00+00:00", valide_jusqu_au: "2026-12-21", description: DESCRIPTION_B },
      { ...o, id: "devisC-0000", incident_id: "incC", artisan_id: "art2", statut: "depose", montant_ttc_cents: 9900, depose_le: "2026-11-22T12:00:00+00:00", retenu_le: null, valide_jusqu_au: "2026-12-22", description: "Déblocage du volet." },
    ],
    incident_interventions: [
      { ...o, id: "bcea412e", incident_id: "incA", devis_id: "72fd3643-0000", artisan_id: "art1", nature_travaux: "entretien_courant", statut: "terminee", confiee_le: "2026-10-17T07:00:00+00:00", debut_prevu: "2026-10-21T07:00:00+00:00", fin_prevue: "2026-10-21T09:00:00+00:00", terminee_le: "2026-10-21T08:50:00+00:00" },
      { ...o, id: "1eff086b", incident_id: "incB", devis_id: "7ffd8cf9-2a06-4de4-993d-712e2ca6cf22", artisan_id: "art1", nature_travaux: "entretien_courant", statut: "planifiee", confiee_le: "2026-11-22T08:15:00+00:00", debut_prevu: "2026-11-26T08:00:00+00:00", fin_prevue: "2026-11-26T10:00:00+00:00", terminee_le: null },
    ],
    intervention_comptes_rendus: [
      { ...o, intervention_id: "bcea412e", travaux_realises: "Siphon et joints remplacés.", cause_reelle: "Joint fendu.", montant_final_cents: 18700, nouvelle_intervention_necessaire: false, created_at: "2026-10-21T09:00:00+00:00" },
    ],
  };
}
const ordre = (tables = incidents(), cible = "1eff086b") =>
  assemblerComplementGestion("ordre_intervention", baseSimulee(tables).client, "org", cible, { acces: "Clé chez la gardienne." });

describe("C79 — le créneau de l'ordre d'intervention, à l'heure de Paris", () => {
  it("creneauParis : le jour et les heures de Paris (hiver, été), plusieurs jours, sans fin, jour seul", () => {
    // L'heure porte des espaces insécables (« 11 h » ne se coupe pas) : on les lit ici comme des espaces.
    const creneauParis = (debut: string, fin?: string | null) => creneauDuGabarit(debut, fin).replace(/\u00a0/g, " ");
    expect(creneauDuGabarit("2026-11-26T08:00:00+00:00", "2026-11-26T10:00:00+00:00")).toBe("le 26/11/2026 de 9\u00a0h à 11\u00a0h");
    expect(creneauParis("2026-11-26T08:00:00+00:00", "2026-11-26T10:00:00+00:00")).toBe("le 26/11/2026 de 9 h à 11 h");
    expect(creneauParis("2026-07-01T07:30:00Z", "2026-07-01T09:15:00Z")).toBe("le 01/07/2026 de 9 h 30 à 11 h 15");
    expect(creneauParis("2026-11-26T22:30:00Z", "2026-11-27T07:00:00Z")).toBe("du 26/11/2026 à 23 h 30 au 27/11/2026 à 8 h");
    expect(creneauParis("2026-11-26T08:00:00+00:00", null)).toBe("le 26/11/2026 à 9 h");
    expect(creneauParis("2026-11-26", "2026-11-26")).toBe("le 26/11/2026");
    // 23 h 30 UTC le 30/11 : déjà le 1er décembre à Paris.
    expect(creneauParis("2026-11-30T23:30:00Z", "2026-12-01T01:00:00Z")).toBe("le 01/12/2026 de 0 h 30 à 2 h");
  });
  it("l'ordre imprime « le 26/11/2026 de 9 h à 11 h »", async () => {
    const texte = texteDe(succes(await ordre()).document.html);
    expect(texte).toContain("Créneau prévu : le 26/11/2026 de 9 h à 11 h.");
    expect(texte).not.toContain("26/11/2026 au 26/11/2026");
  });
  it("un créneau incomplet laisse l'ordre à compléter, comme avant", async () => {
    const t = incidents();
    t.incident_interventions[1].fin_prevue = null;
    expect(succes(await ordre(t)).document.manquants).toContain("fin prévue");
  });
});

describe("C80 — l'ordre d'intervention dit les travaux commandés", () => {
  it("devis retenu : référence du PDF du devis, dates, montant TTC et travaux en clair", async () => {
    const r = succes(await ordre());
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Travaux commandés");
    expect(texte).toContain("Devis retenu DEV-7FFD8CF9, déposé le 21/11/2026 et retenu le 22/11/2026 ; montant TTC : 161,70 €.");
    expect(texte).toContain("Travaux proposés : Diagnostic du radiateur et remplacement du thermostat intégré.");
    expect(texte).toContain("Thermostat de radiateur : 1 × 52,00 € HT — TVA 10,00 % — 57,20 € TTC");
    expect(texte).not.toMatch(/\d\.\d{4,}/);
    // Le périmètre est posé avant la phrase qui interdit d'en sortir.
    expect(texte.indexOf("Devis retenu")).toBeLessThan(texte.indexOf("Aucun travail supplémentaire"));
    expect(r.document.manquants).toEqual([]);
  });
  it("mission sans devis : l'ordre le dit", async () => {
    const t = incidents();
    t.incident_interventions[1].devis_id = null;
    const texte = texteDe(succes(await ordre(t)).document.html);
    expect(texte).toContain("Aucun devis n’est rattaché à cette mission.");
    expect(texte).not.toContain("Devis retenu");
  });
});

describe("C86 — la phrase du comparatif suit l'état du dossier", () => {
  it("devis retenu : le comparatif le dit, avec la date", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("comparatif_devis", baseSimulee(incidents()).client, "org", "incA")).document.html);
    expect(texte).toContain("Comparaison des offres déposées. Le devis de Plomberie Fictive (187,00 € TTC) a été retenu le 17/10/2026 ; ce document ne commande aucune prestation.");
    expect(texte).not.toContain("soumis à la validation");
  });
  it("aucun devis retenu : « le choix reste à faire »", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("comparatif_devis", baseSimulee(incidents()).client, "org", "incC")).document.html);
    expect(texte).toContain("Comparaison des offres déposées. Le choix reste à faire ; ce document ne commande aucune prestation.");
    expect(texte).not.toContain("a été retenu");
  });
});

describe("C88 — le logement complet (étage, porte) dans les documents d'incident", () => {
  const STUDIO = "5 quai des Essais, 69007 Lyon, Studio meublé n° 7, 1er étage, porte 7";
  it("ordre d'intervention", async () => {
    expect(cartouche(succes(await ordre()).document.html, "Logement")).toBe(STUDIO);
  });
  it.each(["comparatif_devis", "recap_incident"] as const)("%s", async (code) => {
    expect(cartouche(succes(await assemblerComplementGestion(code, baseSimulee(incidents()).client, "org", "incB")).document.html, "Logement")).toBe(STUDIO);
  });
});

describe("C89 — le récapitulatif d'incident : signalement, urgence et suivi", () => {
  const recap = (cible: string) => assemblerComplementGestion("recap_incident", baseSimulee(incidents()).client, "org", cible);
  it("incident clos : date du signalement, urgence, devis retenu, mission terminée et montant du compte rendu", async () => {
    const html = succes(await recap("incA")).document.html, texte = texteDe(html);
    expect(texte).toContain("Signalé le 13/10/2026 ; urgence : Normale.");
    expect(texte).toContain("Suivi des travaux");
    expect(texte).toContain("Devis déposés : 2 ; devis retenu : Plomberie Fictive, 187,00 € TTC, le 17/10/2026.");
    expect(lignesDe(html)).toEqual([
      "Entreprise|Confiée le|Rendez-vous|Terminée le|État|Compte rendu",
      "Plomberie Fictive|17/10/2026|21/10/2026 de 9 h à 11 h|21/10/2026|Terminée|187,00 €",
    ]);
    expect(texte).toContain("Clôturé le 24/10/2026.");
  });
  it("incident en cours : date d'enregistrement à défaut de constat, urgence, rendez-vous à venir, compte rendu pas encore déposé", async () => {
    const html = succes(await recap("incB")).document.html, texte = texteDe(html);
    expect(texte).toContain("Signalé le 20/11/2026 ; urgence : Urgente.");
    expect(texte).toContain("Devis déposés : 1 ; devis retenu : Plomberie Fictive, 161,70 € TTC, le 22/11/2026.");
    expect(lignesDe(html)).toContain("Plomberie Fictive|22/11/2026|26/11/2026 de 9 h à 11 h|—|Planifiée|pas encore déposé");
  });
  it("aucune mission : le récapitulatif le dit ; un devis non retenu est compté", async () => {
    const texte = texteDe(succes(await recap("incC")).document.html);
    expect(texte).toContain("Devis déposés : 1 ; aucun n’est retenu.");
    expect(texte).toContain("Aucune mission confiée pour cet incident.");
  });
  it("le suivi n'est imprimé que par le récapitulatif", async () => {
    expect(texteDe(succes(await ordre()).document.html)).not.toContain("Signalé le");
  });
});

// ——— Comptabilité ———

describe("C91 — le journal porte le logement et la catégorie de chaque écriture", () => {
  const journal = () => ({
    ...incidents(),
    clotures_comptables: [{ ...o, mois: "2026-10-01", cloture_at: "2026-11-23T09:00:00+00:00" }],
    ecritures: [
      { ...o, id: "e1", lot_id: "studio", categorie: "loyer", libelle: "Encaissement de loyer", sens: "recette", montant: 585, date_imputation: "2026-10-02", date_piece: "2026-10-02" },
      { ...o, id: "e2", lot_id: "t2", categorie: "loyer", libelle: "Encaissement de loyer", sens: "recette", montant: 750, date_imputation: "2026-10-06", date_piece: "2026-10-06" },
      { ...o, id: "e3", lot_id: "t2", categorie: "Taxe foncière", libelle: "Taxe foncière de l'année", sens: "depense", montant: 820, date_imputation: "2026-10-15", date_piece: "2026-10-15" },
      { ...o, id: "e4", lot_id: "t2", categorie: "TEOM", libelle: "Taxe foncière de l'année", sens: "depense", montant: 160, date_imputation: "2026-10-15", date_piece: "2026-10-15" },
      { ...o, id: "e5", lot_id: null, categorie: "honoraires", libelle: "Frais de tenue de compte", sens: "depense", montant: 12, date_imputation: "2026-10-20", date_piece: "2026-10-20" },
    ],
  });
  it("deux écritures de même libellé se distinguent ; une écriture sans logement s'imprime « — »", async () => {
    const html = succes(await assemblerComplementGestion("cloture_mensuelle", baseSimulee(journal()).client, "org", "org", { mois: "2026-10" })).document.html;
    expect(lignesDe(html)).toEqual([
      "Date|Logement|Catégorie|Libellé|Sens|Montant",
      "02/10/2026|Studio meublé n° 7|Loyer|Encaissement de loyer|Recette|585,00 €",
      "06/10/2026|T2|Loyer|Encaissement de loyer|Recette|750,00 €",
      "15/10/2026|T2|Taxe foncière|Taxe foncière de l'année|Dépense|820,00 €",
      "15/10/2026|T2|TEOM|Taxe foncière de l'année|Dépense|160,00 €",
      "20/10/2026|—|Honoraires|Frais de tenue de compte|Dépense|12,00 €",
    ]);
    expect(texteDe(html)).toContain("Total recettes : 1 335,00 € ; dépenses : 992,00 €.");
  });
  it("le libellé de catégorie est celui de l'écran du livre", () => {
    expect(libelleCategorieEcriture("depot_garantie")).toBe("Dépôt de garantie");
    expect(libelleCategorieEcriture("Charges de copropriété")).toBe("Charges de copropriété");
    expect(libelleCategorieEcriture("frais_divers")).toBe("Frais divers");
  });
});

describe("C93 — la contre-écriture porte sa date d'imputation", () => {
  it("date de la pièce et date d'imputation, pour l'origine et la rectification", async () => {
    const t = {
      ...incidents(),
      ecritures: [
        { ...o, id: "orig", lot_id: "t2", categorie: "Assurance PNO", libelle: "Assurance propriétaire non occupant", sens: "depense", montant: 138, date_piece: "2026-02-10", date_imputation: "2026-02-10" },
        { ...o, id: "rect", lot_id: "t2", contre_ecriture_de: "orig", categorie: "Assurance PNO", libelle: "Contre-écriture : doublon", sens: "recette", montant: 138, date_piece: "2026-02-10", date_imputation: "2026-11-23", motif: "Doublon de saisie" },
      ],
    };
    const html = succes(await assemblerComplementGestion("ecriture_rectificative", baseSimulee(t).client, "org", "rect")).document.html;
    expect(lignesDe(html)).toEqual([
      "Pièce|Libellé|Sens|Montant|Date de la pièce|Imputée le",
      "Origine|Assurance propriétaire non occupant|Dépense|138,00 €|10/02/2026|10/02/2026",
      "Rectification|Contre-écriture : doublon|Recette|138,00 €|10/02/2026|23/11/2026",
    ]);
  });
});

// ——— Récapitulatifs fiscaux ———

/** Un lot nu au réel (espace d'agence : pas de profil fiscal des détenteurs), trois loyers ventilés, intérêts qualifiés en 250. */
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
const fiscalMeuble = (): Record<string, Ligne[]> => ({
  ...incidents(),
  ecritures: [
    { ...o, id: "m1", lot_id: "studio", categorie: "loyer", sens: "recette", montant: 585, date_piece: "2026-10-02" },
    { ...o, id: "m2", lot_id: "studio", categorie: "Taxe foncière", sens: "depense", montant: 315, date_piece: "2026-10-15" },
    { ...o, id: "m3", lot_id: "studio", categorie: "loyer", sens: "recette", montant: 585, date_piece: "2025-10-02" },
  ],
});

describe("C94 — une rubrique « à compléter » ne s'imprime jamais 0,00 €", () => {
  it("ligne 222 sans montant : « à compléter » ; les lignes réellement nulles gardent 0,00 €", async () => {
    const html = succes(await assemblerComplementGestion("recap_fiscal_nu", baseSimulee(fiscalNu()).client, "org", "t2", { annee: "2026", interets_emprunt: "" })).document.html;
    const lignes = lignesDe(html);
    expect(lignes).toContain("222|Autres frais de gestion : forfait à compléter|à compléter");
    expect(lignes).not.toContain("222|Autres frais de gestion : forfait à compléter|0,00 €");
    expect(lignes).toContain("221|Frais d’administration et de gestion|0,00 €");
    expect(lignes).toContain("211|Loyers bruts encaissés hors charges|2 070,00 €");
    expect(lignes).toContain("250|Intérêts d’emprunt|1 184,32 €");
  });
});

describe("C95 — un récapitulatif d'une année non terminée le dit", () => {
  it("mentionExerciceProvisoire : année en cours, année à venir, année passée", () => {
    expect(mentionExerciceProvisoire(2026, "2026-11-23")).toBe("<p>Exercice en cours — document provisoire.</p>");
    expect(mentionExerciceProvisoire(2027, "2026-11-23")).toBe("<p>Exercice non commencé — document provisoire.</p>");
    expect(mentionExerciceProvisoire(2025, "2026-11-23")).toBe("");
  });
  it.each([
    ["recap_fiscal_nu", "t2", fiscalNu],
    ["recap_fiscal_meuble", "studio", fiscalMeuble],
  ] as const)("%s 2026, établi le 23/11/2026 : « Exercice en cours — document provisoire »", async (code, lot, tables) => {
    const texte = texteDe(succes(await assemblerComplementGestion(code, baseSimulee(tables()).client, "org", lot, { annee: "2026", interets_emprunt: "" })).document.html);
    expect(texte).toContain("Exercice en cours — document provisoire.");
  });
  it("l'exercice 2025, terminé, n'en porte aucune", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("recap_fiscal_meuble", baseSimulee(fiscalMeuble()).client, "org", "studio", { annee: "2025" })).document.html);
    expect(texte).not.toContain("provisoire");
  });
});

describe("C96 — le récapitulatif meublé n'annonce plus une ventilation qu'il n'affiche pas", () => {
  it("un total des recettes, dit comme tel ; aucune « provision »", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("recap_fiscal_meuble", baseSimulee(fiscalMeuble()).client, "org", "studio", { annee: "2026" })).document.html);
    expect(texte).toContain("Recettes enregistrées : 585,00 € ; dépenses enregistrées : 315,00 €.");
    expect(texte).toContain("Les recettes sont reprises en total, sans ventilation entre loyer et charges.");
    expect(texte).not.toMatch(/ventilés|provisions/);
  });
  it("le récapitulatif nu garde la phrase qui décrit sa ventilation (lignes 211 et hors déclaration)", async () => {
    const texte = texteDe(succes(await assemblerComplementGestion("recap_fiscal_nu", baseSimulee(fiscalNu()).client, "org", "t2", { annee: "2026", interets_emprunt: "" })).document.html);
    expect(texte).toContain("Les loyers et provisions sont ventilés selon la capture faite à chaque encaissement");
  });
});
