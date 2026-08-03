import { formaterDate } from "./ged";

// Affichage d'une échéance. Deux formes, parce que les deux endroits qui en
// parlent n'ont pas la même place :
//   - « court »  dans la colonne d'un tableau  → « Dépassée de 23 j », « Demain »
//   - « long »   dans une phrase               → « dépassée de 23 jours »
// Un retard doit se lire sans calcul mental, et le rouge reste réservé au
// dépassement pour ne pas perdre son sens.
export type EcheanceAffichee = {
  texte: string;
  classe: string;
  /** Vrai quand la date est passée : sert au regroupement et aux liserés. */
  depassee: boolean;
  /** Nombre de jours d'écart, négatif si dépassée. */
  jours: number;
};

export function afficherEcheance(
  echeance: string | null,
  aujourdhui: Date = new Date(),
  forme: "court" | "long" = "court"
): EcheanceAffichee | null {
  if (!echeance) return null;
  const j = new Date(new Date(aujourdhui).toDateString());
  const cible = new Date(new Date(echeance).toDateString());
  const jours = Math.round((cible.getTime() - j.getTime()) / 86400000);
  const long = forme === "long";

  if (jours < 0) {
    const n = -jours;
    return {
      texte: long
        ? `dépassée de ${n} jour${n > 1 ? "s" : ""}`
        : `Dépassée de ${n} j`,
      classe: "text-destructive",
      depassee: true,
      jours,
    };
  }
  if (jours === 0) {
    return {
      texte: long ? "à échéance aujourd'hui" : "Aujourd'hui",
      classe: "text-destructive",
      depassee: false,
      jours,
    };
  }
  if (jours === 1) {
    return {
      texte: long ? "à échéance demain" : "Demain",
      classe: "text-warning-soft-foreground",
      depassee: false,
      jours,
    };
  }
  if (jours <= 14) {
    return {
      texte: long ? `à échéance dans ${jours} jours` : `Dans ${jours} j`,
      classe: "text-warning-soft-foreground",
      depassee: false,
      jours,
    };
  }
  return {
    texte: long ? `à échéance le ${formaterDate(echeance)}` : formaterDate(echeance),
    classe: "text-muted-foreground",
    depassee: false,
    jours,
  };
}

// Les blocages viennent de la base avec leur formulation complète, utile sur la
// fiche du lot mais trop longue en liste. Version courte pour le tableau de bord.
export function resumerBlocage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("détention")) return "Propriétaire non rattaché";
  if (m.includes("dpe")) return "DPE absent";
  if (m.includes("erp")) return "État des risques absent";
  if (m.includes("clé de répartition")) return "Clé de répartition à valider";
  if (m.includes("surface")) return "Surface manquante";
  if (m.includes("nom du lot")) return "Nom du lot manquant";
  if (m.includes("diagnostic")) return "Diagnostic expiré";
  return message;
}
