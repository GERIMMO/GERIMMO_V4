/** Présentation des états existants seulement : aucune transition métier. */
export function etapeChantier({ statut, devis, facture, actif, clientArchive }: {
  statut: string; devis?: string; facture: boolean; actif: boolean; clientArchive: boolean;
}) {
  if (!actif) return { action: null, titre: "Consulter votre chantier", detail: "La saisie est désactivée. Vos documents et votre historique restent accessibles." };
  if (statut === "annule") return { action: null, titre: "Chantier annulé", detail: "Retrouvez les documents et les décisions dans l’historique." };
  if (statut === "termine") return facture
    ? { action: "suivi-facture", titre: "Suivre votre facture", detail: "Une facture déposée ne signifie pas qu’elle a été réglée." }
    : { action: "facture", titre: "Déposer votre facture", detail: "Vérifiez le numéro, le montant et le PDF. Une relecture précède le dépôt définitif." };
  if (statut === "en_cours") return { action: "bilan", titre: "Terminer l’intervention", detail: "Décrivez le travail réalisé et ajoutez sa photo avant de passer à la facture." };
  if (statut === "planifie") return { action: "demarrer", titre: "Démarrer le chantier", detail: "Le rendez-vous est enregistré. Démarrez lorsque vous commencez réellement les travaux." };
  if (statut === "accepte") return { action: "planning", titre: "Fixer le rendez-vous", detail: "Enregistrez le créneau convenu avec votre client." };
  if (statut !== "brouillon") return { action: null, titre: "Vérifier le dossier", detail: "Consultez les documents et l’historique avant de poursuivre." };
  if (devis === "valide") return { action: "accord", titre: "Enregistrer l’accord du client", detail: "Transmettez le PDF au client si nécessaire, puis conservez son accord daté. Gerimmo ne confirme pas son envoi." };
  if (devis === "brouillon") return { action: "valider", titre: "Relire et valider le devis", detail: "Vérifiez les prestations et les coordonnées avant de générer le PDF." };
  if (clientArchive) return { action: null, titre: "Client archivé", detail: "Consultez la fiche client pour reprendre ce dossier." };
  return { action: "devis", titre: devis ? "Préparer une nouvelle version" : "Préparer le devis", detail: "Décrivez les travaux, les prestations et la durée de validité." };
}
