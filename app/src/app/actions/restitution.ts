"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";

export type EtatRestit = { erreur?: string; succes?: string };

export async function demarrerRestitution(
  orgId: string,
  bailId: string,
  _etat: EtatRestit,
  formData: FormData
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const date = String(formData.get("date_remise_cles") ?? "").trim();
  if (!date) return { erreur: "Date de remise des clés obligatoire." };
  const conforme = formData.get("conforme") === "on";
  const { error } = await supabase.rpc("demarrer_restitution", {
    p_bail: bailId,
    p_date_remise: date,
    p_conforme: conforme,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Restitution démarrée." };
}

export async function ajouterRetenue(
  orgId: string,
  bailId: string,
  restitutionId: string,
  _etat: EtatRestit,
  formData: FormData
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const libelle = String(formData.get("libelle") ?? "").trim();
  const cout = Number(String(formData.get("cout") ?? "").trim());
  if (!libelle) return { erreur: "Libellé obligatoire." };
  if (!cout || cout <= 0) return { erreur: "Coût invalide." };
  const dureeStr = String(formData.get("duree_vie") ?? "").trim();
  const ageStr = String(formData.get("age") ?? "").trim();

  let justificatif: string | null = null;
  const fichier = formData.get("justificatif");
  if (fichier instanceof File && fichier.size > 0) {
    const dep = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", `Devis/facture — ${libelle}`);
    if (dep.erreur || !dep.documentId) return { erreur: dep.erreur ?? "Échec du dépôt du justificatif." };
    justificatif = dep.documentId;
  }

  const { error } = await supabase.rpc("ajouter_retenue", {
    p_restitution: restitutionId,
    p_libelle: libelle,
    p_cout: cout,
    p_duree_vie: dureeStr ? Number(dureeStr) : null,
    p_age: ageStr ? Number(ageStr) : null,
    p_justificatif: justificatif,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Retenue ajoutée." };
}

export async function supprimerRetenue(
  orgId: string,
  bailId: string,
  retenueId: string
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.from("retenues").delete().eq("id", retenueId).eq("organization_id", orgId);
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Retenue retirée." };
}

export async function finaliserDecompte(
  orgId: string,
  bailId: string,
  restitutionId: string
): Promise<EtatRestit> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data, error } = await supabase.rpc("finaliser_decompte", { p_restitution: restitutionId });
  if (error) return { erreur: error.message };
  const solde = Number(data);
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return {
    succes:
      solde < 0
        ? `Décompte finalisé — créance de ${Math.abs(solde)} € sur le locataire.`
        : `Décompte finalisé — ${solde} € à restituer au locataire.`,
  };
}
