import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detecterMimeReel } from "./file-type";

/** Fichier privé réservé à une demande autorisée. Reprise sans remplacement ni suppression après résultat réseau inconnu. */
export async function joindrePhotoReleve(db: SupabaseClient, demande: string, fichier: File): Promise<{ erreur?: string; documentId?: string }> {
  if (fichier.size < 1 || fichier.size > 10 * 1024 * 1024) return { erreur: "La photo doit faire moins de 10 Mo." };
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMimeReel(octets);
  if (mime !== "image/jpeg" && mime !== "image/png") return { erreur: "Choisissez une photo JPEG ou PNG." };
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const { data: depot, error } = await db.rpc("preparer_photo_releve", { p_demande: demande, p_empreinte: empreinte, p_mime: mime, p_taille: fichier.size });
  if (error || !depot) return { erreur: "La photo n’a pas pu être préparée. Vérifiez que cette demande est toujours ouverte." };
  if (depot.document_id) return { documentId: depot.document_id };
  try {
    await db.storage.from("documents").upload(depot.storage_path, octets, { contentType: mime, upsert: false });
  } catch { /* La finalisation revérifie l'objet après une réponse d'upload perdue. */ }
  const fin = await db.rpc("finaliser_photo_releve", { p_depot: depot.id });
  if (fin.error || typeof fin.data !== "string") return { erreur: "Photo à reprendre : le dépôt n’est pas encore confirmé. Réessayez avec la même photo." };
  return { documentId: fin.data };
}
