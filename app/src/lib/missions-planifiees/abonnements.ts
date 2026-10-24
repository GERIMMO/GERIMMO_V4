import { reprendreEvenementsStripe } from "@/lib/stripe-file";
import { inventorierSouscriptionsStripe } from "@/lib/stripe-inventaire";
import { rapprocherAbonnementsStripe } from "@/lib/stripe-rapprochement";
import { ArretSupervision, verifierAvantEffet } from "@/lib/controle-effets";
import { protegerClientAutomatique } from "@/lib/client-automatique";
// Tâche planifiée : aligner ce que Stripe facture sur ce que l'agence gère.
//
// POURQUOI PAS AU MOMENT DE L'AJOUT. Pousser la quantité chez Stripe quand un
// bien est créé lierait la saisie du parc à la disponibilité d'un tiers :
// Stripe indisponible, et l'agence ne peut plus ajouter un bien. Or le retard
// ne coûte rien — Stripe facture à la fin de la période, pas à la seconde. Un
// déclencheur en base lève un drapeau ; cette route le baisse.
//
// LES MÊMES TROIS VERROUS QUE LA ROUTE DES QUITTANCES, et pour la même raison :
// elle porte la clé de service.
//  1. `CRON_SECRET` : sans elle, la route refuse de tourner — elle ne « passe
//     pas en mode ouvert », elle s'arrête. Comparaison à temps constant.
//  2. La clé de service ne sort pas de lib/supabase/service.ts, et les deux
//     fonctions appelées sont accordées au seul `service_role`.
//  3. Chacune ne rend ou n'écrit que le strict nécessaire.
//
// CE QU'ELLE NE FAIT PAS. Elle ne crée aucune souscription et n'en supprime
// aucune : elle ajuste celles qui existent. Souscrire est un geste du client,
// pas une décision de la plateforme — et une tâche de nuit qui ouvrirait un
// abonnement prélèverait quelqu'un qui n'a rien demandé.

import { envoyerAvisCapaciteDepassee, envoyerAvisReconduction } from "@/lib/avis-abonnement";
import { envoyerRelancesDues } from "@/lib/relances-paiement";
import { envoyerConfirmationsDues } from "@/lib/courriers-contrat-envoi";
import { reprendreRetractations } from "@/lib/retractation-execution";
import {
  clientStripe,
  configurationStripe,
  crediterClientStripe,
  lireErreurStripe,
  synchroniserQuantite,
} from "@/lib/stripe";
import { clientDeService } from "@/lib/supabase/service";
import { REGIME_TVA } from "@/lib/editeur";
import { appliquerBaisseAEcheance, choixExplicite, lireDetails, programmerPeriodicite } from "@/lib/stripe-offres";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";
import type Stripe from "stripe";
import {
  formuleParCode,
  offreAgence,
  offreFormule,
  offreParticulier,
  type Offre,
  type Periodicite,
} from "@/lib/tarifs";
import { consignerTache } from "@/lib/tache";
import { poserNonReconductionsConditions, type BilanNonReconduction } from "@/lib/non-reconduction-conditions";
import { timingSafeEqual } from "node:crypto";


type Ligne = {
  organization_id: string;
  organisation: string;
  stripe_subscription_id: string;
  quantite_posee: number;
  quantite_cible: number;
};

type Echeance = {
  organization_id: string;
  organisation: string;
  public_tarif: "agence" | "proprietaire_direct";
  stripe_subscription_id: string;
  periodicite: Periodicite;
  periodicite_suivante: Periodicite | null;
  formule: string | null;
  unites_souscrites: number | null;
  unites_a_couvrir: number;
  periode_fin: string;
};

type Avoir = {
  avantage_id: string;
  organization_id: string;
  organisation: string;
  montant_cents: number;
  stripe_customer_id: string | null;
};

// Seconde relecture adverse du 23/10 (A02) : l'échéance n'est préparée que sous le verrou des gestes de facturation.
const ECHEANCE_VERROU_TENU =
  "Une autre modification de l'abonnement était en cours : l'échéance sera préparée au prochain passage.";
