import { RACINE_AGENCE, RACINE_PROPRIETAIRE } from "@/lib/racine-espace";
import type { EmetteurEnTete } from "@/lib/documents/gabarit";
import { DEBUT_MANQUE_JUSTIFICATIF_RETENUE } from "@/lib/justificatif-retenue";
// Où renseigner un champ resté en libellé dans un PDF généré (chantier
// documentaire 08/09, refondu à l'audit du 09/09) : chaque « manquant »
// pointe l'écran où la donnée se saisit — Gerimmo sait où vit chaque
// information. Les listes précédentes avaient été écrites sans confronter
// les libellés réels des modèles : la moitié ne matchait rien, « commune de
// naissance » partait au profil de l'organisation. Les règles ci-dessous
// couvrent les libellés effectivement employés par les 9 modèles, dans
// l'ordre — la première qui matche gagne. Un même libellé peut servir deux
// blocs (l'en-tête de l'organisation ET une partie du bail) : le modèle
// départage.

export type LienManquant = { href: string; ecran: string };
/** Phase 3, lot 46 (reprise, T21) : la demande d'attestation d'assurance d'une attestation rattachée à aucune personne. */
export const MANQUE_LOCATAIRE_ATTESTATION = "locataire concerné, à rattacher à l’attestation dans Documents";
type Liens = { entite: "bail" | "personne" | "lot" | "mandat"; entiteId: string }[];
type Cible = "organisation" | "personne" | "lot" | "bail" | "complements" | "plan";

// Pour un lot : la section de sa fiche (`vers`) et, pour les caractéristiques
// saisies dans « Modifier le lot », l'ouverture directe du formulaire.
type Regle = { motifs: string[]; cible: Cible; cibleBail?: Cible; section?: string; modifier?: boolean };
const CARACTERISTIQUES: Regle = { motifs: [], cible: "lot", section: "caracteristiques", modifier: true };

