"use server";

import { sansJargon } from "@/lib/erreurs";
import { lireInterlocuteurLocataire } from "@/lib/interlocuteur-locataire-serveur";
import { messageDeLaBasePourLocataire } from "@/lib/interlocuteur-locataire";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatConge = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Le locataire transmet son INTENTION de congé depuis son espace. Le congé
// lui-même se donne par lettre recommandée (RM-A3 : la mise à disposition en
// ligne n'a aucune valeur probante) : le gestionnaire l'enregistre à réception
// du courrier, avec la date de réception effective — c'est elle qui fait
// courir le préavis (lot T1 : plus la « première présentation »). Ici : alerte au gestionnaire, rien d'irréversible.
export async function donnerMonConge(
  orgId: string,
  _etat: EtatConge,
  formData: FormData
): Promise<EtatConge> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Vous n'êtes pas connecté." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim() || null;
  const { error } = await supabase.rpc("mon_conge_locataire", {
    p_org: orgId,
    p_motif: motif,
  });
  // Lot 47 : les refus de la base renvoient à « votre gestionnaire » ; hors agence, c'est le bailleur.
  if (error) return { erreur: messageDeLaBasePourLocataire(sansJargon(error.message), await lireInterlocuteurLocataire(supabase, orgId)), valeurs };

  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/logement`);
  // Lot 47 : « votre gestionnaire » seulement dans un espace d'agence ; chez un propriétaire, « votre bailleur ».
  return {
    succes: `Votre ${await lireInterlocuteurLocataire(supabase, orgId)} est prévenu — envoyez maintenant votre lettre recommandée pour faire courir le préavis.`,
  };
}
