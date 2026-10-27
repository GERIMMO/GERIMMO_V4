"use server";
import { resoudreDepotsFormulaire, limiteFichierDepose } from "@/lib/depot-direct";


import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { TYPES_DEPOSABLES } from "@/lib/ged";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { estUuid } from "@/lib/identifiants";

export type EtatDepot = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
  documentId?: string;
  // Vrai quand le document apparaît désormais sur la fiche du lot d'origine
  lotLie?: boolean;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

export async function deposerDocument(
  orgId: string,
  _etat: EtatDepot,
  formData: FormData
): Promise<EtatDepot> {
  const valeurs = valeursDuFormulaire(formData);
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé.", valeurs };

  const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, formData);
  if (erreurDepotDirect) return { erreur: erreurDepotDirect, valeurs };
  const fichier = formData.get("fichier");
  const type = String(formData.get("type") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  const personneId = String(formData.get("personne") ?? "").trim();
  const lotId = String(formData.get("lot") ?? "").trim();

  // Un fichier choisi mais vide n'est pas un fichier absent (audit #264, DOC-11).
  if (fichier instanceof File && fichier.size === 0 && fichier.name) {
    return { erreur: "Ce fichier est vide : choisissez le document complet.", valeurs };
  }
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez un fichier.", valeurs };
  }
  if (!(TYPES_DEPOSABLES as readonly string[]).includes(type)) {
    return { erreur: "Type de document invalide.", valeurs };
  }
  if (fichier.size > limiteFichierDepose(fichier)) {
    return { erreur: `Fichier trop volumineux (${limiteFichierDepose(fichier) / 1024 / 1024} Mo maximum).`, valeurs };
  }

  // Le lien est polymorphe : vérifier la personne dans le même espace avant
  // d'enregistrer le fichier, même si l'identifiant vient du formulaire.
  if (personneId) {
    const { data: personne, error } = await supabase
      .from("persons")
      .select("id")
      .eq("id", personneId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) {
      return { erreur: "Impossible de vérifier la personne pour le moment. Votre saisie est conservée ; réessayez.", valeurs };
    }
    if (!personne) {
      return { erreur: "Cette personne n’est plus disponible dans cet espace. Choisissez une autre personne ou déposez le document sans la lier.", valeurs };
    }
  }
  // Dépôt ouvert depuis la fiche d'un lot (audit #264, DOC-05) : même garde.
  // La RLS des lots borne aussi l'agent à son portefeuille.
  if (lotId) {
    const { data: lot, error } = estUuid(lotId)
      ? await supabase
          .from("lots")
          .select("id")
          .eq("id", lotId)
          .eq("organization_id", orgId)
          .neq("etat", "archive")
          .maybeSingle()
      : { data: null, error: null };
    if (error) {
      return { erreur: "Impossible de vérifier le lot pour le moment. Votre saisie est conservée ; réessayez.", valeurs };
    }
    if (!lot) {
      return { erreur: "Ce lot n’est plus disponible dans cet espace. Décochez le rattachement au lot ou revenez à sa fiche.", valeurs };
    }
  }

  const resultat = await deposerFichierGed(supabase, user, orgId, fichier, type, titre);
  if (resultat.erreur || !resultat.documentId) {
    return { erreur: resultat.erreur ?? "Échec du dépôt.", valeurs };
  }

  const avertissements = resultat.avertissement ? [resultat.avertissement] : [];
  // Le fichier existe déjà si ce lien complémentaire échoue. Ne pas présenter
  // un nouveau dépôt comme solution : la fiche permet de terminer le lien.
  if (personneId) {
    const { error: erreurLien } = await supabase.from("document_liens").insert({
      document_id: resultat.documentId,
      organization_id: orgId,
      entite: "personne",
      entite_id: personneId,
    });
    if (erreurLien) {
      avertissements.push(`Le lien avec la personne n’a pas pu être ajouté : ${sansJargon(erreurLien.message)} Vous pouvez le réessayer depuis la fiche du document.`);
    }
  }
  let lotLie = false;
  if (lotId) {
    const { error: erreurLien } = await supabase.from("document_liens").insert({
      document_id: resultat.documentId,
      organization_id: orgId,
      entite: "lot",
      entite_id: lotId,
    });
    if (erreurLien) {
      avertissements.push(`Le lien avec le lot n’a pas pu être ajouté : ${sansJargon(erreurLien.message)} Vous pouvez le réessayer depuis la fiche du document.`);
    } else {
      lotLie = true;
    }
  }

  revalidatePath(`/agence/${orgId}/documents`);
  revalidatePath(`/espace/${orgId}/documents`);
  return {
    succes: "Document déposé.",
    documentId: resultat.documentId,
    ...(lotLie ? { lotLie } : {}),
    ...(avertissements.length ? { avertissement: avertissements.join(" ") } : {}),
  };
}
