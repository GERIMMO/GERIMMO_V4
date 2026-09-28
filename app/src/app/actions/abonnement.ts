"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import {
  assurerClientStripe,
  clientStripe,
  configurationStripe,
  creerSessionPaiement,
  ouvrirPortailFacturation,
  prixPour,
  type PublicTarif,
} from "@/lib/stripe";
import { origineDeRetour } from "@/lib/site";
import { REGIME_TVA } from "@/lib/editeur";
import {
  GRILLE,
  apercuChangement,
  appliquerHausse,
  creerSessionOffre,
  offrePour,
  resilierAEcheance,
} from "@/lib/stripe-offres";
import { offreAgence, offreParticulier, type Periodicite } from "@/lib/tarifs";

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
 * action ne porte AUCUNE clé de service — souscrire est un geste d'utilisateur
 * connecté, pas une tâche de plateforme. La seule clé qu'elle touche est celle
 * de Stripe, qui ne donne accès qu'à la facturation.
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
  if (etat.grille !== GRILLE) return demarrerAbonnementHistorique(orgId);

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

  const { data: clientExistant } = await supabase.rpc("mon_client_stripe", { p_org: orgId });
  const stripe = clientStripe(reglages.config);
  const client = await assurerClientStripe(stripe, {
    orgId,
    nom: org.name,
    email: org.email_contact ?? null,
    existant: (clientExistant as string | null) ?? null,
  });
  if (!client.ok) return { erreur: client.erreur };
  const { error: erreurPose } = await supabase.rpc("abonnement_client_pose", {
    p_org: orgId,
    p_customer: client.customer,
  });
  if (erreurPose) return { erreur: sansJargon(erreurPose.message) };

  const retour = `${origine}/agence/${orgId}/abonnement`;
  const session = await creerSessionOffre(stripe, {
    offre,
    regime: REGIME_TVA,
    customer: client.customer,
    orgId,
    retourOk: `${retour}?paiement=ok`,
    retourAnnule: `${retour}?paiement=annule`,
    essaiFin: etat.statut === "essai" ? etat.essai_fin : null,
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
  if ((paiement.montant_periode_cents ?? 0) >= offre.montantCents) {
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
  });
  if (!r.ok) {
    return { erreur: `Le changement n'a pas été appliqué, rien n'a été modifié : ${r.erreur}` };
  }
  redirect(`/agence/${orgId}/abonnement?changement=ok`);
}

/** Demander une autre périodicité pour la prochaine échéance (particuliers). */
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
  redirect(`/agence/${orgId}/abonnement?resiliation=${resilier ? "programmee" : "annulee"}`);
}

async function demarrerAbonnementHistorique(orgId: string): Promise<EtatAbonnementAction> {
  const reglages = configurationStripe();
  if (!reglages.pret) {
    return {
      erreur:
        "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous : nous prolongeons votre accès le temps de le mettre en place.",
    };
  }
  const origine = await origineDeLaRequete();
  if (!origine) {
    return { erreur: "L'adresse du site n'a pas pu être déterminée. Rechargez la page." };
  }

  const supabase = await createClient();
  const [{ data: org, error: erreurOrg }, { data: etatBrut, error: erreurEtat }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, type, email_contact")
        .eq("id", orgId)
        .maybeSingle(),
      supabase.rpc("etat_abonnement", { p_org: orgId }),
    ]);
  if (erreurOrg || !org) {
    return { erreur: "Votre organisation n'a pas pu être lue. Rechargez la page." };
  }
  if (erreurEtat) return { erreur: sansJargon(erreurEtat.message) };

  const etat = ((etatBrut ?? []) as {
    statut: string;
    essai_fin: string | null;
    unites_facturees: number;
    en_ligne_possible: boolean;
    unite: string;
  }[])[0];
  const quantite = etat?.unites_facturees ?? 0;
  if (quantite < 1) {
    return {
      erreur:
        org.type === "agence"
          ? "Aucun lot n'est encore sous mandat actif : il n'y a rien à facturer."
          : "Votre premier bien est offert, à vie : il n'y a rien à payer tant que vous n'en gérez qu'un.",
    };
  }
  // AU-DELÀ DU SEUIL, ON NE VEND PAS EN LIGNE. Un portefeuille de cette taille
  // suppose une reprise comptable, une formation, un engagement : le laisser
  // souscrire d'un clic, c'est promettre un accompagnement qu'on n'a pas prévu.
  if (etat && !etat.en_ligne_possible) {
    return {
      erreur:
        "Au-delà de 600 lots, l'abonnement se met en place avec nous : écrivez-nous, nous préparons votre devis et la reprise de votre portefeuille.",
    };
  }

  const tarif = prixPour(
    reglages.config,
    (org.type === "agence" ? "agence" : "proprietaire_direct") as PublicTarif
  );
  if (!tarif.ok) return { erreur: tarif.erreur };

  const { data: clientExistant } = await supabase.rpc("mon_client_stripe", { p_org: orgId });
  const stripe = clientStripe(reglages.config);
  const client = await assurerClientStripe(stripe, {
    orgId,
    nom: org.name,
    email: org.email_contact ?? null,
    existant: (clientExistant as string | null) ?? null,
  });
  if (!client.ok) return { erreur: client.erreur };

  // On enregistre le client AVANT d'ouvrir la page de paiement. Dans l'autre
  // ordre, un client qui paie puis ferme son onglet laisserait un webhook
  // portant un identifiant qu'on ne saurait rattacher à personne.
  const { error: erreurPose } = await supabase.rpc("abonnement_client_pose", {
    p_org: orgId,
    p_customer: client.customer,
  });
  if (erreurPose) return { erreur: sansJargon(erreurPose.message) };

  const retour = `${origine}/agence/${orgId}/abonnement`;
  // SOUSCRIRE PENDANT L'ESSAI NE FAIT PAS PAYER PLUS TÔT (décision du 24/09) :
  // la fin d'essai part chez Stripe, qui n'y débite la carte qu'à cette date.
  // Elle n'a de sens que pour un compte encore en essai — un compte actif ou
  // suspendu n'a pas d'essai à reporter, et un essai déjà passé est écarté par
  // l'adaptateur lui-même. La base tient `trialing` pour payé depuis les
  // migrations 20260911300000 et 20260912090000 : rien à migrer.
  const session = await creerSessionPaiement(stripe, {
    prix: tarif.prix,
    customer: client.customer,
    quantite,
    orgId,
    retourOk: `${retour}?paiement=ok`,
    retourAnnule: `${retour}?paiement=annule`,
    essaiFin: etat?.statut === "essai" ? etat.essai_fin : null,
  });
  if (!session.ok) return { erreur: session.erreur };
  redirect(session.url);
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
