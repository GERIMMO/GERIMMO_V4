"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatMandat = { erreur?: string; succes?: string };

// Créer un mandat (brouillon) pour une personne mandante.
export async function creerMandat(
  orgId: string,
  personId: string,
  _etat: EtatMandat,
  formData: FormData
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const dateRapport = Number(formData.get("date_rapport") ?? 10);
  const seuilRaw = String(formData.get("seuil_delegation") ?? "").trim();

  const { error } = await supabase.from("mandats").insert({
    organization_id: orgId,
    person_id: personId,
    etat: "brouillon",
    date_rapport: dateRapport >= 1 && dateRapport <= 28 ? dateRapport : 10,
    seuil_delegation: seuilRaw ? Number(seuilRaw) : null,
    created_by: user.id,
  });
  if (error) return { erreur: `Création impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Mandat créé (brouillon)." };
}

// Ajouter un lot au mandat, avec son taux d'honoraires (RM-5.1.4). Les règles
// (lot du mandant, un seul mandat actif par lot) sont vérifiées en base.
export async function ajouterLigneMandat(
  orgId: string,
  personId: string,
  mandatId: string,
  _etat: EtatMandat,
  formData: FormData
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const lotId = String(formData.get("lot_id") ?? "");
  const tauxRaw = String(formData.get("taux_honoraires") ?? "").trim();
  if (!lotId) return { erreur: "Choisissez un lot." };

  const { error } = await supabase.from("mandat_lignes").insert({
    organization_id: orgId,
    mandat_id: mandatId,
    lot_id: lotId,
    taux_honoraires: tauxRaw ? Number(tauxRaw) : 7,
  });
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Lot ajouté au mandat." };
}

// Changer l'état du mandat (brouillon → à signer → actif → préavis → résilié).
export async function changerEtatMandat(
  orgId: string,
  personId: string,
  mandatId: string,
  nouvelEtat: string,
  _etat: EtatMandat,
  _formData: FormData
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase
    .from("mandats")
    .update({ etat: nouvelEtat })
    .eq("id", mandatId)
    .eq("organization_id", orgId);
  if (error) return { erreur: `Changement d'état impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "État du mandat mis à jour." };
}
