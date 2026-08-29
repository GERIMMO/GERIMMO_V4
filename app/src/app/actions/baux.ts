"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { detecterMimeReel, TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { cibleBlocage } from "@/lib/parc";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type BlocageActionable = { message: string; href: string; libelle: string };
export type EtatBail = {
  erreur?: string;
  succes?: string;
  blocages?: BlocageActionable[];
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

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

  const valeurs = valeursDuFormulaire(formData);
  const champs = lireChampsBail(formData);
  if ("erreur" in champs) return { erreur: champs.erreur, valeurs };

  const { data, error } = await supabase
    .from("baux")
    .insert({
      organization_id: orgId,
      lot_id: lotId,
      etat: "brouillon",
      ...champs.valeurs,
    })
    .select("id")
    .single();
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}`, valeurs };

  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  redirect(`/agence/${orgId}/baux/${data.id}`);
}

// Champs communs création / édition (recette 21/08 : le brouillon devient
// corrigeable, et la date d'entrée se saisit — elle tombait au jour du clic
// « Activer », faussant l'échéancier)
function lireChampsBail(
  formData: FormData
): { erreur: string } | { valeurs: Record<string, unknown> } {
  const locataire = String(formData.get("locataire_principal") ?? "");
  if (!locataire) return { erreur: "Choisissez le locataire principal." };
  const loyer = String(formData.get("loyer_hc") ?? "").trim();
  const charges = String(formData.get("charges") ?? "").trim();
  const depot = String(formData.get("depot_garantie") ?? "").trim();
  const jour = String(formData.get("jour_echeance") ?? "1").trim();
  return {
    valeurs: {
      type: String(formData.get("type") ?? "nu"),
      locataire_principal: locataire,
      date_debut: String(formData.get("date_debut") ?? "").trim() || null,
      loyer_hc: loyer ? Number(loyer) : null,
      charges: charges ? Number(charges) : null,
      // Provision (régularisable) ou forfait (définitif — RM-3.9.8)
      charges_mode: formData.get("charges_mode") === "forfait" ? "forfait" : "provision",
      depot_garantie: depot ? Number(depot) : null,
      jour_echeance: jour ? Number(jour) : 1,
      irl_trimestre: String(formData.get("irl_trimestre") ?? "").trim() || null,
      revision_irl: formData.get("revision_irl") === "on",
    },
  };
}

// Corriger un brouillon (recette 21/08 : la saisie initiale était figée dès
// la création — il fallait recréer un bail pour changer un montant).
export async function modifierBail(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const champs = lireChampsBail(formData);
  if ("erreur" in champs) return { erreur: champs.erreur, valeurs };

  // Seul un brouillon se corrige : signé, le bail est le contrat
  const { data: modifies, error } = await supabase
    .from("baux")
    .update(champs.valeurs)
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .eq("etat", "brouillon")
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if ((modifies ?? []).length === 0) {
    return { erreur: "Seul un bail en brouillon se corrige — celui-ci a déjà avancé.", valeurs };
  }

  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Brouillon corrigé." };
}

// Déposer le bail signé (PDF) et le rattacher au bail.
// Pièces PDF rattachées au bail : le bail signé (obligatoire pour valider) et
// le règlement de copropriété (facultatif). Même contrôle : un PDF complet,
// une image d'une page ne vaut pas le document.
async function deposerPieceBail(
  orgId: string,
  bailId: string,
  formData: FormData,
  piece: {
    colonne: "document_signe" | "reglement_copropriete";
    type: string;
    titre: string;
    succes: string;
  }
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le PDF." };
  if (fichier.size > TAILLE_MAX_OCTETS) return { erreur: "Fichier trop volumineux (10 Mo max)." };
  // Recette 21/08 : un bail signé est un PDF — une photo de la première page
  // passait la GED (qui accepte les images) et valait document contractuel.
  const mime = detecterMimeReel(new Uint8Array(await fichier.arrayBuffer()));
  if (mime !== "application/pdf") {
    return { erreur: `${piece.titre} se dépose en PDF complet — une image d'une page ne vaut pas le document.` };
  }

  const res = await deposerFichierGed(supabase, user, orgId, fichier, piece.type, piece.titre);
  if (res.erreur || !res.documentId) return { erreur: res.erreur ?? "Échec du dépôt." };

  const { error } = await supabase
    .from("baux")
    .update({ [piece.colonne]: res.documentId })
    .eq("id", bailId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: res.avertissement ? `${piece.succes} ${res.avertissement}` : piece.succes };
}

