"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";

export type EtatReseau = { erreur?: string; succes?: string };
function revalider(org?: string, bien?: string) {
  revalidatePath("/admin/couverture");
  if (!org) {
    revalidatePath("/agence/[orgId]/reseau", "page");
    revalidatePath("/agence/[orgId]/incidents", "page");
  }
  if (org) {
    revalidatePath(`/agence/${org}/reseau`);
    revalidatePath(`/agence/${org}/incidents`, "layout");
    if (bien) revalidatePath(`/agence/${org}/parc/${bien}`);
  }
}

export async function confirmerCommuneBien(org: string, bien: string, _etat: EtatReseau, form: FormData): Promise<EtatReseau> {
  const { supabase, user } = await verifierGerant(org);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("reseau_confirmer_commune", { p_org: org, p_bien: bien, p_commune: String(form.get("commune") ?? "") });
  if (error) return { erreur: sansJargon(error.message) };
  revalider(org, bien);
  return { succes: "Commune du bien confirmée. La disponibilité est vérifiée pour cette commune, métier par métier." };
}

export async function signalerInteretReseau(org: string, bien: string, metier: string, nature: string, _etat: EtatReseau, _form: FormData): Promise<EtatReseau> {
  const { supabase, user } = await verifierGerant(org);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("reseau_signaler_interet", { p_org: org, p_bien: bien, p_metier: metier, p_nature: nature });
  if (error) return { erreur: sansJargon(error.message) };
  revalider(org, bien);
  return { succes: "Votre intérêt est enregistré. Aucune demande d’intervention n’a été créée et aucun professionnel n’a été contacté." };
}

export async function reglerOuvertureReseau(_etat: EtatReseau, form: FormData): Promise<EtatReseau> {
  const supabase = await createClient();
  const { data: autorise, error: acces } = await supabase.rpc("is_super_admin");
  if (acces || autorise !== true) return { erreur: "Accès réservé à la supervision." };
  const ouverte = form.get("ouverte") === "oui";
  const { error } = await supabase.rpc("reseau_regler_ouverture", {
    p_communes: [...new Set(form.getAll("communes").map(String))],
    p_metier: String(form.get("metier") ?? ""), p_ouverte: ouverte, p_confirmation: form.get("confirmation") === "oui",
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalider();
  return { succes: ouverte ? "Ouverture enregistrée pour ce métier dans les communes choisies." : "Communes enregistrées comme fermées pour ce métier. Les demandes déjà engagées restent accessibles." };
}

export async function rattacherArtisanReseau(_etat: EtatReseau, form: FormData): Promise<EtatReseau> {
  const supabase = await createClient();
  const { data: autorise, error: acces } = await supabase.rpc("is_super_admin");
  if (acces || autorise !== true) return { erreur: "Accès réservé à la supervision." };
  const rattacher = form.get("rattacher") !== "non";
  const { error } = await supabase.rpc("reseau_rattacher_artisan", {
    p_artisan: String(form.get("artisan") ?? ""), p_communes: [...new Set(form.getAll("communes").map(String))],
    p_metier: String(form.get("metier") ?? ""), p_rattacher: rattacher,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalider();
  return { succes: rattacher ? "Communes rattachées à l’artisan pour ce métier. Leur ouverture commerciale reste une décision séparée." : "Rattachement retiré. Les dossiers déjà engagés restent accessibles." };
}
