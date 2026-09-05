"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatMessage = {
  erreur?: string;
  succes?: string;
};

// Messagerie locataire ↔ gestionnaire (espace locataire v10). Les RPC
// vérifient qui parle ; un message du locataire lève une alerte côté agence,
// une réponse du gérant s'affiche en badge non lu côté locataire.

export async function envoyerMessageLocataire(
  orgId: string,
  _etat: EtatMessage,
  formData: FormData
): Promise<EtatMessage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Vous n'êtes pas connecté." };

  const texte = String(formData.get("texte") ?? "").trim();
  if (!texte) return { erreur: "Écrivez votre message avant d'envoyer." };
  const { error } = await supabase.rpc("envoyer_message_locataire", {
    p_org: orgId,
    p_texte: texte,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/locataire/${orgId}/contact`);
  return { succes: "Message envoyé — votre gestionnaire est prévenu." };
}

export async function repondreMessagePersonne(
  orgId: string,
  personId: string,
  _etat: EtatMessage,
  formData: FormData
): Promise<EtatMessage> {
  const { user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const supabase = await createClient();

  const texte = String(formData.get("texte") ?? "").trim();
  if (!texte) return { erreur: "Écrivez votre réponse avant d'envoyer." };
  const { error } = await supabase.rpc("repondre_message_personne", {
    p_org: orgId,
    p_person: personId,
    p_texte: texte,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Réponse envoyée — le locataire la verra dans son espace." };
}
