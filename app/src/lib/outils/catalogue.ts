// OUTILS GRATUITS — le catalogue (29/09). Une seule liste pour la page
// /outils, l'accueil et le plan du site : un outil ajouté ici apparaît
// partout, un outil retiré disparaît partout.

export type Outil = {
  chemin: string;
  titre: string;
  /** Une phrase, affichée sur les cartes. */
  resume: string;
  /** Étape utile dans Gerimmo après cette simulation publique. */
  suite: string;
};

export const OUTILS: Outil[] = [
  {
    chemin: "/outils/calcul-irl",
    titre: "Calcul de la révision de loyer (IRL)",
    suite: "Depuis la fiche du bail, vérifiez la clause et les indices avant de décider de la révision du loyer.",
    resume:
      "Le nouveau loyer selon l'indice de référence des loyers, les pièges de trimestre et de délai, et la lettre au locataire.",
  },
  {
    chemin: "/outils/quittance-de-loyer",
    titre: "Quittance de loyer",
    suite: "Dans votre espace, enregistrez la somme réellement reçue pour retrouver la quittance de chaque loyer soldé ou un reçu partiel.",
    resume: "Une quittance à imprimer, ou un reçu de paiement partiel si le terme n'est pas soldé.",
  },
  {
    chemin: "/outils/comparateur-gli-visale",
    titre: "Comparateur GLI / Visale",
    suite: "Cette comparaison estime le coût d’une garantie. Dans votre espace, conservez les justificatifs du garant avec le dossier de location.",
    resume: "Votre locataire est-il éligible à Visale ? Combien coûte une assurance loyers impayés, après impôt ?",
  },
  {
    chemin: "/outils/simulateur-lmnp",
    titre: "Simulateur LMNP",
    suite: "La simulation du meublé repose sur vos hypothèses. Votre espace vous permet de classer vos dépenses et d’exporter le journal à votre expert-comptable.",
    resume:
      "Location meublée de longue durée : micro-BIC ou régime réel, l'impôt de l'année et l'amortissement reporté.",
  },
  {
    chemin: "/outils/rentabilite-locative",
    titre: "Rentabilité locative",
    suite: "L’estimation dépend de vos hypothèses. Une fois le bien loué, suivez dans votre espace les sommes réellement reçues et les dépenses que vous enregistrez.",
    resume:
      "Rentabilité brute et nette de charges d'un investissement, et cash-flow mensuel si vous empruntez.",
  },
];
