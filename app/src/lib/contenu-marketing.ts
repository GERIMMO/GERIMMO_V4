export type SujetMarketing = {
  cle: string;
  titre: string;
  chapo: string;
  corps: string;
  facebook: string;
};

// Tous les faits ci-dessous décrivent des fonctions déjà présentes dans
// Gerimmo. Le moteur change l'angle, jamais la réalité du produit.
const SUJETS: SujetMarketing[] = [
  {
    cle: "incident-suivi",
    titre: "Un incident locatif suivi du signalement au compte rendu",
    chapo: "Gerimmo rassemble le signalement, les échanges, les rendez-vous et le compte rendu d’intervention dans un même suivi.",
    corps: "## Comprendre avant d’agir\n\nLe locataire décrit le problème depuis son espace. L’agence retrouve le logement concerné, qualifie la demande et garde les échanges dans le dossier.\n\n## Organiser l’intervention\n\nL’artisan reçoit les informations utiles, propose ses créneaux et dépose son compte rendu. L’avancement reste visible sans multiplier les appels et les messages dispersés.\n\n## Conserver une trace claire\n\nLes documents et décisions restent liés à l’incident. Chaque intervenant voit les informations qui lui sont utiles et l’agence conserve la vue d’ensemble jusqu’à la résolution.",
    facebook: "Un incident locatif ne devrait pas se perdre entre un appel, un message et un devis. Gerimmo relie le signalement, l’intervention et le compte rendu dans un suivi commun.",
  },
  {
    cle: "documents-locatifs",
    titre: "Retrouver les documents locatifs au bon endroit",
    chapo: "Baux, diagnostics, quittances et justificatifs restent rattachés aux dossiers auxquels ils appartiennent.",
    corps: "## Un document avec son contexte\n\nDans Gerimmo, les pièces sont liées au logement, au bail, à la personne ou à l’intervention concernés. L’utilisateur n’a pas à deviner dans quel dossier générique chercher.\n\n## Des accès adaptés\n\nL’agence pilote le dossier tandis que le locataire retrouve les documents qui le concernent depuis son espace. Les consultations sensibles peuvent être consignées dans les journaux de contrôle.\n\n## Moins de recherches répétées\n\nUne organisation documentaire claire réduit les demandes de renvoi et facilite la préparation des échéances du bail.",
    facebook: "Un document utile est un document que l’on retrouve au moment où l’on en a besoin. Gerimmo relie les pièces au logement, au bail et aux personnes concernés.",
  },
  {
    cle: "loyers-actions",
    titre: "Des loyers lisibles et des actions qui restent dans leur contexte",
    chapo: "Gerimmo rapproche les appels, encaissements, quittances et relances pour rendre le suivi des loyers plus compréhensible.",
    corps: "## Lire la situation du mois\n\nLe tableau des loyers présente les montants appelés, les règlements enregistrés et les situations qui demandent une action.\n\n## Garder la relation avec le bail\n\nChaque mouvement reste rattaché au bail concerné. La quittance et les échanges ne vivent pas dans des outils séparés du dossier locatif.\n\n## Faire remonter les priorités\n\nLes retards et échéances alimentent les alertes. L’agence peut ainsi commencer par les situations qui nécessitent réellement son attention.",
    facebook: "Appels de loyer, règlements, quittances et relances gagnent à rester reliés au bail. Gerimmo rend la situation du mois plus simple à lire et à traiter.",
  },
  {
    cle: "agenda-alertes",
    titre: "Un agenda locatif qui fait remonter les vraies priorités",
    chapo: "Échéances documentaires, actions en retard et rendez-vous sont regroupés pour limiter les oublis.",
    corps: "## Voir ce qui demande une action\n\nGerimmo transforme les échéances des dossiers en alertes lisibles. Les actions en retard, à venir ou à débloquer ne restent pas cachées dans une fiche.\n\n## Revenir directement au dossier\n\nUne alerte utile mène à l’objet concerné : bail, document, incident ou intervention. L’utilisateur conserve le contexte nécessaire pour décider.\n\n## Réduire les contrôles manuels\n\nL’agenda rassemble les rendez-vous et les échéances afin d’éviter de parcourir chaque logement pour vérifier ce qui approche.",
    facebook: "Une bonne alerte ne se contente pas de rappeler une date : elle mène au dossier et à l’action attendue. C’est le rôle de l’agenda Gerimmo.",
  },
  {
    cle: "espaces-personnalises",
    titre: "La bonne information pour chaque acteur de la location",
    chapo: "Agence, locataire et artisan disposent d’espaces conçus autour de leurs actions réelles.",
    corps: "## Une vue adaptée au rôle\n\nL’agence a besoin de piloter son parc et ses dossiers. Le locataire veut comprendre son logement, ses paiements, ses documents et ses demandes. L’artisan doit organiser ses interventions et rendre compte.\n\n## Une information partagée sans surcharge\n\nGerimmo part du même dossier fonctionnel mais adapte la présentation et les actions disponibles à chaque utilisateur.\n\n## Des échanges qui restent reliés\n\nLes messages et documents gardent leur contexte, ce qui limite les recherches et les ressaisies entre les différents acteurs.",
    facebook: "Agence, locataire et artisan n’ont pas les mêmes questions. Gerimmo présente à chacun les informations et les actions utiles à son rôle.",
  },
  {
    cle: "bail-structure",
    titre: "Un bail plus simple à préparer, suivre et relire",
    chapo: "Le dossier du bail réunit les parties, le logement, les clauses, les documents et les étapes de signature.",
    corps: "## Préparer avec les bonnes informations\n\nLe bail s’appuie sur les données du logement, du lot et des personnes concernées. Les champs nécessaires peuvent être contrôlés avant la génération du document.\n\n## Relire un document cohérent\n\nGerimmo produit le document à partir du dossier et conserve la version liée au bail. Les blocs sont organisés pour faciliter la lecture et l’impression.\n\n## Continuer après la signature\n\nLe bail reste le point de rattachement des loyers, quittances, documents et événements qui suivent pendant la location.",
    facebook: "Préparer un bail ne se résume pas à remplir un PDF. Gerimmo relie le document au logement, aux personnes et à tout le suivi de la location.",
  },
  {
    cle: "pilotage-agence",
    titre: "Commencer la journée par les dossiers qui demandent une décision",
    chapo: "Le tableau de bord Gerimmo rassemble les chiffres utiles et les éléments qui nécessitent réellement l’attention de l’agence.",
    corps: "## Une vue immédiate\n\nOccupation du parc, loyers, incidents et actions en attente apparaissent dès l’entrée dans l’espace agence.\n\n## Des chiffres qui mènent à l’action\n\nChaque indicateur ouvre la liste correspondante. L’utilisateur passe du constat au dossier sans reconstruire son chemin.\n\n## Un travail mieux ordonné\n\nLes urgences, retards et prochaines étapes sont distingués afin de traiter le plus important avant les tâches de suivi courant.",
    facebook: "Un tableau de bord est utile lorsqu’il aide à décider. Gerimmo fait remonter les dossiers qui nécessitent une action et permet d’y accéder directement.",
  },
  {
    cle: "comptabilite-contexte",
    titre: "Une comptabilité locative reliée aux biens et aux baux",
    chapo: "Les écritures gardent leur lien avec le dossier locatif afin de faciliter le contrôle et les exports.",
    corps: "## Garder l’origine du mouvement\n\nUne écriture locative devient plus facile à comprendre lorsqu’elle reste rattachée au bail, au lot et à l’opération qui l’a produite.\n\n## Contrôler avant d’exporter\n\nGerimmo permet de consulter les mouvements, de reprendre les données nécessaires et de préparer les exports sans perdre le contexte métier.\n\n## Rendre les écarts visibles\n\nLes états et les journaux aident à distinguer une donnée absente, une opération en attente et une erreur à corriger.",
    facebook: "La comptabilité locative est plus lisible lorsque chaque mouvement garde son lien avec le bail et le bien concernés. Gerimmo conserve ce contexte.",
  },
];

export function sujetMarketing(dateParis: Date, rangDuJour: number): SujetMarketing {
  const debut = Date.UTC(dateParis.getUTCFullYear(), 0, 1);
  const jour = Math.floor((Date.UTC(dateParis.getUTCFullYear(), dateParis.getUTCMonth(), dateParis.getUTCDate()) - debut) / 86_400_000);
  const semaine = Math.floor((jour + new Date(debut).getUTCDay()) / 7);
  return SUJETS[(semaine * 2 + rangDuJour) % SUJETS.length];
}
