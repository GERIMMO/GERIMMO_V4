"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatEdl = { erreur?: string; succes?: string };

// Créer un EDL (entrée ou sortie) pour un bail, puis générer sa grille.
export async function creerEdl(
  orgId: string,
  bailId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const type = String(formData.get("type") ?? "entree");
  const { data, error } = await supabase
    .from("etats_des_lieux")
    .insert({ organization_id: orgId, bail_id: bailId, type })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${error.message}` };

  const { error: erreurGrille } = await supabase.rpc("generer_grille_edl", { p_edl: data.id });
  if (erreurGrille) return { erreur: erreurGrille.message };

  redirect(`/agence/${orgId}/baux/${bailId}/edl/${data.id}`);
}

// Enregistrer toute la grille (état + commentaire par ligne) tant que non signé.
export async function majGrilleEdl(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: lignes } = await supabase
    .from("edl_lignes")
    .select("id")
    .eq("edl_id", edlId)
    .eq("organization_id", orgId);

  for (const l of lignes ?? []) {
    const etat = String(formData.get(`etat_${l.id}`) ?? "");
    const commentaire = String(formData.get(`commentaire_${l.id}`) ?? "").trim();
    const { error } = await supabase
      .from("edl_lignes")
      .update({ etat: etat || null, commentaire: commentaire || null })
      .eq("id", l.id)
      .eq("organization_id", orgId);
    if (error) return { erreur: error.message };
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Grille enregistrée." };
}

// Signer l'EDL (aucune ligne sans état ; fige ensuite).
export async function signerEdl(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  _formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("signer_edl", { p_edl: edlId });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "État des lieux signé et figé." };
}
