import { createBrowserClient } from "@supabase/ssr";
import { COOKIES_SESSION } from "@/lib/supabase/cookies";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // Secure en production, SameSite=Lax (audit du 30/09, B1).
    { cookieOptions: COOKIES_SESSION }
  );
}
