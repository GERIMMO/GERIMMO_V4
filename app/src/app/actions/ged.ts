"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  detecterMimeReel,
  EXTENSIONS,
  TAILLE_MAX_OCTETS,
} from "@/lib/file-type";
import { TYPES_DEPOSABLES } from "@/lib/ged";
import { verifierGerant } from "@/lib/ged-acces";

export type EtatDepot = { erreur?: string; succes?: string };

export async function deposerDocument(
  orgId: string,
  _etat: EtatDepot,
  formData: FormData
): Promise<EtatDepot> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  const type = String(formData.get("type") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  const personneId = String(formData.get("personne") ?? "");

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez un fichier." };
  }
  if (!(TYPES_DEPOSABLES as readonly string[]).includes(type)) {
    return { erreur: "Type de document invalide." };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { erreur: "Fichier trop volumineux (10 Mo maximum)." };
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());

  // RM-A4.9 : le type réel, jamais l'extension
  const mime = detecterMimeReel(octets);
  if (!mime) {
    return {
      erreur:
        "Format refusé : seuls les fichiers PDF, JPEG et PNG sont acceptés (contenu réel vérifié).",
    };
  }

  // Empreinte anti-doublon : le même contenu ne se dépose pas deux fois
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const { data: doublon } = await supabase
    .from("documents")
    .select("id, titre")
    .eq("organization_id", orgId)
    .eq("empreinte", empreinte)
    .is("purged_at", null)
    .maybeSingle();
  if (doublon) {
    return {
      erreur: `Ce fichier existe déjà dans la GED (« ${doublon.titre ?? "sans titre"} »). Rattachez le document existant plutôt que de le déposer à nouveau.`,
    };
  }

  // Chemin : <org>/<uuid>.<ext> — le 1er segment porte l'isolation Storage
  const chemin = `${orgId}/${crypto.randomUUID()}.${EXTENSIONS[mime]}`;
  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (erreurUpload) {
    return { erreur: `Échec du dépôt : ${erreurUpload.message}` };
  }

  const { data: document, error: erreurInsert } = await supabase
    .from("documents")
    .insert({
      organization_id: orgId,
      type,
      titre: titre || fichier.name,
      storage_path: chemin,
      mime_type: mime,
      taille_octets: fichier.size,
      empreinte,
      deposited_by: user.id,
    })
    .select("id")
    .single();
  if (erreurInsert || !document) {
    // 23505 : l'index anti-doublon a tranché une course entre deux dépôts
    if (erreurInsert?.code === "23505") {
      return {
        erreur:
          "Ce fichier vient d'être déposé par ailleurs (doublon détecté). Actualisez la liste.",
      };
    }
    return { erreur: `Échec de l'enregistrement : ${erreurInsert?.message}` };
  }

  // Rattachements (module 12) : toujours l'agence, et la personne si choisie
  const liens = [
    { document_id: document.id, organization_id: orgId, entite: "organisation", entite_id: orgId },
  ];
  if (personneId) {
    liens.push({
      document_id: document.id,
      organization_id: orgId,
      entite: "personne",
      entite_id: personneId,
    });
  }
  const { error: erreurLiens } = await supabase
    .from("document_liens")
    .insert(liens);
  if (erreurLiens) {
    return { erreur: `Document déposé mais rattachement en échec : ${erreurLiens.message}` };
  }

  revalidatePath(`/agence/${orgId}/documents`);
  return { succes: "Document déposé." };
}
