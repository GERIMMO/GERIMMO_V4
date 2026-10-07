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
//
// 07/10/2026 : réécriture avec le « Guide de ton du journal » (wiki). Un
// gestionnaire qui explique à un bailleur : phrases courtes, voix active, un
// exemple concret, une courte liste pratique, une seule réserve en fin de
// texte quand elle s'impose. Les clés sont inchangées : elles font les slugs
// et la rotation.
const SUJETS: SujetMarketing[] = [
  {
    cle: "incident-suivi",
    audience: "professionnels",
    titre: "Un incident locatif, du signalement au compte rendu",
    chapo: "Une fuite un samedi soir, trois appels, deux messages, un devis par e-mail : on perd le fil. Gerimmo garde tout dans un seul dossier, du signalement au compte rendu.",
    corps: "## Ce qui se passe d’habitude\n\nVotre locataire vous appelle pour une fuite sous l’évier. Vous appelez un plombier, il envoie son devis par e-mail, le locataire propose des créneaux par message. Trois semaines plus tard, personne ne sait plus qui a dit quoi.\n\n## Ce que Gerimmo fait\n\nLe locataire signale le problème depuis son espace, avec ses photos. Vous retrouvez le logement, qualifiez la demande et choisissez l’artisan. L’artisan reçoit le dossier, propose ses créneaux, le locataire en choisit un. Le compte rendu et la photo de fin de chantier arrivent dans le même dossier.\n\n## En pratique\n\n- Un dossier par incident, visible par l’agence, le locataire et l’artisan, chacun pour ce qui le concerne.\n- Les créneaux se proposent et se choisissent sans appel.\n- Le devis, le compte rendu et les photos restent attachés à l’incident.\n- Vous voyez en un coup d’œil ce qui attend une décision.",
    facebook: "Une fuite, trois appels, deux messages, un devis par e-mail : on perd le fil. Gerimmo garde un incident dans un seul dossier, du signalement au compte rendu.",
  },
  {
    cle: "documents-locatifs",
    audience: "particuliers",
    titre: "Chaque document locatif à sa place",
    chapo: "Le DPE de 2019, la quittance de mars, l’attestation d’assurance du locataire : vous les cherchez dans trois boîtes mail. Gerimmo les range avec le logement, le bail ou la personne concernés.",
    corps: "## L’exemple\n\nVotre locataire vous demande sa quittance de mars pour un dossier CAF. Vous la retrouvez dans vos envois, si vous l’avez gardée. Avec Gerimmo, elle est dans son espace, à côté des autres mois.\n\n## Comment c’est rangé\n\nChaque pièce est liée à ce qu’elle décrit : le diagnostic au logement, la quittance au bail, la pièce d’identité à la personne, le compte rendu à l’intervention. Vous n’avez pas à deviner le bon dossier.\n\n## Qui voit quoi\n\nVous pilotez le dossier complet. Le locataire ne voit que ce qui le concerne, depuis son espace. Les consultations de pièces sensibles sont consignées.\n\n## En pratique\n\n- Déposez le diagnostic sur le logement, il suit tous les baux de ce logement.\n- Le locataire retrouve ses quittances et son bail signé sans vous les demander.\n- Un document déjà rangé n’est pas rangé deux fois.",
    facebook: "La quittance de mars, le DPE de 2019, l’attestation d’assurance : dans Gerimmo, chaque document est rangé avec le logement, le bail ou la personne qu’il concerne.",
  },
  {
    cle: "loyers-actions",
    audience: "professionnels",
    titre: "Les loyers du mois, et ce qu’il reste à faire",
    chapo: "Dix baux, dix appels de loyer, sept virements reçus, un chèque, deux retards. Gerimmo met tout cela sur un seul tableau et vous dit où agir.",
    corps: "## L’exemple\n\nLe 5 du mois, vous avez reçu sept virements. Deux locataires n’ont rien versé, un a payé la moitié. Sur le tableau des loyers, les trois situations ressortent ; les sept autres sont soldées et quittancées.\n\n## Ce que vous voyez\n\nPour chaque bail : le montant appelé, ce qui a été encaissé, ce qui reste dû. Vous enregistrez un encaissement en une ligne, la quittance part au locataire.\n\n## Ce qui remonte\n\nUn retard devient une alerte, avec le bail en face. Vous commencez par les deux impayés, pas par les sept dossiers réglés.\n\n## En pratique\n\n- Un tableau par mois, un état par bail.\n- Encaissement saisi, quittance émise.\n- Les relances se préparent depuis le retard, pas depuis un tableur.\n- Chaque mouvement reste rattaché à son bail.",
    facebook: "Dix appels de loyer, sept virements, un chèque, deux retards : Gerimmo met le mois sur un seul tableau et vous montre où agir en premier.",
  },
  {
    cle: "agenda-alertes",
    audience: "professionnels",
    titre: "Un agenda qui vous prévient avant l’échéance",
    chapo: "Un diagnostic électricité qui expire le mois prochain, un état des lieux d’entrée pas encore signé, un rendez-vous d’artisan jeudi. Gerimmo transforme ces dates en alertes qui mènent au dossier.",
    corps: "## L’exemple\n\nLe diagnostic électricité de l’appartement du 12 rue des Lilas expire dans 40 jours. Sans alerte, vous le découvrez au prochain bail. Avec Gerimmo, l’alerte est déjà là, et elle ouvre la fiche du logement.\n\n## Ce que l’agenda rassemble\n\nLes échéances de documents, les actions en retard, les rendez-vous d’intervention, les décisions qui attendent. Chaque ligne mène à l’objet concerné : bail, document, incident.\n\n## En pratique\n\n- Les diagnostics qui expirent remontent avant la date.\n- Un état des lieux à signer reste visible tant qu’il ne l’est pas.\n- Un rendez-vous d’artisan apparaît avec le logement et l’heure.\n- Vous traitez l’alerte depuis l’alerte, sans chercher le dossier.",
    facebook: "Un diagnostic qui expire, un état des lieux à signer, un rendez-vous jeudi : l’agenda Gerimmo vous prévient avant et vous mène au dossier.",
  },
  {
    cle: "espaces-personnalises",
    audience: "particuliers",
    titre: "Trois espaces, un seul dossier",
    chapo: "Vous, votre locataire et l’artisan n’avez pas les mêmes questions. Gerimmo donne à chacun son espace, sur le même dossier.",
    corps: "## L’exemple\n\nUn dégât des eaux. Vous voulez savoir qui paie et où en est le plombier. Le locataire veut savoir quand il vient. Le plombier veut l’adresse, l’accès et le constat. Les trois regardent le même dossier, chacun avec sa vue.\n\n## Ce que chacun voit\n\nLe propriétaire ou l’agence pilote le parc, les baux, les loyers et les incidents. Le locataire voit son logement, ses paiements, ses documents et ses demandes. L’artisan voit ses missions, ses créneaux et dépose ses comptes rendus.\n\n## En pratique\n\n- Un seul dossier, pas de ressaisie entre les trois.\n- Les messages restent avec le dossier qu’ils concernent.\n- Le locataire a son espace dès que son bail est actif.\n- L’artisan n’a accès qu’aux missions qu’on lui confie.",
    facebook: "Un dégât des eaux : vous voulez savoir qui paie, le locataire quand on vient, le plombier où c’est. Gerimmo donne à chacun sa vue sur le même dossier.",
  },
  {
    cle: "bail-structure",
    audience: "professionnels",
    titre: "Un bail préparé depuis le dossier, pas depuis un modèle Word",
    chapo: "Le bail reprend le logement, le lot, les personnes et les conditions déjà saisis. Gerimmo contrôle les mentions obligatoires avant de produire le document.",
    corps: "## L’exemple\n\nVous relouez un studio à 650 € hors charges, 50 € de provision, dépôt d’un mois. Le logement a son DPE, son identifiant fiscal, son mode de chauffage. Gerimmo génère le bail avec ces informations et vous signale ce qui manque avant la signature.\n\n## Ce que Gerimmo contrôle\n\nLes mentions obligatoires du logement et du contrat, le plafond du dépôt de garantie, la zone tendue, le loyer de référence quand il s’applique.\n\n## Après la signature\n\nLe bail signé est déposé dans le dossier et active la location. Loyers, quittances, documents et incidents s’y rattachent ensuite.\n\n## En pratique\n\n- Le bail se génère depuis la fiche du bail, en PDF.\n- Les mentions manquantes sont listées, avec le champ à remplir.\n- Le bail signé active le bail et ouvre l’espace du locataire.\n- La notice d’information et le règlement de copropriété s’y joignent.",
    facebook: "Un studio à 650 €, un dépôt d’un mois, un DPE de 2024 : Gerimmo génère le bail depuis le dossier et vous dit ce qui manque avant la signature.",
  },
  {
    cle: "pilotage-agence",
    audience: "professionnels",
    titre: "Commencer la journée par ce qui attend une décision",
    chapo: "Le tableau de bord Gerimmo met en haut les dossiers bloqués, puis les chiffres du mois. Vous décidez d’abord, vous consultez ensuite.",
    corps: "## L’exemple\n\nLundi 9 h. Deux baux attendent un état des lieux signé, un impayé bloque un bail, un incident est à qualifier. Ces quatre lignes sont en tête du tableau de bord, avec un bouton pour chacune.\n\n## Ce que vous voyez\n\nL’occupation du parc, les loyers du mois, les incidents en cours, les actions à faire. Chaque chiffre ouvre la liste qui le compose.\n\n## En pratique\n\n- Les blocages de bail passent avant tout le reste.\n- Un chiffre se clique et mène à la liste.\n- Le flux des derniers événements dit ce qui vient de se passer.\n- Les statistiques du mois se replient quand vous n’en avez pas besoin.",
    facebook: "Lundi 9 h : deux états des lieux à signer, un impayé, un incident à qualifier. Le tableau de bord Gerimmo les met en tête, avec le bouton pour agir.",
  },
  {
    cle: "comptabilite-contexte",
    audience: "professionnels",
    titre: "Des écritures qui gardent leur origine",
    chapo: "Un encaissement de loyer, une facture d’artisan, des honoraires. Dans Gerimmo, chaque écriture reste liée au bail, au lot et à l’opération qui l’a produite.",
    corps: "## L’exemple\n\nLe plombier facture 340 € pour la fuite de l’appartement B. L’écriture porte le lot, l’incident et la facture déposée. Six mois plus tard, vous retrouvez d’où vient ce montant sans ouvrir trois outils.\n\n## Comment ça marche\n\nLes encaissements de loyer créent leurs écritures. Les dépenses se saisissent avec leur justificatif et leur lot. Une écriture ne se modifie pas : elle s’annule par une écriture d’annulation, qui reste visible.\n\n## Avant d’exporter\n\nLe journal se relit par mois, avec ses totaux. L’export CSV part vers votre expert-comptable avec le contexte de chaque ligne.\n\n## En pratique\n\n- Encaissement saisi, écriture créée.\n- Dépense saisie avec sa pièce et son lot.\n- Annulation visible, jamais d’effacement.\n- Export CSV mensuel.\n\n*Gerimmo tient un journal de gestion, pas une comptabilité générale : votre expert-comptable garde la main sur le bilan.*",
    facebook: "Une facture de plombier à 340 € : six mois plus tard, vous retrouvez le lot, l’incident et la pièce. Gerimmo garde l’origine de chaque écriture.",
  },
  {
    cle: "investissement-budget-complet",
    audience: "particuliers",
    titre: "Investissement locatif, le budget complet",
    chapo: "Le prix d’achat et le loyer ne font pas un budget. Comptez le financement, les charges que vous gardez, les travaux, les mois sans locataire et votre temps.",
    corps: "## L’exemple\n\nUn deux-pièces à 180 000 €, loué 750 €. Sur le papier, 5 % brut. Ajoutez 14 000 € de frais d’acquisition, 90 € de charges non récupérables par mois, une chaudière à changer dans trois ans et un mois de vacance par an : le rendement net est bien plus bas.\n\n## Ce qu’il faut mettre dans le budget\n\nLes frais d’acquisition, les intérêts du prêt, les charges de copropriété non récupérables, la taxe foncière, l’assurance, l’entretien courant, les gros travaux à venir.\n\n## Ce qu’il faut prévoir\n\nUn logement vide un mois, une remise en état entre deux locataires, un incident à régler vite.\n\n## En pratique\n\n- Faites deux scénarios : tout va bien, et un mois vide plus un sinistre.\n- Gardez tous les justificatifs : devis, factures, diagnostics, prêt.\n- Mesurez votre temps de gestion, il compte aussi.\n\n*Les choix fiscaux et juridiques se valident avec un professionnel, à partir de votre situation.*",
    facebook: "Un deux-pièces à 180 000 € loué 750 € fait 5 % brut sur le papier. Avec les frais, les charges, une chaudière et un mois vide, c’est une autre histoire.",
  },
  {
    cle: "investissement-rendement-risque",
    audience: "particuliers",
    titre: "Le rendement brut ne décide pas à votre place",
    chapo: "Le rendement brut donne un repère. La décision se prend avec le financement, les charges, la demande locale et le risque de vacance.",
    corps: "## L’exemple\n\nDeux studios à 6 % brut. Le premier est à 300 mètres d’une gare, le second à vingt minutes de bus du centre. Le premier se reloue en une semaine ; le second peut rester vide deux mois. Même chiffre, deux projets différents.\n\n## Ce que le chiffre ne dit pas\n\nLe coût du prêt, les charges non récupérables, l’entretien, les travaux à venir, le temps pour relouer.\n\n## Ce qu’il faut regarder\n\nQui loue dans ce quartier, à quel prix, et combien de temps les annonces restent en ligne.\n\n## En pratique\n\n- Comparez trois hypothèses de loyer : haute, réaliste, prudente.\n- Ajoutez un mois de vacance par an dans le scénario prudent.\n- Faites entrer le financement et les travaux dans le calcul.\n- Décidez sur le scénario prudent, pas sur le meilleur.",
    facebook: "Deux studios à 6 % brut : l’un près de la gare se reloue en une semaine, l’autre reste vide deux mois. Le rendement brut ne décide pas à votre place.",
  },
  {
    cle: "locataire-signaler-incident",
    audience: "locataires",
    titre: "Signaler un problème dans son logement",
    chapo: "Une description précise, deux photos et vos disponibilités : votre demande est qualifiée plus vite et l’artisan vient mieux préparé.",
    corps: "## L’exemple\n\nUne tache d’humidité apparaît au plafond de la salle de bains. Écrivez ce que vous voyez : la pièce, depuis quand, si ça s’étend. Ne cherchez pas la cause, c’est le travail de l’artisan.\n\n## Les photos utiles\n\nUne vue d’ensemble pour situer, une vue rapprochée pour le détail. Évitez ce qui n’a rien à voir avec la demande.\n\n## L’accès\n\nVos disponibilités, un code d’entrée, un chien à la maison : tout ce qui aide l’artisan à venir.\n\n## En pratique\n\n- La pièce, le moment, ce qui est visible.\n- Deux photos : large, puis près.\n- Vos créneaux de disponibilité.\n- Danger immédiat (gaz, fuite importante) : les numéros d’urgence d’abord, le signalement ensuite.",
    facebook: "Une tache au plafond ? Dites la pièce, depuis quand, ajoutez une photo large et une photo de près, donnez vos créneaux. L’artisan vient mieux préparé.",
  },
  {
    cle: "locataire-dossier-documents",
    audience: "locataires",
    titre: "Les documents à garder pendant une location",
    chapo: "Bail, état des lieux, quittances, attestation d’assurance : gardez-les ensemble, vous en aurez besoin pour la CAF, un prêt ou votre prochain logement.",
    corps: "## L’exemple\n\nVous déposez un dossier pour un prêt. La banque demande vos trois dernières quittances et votre bail. Si tout est dans votre espace Gerimmo, c’est fait en cinq minutes.\n\n## Le dossier de départ\n\nLe bail signé, l’état des lieux d’entrée, la notice d’information, les diagnostics. Ils décrivent le logement tel que vous l’avez pris.\n\n## Ce qui s’ajoute\n\nLes quittances chaque mois, l’attestation d’assurance chaque année, les échanges liés à une demande.\n\n## En pratique\n\n- Vos quittances et votre bail sont dans « Mes documents », enregistrez-les aussi chez vous.\n- Déposez votre attestation d’assurance quand elle se renouvelle.\n- Gardez l’état des lieux d’entrée : il sert à la sortie.",
    facebook: "La banque demande vos trois dernières quittances et votre bail ? Avec un dossier à jour, c’est cinq minutes. Ce qu’un locataire garde pendant la location.",
  },
  {
    cle: "artisan-compte-rendu",
    audience: "artisans",
    titre: "Un compte rendu d’intervention qui fait gagner du temps",
    chapo: "Ce que vous avez constaté, ce que vous avez fait, les pièces posées, la suite à prévoir. Quatre réponses, et le gestionnaire n’a plus besoin de vous rappeler.",
    corps: "## L’exemple\n\n« Fuite sous l’évier » disait la demande. Sur place, c’est le siphon fendu. Vous l’avez remplacé, testé, et le flexible d’arrivée est à surveiller. Ces trois phrases suffisent au gestionnaire pour clore ou planifier.\n\n## Les quatre questions\n\nQu’avez-vous constaté ? Qu’avez-vous fait ? Quelles pièces avez-vous utilisées ? Que reste-t-il à faire ?\n\n## La suite\n\nTerminé, à surveiller, devis complémentaire ou nouveau passage : un statut clair, et chacun sait quoi faire.\n\n## En pratique\n\n- Le constat d’abord, pas la demande initiale.\n- Les pièces et les essais, en mots simples.\n- Une photo de fin de chantier.\n- Le statut de la suite.",
    facebook: "« Fuite sous l’évier » disait la demande ; c’était le siphon. Remplacé, testé, flexible à surveiller. Un compte rendu en trois phrases, et le gestionnaire a tout.",
  },
  {
    cle: "artisan-devis-lisible",
    audience: "artisans",
    titre: "Un devis que le gestionnaire accepte vite",
    chapo: "Le constat, la main-d’œuvre, les fournitures, le délai, les réserves : séparés, ils se lisent et se comparent. Mélangés, ils attendent.",
    corps: "## L’exemple\n\nDeux devis pour un chauffe-eau. Le premier : « remplacement chauffe-eau, 890 € ». Le second : constat, appareil 200 L, déplacement, pose, mise en service, délai sous 48 h, 920 €. Le second est accepté le jour même.\n\n## Ce qui doit s’y lire\n\nLa référence du logement et de l’intervention, une phrase sur le constat, les postes séparés, le délai et la durée, la validité du devis.\n\n## En pratique\n\n- Un devis par intervention, rattaché à la demande.\n- Main-d’œuvre, déplacement et fournitures sur des lignes distinctes.\n- Le délai d’intervention et les contraintes d’accès.\n- Les réserves, s’il y en a, écrites avant le chantier.",
    facebook: "« Remplacement chauffe-eau, 890 € » attend. « Constat, appareil 200 L, pose, mise en service, sous 48 h, 920 € » est accepté le jour même. Le devis lisible gagne.",
  },
  {
    cle: "professionnel-donnees-entree",
    audience: "professionnels",
    titre: "Un dossier bien saisi évite trois corrections",
    chapo: "Une surface oubliée finit dans le bail, la quittance et le rapport. Gerimmo contrôle les données avant de produire les documents.",
    corps: "## L’exemple\n\nLe mode de chauffage du logement n’a pas été saisi. Le bail le demande, la notice aussi. Gerimmo le signale avant la génération, avec le champ à remplir, au lieu de produire un bail incomplet.\n\n## Les données qui servent plusieurs fois\n\nL’adresse et les caractéristiques du logement, les parties au contrat, les dates, le loyer et les charges. Saisies une fois dans leur fiche, elles alimentent le bail, les appels de loyer, les quittances et les rapports.\n\n## En pratique\n\n- Renseignez le logement et le lot avant le bail.\n- Les mentions manquantes sont listées, chacune mène à son champ.\n- Une donnée qui change se corrige dans sa fiche, et tout suit.",
    facebook: "Un mode de chauffage oublié finit dans le bail, la notice et le rapport. Gerimmo le signale avant de produire le document, avec le champ à remplir.",
  },
  {
    cle: "proprietaire-compte-rendu",
    audience: "particuliers",
    titre: "Ce qu’un propriétaire veut lire dans son compte rendu mensuel",
    chapo: "Les loyers encaissés, les dépenses, l’incident en cours et la décision qui attend. Le reste est du détail, disponible mais pas imposé.",
    corps: "## L’exemple\n\nMars : 1 400 € encaissés, 340 € de plomberie, un devis de 1 200 € pour la chaudière qui attend votre accord. Ces trois lignes disent le mois. Le détail des écritures et les pièces sont dessous, si vous voulez.\n\n## Ce que le rapport mensuel contient\n\nLa situation financière du mois, les événements du logement, les documents arrivés, et ce qui attend une décision du propriétaire.\n\n## En pratique\n\n- La situation d’abord : encaissé, dépensé, écart.\n- Les événements ensuite : incident, intervention, échéance.\n- Les décisions à part : ce qui attend votre accord.\n- Le rapport se génère depuis Gerimmo et se range avec les autres.",
    facebook: "Mars : 1 400 € encaissés, 340 € de plomberie, un devis chaudière à valider. Trois lignes disent le mois ; le détail reste dessous. Le compte rendu mensuel Gerimmo.",
  },
];

export function sujetMarketing(dateParis: Date, rangDuJour: number): SujetMarketing {
  const debut = Date.UTC(dateParis.getUTCFullYear(), 0, 1);
  const jour = Math.floor((Date.UTC(dateParis.getUTCFullYear(), dateParis.getUTCMonth(), dateParis.getUTCDate()) - debut) / 86_400_000);
  const semaine = Math.floor((jour + new Date(debut).getUTCDay()) / 7);
  return SUJETS[(semaine * 2 + rangDuJour) % SUJETS.length];
}
