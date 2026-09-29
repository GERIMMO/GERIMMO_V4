// OUTILS GRATUITS — le catalogue (29/09). Une seule liste pour la page
// /outils, l'accueil et le plan du site : un outil ajouté ici apparaît
// partout, un outil retiré disparaît partout.

export type Outil = {
  chemin: string;
  titre: string;
  /** Une phrase, affichée sur les cartes. */
  resume: string;
};

export const OUTILS: Outil[] = [
  {
    chemin: "/outils/calcul-irl",
    titre: "Calcul de la révision de loyer (IRL)",
    resume:
      "Le nouveau loyer selon l'indice de référence des loyers, les pièges de trimestre et de délai, et la lettre au locataire.",
  },
  {
    chemin: "/outils/quittance-de-loyer",
    titre: "Quittance de loyer",
    resume: "Une quittance à imprimer, ou un reçu de paiement partiel si le terme n'est pas soldé.",
  },
  {
    chemin: "/outils/comparateur-gli-visale",
    titre: "Comparateur GLI / Visale",
    resume: "Votre locataire est-il éligible à Visale ? Combien coûte une assurance loyers impayés, après impôt ?",
  },
  {
    chemin: "/outils/simulateur-lmnp",
    titre: "Simulateur LMNP",
    resume:
      "Location meublée de longue durée : micro-BIC ou régime réel, l'impôt de l'année et l'amortissement reporté.",
  },
  {
    chemin: "/outils/rentabilite-locative",
    titre: "Rentabilité locative",
    resume:
      "Rentabilité brute et nette de charges d'un investissement, et cash-flow mensuel si vous empruntez.",
  },
];
