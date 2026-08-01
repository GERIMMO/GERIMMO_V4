"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatLoyers = { erreur?: string; succes?: string };

// Générer les appels de loyer manquants (échéancier) jusqu'au mois courant.
export async function genererAppels(orgId: string, bailId: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("generer_appels_loyer", { p_bail: bailId });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `${data ?? 0} appel(s) de loyer généré(s).` };
}

// Saisir un encaissement (imputé automatiquement du plus ancien au plus récent).
export async function ajouterEncaissement(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!montant || montant <= 0) return { erreur: "Montant invalide." };
  const date = String(formData.get("date_paiement") ?? "").trim() || null;
  const mode = String(formData.get("mode") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabase.from("encaissements").insert({
    organization_id: orgId,
    bail_id: bailId,
    montant,
    date_paiement: date ?? undefined,
    mode,
    note,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Encaissement enregistré." };
}

export async function supprimerEncaissement(
  orgId: string,
  bailId: string,
  encId: string
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("encaissements")
    .delete()
    .eq("id", encId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Encaissement supprimé." };
}

// Réviser le loyer selon l'IRL (clause requise, DPE F/G bloqué, prescription 1 an).
export async function reviserLoyer(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const ref = Number(String(formData.get("irl_reference") ?? "").trim());
  const nouv = Number(String(formData.get("irl_nouveau") ?? "").trim());
  const dateEffet = String(formData.get("date_effet") ?? "").trim();
  if (!ref || !nouv || !dateEffet) return { erreur: "Indices IRL et date d'effet obligatoires." };
  const { data, error } = await supabase.rpc("reviser_loyer", {
    p_bail: bailId,
    p_irl_reference: ref,
    p_irl_nouveau: nouv,
    p_date_effet: dateEffet,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `Loyer révisé à ${data} € HC.` };
}

// Émettre les quittances des mois intégralement soldés.
export async function emettreQuittances(orgId: string, bailId: string): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("emettre_quittances", { p_bail: bailId });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: `${data ?? 0} quittance(s) émise(s).` };
}
