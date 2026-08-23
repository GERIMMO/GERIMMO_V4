"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { ASSIGNATION_TOUS } from "@/lib/alertes";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatAlerte = {
  erreur?: string;
  succes?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Une alerte se traite si elle est à moi ou à tout le monde ; le responsable
// garde la main sur toutes (sinon une alerte confiée à un absent est bloquée).
function peutAgir(
  alerte: { assignee_account_id: string | null; assigned_all: boolean },
  userId: string,
  role: string
) {
  return (
    alerte.assigned_all ||
    alerte.assignee_account_id === userId ||
    ROLES_RESPONSABLES.includes(role)
  );
}

export async function creerAlerte(
  orgId: string,
  _etat: EtatAlerte,
  formData: FormData
): Promise<EtatAlerte> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const titre = String(formData.get("titre") ?? "").trim();
  const criticite = String(formData.get("criticite") ?? "normale");
  const echeance = String(formData.get("echeance") ?? "");
  const assignee = String(formData.get("assignee") ?? "");

  if (!titre) return { erreur: "Le titre est obligatoire.", valeurs };
  if (!["informative", "normale", "critique"].includes(criticite)) {
    return { erreur: "Criticité invalide.", valeurs };
  }
  // Règle générale : une alerte est forcément assignée à au moins une personne
  if (!assignee) return { erreur: "Choisir à qui l'alerte est assignée.", valeurs };
  if (assignee === ASSIGNATION_TOUS && !ROLES_RESPONSABLES.includes(role)) {
    return {
      erreur: "Seul le responsable de l'agence peut assigner à tout le monde.",
      valeurs,
    };
  }

  const { error } = await supabase.from("alerts").insert({
    organization_id: orgId,
    type: "manuelle",
    titre,
    criticite,
    echeance: echeance || null,
    assignee_account_id: assignee === ASSIGNATION_TOUS ? null : assignee,
    assigned_all: assignee === ASSIGNATION_TOUS,
  });
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}`, valeurs };

  revalidatePath(`/agence/${orgId}/alertes`);
  return { succes: "Alerte créée." };
}

// Confier (escalade nominative, module 14) : l'alerte se DÉPLACE vers
// quelqu'un — ou vers tout le monde (responsable uniquement) — elle ne se
// duplique jamais ; l'historique des escalades est conservé.
export async function escaladerAlerte(
  orgId: string,
  alerteId: string,
  _etat: EtatAlerte,
  formData: FormData
): Promise<EtatAlerte> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const vers = String(formData.get("vers") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!vers) return { erreur: "Choisir à qui confier l'alerte.", valeurs };
  // Recette 13/08 : on ne confie jamais une alerte sans un mot — le
  // destinataire doit savoir pourquoi elle lui arrive.
  if (!message) return { erreur: "Le message au destinataire est obligatoire.", valeurs };
  if (vers === ASSIGNATION_TOUS && !ROLES_RESPONSABLES.includes(role)) {
    return {
      erreur: "Seul le responsable de l'agence peut assigner à tout le monde.",
      valeurs,
    };
  }

  const { data: alerte } = await supabase
    .from("alerts")
    .select("assignee_account_id, assigned_all, escalades, statut, criticite")
    .eq("id", alerteId)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Une alerte informative ne s'escalade jamais (module 14)
  if (!alerte || alerte.statut !== "ouverte" || alerte.criticite === "informative") {
    return { erreur: "Cette alerte ne peut pas être confiée.", valeurs };
  }
  // Une alerte confiée à quelqu'un d'autre est intouchable (hors responsable)
  if (!peutAgir(alerte, user.id, role)) {
    return { erreur: "Cette alerte est confiée à quelqu'un d'autre.", valeurs };
  }

  const escalades = Array.isArray(alerte.escalades) ? alerte.escalades : [];
  escalades.push({
    de: alerte.assigned_all ? ASSIGNATION_TOUS : alerte.assignee_account_id,
    vers,
    par: user.id,
    le: new Date().toISOString(),
    message,
  });

  // L'écriture n'aboutit que si l'assignation n'a pas bougé depuis la lecture
  // (revue 13/08) : deux « Confier » simultanés écraseraient l'historique.
  let requete = supabase
    .from("alerts")
    .update({
      assignee_account_id: vers === ASSIGNATION_TOUS ? null : vers,
      assigned_all: vers === ASSIGNATION_TOUS,
      escalades,
    })
    .eq("id", alerteId)
    .eq("organization_id", orgId)
    .eq("statut", "ouverte")
    .eq("assigned_all", alerte.assigned_all);
  requete =
    alerte.assignee_account_id === null
      ? requete.is("assignee_account_id", null)
      : requete.eq("assignee_account_id", alerte.assignee_account_id);
  const { data: modifiees, error } = await requete.select("id");
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if ((modifiees ?? []).length === 0) {
    revalidatePath(`/agence/${orgId}/alertes`);
    return {
      erreur: "L'alerte a changé entre-temps — la liste vient d'être rechargée, revérifiez.",
      valeurs,
    };
  }

  revalidatePath(`/agence/${orgId}/alertes`);
  revalidatePath(`/agence/${orgId}`);
  return { succes: "Alerte confiée." };
}

// Marquer traitée (module 14) : on enregistre CE QUI a fermé l'alerte.
export async function fermerAlerte(
  orgId: string,
  alerteId: string,
  _etat: EtatAlerte,
  formData: FormData
): Promise<EtatAlerte> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const action = String(formData.get("action_effectuee") ?? "").trim();
  if (!action) return { erreur: "Dire ce qui a été fait est obligatoire.", valeurs };

  const { data: alerte } = await supabase
    .from("alerts")
    .select("assignee_account_id, assigned_all, statut")
    .eq("id", alerteId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!alerte || alerte.statut !== "ouverte") {
    return { erreur: "Cette alerte n'est plus ouverte.", valeurs };
  }
  // Une alerte confiée à quelqu'un d'autre est grisée : on ne la ferme pas
  if (!peutAgir(alerte, user.id, role)) {
    return { erreur: "Cette alerte est confiée à quelqu'un d'autre.", valeurs };
  }

  const { error } = await supabase
    .from("alerts")
    .update({
      statut: "fermee",
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      closed_action: action,
    })
    .eq("id", alerteId)
    .eq("organization_id", orgId)
    .eq("statut", "ouverte");
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/alertes`);
  revalidatePath(`/agence/${orgId}`);
  return { succes: "Alerte traitée." };
}