const REGLES: Regle[] = [
  { motifs: ["chambre", "surface privative", "volume privatif", "espaces partagés", "équipements privatifs", "loyer maximum du logement entier"], cible: "lot", section: "chambres" },
  { motifs: ["libre, plafonnement", "dépenses annuelles", "prix de l’énergie", "date prévue de conclusion", "servitude de résidence", "application des loyers de référence", "plafond de location", "plafond état des lieux", "honoraires état des lieux", "honoraires visite", "date du dernier versement", "date de dernière révision"], cible: "complements" },
  { motifs: ["classe dpe du logement"], cible: "lot", section: "diagnostics" },
  // L'état civil du locataire (bail) — avant « commune » tout court (faitA)
  {
    motifs: ["commune de naissance", "adresse actuelle", "nom et prénom(s) du ou des locataires"],
    cible: "personne",
  },
  // L'identité du bailleur : le nom de l'organisation n'est jamais vide, donc
  // ce libellé ne peut venir que du bloc bailleur — les détenteurs se
  // renseignent sur la fiche du lot (détentions du bien)
  // Phase 3, lot 48 (U06) : la qualité du bailleur du bail nu (« personne physique, indivision, SCI familiale, … ») n'avait aucun
  // lien, « personne physique, sci » ne couvrant que le libellé du bail meublé.
  { motifs: ["ou dénomination", "personne physique, sci", "personne physique, indivision"], cible: "lot", section: "detention" },
  // Phase 3 (C50, C72) : le compte qui reçoit les loyers est l'IBAN du profil de l'espace (celui des avis d'échéance) —
  // avant la règle des conditions financières du bail, dont le motif « iban » enverrait à la fiche du bail.
  { motifs: ["coordonnées bancaires"], cible: "organisation" },
  // Phase 3 (C65) : un protocole d'apurement reprend un plan enregistré dans la section « Plan d'apurement » du bail.
  { motifs: ["plan d’apurement"], cible: "plan" },
  // Les conditions financières et clauses du contrat
  {
    motifs: [
      "dernier loyer",
      "honoraires",
      "loyer de référence",
      "loyer + charges",
      "à échoir ou échu",
      "jour du mois",
      "trimestre",
      "valeur de l'indice",
      "rapport des indices",
      "montant mensuel",
      "montant inchangé",
      "total du terme",
      "durée applicable",
      "durée réduite",
      "montant convenu",
      "provisions avec régularisation",
      "iban",
      "virement",
      "domicile du bailleur",
      "clauses librement convenues",
      "référence du bail",
      // Phase 3, lot 46 (reprise, T21) : le second colocataire d'un contrat commun et les clés d'un état des lieux en
      // préparation (bordereau de remise) se complètent depuis la fiche du bail (carte Colocation, état des lieux).
      "nom du colocataire",
      "à enregistrer dans l’état des lieux",
    ],
    cible: "bail",
  },
  // Le logement lui-même — ses équipements (case à cocher sur la fiche), ce
  // qui se saisit dans « Modifier le lot », et ce qui appartient au BIEN
  // (adresse, régime, année, parties communes, accès internet).
  { motifs: ["cuisine équipée", "équipements du logement"], cible: "lot", section: "equipements" },
  {
    motifs: [
      "en m²",
      "identifiant fiscal",
      "le cas échéant",
      "cave, grenier",
      "cuisine équipée",
      "équipements du logement",
      "autres parties du logement",
      "individuel ou collectif",
      "chauffage du logement",
      "eau chaude du logement",
      "cave, parking",
      "locaux privatifs du logement",
    ],
    cible: "lot",
    section: "caracteristiques",
    modifier: true,
  },
  {
    motifs: ["adresse complète", "immeuble collectif", "monopropriété", "avant 1949", "hall, ascenseur", "fibre"],
    cible: "lot",
    section: "bien",
  },
  // L'identité professionnelle de l'émetteur (bail, mandat de gestion)
  {
    motifs: ["carte et cci", "garantie financière", "siret", "adresse du mandataire"],
    cible: "organisation",
  },
  // Les annexes et échéances du bail (meublé, congé)
  // La fin d'un bail en préavis vient du congé, enregistré sur la fiche du bail (phase 3, C60 et C61).
  { motifs: ["inventaire du mobilier", "date d'échéance du bail", "date de fin du contrat"], cible: "bail" },
  // L'en-tête de l'émetteur — sur un bail, « adresse électronique » désigne
  // surtout les parties. Le téléphone, lui, ne remonte plus : expressément
  // facultatif au contrat type, il s'imprime « — » (brique `facultatif`) au
  // lieu d'envoyer l'utilisateur renseigner un champ nommé « facultatif ».
  { motifs: ["siège social"], cible: "organisation" },
  { motifs: ["adresse électronique"], cible: "organisation", cibleBail: "personne" },
  { motifs: ["commune"], cible: "organisation" },
  // La date par défaut : sur un bail, c'est la date de naissance du locataire
  { motifs: ["jj/mm/aaaa"], cible: "bail", cibleBail: "personne" },
];

