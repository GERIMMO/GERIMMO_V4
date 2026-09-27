"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { journaliserSupervision, JOURNAL_A_VERIFIER } from "@/lib/journal-supervision";

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
    budget_mensuel_cents: Math.round(budget * 100),
    modifie_par: utilisateur.user?.id ?? null,
    modifie_le: new Date().toISOString(),
  }).eq("singleton", true);
  if (error) return { erreur: "Les réglages n’ont pas pu être enregistrés." };
  // Audit console 27/09 : les réglages marketing se journalisent.
  const journal = await journaliserSupervision(supabase, "reglages_marketing_modifies", {
    actif: donnees.get("actif") === "on", publication_automatique: donnees.get("publication_automatique") === "on",
    heure_paris: heure, seuil_mensuel_cents: Math.round(budget * 100),
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
