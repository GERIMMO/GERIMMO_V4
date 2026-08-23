"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatMandat = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Créer un mandat (brouillon) pour une personne mandante.
export async function creerMandat(
  orgId: string,
  personId: string,
  _etat: EtatMandat,
  formData: FormData
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const dateRapport = Number(formData.get("date_rapport") ?? 10);
  const seuilRaw = String(formData.get("seuil_delegation") ?? "").trim();

  const { error } = await supabase.from("mandats").insert({
    organization_id: orgId,
    person_id: personId,
    etat: "brouillon",
    date_rapport: dateRapport >= 1 && dateRapport <= 28 ? dateRapport : 10,
    seuil_delegation: seuilRaw ? Number(seuilRaw) : null,
    created_by: user.id,
  });
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}`, valeurs };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Mandat créé (brouillon)." };
}

// Ajouter un lot au mandat, avec son taux d'honoraires (RM-5.1.4). Les règles
// (lot du mandant, un seul mandat actif par lot) sont vérifiées en base.
export async function ajouterLigneMandat(
  orgId: string,
  personId: string,
  mandatId: string,
  _etat: EtatMandat,
  formData: FormData
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const lotId = String(formData.get("lot_id") ?? "");
  const tauxRaw = String(formData.get("taux_honoraires") ?? "").trim();
  if (!lotId) return { erreur: "Choisissez un lot.", valeurs };
  // Recette 22/08 : le taux est contractuel — pas de valeur posée en silence.
  if (!tauxRaw) return { erreur: "Indiquez le taux d'honoraires du lot.", valeurs };
  const taux = Number(tauxRaw);
  if (!Number.isFinite(taux) || taux < 0 || taux > 100) {
    return { erreur: "Le taux d'honoraires doit être un pourcentage entre 0 et 100.", valeurs };
  }

  // Les lots et taux se composent en brouillon uniquement (recette 21/08) :
  // une fois le mandat parti à la signature, son contenu est celui du contrat.
  const { data: mandat } = await supabase
    .from("mandats")
    .select("etat")
    .eq("id", mandatId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!mandat) return { erreur: "Mandat introuvable.", valeurs };
  if (mandat.etat !== "brouillon") {
    return {
      erreur:
        "Les lots et taux d'un mandat se composent en brouillon — après signature, ils sont ceux du contrat.",
      valeurs,
    };
  }

  const { error } = await supabase.from("mandat_lignes").insert({
    organization_id: orgId,
    mandat_id: mandatId,
    lot_id: lotId,
    taux_honoraires: taux,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Lot ajouté au mandat." };
}

// Retirer un lot d'un mandat en cours de composition — brouillon uniquement,
// pour la même raison que l'ajout.
export async function supprimerLigneMandat(
  orgId: string,
  personId: string,
  mandatId: string,
  ligneId: string
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: mandat } = await supabase
    .from("mandats")
    .select("etat")
    .eq("id", mandatId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!mandat) return { erreur: "Mandat introuvable." };
  if (mandat.etat !== "brouillon") {
    return { erreur: "Seul un mandat en brouillon se recompose." };
  }

  const { error } = await supabase
    .from("mandat_lignes")
    .delete()
    .eq("id", ligneId)
    .eq("mandat_id", mandatId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Lot retiré du mandat." };
}

// Changer l'état du mandat (brouillon → à signer → actif → préavis → résilié).
// Chaque état n'accepte que son suivant ; un mandat résilié est historisé et ne
// bouge plus (recette 13/08 — verrouillé aussi par trigger en base).
const TRANSITIONS_MANDAT: Record<string, string> = {
  brouillon: "a_signer",
  a_signer: "actif",
  actif: "preavis",
  preavis: "resilie",
};

export async function changerEtatMandat(
  orgId: string,
  personId: string,
  mandatId: string,
  nouvelEtat: string,
  _etat: EtatMandat,
  _formData: FormData
): Promise<EtatMandat> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: mandat } = await supabase
    .from("mandats")
    .select("etat")
    .eq("id", mandatId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!mandat) return { erreur: "Mandat introuvable." };
  if (mandat.etat === "resilie") {
    return { erreur: "Ce mandat est résilié : il est historisé et ne se modifie plus." };
  }
  // Porte de sortie (revue 23/08) : un mandat vide qui a quitté le brouillon
  // était une impasse — ni composable, ni résiliable, personne inarchivable.
  // Le retour en brouillon permet de le recomposer, puis d'avancer.
  const retourBrouillon = nouvelEtat === "brouillon" && mandat.etat !== "brouillon";
  if (!retourBrouillon && TRANSITIONS_MANDAT[mandat.etat] !== nouvelEtat) {
    return { erreur: "Ce changement d'état n'est pas permis depuis l'état actuel." };
  }
  if (retourBrouillon) {
    const { count } = await supabase
      .from("mandat_lignes")
      .select("*", { count: "exact", head: true })
      .eq("mandat_id", mandatId)
      .eq("organization_id", orgId)
      .is("date_fin", null);
    if ((count ?? 0) > 0) {
      return {
        erreur:
          "Ce mandat porte des lots : signé, son contenu est celui du contrat — il ne repasse pas en brouillon.",
      };
    }
  }
  // Recette 21/08 puis 22/08 : un mandat vide traversait toute la chaîne
  // jusqu'à « résilié » sans jamais avoir porté de lot ni de taux. Le contrat
  // vit avec son contenu, ou pas du tout — la garde vaut donc pour TOUTES les
  // transitions (les mandats vides créés avant la garde du 21/08 ne doivent
  // plus pouvoir avancer non plus, y compris vers la résiliation).
  {
    const { count } = await supabase
      .from("mandat_lignes")
      .select("*", { count: "exact", head: true })
      .eq("mandat_id", mandatId)
      .eq("organization_id", orgId)
      .is("date_fin", null);
    if ((count ?? 0) === 0) {
      return {
        erreur:
          nouvelEtat === "a_signer"
            ? "Un mandat sans lot ne part pas à la signature : ajoutez au moins un lot avec son taux d'honoraires."
            : "Ce mandat ne porte ni lot ni taux : un contrat vide ne change plus d'état.",
      };
    }
  }

  const { data: modifies, error } = await supabase
    .from("mandats")
    .update({ etat: nouvelEtat })
    .eq("id", mandatId)
    .eq("organization_id", orgId)
    .eq("etat", mandat.etat)
    .select("id");
  if (error) return { erreur: `Changement d'état impossible : ${sansJargon(error.message)}` };
  // 0 ligne touchée = l'état a changé entre la lecture et l'écriture
  if ((modifies ?? []).length === 0) {
    revalidatePath(`/agence/${orgId}/personnes/${personId}`);
    return { erreur: "Le mandat a changé entre-temps — l'écran vient d'être rechargé, revérifiez son état." };
  }

  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "État du mandat mis à jour." };
}
