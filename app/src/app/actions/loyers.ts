"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";

export type EtatLoyers = { erreur?: string; succes?: string };

// Relance d'impayé ou mise en demeure (LRAR hors plateforme : date de 1re présentation).
export async function ajouterRelance(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const niveau = String(formData.get("niveau") ?? "");
  if (!["relance_1", "relance_2", "mise_en_demeure"].includes(niveau))
    return { erreur: "Niveau de relance invalide." };
  const { error } = await supabase.from("relances").insert({
    organization_id: orgId,
    bail_id: bailId,
    niveau,
    date_envoi: String(formData.get("date_envoi") ?? "").trim() || undefined,
    date_premiere_presentation:
      String(formData.get("date_premiere_presentation") ?? "").trim() || null,
    numero_recommande: String(formData.get("numero_recommande") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Relance enregistrée." };
}

export async function supprimerRelance(
  orgId: string,
  bailId: string,
  relanceId: string
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.from("relances").delete().eq("id", relanceId).eq("organization_id", orgId);
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Relance supprimée." };
}

// Régularisation annuelle des charges (justificatif obligatoire déposé en GED).
export async function regulariserCharges(
  orgId: string,
  bailId: string,
  _etat: EtatLoyers,
  formData: FormData
): Promise<EtatLoyers> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const annee = Number(String(formData.get("annee") ?? "").trim());
  const reelles = Number(String(formData.get("charges_reelles") ?? "").trim());
  if (!annee) return { erreur: "Année invalide." };
  if (Number.isNaN(reelles) || reelles < 0) return { erreur: "Charges réelles invalides." };
  const fichier = formData.get("justificatif");
  if (!(fichier instanceof File) || fichier.size === 0)
    return { erreur: "Le justificatif est obligatoire (décompte remis au locataire)." };
  const depot = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", `Décompte de charges ${annee}`);
  if (depot.erreur || !depot.documentId) return { erreur: depot.erreur ?? "Échec du dépôt du justificatif." };

  const { data, error } = await supabase.rpc("regulariser_charges", {
    p_bail: bailId,
    p_annee: annee,
    p_charges_reelles: reelles,
    p_justificatif: depot.documentId,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) return { erreur: error.message };
  const ecart = Number(data);
  const msg =
    ecart > 0
      ? `Trop-perçu de ${ecart} € à rembourser au locataire.`
      : ecart < 0
        ? `Complément de ${Math.abs(ecart)} € dû par le locataire.`
        : "Charges équilibrées (aucun écart).";
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: msg };
}

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
