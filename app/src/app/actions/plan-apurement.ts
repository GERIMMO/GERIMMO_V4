"use server";
// Plan d'apurement (02/11/2026) : une dette échue gelée en base, étalée en tranches mensuelles.
// Tout le calcul est fait par la base (proposer_plan_apurement) ; l'écran ne transmet que les choix.
import { revalidatePath } from "next/cache";
import { verifierGerant, verifierLocataire } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { lireMontantFacultatif } from "@/lib/saisie-montant";
import { genererDocument } from "@/app/actions/documents-generes";
import { versRouteAgence } from "@/lib/racine-espace";

export type EtatPlanApurement = { erreur?: string; succes?: string; valeurs?: Record<string, string>; documentId?: string };

function revalider(orgId: string, bailId: string) {
  revalidatePath(`/agence/${orgId}/baux/${bailId}`);
  revalidatePath(`/espace/${orgId}/baux/${bailId}`);
  revalidatePath(`/agence/${orgId}/alertes`);
  revalidatePath(`/espace/${orgId}/alertes`);
  revalidatePath(`/locataire/${orgId}/loyers`);
}

export async function proposerPlanApurement(orgId: string, bailId: string, _etat: EtatPlanApurement, f: FormData): Promise<EtatPlanApurement> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "plan_apurement_proposition", cible: bailId });
  if (!user || !estUuid(bailId)) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(f);
  const tranches = Number(String(f.get("tranches") ?? "").trim());
  if (!Number.isInteger(tranches) || tranches < 1 || tranches > 60) return { erreur: "Choisissez de 1 à 60 tranches mensuelles.", valeurs };
  const premiere = String(f.get("premiere_echeance") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(premiere)) return { erreur: "Indiquez la date de la première tranche.", valeurs };
  const acompte = lireMontantFacultatif(f.get("acompte"));
  if ("erreur" in acompte) return { erreur: acompte.erreur, valeurs };
  const tolerance = Number(String(f.get("tolerance_jours") ?? "5").trim());
  const seuil = Number(String(f.get("seuil_caducite") ?? "2").trim());
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 30 || !Number.isInteger(seuil) || seuil < 1 || seuil > 6)
    return { erreur: "Tolérance de 0 à 30 jours et caducité de 1 à 6 tranches manquées.", valeurs };
  const { error } = await supabase.rpc("proposer_plan_apurement", {
    p_org: orgId, p_bail: bailId, p_nombre_tranches: tranches, p_premiere_echeance: premiere,
    p_acompte: acompte.montant ?? 0, p_conditions: String(f.get("conditions") ?? "").trim() || null,
    p_tolerance_jours: tolerance, p_seuil_caducite: seuil,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalider(orgId, bailId);
  return { succes: "Plan proposé. Générez le protocole, faites-le accepter, puis activez le plan." };
}

export async function activerPlanApurement(orgId: string, bailId: string, planId: string, _etat: EtatPlanApurement, f: FormData): Promise<EtatPlanApurement> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "plan_apurement_activation", cible: bailId });
  if (!user || ![bailId, planId].every(estUuid)) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(f);
  const date = String(f.get("date_acceptation") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erreur: "Indiquez la date d’acceptation par le locataire.", valeurs };
  if (f.get("accepte") !== "on") return { erreur: "Confirmez que le locataire a accepté le plan.", valeurs };
  const { error } = await supabase.rpc("activer_plan_apurement", { p_org: orgId, p_plan: planId, p_date_acceptation: date });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalider(orgId, bailId);
  return { succes: "Plan activé : les relances automatiques sont suspendues tant qu’il est respecté." };
}

export async function annulerPlanApurement(orgId: string, bailId: string, planId: string, _etat: EtatPlanApurement, f: FormData): Promise<EtatPlanApurement> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "plan_apurement_annulation", cible: bailId });
  if (!user || ![bailId, planId].every(estUuid)) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(f);
  const motif = String(f.get("motif") ?? "").trim();
  if (motif.length < 3) return { erreur: "Indiquez le motif de l’annulation.", valeurs };
  const { error } = await supabase.rpc("annuler_plan_apurement", { p_org: orgId, p_plan: planId, p_motif: motif });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalider(orgId, bailId);
  return { succes: "Plan annulé. Les relances reprennent leur cours." };
}

// Le protocole (modèle « protocole_apurement ») est généré depuis le plan enregistré, puis rattaché au plan.
export async function genererProtocolePlan(orgId: string, bailId: string, planId: string, cheminRetour: string): Promise<EtatPlanApurement> {
  const { supabase, user } = await verifierGerant(orgId, { geste: "plan_apurement_protocole", cible: bailId });
  if (!user || ![bailId, planId].every(estUuid)) return { erreur: "Accès refusé." };
  const generation = await genererDocument(orgId, "protocole_apurement", bailId, versRouteAgence(cheminRetour), { plan_id: planId });
  if (!generation.documentId) return { erreur: generation.erreur ?? "Le protocole n’a pas pu être généré." };
  const { error } = await supabase.rpc("rattacher_document_plan_apurement", { p_org: orgId, p_plan: planId, p_document: generation.documentId, p_signe: false });
  revalider(orgId, bailId);
  if (error) return { documentId: generation.documentId, erreur: "Le protocole est dans Documents, mais son rattachement au plan a échoué : " + sansJargon(error.message) };
  return { documentId: generation.documentId, succes: generation.succes ?? "Protocole généré." };
}

// Espace locataire : demander un plan (message au gérant + alerte).
export async function demanderPlanApurement(orgId: string, _etat: EtatPlanApurement, f: FormData): Promise<EtatPlanApurement> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(f);
  const message = String(f.get("message") ?? "").trim();
  if (message.length > 2000) return { erreur: "Votre message est trop long (2 000 caractères au plus).", valeurs };
  const { error } = await supabase.rpc("demander_plan_apurement", { p_org: orgId, p_message: message });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/locataire/${orgId}/loyers`);
  revalidatePath(`/locataire/${orgId}/contact`);
  revalidatePath(`/agence/${orgId}/alertes`);
  return { succes: "Demande transmise à votre gestionnaire. Vous serez informé de sa réponse dans votre messagerie." };
}
