"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { journaliserSupervision, JOURNAL_A_VERIFIER } from "@/lib/journal-supervision";
import { lireMots } from "@/lib/pertinence-veille";
import { adresseDuSite } from "@/lib/site";
import { sansJargon } from "@/lib/erreurs";

export type EtatCampagne = { erreur?: string; succes?: string };

export async function enregistrerReglagesMarketing(_etat: EtatCampagne, donnees: FormData): Promise<EtatCampagne> {
  const supabase = await createClient();
  const { data: autorise } = await supabase.rpc("is_permanent_super_admin");
  if (autorise !== true) return { erreur: "Accès refusé." };
  const jour1 = Number(donnees.get("jour_1"));
  const jour2 = Number(donnees.get("jour_2"));
  const heure = Number(donnees.get("heure_paris"));
  const budget = Number(String(donnees.get("budget") ?? "10").replace(",", "."));
  if (![jour1, jour2].every((j) => Number.isInteger(j) && j >= 1 && j <= 7) || jour1 === jour2) return { erreur: "Choisissez deux jours différents." };
  if (!Number.isInteger(heure) || heure < 0 || heure > 23) return { erreur: "Heure de préparation invalide." };
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000) return { erreur: "Le seuil d’alerte mensuel doit être compris entre 0 et 1 000 €." };
  const { data: utilisateur } = await supabase.auth.getUser();
  // 06/10 : fenêtre de veto. Mots-clés de la veille et validation obligatoire.
  const motsInclus = lireMots(String(donnees.get("veille_mots_inclus") ?? ""));
  const motsExclus = lireMots(String(donnees.get("veille_mots_exclus") ?? ""));
  if (motsInclus.length === 0) return { erreur: "Gardez au moins un mot-clé de pertinence : sans lui, aucune veille ne passerait." };
  // `publicite_active` n'est plus écrasé (25/09) : aucun geste de l'écran ne
  // le règle, il garde sa valeur en base. Le montant saisi est un seuil
  // d'alerte sur les dépenses Meta constatées, pas un budget qu'on engage.
  const { error } = await supabase.from("marketing_reglages").update({
    actif: donnees.get("actif") === "on",
    publication_automatique: donnees.get("publication_automatique") === "on",
    diffusion_version: 1,
    publications_semaine: 2,
    jours_semaine: [jour1, jour2].sort((a, b) => a - b),
    heure_paris: heure,
    validation_obligatoire: donnees.get("validation_obligatoire") === "on",
    veille_mots_inclus: motsInclus,
    veille_mots_exclus: motsExclus,
    budget_mensuel_cents: Math.round(budget * 100),
    modifie_par: utilisateur.user?.id ?? null,
    modifie_le: new Date().toISOString(),
  }).eq("singleton", true);
  if (error) return { erreur: "Les réglages n’ont pas pu être enregistrés." };
  // Audit console 27/09 : les réglages marketing se journalisent.
  const journal = await journaliserSupervision(supabase, "reglages_marketing_modifies", {
    actif: donnees.get("actif") === "on", publication_automatique: donnees.get("publication_automatique") === "on",
    heure_paris: heure, seuil_mensuel_cents: Math.round(budget * 100),
    validation_obligatoire: donnees.get("validation_obligatoire") === "on", mots_inclus: motsInclus.length, mots_exclus: motsExclus.length,
  });
  revalidatePath("/admin/marketing");
  return { succes: `Pilotage marketing mis à jour.${journal ? "" : JOURNAL_A_VERIFIER}` };
}

