"use server";

import { revalidatePath } from "next/cache";
import { envoyerEmail } from "@/lib/email";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import {
  ADRESSE_EMAIL,
  LONGUEUR_MAX_EMAIL,
  LONGUEUR_MAX_NOM_MEMO,
  cheminInvitationArtisan,
  lienInvitationArtisan,
} from "@/lib/invitations-artisan";
import { messageInvitationArtisan } from "@/lib/notifications";
import { adresseDuSite } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { METIERS_ARTISAN } from "@/app/agence/[orgId]/artisans/referentiel";

// Les gestes de l'invitation d'un artisan (décision du dirigeant du 15/10/2026).
//
// Côté PROPRIÉTAIRE : inviter, renvoyer, annuler. Toutes les règles sont en base (migration 20261014840000) : seul le
// propriétaire de l'organisation invite, une invitation en attente par adresse, 30 envois par organisation et 3 par
// adresse sur une heure, comptés AVANT l'e-mail. Ici : la session, la mise en forme de la saisie, l'e-mail, et la trace
// de son envoi. L'e-mail part avec la marque Gerimmo (c'est Gerimmo qui validera l'artisan) ; sans clé d'envoi
// configurée, l'invitation reste enregistrée et l'écran le dit : on peut la renvoyer.
//
// Côté ARTISAN : accepter ou refuser. La base n'accepte que la session dont l'adresse CONFIRMÉE est celle de
// l'invitation, et ne rattache jamais un artisan sur liste noire.

export type EtatInvitationArtisan = { erreur?: string; succes?: string; valeurs?: Record<string, string> };

const REFUS_PROPRIETAIRE = "L’invitation d’un artisan est réservée au propriétaire de cet espace.";

type Preparee = { id: string; email: string; organisation: string; expire_le: string };

/** Envoie l'e-mail d'une invitation préparée, note l'issue, et rend le message de l'écran. */
async function envoyerEtNoter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  invitation: Preparee,
  succes: string
): Promise<EtatInvitationArtisan> {
  const origine = adresseDuSite();
  const message = origine
    ? messageInvitationArtisan({
        organisation: invitation.organisation,
        lien: lienInvitationArtisan(origine, invitation.id, invitation.email),
        expireLe: invitation.expire_le,
      })
    : null;
  const envoi = message
    ? await envoyerEmail({ to: invitation.email, subject: message.sujet, html: message.html })
    : { erreur: "L’adresse du site n’est pas configurée. Contactez l’administrateur." };
  const { error: erreurTrace } = await supabase.rpc("noter_envoi_invitation_artisan", {
    p_id: invitation.id,
    p_envoye: !envoi.erreur,
  });
  revalidatePath(`/agence/${orgId}/artisans`);
  if (envoi.erreur) {
    return {
      erreur: `Invitation enregistrée, mais l’e-mail n’a pas été envoyé : ${envoi.erreur} Vous pouvez la renvoyer depuis « Mes artisans ».`,
    };
  }
  if (erreurTrace) {
    return { erreur: "L’e-mail a été envoyé, mais son suivi n’a pas pu être enregistré. Rechargez la page avant de le renvoyer." };
  }
  return { succes };
}

export async function inviterArtisan(
  orgId: string,
  _etat: EtatInvitationArtisan,
  formData: FormData
): Promise<EtatInvitationArtisan> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "proprietaire_direct") return { erreur: REFUS_PROPRIETAIRE };

  const valeurs = valeursDuFormulaire(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nom = String(formData.get("nom") ?? "").trim();
  const metier = String(formData.get("metier") ?? "");
  if (!email) return { erreur: "Indiquez l’adresse e-mail de l’artisan.", valeurs };
  if (email.length > LONGUEUR_MAX_EMAIL || !ADRESSE_EMAIL.test(email)) {
    return { erreur: "Cette adresse e-mail n’est pas valide. Vérifiez-la.", valeurs };
  }
  if (nom.length > LONGUEUR_MAX_NOM_MEMO) {
    return { erreur: `Le nom pour mémoire compte ${LONGUEUR_MAX_NOM_MEMO} caractères au plus.`, valeurs };
  }
  if (metier && !Object.hasOwn(METIERS_ARTISAN, metier)) return { erreur: "Choisissez un métier de la liste.", valeurs };

  const { data, error } = await supabase.rpc("preparer_invitation_artisan", {
    p_org: orgId,
    p_email: email,
    p_nom: nom || null,
    p_metier: metier || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  const invitation = data as Preparee | null;
  if (!invitation?.id || !invitation.email) return { erreur: "L’invitation n’a pas pu être préparée. Réessayez.", valeurs };
  return envoyerEtNoter(
    supabase,
    orgId,
    invitation,
    `Invitation envoyée à ${invitation.email}, valable 30 jours. L’artisan crée son compte et inscrit son entreprise ; Gerimmo vérifie son inscription avant que vous puissiez le solliciter.`
  );
}

export async function renvoyerInvitationArtisan(
  orgId: string,
  invitationId: string,
  _etat: EtatInvitationArtisan,
  _formData: FormData
): Promise<EtatInvitationArtisan> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "proprietaire_direct" || !estUuid(invitationId)) return { erreur: REFUS_PROPRIETAIRE };
  const { data, error } = await supabase.rpc("renvoyer_invitation_artisan", { p_id: invitationId });
  if (error) return { erreur: sansJargon(error.message) };
  if (data?.erreur) {
    revalidatePath(`/agence/${orgId}/artisans`);
    return { erreur: sansJargon(String(data.erreur)) };
  }
  const invitation = data as Preparee | null;
  if (!invitation?.id || !invitation.email) return { erreur: "L’invitation n’a pas pu être renvoyée. Réessayez." };
  return envoyerEtNoter(supabase, orgId, invitation, `Invitation renvoyée à ${invitation.email}.`);
}

export async function annulerInvitationArtisan(
  orgId: string,
  invitationId: string,
  _etat: EtatInvitationArtisan,
  _formData: FormData
): Promise<EtatInvitationArtisan> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "proprietaire_direct" || !estUuid(invitationId)) return { erreur: REFUS_PROPRIETAIRE };
  const { error } = await supabase.rpc("annuler_invitation_artisan", { p_id: invitationId });
  revalidatePath(`/agence/${orgId}/artisans`);
  if (error) return { erreur: sansJargon(error.message) };
  return { succes: "Invitation annulée. L’artisan ne pourra plus l’accepter." };
}

export async function repondreInvitationArtisan(
  invitationId: string,
  _etat: EtatInvitationArtisan,
  formData: FormData
): Promise<EtatInvitationArtisan> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !estUuid(invitationId)) return { erreur: "Reconnectez-vous pour répondre à cette invitation." };
  const decision = formData.get("decision");
  if (decision !== "accepter" && decision !== "refuser") return { erreur: "Choisissez d’accepter ou de refuser l’invitation." };
  const { data, error } = await supabase.rpc("repondre_invitation_artisan", {
    p_id: invitationId,
    p_accepter: decision === "accepter",
  });
  revalidatePath(cheminInvitationArtisan(invitationId));
  if (error || data?.erreur) return { erreur: sansJargon(error?.message ?? String(data.erreur)) };
  if (data?.etat === "acceptee") return { succes: "Invitation acceptée : vous êtes dans son carnet d’artisans." };
  return { succes: "Invitation refusée. Rien n’a été partagé avec la personne qui vous a invité." };
}
