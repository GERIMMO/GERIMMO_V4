export type SujetMarketing = {
  cle: string;
  audience: "particuliers" | "locataires" | "professionnels" | "artisans";
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
    audience: "professionnels",
    titre: "Un incident locatif suivi du signalement au compte rendu",
    chapo: "Gerimmo rassemble le signalement, les échanges, les rendez-vous et le compte rendu d’intervention dans un même suivi.",
    corps: "## Comprendre avant d’agir\n\nLe locataire décrit le problème depuis son espace. L’agence retrouve le logement concerné, qualifie la demande et garde les échanges dans le dossier.\n\n## Organiser l’intervention\n\nL’artisan reçoit les informations utiles, propose ses créneaux et dépose son compte rendu. L’avancement reste visible sans multiplier les appels et les messages dispersés.\n\n## Conserver une trace claire\n\nLes documents et décisions restent liés à l’incident. Chaque intervenant voit les informations qui lui sont utiles et l’agence conserve la vue d’ensemble jusqu’à la résolution.",
    facebook: "Un incident locatif ne devrait pas se perdre entre un appel, un message et un devis. Gerimmo relie le signalement, l’intervention et le compte rendu dans un suivi commun.",
  },
  {
    cle: "documents-locatifs",
    audience: "particuliers",
    titre: "Retrouver les documents locatifs au bon endroit",
    chapo: "Baux, diagnostics, quittances et justificatifs restent rattachés aux dossiers auxquels ils appartiennent.",
    corps: "## Un document avec son contexte\n\nDans Gerimmo, les pièces sont liées au logement, au bail, à la personne ou à l’intervention concernés. L’utilisateur n’a pas à deviner dans quel dossier générique chercher.\n\n## Des accès adaptés\n\nL’agence pilote le dossier tandis que le locataire retrouve les documents qui le concernent depuis son espace. Les consultations sensibles peuvent être consignées dans les journaux de contrôle.\n\n## Moins de recherches répétées\n\nUne organisation documentaire claire réduit les demandes de renvoi et facilite la préparation des échéances du bail.",
    facebook: "Un document utile est un document que l’on retrouve au moment où l’on en a besoin. Gerimmo relie les pièces au logement, au bail et aux personnes concernés.",
  },
  {
    cle: "loyers-actions",
    audience: "professionnels",
    titre: "Des loyers lisibles et des actions qui restent dans leur contexte",
    chapo: "Gerimmo rapproche les appels, encaissements, quittances et relances pour rendre le suivi des loyers plus compréhensible.",
    corps: "## Lire la situation du mois\n\nLe tableau des loyers présente les montants appelés, les règlements enregistrés et les situations qui demandent une action.\n\n## Garder la relation avec le bail\n\nChaque mouvement reste rattaché au bail concerné. La quittance et les échanges ne vivent pas dans des outils séparés du dossier locatif.\n\n## Faire remonter les priorités\n\nLes retards et échéances alimentent les alertes. L’agence peut ainsi commencer par les situations qui nécessitent réellement son attention.",
    facebook: "Appels de loyer, règlements, quittances et relances gagnent à rester reliés au bail. Gerimmo rend la situation du mois plus simple à lire et à traiter.",
  },
  {
    cle: "agenda-alertes",
    audience: "professionnels",
    titre: "Un agenda locatif qui fait remonter les vraies priorités",
    chapo: "Échéances documentaires, actions en retard et rendez-vous sont regroupés pour limiter les oublis.",
    corps: "## Voir ce qui demande une action\n\nGerimmo transforme les échéances des dossiers en alertes lisibles. Les actions en retard, à venir ou à débloquer ne restent pas cachées dans une fiche.\n\n## Revenir directement au dossier\n\nUne alerte utile mène à l’objet concerné : bail, document, incident ou intervention. L’utilisateur conserve le contexte nécessaire pour décider.\n\n## Réduire les contrôles manuels\n\nL’agenda rassemble les rendez-vous et les échéances afin d’éviter de parcourir chaque logement pour vérifier ce qui approche.",
    facebook: "Une bonne alerte ne se contente pas de rappeler une date : elle mène au dossier et à l’action attendue. C’est le rôle de l’agenda Gerimmo.",
  },
  {
    cle: "espaces-personnalises",
    audience: "particuliers",
    titre: "La bonne information pour chaque acteur de la location",
    chapo: "Agence, locataire et artisan disposent d’espaces conçus autour de leurs actions réelles.",
    corps: "## Une vue adaptée au rôle\n\nL’agence a besoin de piloter son parc et ses dossiers. Le locataire veut comprendre son logement, ses paiements, ses documents et ses demandes. L’artisan doit organiser ses interventions et rendre compte.\n\n## Une information partagée sans surcharge\n\nGerimmo part du même dossier fonctionnel mais adapte la présentation et les actions disponibles à chaque utilisateur.\n\n## Des échanges qui restent reliés\n\nLes messages et documents gardent leur contexte, ce qui limite les recherches et les ressaisies entre les différents acteurs.",
    facebook: "Agence, locataire et artisan n’ont pas les mêmes questions. Gerimmo présente à chacun les informations et les actions utiles à son rôle.",
  },
  {
    cle: "bail-structure",
    audience: "professionnels",
    titre: "Un bail plus simple à préparer, suivre et relire",
    chapo: "Le dossier du bail réunit les parties, le logement, les clauses, les documents et les étapes de signature.",
    corps: "## Préparer avec les bonnes informations\n\nLe bail s’appuie sur les données du logement, du lot et des personnes concernées. Les champs nécessaires peuvent être contrôlés avant la génération du document.\n\n## Relire un document cohérent\n\nGerimmo produit le document à partir du dossier et conserve la version liée au bail. Les blocs sont organisés pour faciliter la lecture et l’impression.\n\n## Continuer après la signature\n\nLe bail reste le point de rattachement des loyers, quittances, documents et événements qui suivent pendant la location.",
    facebook: "Préparer un bail ne se résume pas à remplir un PDF. Gerimmo relie le document au logement, aux personnes et à tout le suivi de la location.",
  },
  {
    cle: "pilotage-agence",
    audience: "professionnels",
    titre: "Commencer la journée par les dossiers qui demandent une décision",
    chapo: "Le tableau de bord Gerimmo rassemble les chiffres utiles et les éléments qui nécessitent réellement l’attention de l’agence.",
    corps: "## Une vue immédiate\n\nOccupation du parc, loyers, incidents et actions en attente apparaissent dès l’entrée dans l’espace agence.\n\n## Des chiffres qui mènent à l’action\n\nChaque indicateur ouvre la liste correspondante. L’utilisateur passe du constat au dossier sans reconstruire son chemin.\n\n## Un travail mieux ordonné\n\nLes urgences, retards et prochaines étapes sont distingués afin de traiter le plus important avant les tâches de suivi courant.",
    facebook: "Un tableau de bord est utile lorsqu’il aide à décider. Gerimmo fait remonter les dossiers qui nécessitent une action et permet d’y accéder directement.",
  },
  {
    cle: "comptabilite-contexte",
    audience: "professionnels",
    titre: "Une comptabilité locative reliée aux biens et aux baux",
    chapo: "Les écritures gardent leur lien avec le dossier locatif afin de faciliter le contrôle et les exports.",
    corps: "## Garder l’origine du mouvement\n\nUne écriture locative devient plus facile à comprendre lorsqu’elle reste rattachée au bail, au lot et à l’opération qui l’a produite.\n\n## Contrôler avant d’exporter\n\nGerimmo permet de consulter les mouvements, de reprendre les données nécessaires et de préparer les exports sans perdre le contexte métier.\n\n## Rendre les écarts visibles\n\nLes états et les journaux aident à distinguer une donnée absente, une opération en attente et une erreur à corriger.",
    facebook: "La comptabilité locative est plus lisible lorsque chaque mouvement garde son lien avec le bail et le bien concernés. Gerimmo conserve ce contexte.",
  },
  {
    cle: "investissement-budget-complet",
    audience: "particuliers",
    titre: "Investissement locatif : regarder au-delà du prix d’achat",
    chapo: "Un projet locatif se prépare avec le financement, les charges, les travaux, la vacance possible et le temps de gestion.",
    corps: "## Construire un budget réaliste\n\nLe prix d’achat et le loyer attendu ne suffisent pas à décrire un projet. Les frais d’acquisition, le financement, les charges non récupérables, l’entretien et les travaux doivent aussi entrer dans le budget.\n\n## Prévoir les périodes moins favorables\n\nUn logement peut rester vide, demander une remise en état ou connaître un incident. Tester plusieurs scénarios aide à mesurer la marge disponible lorsque tout ne se déroule pas comme prévu.\n\n## Garder les justificatifs\n\nDevis, factures, diagnostics et documents de financement facilitent le suivi de l’investissement. Les choix fiscaux et juridiques doivent être validés avec les professionnels compétents à partir de la situation réelle du propriétaire.",
    facebook: "Un investissement locatif ne se résume pas au prix d’achat et au loyer annoncé. Financement, charges, travaux, vacance et temps de gestion doivent faire partie du scénario.",
  },
  {
    cle: "investissement-rendement-risque",
    audience: "particuliers",
    titre: "Rendement locatif : un indicateur utile, pas une décision à lui seul",
    chapo: "La rentabilité affichée doit être rapprochée des dépenses, du financement, de la demande locale et du risque de vacance.",
    corps: "## Comprendre ce que mesure le chiffre\n\nUn rendement calculé avec le loyer annuel et le prix du bien donne un premier repère. Il ne décrit pas encore le coût du financement, les charges, l’entretien ou les travaux futurs.\n\n## Examiner la demande réelle\n\nLa qualité de l’emplacement dépend du public visé, des transports, des services et de l’offre concurrente. Une estimation prudente du loyer et de la vacance vaut mieux qu’un scénario construit uniquement sur le meilleur cas.\n\n## Comparer des scénarios complets\n\nAvant de décider, il est utile de comparer plusieurs hypothèses de loyer, de financement et de travaux. La décision finale doit intégrer la situation financière et les objectifs propres à l’investisseur.",
    facebook: "Le rendement brut donne un repère, mais il ne raconte ni le financement, ni les charges, ni les travaux, ni la vacance. Un projet locatif se décide avec plusieurs scénarios.",
  },
  {
    cle: "locataire-signaler-incident",
    audience: "locataires",
    titre: "Bien signaler un incident dans son logement",
    chapo: "Une description précise, des photos utiles et les bonnes disponibilités accélèrent la qualification d’une demande.",
    corps: "## Décrire les faits observés\n\nIndiquer la pièce concernée, le moment où le problème est apparu et ses conséquences aide le gestionnaire à comprendre la situation. Il vaut mieux décrire ce qui est visible que supposer l’origine technique.\n\n## Ajouter des images lisibles\n\nUne vue d’ensemble situe le problème et une vue rapprochée montre le détail. Les photos doivent éviter les informations personnelles qui n’ont aucun rapport avec la demande.\n\n## Préciser l’accès au logement\n\nLes disponibilités, les contraintes d’accès et le moyen de contact facilitent l’organisation de l’intervention. En cas de danger immédiat, les services d’urgence adaptés doivent être contactés avant la procédure courante de gestion.",
    facebook: "Pour accélérer le traitement d’un incident : décrivez les faits visibles, ajoutez une vue d’ensemble et une photo rapprochée, puis indiquez vos disponibilités.",
  },
  {
    cle: "locataire-dossier-documents",
    audience: "locataires",
    titre: "Les documents à garder accessibles pendant une location",
    chapo: "Bail, état des lieux, quittances, attestations et échanges importants sont plus utiles lorsqu’ils restent faciles à retrouver.",
    corps: "## Conserver le dossier de départ\n\nLe bail et l’état des lieux décrivent le cadre de la location et la situation du logement à l’entrée. Les annexes et diagnostics remis avec le dossier doivent rester accessibles.\n\n## Classer les documents qui évoluent\n\nQuittances, attestations d’assurance, courriers et justificatifs liés aux demandes peuvent être regroupés par année ou par sujet.\n\n## Garder le contexte des échanges\n\nLorsqu’un document concerne un incident ou un paiement, le rattacher à cette situation évite de devoir reconstruire l’historique plus tard.",
    facebook: "Bail, état des lieux, quittances et attestations sont plus utiles lorsqu’ils restent classés avec leur contexte. Un dossier clair évite beaucoup de recherches.",
  },
  {
    cle: "artisan-compte-rendu",
    audience: "artisans",
    titre: "Artisans : un compte rendu d’intervention qui fait gagner du temps",
    chapo: "Un compte rendu utile distingue le problème constaté, l’action réalisée, les pièces utilisées et la suite à prévoir.",
    corps: "## Décrire le constat\n\nLe compte rendu commence par les faits observés sur place. Cette distinction évite de confondre la demande initiale avec le diagnostic réellement posé.\n\n## Expliquer l’action réalisée\n\nLes travaux effectués, les pièces remplacées et les essais menés doivent être formulés de manière compréhensible pour le gestionnaire et l’occupant.\n\n## Indiquer clairement la suite\n\nIntervention terminée, surveillance nécessaire, devis complémentaire ou nouveau passage : un statut explicite permet à chacun de savoir ce qu’il reste à faire. Des photos utiles complètent le texte sans le remplacer.",
    facebook: "Un bon compte rendu d’intervention répond à quatre questions : qu’avez-vous constaté, qu’avez-vous fait, quelles pièces avez-vous utilisées et quelle suite faut-il prévoir ?",
  },
  {
    cle: "artisan-devis-lisible",
    audience: "artisans",
    titre: "Présenter un devis d’intervention facile à décider",
    chapo: "Un devis clair sépare le diagnostic, la main-d’œuvre, les fournitures, les délais et les éventuelles réserves.",
    corps: "## Relier le devis au besoin\n\nLa référence du logement et de l’intervention évite les confusions. Une courte description du problème constaté explique pourquoi les travaux proposés sont nécessaires.\n\n## Détailler les postes utiles\n\nMain-d’œuvre, déplacement, fournitures et options gagnent à être distingués. Le gestionnaire peut ainsi comprendre le prix et comparer des solutions qui n’ont pas toujours le même périmètre.\n\n## Annoncer les conditions d’exécution\n\nDélai, durée estimée, contraintes d’accès et validité du devis permettent d’organiser la décision et le rendez-vous avec l’occupant.",
    facebook: "Un devis facile à décider relie les travaux au constat, distingue main-d’œuvre et fournitures, puis annonce clairement le délai et les contraintes d’intervention.",
  },
  {
    cle: "professionnel-donnees-entree",
    audience: "professionnels",
    titre: "Gestion locative : la qualité du suivi commence à l’entrée des données",
    chapo: "Un logement, un bail ou une personne correctement renseignés évitent les recherches, les documents incomplets et les corrections tardives.",
    corps: "## Identifier les données indispensables\n\nCoordonnées, description du logement, parties au contrat, dates et informations financières alimentent plusieurs étapes de la gestion. Les demander au bon moment limite les dossiers incomplets.\n\n## Contrôler avant de produire\n\nAvant de générer un bail, une quittance ou un rapport, un contrôle des champs attendus évite qu’une information absente ne devienne un document incorrect.\n\n## Corriger à la source\n\nLorsqu’une donnée change, la mettre à jour dans son dossier de référence évite les divergences entre écrans, exports et documents.",
    facebook: "En gestion locative, une information manquante finit souvent dans plusieurs documents. Contrôler les données à l’entrée évite des corrections plus coûteuses plus tard.",
  },
  {
    cle: "proprietaire-compte-rendu",
    audience: "particuliers",
    titre: "Propriétaire bailleur : les informations utiles dans un compte rendu mensuel",
    chapo: "Un compte rendu efficace présente les loyers, les dépenses, les incidents, les documents et les décisions attendues sans noyer le propriétaire.",
    corps: "## Commencer par la situation du mois\n\nLes encaissements, les dépenses et les éventuels écarts doivent être visibles rapidement. Le détail reste disponible pour comprendre l’origine de chaque mouvement.\n\n## Signaler les événements importants\n\nIncident, intervention, échéance documentaire ou changement dans le bail méritent une explication courte et leur état d’avancement.\n\n## Distinguer information et décision\n\nLe propriétaire doit savoir ce qui est déjà traité, ce qui reste suivi par le gestionnaire et ce qui attend son accord. Cette hiérarchie rend le compte rendu plus utile qu’une simple accumulation de pièces.",
    facebook: "Un compte rendu mensuel utile distingue la situation financière, les événements du logement et les décisions qui attendent réellement le propriétaire bailleur.",
  },
];

export function sujetMarketing(dateParis: Date, rangDuJour: number): SujetMarketing {
  const debut = Date.UTC(dateParis.getUTCFullYear(), 0, 1);
  const jour = Math.floor((Date.UTC(dateParis.getUTCFullYear(), dateParis.getUTCMonth(), dateParis.getUTCDate()) - debut) / 86_400_000);
  const semaine = Math.floor((jour + new Date(debut).getUTCDay()) / 7);
  return SUJETS[(semaine * 2 + rangDuJour) % SUJETS.length];
}
