"use server";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";

/** Corrige la donnée du rapport existant, sans imposer un nouveau dépôt. */
export async function corrigerClasseDpeLot(orgId: string, lotId: string, diagnosticId: string, _etat: {erreur?: string; succes?: string}, form: FormData) {
  const {supabase, user} = await verifierGerant(orgId);
  if (!user) return {erreur: "Accès refusé."};
  const classe = String(form.get("classe_dpe") ?? "");
  if (!/^[A-G]$/.test(classe)) return {erreur: "Recopiez la classe A à G figurant sur ce diagnostic."};
  const {data, error} = await supabase.from("diagnostics").update({classe_dpe: classe})
    .eq("id", diagnosticId).eq("organization_id", orgId).eq("lot_id", lotId).eq("type", "dpe").is("archived_at", null).select("id");
  if (error) return {erreur: sansJargon(error.message)};
  if (!data?.length) return {erreur: "Ce DPE n’est plus disponible pour ce logement. Rechargez le dossier."};
  revalidatePath(`/agence/${orgId}/parc`, "layout");
  revalidatePath(`/agence/${orgId}/baux`, "layout");
  return {succes: "Classe du DPE enregistrée dans le lot."};
}
