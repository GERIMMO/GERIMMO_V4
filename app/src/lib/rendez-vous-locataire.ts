// Le report ou l'annulation d'un rendez-vous confirmé, demandé par le LOCATAIRE (décision D22 du 14/10/2026, option B ;
// fiches LOC-21, CHN-01, REP-04 ; migration 20261014620000).
//
// LA RÈGLE, EN DEUX PHRASES.
//  · Report : le locataire propose trois nouvelles disponibilités et un motif ; son rendez-vous RESTE VALABLE tant que
//    l'artisan n'a pas répondu. L'artisan retient une date (le rendez-vous change alors, et seulement alors) ou refuse
//    (le rendez-vous est maintenu, le gestionnaire arbitre). Sans réponse dans le délai, la demande expire et le
//    rendez-vous reste.
//  · Annulation : effet immédiat, sans accord de l'artisan ; le gestionnaire est alerté ; l'artisan proposera d'autres
//    créneaux (son accord reste exigé pour tout nouveau rendez-vous). À moins de 24 h, elle est seulement TRACÉE
//    « tardive » : aucune sanction, aucun « déplacement perdu ».
//
// Les trois nombres de la décision (24 h, 2 reports, 48 h) vivent en base, dans `parametres_rdv_locataire()` ; la base
// calcule aussi ce que le locataire peut encore faire (`report_possible`, `annulation_possible`). Ce module ne fait que
// les DIRE : il ne décide rien. Il est pur (ni serveur ni navigateur) : l'action serveur, les écrans et les e-mails le
// partagent, pour que les mots ne divergent pas.

/** Les trois nombres de la décision D22, tels que la base les applique (pour les phrases seulement). */
export const REGLES_RDV_LOCATAIRE = {
  /** C.15-2 : un report se demande au moins 24 h avant le rendez-vous. */
  delaiReportHeures: 24,
  /** C.15-3 : deux demandes de report au plus par mission (celles que le locataire a retirées ne comptent pas). */
  reportsMax: 2,
  /** C.15-4 : l'artisan répond dans les 48 h (ou avant la veille du rendez-vous si elle est plus proche). */
  reponseArtisanHeures: 48,
} as const;

/** Les motifs (liste fermée, la même que la contrainte de la table). */
export const MOTIFS_RDV = [
  { valeur: "empechement", libelle: "Un empêchement" },
  { valeur: "travail", libelle: "Une contrainte de travail" },
  { valeur: "sante", libelle: "Un problème de santé" },
  { valeur: "absence", libelle: "Je serai absent du logement" },
  { valeur: "probleme_resolu", libelle: "Le problème est résolu" },
  { valeur: "autre", libelle: "Autre raison" },
] as const;

export type MotifRdv = (typeof MOTIFS_RDV)[number]["valeur"];

export function motifRdv(valeur: string): MotifRdv | null {
  return MOTIFS_RDV.find((m) => m.valeur === valeur)?.valeur ?? null;
}

/** Le motif en mots ; un code inconnu donne « Autre raison », jamais le code brut. */
export function libelleMotifRdv(valeur: string | null | undefined): string {
  return MOTIFS_RDV.find((m) => m.valeur === valeur)?.libelle ?? "Autre raison";
}

/** Une précision libre ne dépasse pas 1 000 caractères (contrainte de la table). */
export const PRECISION_MAX = 1000;

/** Une ligne de `mes_rendez_vous_locataire` : un rendez-vous du locataire et sa dernière demande. */
export type RendezVousLocataire = {
  intervention_id: string;
  incident_id: string;
  statut_mission: string;
  rdv_debut: string | null;
  rdv_fin: string | null;
  report_possible: boolean;
  annulation_possible: boolean;
  reports_restants: number;
  demande_id: string | null;
  demande_type: "report" | "annulation" | null;
  demande_statut: StatutDemandeRdv | null;
  demande_motif_code: string | null;
  demandee_le: string | null;
  expire_le: string | null;
  repondu_le: string | null;
  reponse_motif: string | null;
  demande_rdv_debut: string | null;
  demande_rdv_fin: string | null;
  nouveau_debut: string | null;
  nouvelle_fin: string | null;
  tardive: boolean;
};

/** Les états de la demande, exactement ceux de la fiche C.4. */
export type StatutDemandeRdv = "en_attente" | "acceptee" | "refusee" | "expiree" | "retiree" | "arbitree";

