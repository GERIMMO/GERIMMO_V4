"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";
// 25/09 : la réponse du gestionnaire est annoncée par e-mail au locataire.
import { notifierReponseGestionnaire } from "@/lib/notifications";

export type EtatMessage = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
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

  const valeurs = valeursDuFormulaire(formData);
  const texte = String(formData.get("texte") ?? "").trim();
  if (!texte) return { erreur: "Écrivez votre message avant d'envoyer.", valeurs };
  const { error } = await supabase.rpc("envoyer_message_locataire", {
    p_org: orgId,
    p_texte: texte,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/locataire/${orgId}`, "layout");
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

  const valeurs = valeursDuFormulaire(formData);
  const texte = String(formData.get("texte") ?? "").trim();
  if (!texte) return { erreur: "Écrivez votre réponse avant d'envoyer.", valeurs };
  const { error } = await supabase.rpc("repondre_message_personne", {
    p_org: orgId,
    p_person: personId,
    p_texte: texte,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  // Le locataire n'a plus à deviner qu'une réponse l'attend : un e-mail, sans
  // le texte (il reste dans l'espace), avec le lien vers le fil.
  const envoi = await notifierReponseGestionnaire(supabase, orgId, personId);
  // La réponse ferme l'alerte et solde les non-lus : liste des personnes,
  // badge de la barre latérale (layout) et fiche se rafraîchissent ensemble
  revalidatePath(`/agence/${orgId}`, "layout");
  revalidatePath(`/agence/${orgId}/personnes`);
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return {
    succes: envoi.envoyee
      ? "Réponse envoyée — le locataire est prévenu par e-mail et la lira dans son espace."
      : "Réponse envoyée — le locataire la verra dans son espace.",
    avertissement: envoi.envoyee
      ? undefined
      : envoi.motif === "sans_adresse"
        ? "Le locataire n'a pas d'adresse e-mail : il ne sera prévenu qu'en ouvrant son espace."
        : "L'e-mail d'annonce n'a pas pu partir ; la réponse reste lisible dans son espace.",
  };
}
