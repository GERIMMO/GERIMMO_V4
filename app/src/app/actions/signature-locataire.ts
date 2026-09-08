"use server";

import { sansJargon } from "@/lib/erreurs";
import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { detecterMimeReel, pdfComplet, EXTENSIONS, TAILLE_MAX_OCTETS } from "@/lib/file-type";

export type EtatRetourSignature = {
  erreur?: string;
  succes?: string;
};

// Retour d'un document signé (chantier documentaire 08/09) : le locataire
// télécharge le document depuis « À signer », le signe, et dépose ici le
// signé — même exigences de fichier que les autres dépôts, RPC definer qui
// crée le document, solde la demande et alerte le gestionnaire.
export async function retournerDocumentSigne(
  orgId: string,
  demandeId: string,
  _etat: EtatRetourSignature,
  formData: FormData
): Promise<EtatRetourSignature> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Vous n'êtes pas connecté." };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0)
    return { erreur: "Choisissez le document signé à déposer." };
  if (fichier.size > TAILLE_MAX_OCTETS)
    return { erreur: "Fichier trop volumineux (10 Mo maximum)." };

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMimeReel(octets);
  if (!mime)
    return { erreur: "Format refusé : PDF, JPEG ou PNG uniquement (contenu vérifié)." };
  if (mime === "application/pdf" && !pdfComplet(octets))
    return {
      erreur:
        "Ce PDF est incomplet : il a probablement été coupé pendant l'envoi. Renvoyez-le, un document tronqué ne s'ouvrira pas.",
    };
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const chemin = `${orgId}/${randomUUID()}.${EXTENSIONS[mime]}`;

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (erreurUpload)
    return { erreur: `Échec du dépôt du fichier : ${sansJargon(erreurUpload.message)}` };

  const { error } = await supabase.rpc("retourner_document_signe", {
    p_org: orgId,
    p_demande: demandeId,
    p_storage_path: chemin,
    p_mime: mime,
    p_taille: fichier.size,
    p_empreinte: empreinte,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/locataire/${orgId}/documents`);
  revalidatePath(`/locataire/${orgId}`);
  return { succes: "Document signé déposé. Merci — votre gestionnaire est notifié." };
}
