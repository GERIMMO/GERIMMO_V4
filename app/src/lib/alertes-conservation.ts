// LES COURRIELS DES ALERTES DE CONSERVATION (plan de conformité du 23/10/2026, lot 1E ; migration 20261024140000).
//
// La base pose les alertes chaque nuit, dans la purge (`generer_alertes_conservation`, appelée par
// `appliquer_retention`) :
//   - J-30 : « Les pièces suivantes du bail {bail} seront supprimées le {date}… » (type conservation_echeance) ;
//   - J-15 : « Les pièces de {personne}, qui n'est rattachée à aucun bail, seront supprimées le {date}… » (type
//     conservation_sans_bail, seulement quand la règle dossier:sans_bail est active).
// Le texte de l'alerte est celui du plan ; le courriel le reprend tel quel, avec un seul lien vers la fiche.
//
// QUI LES ENVOIE. La mission planifiée « rappels » (06:00 UTC), après les relances d'invitation, avec le même contrôle
// d'arrêt d'urgence. Aucune tâche pg_cron ni aucune entrée Vercel nouvelle.
//
// JAMAIS DEUX FOIS. Chaque alerte est RÉSERVÉE en base avant l'envoi (`noter_courriel_alerte_conservation`, état
// « reserve », une seule fois), puis notée : « envoye » (au moins un destinataire a reçu), « incertain » (délai
// dépassé : jamais renvoyée), « sans_destinataire », ou « echec » (refus certain : réservation retirée, nouvelle
// tentative le lendemain, trois au plus). Chaque envoi porte une clé d'idempotence stable (alerte + destinataire).
// Une alerte reposée à une nouvelle date (un gel l'a repoussée) repart avec un nouveau courriel.
//
// Le courriel vient de Gerimmo (c'est l'éditeur qui informe son client de la durée de conservation) : pas de marque
// blanche. Le journal ne porte aucune adresse.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { ArretSupervision } from "./controle-effets";
import { envoyerEmail } from "./email";
import { gabaritNotification, type Message } from "./notifications";
import { adresseDuSite } from "./site";

export type TypeAlerteConservation = "conservation_echeance" | "conservation_sans_bail";

export type AlerteConservation = {
  alerte_id: string;
  organization_id: string;
  organisation: string | null;
  proprietaire_direct: boolean;
  type: TypeAlerteConservation;
  titre: string;
  details: { bail_id?: string; person_id?: string; echeance?: string } | null;
  destinataires: string[] | null;
};

/** « 2026-11-23 » → « 23/11/2026 » (une date mal formée est rendue telle quelle). */
export function dateFrancaise(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? "");
}

/** Le lien de la fiche à ouvrir : la fiche du bail (carte « Conservation des pièces ») ou celle de la personne. */
export function lienAlerteConservation(a: Pick<AlerteConservation, "organization_id" | "proprietaire_direct" | "type" | "details">, site: string | null): string | null {
  if (!site) return null;
  const base = `${site}${a.proprietaire_direct ? "/espace" : "/agence"}/${a.organization_id}`;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (a.type === "conservation_echeance" && uuid.test(a.details?.bail_id ?? "")) return `${base}/baux/${a.details!.bail_id}#conservation`;
  if (a.type === "conservation_sans_bail" && uuid.test(a.details?.person_id ?? "")) return `${base}/personnes/${a.details!.person_id}`;
  return null;
}

/** Le courriel d'une alerte : sujet sans donnée personnelle, texte de l'alerte (celui du plan), un seul lien. */
export function messageAlerteConservation(a: AlerteConservation, site: string | null = adresseDuSite()): Message {
  const date = dateFrancaise(a.details?.echeance);
  const lien = lienAlerteConservation(a, site);
  const surBail = a.type === "conservation_echeance";
  return {
    sujet: surBail ? `Pièces d’un bail supprimées le ${date}` : `Pièces d’une personne sans bail supprimées le ${date}`,
    html: gabaritNotification({
      titre: surBail ? "Des pièces arrivent au terme de leur conservation" : "Des pièces sans bail arrivent au terme de leur conservation",
      emetteur: "L’équipe Gerimmo",
      lignes: [
        ...(a.organisation ? [`Espace : ${a.organisation}.`] : []),
        a.titre,
      ],
      action: { libelle: surBail ? "Ouvrir la fiche du bail" : "Ouvrir la fiche de la personne", lien },
    }),
  };
}