export async function deposerBailSigne(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  return deposerPieceBail(orgId, bailId, formData, {
    colonne: "document_signe",
    type: "bail",
    titre: "Bail signé",
    succes: "Bail signé déposé.",
  });
}

export async function deposerReglementCopropriete(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  return deposerPieceBail(orgId, bailId, formData, {
    colonne: "reglement_copropriete",
    type: "reglement_copropriete",
    titre: "Règlement de copropriété",
    succes: "Règlement de copropriété déposé.",
  });
}

// Valider le bail (contrôles en base : PDF signé, EDL d'entrée signé, un seul
// bail en cours sur le lot, lot disponible, diagnostics). Décision 29/08 : le
// bouton s'appelle « Valider » et clôt la préparation du bail.
export async function validerBail(
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
    return { erreur: sansJargon(error.message) };
  }
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Bail validé — le lot est loué." };
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

  const valeurs = valeursDuFormulaire(formData);
  const par = String(formData.get("par") ?? "locataire");
  const date = String(formData.get("date_presentation") ?? "").trim();
  const preavis = Number(formData.get("preavis_mois") ?? 3);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!date) return { erreur: "Indiquez la date de première présentation.", valeurs };

  // Préavis réduit du locataire : justificatif déposé en GED, transmis au contrôle base.
  let justificatif: string | null = null;
  let avertissementJustificatif: string | undefined;
  const fichier = formData.get("justificatif");
  if (fichier instanceof File && fichier.size > 0) {
    const res = await deposerFichierGed(supabase, user, orgId, fichier, "justificatif", "Justificatif de préavis réduit");
    if (res.erreur || !res.documentId) return { erreur: res.erreur ?? "Échec du dépôt du justificatif.", valeurs };
    justificatif = res.documentId;
    avertissementJustificatif = res.avertissement;
  }

  const { error } = await supabase.rpc("enregistrer_conge", {
    p_bail: bailId,
    p_par: par,
    p_date_presentation: date,
    p_preavis_mois: preavis,
    p_motif: motif || null,
    p_justificatif: justificatif,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  const baseConge = "Congé enregistré — bail en préavis.";
  return { succes: avertissementJustificatif ? `${baseConge} ${avertissementJustificatif}` : baseConge };
}

// Le locataire se rétracte : le congé s'annule tant que le départ n'a pas eu
// lieu. La base remet le bail en actif, le lot en loué, referme l'alerte de
// sortie — et garde le congé annulé au dossier.
export async function annulerConge(
  orgId: string,
  bailId: string,
  _etat: EtatBail,
  formData: FormData
): Promise<EtatBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  const { error } = await supabase.rpc("annuler_conge", {
    p_bail: bailId,
    p_motif: motif || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Congé annulé — le bail reprend son cours." };
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

  const valeurs = valeursDuFormulaire(formData);
  const designation = String(formData.get("designation") ?? "").trim();
  if (!designation) return { erreur: "La désignation du meuble est obligatoire.", valeurs };
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
  if (error) return { erreur: sansJargon(error.message), valeurs };
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
  if (error) return { erreur: sansJargon(error.message) };
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

  const valeurs = valeursDuFormulaire(formData);
  const personId = String(formData.get("person_id") ?? "");
  const role = String(formData.get("role") ?? "colocataire");
  if (!personId) return { erreur: "Choisissez la personne.", valeurs };
  if (role !== "colocataire" && role !== "garant") return { erreur: "Rôle invalide.", valeurs };

  const qp = String(formData.get("quote_part") ?? "").trim();
  const surf = String(formData.get("surface_privative") ?? "").trim();
  const garantDe = String(formData.get("garant_de") ?? "").trim();
  if (role === "garant" && !garantDe) {
    return { erreur: "Indiquez le colocataire couvert par ce garant.", valeurs };
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
  if (error) return { erreur: sansJargon(error.message), valeurs };
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
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  return { succes: "Personne retirée du bail." };
}
