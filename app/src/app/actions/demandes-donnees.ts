"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { PREFIXE_DEMANDE_DONNEES, TYPES_DEMANDE_DONNEES, typeDemandeDonnees } from "@/lib/demandes-donnees";
import type { EtatRetour } from "./retours";

export async function demanderGestionDonnees(_etat: EtatRetour, fd: FormData): Promise<EtatRetour> {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return { erreur: "Connectez-vous pour envoyer votre demande." };
  const type = typeDemandeDonnees(fd.get("type"));
  const description = String(fd.get("description") ?? "").trim();
  const cle = String(fd.get("cle_envoi") ?? "");
  if (!type) return { erreur: "Choisissez votre demande." };
  if (description.length < 15 || description.length > 6000) return { erreur: "Précisez votre demande en 15 à 6 000 caractères." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cle)) return { erreur: "Rechargez cette page avant de réessayer." };
  // Identité déduite de la session par la RPC, organisation toujours nulle :
  // aucun gestionnaire, autre membre ou artisan n'a accès à cette demande.
  const { data, error } = await db.rpc("soumettre_retour", {
    p_cle: cle, p_nature: "question", p_titre: PREFIXE_DEMANDE_DONNEES + TYPES_DEMANDE_DONNEES[type],
    p_description: description, p_attendu: null, p_ecran: "/compte", p_org: null, p_action: "formulaire",
  });
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "L’enregistrement n’est pas confirmé. Réessayez avec ce formulaire." };
  revalidatePath("/compte/donnees"); revalidatePath("/admin/donnees"); revalidatePath("/admin/retours");
  return { id: String(data), succes: "Votre demande est enregistrée. Vous pouvez suivre la réponse ci-dessous. Aucune donnée n’a été supprimée." };
}
