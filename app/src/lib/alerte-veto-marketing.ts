// L'ALERTE DE VETO (06/10/2026) : le superviseur voit le post la veille.
//
// Un e-mail avec l'aperçu (titre, texte Facebook, visuel, source) et un lien
// vers l'écran marketing, où vivent les quatre gestes : publier maintenant,
// modifier, reporter, refuser. Les gestes ne passent jamais par un lien
// d'e-mail : ils exigent la session du superviseur (MFA).
// La décision du point du matin est posée par ailleurs (point-du-matin.ts),
// à chaque réassemblage.

import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerEmail } from "./email";
import { adresseDuSite } from "./site";
import { formaterDateHeureLongueParis } from "./heure-paris";

export type ApercuPost = {
  id: string;
  titre: string;
  chapo: string | null;
  facebook_texte: string | null;
  facebook_image_url: string | null;
  programmee_pour: string;
  veille: boolean;
  rattrapage: boolean;
  validation_obligatoire: boolean;
};

function echapper(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function htmlAlerteVeto(post: ApercuPost, lienEcran: string): string {
  const quand = formaterDateHeureLongueParis(post.programmee_pour);
  const consigne = post.validation_obligatoire
    ? "La validation est obligatoire : ce post ne partira pas sans votre accord."
    : `Sans geste de votre part, il part automatiquement le ${quand}.`;
  return `
<div style="font-family:Figtree,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f2352">
  <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:0 0 8px">${post.rattrapage ? "Post préparé en rattrapage" : post.veille ? "Post de veille préparé" : "Post préparé"}</p>
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 12px">${echapper(post.titre)}</h1>
  <p style="margin:0 0 16px;color:#53617a">Parution prévue le <strong>${echapper(quand)}</strong>. ${echapper(consigne)}</p>
  ${post.facebook_image_url ? `<img src="${echapper(post.facebook_image_url)}" alt="${echapper(post.titre)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;margin:0 0 16px">` : ""}
  <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#53617a;margin:0 0 6px">Texte Facebook</p>
  <p style="white-space:pre-wrap;margin:0 0 16px;line-height:1.5">${echapper(post.facebook_texte?.trim() || `${post.titre}\n\n${post.chapo ?? ""}`)}</p>
  <p style="margin:0 0 20px">
    <a href="${echapper(lienEcran)}" style="display:inline-block;background:#2457f5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Publier maintenant, modifier, reporter ou refuser</a>
  </p>
  <p style="font-size:13px;color:#53617a;margin:0">Les gestes se font dans la console, avec votre session. Rien ne part depuis cet e-mail.</p>
</div>`;
}

/** Envoie l'alerte au superviseur permanent ; ne lève jamais (la mission continue). */
export async function alerterSuperviseurDuPost(db: SupabaseClient, post: ApercuPost): Promise<{ envoye: boolean; motif?: string }> {
  try {
    const { data: email, error } = await db.rpc("email_superviseur_permanent");
    if (error || typeof email !== "string" || !email) return { envoye: false, motif: "Adresse du superviseur introuvable." };
    const site = adresseDuSite() ?? "https://www.gerimmo.app";
    const lien = `${site}/admin/marketing#veto`;
    const res = await envoyerEmail({
      to: email,
      subject: `À relire avant parution : ${post.titre.slice(0, 90)}`,
      html: htmlAlerteVeto(post, lien),
      cleIdempotence: `veto-${post.id}-${post.programmee_pour.slice(0, 16)}`,
    });
    return res.erreur ? { envoye: false, motif: res.erreur } : { envoye: true };
  } catch (e) {
    return { envoye: false, motif: e instanceof Error ? e.message : "Envoi impossible." };
  }
}
