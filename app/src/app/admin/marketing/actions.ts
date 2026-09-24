"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000) return { erreur: "Le budget mensuel doit être compris entre 0 et 1 000 €." };
  const { data: utilisateur } = await supabase.auth.getUser();
  const { error } = await supabase.from("marketing_reglages").update({
    actif: donnees.get("actif") === "on",
    publication_automatique: donnees.get("publication_automatique") === "on",
    diffusion_version: 1,
    publicite_active: false,
    publications_semaine: 2,
    jours_semaine: [jour1, jour2].sort((a, b) => a - b),
    heure_paris: heure,
    budget_mensuel_cents: Math.round(budget * 100),
    modifie_par: utilisateur.user?.id ?? null,
    modifie_le: new Date().toISOString(),
  }).eq("singleton", true);
  if (error) return { erreur: "Les réglages n’ont pas pu être enregistrés." };
  revalidatePath("/admin/marketing");
  return { succes: "Pilotage marketing mis à jour." };
}

export async function programmerCampagne(_etat: EtatCampagne, donnees: FormData): Promise<EtatCampagne> {
  const supabase = await createClient();
  const { data: autorise } = await supabase.rpc("is_permanent_super_admin");
  if (autorise !== true) return { erreur: "Accès refusé." };

  const nom = String(donnees.get("nom") ?? "").trim();
  const description = String(donnees.get("description") ?? "").trim();
  const date = String(donnees.get("publication_prevue_le") ?? "").trim();
  const objectif = String(donnees.get("objectif") ?? "notoriete");
  const nature = String(donnees.get("nature") ?? "organique");
  const budget = String(donnees.get("budget") ?? "").replace(",", ".").trim();
  if (nom.length < 3) return { erreur: "Donnez un nom précis à la campagne." };
  if (!date || Number.isNaN(Date.parse(date))) return { erreur: "Choisissez une date de publication." };
  if (!['notoriete', 'trafic', 'prospects', 'conversion'].includes(objectif)) return { erreur: "Objectif invalide." };
  if (!['organique', 'sponsorisee'].includes(nature)) return { erreur: "Type de diffusion invalide." };
  const euros = budget ? Number(budget) : 0;
  if (!Number.isFinite(euros) || euros < 0) return { erreur: "Le budget doit être un montant positif." };
  if (nature === "sponsorisee" && euros <= 0) return { erreur: "Indiquez un budget pour une campagne sponsorisée." };

  const { data: utilisateur } = await supabase.auth.getUser();
  const { error } = await supabase.from("marketing_campagnes").insert({
    nom,
    description: description || null,
    objectif,
    nature,
    canal: "facebook",
    statut: "planifiee",
    publication_prevue_le: new Date(date).toISOString(),
    budget_cents: Math.round(euros * 100),
    cree_par: utilisateur.user?.id ?? null,
  });
  if (error) return { erreur: "La campagne n’a pas pu être enregistrée." };
  revalidatePath("/admin/marketing");
  return { succes: "Campagne ajoutée au calendrier." };
}
