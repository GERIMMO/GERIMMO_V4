"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import {
  assurerClientStripe,
  clientStripe,
  configurationStripe,
  ouvrirPortailFacturation,
  verifierClientDeLOrganisation,
} from "@/lib/stripe";
import { origineDeRetour } from "@/lib/site";
import { REGIME_TVA } from "@/lib/editeur";
import {
  GRILLE,
  apercuChangement,
  appliquerHausse,
  creerSessionOffre,
  libererEcheancierDe,
  offrePour,
  resilierAEcheance,
  type ChoixOffre,
} from "@/lib/stripe-offres";
import { clientDeService } from "@/lib/supabase/service";
import { offreAgence, offreParticulier, type Offre, type Periodicite } from "@/lib/tarifs";

export type EtatAbonnementAction = { erreur?: string };

/**
 * L'adresse de retour, prise sur la requête en cours.
 *
 * Stripe exige des adresses ABSOLUES : une action serveur n'a pas d'origine
 * implicite. On la lit dans les en-têtes plutôt que de la fixer en dur, sans
 * quoi une recette sur un déploiement de préproduction renverrait le client en
 * production après paiement.
 *
 * C'est ce que le commentaire promettait ; ce n'est ce que le code fait que
 * depuis le 12/09. `NEXT_PUBLIC_SITE_URL` passait AVANT l'en-tête : posée sur
 * tous les environnements Vercel — ce que personne ne pense à éviter — elle
 * renvoyait bel et bien en production un client qui payait depuis une
 * préproduction. La priorité vit désormais dans `origineDeRetour`, avec la
 * raison écrite à côté.
 */
async function origineDeLaRequete(): Promise<string | null> {
  const h = await headers();
  return origineDeRetour(
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto")
  );
}

/**
 * Souscrire : ouvrir la page de paiement de Stripe.
 *
 * QUI PEUT L'APPELER. Les trois gardes tiennent en base : `abonnement_client_pose`
 * et `mon_client_stripe` sont réservées au responsable de l'organisation. Cette
 * action ne porte la clé de service que pour deux gestes d'exception, chacun
 * APRÈS qu'une lecture réservée au responsable a prouvé le droit : remplacer
 * un client Stripe supprimé, et quitter la grille historique sans
 * souscription vivante (audit 29/09). Elle touche aussi la clé de Stripe, qui
 * ne donne accès qu'à la facturation.
 *
 * ELLE MARCHE MÊME SI LE COMPTE EST FERMÉ, et c'est le point délicat : la garde
 * d'écriture des comptes suspendus exclut délibérément les tables d'abonnement
 * (migration 20260911300000). Sans cette exclusion, le client ne pourrait pas
 * payer parce qu'il n'a pas payé.
 */
type EtatAbonnementLu = {
  statut: string;
  essai_fin: string | null;
  public_tarif: "agence" | "proprietaire_direct";
  unites_facturees: number;
  en_ligne_possible: boolean;
  grille: string;
  unites_a_couvrir: number | null;
  unites_souscrites: number | null;
};

type PaiementLu = {
  souscrit: boolean;
  periodicite: Periodicite;
  formule: string | null;
  unites_souscrites: number | null;
  montant_periode_cents: number | null;
  stripe_statut: string | null;
};

/** Le régime de TVA déclaré — sans lui, aucune souscription de la nouvelle grille. */
const REGIME_ABSENT =
  "Le paiement en ligne n'est pas encore ouvert : le régime de TVA de l'éditeur doit d'abord être renseigné pour afficher les taxes exactes. Écrivez-nous : nous prolongeons votre essai le temps de l'ouvrir.";

function lirePeriodicite(v: FormDataEntryValue | null): Periodicite | null {
  return v === "mensuel" || v === "annuel" ? v : null;
}

function lireEntier(v: FormDataEntryValue | null): number | null {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isSafeInteger(n) ? n : null;
}