// Les documents d'un dossier (lot, incident) dont l'en-tête reste celui de l'espace, même chez un propriétaire qui gère
// lui-même (catalogue-gestion) : documents internes et comptables. Repli quand l'origine de l'en-tête n'est pas transmise.
const MODELES_EN_TETE_ESPACE = new Set(["comparatif_devis", "recap_incident", "recap_fiscal_nu", "recap_fiscal_meuble", "ecriture_rectificative", "cloture_mensuelle"]);
// Phase 3, lot 46 (second passage, T19) : les contrats et l'acte de cautionnement désignent AUSSI le bailleur dans leur corps,
// sous le même libellé que l'en-tête (« Domicile ou siège social : … »). Chez un propriétaire qui gère lui-même, leur en-tête
// n'est celui de l'espace que si le lot n'a aucun détenteur (expediteur) : le corps n'a alors aucun bailleur à désigner, et
// compléter le profil de l'espace ne débloque pas le PDF. Le détenteur s'ajoute sur la fiche du lot (détention, comme
// « ou dénomination ») ; l'en-tête devient alors le sien.
const MODELES_BAILLEUR_AU_CORPS = new Set(["bail_nu", "bail_meuble", "bail_colocation", "bail_individuel", "cautionnement"]);
const DETENTION: Regle = { motifs: [], cible: "lot", section: "detention" };
// Le nom du bailleur au corps d'un contrat ou d'un acte : vide, le lot n'a aucun détenteur (reprise du lot 48).
const NOM_BAILLEUR = "nom et prénom(s), ou dénomination";
const MODELES_CONTRAT = new Set(["bail_nu", "bail_meuble", "bail_colocation", "bail_individuel"]);

