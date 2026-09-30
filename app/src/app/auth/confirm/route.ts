import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { destinationSure } from "@/lib/destination-sure";
import { requeteMemeOrigine } from "@/lib/meme-origine";
import {
  COOKIE_CONFIRMATION,
  jetonConfirmationValide,
  nouveauJetonConfirmation,
  optionsCookieConfirmation,
} from "@/lib/jeton-confirmation";

// Point d'entrée des liens envoyés par e-mail (invitations, mot de passe
// oublié, confirmation d'inscription).
//
// Deux formats :
//  - ?token_hash=…&type=recovery|signup&next=…  — les liens que Gerimmo
//    fabrique lui-même (src/lib/lien-mot-de-passe.ts, 30/09/2026) : mot de
//    passe (recovery) et confirmation d'inscription (signup). Ils marchent
//    dans n'importe quel navigateur.
//  - ?code=…  — le flux PKCE par défaut de Supabase : les liens déjà envoyés
//    avant le 30/09 (invitations, inscriptions). L'échange exige le cookie
//    `code_verifier` du navigateur qui a demandé le lien : il ne marche que là.
//
// UN LIEN À JETON N'EST PAS VÉRIFIÉ À L'OUVERTURE (GET). Les messageries
// professionnelles et les antivirus ouvrent les liens d'un e-mail pour les
// analyser : si l'ouverture consommait le jeton (usage unique), le
// destinataire trouverait un lien déjà mort. Le GET mène donc à une page avec
// un bouton (/auth/confirmer) ; c'est le POST de ce bouton — qu'aucun
// analyseur n'envoie — qui vérifie le jeton et ouvre la session.
//
// Le GET pose aussi le cookie du double jeton (lib/jeton-confirmation.ts) que
// la page recopie dans un champ caché : le POST exige les deux. Et rien de ce
// qui porte le jeton n'est mis en cache (`Cache-Control: no-store`, audit M5).

const TYPES_ACCEPTES: readonly EmailOtpType[] = ["recovery", "invite", "signup", "email", "magiclink", "email_change"];

function typeAccepte(brut: string | null): EmailOtpType | null {
  return brut && (TYPES_ACCEPTES as readonly string[]).includes(brut) ? (brut as EmailOtpType) : null;
}

function sansCache<T extends NextResponse>(reponse: T): T {
  reponse.headers.set("Cache-Control", "no-store");
  return reponse;
}

function lienInvalide(request: NextRequest, statut = 307) {
  return sansCache(NextResponse.redirect(new URL("/connexion?raison=lien-invalide", request.url), statut));
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
    const reponse = sansCache(NextResponse.redirect(confirmer));
    reponse.cookies.set(COOKIE_CONFIRMATION, nouveauJetonConfirmation(), optionsCookieConfirmation());
    return reponse;
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return sansCache(NextResponse.redirect(new URL(next, request.url)));
    }
  }

  // Lien expiré, déjà utilisé ou invalide
  return lienInvalide(request);
}

/**
 * Le bouton de /auth/confirmer. Même origine exigée : sans cette garde, un site
 * tiers pourrait poster SON jeton depuis le navigateur d'un visiteur et
 * l'ouvrir sur un compte qui n'est pas le sien (connexion forcée). Le double
 * jeton (cookie posé par le GET, champ caché de la page) est exigé en plus ;
 * c'est lui qui permet encore d'accepter `Origin: null`.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const nonceValide = jetonConfirmationValide(
    request.cookies.get(COOKIE_CONFIRMATION)?.value,
    String(form?.get("confirmation") ?? "")
  );
  if (!nonceValide || !requeteMemeOrigine(request, nonceValide)) {
    return sansCache(new NextResponse("Requête refusée.", { status: 403 }));
  }

  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = typeAccepte(String(form?.get("type") ?? ""));
  const next = destinationSure(String(form?.get("next") ?? ""));
  // 303 : après un POST, le navigateur suit la redirection en GET.
  if (!tokenHash || !type) return finPost(lienInvalide(request, 303));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return finPost(lienInvalide(request, 303));
  return finPost(sansCache(NextResponse.redirect(new URL(next, request.url), 303)));
}

/** Le double jeton a servi : le cookie est effacé. */
function finPost(reponse: NextResponse) {
  reponse.cookies.set(COOKIE_CONFIRMATION, "", optionsCookieConfirmation(0));
  return reponse;
}
