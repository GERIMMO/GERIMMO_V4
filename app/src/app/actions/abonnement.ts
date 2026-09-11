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
} from "@/lib/stripe";

export type EtatAbonnementAction = { erreur?: string };

/**
 * L'adresse de retour, prise sur la requête en cours.
 *
 * Stripe exige des adresses ABSOLUES : une action serveur n'a pas d'origine
 * implicite. On la lit dans les en-têtes plutôt que de la fixer en dur, sans
 * quoi une recette sur un déploiement de préproduction renverrait le client en
 * production après paiement.
 */
async function origineDeLaRequete(): Promise<string | null> {
  const h = await headers();
  const explicite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicite) return explicite.replace(/\/+$/, "");
  const hote = h.get("x-forwarded-host") ?? h.get("host");
  if (!hote) return null;
  const protocole = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${protocole}://${hote}`;
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
export async function demarrerAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  _formData: FormData
): Promise<EtatAbonnementAction> {
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
      supabase.from("organizations").select("id, name, email_contact").eq("id", orgId).maybeSingle(),
      supabase.rpc("mon_abonnement", { p_org: orgId }),
    ]);
  if (erreurOrg || !org) {
    return { erreur: "Votre organisation n'a pas pu être lue. Rechargez la page." };
  }
  if (erreurEtat) return { erreur: sansJargon(erreurEtat.message) };

  const etat = ((etatBrut ?? []) as { quantite_cible: number }[])[0];
  const quantite = etat?.quantite_cible ?? 0;
  if (quantite < 1) {
    return {
      erreur:
        "Votre premier bien est offert, à vie : il n'y a rien à payer tant que vous n'en gérez qu'un.",
    };
  }

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
  const session = await creerSessionPaiement(stripe, {
    config: reglages.config,
    customer: client.customer,
    quantite,
    orgId,
    retourOk: `${retour}?paiement=ok`,
    retourAnnule: `${retour}?paiement=annule`,
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
