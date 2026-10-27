"use server";
import { resoudreDepotsFormulaire, limiteFichierDepose } from "@/lib/depot-direct";


import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { TYPES_DEPOSABLES } from "@/lib/ged";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatDepot = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
  documentId?: string;
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

  revalidatePath(`/agence/${orgId}/documents`);
  revalidatePath(`/espace/${orgId}/documents`);
  return {
    succes: "Document déposé.",
    documentId: resultat.documentId,
    ...(avertissements.length ? { avertissement: avertissements.join(" ") } : {}),
  };
}
