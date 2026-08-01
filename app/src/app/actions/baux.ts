"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { cibleBlocage } from "@/lib/parc";

export type BlocageActionable = { message: string; href: string; libelle: string };
export type EtatBail = { erreur?: string; succes?: string; blocages?: BlocageActionable[] };

// Créer un bail (brouillon) sur un lot.
export async function creerBail(
  orgId: string,
  lotId: string,
  bienId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const type = String(formData.get("type") ?? "nu");
  const locataire = String(formData.get("locataire_principal") ?? "");
  const loyer = String(formData.get("loyer_hc") ?? "").trim();
  const charges = String(formData.get("charges") ?? "").trim();
  const depot = String(formData.get("depot_garantie") ?? "").trim();
  const jour = String(formData.get("jour_echeance") ?? "1").trim();
  const irlTrimestre = String(formData.get("irl_trimestre") ?? "").trim() || null;
  const revisionIrl = formData.get("revision_irl") === "on";
  if (!locataire) return { erreur: "Choisissez le locataire principal." };

  const { data, error } = await supabase
    .from("baux")
    .insert({
      organization_id: orgId,
      lot_id: lotId,
      type,
      etat: "brouillon",
      locataire_principal: locataire,
      loyer_hc: loyer ? Number(loyer) : null,
      charges: charges ? Number(charges) : null,
      depot_garantie: depot ? Number(depot) : null,
      jour_echeance: jour ? Number(jour) : 1,
      irl_trimestre: irlTrimestre,
      revision_irl: revisionIrl,
    })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${error.message}` };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  redirect(`/agence/${orgId}/baux/${data.id}`);
}

// Déposer le bail signé (PDF) et le rattacher au bail.
export async function deposerBailSigne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le PDF signé." };
  if (fichier.size > TAILLE_MAX_OCTETS) return { erreur: "Fichier trop volumineux (10 Mo max)." };

  const res = await deposerFichierGed(supabase, user, orgId, fichier, "bail", "Bail signé");
  if (res.erreur || !res.documentId) return { erreur: res.erreur ?? "Échec du dépôt." };

  const { error } = await supabase
    .from("baux")
    .update({ document_signe: res.documentId })
    .eq("id", bailId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };

  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Bail signé déposé." };
}

// Activer le bail (contrôles en base : PDF, lot disponible, diagnostics).
export async function activerBail(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  _formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("activer_bail", { p_bail: bailId });
  if (error) {
    // Blocage de mise en location : on transforme chaque cause en action cliquable
    // (bouton « Corriger » vers la bonne section de la fiche lot / bien).
    if (error.message.includes("Mise en location bloquée")) {
      const { data: bail } = await supabase
        .from("baux")
        .select("lot_id")
        .eq("id", bailId)
        .maybeSingle();
      const { data: lot } = bail
        ? await supabase.from("lots").select("id, bien_id").eq("id", bail.lot_id).maybeSingle()
        : { data: null };
      const { data: causes } = bail
        ? await supabase.rpc("lot_blocages_location", { p_lot: bail.lot_id })
        : { data: null };
      if (lot && Array.isArray(causes) && causes.length > 0) {
        const blocages = (causes as string[]).map((m) => ({
          message: m,
          ...cibleBlocage(m, { orgId, bienId: lot.bien_id, lotId: lot.id }),
        }));
        return { erreur: "Mise en location bloquée — à corriger :", blocages };
      }
    }
    return { erreur: error.message };
  }
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Bail activé — le lot est loué, alerte d'EDL d'entrée créée." };
}

// Enregistrer un congé (bail actif → préavis).
export async function enregistrerConge(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const par = String(formData.get("par") ?? "locataire");
  const date = String(formData.get("date_presentation") ?? "").trim();
  const preavis = Number(formData.get("preavis_mois") ?? 3);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!date) return { erreur: "Indiquez la date de première présentation." };

  // Préavis réduit du locataire : justificatif déposé en GED, transmis au contrôle base.
  let justificatif: string | null = null;
  const fichier = formData.get("justificatif");
  if (fichier instanceof File && fichier.size > 0) {
    const res = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", "Justificatif de préavis réduit");
    if (res.erreur || !res.documentId) return { erreur: res.erreur ?? "Échec du dépôt du justificatif." };
    justificatif = res.documentId;
  }

  const { error } = await supabase.rpc("enregistrer_conge", {
    p_bail: bailId,
    p_par: par,
    p_date_presentation: date,
    p_preavis_mois: preavis,
    p_motif: motif || null,
    p_justificatif: justificatif,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Congé enregistré — bail en préavis." };
}

// Inventaire du mobilier (annexe obligatoire du bail meublé, décret 2015-981).
export async function ajouterInventaireLigne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const designation = String(formData.get("designation") ?? "").trim();
  if (!designation) return { erreur: "La désignation du meuble est obligatoire." };
  const piece = String(formData.get("piece") ?? "").trim() || null;
  const quantite = Math.max(1, Math.floor(Number(formData.get("quantite") ?? 1)) || 1);
  const etat = String(formData.get("etat") ?? "").trim() || null;
  const observation = String(formData.get("observation") ?? "").trim() || null;

  const { error } = await supabase.from("inventaire_lignes").insert({
    bail_id: bailId,
    organization_id: orgId,
    designation,
    piece,
    quantite,
    etat,
    observation,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Meuble ajouté à l'inventaire." };
}

export async function supprimerInventaireLigne(
  orgId: string,
  bailId: string,
  ligneId: string
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("inventaire_lignes")
    .delete()
    .eq("id", ligneId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Meuble retiré de l'inventaire." };
}

// Colocation (bail unique) : ajouter un colocataire (quote-part) ou un garant
// (nominatif — quel colocataire il couvre, RM-1.3.8 + loi/pratique).
export async function ajouterBailPersonne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const personId = String(formData.get("person_id") ?? "");
  const role = String(formData.get("role") ?? "colocataire");
  if (!personId) return { erreur: "Choisissez la personne." };
  if (role !== "colocataire" && role !== "garant") return { erreur: "Rôle invalide." };

  const qp = String(formData.get("quote_part") ?? "").trim();
  const surf = String(formData.get("surface_privative") ?? "").trim();
  const garantDe = String(formData.get("garant_de") ?? "").trim();
  if (role === "garant" && !garantDe) {
    return { erreur: "Indiquez le colocataire couvert par ce garant." };
  }

  const { error } = await supabase.from("bail_personnes").insert({
    organization_id: orgId,
    bail_id: bailId,
    person_id: personId,
    role,
    quote_part: role === "colocataire" && qp ? Number(qp) : null,
    surface_privative: role === "colocataire" && surf ? Number(surf) : null,
    garant_de: role === "garant" ? garantDe : null,
  });
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: role === "garant" ? "Garant ajouté." : "Colocataire ajouté." };
}

export async function supprimerBailPersonne(
  orgId: string,
  bailId: string,
  ligneId: string
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("bail_personnes")
    .delete()
    .eq("id", ligneId)
    .eq("organization_id", orgId);
  if (error) return { erreur: error.message };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Personne retirée du bail." };
}