const ECHEANCE_VERROU_INDISPONIBLE =
  "Le verrou des modifications d'abonnement n'a pas pu être pris : l'échéance sera préparée au prochain passage.";
const ECHEANCE_ABONNEMENT_CHANGE =
  "L'abonnement a changé chez Stripe depuis la lecture de l'échéance : elle sera préparée au prochain passage.";

/**
 * La souscription lue chez Stripe SOUS le verrou facture-t-elle encore la formule et la capacité de la ligne lue en
 * début de passe ? Le miroir en base (formule, capacité) est écrit par le webhook depuis ces mêmes métadonnées
 * (lireDetails, puis abonnement_details). Une formule différente, ou une capacité PLUS GRANDE chez Stripe, dit qu'une
 * hausse est passée entre la lecture de la ligne et le verrou, sans que son webhook soit encore reçu : l'offre calculée
 * depuis la ligne la déferait à l'échéance. Seul ce qui est connu des deux côtés est comparé, et la capacité dans ce
 * seul sens : pour une agence, la base garde au moins le socle (abonnement_details, 20260930150000), au-dessus de la
 * métadonnée d'une petite agence.
 */
function ligneAJour(s: Stripe.Subscription, l: Echeance): boolean {
  const d = lireDetails(s);
  if (d.formule && l.formule && d.formule !== l.formule) return false;
  if (d.unites !== null && l.unites_souscrites !== null && d.unites > l.unites_souscrites) return false;
  return true;
}

