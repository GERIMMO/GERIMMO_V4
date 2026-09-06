"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EtatConge = {
  erreur?: string;
  succes?: string;
};

// Le locataire transmet son INTENTION de congé depuis son espace. Le congé
// lui-même se donne par lettre recommandée (RM-A3 : la mise à disposition en
// ligne n'a aucune valeur probante) : le gestionnaire l'enregistre à réception
// du courrier, avec la date de première présentation — c'est elle qui fait
// courir le préavis. Ici : alerte au gestionnaire, rien d'irréversible.
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

  const motif = String(formData.get("motif") ?? "").trim() || null;
  const { error } = await supabase.rpc("mon_conge_locataire", {
    p_org: orgId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/logement`);
  return {
    succes:
      "Votre gestionnaire est prévenu — envoyez maintenant votre lettre recommandée pour faire courir le préavis.",
  };
}