async function lireEtat(orgId: string) {
  const supabase = await createClient();
  const [{ data: org }, { data: etatBrut, error: erreurEtat }, { data: paiementBrut, error: erreurPaiement }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, type, email_contact").eq("id", orgId).maybeSingle(),
      supabase.rpc("etat_abonnement", { p_org: orgId }),
      supabase.rpc("mon_abonnement", { p_org: orgId }),
    ]);
  return {
    supabase,
    org: org as { id: string; name: string; type: string; email_contact: string | null } | null,
    etat: ((etatBrut ?? []) as EtatAbonnementLu[])[0] ?? null,
    paiement: ((paiementBrut ?? []) as PaiementLu[])[0] ?? null,
    erreur: erreurEtat?.message ?? erreurPaiement?.message ?? null,
  };
}

/**
 * « explicite » quand l'offre coûte plus que celle qui couvre le portefeuille
 * d'aujourd'hui : le client a choisi une formule supérieure (ou des lots en
 * réserve). La tâche de nuit ne la rabaisse pas d'elle-même à l'échéance.
 */
function choixDe(offre: Offre, unitesACouvrir: number): ChoixOffre {
  const couvrante =
    offre.public === "agence" ? offreAgence(unitesACouvrir) : offreParticulier(unitesACouvrir, offre.periodicite);
  return offre.montantCents > couvrante.montantCents || offre.capacite > Math.max(couvrante.capacite, unitesACouvrir)
    ? "explicite"
    : "auto";
}

/**
 * Le client Stripe de l'organisation, retrouvé, créé ou REMPLACÉ, puis
 * enregistré. Un client supprimé chez Stripe (audit 29/09, point 12) est
 * remplacé par le chemin de service : `abonnement_client_pose` ne remplace
 * jamais un client existant, et c'est voulu — l'identifiant suivi ne vient
 * pas du navigateur. Le remplacement n'a lieu qu'après que `mon_client_stripe`
 * (réservée au responsable) a rendu l'ancien identifiant, et que Stripe a dit,
 * à nous, qu'il est supprimé.
 */
async function assurerEtEnregistrerClient(
  stripe: ReturnType<typeof clientStripe>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  org: { name: string; email_contact: string | null }
): Promise<{ ok: true; customer: string } | { ok: false; erreur: string }> {
  const { data: clientExistant } = await supabase.rpc("mon_client_stripe", { p_org: orgId });
  const existant = (clientExistant as string | null) ?? null;
  const client = await assurerClientStripe(stripe, {
    orgId,
    nom: org.name,
    email: org.email_contact ?? null,
    existant,
  });
  if (!client.ok) return client;
  // Le client Stripe doit porter l'identifiant de CETTE organisation, relu
  // chez Stripe par le serveur, avant tout enregistrement (audit sécurité
  // 29/09).
  const appartient = await verifierClientDeLOrganisation(stripe, client.customer, orgId);
  if (!appartient.ok) return appartient;
  if (client.remplace && existant) {
    const service = clientDeService();
    if (!service) {
      return { ok: false, erreur: "Votre dossier de paiement doit être recréé : écrivez-nous, nous le faisons aussitôt." };
    }
    const { error } = await service.rpc("abonnement_client_remplace", {
      p_org: orgId,
      p_ancien: existant,
      p_nouveau: client.customer,
    });
    if (error) return { ok: false, erreur: sansJargon(error.message) };
    return { ok: true, customer: client.customer };
  }
  // On enregistre le client AVANT d'ouvrir la page de paiement. Dans l'autre
  // ordre, un client qui paie puis ferme son onglet laisserait un webhook
  // portant un identifiant qu'on ne saurait rattacher à personne.
  const { error: erreurPose } = await supabase.rpc("abonnement_client_pose", {
    p_org: orgId,
    p_customer: client.customer,
  });
  if (erreurPose) return { ok: false, erreur: sansJargon(erreurPose.message) };
  return { ok: true, customer: client.customer };
}

/**
 * Souscrire : ouvrir la page de paiement de Stripe, avec le MONTANT que le
 * client vient de lire. Grille du 28/09/2026 : formule et périodicité
 * choisies, formule plus chère que nécessaire seulement si elle est choisie
 * explicitement, case de confirmation cochée, montant recalculé ici et
 * comparé à celui qui a été affiché — un écart refuse la souscription.
 */