/** Comparaison à temps constant, sans fuir la longueur du secret. */
function memeSecret(fourni: string, attendu: string): boolean {
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function traiterAbonnements(request: Request) {
  const attendu = process.env.CRON_SECRET;
  if (!attendu) {
    return Response.json(
      { erreur: "CRON_SECRET absente : la synchronisation est désactivée." },
      { status: 503 }
    );
  }
  const fourni = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!memeSecret(fourni, attendu)) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }

  const supabase = clientDeService();
  if (!supabase) {
    return Response.json(
      { erreur: "SUPABASE_SERVICE_ROLE_KEY absente : la synchronisation est désactivée." },
      { status: 503 }
    );
  }
  const reglages = configurationStripe();
  if (!reglages.pret) {
    // Consigné, puis 200 (25/09). Le 503 d'avant partait AVANT tout journal :
    // Santé disait « aucune exécution » à vie et Équipes « À vérifier » chaque
    // nuit, pour une connexion absente que la ligne de configuration signale
    // déjà. La passe dit qu'elle n'a rien pu faire ; c'est Santé qui classe
    // ce cas comme non bloquant, à côté de la sandbox Youtrust.
    await consignerTache(supabase, "abonnements", {
      ignores: 0,
      non_configuree: true,
      motif: "stripe_absent",
    });
    return Response.json({ ignores: 0, non_configuree: true, motif: reglages.motif });
  }

  // ── D'ABORD LES RELANCES, ET C'EST VOLONTAIRE. Elles ont une échéance :
  // un courrier de la veille du quinzième jour envoyé le seizième ne sert à
  // rien. L'alignement des quantités, lui, peut attendre une journée de plus.
  // Si Stripe tombe entre les deux, les courriers sont partis.
  const relances = await envoyerRelancesDues(supabase, { avantEffet: () => verifierAvantEffet(supabase, "abonnements") });

  const { data, error } = await supabase.rpc("abonnements_a_synchroniser", { p_limite: 200 });
  if (error) {
    await consignerTache(supabase, "abonnements", { erreur: "lecture impossible", relances });
    return Response.json({ erreur: error.message }, { status: 500 });
  }
  const lignes = (data ?? []) as Ligne[];
  const stripe = protegerClientAutomatique(clientStripe(reglages.config), () => verifierAvantEffet(supabase, "abonnements"));

  let alignes = 0;
  let resiliees = 0;
  const echecs: { organisation: string; motif: string }[] = [];

  for (const l of lignes) {
    const r = await synchroniserQuantite(stripe, {
      subscription: l.stripe_subscription_id,
      quantite: l.quantite_cible,
    });
    if (!r.ok) {
      // L'échec est ENREGISTRÉ, pas avalé : le drapeau reste levé et la ligne
      // repassera demain. Une erreur silencieuse ici, c'est une facture fausse
      // tous les mois suivants sans que personne le sache.
      echecs.push({ organisation: l.organisation, motif: r.erreur });
      await supabase.rpc("abonnement_synchro_faite", {
        p_org: l.organization_id,
        p_quantite: l.quantite_posee,
        p_erreur: r.erreur.slice(0, 500),
      });
      continue;
    }
    if (r.resiliee) resiliees += 1;
    else alignes += 1;
    await supabase.rpc("abonnement_synchro_faite", {
      p_org: l.organization_id,
      p_quantite: r.quantite,
      p_erreur: null,
    });
  }

  // ── GRILLE DU 28/09/2026 : L'ÉCHÉANCE SE PRÉPARE DANS LES TROIS JOURS.
  // Une baisse (portefeuille réduit) ou un changement de périodicité demandé
  // ne s'applique qu'à la prochaine échéance, sans prorata : la période payée
  // reste acquise. Jamais de hausse ici — une hausse attend la confirmation
  // du client, sur « Mon abonnement ».
  const echeances = await preparerEcheances(supabase, stripe);

  // ── PLAN DE CONFORMITÉ DU 23/10 (R19) : sans accord exprès à la date d'effet d'une version substantielle des
  // conditions, l'abonnement n'est pas reconduit (lib/non-reconduction-conditions.ts). Après les échéances : un
  // échéancier qu'elles viendraient de poser est libéré d'abord ; avant l'avis de reconduction, qui ne part pas pour un
  // abonnement programmé pour finir.
  let nonReconduction: BilanNonReconduction;
  try {
    nonReconduction = await poserNonReconductionsConditions(supabase, stripe);
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    nonReconduction = { motif: null, examinees: 0, posees: 0, echecs: [{ organisation: "—", motif: e instanceof Error ? e.message.slice(0, 200) : "étape impossible" }] };
  }

  // ── L'AVIS DE RECONDUCTION TACITE (art. L215-1 du code de la consommation,
  // audit 29/09). Un particulier abonné à l'année est prévenu entre trois mois
  // et un mois avant le terme : date, montant, droit de ne pas reconduire.
  // Un envoi raté reste dû : il repartira demain, la fenêtre court deux mois.
  let reconduction: Awaited<ReturnType<typeof envoyerAvisReconduction>>;
  try {
    reconduction = await envoyerAvisReconduction(supabase, () => verifierAvantEffet(supabase, "abonnements"));
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    reconduction = { envoyes: 0, sans_adresse: [], echecs: [e instanceof Error ? e.message : "avis impossibles"] };
  }

  // ── LA CONFIRMATION DES SOUSCRIPTIONS (plan du 23/10, R03). Le webhook l'envoie à la naissance de la souscription ;
  // celle qui n'est pas partie (prestataire d'e-mail indisponible, réception rejouée sans effets externes) l'est ici,
  // une fois, pendant un mois après la souscription.
  let confirmations: Awaited<ReturnType<typeof envoyerConfirmationsDues>>;
  try {
    confirmations = await envoyerConfirmationsDues(supabase, stripe, () => verifierAvantEffet(supabase, "abonnements"));
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    confirmations = { envoyees: 0, echecs: [e instanceof Error ? e.message : "confirmations impossibles"] };
  }

  // ── LES RÉTRACTATIONS RESTÉES EN CHEMIN (relecture adverse du 24/10, I4). Une déclaration enregistrée dont
  // l'exécution chez Stripe ou l'accusé n'a pas abouti (prestataire indisponible, client qui a fermé la page) est
  // terminée ici, sans rien doubler ; celles qui ne le sont pas restent dues et le relais est alerté.
  let retractations: Awaited<ReturnType<typeof reprendreRetractations>>;
  try {
    retractations = await reprendreRetractations(supabase, stripe, () => verifierAvantEffet(supabase, "abonnements"));
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    retractations = { terminees: 0, echecs: [e instanceof Error ? e.message : "reprise des rétractations impossible"] };
  }

  // ── LES AVOIRS DE PARRAINAGE, EN DERNIER (19/09). Un mois offert au parrain
  // quand son filleul devient client payant : la base a posé la ligne, ici on
  // la porte au solde Stripe, qui la déduira de la prochaine facture.
  //
  // APRÈS l'alignement des quantités, à dessein : si Stripe tombe au milieu,
  // ce qui n'est pas passé est un CADEAU en retard d'un jour, pas une facture
  // fausse. L'appel est idempotent (clé = identifiant de l'avantage), donc une
  // ligne rejouée demain ne crédite pas deux fois.
  const { data: avoirsBruts, error: erreurAvoirs } = await supabase.rpc(
    "avantages_parrainage_a_appliquer"
  );
  const avoirs = (avoirsBruts ?? []) as Avoir[];
  let avoirsPortes = 0;
  const avoirsEnEchec: { organisation: string; motif: string }[] = [];
  if (erreurAvoirs) {
    avoirsEnEchec.push({ organisation: "—", motif: "lecture des avoirs impossible" });
  }
  for (const a of avoirs) {
    const r = await crediterClientStripe(stripe, {
      customer: a.stripe_customer_id ?? "",
      montantCents: Number(a.montant_cents),
      avantageId: a.avantage_id,
      libelle: "Parrainage Gerimmo — un mois offert",
    });
    if (!r.ok) {
      // La ligne reste « à appliquer » : elle repassera demain. On n'invente
      // pas d'état « perdu » pour un cadeau qu'on doit toujours.
      avoirsEnEchec.push({ organisation: a.organisation, motif: r.erreur });
      continue;
    }
    await supabase.rpc("avantage_parrainage_solde", {
      p_avantage: a.avantage_id,
      p_reference: r.reference,
    });
    avoirsPortes += 1;
  }

  // Rattrape les réceptions interrompues, puis compare les abonnements et factures.
  // Ce contrôle n'ordonne aucun paiement, remboursement ou nouvelle souscription.
  let reprises = { repris: 0, echecs: 0, attentes: 0 };
  let rapprochement = { controles: 0, ecarts: 0, echecs: 0, incomplet: false };
  try {
    reprises = await reprendreEvenementsStripe(supabase, stripe, () => verifierAvantEffet(supabase, "abonnements"));
    rapprochement = await rapprocherAbonnementsStripe(supabase, stripe, () => verifierAvantEffet(supabase, "abonnements"));
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    rapprochement.echecs++;
  }

  let inventaire = { controles: 0, ecarts: 0, echecs: 0, incomplet: true };
  try {
    inventaire = await inventorierSouscriptionsStripe(supabase, stripe, () => verifierAvantEffet(supabase, "abonnements"));
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    inventaire.echecs++;
  }

  // Les échecs sont comptés, pas recopiés : leurs motifs vivent déjà sur
  // chaque organisation (abonnement_synchro_faite), et tech_log n'a pas à
  // porter deux fois le même texte.
  await consignerTache(supabase, "abonnements", {
    relances,
    examinees: lignes.length,
    alignees: alignes,
    resiliees,
    echecs: echecs.length + reprises.echecs + rapprochement.echecs + inventaire.echecs,
    stripe_repris: reprises.repris, stripe_controles: rapprochement.controles,
    stripe_ecarts: rapprochement.ecarts + inventaire.ecarts, stripe_incomplet: rapprochement.incomplet || inventaire.incomplet,
    stripe_inventories: inventaire.controles, stripe_non_suivis: inventaire.ecarts,
    avoirs_portes: avoirsPortes,
    avoirs_en_echec: avoirsEnEchec.length,
    echeances_examinees: echeances.examinees,
    baisses: echeances.baisses,
    periodicites: echeances.periodicites,
    avis_capacite: echeances.avis_capacite,
    echeances_en_echec: echeances.echecs.length,
    avis_reconduction: reconduction.envoyes,
    avis_reconduction_en_echec: reconduction.echecs.length + reconduction.sans_adresse.length,
    non_reconductions_conditions: nonReconduction.posees,
    non_reconductions_conditions_en_echec: nonReconduction.echecs.length,
    confirmations: confirmations.envoyees,
    confirmations_en_echec: confirmations.echecs.length,
    retractations_terminees: retractations.terminees,
    retractations_en_echec: retractations.echecs.length,
  });
  return Response.json({
    relances,
    confirmations,
    retractations,
    examinees: lignes.length,
    alignees: alignes,
    resiliees,
    echecs,
    avoirs_portes: avoirsPortes,
    avoirs_en_echec: avoirsEnEchec,
    echeances,
    non_reconduction: nonReconduction,
    reconduction, reprises, rapprochement, inventaire,
    stripe_repris: reprises.repris, stripe_controles: rapprochement.controles, stripe_ecarts: rapprochement.ecarts + inventaire.ecarts,
    stripe_inventories: inventaire.controles, stripe_non_suivis: inventaire.ecarts,
    stripe_incomplet: rapprochement.incomplet || inventaire.incomplet, stripe_echecs: reprises.echecs + rapprochement.echecs + inventaire.echecs,
  });
}

