"use server";

import { createClient } from "@/lib/supabase/server";
import { lireDemandeAssistant } from "@/lib/conversation-privee";
import { repondreConversationPrivee } from "@/lib/conversation-privee-ia";
import { reserverAppelIAPrive } from "@/lib/plafond-ia";
import { ErreurIA } from "@/lib/erreur-ia";

export async function demanderAssistantPrive(orgId: string, compteAttendu: string, brut: unknown): Promise<{ reponse?: string; erreur?: string }> {
  const demande = lireDemandeAssistant(brut);
  if (!demande || !/^[0-9a-f-]{36}$/i.test(orgId)) return { erreur: "Écrivez une question de 2 000 caractères maximum. Si l’échange est trop long, commencez une nouvelle conversation." };
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    // Un changement de session ne peut pas réutiliser l’historique de l’ancien compte resté à l’écran.
    if (error || !user || user.id !== compteAttendu) return { erreur: "Votre session a changé. Rechargez la page avant de commencer une nouvelle conversation." };
    const { data: membre, error: erreurMembre } = await db.from("memberships").select("role").eq("account_id", user.id).eq("organization_id", orgId).eq("status", "active").in("role", ["proprietaire_direct", "locataire"]).maybeSingle();
    if (erreurMembre || !membre || !["proprietaire_direct", "locataire"].includes(membre.role)) return { erreur: "Vous n’avez pas accès à l’assistant de cet espace." };
    const reponse = await repondreConversationPrivee(demande, membre.role, () => reserverAppelIAPrive(db, orgId, "conversation_privee"));
    return { reponse };
  } catch (e) {
    return { erreur: e instanceof ErreurIA ? e.message : "L’assistant n’a pas pu répondre. Votre question est conservée dans le formulaire." };
  }
}