export async function demarrerAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const { supabase, org, etat, paiement, erreur } = await lireEtat(orgId);
  if (erreur) return { erreur: sansJargon(erreur) };
  if (!org || !etat) return { erreur: "Votre organisation n'a pas pu être lue. Rechargez la page." };
  if (etat.grille !== GRILLE) return basculerVersGrilleActuelle(orgId, paiement);

  if (paiement?.souscrit) {
    return { erreur: "Un abonnement est déjà en cours : changez de formule depuis cette page plutôt que d'en ouvrir un second." };
  }
  if (formData.get("confirmation") !== "oui") {
    return { erreur: "Cochez la case de confirmation après avoir vérifié le montant." };
  }
  const reglages = configurationStripe();
  if (!reglages.pret) {
    return { erreur: "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous : nous prolongeons votre accès le temps de le mettre en place." };
  }
  if (!REGIME_TVA) return { erreur: REGIME_ABSENT };

  const estAgence = etat.public_tarif === "agence";
  const periodicite: Periodicite = estAgence ? "mensuel" : (lirePeriodicite(formData.get("periodicite")) ?? "mensuel");
  const unites = etat.unites_a_couvrir ?? 0;
  const offre = estAgence
    ? offreAgence(unites)
    : offrePour("proprietaire_direct", unites, periodicite, String(formData.get("formule") ?? "") || offreParticulier(unites, periodicite).formule.code);
  if (!offre) {
    return { erreur: `Cette formule ne couvre pas vos ${unites} biens : choisissez une formule qui les couvre.` };
  }
  if (lireEntier(formData.get("montant_attendu_cents")) !== offre.montantCents) {
    return { erreur: "Le montant a changé depuis l'affichage (votre portefeuille a évolué) : vérifiez le récapitulatif mis à jour, puis confirmez à nouveau." };
  }

  const origine = await origineDeLaRequete();
  if (!origine) return { erreur: "L'adresse du site n'a pas pu être déterminée. Rechargez la page." };

  const stripe = clientStripe(reglages.config);
  const client = await assurerEtEnregistrerClient(stripe, supabase, orgId, org);
  if (!client.ok) return { erreur: client.erreur };

  const retour = `${origine}/agence/${orgId}/abonnement`;
  const session = await creerSessionOffre(stripe, {
    offre,
    regime: REGIME_TVA,
    customer: client.customer,
    orgId,
    retourOk: `${retour}?paiement=ok`,
    retourAnnule: `${retour}?paiement=annule`,
    essaiFin: etat.statut === "essai" ? etat.essai_fin : null,
    choix: choixDe(offre, unites),
  });
  if (!session.ok) return { erreur: session.erreur };
  redirect(session.url);
}

/**
 * Confirmer une HAUSSE de capacité (formule supérieure, biens supplémentaires,
 * lots sous mandat). Le client a lu le nouveau montant, sa date d'effet et le
 * prorata calculé par Stripe ; on recalcule tout ici, avec la même date de
 * prorata, et l'on refuse si un seul chiffre a bougé. La capacité n'est
 * relevée en base que par le webhook, d'après ce que Stripe facture.
 */