/** Une ligne de `mes_demandes_rdv_artisan` : la dernière demande du locataire sur une mission de l'artisan. */
export type DemandeRdvArtisan = {
  demande_id: string;
  intervention_id: string;
  type: "report" | "annulation";
  statut: StatutDemandeRdv;
  motif_code: string;
  motif_texte: string | null;
  demandee_le: string;
  expire_le: string | null;
  rdv_debut: string;
  rdv_fin: string | null;
  tardive: boolean;
};

/** « jeudi 24 septembre, 8 h – 12 h », à l'heure de Paris. */
export function plageRdv(debut: string, fin: string | null): string {
  const jour = new Date(debut).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const h = (iso: string) =>
    new Date(iso)
      .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
      .replace(":", " h ")
      .replace(/ 00$/, "");
  return fin ? `${jour}, ${h(debut)} – ${h(fin)}` : `${jour}, ${h(debut)}`;
}

/** « le jeudi 24 septembre à 14 h », à l'heure de Paris. */
export function instantRdv(iso: string): string {
  const jour = new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const h = new Date(iso)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    .replace(":", " h ")
    .replace(/ 00$/, "");
  return `le ${jour} à ${h}`;
}

/**
 * Ce que le locataire lit de sa dernière demande, dans ses mots (fiche C.8). `null` quand il n'y a rien à dire (aucune
 * demande, ou une demande close qui n'a plus d'intérêt pour lui : retirée par lui-même).
 */
export function etatDemandeLocataire(rv: RendezVousLocataire): { titre: string; detail: string; ton: "info" | "attention" | "succes" } | null {
  if (!rv.demande_id || !rv.demande_statut) return null;
  if (rv.demande_type === "annulation") {
    // Annulation : effet immédiat. Elle n'a plus rien à dire dès qu'un nouveau rendez-vous est fixé.
    if (rv.statut_mission === "planifiee") return null;
    return {
      titre: rv.demande_rdv_debut
        ? `Vous avez annulé le rendez-vous du ${plageRdv(rv.demande_rdv_debut, rv.demande_rdv_fin)}`
        : "Vous avez annulé le rendez-vous",
      detail:
        "L'artisan et votre gestionnaire sont prévenus. L'artisan va vous proposer d'autres créneaux : vous choisirez ici.",
      ton: "info",
    };
  }
  switch (rv.demande_statut) {
    case "en_attente":
      return {
        titre: `Report demandé${rv.demandee_le ? ` ${instantRdv(rv.demandee_le)}` : ""}`,
        detail: `Votre rendez-vous actuel reste valable tant que l'artisan n'a pas répondu${
          rv.expire_le ? ` (réponse attendue avant ${instantRdv(rv.expire_le)})` : ""
        }.`,
        ton: "attention",
      };
    case "acceptee":
      return {
        titre: rv.nouveau_debut
          ? `L'artisan a accepté : nouveau rendez-vous le ${plageRdv(rv.nouveau_debut, rv.nouvelle_fin)}`
          : "L'artisan a accepté votre report",
        detail: "Votre ancien rendez-vous est annulé. Nous vous rappellerons le nouveau la veille.",
        ton: "succes",
      };
    case "refusee":
      return {
        titre: "L'artisan ne peut pas : votre gestionnaire va vous appeler",
        detail: `${rv.reponse_motif ? `Sa réponse : « ${rv.reponse_motif} ». ` : ""}Votre rendez-vous actuel est maintenu en attendant.`,
        ton: "attention",
      };
    case "expiree":
      return {
        titre: "L'artisan n'a pas répondu à temps",
        detail: "Votre rendez-vous actuel est maintenu. Votre gestionnaire est prévenu et peut vous appeler.",
        ton: "attention",
      };
    case "arbitree":
      return {
        titre: "Votre gestionnaire a fixé le rendez-vous",
        detail: "Votre demande de report est close : la date ci-dessus est celle à retenir.",
        ton: "info",
      };
    case "retiree":
      return null;
  }
}

/** Pourquoi le locataire ne peut pas demander de report, quand il ne le peut pas (pour une phrase, jamais un bouton mort). */
export function raisonSansReport(rv: RendezVousLocataire): string | null {
  if (rv.report_possible || rv.statut_mission !== "planifiee" || !rv.rdv_debut) return null;
  if (rv.demande_statut === "en_attente") return null;
  if (rv.reports_restants <= 0) {
    return `Ce rendez-vous a déjà fait l'objet de ${REGLES_RDV_LOCATAIRE.reportsMax} demandes de report : pour le changer encore, appelez votre gestionnaire.`;
  }
  return `Le rendez-vous est dans moins de ${REGLES_RDV_LOCATAIRE.delaiReportHeures} heures : il ne peut plus être reporté ici. Vous pouvez encore l'annuler, ou appeler votre gestionnaire.`;
}