/**
 * Préparer les échéances de la grille du 28/09/2026. Pour chaque souscription
 * qui se renouvelle dans les trois jours : l'offre la moins chère qui couvre
 * le portefeuille d'aujourd'hui — SANS JAMAIS dépasser la capacité payée —,
 * dans la périodicité demandée. Moins chère que l'actuelle → baisse sans
 * prorata ; autre périodicité → échéancier Stripe qui l'ouvre à l'échéance.
 * Les deux passent par un échéancier : la période en cours reste payée et
 * couverte telle quelle (audit 29/09, point 11).
 *
 * Un client qui a CHOISI plus que nécessaire (`gerimmo_choix = explicite`)
 * garde son offre : on ne la rabaisse pas d'office. Un portefeuille qui
 * dépasse la capacité payée n'est jamais facturé d'office non plus : le
 * client est prévenu, et confirme la hausse sur « Mon abonnement »
 * (audit 29/09, point 3).
 */
async function preparerEcheances(
  supabase: NonNullable<ReturnType<typeof clientDeService>>,
  stripe: ReturnType<typeof clientStripe>
): Promise<{
  examinees: number;
  baisses: number;
  periodicites: number;
  avis_capacite: number;
  echecs: { organisation: string; motif: string }[];
}> {
  const bilan = {
    examinees: 0,
    baisses: 0,
    periodicites: 0,
    avis_capacite: 0,
    echecs: [] as { organisation: string; motif: string }[],
  };
  const { data, error } = await supabase.rpc("abonnements_echeance_a_preparer", { p_jours: 3 });
  if (error) {
    bilan.echecs.push({ organisation: "—", motif: "lecture des échéances impossible" });
    return bilan;
  }
  const lignes = (data ?? []) as Echeance[];
  bilan.examinees = lignes.length;
  if (!REGIME_TVA) return bilan; // aucune souscription de cette grille ne peut exister sans lui
  for (const l of lignes) {
    const estAgence = l.public_tarif === "agence";
    const periodicite = l.periodicite_suivante ?? l.periodicite;
    const formule = formuleParCode(l.formule);
    const capacite = l.unites_souscrites ?? formule?.biens ?? 0;
    const actuelle = estAgence
      ? offreAgence(capacite)
      : formule
        ? offreFormule(formule, capacite, l.periodicite)
        : null;
    const changePeriodicite = !estAgence && periodicite !== l.periodicite;
    // Jamais au-delà de ce qui est payé : la hausse attend une confirmation.
    const base = Math.min(l.unites_a_couvrir, capacite);
    let cible: Offre = estAgence ? offreAgence(base) : offreParticulier(base, periodicite);

    let r: { ok: true } | { ok: false; erreur: string } = { ok: true };
    const baisse = Boolean(actuelle && cible.periodicite === actuelle.periodicite && cible.montantCents < actuelle.montantCents);
    if (changePeriodicite || baisse) {
      // Seconde relecture adverse du 23/10 (A02). La programmation lit la souscription, crée un échéancier, puis réécrit
      // la phase en cours sans prorata, avec les métadonnées lues : une hausse confirmée entre ces étapes était défaite.
      // Le verrou des gestes de facturation (« echeance ») couvre désormais la lecture et la programmation ; une hausse,
      // une demande de périodicité ou une résiliation attendent qu'il soit rendu. Tenu par l'un d'eux, ou indisponible :
      // l'échéance n'est PAS marquée préparée (erreur posée), elle repasse au passage suivant.
      const verrou = await prendreVerrouFacturation(supabase, l.organization_id, "echeance");
      if (!verrou.ok) {
        r = { ok: false, erreur: verrou.motif === "tenu" ? ECHEANCE_VERROU_TENU : ECHEANCE_VERROU_INDISPONIBLE };
      } else {
        try {
          // Sous le verrou, plus aucune écriture chez Stripe une fois son délai d'écriture passé.
          const sous = verrou.proteger(stripe);
          try {
            const s = await sous.subscriptions.retrieve(l.stripe_subscription_id);
            if (!ligneAJour(s, l)) {
              r = { ok: false, erreur: ECHEANCE_ABONNEMENT_CHANGE };
            } else if (choixExplicite(s)) {
              // Même offre, seule la périodicité demandée change (le cas échéant).
              const gardee = estAgence ? offreAgence(capacite) : formule ? offreFormule(formule, capacite, periodicite) : null;
              if (gardee) cible = gardee;
            }
          } catch (e) {
            if (e instanceof ArretSupervision) throw e;
            r = { ok: false, erreur: lireErreurStripe(e) };
          }
          if (r.ok && changePeriodicite) {
            r = await programmerPeriodicite(sous, {
              subscription: l.stripe_subscription_id,
              offre: cible,
              regime: REGIME_TVA,
              orgId: l.organization_id,
            });
            if (r.ok) bilan.periodicites += 1;
          } else if (r.ok && actuelle && cible.periodicite === actuelle.periodicite && cible.montantCents < actuelle.montantCents) {
            r = await appliquerBaisseAEcheance(sous, {
              subscription: l.stripe_subscription_id,
              offre: cible,
              regime: REGIME_TVA,
              orgId: l.organization_id,
            });
            if (r.ok) bilan.baisses += 1;
          }
        } finally {
          await verrou.rendre();
        }
      }
    }
    if (!r.ok) bilan.echecs.push({ organisation: l.organisation, motif: r.erreur });

    // Portefeuille au-delà de la capacité payée : un avis, une fois par
    // échéance (la ligne n'est plus listée une fois préparée), aucun débit.
    if (r.ok && l.unites_souscrites !== null && l.unites_a_couvrir > l.unites_souscrites) {
      try {
        const echec = await envoyerAvisCapaciteDepassee(supabase, {
          orgId: l.organization_id,
          organisation: l.organisation,
          estAgence,
          capacite: l.unites_souscrites,
          aCouvrir: l.unites_a_couvrir,
          echeance: l.periode_fin,
        }, () => verifierAvantEffet(supabase, "abonnements"));
        if (echec) bilan.echecs.push({ organisation: l.organisation, motif: `avis de capacité : ${echec}` });
        else bilan.avis_capacite += 1;
      } catch (e) {
    if (e instanceof ArretSupervision) throw e;
        bilan.echecs.push({ organisation: l.organisation, motif: e instanceof Error ? e.message : "avis de capacité impossible" });
      }
    }

    await supabase.rpc("abonnement_echeance_preparee", {
      p_org: l.organization_id,
      p_periode_fin: l.periode_fin,
      p_erreur: r.ok ? null : r.erreur.slice(0, 500),
    });
  }
  return bilan;
}
