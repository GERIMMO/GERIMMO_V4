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
import {
  destinationApresConfirmation,
  finirConfirmationInscription,
  inscriptionInachevee,
} from "@/lib/lien-mot-de-passe";
import { COOKIE_INSCRIPTION, optionsCookieInscription } from "@/lib/temoin-inscription";
import { preparerConfirmationAuth } from "@/lib/confirmation-auth";

// Point d'entrée des liens envoyés par e-mail (invitations, mot de passe
// oublié, confirmation d'inscription).
//
// Format accepté :
//  - ?token_hash=…&type=recovery|signup&next=…  — les liens que Gerimmo
//    fabrique lui-même (src/lib/lien-mot-de-passe.ts, 30/09/2026) : mot de
//    passe (recovery) et confirmation d'inscription (signup). Ils marchent
//    dans n'importe quel navigateur.
// Les anciens liens PKCE demandent désormais un nouveau courrier.
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
//
// Le contexte serveur est vérifié avant le jeton. Le mot de passe se choisit
// après confirmation de l’adresse, avec validation des informations d’inscription.

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
  // Garde anti « open redirect » : seuls les chemins internes sont suivis
  const next = destinationSure(searchParams.get("next"));

  if (tokenHash && type) {
    // Aucune vérification ici : la page de confirmation porte le bouton.
    const confirmer = new URL("/auth/confirmer", request.url);
    confirmer.searchParams.set("token_hash", tokenHash);
    confirmer.searchParams.set("type", type);
    confirmer.searchParams.set("next", next);
    const email = searchParams.get("email");
    if (email && email.length <= 254) confirmer.searchParams.set("email", email);
    const reponse = sansCache(NextResponse.redirect(confirmer));
    reponse.cookies.set(COOKIE_CONFIRMATION, nouveauJetonConfirmation(), optionsCookieConfirmation());
    return reponse;
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

  const contexte = await preparerConfirmationAuth(String(form?.get("email") ?? ""), type, tokenHash);
  if (!contexte) return finPost(lienInvalide(request, 303));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return finPost(lienInvalide(request, 303));
  const utilisateur = data?.user;
  if (type === "email_change" && !utilisateur && !data?.session) {
    return finPost(sansCache(NextResponse.redirect(new URL("/auth/confirmer?etape=autre-adresse", request.url), 303)));
  }
  if (!utilisateur || utilisateur.id !== contexte.user_id) {
    await supabase.auth.signOut({ scope: "local" });
    return finPost(lienInvalide(request, 303));
  }
  if (contexte.premiere_confirmation || (type !== "email_change" && inscriptionInachevee(utilisateur))) {
    // La session que verifyOtp vient d'ouvrir pose elle-même le mot de passe provisoire (hors du navigateur de
    // l'inscription) : elle survit, et /nouveau-mot-de-passe la trouve.
    const issue = await finirConfirmationInscription(supabase, utilisateur);
    const cible = new URL(destinationApresConfirmation(issue, type, next, inscriptionInachevee(utilisateur)), request.url);
    const reponse = finPost(sansCache(NextResponse.redirect(cible, 303)));
    // Le témoin a servi : il est effacé.
    reponse.cookies.set(COOKIE_INSCRIPTION, "", optionsCookieInscription(0));
    return reponse;
  }
  return finPost(sansCache(NextResponse.redirect(new URL(next, request.url), 303)));
}

/** Le double jeton a servi : le cookie est effacé. */
function finPost(reponse: NextResponse) {
  reponse.cookies.set(COOKIE_CONFIRMATION, "", optionsCookieConfirmation(0));
  return reponse;
}
