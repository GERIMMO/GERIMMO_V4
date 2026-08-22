"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { verifierGerant } from "@/lib/ged-acces";
import { deposerFichierGed } from "@/lib/ged-depot";
import { TYPES_PIECE_DOSSIER } from "@/lib/dossier";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatDossier = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Déposer une pièce au dossier d'une personne. Si `remplace_id` est fourni, la
// nouvelle pièce remplace une version antérieure (versioning intégral RM-0b.4.1 :
// l'ancienne est conservée, seule la courante s'affiche).
export async function deposerPieceDossier(
  orgId: string,
  personId: string,
  _etat: EtatDossier,
  formData: FormData
): Promise<EtatDossier> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const fichier = formData.get("fichier");
  const type = String(formData.get("type") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  const remplaceId = String(formData.get("remplace_id") ?? "").trim();
  const expireLe = String(formData.get("expire_le") ?? "").trim();

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez un fichier.", valeurs };
  }
  if (!(type in TYPES_PIECE_DOSSIER)) {
    return { erreur: "Type de pièce invalide.", valeurs };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { erreur: "Fichier trop volumineux (10 Mo maximum).", valeurs };
  }

  // Nouvelle version : la pièce remplacée doit exister dans l'agence — et la
  // fiche document étant immuable (update révoqué en base), le lien de version
  // se pose à l'insertion, dans deposerFichierGed (recette 14/08 : l'update
  // après coup échouait en « permission denied » et chaque dépôt restait
  // un document indépendant).
  if (remplaceId) {
    const { data: remplacee } = await supabase
      .from("documents")
      .select("id")
      .eq("id", remplaceId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!remplacee) {
      return { erreur: "La pièce à remplacer est introuvable dans l'agence.", valeurs };
    }
  }

  const resultat = await deposerFichierGed(supabase, user, orgId, fichier, type, titre, {
    remplaceId: remplaceId || undefined,
    expireLe: expireLe || undefined,
  });
  if (resultat.erreur || !resultat.documentId) {
    return { erreur: resultat.erreur ?? "Échec du dépôt.", valeurs };
  }

  // Rattachement à la personne (le dossier suit la personne, RM-0b.7.2)
  const { error: erreurLien } = await supabase.from("document_liens").insert({
    document_id: resultat.documentId,
    organization_id: orgId,
    entite: "personne",
    entite_id: personId,
  });
  if (erreurLien) {
    return { erreur: `Pièce déposée mais rattachement en échec : ${sansJargon(erreurLien.message)}`, valeurs };
  }

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  const base = remplaceId ? "Nouvelle version déposée." : "Pièce ajoutée au dossier.";
  return { succes: resultat.avertissement ? `${base} ${resultat.avertissement}` : base };
}

// Valider l'attestation déposée par le locataire (recette 21/08) : l'agence
// vérifie la pièce, la validation solde l'alerte « à vérifier » — règles en
// base (valider_attestation).
export async function validerAttestation(
  orgId: string,
  personId: string,
  documentId: string
): Promise<EtatDossier> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("valider_attestation", {
    p_org: orgId,
    p_document: documentId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Attestation validée — le locataire le voit dans son espace." };
}
