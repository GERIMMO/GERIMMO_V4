"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";

export type EtatDecisionArtisan = { erreur?: string; succes?: string };

export async function traiterInscriptionArtisan(
  artisanId: string,
  _etat: EtatDecisionArtisan,
  formData: FormData
): Promise<EtatDecisionArtisan> {
  const supabase = await createClient();
  const { data: autorise, error: erreurAcces } = await supabase.rpc("is_super_admin");
  if (erreurAcces || autorise !== true) return { erreur: "Accès réservé à la supervision Gerimmo." };

  const operation = String(formData.get("operation") ?? "");
  if (!["verifier_siret", "validation", "refus", "remise_en_attente"].includes(operation)) {
    return { erreur: "Choisissez une décision proposée sur cet écran." };
  }
  const { data: artisan, error: erreurArtisan } = await supabase.from("artisans")
    .select("id, statut_plateforme, siret_etat").eq("id", artisanId).maybeSingle();
  if (erreurArtisan) return { erreur: "Impossible de relire cette inscription. Réessayez." };
  if (!artisan) return { erreur: "Inscription introuvable." };
  const attendu = operation === "remise_en_attente" ? "refuse" : "en_attente";
  if (artisan.statut_plateforme !== attendu) return { erreur: "Cette inscription a déjà changé d’état. Rechargez la page." };

  const motif = String(formData.get("motif") ?? "").trim();
  if (operation === "refus" && !motif) return { erreur: "Indiquez le motif objectif du refus : il sera visible par l’artisan." };
  if (operation === "verifier_siret" && formData.get("verification_effectuee") !== "oui") {
    return { erreur: "Confirmez avoir vérifié le SIRET avant d’enregistrer ce constat." };
  }
  if (operation === "validation") {
    if (artisan.siret_etat !== "verifie") return { erreur: "Vérifiez d’abord le SIRET." };
    if (formData.get("pieces_relues") !== "oui") return { erreur: "Confirmez avoir relu les justificatifs avant de valider l’inscription." };
  }
  const { error: erreurTrace } = await supabase.rpc("log_sa_access", {
    org: null,
    sa_action: "examen_inscription_artisan",
    sa_details: { artisan_id: artisanId, operation_demandee: operation },
  });
  if (erreurTrace) return { erreur: "La demande ne peut pas être journalisée. Réessayez avant de décider." };
  const { error } = operation === "verifier_siret"
    ? await supabase.rpc("artisan_definir_siret_etat", { p_artisan: artisanId, p_etat: "verifie" })
    : await supabase.rpc("artisan_decider_plateforme", { p_artisan: artisanId, p_decision: operation, p_motif: motif || null });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/admin/artisans");
  revalidatePath("/admin");
  revalidatePath("/artisan/entreprise");
  const messages: Record<string, string> = {
    verifier_siret: "Vérification du SIRET enregistrée. L’inscription reste à examiner.",
    validation: "Inscription validée. La décision figure dans l’historique de la plateforme.",
    refus: "Inscription refusée avec son motif.",
    remise_en_attente: "Inscription remise en attente pour un nouvel examen.",
  };
  return { succes: messages[operation] };
}
