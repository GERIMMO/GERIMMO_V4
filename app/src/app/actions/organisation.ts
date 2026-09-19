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
  // Les délais de relance : entiers bornés, et le second après le premier —
  // la base le vérifie aussi, mais une phrase vaut mieux qu'une contrainte.
  const entier = (n: string, defaut: number, min: number, max: number) => {
    const v = Number.parseInt(String(formData.get(n) ?? ""), 10);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : defaut;
  };
  const relance1 = entier("relance_1_jours", 5, 1, 60);
  const relance2 = entier("relance_2_jours", 15, 2, 90);
  if (relance2 <= relance1) {
    return { erreur: "La seconde relance doit venir après la première : augmentez son délai.", valeurs };
  }
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
      carte_pro: champ("carte_pro"),
      garantie_financiere: champ("garantie_financiere"),
      iban: champ("iban"),
      // Mentions de facturation : la facture d'honoraires les exige, et
      // refuse d'émettre tant qu'elles manquent (un numéro consommé sur une
      // facture invalide ne se rattrape pas).
      tva_intracom: champ("tva_intracom"),
      tva_franchise: formData.get("tva_franchise") !== null,
      // Accord permanent d'envoi des quittances : une case décochée n'apparaît
      // pas dans le formulaire, d'où la lecture par présence et non par valeur.
      quittances_envoi_auto: formData.get("quittances_envoi_auto") !== null,
      appels_envoi_auto: formData.get("appels_envoi_auto") !== null,
      relances_envoi_auto: formData.get("relances_envoi_auto") !== null,
      relance_1_jours: relance1,
      relance_2_jours: relance2,
    })
    .eq("id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if (!data?.length) return { erreur: "Modification refusée.", valeurs };

  revalidatePath(`/agence/${orgId}/profil`);
  revalidatePath(`/agence/${orgId}`, "layout");
  return { succes: "Profil enregistré — les prochains documents générés l'utiliseront." };
}
