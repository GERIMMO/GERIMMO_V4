"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { envoyerLienMotDePasse } from "@/lib/lien-mot-de-passe";

export type EtatInvitation = { erreur?: string; succes?: string };

// Inviter une personne comme locataire : crée le compte + l'adhésion + rattache
// la fiche (fonction definer), puis envoie l'email de définition du mot de passe
// (même flux que « mot de passe oublié »).
export async function inviterLocataire(
  orgId: string,
  personId: string,
  _etat: EtatInvitation,
  _formData: FormData
): Promise<EtatInvitation> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: email, error } = await supabase.rpc("inviter_locataire", {
    p_org: orgId,
    p_person_id: personId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  const { erreur: erreurMail } = await envoyerLienMotDePasse({
    email: String(email),
    motif: "invitation_locataire",
    next: "/nouveau-mot-de-passe",
  });

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  if (erreurMail) {
    return {
      succes: `Compte locataire créé pour ${email}. L'email n'a pas pu partir (${erreurMail}).`,
    };
  }
  return {
    succes: `Invitation envoyée à ${email} : le locataire reçoit un email pour définir son mot de passe.`,
  };
}