export async function confirmerHausse(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const { supabase, etat, paiement, erreur } = await lireEtat(orgId);
  if (erreur) return { erreur: sansJargon(erreur) };
  if (!etat || !paiement) return { erreur: "Votre abonnement n'a pas pu être lu. Rechargez la page." };
  if (etat.grille !== GRILLE || !paiement.souscrit) {
    return { erreur: "Aucun abonnement de la grille actuelle n'est en cours pour cette organisation." };
  }
  if (formData.get("confirmation") !== "oui") {
    return { erreur: "Cochez la case de confirmation après avoir vérifié le nouveau montant." };
  }
  const reglages = configurationStripe();
  if (!reglages.pret) return { erreur: "Le paiement en ligne n'est pas ouvert." };
  if (!REGIME_TVA) return { erreur: REGIME_ABSENT };

  const unites = lireEntier(formData.get("unites"));
  if (unites === null || unites < Math.max(1, etat.unites_a_couvrir ?? 0)) {
    return { erreur: "La capacité demandée doit couvrir au moins votre portefeuille actuel." };
  }
  const offre = offrePour(etat.public_tarif, unites, paiement.periodicite, String(formData.get("formule") ?? ""));
  if (!offre) return { erreur: "Cette formule ne couvre pas le nombre de biens demandé." };
  // Une hausse de CAPACITÉ au même prix reste une hausse à confirmer (une
  // agence de 5 lots qui en confie un 6ᵉ reste dans le socle) : elle n'est
  // refusée que si elle n'augmente ni le montant ni la capacité.
  if (
    (paiement.montant_periode_cents ?? 0) >= offre.montantCents &&
    offre.capacite <= (paiement.unites_souscrites ?? 0)
  ) {
    return { erreur: "Ce changement ne coûte pas plus cher : une baisse s'applique d'elle-même à la prochaine échéance." };
  }
  if (lireEntier(formData.get("montant_attendu_cents")) !== offre.montantCents) {
    return { erreur: "Le montant a changé depuis l'affichage : vérifiez le récapitulatif mis à jour." };
  }
  const prorationDate = lireEntier(formData.get("proration_date"));
  if (!prorationDate) return { erreur: "Le calcul du prorata a expiré : rechargez la page." };

  const { data: souscription } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
  if (!souscription) return { erreur: "Votre souscription n'a pas pu être retrouvée. Rechargez la page." };
  const stripe = clientStripe(reglages.config);
  const apercu = await apercuChangement(stripe, {
    subscription: souscription as string,
    offre,
    regime: REGIME_TVA,
    maintenant: prorationDate,
  });
  if (!apercu.ok) return { erreur: apercu.erreur };
  if (apercu.immediatCents !== lireEntier(formData.get("immediat_attendu_cents"))) {
    return { erreur: "Le prorata a changé depuis l'affichage : vérifiez le montant mis à jour, puis confirmez à nouveau." };
  }
  const r = await appliquerHausse(stripe, {
    subscription: souscription as string,
    offre,
    regime: REGIME_TVA,
    orgId,
    prorationDate,
    choix: choixDe(offre, etat.unites_a_couvrir ?? 0),
  });
  if (!r.ok) {
    return { erreur: `Le changement n'a pas été appliqué, rien n'a été modifié : ${r.erreur}` };
  }
  // L'échéancier libéré emportait une baisse ou une périodicité programmée :
  // la tâche de nuit la reprogrammera, sur la nouvelle offre.
  if (r.echeancierLibere) await supabase.rpc("abonnement_changements_a_recalculer", { p_org: orgId });
  redirect(`/agence/${orgId}/abonnement?changement=ok`);
}

/**
 * Demander une autre périodicité pour la prochaine échéance (particuliers),
 * ou revenir sur cette demande. Un échéancier déjà programmé par la tâche de
 * nuit est libéré (audit 29/09, point 5) : sinon, une demande ANNULÉE
 * s'appliquerait quand même à l'échéance. La tâche de nuit reprogramme ce qui
 * reste à faire (la demande remet l'échéance « à préparer »).
 */
