"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { communeEvidente, type CommuneReseau } from "@/lib/reseau";

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

// Audit gestion du 29/09 : les biens existants n'avaient pas de commune — le
// réseau leur restait fermé. Geste groupé : chaque bien dont le code postal ne
// dessert qu'une commune (ou une seule au nom de la ville saisie) est confirmé
// par reseau_confirmer_commune, bien par bien ; la base garde le dernier mot
// (ville cohérente). Les cas ambigus restent au choix de l'utilisateur.
export async function confirmerCommunesEvidentes(org: string, _etat: EtatReseau, _form: FormData): Promise<EtatReseau> {
  const { supabase, user } = await verifierGerant(org);
  if (!user) return { erreur: "Accès refusé." };
  const { data: biens, error } = await supabase
    .from("biens")
    .select("id,postal_code,city")
    .eq("organization_id", org)
    .is("commune_insee", null)
    .is("archived_at", null)
    .limit(500);
  if (error) return { erreur: "La liste des biens est indisponible. Réessayez." };
  const codes = [...new Set((biens ?? []).map((b) => String(b.postal_code ?? "").trim()).filter((cp) => /^\d{5}$/.test(cp)))];
  if (!codes.length) return { succes: "Aucun bien à confirmer : les biens sans commune n’ont pas de code postal exploitable." };
  const { data: communes, error: erreurCommunes } = await supabase
    .from("reseau_communes")
    .select("code,nom,codes_postaux,departement")
    .overlaps("codes_postaux", codes);
  if (erreurCommunes) return { erreur: "Les communes ne peuvent pas être chargées. Réessayez." };
  let confirmees = 0;
  let aVerifier = 0;
  let ambigues = 0;
  for (const b of biens ?? []) {
    const cp = String(b.postal_code ?? "").trim();
    const candidates = ((communes ?? []) as CommuneReseau[]).filter((c) => c.codes_postaux.includes(cp));
    const choix = communeEvidente(candidates, b.city);
    if (!choix) {
      ambigues++;
      continue;
    }
    const { error: refus } = await supabase.rpc("reseau_confirmer_commune", { p_org: org, p_bien: b.id, p_commune: choix.code });
    if (refus) aVerifier++;
    else confirmees++;
  }
  revalider(org);
  const reste = aVerifier + ambigues;
  return {
    succes:
      `${confirmees} commune${confirmees > 1 ? "s" : ""} confirmée${confirmees > 1 ? "s" : ""}.` +
      (reste
        ? ` ${reste} bien${reste > 1 ? "s" : ""} à confirmer un par un (plusieurs communes possibles, ou ville différente de la commune).`
        : ""),
  };
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
