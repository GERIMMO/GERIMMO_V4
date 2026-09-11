"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { codesPostauxValides, METIERS_ARTISAN, siretNormalise } from "./referentiel";

// Les gestes du CARNET D'ARTISANS de l'agence.
//
// Toutes les règles sont défendues en base (fonctions SECURITY DEFINER du
// module 8) : unicité du SIRET et rattachement plutôt que doublon (RM-8.1.5),
// refus de blacklister un artisan en intervention (RM-8.2.7), motif obligatoire
// sur la liste noire et jamais sur la désactivation (RM-8.5.1/8.5.2). Ici on
// ne fait que : vérifier la session, mettre la saisie en forme, et rendre le
// message de la base tel quel — ils sont rédigés à hauteur d'agent.
//
// Ces actions vivent dans le dossier de l'écran, et non dans src/app/actions/ :
// trois agents construisent le module en parallèle le 11/09, un fichier
// `actions/artisans.ts` partagé serait écrit trois fois. Voir referentiel.ts.

export type EtatArtisanAction = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Métiers et codes postaux arrivent en cases cochées / champ libre : même
// lecture pour la création et pour la correction, sinon les deux divergent.
function lireMetiersEtZones(formData: FormData): {
  erreur?: string;
  metiers?: string[];
  codes?: string[];
} {
  const metiers = formData
    .getAll("metiers")
    .map((m) => String(m))
    .filter((m) => m in METIERS_ARTISAN);
  if (metiers.length === 0) {
    return {
      erreur:
        "Cochez au moins un métier — un artisan n'est jamais proposé hors de son métier.",
    };
  }
  const zone = codesPostauxValides(String(formData.get("codes_postaux") ?? ""));
  if (zone.erreur) return { erreur: zone.erreur };
  return { metiers, codes: zone.codes };
}

// RM-8.1.5 : si le SIRET existe déjà, la base RATTACHE au lieu de dupliquer.
// L'écran ne le devine pas — il le dit dans le message de succès.
export async function creerOuRattacherArtisan(
  orgId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const raisonSociale = String(formData.get("raison_sociale") ?? "").trim();
  const siret = siretNormalise(String(formData.get("siret") ?? ""));
  const telephone = String(formData.get("telephone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!raisonSociale) return { erreur: "Indiquez la raison sociale de l'entreprise.", valeurs };
  if (!/^[0-9]{14}$/.test(siret)) {
    return {
      erreur: "Le SIRET compte quatorze chiffres — c'est lui qui identifie l'entreprise.",
      valeurs,
    };
  }
  if (!telephone) {
    // Module 19 : l'artisan travaille depuis le chantier, le mobile n'est pas
    // un confort. La base l'exige aussi (artisans.telephone not null).
    return { erreur: "Le téléphone mobile est obligatoire — il travaille depuis le chantier.", valeurs };
  }
  const champs = lireMetiersEtZones(formData);
  if (champs.erreur) return { erreur: champs.erreur, valeurs };

  const { error } = await supabase.rpc("artisan_creer_ou_rattacher", {
    p_org: orgId,
    p_raison_sociale: raisonSociale,
    p_siret: siret,
    p_telephone: telephone,
    p_email: email || null,
    p_metiers: champs.metiers,
    p_codes_postaux: champs.codes,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/artisans`);
  return {
    succes:
      "Artisan enregistré. Si ce SIRET existait déjà chez Gerimmo, sa fiche a été rattachée à votre agence plutôt que dupliquée.",
  };
}

export async function definirMetiersEtZones(
  orgId: string,
  artisanId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const champs = lireMetiersEtZones(formData);
  if (champs.erreur) return { erreur: champs.erreur, valeurs };

  const { error } = await supabase.rpc("artisan_definir_metiers_zones", {
    p_artisan: artisanId,
    p_metiers: champs.metiers,
    p_codes_postaux: champs.codes,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/artisans`);
  return { succes: "Métiers et zone d'intervention enregistrés." };
}

// RM-8.5.1 : la désactivation est NEUTRE — aucun motif n'est demandé, et c'est
// le point : un motif transformerait un simple retrait de liste en sanction.
export async function definirStatutLocalArtisan(
  orgId: string,
  artisanId: string,
  actif: boolean,
  _etat: EtatArtisanAction,
  _formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("artisan_statut_local", {
    p_org: orgId,
    p_artisan: artisanId,
    p_actif: actif,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/artisans`);
  return {
    succes: actif
      ? "Artisan réactivé dans votre carnet."
      : "Artisan désactivé dans votre carnet — il ne vous sera plus proposé.",
  };
}

// RM-8.5.2 : la liste noire LOCALE est motivée, et n'engage que cette agence —
// blacklisté chez vous, il reste visible pour les autres (RM-A1.8). La base
// refuse le geste s'il a une intervention en cours (RM-8.2.7) et annule ses
// devis et sollicitations en attente.
export async function blacklisterArtisanLocal(
  orgId: string,
  artisanId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) {
    return {
      erreur:
        "Le motif est obligatoire : une liste noire sans motif n'est pas opposable. Pour un simple retrait, désactivez plutôt.",
      valeurs,
    };
  }

  const { error } = await supabase.rpc("artisan_blacklist_locale", {
    p_org: orgId,
    p_artisan: artisanId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/artisans`);
  revalidatePath(`/agence/${orgId}/incidents`);
  return {
    succes:
      "Artisan inscrit sur votre liste noire. Ses devis et sollicitations en attente sont annulés ; les autres agences ne sont pas concernées.",
  };
}

export async function leverBlacklistArtisanLocal(
  orgId: string,
  artisanId: string,
  _etat: EtatArtisanAction,
  _formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("artisan_lever_blacklist_locale", {
    p_org: orgId,
    p_artisan: artisanId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/artisans`);
  return { succes: "Liste noire levée — l'artisan vous est de nouveau proposé." };
}
