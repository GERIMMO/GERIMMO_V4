"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatCompta = { erreur?: string; succes?: string };

export async function ajouterEcriture(
  orgId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const categorie = String(formData.get("categorie") ?? "").trim();
  const sens = String(formData.get("sens") ?? "");
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!categorie) return { erreur: "Catégorie obligatoire." };
  if (sens !== "recette" && sens !== "depense") return { erreur: "Sens invalide." };
  if (!montant || montant <= 0) return { erreur: "Montant invalide." };
  const { error } = await supabase.from("ecritures").insert({
    organization_id: orgId,
    categorie,
    sens,
    montant,
    date_piece: String(formData.get("date_piece") ?? "").trim() || undefined,
    date_imputation: String(formData.get("date_imputation") ?? "").trim() || undefined,
    libelle: String(formData.get("libelle") ?? "").trim() || null,
    lot_id: String(formData.get("lot_id") ?? "").trim() || null,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: "Écriture enregistrée." };
}

export async function passerContreEcriture(
  orgId: string,
  ecritureId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const motif = String(formData.get("motif") ?? "").trim();
  const { error } = await supabase.rpc("contre_ecriture", { p_ecriture: ecritureId, p_motif: motif });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: "Contre-écriture passée." };
}

export async function cloturerMois(
  orgId: string,
  _etat: EtatCompta,
  formData: FormData
): Promise<EtatCompta> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const mois = String(formData.get("mois") ?? "").trim();
  if (!mois) return { erreur: "Mois obligatoire." };
  const { error } = await supabase.rpc("cloturer_mois", { p_org: orgId, p_mois: `${mois}-01` });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/comptabilite`);
  return { succes: "Mois clôturé." };
}
