// L'envoi des relances de paiement, écrit une seule fois.
//
// DEUX CHEMINS L'APPELLENT, et c'est pour ça qu'il vit ici. Le webhook, dès que
// Stripe annonce l'échec — le client doit l'apprendre le jour même, pas au
// prochain passage de la tâche de nuit. Et la tâche de nuit, qui envoie les
// paliers suivants ET rattrape l'alerte que le webhook n'aurait pas réussi à
// faire partir (Resend indisponible, adresse momentanément refusée).
//
// C'est la base qui décide QUI relancer et à quel palier
// (`abonnements_a_relancer`) : les deux appelants ne font qu'exécuter. Écrite
// deux fois, la règle des quinze jours divergerait — et elle décide quand un
// client perd l'usage de son outil.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleRelanceAbonnement } from "@/lib/cles-idempotence-courriels";
import { envoyerEmail } from "@/lib/email";
import { corpsRelance, sujetRelance, type Palier } from "@/lib/relance-paiement-email";
import { adresseDuSite } from "@/lib/site";

type Relance = {
  organization_id: string;
  organisation: string;
  destinataire: string | null;
  palier: number;
  jours_ecoules: number;
  jours_restants: number;
  lecture_seule_le: string;
  montant_mensuel: number;
};

export type BilanRelances = {
  envoyees: number;
  sans_adresse: string[];
  echecs: string[];
};

/**
 * Envoie les courriers dus aujourd'hui, éventuellement pour une seule
 * organisation.
 *
 * L'ORDRE DES OPÉRATIONS COMPTE, comme pour les quittances : on envoie, PUIS on
 * marque. L'inverse brûlerait un palier au premier échec réseau — le client ne
 * recevrait jamais l'avis de la veille et découvrirait la lecture seule sans
 * avoir été prévenu. Dans ce sens-ci, le pire cas est un doublon, et la base
 * l'interdit déjà : jamais deux courriers le même jour.
 *
 * Mais ce « jamais le même jour » ne vaut qu'une fois le courrier marqué. L'appel
 * au service d'e-mail a un délai maximal (15 s, `lib/email.ts`) : s'il coupe
 * l'attente d'un envoi pourtant accepté, rien n'est marqué et l'autre chemin
 * (webhook ou tâche de nuit) reprend la relance. D'où la clé anti-doublon
 * (décision D47, relecture du 14/10) : le service, revoyant la même clé, rend la
 * réponse du premier envoi. Il la retient 24 h seulement (hypothèse, voir
 * `lib/email.ts`) : une reprise plus tardive renverrait le courrier.
 *
 * UNE ORGANISATION SANS ADRESSE N'EST PAS RELANCÉE EN SILENCE : elle est
 * rapportée. Fermer l'écriture de quelqu'un qu'on n'a pas pu prévenir serait le
 * pire des deux mondes.
 */
export async function envoyerRelancesDues(
  supabase: SupabaseClient,
  options: { org?: string; avantEffet?: () => Promise<void> } = {}
): Promise<BilanRelances> {
  const site = adresseDuSite();
  const { data, error } = await supabase.rpc("abonnements_a_relancer", { p_limite: 200 });
  if (error) return { envoyees: 0, sans_adresse: [], echecs: [error.message] };

  const dues = ((data ?? []) as Relance[]).filter(
    (r) => !options.org || r.organization_id === options.org
  );
  let envoyees = 0;
  const sansAdresse: string[] = [];
  const echecs: string[] = [];

  for (const r of dues) {
    if (!r.destinataire) {
      sansAdresse.push(r.organisation);
      continue;
    }
    const relance = {
      palier: Math.min(3, Math.max(0, r.palier)) as Palier,
      organisation: r.organisation,
      montantMensuel: Number(r.montant_mensuel),
      joursRestants: r.jours_restants,
      lectureSeuleLe: r.lecture_seule_le,
      // Pas de lien de secours en dur : dans le courrier qui annonce un
      // prélèvement échoué, un lien qui ne mène nulle part fait plus de mal
      // que pas de lien. La lettre dit alors quoi faire sans promettre un clic.
      lien: site ? `${site}/agence/${r.organization_id}/abonnement` : null,
    };
    await options.avantEffet?.();
    const { erreur } = await envoyerEmail({
      avantEnvoi: options.avantEffet,
      to: r.destinataire,
      cleIdempotence: cleRelanceAbonnement({
        organisationId: r.organization_id,
        palier: relance.palier,
        lectureSeuleLe: relance.lectureSeuleLe,
        joursRestants: relance.joursRestants,
        montantMensuel: r.montant_mensuel,
        destinataire: r.destinataire,
      }),
      subject: sujetRelance(relance),
      html: corpsRelance(relance),
    });
    if (erreur) {
      echecs.push(`${r.organisation} : ${erreur}`);
      continue;
    }
    await supabase.rpc("abonnement_relance_envoyee", { p_org: r.organization_id });
    envoyees += 1;
  }
  return { envoyees, sans_adresse: sansAdresse, echecs };
}
