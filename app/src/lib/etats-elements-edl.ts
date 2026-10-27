// Libellés partagés par les vues serveur et la saisie navigateur.
export const ETATS_ELEMENT: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon",
  usage: "Usagé",
  mauvais: "Mauvais",
  absent: "Absent",
};

// Puces charte v2 : neuf/bon acquis, usagé neutre, mauvais/absent alertent
export const COULEURS_ETAT_ELEMENT: Record<string, string> = {
  neuf: "puce puce-loue",
  bon: "puce puce-loue",
  usage: "puce puce-grise",
  mauvais: "puce puce-rouge",
  absent: "puce puce-rouge",
};