export async function demanderPeriodicite(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const periodicite = lirePeriodicite(formData.get("periodicite"));
  if (!periodicite) return { erreur: "Choisissez mensuel ou annuel." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("demander_periodicite_suivante", {
    p_org: orgId,
    p_periodicite: periodicite,
  });
  if (error) return { erreur: sansJargon(error.message) };
  const reglages = configurationStripe();
  if (reglages.pret) {
    const { data: souscription } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
    if (souscription) {
      const r = await libererEcheancierDe(clientStripe(reglages.config), souscription as string);
      if (!r.ok) {
        return {
          erreur: `Votre demande est enregistrée, mais le changement déjà programmé chez notre prestataire de paiement n'a pas pu être retiré (${r.erreur}). Réessayez dans un instant.`,
        };
      }
    }
  }
  redirect(`/agence/${orgId}/abonnement?periodicite=programmee`);
}

/** Résilier pour la prochaine échéance, ou revenir sur cette résiliation. */
export async function resilierAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const resilier = formData.get("resilier") === "oui";
  const reglages = configurationStripe();
  if (!reglages.pret) return { erreur: "Le paiement en ligne n'est pas ouvert." };
  const supabase = await createClient();
  const { data: souscription, error } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  if (!souscription) return { erreur: "Aucun abonnement en cours à résilier." };
  const r = await resilierAEcheance(clientStripe(reglages.config), {
    subscription: souscription as string,
    resilier,
  });
  if (!r.ok) return { erreur: r.erreur };
  // Un échéancier libéré (audit 29/09, point 5) : si la résiliation est levée,
  // la tâche de nuit doit pouvoir reprogrammer l'échéance.
  if (r.echeancierLibere) await supabase.rpc("abonnement_changements_a_recalculer", { p_org: orgId });
  redirect(`/agence/${orgId}/abonnement?resiliation=${resilier ? "programmee" : "annulee"}`);
}

/**
 * Grille historique : plus de nouvelle souscription à l'ancienne grille.
 *
 * Audit 29/09, point 10. Une organisation restée sur la grille historique SANS
 * souscription vivante tombait sur « votre premier bien est offert, il n'y a
 * rien à payer » — alors que la décision du 28/09 supprime cette gratuité et
 * gèle le compte jusqu'au paiement : une impasse. Elle bascule désormais sur
 * la grille actuelle (chemin de service, après la preuve que l'appelant est
 * le responsable : `mon_abonnement` ne rend rien à un autre), puis revient
 * sur « Mon abonnement », qui présente les formules et le montant exact avant
 * toute page de paiement. Celle qui paie encore à l'ancienne garde sa
 * souscription : elle se gère dans le portail.
 */
async function basculerVersGrilleActuelle(
  orgId: string,
  paiement: PaiementLu | null
): Promise<EtatAbonnementAction> {
  if (!paiement) return { erreur: "Réservé au responsable de l'organisation." };
  if (paiement.souscrit) {
    return {
      erreur:
        "Votre abonnement est en cours sur l'ancienne grille : il n'y a rien à souscrire de nouveau. Carte, factures et résiliation se règlent depuis « Carte et factures ».",
    };
  }
  const service = clientDeService();
  if (!service) {
    return { erreur: "La souscription n'a pas pu être ouverte. Écrivez-nous : nous prolongeons votre accès le temps de régler cela." };
  }
  const { error } = await service.rpc("abonnement_basculer_grille", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  redirect(`/agence/${orgId}/abonnement?grille=actuelle`);
}

/**
 * L'espace de facturation : carte, factures, adresse, résiliation.
 *
 * Tout y est tenu par Stripe. Le réécrire prendrait des semaines pour un
 * résultat moins fiable — et une résiliation qu'on code soi-même est une
 * résiliation qu'on peut rater.
 */
export async function ouvrirPortailAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  _formData: FormData
): Promise<EtatAbonnementAction> {
  const reglages = configurationStripe();
  if (!reglages.pret) {
    return { erreur: "Le paiement en ligne n'est pas encore ouvert." };
  }
  const origine = await origineDeLaRequete();
  if (!origine) {
    return { erreur: "L'adresse du site n'a pas pu être déterminée. Rechargez la page." };
  }

  const supabase = await createClient();
  const { data: client, error } = await supabase.rpc("mon_client_stripe", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  if (!client) {
    return {
      erreur:
        "Aucun abonnement n'est encore ouvert pour cette organisation : il n'y a pas de facture à consulter.",
    };
  }

  const portail = await ouvrirPortailFacturation(clientStripe(reglages.config), {
    customer: client as string,
    retour: `${origine}/agence/${orgId}/abonnement`,
  });
  if (!portail.ok) return { erreur: portail.erreur };
  redirect(portail.url);
}
