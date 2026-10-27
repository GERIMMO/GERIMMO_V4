import { eur, formaterDate } from "@/lib/ged";
import { TYPES_BAIL } from "@/lib/baux";
import type { ValeursParcoursBail } from "@/lib/champs-etape-bail";
import { informationsLogementBail } from "@/lib/logement-bail-complements";
import { champsManquantsBail } from "@/lib/reperes-bail";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { dureeBailNuAnnees } from "@/lib/qualite-bailleur";

export type LigneRecapBail = { champ: string; libelle: string; valeur: string | null; href: string; facultatif?: boolean; aCorriger?: boolean };
export type RubriqueRecapBail = { id: string; titre: string; href: string; lignes: LigneRecapBail[]; erreur?: string };
const absent = (v: unknown) => v == null || String(v).trim() === "";
export const texteRecapBail = (v: unknown): string | null => absent(v) ? null : String(v);
export const montantRecapBail = (v: unknown): string | null => absent(v) || !Number.isFinite(Number(v)) ? null : eur(Number(v));
const date = (v: unknown) => absent(v) ? null : formaterDate(String(v));
const ouiNon = (v: unknown) => v === true ? "Oui" : v === false ? "Non" : null;

/** Durée imprimée au contrat (bail-nu.ts, art. 10 et 13 ; bail-meuble.ts, art. 25-7) : la même règle,
 * aucun calcul propre au récapitulatif (CB-10). */
export function dureeContratRecapBail(bail: ValeursParcoursBail, meubleLot: boolean, qualites: (string | null | undefined)[]): string | null {
  if (absent(bail.type)) return null;
  if (bail.type === "meuble" || (bail.type === "colocation" && meubleLot)) {
    return bail.meuble_etudiant === true ? "9 mois, sans reconduction tacite (bail étudiant)" : "1 an, avec reconduction tacite";
  }
  return `${dureeBailNuAnnees(qualites)} ans, avec reconduction tacite`;
}

/** La présentation ne décide pas des obligations : le contrôle du générateur et
 * les pièces attendues restent les sources des éléments à corriger. */