/** Clé d'idempotence stable par alerte et destinataire, sans l'adresse en clair. */
export function cleCourrielConservation(alerteId: string, destinataire: string): string {
  const empreinte = createHash("sha256").update(destinataire.trim().toLowerCase(), "utf8").digest("hex").slice(0, 24);
  return `conservation-${alerteId}-${empreinte}`;
}

export type BilanAlertesConservation = {
  envoyees: number;
  echecs: number;
  incertaines: number;
  sans_destinataire: number;
  ignorees: number;
  restantes: number;
  lecture_impossible?: true;
};

export type ExpediteurAlerte = typeof envoyerEmail;

/**
 * Envoie les courriels des alertes de conservation en attente. `avantEffet` est le contrôle d'arrêt d'urgence de la
 * mission (lu avant chaque réservation et chaque envoi ; un arrêt interrompt la passe après avoir retiré la
 * réservation en cours).
 */
export async function envoyerAlertesConservation(
  service: SupabaseClient,
  options: { avantEffet?: () => Promise<void>; expedier?: ExpediteurAlerte; echeanceMs?: number; limite?: number; site?: string | null } = {}
): Promise<BilanAlertesConservation> {
  const bilan: BilanAlertesConservation = { envoyees: 0, echecs: 0, incertaines: 0, sans_destinataire: 0, ignorees: 0, restantes: 0 };
  const { data, error } = await service.rpc("alertes_conservation_a_envoyer", { p_limite: options.limite ?? 50 });
  if (error) return { ...bilan, lecture_impossible: true };
  const alertes = (Array.isArray(data) ? data : []) as AlerteConservation[];
  const expedier = options.expedier ?? envoyerEmail;
  const site = options.site === undefined ? adresseDuSite() : options.site;
  const noter = async (id: string, etat: string) => {
    const r = await service.rpc("noter_courriel_alerte_conservation", { p_alerte: id, p_etat: etat });
    return !r.error && r.data === true;
  };

  for (const [n, a] of alertes.entries()) {
    if (options.echeanceMs !== undefined && Date.now() >= options.echeanceMs) {
      bilan.restantes = alertes.length - n;
      break;
    }
    await options.avantEffet?.();
    if (!(await noter(a.alerte_id, "reserve"))) {
      bilan.ignorees += 1;
      continue;
    }
    const destinataires = [...new Set((a.destinataires ?? []).filter((d) => typeof d === "string" && d.includes("@")))];
    if (destinataires.length === 0) {
      await noter(a.alerte_id, "sans_destinataire");
      bilan.sans_destinataire += 1;
      continue;
    }
    const message = messageAlerteConservation(a, site);
    let recus = 0;
    let incertains = 0;
    try {
      for (const destinataire of destinataires) {
        const r = await expedier({
          to: destinataire,
          subject: message.sujet,
          html: message.html,
          cleIdempotence: cleCourrielConservation(a.alerte_id, destinataire),
          avantEnvoi: options.avantEffet,
        });
        if (!r.erreur) recus += 1;
        else if (r.incertain) incertains += 1;
      }
    } catch (e) {
      if (e instanceof ArretSupervision) {
        await noter(a.alerte_id, recus > 0 ? "envoye" : "echec");
        throw e;
      }
      incertains += 1;
    }
    if (recus > 0) {
      await noter(a.alerte_id, "envoye");
      bilan.envoyees += 1;
    } else if (incertains > 0) {
      await noter(a.alerte_id, "incertain");
      bilan.incertaines += 1;
    } else {
      await noter(a.alerte_id, "echec");
      bilan.echecs += 1;
    }
  }
  return bilan;
}
