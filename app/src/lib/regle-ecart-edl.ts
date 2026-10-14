// Ce qui compte comme un « écart » entre l'état des lieux d'entrée et celui de
// sortie, et ce que cela change pour le délai de restitution du dépôt de garantie.
//
// Décision D35 (2) du 14/10/2026 (fiche SOR-06), option C : la règle appliquée
// jusqu'ici est confirmée, pas modifiée. La fonction SQL comparatif_edl compte
// comme écart toute ligne dont l'état diffère (e.etat is distinct from s.etat),
// et demarrer_restitution refuse d'annoncer une sortie conforme quand le
// comparatif relève au moins un écart (RM-2.4.2) : le délai passe alors à deux
// mois. L'usure normale n'est pas distinguée d'une dégradation. Distinguer les
// deux (option B) est différé, dans l'attente d'un avis juridique.

export const REGLE_ECART_EDL =
  "Tout changement d’état entre l’entrée et la sortie est compté comme un écart, y compris une simple usure (de « Bon » à « Usagé », par exemple) : Gerimmo ne distingue pas l’usure normale d’une dégradation. Un écart porte le délai de restitution du dépôt de garantie à deux mois ; sans écart, il est d’un mois.";
