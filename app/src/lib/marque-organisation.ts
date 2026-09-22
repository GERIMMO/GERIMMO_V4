import type { CSSProperties } from "react";

export type MarqueOrganisation = {
  name?: string | null;
  nom_portail?: string | null;
  logo_url?: string | null;
  couleur_primaire?: string | null;
  couleur_secondaire?: string | null;
  domaine_personnalise?: string | null;
  domaine_personnalise_verifie_le?: string | null;
  email_expediteur?: string | null;
  email_expediteur_verifie_le?: string | null;
  email_contact?: string | null;
};

export const LOGO_MAX_OCTETS = 200 * 1024;
export function couleurValide(v: string | null | undefined): v is string { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
function rgb(c: string) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
function melanger(c: string, avec: string, poids: number) { return "#" + rgb(c).map((v, i) => Math.round(v * (1 - poids) + rgb(avec)[i] * poids).toString(16).padStart(2, "0")).join(""); }
function luminance(c: string) { return rgb(c).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
export function contraste(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function couleurLisible(c: string) { let v = c; for (let n = 0; contraste(v, "#ffffff") < 5 && n < 30; n++) v = melanger(v, "#000000", .08); return v; }

/** Every legacy alias is set on the same element: inherited CSS aliases are otherwise resolved at :root. */
export function styleMarque(m: MarqueOrganisation | null | undefined): CSSProperties {
  if (!m?.couleur_primaire && !m?.couleur_secondaire) return {};
  const principale = couleurLisible(couleurValide(m.couleur_primaire) ? m.couleur_primaire : "#2457f5");
  const sombre = melanger(principale, "#000000", .18), clair = melanger(principale, "#ffffff", .90);
  const encre = couleurLisible(couleurValide(m.couleur_secondaire) ? m.couleur_secondaire : "#0f2352");
  return {
    "--marque": principale, "--marque-sombre": sombre, "--marque-clair": clair,
    "--sur-marque": "#ffffff", "--primary": principale, "--primary-foreground": "#ffffff",
    "--or": principale, "--or-clair": clair, "--or-texte": sombre, "--or-sombre": sombre,
    "--or-filet": melanger(principale, "#ffffff", .8), "--sur-or": "#ffffff",
    "--bleu": sombre, "--ardoise": clair, "--survol": clair,
    "--encre": encre, "--encre-profond": melanger(encre, "#000000", .2),
    "--graphite": melanger(encre, "#000000", .12), "--sur-encre": "#ffffff",
    "--ring": principale, "--sidebar-primary": principale, "--sidebar-primary-foreground": "#ffffff",
  } as CSSProperties;
}
export function nomMarque(m: MarqueOrganisation) { return (m.nom_portail?.trim() || m.name?.trim() || "Gerimmo").slice(0, 100); }
export function emailValide(v: string) { return v.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(v); }
export function domaineValide(v: string) { return v.length <= 253 && !/^(?:\d+\.)+\d+$/.test(v) && !/(?:^|\.)(localhost|local|internal|test)$/i.test(v) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v); }
export function logoInlineValide(v: string | null | undefined): boolean { return typeof v === "string" && v.length <= 280000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v); }
export function logoAffichable(v: string | null | undefined) {
  if (logoInlineValide(v)) return v;
  if (!v || v.length > 2048) return null;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.port && domaineValide(u.hostname) ? u.href : null; } catch { return null; }
}
export function typeImageLogo(octets: Uint8Array): string | null {
  if (octets.length >= 24 && [137,80,78,71,13,10,26,10].every((v,i) => octets[i] === v)) return "image/png";
  if (octets.length >= 4 && octets[0] === 255 && octets[1] === 216 && octets[2] === 255) return "image/jpeg";
  if (octets.length >= 16 && String.fromCharCode(...octets.slice(0,4)) === "RIFF" && String.fromCharCode(...octets.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
export function echapperMarque(v: string) { return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
export function enteteMarqueHtml(m: MarqueOrganisation) {
  const couleur = couleurLisible(couleurValide(m.couleur_primaire) ? m.couleur_primaire : "#2457f5");
  const logo = logoInlineValide(m.logo_url) ? `<img src="${m.logo_url}" alt="" style="max-width:160px;max-height:48px;object-fit:contain;vertical-align:middle;margin-right:12px"/>` : "";
  return `<div style="border-bottom:3px solid ${couleur};padding:0 0 12px;margin-bottom:18px;break-inside:avoid"><span>${logo}</span><strong style="color:${couleur};font-family:Arial,sans-serif;font-size:16px">${echapperMarque(nomMarque(m))}</strong></div>`;
}

/** Change only the application's own links, after domain connection has been verified. */
export function liensMarque(html: string, m: MarqueOrganisation, origine: string | null): string {
  if (!m.domaine_personnalise_verifie_le || !m.domaine_personnalise || !domaineValide(m.domaine_personnalise) || !origine) return html;
  let source: string;
  try { source = new URL(origine).origin; } catch { return html; }
  return html.replace(/href="([^"<>]+)"/g, (attribut, lien: string) => {
    try {
      const u = new URL(lien.replaceAll("&amp;", "&"));
      if (u.origin !== source) return attribut;
      return `href="${echapperMarque(`https://${m.domaine_personnalise}${u.pathname}${u.search}${u.hash}`)}"`;
    } catch { return attribut; }
  });
}
