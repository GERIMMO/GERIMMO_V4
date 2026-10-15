"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";
import { envoyerLienMotDePasse } from "@/lib/lien-mot-de-passe";
import { createClient } from "@/lib/supabase/server";
import { estUuid } from "@/lib/identifiants";
import { suiteInvitationLocataire } from "@/lib/invitations-locataire";

export type EtatInvitation = { erreur?: string; succes?: string };

export async function inviterLocataire(orgId: string, personId: string, _etat: EtatInvitation, _formData: FormData): Promise<EtatInvitation> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user || !estUuid(personId)) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("preparer_invitation_locataire", { p_org: orgId, p_person_id: personId });
  if (error) return { erreur: sansJargon(error.message) };
  if (data?.etat === "deja_actif") return { succes: "Ce compte dispose déjà d’un accès locataire actif." };
  if (!data?.id || !data?.email) return { erreur: "L’invitation n’a pas pu être préparée. Réessayez." };
  // Le même chemin que les relances automatiques (X16) : un seul lien par invitation.
  const { erreur: erreurMail } = await envoyerLienMotDePasse({
    email: data.email, motif: "invitation_locataire", organisation: orgId,
    next: suiteInvitationLocataire(data.id),
  });
  const { error: erreurTrace } = await supabase.rpc("noter_envoi_invitation_locataire", { p_id: data.id, p_envoye: !erreurMail });
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  if (erreurMail) return { erreur: `Invitation enregistrée, mais l’e-mail n’a pas été envoyé : ${erreurMail} L’accès n’est pas encore accordé. Vous pouvez réessayer.` };
  if (erreurTrace) return { erreur: "L’e-mail a été envoyé, mais son suivi n’a pas pu être confirmé. Rechargez la fiche avant de le renvoyer." };
  return { succes: `Invitation envoyée à ${data.email}. L’accès sera accordé après son acceptation, dans les 30 jours.` };
}

export async function annulerInvitation(orgId: string, personId: string, invitationId: string, _etat: EtatInvitation, _formData: FormData): Promise<EtatInvitation> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user || !estUuid(invitationId)) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("annuler_invitation_locataire", { p_id: invitationId });
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  if (error) return { erreur: sansJargon(error.message) };
  return { succes: "Invitation annulée. Aucun accès supplémentaire n’a été accordé." };
}

export async function repondreInvitation(invitationId: string, _etat: EtatInvitation, formData: FormData): Promise<EtatInvitation> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !estUuid(invitationId)) return { erreur: "Reconnectez-vous pour répondre à cette invitation." };
  const choix = formData.get("decision");
  if (choix !== "accepter" && choix !== "refuser") return { erreur: "Choisissez d’accepter ou de refuser l’invitation." };
  const { data, error } = await supabase.rpc("repondre_invitation_locataire", { p_id: invitationId, p_accepter: choix === "accepter" });
  revalidatePath(`/invitations/${invitationId}`);
  revalidatePath("/espaces");
  if (error || data?.erreur) return { erreur: sansJargon(error?.message ?? data.erreur) };
  if (data?.etat === "acceptee" && estUuid(data.organization_id)) redirect(`/locataire/${data.organization_id}`);
  return { succes: "Invitation refusée. Aucun accès n’a été ajouté à votre compte." };
}
