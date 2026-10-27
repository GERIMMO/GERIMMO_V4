import type { NextConfig } from "next";
import { verifierEnvironnement } from "./scripts/deploiement/garde-environnement.mjs";

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

// 29/09 : va.vercel-scripts.com (Vercel Analytics) retiré — aucun module de
// mesure d'audience n'est installé, et la page confidentialité affirme
// qu'aucun traceur ne l'est. Seule la barre d'outils des prévisualisations
// reste admise.
const OUTILLAGE_VERCEL = ["https://vercel.live"];
// Autocomplétion d'adresse de la fiche d'un bien (parc/formulaire-bien.tsx) :
// le navigateur interroge la Base Adresse Nationale. Absente de connect-src,
// elle était bloquée sans un mot (audit du 27/09). Déclarée dans PRESTATAIRES
// (lib/editeur.ts).
const BASE_ADRESSE_NATIONALE = "https://api-adresse.data.gouv.fr";
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
    "connect-src": ["'self'", supabase.http, supabase.ws, BASE_ADRESSE_NATIONALE, ...OUTILLAGE_VERCEL, ...(developpement ? ["ws:", "wss:"] : [])],
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
  // Audit du 27/09 : une fenêtre ouverte par un autre site ne garde pas de
  // poignée sur la nôtre (window.opener). Les paiements Stripe se font par
  // redirection, pas par fenêtre surgissante : rien ne dépend de l'opener.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// ── Cache du logo et des illustrations (audit du 13/10, PRF-05 ; décision D45 A) ──
//
// Next.js sert le dossier `public/` avec « Cache-Control: public, max-age=0 » : le navigateur revalidait le logo
// (292 Ko) et l'illustration de fond (298 Ko) à chaque page. Ces fichiers n'ont PAS de nom versionné (aucune
// empreinte dans le nom) : une durée longue les figerait chez les visiteurs le jour où l'on remplacerait l'image
// sous le même nom. On pose donc une durée COURTE avec revalidation : une heure de fraîcheur, puis le navigateur
// montre l'image qu'il a déjà et vérifie en arrière-plan (réponse « 304 », sans retélécharger) si elle a changé.
// Une durée longue (« immutable ») ne se justifie qu'avec un nom versionné, par exemple « gerimmo-officiel-v2.png » :
// il faudrait alors renommer le fichier et ses appels ; ce n'est pas fait ici (les fichiers ne changent pas).
export const CACHE_IMAGES_DE_MARQUE = "public, max-age=3600, stale-while-revalidate=86400";

/** L'hôte Supabase des visuels du journal (bucket public `marketing-visuels`), pour next/image. */
function hoteSupabase(): string | null {
  try {
    const brut = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    return brut ? new URL(brut).hostname : null;
  } catch {
    return null;
  }
}

// ── Environnement de la plateforme, transmis au navigateur (X03, relecture du 14/10/2026) ──
//
// Le drapeau `Secure` du cookie de session se dérive de l'adresse du site ET de l'environnement de production
// (src/lib/supabase/cookies.ts). Le serveur et le proxy lisent `VERCEL_ENV` à l'exécution ; le code du NAVIGATEUR, lui, ne
// reçoit que les variables `NEXT_PUBLIC_*`, incorporées à la construction. `NEXT_PUBLIC_VERCEL_ENV` n'existe que si le projet
// coche « exposer les variables système » : un réglage du tableau de bord que rien ne vérifie, et qui, absent, laissait le
// client navigateur réécrire le cookie sans `Secure`. `VERCEL_ENV`, elle, est toujours présente pendant la construction sur
// Vercel : on la déclare ici pour que le navigateur la reçoive sans aucun réglage. Hors Vercel (banc, CI) : chaîne vide, le
// cookie reste lisible en http comme avant.
export function environnementPourLeNavigateur(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_ENV || env.NEXT_PUBLIC_VERCEL_ENV || "";
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_VERCEL_ENV: environnementPourLeNavigateur(),
    // Uniquement l'origine publique contrôlée, jamais les secrets de Vercel.
    // Production et banc local conservent leurs variables existantes.
    ...(process.env.GERIMMO_PREPRODUCTION_VALIDEE === "1"
      ? { NEXT_PUBLIC_SITE_URL: verifierEnvironnement() }
      : {}),
  },
  // 06/10 : les illustrations des articles viennent du Storage Supabase ; sans
  // domaine déclaré, next/image refuse de les servir. À défaut d'adresse au
  // moment du build, toute origine *.supabase.co.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: hoteSupabase() ?? "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    // Ces routes retournent une visionneuse autonome avec une CSP à nonce.
    // La CSP générale écrasait celle de la réponse après la réécriture /espace,
    // et « frame-ancestors none » bloquait l'aperçu dans notre propre dossier.
    // Aucun écran interactif n'est exclu : seulement les routes fichier nommées.
    const fichiers = "(?:agence|espace|locataire)/[^/]+/documents/[^/]+/fichier/?$|locataire/[^/]+/bail/fichier/?$|artisan/attestations/[^/]+/fichier/?$|admin/artisans/pieces/[^/]+/fichier/?$|api/artisan-prive/pieces/[^/]+/?$|api/devis/[^/]+/(?:pdf|signature)/?$";
    const encadrement = new Set(["Content-Security-Policy", "X-Frame-Options"]);
    return [
      { source: "/(.*)", headers: ENTETES_SECURITE.filter(e => !encadrement.has(e.key)) },
      { source: `/((?!${fichiers}).*)`, headers: ENTETES_SECURITE.filter(e => encadrement.has(e.key)) },
      // Audit du 30/09 (M5) : l'adresse des pages /auth/confirm et
      // /auth/confirmer porte le jeton d'un lien reçu par e-mail. Ni le
      // navigateur ni un relais ne doivent en garder copie.
      { source: "/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Décision du 23/10/2026 : le lien de la caution porte son jeton à usage unique, comme ceux de /auth.
      { source: "/signature/caution/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Audit du 13/10 (PRF-05, D45 A) : durée courte avec revalidation, voir CACHE_IMAGES_DE_MARQUE.
      { source: "/logo/:path*", headers: [{ key: "Cache-Control", value: CACHE_IMAGES_DE_MARQUE }] },
      { source: "/illustrations/:path*", headers: [{ key: "Cache-Control", value: CACHE_IMAGES_DE_MARQUE }] },
      // Le décodeur PDF s'exécute dans un worker local versionné. L'autorisation
      // WebAssembly lui est réservée ; les pages conservent leur CSP habituelle.
      { source: "/pdfjs/:version/pdf.worker.min.mjs", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" }] },
      { source: "/pdfjs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
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
      // Les nouveaux dépôts sont limités à 4 Mio, avec contrôle avant envoi.
      // La marge couvre les champs et l'enrobage multipart sous le plafond
      // de transport de l'hébergeur. Les archives ne passent plus ici.
      bodySizeLimit: 4_500_000,
    },
  },
};

export default nextConfig;
