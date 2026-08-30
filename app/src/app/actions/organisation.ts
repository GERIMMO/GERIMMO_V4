"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { verifierGerant } from "@/lib/ged-acces";
import { ROLES_RESPONSABLES } from "@/lib/ged";

export type EtatProfilOrganisation = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

// Profil de l'organisation (sprint « Documents-0 ») : l'identité qui signe
// les documents générés — en-tête, pied et « Fait à ». Réservé au
// responsable (admin d'agence ou propriétaire) ; la RLS revérifie
// (can_manage_organization) et statut/type/essai restent au super admin.
export async function modifierProfilOrganisation(
  orgId: string,
  _etat: EtatProfilOrganisation,
  formData: FormData
): Promise<EtatProfilOrganisation> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation." };
  }
  const valeurs = valeursDuFormulaire(formData);
  const nom = String(formData.get("name") ?? "").trim();
  if (!nom) return { erreur: "Le nom est obligatoire.", valeurs };

  const champ = (n: string) => String(formData.get(n) ?? "").trim() || null;
  const { error, data } = await supabase
    .from("organizations")
    .update({
      name: nom,
      address_line1: champ("address_line1"),
      postal_code: champ("postal_code"),
      city: champ("city"),
      telephone: champ("telephone"),
      email_contact: champ("email_contact"),
      siret: champ("siret"),
    })
    .eq("id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if (!data?.length) return { erreur: "Modification refusée.", valeurs };

  revalidatePath(`/agence/${orgId}/profil`);
  revalidatePath(`/agence/${orgId}`, "layout");
  return { succes: "Profil enregistré — les prochains documents générés l'utiliseront." };
}