export function rubriquesRecapBail({ bail, lot, bien, personnes, liens, erreurLogement, erreurPersonnes, duree }: {
  bail: ValeursParcoursBail; lot: Record<string, unknown>; bien: Record<string, unknown>;
  personnes: { nom: string; role: string }[];
  liens: { lot: string; bien: string }; erreurLogement?: string; erreurPersonnes?: string;
  /** Durée du contrat et fin de sa première période, calculées par les règles du contrat et de la base. */
  duree?: { texte: string | null; finPremierePeriode: string | null };
}): RubriqueRecapBail[] {
  const ligne = (champ: string, libelle: string, valeur: string | null, facultatif = false): LigneRecapBail => ({ champ: `bail.${champ}`, libelle, valeur, facultatif, href: `#parcours-${champ}` });
  const texte = (champ: string, libelle: string, facultatif = false) => ligne(champ, libelle, texteRecapBail(bail[champ]), facultatif);
  const montant = (champ: string, libelle: string) => ligne(champ, libelle, montantRecapBail(bail[champ]));
  const choix = (champ: string, libelle: string, options: Record<string, string>) => ligne(champ, libelle, absent(bail[champ]) ? null : options[String(bail[champ])] ?? String(bail[champ]));
  const logement = informationsLogementBail(lot, bien);
  const informations = (nature: "logement" | "batiment", prefixe: "lot" | "bien") => logement[nature]
    .filter(l => l.etat !== "facultatif" || l.valeur !== null)
    .map(l => ({ champ: `${prefixe}.${l.champ}`, libelle: l.libelle, valeur: l.valeur, href: liens[prefixe], facultatif: l.etat === "facultatif", aCorriger: l.etat === "a_corriger" }));
  const clauses = [
    ligne("encadrement_loyer", "Loyers de référence applicables", ouiNon(bail.encadrement_loyer)),
    // Sans montant, le contrat imprime « Complément de loyer : néant » (mentions-location.ts) : rien à vérifier (CB-07).
    ...(bail.encadrement_loyer === true ? [montant("loyer_reference", "Loyer de référence / m²"), montant("loyer_reference_majore", "Loyer majoré / m²"), ligne("complement_loyer", "Complément de loyer", montantRecapBail(bail.complement_loyer) ?? "Néant", true), ...(bail.complement_justification ? [texte("complement_justification", "Justification du complément")] : [])] : []),
    ligne("servitude_residence_principale", "Servitude de résidence principale", ouiNon(bail.servitude_residence_principale)),
    ligne("clause_resolutoire_assurance", "Résiliation pour défaut d’assurance", ouiNon(bail.clause_resolutoire_assurance)),
    ligne("clause_resolutoire_troubles", "Résiliation pour troubles jugés", ouiNon(bail.clause_resolutoire_troubles)),
    ...(bail.servitude_residence_principale === true ? [ligne("clause_resolutoire_servitude", "Résiliation pour non-respect de la servitude", ouiNon(bail.clause_resolutoire_servitude))] : []),
    ...([ ["duree_reduite_evenement", "Motif de durée réduite"], ["travaux_recents", "Travaux récents"], ["travaux_locataire", "Travaux du locataire"], ["clauses_particulieres", "Clauses particulières"] ] as const).filter(([cle]) => !absent(bail[cle])).map(([cle, libelle]) => texte(cle, libelle)),
    ...(!absent(bail.travaux_recents_montant) ? [montant("travaux_recents_montant", "Montant des travaux")] : []),
  ];
  return [
    { id: "bail", titre: "Le contrat", href: "#etape-bail-1", lignes: [
      ligne("type", "Type de bail", bail.chambre_id ? "Colocation · contrat individuel" : TYPES_BAIL[String(bail.type)] ?? texteRecapBail(bail.type)),
      ligne("date_debut", "Date d’entrée", date(bail.date_debut)), ligne("date_conclusion_prevue", "Conclusion prévue", date(bail.date_conclusion_prevue)),
      ...(bail.meuble_etudiant === true ? [ligne("meuble_etudiant", "Bail étudiant", "9 mois")] : []),
      ...(duree?.texte ? [{ ...ligne("type", "Durée du contrat", duree.texte, true), champ: "duree_calculee" }] : []),
      ...(duree?.finPremierePeriode ? [{ ...ligne("date_debut", "Fin de la première période", formaterDate(duree.finPremierePeriode), true), champ: "fin_calculee" }] : []),
    ] },
    { id: "personnes", titre: "Propriétaires, locataires et garants", href: "#etape-bail-2", erreur: erreurPersonnes, lignes: [
      ...personnes.map((p, index) => ({ champ: `personne-${index}`, libelle: p.role, valeur: p.nom, href: /propriétaire/i.test(p.role) ? "#titre-proprietaires-bail" : /garant/i.test(p.role) ? "#titre-garants-bail" : "#titre-locataires-bail" })),
      // Sans locataire choisi, la rubrique le dit au lieu d’annoncer ses seules lignes enregistrées (CB-13).
      ...(absent(bail.locataire_principal) ? [{ champ: "locataire_principal", libelle: "Locataire principal", valeur: null, href: "#titre-locataires-bail" }] : []),
    ] },
    { id: "logement", titre: "Le logement", href: liens.lot, erreur: erreurLogement, lignes: informations("logement", "lot") },
    { id: "batiment", titre: "Le bâtiment", href: liens.bien, erreur: erreurLogement, lignes: informations("batiment", "bien") },
    { id: "loyer", titre: "Loyer et paiement", href: "#etape-bail-4", lignes: [
      montant("loyer_hc", "Loyer hors charges"), montant("charges", "Charges"),
      { ...ligne("loyer_hc", "Total mensuel", montantRecapBail(bail.loyer_hc) !== null && montantRecapBail(bail.charges) !== null ? eur(Number(bail.loyer_hc) + Number(bail.charges)) : null), champ: "total_calcule", facultatif: true },
      montant("depot_garantie", "Dépôt de garantie"), choix("charges_mode", "Mode de charges", { forfait: "Forfait", provision: "Provision avec régularisation" }),
      ligne("jour_echeance", "Échéance mensuelle", absent(bail.jour_echeance) ? null : `Le ${bail.jour_echeance} de chaque mois`),
      choix("paiement_echeance", "Paiement", { echoir: "À échoir", echu: "À terme échu" }), texte("lieu_paiement", "Lieu de paiement"),
      ligne("revision_irl", "Révision annuelle", ouiNon(bail.revision_irl)),
      ...(bail.revision_irl === true ? [texte("irl_trimestre", "Trimestre IRL"), texte("irl_valeur", "Indice IRL")] : []),
      choix("fixation_loyer", "Fixation du loyer", { libre: "Libre", plafonnement: "Plafonnement", reevaluation: "Réévaluation" }),
      choix("precedente_location", "Précédente location", { premiere: "Première location", ancienne: "Départ depuis au moins 18 mois", recente: "Départ depuis moins de 18 mois" }),
      ...(bail.precedente_location === "recente" ? [montant("dernier_loyer", "Précédent loyer"), ligne("dernier_loyer_versement", "Dernier versement", date(bail.dernier_loyer_versement)), ligne("precedent_loyer_revise", "Précédent loyer révisé", ouiNon(bail.precedent_loyer_revise)), ...(bail.precedent_loyer_revise === true ? [ligne("dernier_loyer_revision", "Dernière révision", date(bail.dernier_loyer_revision))] : [])] : []),
      ...([ ["honoraires_bailleur", "Honoraires bailleur"], ["honoraires_locataire", "Honoraires locataire"], ["honoraires_edl_bailleur", "État des lieux · bailleur"], ["honoraires_edl_locataire", "État des lieux · locataire"] ] as const).filter(([cle]) => !absent(bail[cle])).map(([cle, libelle]) => montant(cle, libelle)),
    ] },
    { id: "documents", titre: "Dépenses d’énergie", href: "#complements-energie", lignes: [montant("dpe_depenses_min", "Estimation annuelle minimale"), montant("dpe_depenses_max", "Estimation annuelle maximale"), texte("dpe_annees_reference", "Années des prix de référence")] },
    { id: "clauses", titre: "Conditions du bail", href: "#etape-bail-6", lignes: clauses },
  ];
}

