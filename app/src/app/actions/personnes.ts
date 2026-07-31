"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatPersonne = { erreur?: string; succes?: string };

// Créer une fiche personne (sans rôle). Doublon nom + date de naissance :
// alerté, non bloquant (RM-0b — le dossier suit la personne dans l'agence).
export async function creerPersonne(
  orgId: string,
  _etat: EtatPersonne,
  formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const nom = String(formData.get("nom") ?? "").trim();
  const prenom = String(formData.get("prenom") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateNaissance = String(formData.get("date_naissance") ?? "").trim();

  if (!nom) return { erreur: "Le nom est obligatoire." };

  let doublon = false;
  if (dateNaissance) {
    const { data } = await supabase
      .from("persons")
      .select("id")
      .eq("organization_id", orgId)
      .ilike("nom", nom)
      .eq("date_naissance", dateNaissance);
    doublon = (data ?? []).length > 0;
  }

  const { data: cree, error } = await supabase
    .from("persons")
    .insert({
      organization_id: orgId,
      nom,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      date_naissance: dateNaissance || null,
    })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${error.message}` };

  // Doublon = on reste sur la liste avec l'avertissement (non bloquant)
  if (doublon) {
    revalidatePath(`/agence/${orgId}/personnes`);
    return {
      succes:
        "Fiche créée. ⚠️ Un homonyme avec la même date de naissance existe déjà — à vérifier.",
    };
  }
  revalidatePath(`/agence/${orgId}/personnes`);
  redirect(`/agence/${orgId}/personnes/${cree.id}`);
}

// Modifier l'email d'une personne (rattachement au compte, RM-0b) — modifiable
// par l'agent.
export async function modifierContactPersonne(
  orgId: string,
  personId: string,
  _etat: EtatPersonne,
  formData: FormData
): Promise<EtatPersonne> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const email = String(formData.get("email") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();

  const { error } = await supabase
    .from("persons")
    .update({ email: email || null, telephone: telephone || null })
    .eq("id", personId)
    .eq("organization_id", orgId);
  if (error) return { erreur: `Modification impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Coordonnées mises à jour." };
}
