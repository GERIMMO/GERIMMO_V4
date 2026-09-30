import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COOKIES_SESSION } from "@/lib/supabase/cookies";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Secure en production, SameSite=Lax (audit du 30/09, B1).
      cookieOptions: COOKIES_SESSION,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appel depuis un Server Component : le proxy rafraîchit les
            // sessions, l'écriture de cookies peut être ignorée ici.
          }
        },
      },
    }
  );
}
