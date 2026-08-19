"use server";

import { sansJargon } from "@/lib/erreurs";
import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { detecterMimeReel, pdfComplet, EXTENSIONS, TAILLE_MAX_OCTETS } from "@/lib/file-type";

export type EtatAttestation = { erreur?: string; succes?: string };

// Le locataire dépose lui-même son attestation d'assurance depuis son espace
// (RM-0b.5.1). Le fichier va au stockage (policy locataire), puis une fonction
// SECURITY DEFINER crée le document + les liens pour SA propre fiche.
export async function deposerMonAttestation(
  orgId: string,
  _etat: EtatAttestation,
  formData: FormData
): Promise<EtatAttestation> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Vous n'êtes pas connecté." };

  // Défense en profondeur : adhésion locataire active dans cette agence,
  // vérifiée avant de construire le chemin Storage (les policies base la
  // revérifient — même garde que verifierAccesEspaceLocataire, sans redirect).
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .eq("role", "locataire")
    .maybeSingle();
  if (!adhesion) return { erreur: "Accès refusé." };

  const fichier = formData.get("fichier");
  const titre = String(formData.get("titre") ?? "").trim();
  const expire = String(formData.get("expire_le") ?? "").trim();

  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez le fichier de votre attestation." };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { erreur: "Fichier trop volumineux (10 Mo maximum)." };
  }
  if (!expire) {
    return { erreur: "Indiquez la date d'expiration figurant sur l'attestation." };
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMimeReel(octets);
  if (!mime) {
    return { erreur: "Format refusé : PDF, JPEG ou PNG uniquement (contenu vérifié)." };
  }
  // Même exigence que le dépôt GED (ged-depot.ts) : un PDF tronqué garde son
  // en-tête mais ne s'ouvrira jamais — on refuse au dépôt.
  if (mime === "application/pdf" && !pdfComplet(octets)) {
    return {
      erreur:
        "Ce PDF est incomplet : il a probablement été coupé pendant l'envoi. Renvoyez-le, un document tronqué ne s'ouvrira pas.",
    };
  }
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const chemin = `${orgId}/${randomUUID()}.${EXTENSIONS[mime]}`;

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (erreurUpload) {
    return { erreur: `Échec du dépôt du fichier : ${sansJargon(erreurUpload.message)}` };
  }

  const { error: erreurRpc } = await supabase.rpc("deposer_mon_attestation", {
    p_org: orgId,
    p_storage_path: chemin,
    p_mime: mime,
    p_taille: fichier.size,
    p_empreinte: empreinte,
    p_titre: titre,
    p_expire: expire,
  });
  if (erreurRpc) return { erreur: erreurRpc.message };

  revalidatePath(`/locataire/${orgId}`);
  return { succes: "Attestation déposée. Merci — votre agence est notifiée." };
}
