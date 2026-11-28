import type { EtatIncident } from "./incidents";

type Mission = {
  statut?: string | null;
  date?: string | null;
  attendLocataire?: boolean;
  arbitrage?: boolean;
  devis?: "attendu" | "recu";
};

const ACTIONS: Record<EtatIncident, string> = {
  declare: "Examiner le signalement",
  qualifie: "Organiser la résolution",
  affecte: "Organiser le rendez-vous",
  en_cours: "Terminer l’intervention",
  termine: "Vérifier l’intervention et clôturer le dossier",
  clos: "Dossier clos",
  rouvert: "Réexaminer le signalement",
};

export function prochaineActionIncident(etat: string, mission?: Mission, bailleur = "Propriétaire") {
  const action = (titre: string, responsable: string | null = bailleur, date: string | null = null) => ({ titre, responsable, date });
  const standard = Object.hasOwn(ACTIONS, etat) ? ACTIONS[etat as EtatIncident] : "Vérifier le suivi du dossier";
  if (etat === "clos") return action(standard, null);
  if (etat === "declare" || etat === "rouvert") return action(standard);
  if (mission?.devis === "recu") return action("Examiner les devis reçus");
  if (mission?.devis === "attendu") return action("Remettre un devis", "Artisan");
  switch (mission?.statut) {
    case "proposee": return action("Répondre à la demande d’intervention", "Artisan");
    case "acceptee":
      if (mission.arbitrage) return action("Fixer le rendez-vous");
      if (mission.attendLocataire) return action("Répondre aux propositions de rendez-vous", "Locataire");
      return action("Organiser le rendez-vous", "Artisan");
    case "planifiee": return action("Intervenir au rendez-vous", "Artisan", mission.date);
    case "en_cours": return action(ACTIONS.en_cours, "Artisan");
    case "terminee": return action(etat === "qualifie" ? standard : ACTIONS.termine);
    case "refusee":
    case "annulee": return action("Trouver un artisan pour reprendre l’intervention");
    default: return action(standard, etat === "en_cours" ? "Artisan" : bailleur);
  }
}
