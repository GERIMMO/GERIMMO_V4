import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { destinationSure } from "@/lib/destination-sure";
import { requeteMemeOrigine } from "@/lib/meme-origine";

// Point d'entrée des liens envoyés par e-mail (invitations, mot de passe
// oublié, confirmation d'inscription).
//
// Deux formats :
//  - ?token_hash=…&type=recovery&next=…  — les liens que Gerimmo fabrique
//    lui-même (src/lib/lien-mot-de-passe.ts, 30/09/2026). Ils marchent dans
//    n'importe quel navigateur.
//  - ?code=…  — le flux PKCE par défaut de Supabase (confirmation
//    d'inscription, et les liens d'invitation déjà envoyés avant le 30/09).
//    L'échange exige le cookie `code_verifier` du navigateur qui a demandé le
//    lien : il ne marche que là.
//
// UN LIEN À JETON N'EST PAS VÉRIFIÉ À L'OUVERTURE (GET). Les messageries
// professionnelles et les antivirus ouvrent les liens d'un e-mail pour les
// analyser : si l'ouverture consommait le jeton (usage unique), le
// destinataire trouverait un lien déjà mort. Le GET mène donc à une page avec
// un bouton (/auth/confirmer) ; c'est le POST de ce bouton — qu'aucun
// analyseur n'envoie — qui vérifie le jeton et ouvre la session.

const TYPES_ACCEPTES: readonly EmailOtpType[] = ["recovery", "invite", "signup", "email", "magiclink", "email_change"];

function typeAccepte(brut: string | null): EmailOtpType | null {
  return brut && (TYPES_ACCEPTES as readonly string[]).includes(brut) ? (brut as EmailOtpType) : null;
}

function lienInvalide(request: NextRequest, statut = 307) {
  return NextResponse.redirect(new URL("/connexion?raison=lien-invalide", request.url), statut);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = typeAccepte(searchParams.get("type"));
  const code = searchParams.get("code");
  // Garde anti « open redirect » : seuls les chemins internes sont suivis
  const next = destinationSure(searchParams.get("next"));

  if (tokenHash && type) {
    // Aucune vérification ici : la page de confirmation porte le bouton.
    const confirmer = new URL("/auth/confirmer", request.url);
    confirmer.searchParams.set("token_hash", tokenHash);
    confirmer.searchParams.set("type", type);
    confirmer.searchParams.set("next", next);
    return NextResponse.redirect(confirmer);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Lien expiré, déjà utilisé ou invalide
  return lienInvalide(request);
}

/**
 * Le bouton de /auth/confirmer. Même origine exigée : sans cette garde, un site
 * tiers pourrait poster SON jeton depuis le navigateur d'un visiteur et
 * l'ouvrir sur un compte qui n'est pas le sien (connexion forcée).
 */
export async function POST(request: NextRequest) {
  if (!requeteMemeOrigine(request)) return new NextResponse("Requête refusée.", { status: 403 });

  const form = await request.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = typeAccepte(String(form?.get("type") ?? ""));
  const next = destinationSure(String(form?.get("next") ?? ""));
  // 303 : après un POST, le navigateur suit la redirection en GET.
  if (!tokenHash || !type) return lienInvalide(request, 303);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return lienInvalide(request, 303);
  return NextResponse.redirect(new URL(next, request.url), 303);
}
