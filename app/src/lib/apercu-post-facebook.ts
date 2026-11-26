import { texteFacebook } from "@/lib/facebook";

/**
 * L'aperçu d'un post Facebook programmé (lot D1, puis reprise du lot L4 du 26/11/2026) : la fenêtre de veto de
 * « Marketing et contenus » (admin/marketing/page.tsx) et le courriel de veto envoyé la veille
 * (lib/alerte-veto-marketing.ts) montrent le message que la mission enverra, pas le texte préparé seul.
 *
 * Module serveur (il lit l'adresse du site) : un composant client reçoit le message déjà calculé.
 */

/** Les champs de `publications` que la mission de diffusion transmet (diffuserPostsEchus, lib/missions-planifiees/marketing.ts). */
export type PostDiffuse = {
  id: string;
  titre: string;
  chapo: string | null;
  slug: string | null;
  facebook_texte: string | null;
  facebook_image_url: string | null;
  /** `publications.origine` : « ia » termine le post par la mention (lib/facebook.ts). */
  origine?: "ia" | "manuel" | null;
};

/**
 * Le message que la mission enverra à Facebook : même fonction (texteFacebook), mêmes champs que diffuserPostsEchus.
 * Sans adresse d'article (ou adresse refusée par texteFacebook), aucun message ne peut être montré : null.
 */
export function messageFacebookDiffuse(p: PostDiffuse): string | null {
  if (!p.slug) return null;
  try {
    return texteFacebook({ id: p.id, titre: p.titre, chapo: p.chapo, slug: p.slug, facebookTexte: p.facebook_texte, facebookImageUrl: p.facebook_image_url, origine: p.origine === "ia" ? "ia" : "manuel" });
  } catch {
    return null;
  }
}

/** Le repli quand aucun message ne peut être montré : le texte préparé seul, celui de la console (admin/marketing/veto-post.tsx). */
export function textePrepareFacebook(p: Pick<PostDiffuse, "titre" | "chapo" | "facebook_texte">): string {
  return p.facebook_texte?.trim() || `${p.titre}\n\n${p.chapo ?? ""}`;
}
