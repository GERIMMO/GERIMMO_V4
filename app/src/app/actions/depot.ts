"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatDepot = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

export async function encaisserDepot(
  orgId: string,
  bailId: string,
  _etat: EtatDepot,
  formData: FormData
): Promise<EtatDepot> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!montant || montant <= 0) return { erreur: "Montant invalide.", valeurs };
  const date = String(formData.get("date") ?? "").trim() || null;
  const moyen = String(formData.get("moyen") ?? "").trim() || null;
  const versantPerson = String(formData.get("versant_person") ?? "").trim() || null;
  const versantLibelle = String(formData.get("versant_libelle") ?? "").trim() || null;
  const { error } = await supabase.rpc("encaisser_depot", {
    p_bail: bailId,
    p_montant: montant,
    p_date: date,
    p_moyen: moyen,
    p_versant_person: versantPerson,
    p_versant_libelle: versantLibelle,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Encaissement enregistré." };
}

export async function supprimerEncaissementDepot(
  orgId: string,
  bailId: string,
  encId: string
): Promise<EtatDepot> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("depot_encaissements")
    .delete()
    .eq("id", encId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Encaissement retiré." };
}
