import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { ArretSupervision } from "@/lib/controle-effets";
import { versionDeclaree, type VersionDeclaree } from "@/lib/conditions-versions";
import { CONDITIONS_VERSION } from "@/lib/editeur";
import { aujourdhuiParis } from "@/lib/ged";
import { dateParis } from "@/lib/heure-paris-calcul";
import { accordExpresRequis } from "@/lib/nouvelle-version-conditions";
import { resilierAEcheance } from "@/lib/stripe-offres";
import { MARQUE_NON_RECONDUCTION_STRIPE } from "@/lib/stripe";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";

// SANS ACCORD À LA DATE D'EFFET, PAS DE RECONDUCTION (plan de conformité du 23/10/2026, lot 1A, constat R19).
//
// Une étape de la tâche quotidienne des abonnements (lib/missions-planifiees/abonnements.ts), donc sous ses verrous :
// secret de la tâche, une passe à la fois, arrêt d'urgence « abonnements » vérifié avant chaque écriture chez Stripe
// (le client Stripe reçu est déjà protégé ; c'est l'équivalent, pour une tâche qui appelle Stripe, du prédicat
// `tache_planifiee_autorisee()` des tâches SQL de pg_cron, qui ne peuvent pas appeler Stripe).
//
// Pour la version en vigueur des conditions clients, si elle exige l'accord exprès (substantielle, publiée avec cette
// règle : lib/nouvelle-version-conditions.ts) et que sa date d'effet est atteinte (jour de Paris), chaque abonnement
// vivant dont aucun responsable n'a accepté cette version — alors qu'il en avait accepté une autre — est programmé pour
// ne pas être reconduit : `cancel_at_period_end` chez Stripe, sous le verrou des gestes de facturation (opération
// « resiliation »), échéancier éventuel libéré d'abord (il rouvrirait une période refusée). La période payée court
// jusqu'à son terme : rien n'est bloqué. La base le consigne (`abonnement_non_reconduction_conditions` : miroir et
// journal d'audit), et la ligne n'est plus listée.
//
// Un Client qui accepte ensuite garde la main : l'accord ne relance pas l'abonnement de lui-même (la confirmation le
// dit), il le poursuit depuis « Mon abonnement ». « Annuler la résiliation » demande l'accord dans le même geste dès la
// date d'effet (relecture adverse du 24/10, défaut 3 : actions/abonnement.ts, accordAvantReprise) ; une reprise passée
// par un autre chemin (tableau de bord Stripe) sans accord serait reprogrammée à la passe suivante.
// Un espace dont aucun responsable n'a jamais rien accepté n'est pas touché (il n'a pas pu voir l'écran).
//
// GARDE DU PRÉAVIS. Rien ne part tant que la version n'est pas ARCHIVÉE (`versions_conditions`, geste du
// super-administrateur après la mise en ligne : l'archive prouve ce qui a été publié, et quand), ni avant un mois
// plein après cet archivage, même si la date d'effet déclarée est plus tôt : le Client a eu au moins un mois pour voir
// l'écran (préavis d'un mois, article 16 en vigueur et plan § 3, lot 3). Un archivage tardif ne fait que retarder la
// non-reconduction.

export type BilanNonReconduction = {
  /** Pourquoi l'étape n'a rien examiné, le cas échéant. */
  motif: "sans_accord_expres" | "avant_date_effet" | "version_non_declaree" | "version_non_archivee" | "preavis_en_cours" | null;
  examinees: number;
  posees: number;
  echecs: { organisation: string; motif: string }[];
};

type Ligne = { organization_id: string; organisation: string; stripe_subscription_id: string; periode_fin: string | null };


/** L'étape est-elle due aujourd'hui pour cette version, avant même de lire l'archive ? `null` si oui, sinon le motif. */
export function motifSansObjet(
  version: string,
  declaree: VersionDeclaree | null,
  aujourdhui: string
): BilanNonReconduction["motif"] {
  if (!declaree) return "version_non_declaree";
  if (!accordExpresRequis(version, declaree)) return "sans_accord_expres";
  if (aujourdhui < declaree.date_effet) return "avant_date_effet";
  return null;
}

/** Le même jour, un mois plus tard (« 2026-01-31 » → « 2026-02-28 ») ; jours de calendrier, sans fuseau. */
export function unMoisApres(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m + 1, 0)).getUTCDate(); // dernier jour du mois suivant
  return new Date(Date.UTC(a, m, Math.min(j, dernier))).toISOString().slice(0, 10);
}

