"use server";

import { sansJargon } from "@/lib/erreurs";
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
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}` };

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
    if (error) return { erreur: sansJargon(error.message) };
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Grille enregistrée." };
}

// Relevés de compteurs de l'EDL (eau, gaz, électricité).
export async function ajouterCompteur(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const type = String(formData.get("type") ?? "").trim();
  if (!type) return { erreur: "Choisissez le type de compteur." };
  const numero = String(formData.get("numero") ?? "").trim() || null;
  const releveStr = String(formData.get("releve") ?? "").trim();
  const { error } = await supabase.from("edl_compteurs").insert({
    edl_id: edlId,
    organization_id: orgId,
    type,
    numero,
    releve: releveStr ? Number(releveStr) : null,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Relevé de compteur ajouté." };
}

export async function supprimerCompteur(
  orgId: string,
  bailId: string,
  edlId: string,
  compteurId: string
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("edl_compteurs")
    .delete()
    .eq("id", compteurId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Relevé retiré." };
}

// Clés / badges remis (et restitution en sortie).
export async function ajouterCle(
  orgId: string,
  bailId: string,
  edlId: string,
  _etat: EtatEdl,
  formData: FormData
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const libelle = String(formData.get("libelle") ?? "").trim();
  if (!libelle) return { erreur: "Précisez le type de clé." };
  const nombre = Math.max(0, Math.floor(Number(formData.get("nombre") ?? 1)) || 0);
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const { error } = await supabase.from("edl_cles").insert({
    edl_id: edlId,
    organization_id: orgId,
    libelle,
    nombre,
    reference,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Clé ajoutée." };
}

export async function supprimerCle(
  orgId: string,
  bailId: string,
  edlId: string,
  cleId: string
): Promise<EtatEdl> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("edl_cles")
    .delete()
    .eq("id", cleId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "Clé retirée." };
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
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}/edl/${edlId}`);
  return { succes: "État des lieux signé et figé." };
}
