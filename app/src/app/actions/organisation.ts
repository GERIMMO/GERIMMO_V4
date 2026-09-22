"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { verifierGerant } from "@/lib/ged-acces";
import { couleurValide, domaineValide, emailValide, LOGO_MAX_OCTETS, typeImageLogo } from "@/lib/marque-organisation";
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
  const adresse = champ("address_line1");
  const codePostal = champ("postal_code");
  const ville = champ("city");
  const emailContact = champ("email_contact");
  if (!adresse || !codePostal || !ville || !emailContact) {
    return { erreur: "L'adresse complète et l'email de contact sont obligatoires pour les documents.", valeurs };
  }
  const estAgence = role === "admin_agence";
  const siret = champ("siret");
  const cartePro = champ("carte_pro");
  const garantie = champ("garantie_financiere");
  const franchiseTva = formData.get("tva_franchise") !== null;
  const tva = champ("tva_intracom");
  if (estAgence && (!siret || !cartePro || !garantie)) {
    return { erreur: "Le SIRET, la carte professionnelle et la garantie financière sont obligatoires pour une agence.", valeurs };
  }
  if (estAgence && !franchiseTva && !tva) {
    return { erreur: "Renseignez le numéro de TVA ou cochez la franchise en base.", valeurs };
  }
  const couleurPrimaire = champ("couleur_primaire");
  const couleurSecondaire = champ("couleur_secondaire");
  if ((couleurPrimaire && !couleurValide(couleurPrimaire)) || (couleurSecondaire && !couleurValide(couleurSecondaire))) {
    return { erreur: "Choisissez une couleur au format proposé par le sélecteur.", valeurs };
  }
  const domaine = champ("domaine_personnalise")?.toLowerCase() || null;
  const expediteur = champ("email_expediteur")?.toLowerCase() || null;
  if (!emailValide(emailContact) || (expediteur && !emailValide(expediteur))) return { erreur: "Renseignez une adresse e-mail valide.", valeurs };
  if (domaine && !domaineValide(domaine)) return { erreur: "Renseignez seulement le nom du site, par exemple espace.votre-agence.fr, sans https ni chemin.", valeurs };
  if ((champ("nom_portail")?.length ?? 0) > 100) return { erreur: "Le nom affiché est limité à 100 caractères.", valeurs };
  let logo: string | null | undefined;
  if (formData.get("retirer_logo") !== null) logo = null;
  const fichier = formData.get("logo_fichier");
  if (fichier instanceof File && fichier.size > 0) {
    if (fichier.size > LOGO_MAX_OCTETS) return { erreur: "Choisissez un logo de moins de 200 Ko.", valeurs };
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const type = typeImageLogo(octets);
    if (!type) return { erreur: "Choisissez une image PNG, JPEG ou WebP. Les autres fichiers ne sont pas acceptés.", valeurs };
    logo = `data:${type};base64,${Buffer.from(octets).toString("base64")}`;
  }
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
      address_line1: adresse,
      postal_code: codePostal,
      city: ville,
      telephone: champ("telephone"),
      email_contact: emailContact,
      siret,
      carte_pro: cartePro,
      garantie_financiere: garantie,
      iban: champ("iban"),
      // Mentions de facturation : la facture d'honoraires les exige, et
      // refuse d'émettre tant qu'elles manquent (un numéro consommé sur une
      // facture invalide ne se rattrape pas).
      tva_intracom: tva,
      tva_franchise: franchiseTva,
      // Accord permanent d'envoi des quittances : une case décochée n'apparaît
      // pas dans le formulaire, d'où la lecture par présence et non par valeur.
      quittances_envoi_auto: formData.get("quittances_envoi_auto") !== null,
      appels_envoi_auto: formData.get("appels_envoi_auto") !== null,
      relances_envoi_auto: formData.get("relances_envoi_auto") !== null,
      relance_1_jours: relance1,
      relance_2_jours: relance2,
      ...(estAgence ? {
        ...(logo !== undefined ? { logo_url: logo } : {}),
        couleur_primaire: couleurPrimaire,
        couleur_secondaire: couleurSecondaire,
        domaine_personnalise: domaine,
        email_expediteur: expediteur,
        nom_portail: champ("nom_portail"),
      } : {}),
    })
    .eq("id", orgId)
    .select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if (!data?.length) return { erreur: "Modification refusée.", valeurs };

  revalidatePath(`/agence/${orgId}/profil`);
  revalidatePath(`/agence/${orgId}`, "layout");
  revalidatePath(`/locataire/${orgId}`, "layout");
  return { succes: "Profil enregistré. Les prochains documents utiliseront votre identité. Toute adresse personnalisée modifiée doit être vérifiée avant activation." };
}
