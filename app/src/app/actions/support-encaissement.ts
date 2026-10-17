"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lireDecimal } from "@/lib/saisie-montant";
import { sansJargon } from "@/lib/erreurs";

export type EtatSupportEncaissement = {
  erreur?: string;
  succes?: string;
  gesteId?: string;
  expireLe?: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function preparerEncaissementSupport(orgId: string, _etat: EtatSupportEncaissement, form: FormData): Promise<EtatSupportEncaissement> {
  const bailId = String(form.get("bailId") ?? "");
  const appelId = String(form.get("appelId") ?? "");
  const motif = String(form.get("motif") ?? "").trim();
  const resteLu = lireDecimal(form.get("reste"));
  const anterieureLue = lireDecimal(form.get("anterieure"));
  if ("erreur" in resteLu || "erreur" in anterieureLue) return { erreur: "Rechargez les montants de l’appel de loyer." };
  const reste = resteLu.valeur;
  const anterieure = anterieureLue.valeur;
  if (![orgId, bailId, appelId].every((id) => UUID.test(id))) return { erreur: "Appel de loyer introuvable." };
  if (motif.length < 10 || motif.length > 500) return { erreur: "Indiquez un motif de support de 10 à 500 caractères." };
  if (!Number.isFinite(reste) || reste <= 0 || !Number.isFinite(anterieure) || anterieure < 0) return { erreur: "Rechargez les montants de l’appel de loyer." };
  if (form.get("confirmation") !== "oui") return { erreur: "Confirmez que le virement a déjà été reçu." };
  const supabase = await createClient();
  const { data: sa, error: acces } = await supabase.rpc("is_permanent_super_admin");
  if (acces || sa !== true) return { erreur: "Compte de supervision avec double vérification requis." };
  const { data, error } = await supabase.rpc("preparer_encaissement_support", {
    p_org: orgId, p_bail: bailId, p_appel: appelId, p_reste: reste, p_anterieure: anterieure, p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message) };
  const geste = (data as { geste_id: string; expire_le: string }[] | null)?.[0];
  if (!geste) return { erreur: "La préparation n’a pas abouti. Aucun encaissement n’a été ajouté." };
  return { gesteId: geste.geste_id, expireLe: geste.expire_le };
}

export async function executerEncaissementSupport(orgId: string, _etat: EtatSupportEncaissement, form: FormData): Promise<EtatSupportEncaissement> {
  const gesteId = String(form.get("gesteId") ?? "");
  if (!UUID.test(orgId) || !UUID.test(gesteId)) return { erreur: "Geste de support introuvable." };
  if (form.get("confirmation") !== "oui") return { erreur: "Confirmez l’enregistrement de cet encaissement." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("executer_encaissement_support", { p_geste: gesteId });
  if (error) return { erreur: sansJargon(error.message) };
  const resultat = data as { statut?: string; rejoue?: boolean } | null;
  if (resultat?.statut !== "enregistre") return { erreur: "Aucun nouvel encaissement : le solde a changé, est déjà couvert ou le règlement a été annulé. Rechargez les loyers." };
  revalidatePath(`/admin/organisations/${orgId}/support`);
  revalidatePath(`/agence/${orgId}`, "layout");
  revalidatePath(`/espace/${orgId}`, "layout");
  return { succes: resultat.rejoue ? "Cet encaissement avait déjà été enregistré : aucun doublon." : "Encaissement enregistré. L’auteur, le motif et le résultat sont conservés au journal." };
}
