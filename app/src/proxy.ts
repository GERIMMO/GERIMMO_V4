import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { doitVerifierSecondFacteur } from "@/lib/mfa";
import { ACTIVITY_COOKIE, strictestLimits } from "@/lib/session-policy";

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
  "/mot-de-passe-oublie",
  // Publique (et traversable connecté) : la page doit pouvoir expliquer
  // « Session expirée ou lien invalide » au lieu de rediriger sans un mot.
  "/nouveau-mot-de-passe",
  "/auth/confirm",
];
const REDIRECT_SI_CONNECTE = ["/connexion", "/inscription", "/mot-de-passe-oublie"];

export async function proxy(request: NextRequest) {
  // Ces appels viennent de serveurs, sans cookie de connexion. Chaque route
  // vérifie son propre secret (Cron) ou la signature du corps brut (Stripe).
  // Garder la liste exacte : aucun autre chemin /api n'est rendu public.
  if ([
    "/api/cron/quittances",
    "/api/cron/appels",
    "/api/cron/rappels",
    "/api/cron/abonnements",
    "/api/cron/territoire",
    "/api/cron/relances",
    "/api/cron/marketing",
    "/api/cron/signatures",
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
  // boucle), et un cookie absent ou corrompu retombe sur l'heure de connexion.
  const parsed = Number(request.cookies.get(ACTIVITY_COOKIE)?.value);
  const lastActivity = Math.max(
    Number.isFinite(parsed) ? parsed : 0,
    signedInAt
  );

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

  response.cookies.set(ACTIVITY_COOKIE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
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
