"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";

export type EtatReglementExistantBail = { erreur?: string; succes?: string };

export async function utiliserReglementExistantBail(
  orgId: string,
  bailId: string,
  _etat: EtatReglementExistantBail,
  form: FormData,
): Promise<EtatReglementExistantBail> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const documentId = String(form.get("document_id") ?? "").trim();
  if (![orgId, bailId, documentId].every(estUuid)) return { erreur: "Choisissez un règlement enregistré dans ce dossier." };

  const { data: bail, error: erreurBail } = await supabase.from("baux")
    .select("id,lot_id,etat,reglement_copropriete")
    .eq("id", bailId).eq("organization_id", orgId).maybeSingle();
  if (erreurBail || !bail?.lot_id || bail.etat !== "brouillon") {
    return { erreur: "Le bail doit être un brouillon accessible avec son logement." };
  }
  if (bail.reglement_copropriete) return { erreur: "Un règlement est déjà associé à ce bail. Rechargez le dossier pour le consulter." };
  const portefeuille = await supabase.rpc("lot_hors_portefeuille", { p_org: orgId, p_lot: bail.lot_id });
  if (portefeuille.error || portefeuille.data !== false) return { erreur: "Ce logement n’est pas accessible dans votre portefeuille." };

  const { data: document, error: erreurDocument } = await supabase.from("documents")
    .select("id,type,mime_type,purged_at")
    .eq("id", documentId).eq("organization_id", orgId).maybeSingle();
  if (erreurDocument || !document || document.purged_at || document.type !== "reglement_copropriete" || document.mime_type !== "application/pdf") {
    return { erreur: "Choisissez un règlement de copropriété disponible au format PDF." };
  }
  const remplacement = await supabase.from("documents").select("id")
    .eq("organization_id", orgId).eq("remplace_id", documentId).limit(1).maybeSingle();
  if (remplacement.error) return { erreur: "La version de ce règlement n’a pas pu être vérifiée. Réessayez." };
  if (remplacement.data) return { erreur: "Ce règlement a été remplacé. Choisissez sa nouvelle version." };

  // Le filtre sur la valeur vide protège un choix enregistré entre la lecture
  // et l'écriture. Les gardes du bail et son état restent vérifiés en base.
  const { data: confirmation, error: erreurEnregistrement } = await supabase.from("baux")
    .update({ reglement_copropriete: documentId })
    .eq("id", bailId).eq("organization_id", orgId).eq("etat", "brouillon")
    .is("reglement_copropriete", null).select("id,reglement_copropriete").maybeSingle();
  if (erreurEnregistrement) return { erreur: sansJargon(erreurEnregistrement.message) };
  if (confirmation?.id !== bailId || confirmation.reglement_copropriete !== documentId) {
    return { erreur: "Le dossier a changé pendant l’enregistrement. Rechargez-le pour vérifier le règlement associé." };
  }
  for (const racine of ["/agence", "/espace"]) {
    revalidatePath(`${racine}/${orgId}/baux/${bailId}`);
    revalidatePath(`${racine}/${orgId}/documents`);
  }
  return { succes: "Règlement associé au bail." };
}
