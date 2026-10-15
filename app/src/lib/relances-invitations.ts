// LES RELANCES AUTOMATIQUES DES INVITATIONS DE LOCATAIRE (décision du dirigeant du 15/10/2026, point X16, fiche
// REP-05 ; spécification V3, module 16, RM-16.6.1 : « Deux relances automatiques partent à J+3 et J+10 »).
//
// QUI LES ENVOIE. La mission planifiée « rappels » (Vercel, 06:00 UTC : 8 h à Paris en été, 7 h en hiver), après les
// rappels de rendez-vous et de gestes : elle passe une fois par jour, par l'entrée unique des missions (une passe à
// la fois, mission en pause respectée, arrêt d'urgence consulté). Aucune tâche pg_cron n'est créée : seule
// l'application sait fabriquer le lien de connexion et envoyer le courrier.
//
// CE QUI DÉCIDE. La base, et elle seule : `relance_invitation_locataire_due` (migration 20261014830000) dit, au jour de
// Paris, quel rang est dû (1 de J+3 à J+9, 2 à partir de J+10), pour une invitation EN ATTENTE seulement (ni acceptée,
// ni refusée, ni annulée, ni expirée à l'instant), jamais pour un propriétaire ou un mandant, jamais à moins de trois
// jours d'un autre e-mail d'invitation (renvoi manuel compris).
//
// JAMAIS DEUX FOIS LA MÊME. La relance est RÉSERVÉE en base avant l'envoi (clé primaire invitation + rang), sous les
// verrous de la fiche et de l'invitation, règle relue. Puis :
//   - acceptée par le service d'e-mail → notée « envoyée » (journal d'audit) ;
//   - délai dépassé, ou exception imprévue → notée « incertaine » : elle a peut-être eu lieu, elle n'est JAMAIS renvoyée ;
//   - refus certain → réservation retirée (journal d'audit) : une passe suivante pourra la reprendre ;
//   - limite par organisation atteinte, arrêt d'urgence → réservation retirée, rien n'est parti.
// Une notation qui échoue laisse la réservation : la relance n'est pas renvoyée (au plus une fois, jamais deux).
//
// LIMITE PAR ORGANISATION. La même que celle des invitations, et le même compteur : 30 liens par heure et par
// organisation (`autoriser_lien_mot_de_passe_cle`, clé `organisation:<id>`). Relances et invitations manuelles se
// partagent donc ces 30 liens.
//
// HEURE. Jamais la nuit à Paris : rien ne part hors de 7 h – 21 h (heure de Paris), même si la mission est lancée à la
// main à une autre heure. Ce qui n'est pas parti un jour peut partir un jour suivant, dans les limites de la règle.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "./controle-effets";
import {
  envoyerRappelInvitationLocataire,
  LIMITE_INVITATIONS_PAR_ORGANISATION,
  type ResultatRappelInvitation,
} from "./lien-mot-de-passe";

/** La plage horaire des relances, à Paris : de 7 h (incluse) à 21 h (exclue). */
export const HEURES_RELANCES_INVITATION = { debut: 7, fin: 21 } as const;
/** Au plus tant de relances par passe (les plus anciennes invitations d'abord) ; la suite part au passage suivant. */
export const RELANCES_INVITATION_PAR_PASSE = 50;

/** L'heure (0 à 23) à Paris, heure d'été comprise, de cet instant. */
export function heureDeParis(instant: Date): number {
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).format(instant);
  return Number.parseInt(heure, 10);
}

/** Vrai si une relance peut partir à cet instant (journée à Paris). */
export function relancesInvitationPermises(instant: Date): boolean {
  const h = heureDeParis(instant);
  return h >= HEURES_RELANCES_INVITATION.debut && h < HEURES_RELANCES_INVITATION.fin;
}

export type BilanRelancesInvitations = {
  envoyees: number;
  /** Refus certain du service d'e-mail ou du service de liens : rien n'est parti, une passe suivante reprendra. */
  echecs: number;
  /** Délai dépassé ou incident imprévu : la relance a peut-être eu lieu, elle ne sera pas renvoyée. */
  incertaines: number;
  /** Limite par organisation atteinte : reportées au passage suivant. */
  limitees: number;
  /** Plus dues au moment de la réserver (réponse, annulation, réservation déjà faite). */
  ignorees: number;
  /** Parties, mais leur notation a échoué : la réservation reste, elles ne repartiront pas. */
  non_notees: number;
  /** Hors de la plage 7 h – 21 h à Paris : la passe n'a rien lu. */
  hors_horaire?: true;
  /** La liste des relances dues n'a pas pu être lue. */
  lecture_impossible?: true;
};

