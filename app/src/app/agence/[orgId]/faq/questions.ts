export type QuestionAide = { question: string; reponse: string; theme: string; lien: string | null };

export const QUESTIONS: QuestionAide[] = [
  {
    "question": "Que fait Gerimmo tout seul, et que me reste-t-il ?",
    "reponse": "Les quittances s'émettent à l'encaissement, les écritures de loyer s'inscrivent seules au livre, les échéances (assurance du locataire, diagnostics, révision IRL) déclenchent des alertes. Vous ne gardez que les décisions : encaisser, valider, signer.",
    "theme": "Prise en main",
    "lien": "loyers"
  },
  {
    "question": "Comment mes locataires me joignent-ils ?",
    "reponse": "Chaque locataire a son espace : il vous écrit depuis « Mon gestionnaire » (vous répondez depuis « Messages »), signale un incident photo à l'appui, dépose ses pièces quand vous les réclamez, et peut donner son congé en ligne — vous êtes alerté à chaque fois.",
    "theme": "Locataires",
    "lien": "messages"
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
