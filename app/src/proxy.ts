import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { doitVerifierSecondFacteur } from "@/lib/mfa";
import { ACTIVITY_COOKIE, lireActivite, secretDActivite, signerActivite, strictestLimits } from "@/lib/session-policy";

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
  "/connexion",
  "/inscription",
  // L'artisan sans compte s'inscrit ici (audit du 27/09) : la page crée
  // d'abord le compte, puis la fiche de l'entreprise une fois connecté. Elle
  // reste traversable connecté (ce n'est pas un écran de connexion). Le seul
  // chemin public du portail : les autres pages /artisan/* exigent la session.
  "/artisan/inscription",
  "/proprietaire-invite/accepter",
  "/mot-de-passe-oublie",
  // Publique (et traversable connecté) : la page doit pouvoir expliquer
  // « Session expirée ou lien invalide » au lieu de rediriger sans un mot.
  "/nouveau-mot-de-passe",
  "/auth/confirm",
];
const REDIRECT_SI_CONNECTE = ["/connexion", "/inscription", "/mot-de-passe-oublie"];

// LES PREMIERS SEGMENTS QUI EXISTENT (recette de production du 27/09). Sans
// session, toute adresse privée mène à la connexion — y compris une adresse
// qui n'existe pas : le visiteur se connectait pour atterrir… sur une 404.
// Une adresse dont le premier segment n'est ni un dossier de src/app ni une
// entrée de public/ ne désigne rien : on sert tout de suite la page
// « introuvable », avec son vrai statut. tests/proxy-adresse-inconnue.test.ts
// tient cette liste en phase avec les deux dossiers.
const SEGMENTS_CONNUS = new Set([
  // src/app
  "actions", "admin", "agence", "api", "artisan", "assistance", "attestation-loyer",
  "auth", "compte", "conditions", "confidentialite", "connexion", "espaces",
  "inscription", "journal", "locataire", "mentions-legales", "mot-de-passe-oublie",
  "nouveau-mot-de-passe", "proprietaire-invite", "polices", "quittance", "relais", "securite", "veille",
  // public
  "illustrations", "logo", "marketing",
]);

function adresseInconnue(pathname: string): boolean {
  const segment = pathname.split("/")[1] ?? "";
  // « _next », « .well-known » et les fichiers à la racine (favicon, robots…)
  // restent à Next.js.
  if (!segment || segment.startsWith("_") || segment.startsWith(".") || segment.includes(".")) return false;
  return !SEGMENTS_CONNUS.has(segment);
}

export async function proxy(request: NextRequest) {
  // Ces appels viennent de serveurs, sans cookie de connexion. Chaque route
  // vérifie son propre secret (Cron) ou la signature du corps brut (Stripe).
  // Garder la liste exacte : aucun autre chemin /api n'est rendu public.
  // Chaque route de src/app/api/cron/ y figure, planifiée directement ou par
  // /api/cron/equipes?mission= (25/09) ; tests/cron-routes-proxy.test.ts le
  // vérifie contre vercel.json et le dossier.
  if ([
    "/api/cron/equipes",
    "/api/cron/orchestrateur",
    "/api/cron/veille",
    "/api/cron/quittances",
    "/api/cron/appels",
    "/api/cron/rappels",
    "/api/cron/abonnements",
    "/api/cron/territoire",
    "/api/cron/relances",
    "/api/cron/marketing",
    "/api/cron/signatures",
    "/api/cron/purge",
    "/api/stripe/webhook",
    "/api/youtrust/webhook",
    "/api/sante",
  ].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

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
    return NextResponse.redirect(url);
  }

  // Sessions par rôle (RM-A4.5) : la limite la plus stricte des adhésions actives.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("status", "active");
  const limits = strictestLimits((memberships ?? []).map((m) => m.role));

  const now = Date.now();
  const signedInAt = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).getTime()
    : now;
  // Dernière activité = le plus récent entre le cookie et la connexion :
  // une reconnexion vaut activité (sinon un vieux cookie déconnecterait en
  // boucle), et un cookie absent, corrompu ou MAL SIGNÉ (27/09 : il est signé
  // et lié au compte) retombe sur l'heure de connexion.
  const secretActivite = secretDActivite();
  const parsed = await lireActivite(request.cookies.get(ACTIVITY_COOKIE)?.value, user.id, secretActivite);
  const lastActivity = Math.max(parsed ?? 0, signedInAt);

  const absoluteExpired = now - signedInAt > limits.absolute;
  const inactivityExpired = now - lastActivity > limits.inactivity;

  if (absoluteExpired || inactivityExpired) {
    await supabase.auth.signOut();
    // La destination est mémorisée ici aussi (24/09), comme pour le visiteur
    // non connecté : une session qui expire pendant qu'on rédige une demande
    // sur /assistance ramenait, après reconnexion, sur « Mes espaces » et non
    // sur l'aide. La racine et les écrans de connexion ne sont pas une
    // destination : on s'y ferait renvoyer vers /espaces de toute façon.
    const url = request.nextUrl.clone();
    const demandee = pathname + request.nextUrl.search;
    const aRetenir = pathname !== "/" && !REDIRECT_SI_CONNECTE.some((p) => pathname.startsWith(p));
    url.pathname = "/connexion";
    url.search = aRetenir
      ? `?raison=session-expiree&suite=${encodeURIComponent(demandee)}`
      : "?raison=session-expiree";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.cookies.delete(ACTIVITY_COOKIE);
    return redirect;
  }

  response.cookies.set(ACTIVITY_COOKIE, await signerActivite(now, user.id, secretActivite), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request.nextUrl.protocol === "https:",
  });

  // Le rôle de supervision nécessite un second facteur, y compris lorsqu'il
  // ouvre un espace agence. La page de configuration reste accessible avant AAL2.
  const roles = (memberships ?? []).map(m => m.role);
  if (!isPublic && pathname !== "/securite" && roles.includes("super_admin")) {
    const { data: niveau, error: erreurMfa } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (erreurMfa || doitVerifierSecondFacteur(roles, niveau?.currentLevel)) {
      const url = request.nextUrl.clone();
      url.pathname = "/securite";
      url.search = `?suite=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach(c => redirect.cookies.set(c));
      return redirect;
    }
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

  return response;
}

export const config = {
  matcher: [
    // Tout sauf les ressources statiques
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