export function correctionsRecapBail(manquants: string[], rubriques: RubriqueRecapBail[], orgId: string, racine: string) {
  const corrections = [...new Set(manquants)].map(mention => {
    if (/^jj\/mm\/aaaa$/i.test(mention)) return { mention, libelle: "Date de naissance du locataire", ...cibleChampBail(mention, orgId, racine) };
    const champs = champsManquantsBail([mention]);
    const lignes = rubriques.flatMap(r => r.lignes).filter(l => champs.has(l.champ) && (l.valeur === null || l.aCorriger));
    // L’étape suit le champ réellement vide : « loyer + charges » sans date d’entrée vise la date, pas le loyer.
    const cible = cibleChampBail(lignes[0]?.champ.startsWith("bail.") ? lignes[0].champ : mention, orgId, racine);
    const libelle = lignes.length ? [...new Set(lignes.map(l => l.libelle))].join(" et ") : LIBELLES_MENTIONS[mention] ?? mention;
    return { mention, libelle, etape: cible.etape, href: lignes[0]?.href ?? cible.href };
  });
  // Sans locataire choisi, ses identité, naissance et adresse ne sont qu’une seule action (CB-09).
  const sansLocataire = rubriques.some(r => r.lignes.some(l => l.champ === "locataire_principal" && l.valeur === null));
  const locataire = corrections.filter(c => c.href === "#titre-locataires-bail");
  const regroupees = sansLocataire && locataire.length > 1
    ? corrections.filter(c => c.href !== "#titre-locataires-bail" || c === locataire[0]).map(c => c === locataire[0] ? { ...c, libelle: "Choisir le locataire principal" } : c)
    : corrections;
  return regroupees.filter((c, i) => regroupees.findIndex(autre => autre.href === c.href && autre.libelle === c.libelle) === i);
}
/** Libellés lisibles des mentions du contrat qui ne correspondent à aucune ligne du récapitulatif (CB-04, CB-09). */
const LIBELLES_MENTIONS: Record<string, string> = {
  "jj/mm/aaaa": "Date de naissance du locataire", "nombre": "Nombre de pièces", "en m²": "Surface habitable",
  "personne physique, indivision, SCI familiale, SCI, personne morale": "Qualité du propriétaire",
  "personne physique, SCI, indivision…": "Qualité du propriétaire",
  "nom et prénom(s)": "Identité du locataire", "nom et prénom(s) du ou des locataires": "Identité du locataire",
  "nom et prénom(s), ou dénomination": "Identité du propriétaire", "adresse électronique": "Adresse e-mail des parties",
  "commune de naissance": "Commune de naissance du locataire", "adresse actuelle": "Adresse du locataire",
  "domicile ou siège social": "Adresse du propriétaire",
  "adresse de l’organisation (profil)": "Adresse de votre profil (en-tête du contrat)",
  "adresse du mandataire": "Adresse de votre profil (en-tête du contrat)",
  "adresse électronique de l’organisation (profil)": "E-mail de votre profil (en-tête du contrat)",
  "commune": "Ville de votre profil (lieu de signature)",
  "inventaire du mobilier — au moins les 11 éléments du décret": "Inventaire du mobilier",
  "classe DPE du logement": "Classe énergie du DPE",
  "équipements du logement": "Équipements du logement",
};
