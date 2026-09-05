"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formaterDate } from "@/lib/ged";

export type EtatConge = {
  erreur?: string;
  succes?: string;
  dateFin?: string;
};

// Le locataire donne son congé depuis son espace (maquette v10). Le RPC
// vérifie que l'appelant est bien le locataire du bail, calcule le préavis
// (meublé ou zone tendue : 1 mois ; sinon 3), passe le bail en préavis et
// alerte le gestionnaire.
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
  const { data, error } = await supabase.rpc("mon_conge_locataire", {
    p_org: orgId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/logement`);
  const dateFin = String(data);
  return {
    succes: `Congé transmis à votre gestionnaire — votre bail prendra fin le ${formaterDate(dateFin)}.`,
    dateFin,
  };
}
