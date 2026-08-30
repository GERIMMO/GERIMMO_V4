import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ACTIVITY_COOKIE, strictestLimits } from "@/lib/session-policy";

// Accessibles sans session. /auth/confirm traite les liens reçus par email
// (réinitialisation…) : il doit rester traversable même connecté.
const PUBLIC_PATHS = [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/auth/confirm",
];
const REDIRECT_SI_CONNECTE = ["/connexion", "/inscription", "/mot-de-passe-oublie"];

export async function proxy(request: NextRequest) {
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
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
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
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "?raison=session-expiree";
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

  // Un utilisateur connecté n'a rien à faire sur /connexion
  if (REDIRECT_SI_CONNECTE.some((p) => pathname.startsWith(p))) {
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
