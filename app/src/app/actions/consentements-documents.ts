"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
export type EtatConsentement = { erreur?: string; succes?: string; accepte?: boolean };
export async function modifierConsentementDocument(orgId: string, nature: "quittances" | "recommandes", _etat: EtatConsentement, form: FormData): Promise<EtatConsentement> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { erreur: "Connectez-vous pour modifier votre choix." };
  if (!["quittances", "recommandes"].includes(nature) || !["oui", "non"].includes(String(form.get("accepte")))) return { erreur: "Choisissez si vous acceptez ce mode de transmission." };
  const accepte = form.get("accepte") === "oui";
  const { data, error } = await db.rpc("modifier_consentement_document", { p_org: orgId, p_nature: nature, p_accepte: accepte, p_email: String(form.get("email") ?? "") });
  if (error) return { erreur: sansJargon(error.message) };
  if (data !== accepte) return { erreur: "Votre choix n’a pas pu être confirmé. Actualisez la page." };
  revalidatePath(`/locataire/${orgId}/documents`);
  return { succes: accepte ? "Votre accord est enregistré. Vous pouvez le retirer ici à tout moment." : "Votre accord est retiré. Les prochains envois électroniques concernés sont désactivés.", accepte };
}
