"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatAnnonce = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

// Annonces d'immeuble (espace locataire v10) : un mot de l'agence aux
// locataires d'un bien — coupure d'eau, travaux, passage du syndic — affiché
// sur leur accueil jusqu'à la date choisie.
export async function creerAnnonce(
  orgId: string,
  bienId: string,
  _etat: EtatAnnonce,
  formData: FormData
): Promise<EtatAnnonce> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  const texte = String(formData.get("texte") ?? "").trim();
  const jusquau = String(formData.get("visible_jusquau") ?? "").trim();
  if (!texte) return { erreur: "Écrivez l'annonce avant de publier.", valeurs };
  if (!jusquau) return { erreur: "Choisissez jusqu'à quand l'annonce s'affiche.", valeurs };

  const { error } = await supabase.from("annonces").insert({
    organization_id: orgId,
    bien_id: bienId,
    texte,
    visible_jusquau: jusquau,
    created_by: user.id,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  return { succes: "Annonce publiée — les locataires du bien la voient sur leur accueil." };
}

export async function supprimerAnnonce(
  orgId: string,
  bienId: string,
  annonceId: string
): Promise<EtatAnnonce> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("annonces")
    .delete()
    .eq("id", annonceId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  return { succes: "Annonce retirée." };
}
