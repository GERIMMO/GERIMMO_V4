import type { NextConfig } from "next";

// ── En-têtes de sécurité HTTP (audit production 25/09, S1) ─────────────────
//
// Jusqu'ici la configuration n'en posait aucun : les écrans de gérance
// (paiement, pièces d'identité, documents) étaient encadrables par n'importe
// quel site (clickjacking), et rien ne bornait d'où le navigateur accepte du
// code. Vercel ajoute HSTS sur les domaines personnalisés, rien d'autre.
//
// La CSP est ENFORCÉE, sans nonce : Next.js 16 émet des scripts et styles en
// ligne, et un nonce imposerait le rendu dynamique de toutes les pages (guide
// « Content Security Policy », § Without Nonces). 'unsafe-inline' sur les
// scripts reste donc admis ; la valeur de la politique tient aux autres
// directives : aucun script tiers, aucun cadre parent, aucun <object>, aucune
// soumission de formulaire hors du site et de Stripe, connexions limitées à
// Supabase et à l'outillage Vercel. 'unsafe-eval' n'est ajouté qu'en
// développement (React reconstruit les piles d'erreur avec eval).
//
// Le domaine Supabase se lit dans NEXT_PUBLIC_SUPABASE_URL au moment du build
// (cadres PDF signés, appels du client navigateur, websockets Realtime). À
// défaut, toute origine *.supabase.co : mieux vaut une politique large qu'un
// écran qui ne charge plus.

const developpement = process.env.NODE_ENV === "development";

/** L'origine Supabase (https) et son pendant websocket (wss), ou le joker de la plateforme. */
function originesSupabase(): { http: string; ws: string } {
  const brut = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  try {
    if (!brut) throw new Error("absente");
    const u = new URL(brut);
    return { http: u.origin, ws: `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}` };
  } catch {
    return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
  }
}

const OUTILLAGE_VERCEL = ["https://vercel.live", "https://va.vercel-scripts.com"];
const STRIPE_FORMULAIRES = ["https://checkout.stripe.com", "https://billing.stripe.com"];

export function politiqueDeSecurite(): string {
  const supabase = originesSupabase();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(developpement ? ["'unsafe-eval'"] : []), ...OUTILLAGE_VERCEL],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    // next/font héberge les polices sur le site ; Google reste admis pour une
    // feuille de style qui en chargerait directement.
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    // Visuels marketing (bucket public Supabase), images du journal, aperçus
    // d'images déposées (blob:) : les images ne portent pas de code.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "data:"],
    "connect-src": ["'self'", supabase.http, supabase.ws, ...OUTILLAGE_VERCEL, ...(developpement ? ["ws:", "wss:"] : [])],
    // Aperçus PDF (URL signées Supabase, blob: des documents générés) et
    // barre d'outils Vercel en prévisualisation.
    "frame-src": ["'self'", "blob:", supabase.http, "https://vercel.live"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Les actions serveur postent sur le site ; sans JavaScript, la
    // redirection vers Stripe (paiement, portail) suit la soumission du
    // formulaire et relève de form-action.
    "form-action": ["'self'", ...STRIPE_FORMULAIRES],
    "frame-ancestors": ["'none'"],
  };
  const texte = Object.entries(directives)
    .map(([nom, valeurs]) => `${nom} ${valeurs.join(" ")}`)
    .join("; ");
  // « upgrade-insecure-requests » seulement là où le site est servi en HTTPS
  // (Vercel) : la CI et le banc local servent la construction de production en
  // http, et Chromium y répondait par ERR_SSL_PROTOCOL_ERROR sur les
  // ressources (audit-ecrans, 25/09).
  return developpement || process.env.VERCEL !== "1" ? texte : `${texte}; upgrade-insecure-requests`;
}

export const ENTETES_SECURITE: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: politiqueDeSecurite() },
  // Doublon volontaire de frame-ancestors pour les navigateurs anciens.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Aucun écran n'utilise ces capteurs : la photo d'incident passe par un
  // champ fichier, qui n'en relève pas.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Deux ans, sous-domaines compris. Inoffensif en local (ignoré sans https).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: ENTETES_SECURITE }];
  },
  // Audit 09/09 (P1) : sur Vercel, le bundler embarquait @sparticuz/chromium
  // et son dossier bin/ (le navigateur compressé) était perdu au déploiement —
  // toute génération PDF échouait. On externalise le moteur et on force le
  // traçage de ses binaires pour chaque route.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  experimental: {
    // Perf 30/08 : cache client des pages dynamiques pendant 30 s — un retour
    // sur un onglet déjà visité ne repasse pas par le serveur ; les actions
    // (revalidatePath) invalident tout de suite ce qui a changé.
    staleTimes: { dynamic: 30, static: 180 },
    serverActions: {
      // 10 Mo par fichier (limite du bucket), et une déclaration d'incident
      // porte jusqu'à 5 photos (recette 24/08 : deux photos de téléphone
      // crevaient l'ancienne limite de 11 Mo → « erreur » sèche avant même
      // notre code) + enrobage multipart.
      //
      // Audit 25/09 (S11) : la limite est globale par construction — Next.js
      // 16 ne l'accepte pas par action (docs serverActions.md). Elle reste
      // donc à 55 Mo pour toutes les actions ; la ramener demanderait de
      // sortir les dépôts de fichiers vers une route dédiée.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
