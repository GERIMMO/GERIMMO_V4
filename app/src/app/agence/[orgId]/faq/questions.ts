export type QuestionAide = { question: string; reponse: string; theme: string; lien: string | null };

/** Rubriques de l'aide, dans l'ordre du filtre ; « Tout » les réunit. */
export const THEMES_AIDE = ["Tout", "Prise en main", "Locataires", "Biens", "Incidents", "Finances", "Abonnement"] as const;

/** Le lien de chaque réponse, nommé comme l'écran qu'il ouvre (« Ouvrir … »). */
export const LIBELLES_LIEN_AIDE: Record<string, string> = {
  loyers: "mes finances",
  messages: "mes messages",
  abonnement: "mon abonnement",
  incidents: "mes incidents",
  parc: "mes biens",
  personnes: "mes locataires",
};

// Audit de la PR #264, FL-12 : les réponses ajoutées le 27/10 ne reprennent que ce que l'application dit déjà sur ses
// écrans (déclaration et décision d'un incident, colocation par chambre, bail en préparation, invitation du
// locataire) et les règles du wiki (concepts/Incident : RM-7.2.1, 7.2.4, 7.2.5, 7.2.7 ; concepts/Bail : contrats
// individuels de colocation, 9 m² et 20 m³ — Service Public F34661, loi du 6 juillet 1989, art. 8-1).
export const QUESTIONS: QuestionAide[] = [
  {
    "question": "Que fait Gerimmo tout seul, et que me reste-t-il ?",
    "reponse": "Les quittances s'émettent à l'encaissement, les écritures de loyer s'inscrivent seules au livre, les échéances (assurance du locataire, diagnostics, révision IRL) déclenchent des alertes. Vous ne gardez que les décisions : encaisser, valider, signer.",
    "theme": "Prise en main",
    "lien": "loyers"
  },
  {
    "question": "Comment mes locataires me joignent-ils ?",
    "reponse": "Chaque locataire a son espace, dès qu'il a accepté votre invitation : il vous écrit depuis « Mon gestionnaire » (vous répondez depuis « Messages »), signale un incident photo à l'appui, dépose ses pièces quand vous les réclamez, et peut donner son congé en ligne — vous êtes alerté à chaque fois.",
    "theme": "Locataires",
    "lien": "messages"
  },
  {
    "question": "Pourquoi ne puis-je pas écrire à un locataire ?",
    "reponse": "Il n'a pas encore d'espace locataire. Sur sa fiche, la carte « Messages » vous mène à « Accès locataire » : l'invitation part par e-mail, valable 30 jours. Dès qu'il l'accepte, vous échangez avec lui depuis sa fiche ou depuis « Messages ».",
    "theme": "Locataires",
    "lien": "personnes"
  },
  {
    "question": "Un locataire me signale un problème : qui paie ?",
    "reponse": "C'est vous qui décidez, en écrivant pourquoi : à votre charge, à la charge du locataire (réparation locative) ou dégradation de sa part. Le repère affiché sous la catégorie est indicatif : la catégorie ne suffit pas à déterminer qui paie. Le locataire voit votre décision avant toute sollicitation d'un artisan ; s'il la conteste, vous en êtes alerté, sans que la réparation soit suspendue. Vous pouvez aussi déclarer l'incident vous-même, après son appel.",
    "theme": "Incidents",
    "lien": "incidents"
  },
  {
    "question": "Je loue chambre par chambre : comment faire ?",
    "reponse": "Le logement reste un seul lot. Sur sa fiche, « Configurer une colocation » : indiquez le loyer de référence du logement entier, hors charges, après vérification de l'encadrement local, puis préparez une chambre par contrat (au moins 9 m² et 20 m³ privatifs). Chaque chambre reçoit son propre bail : son locataire, son loyer, son dépôt, son état des lieux et son congé. La somme des loyers ne peut pas dépasser le loyer de référence. Pour un incident, indiquez la chambre concernée : seul son locataire le suit.",
    "theme": "Biens",
    "lien": "parc"
  },
  {
    "question": "Où reprendre un bail commencé ?",
    "reponse": "Un bail commencé et pas encore signé reste « en préparation » : ouvrez la fiche du lot dans « Biens & locations », puis « Reprendre le bail ».",
    "theme": "Biens",
    "lien": "parc"
  },
  {
    "question": "Ma SCI et mon nom propre sont-ils mélangés ?",
    "reponse": "Jamais : chaque espace (votre SCI, votre nom propre) a ses lots, son livre et sa fiscalité. Si vous en avez plusieurs, la bascule se fait par le sélecteur d'espace (en haut de la barre de gauche sur ordinateur, dans « Menu » sur téléphone) — tout suit.",
    "theme": "Prise en main",
    "lien": null
  },
  {
    "question": "Le meublé est-il dans le récapitulatif fiscal ?",
    "reponse": "Non : les revenus d'une location meublée relèvent des BIC, pas des revenus fonciers. Le récapitulatif 2044 les écarte et vous en donne le total à part ; la gestion (bail, quittances, incidents, livre) reste complète.",
    "theme": "Finances",
    "lien": "loyers"
  },
  {
    "question": "Un lot en indivision, comment je déclare ?",
    "reponse": "Le récapitulatif ajoute une colonne « votre quote-part » : chaque rubrique est ventilée à votre pourcentage de détention — c'est cette colonne qui se recopie sur votre 2044, chaque indivisaire déclarant la sienne.",
    "theme": "Finances",
    "lien": "loyers"
  },
  {
    "question": "Combien ça coûte ?",
    "reponse": "Le tarif dépend du nombre de biens en gestion et de votre choix entre paiement mensuel et annuel. Les fonctionnalités restent les mêmes dans toutes les formules. L'essai gratuit est sans carte — 2 mois pour toute inscription jusqu'au 31 décembre 2026 (offre de lancement), 1 mois ensuite. Votre page Abonnement présente les prix, les jours d’essai restants et le montant exact avant paiement. Un bien retiré n’est plus comptabilisé ; une formule inférieure s’applique à la prochaine échéance lorsque votre nombre de biens le permet.",
    "theme": "Abonnement",
    "lien": "abonnement"
  },
  {
    "question": "Gerimmo lit-il mes comptes bancaires ?",
    "reponse": "Non, jamais : la comptabilité est déclarative. Vous enregistrez l'encaissement en un clic, l'écriture s'inscrit — et une écriture validée ne se modifie plus, elle se corrige par une écriture rectificative, visible.",
    "theme": "Finances",
    "lien": "loyers"
  }
];
