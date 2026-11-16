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
import type Stripe from "stripe";
import { factureImpayee } from "./impaye-preuve-stripe";
import { alerterRelaisContrat, lireContexteCourrier } from "./courriers-contrat-envoi";
import { ArretSupervision } from "./controle-effets";

import { envoyerEmail } from "@/lib/email";
import { corpsRelance, sujetRelance, type Palier } from "@/lib/relance-paiement-email";
import { adresseDuSite } from "@/lib/site";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import type { Periodicite } from "@/lib/tarifs";

/** Une ligne de `abonnements_a_relancer` (migration 20261019120500 : périodicité et montant de la période). */
type Relance = {
  organization_id: string;
  organisation: string;
  destinataire: string | null;
  palier: number;
  jours_ecoules: number;
  jours_restants: number;
  lecture_seule_le: string;
  periodicite: string | null;
  // Entier en centimes, tel que la base le rend : il n'est jamais converti ici.
  montant_periode_cents: number | null;
  // Plan du 23/10 (migration 20261024110000) : le premier prélèvement échoué (R23), le jour de l'échec et la date à
  // partir de laquelle l'abonnement peut être résilié (R06). Absents d'une fonction SQL antérieure : le courrier
  // ordinaire part alors sans la phrase de mise en demeure.
  premier_prelevement?: boolean | null;
  en_defaut_depuis?: string | null;
  resiliable_le?: string | null;
};

export type BilanRelances = {
  envoyees: number;
  sans_adresse: string[];
  echecs: string[];
  livraisonsEnAttente?: number;
};

/** La base programme chaque palier. Stripe confirme la facture. Le journal durable attend la preuve de livraison
 * du premier courrier avant de faire avancer le palier et d'autoriser une restriction d'écriture. */
export async function envoyerRelancesDues(
  supabase: SupabaseClient,
  options: { stripe?: Stripe; org?: string; avantEffet?: () => Promise<void> } = {}
): Promise<BilanRelances> {
  const site = adresseDuSite();
  const { data, error } = await supabase.rpc("abonnements_a_relancer", { p_limite: 200 });
  if (error) return { envoyees: 0, sans_adresse: [], echecs: [error.message] };

  const dues = ((data ?? []) as Relance[]).filter(
    (r) => !options.org || r.organization_id === options.org
  );
  let envoyees = 0, livraisonsEnAttente = 0;
  const sansAdresse: string[] = [];
  const echecs: string[] = [];

  for (const r of dues) {
    async function signaler(motif: string) {
      echecs.push(`${r.organisation} : ${motif}`);
      await alerterRelaisContrat(supabase, {
        evenement: "abonnement_impaye_a_verifier", sujet: "Courrier d’abonnement en attente",
        lignes: [], cle: `impaye-${r.organization_id}-${r.en_defaut_depuis}-${r.palier}`,
        details: { organisation: r.organization_id, episode: r.en_defaut_depuis, palier: r.palier, motif },
      }, { avantEffet: options.avantEffet });
    }
    const contrat = await lireContexteCourrier(supabase, r.organization_id, true);
    if (!contrat?.destinataire || !contrat.stripe_subscription_id || !["2026-11-15","2026-10-24"].includes(contrat.cgu_version ?? "") || !contrat.cgu_version || !r.en_defaut_depuis || !r.resiliable_le) {
      sansAdresse.push(r.organisation);
      await signaler("Vérifier la commande, les conditions acceptées et le responsable habilité.");
      continue;
    }
    if (!Number.isSafeInteger(r.montant_periode_cents) || !r.montant_periode_cents || r.montant_periode_cents < 0) {
      await signaler("Montant du prélèvement illisible, courrier non envoyé.");
      continue;
    }
    let facture: string;
    try {
      facture = await factureImpayee(contrat.stripe_subscription_id, r.montant_periode_cents, options.stripe);
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      await signaler("La facture et son montant doivent être vérifiés chez Stripe.");
      continue;
    }
    let resiliableLe: string | null = null;
    if (r.palier === 0) {
      const echeance = await supabase.rpc("echeance_mise_en_demeure", {p_org:r.organization_id,
        p_subscription:contrat.stripe_subscription_id, p_episode:r.en_defaut_depuis});
      if (echeance.error || typeof echeance.data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(echeance.data)) {
        await signaler("La date de la mise en demeure reste à vérifier.");
        continue;
      }
      resiliableLe = echeance.data;
    }
    const periodicite: Periodicite = r.periodicite === "annuel" ? "annuel" : "mensuel";
    const relance = {
      palier: Math.min(3, Math.max(0, r.palier)) as Palier,
      datesAbsolues: true,
      organisation: r.organisation,
      periodicite,
      montantPeriodeCents: r.montant_periode_cents,
      joursRestants: r.jours_restants,
      lectureSeuleLe: r.lecture_seule_le,
      // Pas de lien de secours en dur : dans le courrier qui annonce un
      // prélèvement échoué, un lien qui ne mène nulle part fait plus de mal
      // que pas de lien. La lettre dit alors quoi faire sans promettre un clic.
      lien: site ? `${site}${await baseDeLOrganisation(supabase, r.organization_id)}/abonnement` : null,
      premierPrelevement: r.premier_prelevement === true,
      enDefautDepuis: r.en_defaut_depuis ?? null,
      resiliableLe,
    };
    await options.avantEffet?.();
    const { erreur, id: message, finalisationEnAttente } = await envoyerEmail({ circuit:"lib/relances-paiement",
      avantEnvoi: options.avantEffet,
      to: contrat.destinataire,
      organisation: {db: supabase, id: r.organization_id},
      contexteMetier: {type: "relance_abonnement", id: contrat.stripe_subscription_id, episode: r.en_defaut_depuis,
        montant: r.montant_periode_cents, premier: relance.premierPrelevement,
        palier: relance.palier, periodicite, facture, resiliable:resiliableLe, version: contrat.cgu_version},
      cleIdempotence: `relance-abonnement/${r.organization_id}/${contrat.stripe_subscription_id}/${r.en_defaut_depuis}/${relance.palier}`,
      subject: sujetRelance(relance),
      html: corpsRelance(relance),
    });
    if (erreur) {
      await signaler(erreur);
      continue;
    }
    if (message && finalisationEnAttente && relance.palier === 0 && r.jours_ecoules < 1) {
      livraisonsEnAttente++;
      continue;
    }
    if (!message || finalisationEnAttente) {
      await signaler("Acceptation fournisseur et finalisation à vérifier. Ne pas renvoyer.");
      continue;
    }
    envoyees += 1;
  }
  return { envoyees, sans_adresse: sansAdresse, echecs, ...(livraisonsEnAttente ? { livraisonsEnAttente } : {}) };
}
