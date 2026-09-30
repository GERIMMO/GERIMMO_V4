"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { envoyerLienMotDePasse } from "@/lib/lien-mot-de-passe";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { verifierGerant } from "@/lib/ged-acces";
import { couleurValide, domaineValide, emailValide, LOGO_MAX_OCTETS, typeImageLogo } from "@/lib/marque-organisation";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { envoyerEmail } from "@/lib/email";
import { adresseDuSite, MESSAGE_SITE_NON_CONFIGURE } from "@/lib/site";

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
  // Audit gestion du 29/09 : pas de relance pour un reliquat de quelques
  // centimes — seuil de dette totale, 5 € par défaut, 0 à 1 000 €.
  const seuilSaisi = String(formData.get("relance_seuil_montant") ?? "").trim().replace(",", ".");
  const seuil = seuilSaisi === "" ? 5 : Number(seuilSaisi);
  if (!Number.isFinite(seuil) || seuil < 0 || seuil > 1000) {
    return { erreur: "Le seuil de relance doit être un montant entre 0 et 1 000 €.", valeurs };
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
      relance_seuil_montant: Math.round(seuil * 100) / 100,
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

export type EtatInvitationAgent = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

// Ajouter un agent (audit agence 27/09) : l'admin d'agence invite lui-même —
// wiki « Modèle de rôles et permissions » : l'admin porte la gestion des
// utilisateurs, et l'invitation crée une ADHÉSION. La base revérifie le rôle
// (`inviter_agent`). Compte nouveau : l'invité définit son mot de passe par le
// lien reçu (même flux que l'ouverture d'une organisation). Compte existant :
// il retrouve l'agence dans ses espaces, un e-mail le prévient.
export async function inviterAgent(
  orgId: string,
  _etat: EtatInvitationAgent,
  formData: FormData
): Promise<EtatInvitationAgent> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || role !== "admin_agence") {
    return { erreur: "Réservé à l'admin de l'agence." };
  }
  const valeurs = valeursDuFormulaire(formData);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!emailValide(email)) return { erreur: "Renseignez une adresse e-mail valide.", valeurs };

  const { data, error } = await supabase.rpc("inviter_agent", { p_org: orgId, p_email: email });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  const ligne = ((data ?? []) as { email: string; compte_deja_existant: boolean }[])[0];
  if (!ligne) return { erreur: "L'invitation n'a pas pu être enregistrée. Réessayez.", valeurs };

  let erreurMail: string | undefined;
  if (ligne.compte_deja_existant) {
    // Audit du 30/09 (M2) : le lien suit la configuration (adresseDuSite),
    // jamais l'en-tête `Origin` de la requête — un en-tête se forge. Sans
    // adresse configurée, pas de lien mort : l'e-mail ne part pas, on le dit.
    const origine = adresseDuSite();
    if (!origine) {
      erreurMail = MESSAGE_SITE_NON_CONFIGURE;
    } else {
      const envoi = await envoyerEmail({
        organisation: { db: supabase, id: orgId },
        to: ligne.email,
        subject: "Vous rejoignez l’équipe de l’agence sur Gerimmo",
        html: `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <p>Bonjour,</p>
      <p>Vous avez été ajouté comme agent à l’équipe de l’agence. Connectez-vous avec votre compte habituel : l’agence apparaît dans vos espaces.</p>
      <p><a href="${origine}/espaces">Ouvrir mes espaces</a></p>
    </div>`,
      });
      erreurMail = envoi.erreur;
    }
  } else {
    const envoiLien = await envoyerLienMotDePasse({
      email: ligne.email,
      motif: "invitation_agent",
      next: "/nouveau-mot-de-passe",
      organisation: orgId,
    });
    erreurMail = envoiLien.erreur;
  }

  revalidatePath(`/agence/${orgId}/administration`);
  if (erreurMail) {
    return {
      succes: `${ligne.email} fait partie de l’équipe, mais l’e-mail d’invitation n’a pas pu partir (${erreurMail}). Prévenez-le directement.`,
    };
  }
  return {
    succes: ligne.compte_deja_existant
      ? `${ligne.email} fait partie de l’équipe : il retrouve l’agence dans ses espaces.`
      : `Invitation envoyée à ${ligne.email} : il reçoit un lien pour définir son mot de passe.`,
  };
}
