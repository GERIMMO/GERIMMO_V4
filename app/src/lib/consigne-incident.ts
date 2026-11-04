export type ConsigneIncident = { titre: string; texte: string; attente?: boolean; repere?: string; liens?: { titre: string; cible: string }[] };

export function consigneIncident(etat: string, decisionRequise: boolean, contestation: boolean, communs: boolean): ConsigneIncident | null {
  if (decisionRequise && ["declare", "rouvert", "qualifie"].includes(etat)) return {
    titre: contestation ? "Répondre à la contestation" : communs ? "Confirmer la prise en charge" : "Décider qui paie la réparation",
    texte: contestation ? "Relisez la demande du locataire, puis confirmez ou corrigez votre décision ci-dessous."
      : communs ? "Vérifiez le motif de l’intervention, puis confirmez. La répartition éventuelle des charges se traitera avec la facture."
      : "Choisissez une option ci-dessous, expliquez la raison, puis confirmez votre décision.",
  };
  if (etat === "qualifie") return { titre: "Organiser la suite", texte: "Cherchez un artisan si une intervention est nécessaire. Si le problème est déjà réglé, vous pouvez clôturer le dossier.", liens: [{ titre: "Trouver un artisan", cible: "intervention" }, { titre: "Problème déjà réglé", cible: "cloture" }] };
  if (etat === "termine") return { titre: "Vérifier le travail, puis clôturer", texte: "Consultez le compte rendu et les photos avant de confirmer la clôture.", liens: [{ titre: "Voir le compte rendu", cible: "intervention" }, { titre: "Préparer la clôture", cible: "cloture" }] };
  if (etat === "clos") return { titre: "Ce dossier est clos", repere: "Dossier terminé", texte: "Les décisions et les échanges restent disponibles dans l’historique.", liens: [{ titre: "Consulter l’historique", cible: "chronologie" }] };
  return null;
}

type Mission = { id: string; statut: string; debut_prevu: string | null };
export function consigneMission(mission: Mission, propositions: { propose_par: string }[], communs: boolean, indisponible: boolean): ConsigneIncident {
  if (indisponible) return { titre: "Suivi à vérifier", texte: "Certaines informations de rendez-vous ou de compte rendu sont indisponibles. Rechargez la page avant de décider." };
  if (mission.statut === "confiee") return { titre: "L’artisan doit répondre", texte: "La mission a été confiée. Sa réponse apparaîtra dans ce dossier.", attente: true };
  if (["refusee", "annulee"].includes(mission.statut)) return { titre: "Choisir un autre artisan", texte: "Cette mission ne se poursuit pas. Retrouvez les possibilités de nouvelle recherche dans le dossier." };
  if (mission.statut === "terminee") return { titre: "Vérifier le compte rendu", texte: "L’artisan a terminé. Consultez le travail déclaré et les photos avant la suite." };
  if (mission.statut === "en_cours") return { titre: "L’intervention est en cours", texte: "Le compte rendu de l’artisan apparaîtra ici. Vous pouvez le contacter depuis les messages.", attente: true, liens: [{ titre: "Échanger avec les participants", cible: `messages-${mission.id}` }] };
  if (mission.debut_prevu) return { titre: "Le rendez-vous est fixé", texte: "Retrouvez la date et les horaires ci-dessous. Les messages restent disponibles pour préparer l’accès.", attente: true };
  if (propositions.length) return { titre: communs ? "Un créneau reste à confirmer" : propositions[0].propose_par === "artisan" ? "Le locataire doit choisir un créneau" : propositions[0].propose_par === "locataire" ? "L’artisan doit répondre au créneau" : "Un créneau reste à confirmer", texte: "Des propositions sont en cours. Vous pouvez suivre les réponses ou échanger avec les participants.", attente: true, liens: [{ titre: "Voir les messages", cible: `messages-${mission.id}` }] };
  if (["acceptee", "planifiee"].includes(mission.statut)) return { titre: "Organiser le rendez-vous", texte: "Aucun créneau n’est confirmé. Échangez avec les participants ou enregistrez le rendez-vous convenu.", liens: [{ titre: "Fixer le rendez-vous", cible: `rdv-${mission.id}` }, { titre: "Échanger", cible: `messages-${mission.id}` }] };
  return { titre: "Consulter le suivi de la mission", texte: "Vérifiez les informations de l’intervention ci-dessous avant de poursuivre." };
}

/** Libellés d’affichage uniquement : les états métier et leurs transitions sont conservés. */
export function libelleEtatIncidentProprietaire(etat: string): string {
  const libelles: Record<string, string> = { declare: "Nouveau", rouvert: "À reprendre", qualifie: "À organiser", affecte: "Artisan sollicité", en_cours: "Intervention à suivre", termine: "Travaux à vérifier", clos: "Clos" };
  return libelles[etat] ?? "État à vérifier";
}
