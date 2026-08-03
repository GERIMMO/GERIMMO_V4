"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { proposerNature, type NatureCharge } from "@/lib/charges";

export type EtatAppel = { erreur?: string; succes?: string };

function chemin(orgId: string, bienId: string, lotId: string) {
  return `/agence/${orgId}/parc/${bienId}/lots/${lotId}`;
}

export async function creerAppelCharges(
  orgId: string,
  bienId: string,
  lotId: string,
  _etat: EtatAppel,
  formData: FormData
): Promise<EtatAppel> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const exercice = Number(String(formData.get("exercice") ?? "").trim());
  const total = Number(String(formData.get("total") ?? "").trim());
  if (!exercice || exercice < 2000 || exercice > 2100) return { erreur: "Exercice invalide." };
  if (!total || total <= 0) return { erreur: "Total de l'appel invalide." };
  const dateReception = String(formData.get("date_reception") ?? "").trim() || null;

  let documentId: string | null = null;
  const fichier = formData.get("document");
  if (fichier instanceof File && fichier.size > 0) {
    const dep = await deposerFichierGed(
      supabase, user, orgId, fichier, "justificatif", `Appel de charges ${exercice}`
    );
    if (dep.erreur || !dep.documentId) return { erreur: dep.erreur ?? "Échec du dépôt du document." };
    documentId = dep.documentId;
  }

  const { error } = await supabase.from("appels_charges").insert({
    organization_id: orgId,
    lot_id: lotId,
    exercice,
    date_reception: dateReception ?? undefined,
    total,
    document_id: documentId,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(chemin(orgId, bienId, lotId));
  return { succes: "Appel de charges créé." };
}

export async function ajouterPosteCharge(
  orgId: string,
  bienId: string,
  lotId: string,
  appelId: string,
  _etat: EtatAppel,
  formData: FormData
): Promise<EtatAppel> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montant = Number(String(formData.get("montant") ?? "").trim());
  if (!libelle) return { erreur: "Libellé du poste obligatoire." };
  if (!montant || montant <= 0) return { erreur: "Montant du poste invalide." };

  // La grille décret 87-713 propose la nature ; l'agent corrigera si besoin.
  const proposition = proposerNature(libelle);
  const { error } = await supabase.from("appel_charges_postes").insert({
    organization_id: orgId,
    appel_id: appelId,
    libelle,
    montant,
    nature: proposition.nature,
    fonds_alur: proposition.fonds_alur,
    propose: true,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(chemin(orgId, bienId, lotId));
  return { succes: "Poste ajouté." };
}

export async function modifierPosteCharge(
  orgId: string,
  bienId: string,
  lotId: string,
  posteId: string,
  _etat: EtatAppel,
  formData: FormData
): Promise<EtatAppel> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const nature = String(formData.get("nature") ?? "") as NatureCharge;
  if (!["recuperable", "non_recuperable", "a_qualifier"].includes(nature))
    return { erreur: "Nature invalide." };
  const fondsAlur = formData.get("fonds_alur") === "on";
  if (fondsAlur && nature === "recuperable")
    return { erreur: "Le fonds travaux ALUR n'est jamais récupérable : il reste à la charge du propriétaire." };
  const { error } = await supabase
    .from("appel_charges_postes")
    .update({ nature, fonds_alur: fondsAlur, propose: false })
    .eq("id", posteId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(chemin(orgId, bienId, lotId));
  return { succes: "Poste qualifié." };
}

export async function supprimerPosteCharge(
  orgId: string,
  bienId: string,
  lotId: string,
  posteId: string
): Promise<EtatAppel> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("appel_charges_postes")
    .delete()
    .eq("id", posteId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(chemin(orgId, bienId, lotId));
  return { succes: "Poste retiré." };
}

export async function validerVentilation(
  orgId: string,
  bienId: string,
  lotId: string,
  appelId: string
): Promise<EtatAppel> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("valider_ventilation", { p_appel: appelId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(chemin(orgId, bienId, lotId));
  return { succes: "Ventilation validée." };
}

export async function supprimerAppelCharges(
  orgId: string,
  bienId: string,
  lotId: string,
  appelId: string
): Promise<EtatAppel> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("appels_charges")
    .delete()
    .eq("id", appelId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(chemin(orgId, bienId, lotId));
  return { succes: "Appel supprimé." };
}
