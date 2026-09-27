"use server";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
export type EtatAnnexeLocative = { erreur?: string; succes?: string };

export async function rattacherAnnexeLocative(orgId: string, bienId: string, lotId: string, _etat: EtatAnnexeLocative, form: FormData): Promise<EtatAnnexeLocative> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Reconnectez-vous pour modifier ce rattachement." };
  if (form.get("confirmation") !== "oui") return { erreur: "Confirmez que cette annexe est louée avec le logement dans le même bail." };
  const principal = String(form.get("principal") ?? "").trim();
  const { error } = await supabase.rpc("configurer_annexe_abonnement_v2", { p_org: orgId, p_lot: lotId, p_principal: principal || null });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/parc/${bienId}`);
  revalidatePath(`/agence/${orgId}/parc/${bienId}/lots/${lotId}`);
  revalidatePath(`/agence/${orgId}/abonnement`);
  return { succes: principal ? "Annexe rattachée au logement. Elle ne peut pas porter de bail distinct." : "Ce lot est désormais indépendant et compte séparément dans votre portefeuille." };
}
