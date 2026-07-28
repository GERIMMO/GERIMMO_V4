import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Point d'entrée des liens envoyés par email (réinitialisation de mot de
// passe aujourd'hui, invitation/première connexion au sprint 11).
// Deux formats selon la configuration du modèle d'email Supabase :
//  - ?token_hash=...&type=recovery  (modèle personnalisé, vérifié ici)
//  - ?code=...                      (lien PKCE par défaut, échangé ici)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // Garde anti « open redirect » : seuls les chemins internes sont suivis
  const nextBrut = searchParams.get("next") ?? "/espaces";
  const next =
    nextBrut.startsWith("/") && !nextBrut.startsWith("//") ? nextBrut : "/espaces";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Lien expiré, déjà utilisé ou invalide
  return NextResponse.redirect(
    new URL("/connexion?raison=lien-invalide", request.url)
  );
}
