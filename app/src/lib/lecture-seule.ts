// POURQUOI L'ÉCRITURE EST FERMÉE, ET QUI PEUT LA ROUVRIR (audit final du 27/10/2026, DRT-04).
//
// Le bandeau de l'espace distinguait l'essai échu du reste, et tout le reste se lisait « Abonnement inactif ou
// impayé — activez l'abonnement… Choisir ma formule » : une organisation suspendue ou archivée par la supervision
// recevait un diagnostic faux et une issue (payer) qui ne lève pas la suspension. Le statut « suspendue » sert aussi à
// l'impayé : la cause se lit dans `org_suspendue_par_supervision` (migration 20261028100000), pas dans le statut seul.

export type CauseFermeture = "essai" | "supervision" | "abonnement";

export function causeFermeture(status: string | null | undefined, suspendueParSupervision: boolean): CauseFermeture {
  if (suspendueParSupervision) return "supervision";
  return status === "essai" ? "essai" : "abonnement";
}

/** Le bandeau « lecture seule » de l'espace : l'état, ce qu'il faut faire, et le lien du geste quand il y en a un. */
export function bandeauLectureSeule(params: {
  cause: CauseFermeture;
  status?: string | null;
  estResponsable: boolean;
  base: string;
}): { etat: string; suite: string; lien?: { href: string; libelle: string } } {
  const { cause, status, estResponsable, base } = params;
  if (cause === "supervision") {
    return {
      etat: `${status === "archivee" ? "Espace archivé" : "Espace suspendu"} par Gerimmo — lecture seule`,
      suite: estResponsable
        ? "pour en connaître la raison ou demander la réouverture, écrivez-nous."
        : "seul Gerimmo peut rouvrir la saisie\u00a0; votre administrateur peut nous écrire.",
      ...(estResponsable ? { lien: { href: "/assistance", libelle: "Écrire à l’assistance →" } } : {}),
    };
  }
  return {
    etat: cause === "essai" ? "Période d’essai terminée — lecture seule" : "Abonnement inactif ou impayé — lecture seule",
    suite: estResponsable
      ? "activez l’abonnement pour continuer à saisir."
      : "votre administrateur doit activer l’abonnement pour que la saisie reprenne.",
    ...(estResponsable ? { lien: { href: `${base}/abonnement`, libelle: "Choisir ma formule →" } } : {}),
  };
}