/** La garde du préavis : `null` si la version est archivée depuis un mois au moins (jour de Paris), sinon le motif. */
export function motifPreavis(aujourdhui: string, publieeLe: string | null): BilanNonReconduction["motif"] {
  if (!publieeLe) return "version_non_archivee";
  const instant = new Date(publieeLe);
  if (Number.isNaN(instant.getTime())) return "version_non_archivee";
  return aujourdhui < unMoisApres(dateParis(instant)) ? "preavis_en_cours" : null;
}

export async function poserNonReconductionsConditions(
  supabase: SupabaseClient,
  stripe: Stripe,
  options: { version?: string; declaree?: VersionDeclaree | null; aujourdhui?: string } = {}
): Promise<BilanNonReconduction> {
  const version = options.version ?? CONDITIONS_VERSION;
  const declaree = options.declaree === undefined ? versionDeclaree("conditions_clients", version) : options.declaree;
  const aujourdhui = options.aujourdhui ?? aujourdhuiParis();
  const bilan: BilanNonReconduction = { motif: null, examinees: 0, posees: 0, echecs: [] };
  bilan.motif = motifSansObjet(version, declaree, aujourdhui);
  if (bilan.motif) return bilan;

  const { data: archive, error: erreurArchive } = await supabase
    .from("versions_conditions")
    .select("publiee_le")
    .eq("document", "conditions_clients")
    .eq("version", version)
    .maybeSingle();
  if (erreurArchive) {
    bilan.echecs.push({ organisation: "—", motif: "lecture de l'archive des conditions impossible" });
    return bilan;
  }
  const publieeLe = (archive as { publiee_le?: unknown } | null)?.publiee_le;
  bilan.motif = motifPreavis(aujourdhui, typeof publieeLe === "string" ? publieeLe : null);
  if (bilan.motif) return bilan;

  const { data, error } = await supabase.rpc("abonnements_sans_accord_conditions", { p_version: version });
  if (error) {
    bilan.echecs.push({ organisation: "—", motif: "lecture des abonnements sans accord impossible" });
    return bilan;
  }
  const lignes = (data ?? []) as Ligne[];
  bilan.examinees = lignes.length;
  for (const l of lignes) {
    const verrou = await prendreVerrouFacturation(supabase, l.organization_id, "resiliation");
    if (!verrou.ok) {
      bilan.echecs.push({ organisation: l.organisation, motif: verrou.erreur });
      continue;
    }
    try {
      // Finitions du 24/10 (M1) : marquée, pour que le webhook n'en accuse pas réception comme d'une résiliation notifiée.
      const r = await resilierAEcheance(verrou.proteger(stripe), {
        subscription: l.stripe_subscription_id,
        resilier: true,
        metadata: { [MARQUE_NON_RECONDUCTION_STRIPE]: version },
      });
      if (!r.ok) {
        // Un échéancier libéré avant l'échec reste retiré : l'échéance redevient « à préparer » (sinon la période
        // suivante s'ouvrirait sans lui), et la ligne repassera demain (rien n'est consigné comme posé).
        bilan.echecs.push({ organisation: l.organisation, motif: r.erreur });
        if (r.echeancierLibere) {
          await supabase.rpc("abonnement_non_reconduction_conditions", {
            p_org: l.organization_id,
            p_subscription: l.stripe_subscription_id,
            p_version: version,
            p_echeancier_libere: true,
            p_posee: false,
          });
        }
        continue;
      }
      const { error: trace } = await supabase.rpc("abonnement_non_reconduction_conditions", {
        p_org: l.organization_id,
        p_subscription: l.stripe_subscription_id,
        p_version: version,
        p_echeancier_libere: r.echeancierLibere,
        p_posee: true,
      });
      // Posée chez Stripe mais non consignée : le webhook de Stripe portera le miroir ; l'échec est compté.
      if (trace) bilan.echecs.push({ organisation: l.organisation, motif: "non-reconduction posée chez Stripe, non consignée" });
      else bilan.posees += 1;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      bilan.echecs.push({ organisation: l.organisation, motif: e instanceof Error ? e.message.slice(0, 200) : "erreur inattendue" });
    } finally {
      await verrou.rendre();
    }
  }
  return bilan;
}
