"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { envoyerSurFacebook } from "@/lib/facebook";

export type EtatPublication = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

// Adresse lisible d'un article : « Réviser un loyer en 2026 » → « reviser-un-
// loyer-en-2026 ». Les accents sont dépliés (NFD) puis retirés, pour que l'URL
// reste stable même si le titre est réécrit avec d'autres diacritiques.
function versSlug(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function garderSuperAdmin() {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_permanent_super_admin");
  return { supabase, autorise: Boolean(estSuperAdmin) };
}

/** Remplit la file : une proposition par veine dont le mois est venu. */
export async function genererPropositions(): Promise<EtatPublication> {
  const { supabase, autorise } = await garderSuperAdmin();
  if (!autorise) return { erreur: "Accès refusé." };

  const { data, error } = await supabase.rpc("proposer_publications");
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath("/admin/publications");
  const n = Number(data ?? 0);
  return {
    succes:
      n === 0
        ? "Aucun nouveau sujet ce mois-ci — la file est déjà à jour."
        : `${n} nouvelle${n > 1 ? "s" : ""} proposition${n > 1 ? "s" : ""} dans la file.`,
  };
}

/** Enregistre le travail d'écriture sans rien publier. */
export async function enregistrerPublication(
  id: string,
  _etat: EtatPublication,
  formData: FormData
): Promise<EtatPublication> {
  const { supabase, autorise } = await garderSuperAdmin();
  if (!autorise) return { erreur: "Accès refusé." };

  const titre = String(formData.get("titre") ?? "").trim();
  const chapo = String(formData.get("chapo") ?? "").trim();
  const corps = String(formData.get("corps") ?? "").trim();
  const seo = String(formData.get("seo_description") ?? "").trim();
  const slugSaisi = String(formData.get("slug") ?? "").trim();
  const facebookTexte = String(formData.get("facebook_texte") ?? "").trim();
  const facebookImageUrl = String(formData.get("facebook_image_url") ?? "").trim();
  const valeurs = { titre, chapo, corps, seo_description: seo, slug: slugSaisi, facebook_texte: facebookTexte, facebook_image_url: facebookImageUrl };

  if (!titre) return { erreur: "Le titre est obligatoire.", valeurs };

  // Enregistrer un article PARU le laisse en ligne (audit 25/09, C17) : le
  // bouton principal dépubliait sans le dire. « Passer en brouillon » est un
  // geste distinct, explicite.
  const { data: actuel } = await supabase.from("publications").select("statut, slug").eq("id", id).maybeSingle();
  const paru = actuel?.statut === "publiee";
  const passerEnBrouillon = formData.get("passer_en_brouillon") === "oui";
  const statut = paru && !passerEnBrouillon ? "publiee" : "brouillon";

  const { error } = await supabase
    .from("publications")
    .update({
      titre,
      chapo: chapo || null,
      corps: corps || null,
      seo_description: seo || null,
      slug: slugSaisi ? versSlug(slugSaisi) : versSlug(titre),
      facebook_texte: facebookTexte || null,
      facebook_image_url: facebookImageUrl || null,
      // Une proposition qu'on commence à écrire cesse d'être une proposition.
      statut,
    })
    .eq("id", id);
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/admin/publications/${id}`);
  revalidatePath("/admin/publications");
  if (paru) {
    revalidatePath("/journal");
    revalidatePath("/");
    if (actuel?.slug) revalidatePath(`/journal/${actuel.slug}`);
  }
  return { succes: statut === "publiee" ? "Modifications enregistrées. L’article reste en ligne." : paru ? "Article passé en brouillon : il n’est plus dans le journal." : "Brouillon enregistré." };
}

/** Diffuse sur la Page Gerimmo l'article déjà paru, une seule fois. */
export async function publierPublicationFacebook(id: string): Promise<EtatPublication> {
  const { supabase, autorise } = await garderSuperAdmin();
  if (!autorise) return { erreur: "Accès refusé." };

  const { data: article, error: erreurLecture } = await supabase
    .from("publications")
    .select("titre, chapo, slug, statut, facebook_texte, facebook_image_url, facebook_post_id")
    .eq("id", id)
    .maybeSingle();
  if (erreurLecture || !article) return { erreur: "Article introuvable." };
  if (article.statut !== "publiee" || !article.slug) return { erreur: "Faites d’abord paraître l’article dans le Journal Gerimmo." };
  if (article.facebook_post_id) return { succes: "Cet article est déjà publié sur Facebook." };

  const reservation = await supabase.rpc('reserver_diffusion_facebook', {p_id:id,p_automatique:false});
  if(reservation.error || reservation.data !== true) return {erreur:'Un envoi est déjà engagé ou ne peut pas être confirmé. Vérifiez Facebook avant une nouvelle tentative.'};

  try {
    const resultat = await envoyerSurFacebook({
      titre: article.titre,
      chapo: article.chapo,
      slug: article.slug,
      facebookTexte: article.facebook_texte,
      facebookImageUrl: article.facebook_image_url,
    });
    const { error } = await supabase.from("publications").update({
      facebook_post_id: resultat.post_id,
      facebook_publie_le: new Date().toISOString(),
      facebook_erreur: null,
    }).eq("id", id);
    if (error) return { erreur: "Facebook a publié, mais Gerimmo n’a pas pu enregistrer son identifiant. N’appuyez pas une seconde fois." };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.slice(0, 500) : "La publication Facebook a échoué.";
    await supabase.from("publications").update({ facebook_erreur: message }).eq("id", id);
    return { erreur: message };
  }

  revalidatePath(`/admin/publications/${id}`);
  return { succes: "Gerimmo a publié l’article sur sa Page Facebook." };
}

/**
 * Fait paraître l'article. La base a le dernier mot : le déclencheur
 * publication_prete_a_paraitre refuse tant qu'un « [[à compléter : … ]] »
 * subsiste. On laisse remonter son message tel quel — il nomme le passage
 * fautif, c'est exactement ce que l'auteur a besoin de lire.
 */
export async function publierPublication(id: string): Promise<EtatPublication> {
  const { supabase, autorise } = await garderSuperAdmin();
  if (!autorise) return { erreur: "Accès refusé." };

  const { data: pub } = await supabase
    .from("publications")
    .select("titre, slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("publications")
    .update({
      statut: "publiee",
      slug: pub?.slug || versSlug(pub?.titre ?? ""),
    })
    .eq("id", id);
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath("/admin/publications");
  revalidatePath("/journal");
  revalidatePath("/");
  return { succes: "Article paru — il est en ligne dans le journal." };
}

/** Retire un article déjà paru, sans le détruire (archivage, RM « archiver plutôt que supprimer »). */
export async function retirerPublication(id: string): Promise<EtatPublication> {
  const { supabase, autorise } = await garderSuperAdmin();
  if (!autorise) return { erreur: "Accès refusé." };

  const { error } = await supabase
    .from("publications")
    .update({ statut: "archivee" })
    .eq("id", id);
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath("/admin/publications");
  revalidatePath("/journal");
  revalidatePath("/");
  return { succes: "Article retiré du journal — il reste consultable ici." };
}

/** Écarte une proposition, avec son motif : la file garde la trace du refus. */
export async function refuserPublication(
  id: string,
  _etat: EtatPublication,
  formData: FormData
): Promise<EtatPublication> {
  const { supabase, autorise } = await garderSuperAdmin();
  if (!autorise) return { erreur: "Accès refusé." };

  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) {
    return { erreur: "Dites pourquoi : le motif évite qu'on repropose la même chose." };
  }

  const { error } = await supabase
    .from("publications")
    .update({ statut: "refusee", refus_motif: motif.slice(0, 500) })
    .eq("id", id);
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath("/admin/publications");
  return { succes: "Proposition écartée." };
}
