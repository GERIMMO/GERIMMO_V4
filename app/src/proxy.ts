import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { doitVerifierSecondFacteur, estSuperviseurActif } from "@/lib/mfa";
import { estAdresseSupervision } from "@/lib/garde-admin";
import { ENTETE_CHEMIN, ENTETE_METHODE } from "@/lib/entetes-traversee";
import { ACTIVITY_COOKIE, lireActivite, secretDActivite, signerActivite, strictestLimits } from "@/lib/session-policy";
import { COOKIES_SESSION } from "@/lib/supabase/cookies";
import { statutRedirection } from "@/lib/redirection";
import { ROLES_GERANTS } from "@/lib/ged";
import {
  ENTETE_ALIAS,
  RACINE_AGENCE,
  RACINE_PROPRIETAIRE,
  decisionAlias,
  estDejaReecrite,
  lireCheminDeGestion,
} from "@/lib/racine-espace";

// Accessibles sans session. /auth/confirm traite les liens reçus par email
// (réinitialisation…) : il doit rester traversable même connecté.
const PUBLIC_PATHS = [
  // Les trois pages légales sont publiques ET traversables connecté : le
  // contrat qu'on fait accepter à l'inscription doit être lisible AVANT de
  // s'inscrire, et relisible après.
  "/confidentialite",
  "/conditions",
  "/mentions-legales",
  // Le journal est public ET traversable connecté : un client qui lit un
  // article depuis un lien reçu ne doit pas être renvoyé vers ses espaces.
  "/journal",
  // Les tarifs (28/09/2026) : publics ET traversables connecté.
  "/tarifs",
  // La liste d'attente des agences (20/10/2026) : la page explique que l'offre agences arrive et prend les coordonnées
  // d'une agence. Publique ET traversable connecté, comme /tarifs. (« /agence/… », l'espace privé, ne commence pas par
  // « /agences » : il garde ses gardes.)
  "/agences",
  // Les outils gratuits (29/09) : calculs faits dans le navigateur, sans
  // compte. Publics ET traversables connecté.
  "/outils",
  "/connexion",
  "/inscription",
  // L'artisan sans compte s'inscrit ici (audit du 27/09) : la page crée
  // d'abord le compte, puis la fiche de l'entreprise une fois connecté. Elle
  // reste traversable connecté (ce n'est pas un écran de connexion). Le seul
  // chemin public du portail : les autres pages /artisan/* exigent la session.
  "/artisan/inscription",
  "/mot-de-passe-oublie",
  // Publique (et traversable connecté) : la page doit pouvoir expliquer
  // « Session expirée ou lien invalide » au lieu de rediriger sans un mot.
  "/nouveau-mot-de-passe",
  "/auth/confirm",
  // La page du bouton qui consomme le jeton d'un lien reçu par e-mail
  // (30/09) : le destinataire n'a pas encore de session.
  "/auth/confirmer",
  // Les fichiers des robots (29/09, src/app/robots.ts et sitemap.ts) : sans
  // session, ils étaient redirigés vers /connexion, et aucun moteur ne lisait
  // ni les règles ni le plan du site.
  "/robots.txt",
  "/sitemap.xml",
];
const REDIRECT_SI_CONNECTE = ["/connexion", "/inscription", "/mot-de-passe-oublie"];

// L'invitation d'un artisan par un propriétaire (décision du 15/10/2026) : le lien de l'e-mail mène à
// /artisan/invitation/<identifiant>, où l'artisan sans compte crée le sien. Sans session, la page ne lit rien en base
// et ne dit rien de l'invitation ; avec une session, elle ne montre l'invitation qu'à l'adresse confirmée qui l'a reçue.
// Seconde relecture du 15/10 : ce chemin EXACT seulement (un identifiant, rien après), pas le préfixe — une page
// ajoutée plus tard sous /artisan/invitation… ne deviendrait pas publique sans qu'on le décide.
const CHEMIN_INVITATION_ARTISAN = /^\/artisan\/invitation\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Le lien envoyé à la caution pour qu'elle confirme elle-même son mobile avant de signer un acte de cautionnement
// (décision du dirigeant du 23/10/2026) : /signature/caution/<jeton de 43 caractères>. Ce chemin EXACT seulement, sur le
// modèle de l'invitation d'un artisan : rien d'autre sous /signature n'est public sans qu'on le décide.
const CHEMIN_CONFIRMATION_CAUTION = /^\/signature\/caution\/[A-Za-z0-9_-]{43}$/;