export function lienPourManquant(
  libelle: string,
  orgId: string,
  liens: Liens,
  modele?: string,
  /** « /espace » pour le propriétaire direct, « /agence » par défaut (décision D27, lib/racine-espace.ts). */
  racine: string = RACINE_AGENCE,
  /** L'origine de l'en-tête effectivement imprimé (document assemblé, lot 46) ; absente, elle est déduite des liens et du modèle. */
  emetteur?: EmetteurEnTete,
  /** Les manquants vides dans l'en-tête seulement (document assemblé, lot 48) ; absente, un libellé est réputé manquer au corps. */
  seulementEnTete?: readonly string[],
  /** Les manquants vides dans le bloc du bailleur d'un contrat ou d'un acte (document assemblé, reprise du lot 48). */
  videsBailleur?: readonly string[]
): LienManquant | null {
  const base = `${racine}/${orgId}`;
  const l = libelle.toLowerCase();
  const bail = liens.find((x) => x.entite === "bail");
  const personne = liens.find((x) => x.entite === "personne");
  const lot = liens.find((x) => x.entite === "lot");

  const vers = (cible: Cible, regle?: Regle): LienManquant | null => {
    switch (cible) {
      case "organisation":
        return { href: `${base}/profil`, ecran: "profil de l'organisation" };
      case "personne":
        if (personne)
          return { href: `${base}/personnes/${personne.entiteId}`, ecran: "fiche de la personne" };
        break;
      case "lot":
        // La fiche complète, par le renvoi `/lots/[lotId]` (le bien n'est pas
        // connu ici) : section demandée, formulaire ouvert s'il y a lieu.
        if (lot) {
          const section = regle?.section ?? "caracteristiques";
          const requete = `${regle?.modifier ? "modifier=1&" : ""}vers=${section}`;
          return {
            href: `${base}/lots/${lot.entiteId}?${requete}`,
            ecran: section === "bien" ? "fiche du bien" : "fiche du lot",
          };
        }
        break;
      case "complements":
        if (bail) return { href: `${base}/baux/${bail.entiteId}#complements`, ecran: "compléments du contrat" };
        break;
      case "plan":
        if (bail) return { href: `${base}/baux/${bail.entiteId}#plan-apurement`, ecran: "plan d’apurement du bail" };
        break;
      case "bail":
        break;
    }
    if (bail) return { href: `${base}/baux/${bail.entiteId}`, ecran: "fiche du bail" };
    return null;
  };

  // Décision du 24/11/2026 (Q49) : le justificatif d'une retenue se dépose dans la restitution du dépôt, sur la fiche du bail
  // (les deux décomptes y renvoient ; le repli « fiche du bail » n'ouvrait pas la bonne rubrique).
  if (l.startsWith(DEBUT_MANQUE_JUSTIFICATIF_RETENUE) && bail) return { href: `${base}/baux/${bail.entiteId}#restitution`, ecran: "restitution du dépôt de garantie" };

  // D39 : le détail des dépenses d'une régularisation se saisit dans le formulaire de génération lui-même. Aucun écran du dossier ne le porte :
  // l'envoyer à la fiche du bail (repli ci-dessous) ferait chercher un champ qui n'y existe pas.
  if (l.includes("détail des dépenses par nature")) return null;
  // Congé du bailleur (audit palier 1, P0-08) : le bénéficiaire d'une reprise, son lien, son adresse, les raisons et le
  // motif invoqué — et, lot T1, les conditions de la vente — se saisissent dans le formulaire du congé lui-même. Le repli « fiche de la personne » enverrait
  // chercher l'adresse du bénéficiaire sur la fiche du LOCATAIRE.
  if (modele === "conge_bailleur" && ["bénéficiaire de la reprise", "lien avec le bailleur", "raisons de la reprise", "motif invoqué", "conditions de la vente"].some((m) => l.includes(m))) return null;

  // Reprise du lot 37 : chez un propriétaire qui gère lui-même, l'en-tête d'un document du bail (et de l'ordre ou du compte
  // rendu d'une intervention) est celui des détenteurs du lot (`expediteur`) : son adresse et sa commune se complètent sur la
  // fiche du propriétaire, dans Personnes. Le profil de l'espace, où ces deux libellés envoyaient, n'est pas lu par ces
  // documents : on le complétait sans que le PDF se débloque. Les documents de gestion propres à l'espace (journal,
  // récapitulatifs, comparatif) gardent l'en-tête de l'espace, et donc son profil.
  // Phase 3, lot 46 (T19) : la règle suit l'en-tête que le document a réellement imprimé (`emetteur`), plus une déduction des
  // liens et du modèle. L'ordre et le compte rendu d'un incident des parties communes (aucun lien : l'immeuble n'en a pas) sont
  // émis par les détenteurs des logements de l'immeuble et renvoyaient au profil de l'espace ; un document d'un lot sans
  // détenteur garde l'en-tête de l'espace et renvoyait à la fiche du propriétaire.
  const enTeteDesDetenteurs = emetteur ? emetteur === "detenteurs" : Boolean(bail || lot) && !MODELES_EN_TETE_ESPACE.has(modele ?? "");
  // Reprise du lot 48 (U04, U06) : le document dit où le libellé est resté vide. Vide dans le BLOC DU BAILLEUR d'un contrat ou
  // d'un acte (`videsBailleur`), il se complète sur l'écran du détenteur du lot, dans les deux types d'espace : la détention du
  // lot quand il n'y en a aucun (son nom est alors vide aussi, et tout le bloc y mène), sa fiche dans Personnes sinon — c'est
  // là que se corrigent sa qualité, son adresse et son adresse électronique ; la détention ne demande la qualité que d'un
  // NOUVEAU propriétaire. Ces libellés menaient à la fiche du locataire, déjà complète (adresse électronique), à la liste
  // Personnes pour un lot sans détenteur (agence), ou à la détention d'un lot déjà détenu (qualité).
  if (MODELES_BAILLEUR_AU_CORPS.has(modele ?? "") && videsBailleur?.includes(libelle)) {
    if (videsBailleur.includes(NOM_BAILLEUR)) return vers("lot", DETENTION);
    return { href: `${base}/personnes`, ecran: "fiche du propriétaire, dans Personnes" };
  }
  // Reprise du lot 48 (U04) : l'adresse ou l'adresse électronique vide dans l'en-tête SEULEMENT, quand cet en-tête est celui de
  // l'espace (agence, ou propriétaire sans détenteur) : le profil de l'espace, où elles se saisissent. En agence, l'adresse
  // électronique de l'agence menait à la fiche du locataire. (Les autres champs de l'en-tête, référence et date, ne viennent
  // pas du profil : ils gardent leurs règles.)
  if (emetteur === "espace" && (l === "domicile ou siège social" || l === "adresse électronique") && seulementEnTete?.includes(libelle)) {
    return vers("organisation");
  }
  // Phase 3, lot 48 (U06) : le contrat d'un lot sans détenteur laisse vide tout le bloc du bailleur ; son adresse électronique
  // (« adresse électronique », qui menait à la fiche du bail ou du locataire) se complète aussi en ajoutant le détenteur.
  // Reprise du lot 48 : cette règle et la suivante ne jouent plus que sans `videsBailleur` (état calculé avant la reprise).
  if (racine === RACINE_PROPRIETAIRE && emetteur === "espace" && MODELES_BAILLEUR_AU_CORPS.has(modele ?? "") &&
      (l === "domicile ou siège social" || (MODELES_CONTRAT.has(modele ?? "") && l === "adresse électronique"))) {
    return vers("lot", DETENTION);
  }
  // Reprise du lot 46 (T19) : dans un espace d'agence, l'en-tête est toujours celui de l'agence, et son adresse manquante est
  // AUSSI signalée au corps, sous « adresse du mandataire » (profil). « Domicile ou siège social » y désigne donc le bailleur du
  // corps, c'est-à-dire le propriétaire mandant (détenteur du lot) : il menait au profil de l'agence, déjà complet, et le PDF
  // restait bloqué. Sa fiche est dans Personnes ; un lot sans détenteur signale en outre « ou dénomination » (détention).
  // Phase 3, lot 48 (U04) : quand c'est seulement l'adresse de l'agence qui manque (en-tête), le libellé mène au profil, où
  // elle se saisit. Si l'adresse du mandant manque aussi, il mène à sa fiche ; celle de l'agence reste signalée sous
  // « adresse du mandataire » (profil).
  if (racine !== RACINE_PROPRIETAIRE && MODELES_BAILLEUR_AU_CORPS.has(modele ?? "") && l === "domicile ou siège social") {
    if (seulementEnTete?.includes(libelle)) return vers("organisation");
    return { href: `${base}/personnes`, ecran: "fiche du propriétaire, dans Personnes" };
  }
  // Reprise du lot 46 (T21) : un contrat sans locataire principal est incomplet (« nom et prénom(s) », libellé du bloc du
  // locataire) ; il se désigne sur la fiche du bail.
  if (MODELES_CONTRAT.has(modele ?? "") && l === "nom et prénom(s)") return vers("bail");
  // Phase 3, lot 48 (U05) : même règle pour la liste des pièces, qui ne signale ce libellé que sans locataire principal ; il
  // menait à la fiche d'un colocataire, où le principal ne se désigne pas.
  if (modele === "liste_dossier" && l === "nom et prénom(s) du ou des locataires") return vers("bail");
  // Reprise du lot 46 (T21) : une attestation d'assurance sans personne se rattache depuis Documents (« Rattacher à une autre
  // fiche » de la pièce).
  if (modele === "rappel_assurance" && libelle === MANQUE_LOCATAIRE_ATTESTATION) return { href: `${base}/documents`, ecran: "Documents" };
  if (racine === RACINE_PROPRIETAIRE && enTeteDesDetenteurs && (l === "domicile ou siège social" || l === "commune")) {
    return { href: `${base}/personnes`, ecran: "fiche du propriétaire, dans Personnes" };
  }

  // « nombre » (pièces principales du bail type) est un libellé d'un seul mot :
  // en fragment il matcherait trop large, on le prend en égalité stricte
  if (l === "nombre") return vers("lot", CARACTERISTIQUES);

  for (const r of REGLES) {
    if (r.motifs.some((m) => l.includes(m))) {
      return vers(["bail_nu", "bail_meuble", "bail_colocation", "bail_individuel"].includes(modele ?? "") && r.cibleBail ? r.cibleBail : r.cible, r);
    }
  }
  if (personne) {
    return { href: `${base}/personnes/${personne.entiteId}`, ecran: "fiche de la personne" };
  }
  return null;
}
