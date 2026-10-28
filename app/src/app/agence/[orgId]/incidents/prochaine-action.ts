import type { EtatIncident } from "@/lib/incidents";

export type ProchaineActionIncident = {
  titre: string;
  texte: string;
  cible: "qualification" | "intervention" | "chronologie";
  bouton: string;
  ton: "attention" | "info" | "termine";
};

/**
 * La carte « Prochaine étape » du dossier. Un devis reçu et encore valable passe avant « Organiser la résolution » :
 * la liste range alors le dossier dans « Devis à décider » et l'alerte dit « Devis reçu, à décider » ; la carte ne doit pas
 * conseiller de solliciter un artisan déjà sollicité (audit final, DOC-02). `devisADecider` suit la même règle que la
 * liste (devis déposé, encore valable).
 */
export function prochaineActionIncident({
  etat,
  aQualifier,
  decisionRequise,
  devisADecider,
}: {
  etat: EtatIncident;
  aQualifier: boolean;
  decisionRequise: boolean;
  devisADecider: boolean;
}): ProchaineActionIncident {
  if (aQualifier && decisionRequise) {
    return { titre: "Indiquer qui prend en charge", texte: "Choisissez qui paie et expliquez votre décision avant de solliciter un artisan.", cible: "qualification", bouton: "Prendre une décision", ton: "attention" };
  }
  if (devisADecider && etat !== "termine" && etat !== "clos") {
    return { titre: "Décider du devis reçu", texte: "Un devis attend votre décision : retenez-le, demandez une révision ou refusez-le.", cible: "intervention", bouton: "Voir le devis", ton: "attention" };
  }
  if (etat === "qualifie") {
    return { titre: "Organiser la résolution", texte: "Sollicitez un artisan si nécessaire, ou clôturez le dossier si le problème est réglé.", cible: "intervention", bouton: "Voir les possibilités", ton: "info" };
  }
  if (etat === "termine") {
    return { titre: "Vérifier et clôturer", texte: "Consultez le compte rendu de l’intervention avant de clôturer le dossier.", cible: "intervention", bouton: "Voir le compte rendu", ton: "attention" };
  }
  if (etat === "clos") {
    return { titre: "Dossier clos", texte: "Retrouvez les décisions et les échanges dans la chronologie.", cible: "chronologie", bouton: "Voir l’historique", ton: "termine" };
  }
  return { titre: "Suivre l’intervention", texte: "Consultez l’avancement et les informations transmises par l’artisan.", cible: "intervention", bouton: "Voir le suivi", ton: "info" };
}
