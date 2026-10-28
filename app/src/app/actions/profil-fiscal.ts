"use server";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";

export type EtatProfilFiscal = { erreur?: string; succes?: string };
export async function enregistrerProfilFiscal(orgId: string, personId: string, annee: number, _etat: EtatProfilFiscal, form: FormData): Promise<EtatProfilFiscal> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "proprietaire_direct") return { erreur: "Accès refusé." };
  if (!Number.isInteger(annee) || annee < 1970 || annee > 2200) return { erreur: "Année invalide." };
  if (form.get("confirme") !== "oui") return { erreur: "Confirmez la situation fiscale pour cette année." };
  // Le rattachement explicite protège aussi l'invalidation des pages contre une organisation falsifiée.
  const { data: personne, error: lecture } = await supabase.from("persons").select("id").eq("id", personId).eq("organization_id", orgId).maybeSingle();
  if (lecture || !personne) return { erreur: "Propriétaire introuvable dans cet espace." };
  const { error } = await supabase.rpc("enregistrer_profil_fiscal_detenteur", {
    p_personne: personId, p_annee: annee,
    p_imposition: String(form.get("imposition") ?? "a_confirmer"),
    p_location_nue: String(form.get("location_nue") ?? "non_concerne"),
    p_location_meublee: String(form.get("location_meublee") ?? "non_concerne"),
    p_justification: String(form.get("justification") ?? "").trim(),
  });
  if (error) return { erreur: sansJargon(error.message) };
  for (const racine of ["agence", "espace"]) {
    revalidatePath(`/${racine}/${orgId}/comptabilite/fiscal`);
    revalidatePath(`/${racine}/${orgId}/loyers`);
  }
  return { succes: "Situation fiscale enregistrée pour cette année. Les versions précédentes sont conservées." };
}