/** L'expéditeur d'une relance. Remplacé par une doublure dans les tests : aucun envoi réel. */
export type ExpediteurRappelInvitation = (p: {
  email: string;
  invitationId: string;
  expireLe: string;
  avantEnvoi?: () => Promise<void>;
}) => Promise<ResultatRappelInvitation>;

type Due = { invitation_id: string; organization_id: string; email: string; rang: number; expire_le: string };
type Resultat = "envoyee" | "incertaine" | "echec" | "reportee";

function bilanVide(): BilanRelancesInvitations {
  return { envoyees: 0, echecs: 0, incertaines: 0, limitees: 0, ignorees: 0, non_notees: 0 };
}

async function noter(service: SupabaseClient, d: Due, resultat: Resultat): Promise<boolean> {
  const { error } = await service.rpc("noter_relance_invitation_locataire", {
    p_invitation: d.invitation_id,
    p_rang: d.rang,
    p_resultat: resultat,
  });
  if (error) console.error("[relances d'invitation] notation impossible :", resultat);
  return !error;
}

/**
 * Envoie les relances d'invitation dues aujourd'hui. `avantEffet` est le contrôle d'arrêt d'urgence de la mission
 * (`verifierAvantEffet(service, "rappels")`) : lu avant chaque réservation et avant chaque envoi ; un arrêt
 * (`ArretSupervision`) interrompt la passe, après avoir retiré la réservation en cours.
 */
export async function envoyerRelancesInvitations(
  service: SupabaseClient,
  options: { maintenant?: Date; avantEffet?: () => Promise<void>; expedier?: ExpediteurRappelInvitation; limite?: number } = {}
): Promise<BilanRelancesInvitations> {
  const bilan = bilanVide();
  if (!relancesInvitationPermises(options.maintenant ?? new Date())) return { ...bilan, hors_horaire: true };

  const { data, error } = await service.rpc("invitations_locataires_relances_dues", {
    p_limite: options.limite ?? RELANCES_INVITATION_PAR_PASSE,
  });
  if (error) {
    console.error("[relances d'invitation] lecture impossible :", error.message);
    return { ...bilan, lecture_impossible: true };
  }
  const dues = (Array.isArray(data) ? data : []) as Due[];
  const expedier = options.expedier ?? envoyerRappelInvitationLocataire;
  const auPlafond = new Set<string>();

  for (const d of dues) {
    if (auPlafond.has(d.organization_id)) {
      bilan.limitees += 1;
      continue;
    }
    await options.avantEffet?.();
    const { data: reservee, error: erreurReservation } = await service.rpc("reserver_relance_invitation_locataire", {
      p_invitation: d.invitation_id,
      p_rang: d.rang,
    });
    if (erreurReservation) {
      bilan.echecs += 1;
      continue;
    }
    if (reservee !== true) {
      bilan.ignorees += 1;
      continue;
    }

    const { data: autorise, error: erreurLimite } = await service.rpc("autoriser_lien_mot_de_passe_cle", {
      p_cle: `organisation:${d.organization_id}`,
      p_max: LIMITE_INVITATIONS_PAR_ORGANISATION,
    });
    if (erreurLimite || autorise !== true) {
      await noter(service, d, "reportee");
      if (erreurLimite) bilan.echecs += 1;
      else {
        bilan.limitees += 1;
        auPlafond.add(d.organization_id);
      }
      continue;
    }

    let resultat: ResultatRappelInvitation;
    try {
      resultat = await expedier({
        email: d.email,
        invitationId: d.invitation_id,
        expireLe: d.expire_le,
        avantEnvoi: options.avantEffet,
      });
    } catch (e) {
      if (e instanceof ArretSupervision) {
        // L'arrêt est lu AVANT l'appel au service d'e-mail : rien n'est parti.
        await noter(service, d, "reportee");
        throw e;
      }
      console.error("[relances d'invitation] incident imprévu :", e instanceof Error ? e.name : "inconnu");
      resultat = { envoye: false, erreur: "Incident imprévu.", incertain: true };
    }

    if (resultat.envoye) {
      bilan.envoyees += 1;
      if (!(await noter(service, d, "envoyee"))) bilan.non_notees += 1;
    } else if (resultat.incertain) {
      bilan.incertaines += 1;
      await noter(service, d, "incertaine");
    } else {
      bilan.echecs += 1;
      await noter(service, d, "echec");
    }
  }
  return bilan;
}