// Une INTENTION éditoriale, pas une campagne (25/09). Le formulaire
// enregistrait des lignes « planifiee » que rien ne lisait jamais : la
// mission marketing suit son propre rythme (deux jours par semaine) et la
// publicité payante n'est pas ouverte depuis Gerimmo. La ligne
// notée ici est une note de travail affichée telle quelle, sans promesse de
// diffusion ; une campagne sponsorisée est refusée tant que la publicité
// n'existe pas comme geste.
export async function programmerCampagne(_etat: EtatCampagne, donnees: FormData): Promise<EtatCampagne> {
  const supabase = await createClient();
  const { data: autorise } = await supabase.rpc("is_permanent_super_admin");
  if (autorise !== true) return { erreur: "Accès refusé." };

  const nom = String(donnees.get("nom") ?? "").trim();
  const description = String(donnees.get("description") ?? "").trim();
  const date = String(donnees.get("publication_prevue_le") ?? "").trim();
  const objectif = String(donnees.get("objectif") ?? "notoriete");
  const nature = String(donnees.get("nature") ?? "organique");
  if (nom.length < 3) return { erreur: "Donnez un nom précis à l’intention." };
  if (!date || Number.isNaN(Date.parse(date))) return { erreur: "Choisissez la date visée." };
  if (!['notoriete', 'trafic', 'prospects', 'conversion'].includes(objectif)) return { erreur: "Objectif invalide." };
  if (nature !== "organique") return { erreur: "Les campagnes payantes ne sont pas lancées depuis Gerimmo. Seule une publication gratuite peut être notée." };

  const { data: utilisateur } = await supabase.auth.getUser();
  const { error } = await supabase.from("marketing_campagnes").insert({
    nom,
    description: description || null,
    objectif,
    nature: "organique",
    canal: "facebook",
    statut: "idee",
    publication_prevue_le: new Date(date).toISOString(),
    budget_cents: 0,
    cree_par: utilisateur.user?.id ?? null,
  });
  if (error) return { erreur: "L’intention n’a pas pu être enregistrée." };
  await journaliserSupervision(supabase, "intention_marketing_notee", { objectif });
  revalidatePath("/admin/marketing");
  return { succes: "Intention notée. Elle n’est pas diffusée automatiquement : préparez l’article depuis « Créer un article » à la date visée." };
}

// ── La fenêtre de veto (06/10) ─────────────────────────────────────────────
// Les quatre gestes passent par `decider_publication_marketing`, qui vérifie le
// superviseur (MFA), journalise et solde la décision du point du matin.
// « Publier maintenant » avance l'heure à l'instant ; la diffusion réelle
// (site puis Facebook) est faite par la mission, appelée ici sans attendre le
// prochain passage de pg_cron.
const ACTIONS_VETO = new Set(["valider", "publier_maintenant", "reporter", "refuser"]);

export async function deciderPostProgramme(_etat: EtatCampagne, donnees: FormData): Promise<EtatCampagne> {
  const supabase = await createClient();
  const { data: autorise } = await supabase.rpc("is_permanent_super_admin");
  if (autorise !== true) return { erreur: "Ce geste demande votre compte de supervision et sa double vérification." };
  const id = String(donnees.get("id") ?? "");
  const action = String(donnees.get("action") ?? "");
  const motif = String(donnees.get("motif") ?? "").trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/.test(id) || !ACTIONS_VETO.has(action)) return { erreur: "Geste inconnu." };
  const { error } = await supabase.rpc("decider_publication_marketing", { p_id: id, p_action: action, p_motif: motif || null });
  if (error) return { erreur: sansJargon(error.message) };
  let suite = "";
  if (action === "publier_maintenant") suite = await lancerDiffusionMaintenant();
  revalidatePath("/admin/marketing");
  revalidatePath("/admin/brief");
  revalidatePath("/admin/publications");
  revalidatePath("/journal");
  const messages: Record<string, string> = {
    valider: "Validé : le post partira à l’heure prévue.",
    publier_maintenant: `Publication lancée.${suite}`,
    reporter: "Reporté : le post ne partira pas. Reprogrammez-le depuis l’éditeur si besoin.",
    refuser: "Refusé : le post ne partira jamais.",
  };
  return { succes: messages[action] };
}

/** Appelle la mission marketing tout de suite ; à défaut, pg_cron la relance sous cinq minutes. */
async function lancerDiffusionMaintenant(): Promise<string> {
  const secret = process.env.CRON_SECRET?.trim();
  const site = adresseDuSite();
  if (!secret || !site) return " La diffusion suivra au prochain passage (moins de cinq minutes).";
  try {
    const reponse = await fetch(`${site}/api/cron/equipes?mission=marketing`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(90_000) });
    const bilan = (await reponse.json().catch(() => null)) as { publiees?: number; erreurs?: string[] } | null;
    if (bilan?.publiees) return " Le post est paru sur le journal et sur Facebook.";
    if (bilan?.erreurs?.length) return ` Le site a publié ; Facebook : ${bilan.erreurs[0]}`;
    return " La diffusion suivra au prochain passage (moins de cinq minutes).";
  } catch {
    return " La diffusion suivra au prochain passage (moins de cinq minutes).";
  }
}