// LES PREMIERS SEGMENTS QUI EXISTENT (recette de production du 27/09). Sans
// session, toute adresse privée mène à la connexion — y compris une adresse
// qui n'existe pas : le visiteur se connectait pour atterrir… sur une 404.
// Une adresse dont le premier segment n'est ni un dossier de src/app ni une
// entrée de public/ ne désigne rien : on sert tout de suite la page
// « introuvable », avec son vrai statut. tests/proxy-adresse-inconnue.test.ts
// tient cette liste en phase avec les deux dossiers.
const SEGMENTS_CONNUS = new Set([
  // src/app
  "actions", "admin", "agence", "agences", "api", "artisan", "assistance", "attestation-loyer",
  "auth", "compte", "conditions", "confidentialite", "connexion", "espaces",
  // Décision D27 : l'alias des écrans du propriétaire direct n'est pas un dossier de src/app ; le proxy le réécrit
  // vers /agence/<id> (fin de proxy()). Sans session, il mène à la connexion comme toute adresse privée.
  "espace",
  "inscription", "invitations", "journal", "locataire", "mentions-legales", "mot-de-passe-oublie",
  "nouveau-mot-de-passe", "outils", "polices", "quittance", "relais", "securite", "signature", "tarifs", "veille",
  // public
  "illustrations", "logo", "marketing", "pdfjs",
]);

type ClientProxy = ReturnType<typeof createServerClient>;

/**
 * Le type (« proprietaire_direct », « agence »…) de l'organisation d'une adresse de gestion, SELON LES ACCÈS DE LA
 * PERSONNE (décision D27) : d'abord par son adhésion de gestion active à CETTE organisation (admin d'agence, agent,
 * propriétaire direct) ; à défaut, et pour la supervision active seule, par la lecture de l'organisation (la RLS la
 * lui ouvre, comme à la garde de la page). Dans tous les autres cas : null — l'alias répondra « introuvable » et
 * l'ancienne adresse suivra son chemin habituel (la garde de la page renvoie vers « Mes espaces »).
 *
 * Une lecture À PART, après les gardes : la lecture des adhésions qui décide de la session, du second facteur et de
 * la porte de /admin n'est pas touchée. Une panne renvoie undefined : les deux racines répondent 503,
 * avec une invitation à réessayer. Une organisation réellement inaccessible reste distinguée (null).
 */
async function typeDeLOrganisation(
  supabase: ClientProxy,
  compteId: string,
  orgId: string,
  superviseurActif: boolean,
): Promise<string | null | undefined> {
  const { data: adhesions, error } = await supabase
    .from("memberships")
    .select("role, organisation:organizations(type)")
    .eq("account_id", compteId)
    .eq("organization_id", orgId)
    .eq("status", "active");
  if (error) return undefined;
  for (const a of (adhesions ?? []) as { role: string; organisation: { type: string } | { type: string }[] | null }[]) {
    if (!ROLES_GERANTS.includes(a.role)) continue;
    const o = Array.isArray(a.organisation) ? a.organisation[0] : a.organisation;
    if (o?.type) return o.type;
  }
  if (!superviseurActif) return null;
  const { data: organisation, error: erreurOrganisation } = await supabase.from("organizations").select("type").eq("id", orgId).maybeSingle();
  if (erreurOrganisation) return undefined;
  return (organisation as { type?: string } | null)?.type ?? null;
}

function adresseInconnue(pathname: string): boolean {
  const segment = pathname.split("/")[1] ?? "";
  // « _next », « .well-known » et les fichiers à la racine (favicon, robots…)
  // restent à Next.js.
  if (!segment || segment.startsWith("_") || segment.startsWith(".") || segment.includes(".")) return false;
  return !SEGMENTS_CONNUS.has(segment);
}

