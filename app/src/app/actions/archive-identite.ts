"use server";

// L'ARCHIVE COMPLÈTE : CONFIRMER SON IDENTITÉ EN SE RECONNECTANT (relecture adverse du 24/10, R2-7).
//
// La préparation et le téléchargement de l'archive demandent le second facteur, ou un mot de passe saisi depuis moins de
// quinze minutes. Une personne déjà connectée ne pouvait pas « se reconnecter » : /connexion la renvoie vers ses espaces.
// Ce geste ferme la session, puis ouvre /connexion avec le retour vers la section « Archive complète ».

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COOKIE } from "@/lib/session-policy";

export async function seReconnecterPourArchive() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVITY_COOKIE);
  redirect(`/connexion?suite=${encodeURIComponent("/compte/donnees#archive")}`);
}
