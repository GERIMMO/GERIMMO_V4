"use server";

import { sansJargon } from "@/lib/erreurs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROLES_GERANTS } from "@/lib/ged";

export type EtatAlerte = { erreur?: string; succes?: string };

async function verifierGerant(orgId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !ROLES_GERANTS.includes(adhesion.role)) {
    return { supabase, user: null };
  }
  return { supabase, user };
}

export async function creerAlerte(
  orgId: string,
  _etat: EtatAlerte,
  formData: FormData
): Promise<EtatAlerte> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const titre = String(formData.get("titre") ?? "").trim();
  const criticite = String(formData.get("criticite") ?? "normale");
  const echeance = String(formData.get("echeance") ?? "");
  const assignee = String(formData.get("assignee") ?? "");

  if (!titre) return { erreur: "Le titre est obligatoire." };
  if (!["informative", "normale", "critique"].includes(criticite)) {
    return { erreur: "Criticité invalide." };
  }

  const { error } = await supabase.from("alerts").insert({
    organization_id: orgId,
    type: "manuelle",
    titre,
    criticite,
    echeance: echeance || null,
    assignee_account_id: assignee || null,
  });
  if (error) return { erreur: `Création impossible : ${sansJargon(error.message)}` };

  revalidatePath(`/agence/${orgId}/alertes`);
  return { succes: "Alerte créée." };
}

// Escalade nominative (module 14) : l'alerte se DÉPLACE vers quelqu'un,
// elle ne se duplique jamais ; l'historique des escalades est conservé.
export async function escaladerAlerte(
  orgId: string,
  alerteId: string,
  formData: FormData
): Promise<void> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return;

  const vers = String(formData.get("vers") ?? "");
  if (!vers) return;

  const { data: alerte } = await supabase
    .from("alerts")
    .select("assignee_account_id, escalades, statut, criticite")
    .eq("id", alerteId)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Une alerte informative ne s'escalade jamais (module 14)
  if (!alerte || alerte.statut !== "ouverte" || alerte.criticite === "informative") return;

  const escalades = Array.isArray(alerte.escalades) ? alerte.escalades : [];
  escalades.push({
    de: alerte.assignee_account_id,
    vers,
    par: user.id,
    le: new Date().toISOString(),
  });

  await supabase
    .from("alerts")
    .update({ assignee_account_id: vers, escalades })
    .eq("id", alerteId)
    .eq("organization_id", orgId);

  revalidatePath(`/agence/${orgId}/alertes`);
}

// Fermeture par l'action (module 14) : on enregistre CE QUI a fermé l'alerte.
export async function fermerAlerte(
  orgId: string,
  alerteId: string,
  formData: FormData
): Promise<void> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return;

  const action = String(formData.get("action_effectuee") ?? "").trim();
  if (!action) return;

  await supabase
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

  revalidatePath(`/agence/${orgId}/alertes`);
}