export async function proxy(request: NextRequest) {
  // L'adresse (sans paramètres) et la méthode de la requête décrivent la ligne d'audit quand un
  // super-administrateur entre dans un espace client (D08, audit du 13/10, SA-01). Posés ici, avant
  // tout retour : toujours écrasés, jamais repris d'une valeur envoyée par le navigateur. Ils ne
  // décident d'aucun droit.
  request.headers.set(ENTETE_CHEMIN, request.nextUrl.pathname);
  request.headers.set(ENTETE_METHODE, request.method);

  // Ces appels viennent de serveurs, sans cookie de connexion. Chaque route
  // vérifie son propre secret (Cron) ou la signature du corps brut (Stripe).
  // Garder la liste exacte : aucun autre chemin /api n'est rendu public.
  // Chaque route de src/app/api/cron/ y figure, planifiée directement ou par
  // /api/cron/equipes?mission= (25/09) ; tests/cron-routes-proxy.test.ts le
  // vérifie contre vercel.json et le dossier. Depuis le 14/10 (X04), il n'en reste que
  // deux : les missions n'ont plus de route directe, la route d'équipes est leur entrée
  // unique (tests/cron-entree-unique.test.ts). Depuis le 15/10 (D46-B), une troisième, qui
  // n'est pas une mission : l'alerte e-mail quotidienne du relais (secret vérifié aussi).
  if ([
    "/api/cron/equipes",
    "/api/cron/orchestrateur",
    "/api/cron/relais",
    "/api/stripe/webhook",
    "/api/zoho-sign/webhook",
    "/api/resend/contact",
    "/api/sante",
  ].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: COOKIES_SESSION,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // La racine est le site vitrine : publique pour le visiteur, raccourci vers
  // les espaces pour le connecté.
  const isPublic =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || CHEMIN_INVITATION_ARTISAN.test(pathname) || CHEMIN_CONFIRMATION_CAUTION.test(pathname);
  // Relecture du 24/10 : le formulaire de la caution (action serveur, POST) n'utilise aucune session Gerimmo. Une session
  // expirée ou illisible du même navigateur ne doit ni l'interrompre, ni promener son jeton dans `?suite=`.
  const sansSessionRequise = CHEMIN_CONFIRMATION_CAUTION.test(pathname);

  if (!user) {
    if (isPublic) return response;
    if (adresseInconnue(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/_introuvable";
      url.search = "";
      const introuvable = NextResponse.rewrite(url, { status: 404 });
      response.cookies.getAll().forEach((c) => introuvable.cookies.set(c));
      return introuvable;
    }
    // La destination demandée est MÉMORISÉE, pas jetée. Sans cela, un
    // locataire qui ouvre la quittance reçue par email après expiration de sa
    // session se reconnecte… et atterrit sur l'accueil de son espace, sans
    // jamais voir le document qu'on lui avait envoyé (constat de l'état des
    // lieux du 11/09). Elle n'est relue qu'à travers destinationSure().
    const url = request.nextUrl.clone();
    const demandee = pathname + request.nextUrl.search;
    url.pathname = "/connexion";
    url.search = demandee && demandee !== "/" ? `?suite=${encodeURIComponent(demandee)}` : "";
    return NextResponse.redirect(url, statutRedirection(request.method));
  }

  // Sessions par rôle (RM-A4.5) : la limite la plus stricte des adhésions actives.
  const { data: memberships, error: erreurDroitsSession } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("status", "active");
  const limits = strictestLimits((memberships ?? []).map((m) => m.role));

  const now = Date.now();
  const { data: sessions, error: erreurSession } = await supabase.rpc("ma_session_active");
  if (erreurSession || erreurDroitsSession) {
    if (isPublic && (["GET", "HEAD"].includes(request.method) || sansSessionRequise)) return response;
    const indisponible = new NextResponse("La vérification de votre session est momentanément indisponible. Réessayez dans un instant.", {
      status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30" },
    });
    response.cookies.getAll().forEach((c) => indisponible.cookies.set(c));
    return indisponible;
  }
  const session = sessions?.[0];
  const signedInAt = session?.cree_le ? Date.parse(session.cree_le) : NaN;
  const sessionValide = typeof session?.id === "string" && Number.isFinite(signedInAt) && signedInAt <= now + 30_000;
  const identiteSession = `${user.id}:${session?.id ?? "absente"}`;
  const secretActivite = secretDActivite();
  const parsed = await lireActivite(request.cookies.get(ACTIVITY_COOKIE)?.value, identiteSession, secretActivite);
  const lastActivity = Math.max(Math.min(parsed ?? 0, now), signedInAt);

  const absoluteExpired = now - signedInAt > limits.absolute;
  const inactivityExpired = now - lastActivity > limits.inactivity;

  if (!sessionValide || absoluteExpired || inactivityExpired) {
    const { error: erreurDeconnexion } = await supabase.auth.signOut({ scope: "local" });
    // Une ancienne session ne doit pas interdire la consultation du site vitrine.
    // Les mutations et les pages privées gardent la redirection de sécurité.
    if (!erreurDeconnexion && isPublic && (["GET", "HEAD"].includes(request.method) || sansSessionRequise)) {
      response.cookies.delete(ACTIVITY_COOKIE);
      return response;
    }
    // La destination est mémorisée ici aussi (24/09), comme pour le visiteur
    // non connecté : une session qui expire pendant qu'on rédige une demande
    // sur /assistance ramenait, après reconnexion, sur « Mes espaces » et non
    // sur l'aide. La racine et les écrans de connexion ne sont pas une
    // destination : on s'y ferait renvoyer vers /espaces de toute façon.
    const url = request.nextUrl.clone();
    const demandee = pathname + request.nextUrl.search;
    const aRetenir = pathname !== "/" && !REDIRECT_SI_CONNECTE.some((p) => pathname.startsWith(p)) && !sansSessionRequise;
    url.pathname = "/connexion";
    url.search = aRetenir
      ? `?raison=session-expiree&suite=${encodeURIComponent(demandee)}`
      : "?raison=session-expiree";
    // 303 pour un POST (audit du 30/09, M6) : un 307 rejouerait l'action
    // serveur sur /connexion.
    const redirect = NextResponse.redirect(url, statutRedirection(request.method));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.cookies.delete(ACTIVITY_COOKIE);
    return redirect;
  }

  response.cookies.set(ACTIVITY_COOKIE, await signerActivite(now, identiteSession, secretActivite), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request.nextUrl.protocol === "https:",
  });

  // LE SECOND FACTEUR. Le rôle de supervision l'exige toujours, y compris lorsqu'il ouvre un espace agence. Depuis
  // l'audit final du 27/10 (PUB-01), tout compte qui a activé sa double authentification depuis « Mon compte » passe
  // aussi par le sas : un facteur vérifié existe ⇔ nextLevel === "aal2" — avant, seul super_admin était regardé, et
  // le mot de passe seul ouvrait l'espace malgré la protection posée. La lecture est locale (jeton décodé, facteurs de
  // la session en cookie) : aucun aller-retour de plus. La page du sas reste accessible avant AAL2. Une erreur de
  // lecture ferme la supervision (jamais ouverte par défaut) et laisse passer les autres rôles, comme avant.
  const roles = (memberships ?? []).map(m => m.role);
  let niveauMfa: string | null | undefined;
  if (!isPublic && pathname !== "/securite") {
    const { data: niveau, error: erreurMfa } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    niveauMfa = niveau?.currentLevel;
    if ((erreurMfa && roles.includes("super_admin")) || doitVerifierSecondFacteur(roles, niveau?.currentLevel, niveau?.nextLevel)) {
      const url = request.nextUrl.clone();
      url.pathname = "/securite";
      url.search = `?suite=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      // 303 pour un POST (action serveur) : un 307 rejouerait l'action sur /securite.
      const redirect = NextResponse.redirect(url, statutRedirection(request.method));
      response.cookies.getAll().forEach(c => redirect.cookies.set(c));
      return redirect;
    }
  }

  // LA PORTE DE /admin EST ICI, AVANT TOUT RENDU (audit du 13/10, PRF-04, décision D44). Elle ne
  // vivait que dans admin/layout.tsx : or un layout ne contrôle pas le rendu de la page, qui s'exécute
  // en même temps et dont la charge utile part avant la redirection (documentation de Next.js,
  // guide « Authentication », « Layouts and auth checks »). Le proxy lit déjà les adhésions actives
  // et le niveau du second facteur : « superviseur actif » ici est, terme pour terme,
  // public.is_super_admin() (adhésion super_admin active + AAL2, tests/proxy-garde-admin-base.test.ts).
  // Un super-administrateur sans second facteur n'arrive pas jusqu'ici (renvoyé vers /securite plus
  // haut). Le layout garde sa propre vérification et la RLS reste le filet de fond : ce sont trois
  // portes, pas une. Le chemin est comparé décodé (« /%61dmin » est « /admin »). L'exclusion des
  // images dans `config.matcher` ne laisse passer que des adresses finissant par une extension
  // d'image, que n'accepte aucun segment dynamique de /admin (tous attendent un identifiant ou une
  // clé connue) : la page n'y trouverait rien à lire, et le layout garde la même porte.
  if (estAdresseSupervision(pathname) && !estSuperviseurActif(roles, niveauMfa)) {
    // Une adresse neuve, pas un clone : « /admin/ » (barre finale) donnerait « /espaces/ ».
    const url = new URL("/espaces", request.nextUrl.origin);
    // 303 pour un POST (action serveur) : un 307 rejouerait l'action sur /espaces.
    const redirect = NextResponse.redirect(url, statutRedirection(request.method));
    response.cookies.getAll().forEach(c => redirect.cookies.set(c));
    return redirect;
  }

  // UNE QUITTANCE INTROUVABLE RÉPOND 404 (audit du 27/09). La page se rend en
  // flux sous le « Chargement… » racine : un notFound() posé pendant le rendu
  // arrive après l'en-tête, donc en 200. Or c'est le lien que le locataire
  // garde dans ses e-mails. On vérifie ici, avant tout flux, sous sa propre
  // session (mêmes contrôles d'accès que la page), et l'on sert la page
  // « introuvable » avec son vrai statut.
  const quittance = /^\/quittance\/([^/]+)\/?$/.exec(pathname);
  if (quittance) {
    // Un identifiant qui n'est pas un UUID ne désigne aucun document ; une
    // panne de lecture, elle, ne se déguise pas en « introuvable » : la page
    // tranchera.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quittance[1]);
    const { data: document, error } = uuid
      ? await supabase.rpc("quittance_document", { p_quittance: quittance[1] })
      : { data: null, error: null };
    if (!error && !document) {
      const url = request.nextUrl.clone();
      url.pathname = "/_introuvable";
      url.search = "";
      const introuvable = NextResponse.rewrite(url, { status: 404 });
      response.cookies.getAll().forEach((c) => introuvable.cookies.set(c));
      return introuvable;
    }
  }

  // Un utilisateur connecté n'a rien à faire sur /connexion ni sur la vitrine
  if (pathname === "/" || REDIRECT_SI_CONNECTE.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/espaces";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // LES ÉCRANS DU PROPRIÉTAIRE DIRECT VIVENT SOUS /espace/<id>/… (décision D27, fiche DES-A-08 ; lib/racine-espace.ts).
  // Cette étape vient APRÈS toutes les gardes ci-dessus (session, expiration, second facteur, porte de /admin) : elle
  // n'en remplace ni n'en saute aucune, elle ne fait que choisir l'adresse. La page garde sa propre garde
  // (verifierAccesEspace) et la base sa RLS.
  const gestion = lireCheminDeGestion(pathname);
  if (gestion) {
    const type = await typeDeLOrganisation(supabase, user.id, gestion.orgId, estSuperviseurActif(roles, niveauMfa));
    if (type === undefined) {
      const indisponible = new NextResponse("L’espace est momentanément indisponible. Réessayez dans quelques instants ; vos données restent conservées.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "15", "Cache-Control": "private, no-store" },
      });
      response.cookies.getAll().forEach((c) => indisponible.cookies.set(c));
      return indisponible;
    }
    // Next.js rappelle le proxy sur l'adresse réécrite (voir ENTETE_ALIAS) : la seconde passe ne la redirige pas.
    const decision = decisionAlias(gestion, type, request.method, estDejaReecrite(gestion, request.headers.get(ENTETE_ALIAS)));
    if (decision === "rediriger") {
      // Redirection PERMANENTE, chemin et requête conservés : les liens déjà envoyés ou mis en favori sur /agence
      // continuent de fonctionner. La réponse dépend de la personne connectée et l'alias peut être retiré un jour :
      // aucun cache partagé ne la garde, et le navigateur la revalide à chaque visite.
      const url = request.nextUrl.clone();
      url.pathname = `${RACINE_PROPRIETAIRE}/${gestion.orgId}${gestion.suite}`;
      const redirect = NextResponse.redirect(url, 308);
      redirect.headers.set("Cache-Control", "private, no-cache");
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
    if (decision === "reecrire") {
      const url = request.nextUrl.clone();
      url.pathname = `${RACINE_AGENCE}/${gestion.orgId}${gestion.suite}`;
      const entetes = new Headers(request.headers);
      entetes.set(ENTETE_ALIAS, gestion.orgId);
      const reecrit = NextResponse.rewrite(url, { request: { headers: entetes } });
      response.cookies.getAll().forEach((c) => reecrit.cookies.set(c));
      return reecrit;
    }
    if (decision === "introuvable") {
      const url = request.nextUrl.clone();
      url.pathname = "/_introuvable";
      url.search = "";
      const introuvable = NextResponse.rewrite(url, { status: 404 });
      response.cookies.getAll().forEach((c) => introuvable.cookies.set(c));
      return introuvable;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Tout sauf les ressources statiques
    "/((?!_next/static|_next/image|pdfjs/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
