import { formaterDate } from "./ged";

// Affichage d'une échéance : un retard doit se voir sans avoir à calculer une
// différence de dates de tête. Trois états seulement — dépassée, imminente,
// lointaine — pour que le rouge garde son sens.
export type EcheanceAffichee = { texte: string; classe: string };

export function afficherEcheance(
  echeance: string | null,
  aujourdhui: Date = new Date()
): EcheanceAffichee | null {
  if (!echeance) return null;
  const j = new Date(new Date(aujourdhui).toDateString());
  const cible = new Date(new Date(echeance).toDateString());
  const jours = Math.round((cible.getTime() - j.getTime()) / 86400000);

  if (jours < 0) {
    const n = -jours;
    return {
      texte: `en retard de ${n} jour${n > 1 ? "s" : ""}`,
      classe: "text-destructive",
    };
  }
  if (jours === 0) {
    return { texte: "échéance aujourd'hui", classe: "text-warning-soft-foreground" };
  }
  if (jours <= 7) {
    return {
      texte: `échéance dans ${jours} jour${jours > 1 ? "s" : ""}`,
      classe: "text-warning-soft-foreground",
    };
  }
  return {
    texte: `échéance le ${formaterDate(echeance)}`,
    classe: "text-muted-foreground",
  };
}
