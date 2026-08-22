import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  detecterMimeReel,
  pdfComplet,
  EXTENSIONS,
  TAILLE_MAX_OCTETS,
} from "@/lib/file-type";

export type ResultatDepotGed = {
  documentId?: string;
  erreur?: string;
  // Le fichier a été accepté, mais son extension mentait sur son contenu :
  // on le dit plutôt que de corriger en silence.
  avertissement?: string;
};

// Libellés lisibles des formats acceptés, pour l'avertissement d'extension
const NOMS_FORMAT: Record<string, string> = {
  "application/pdf": "un PDF",
  "image/jpeg": "une image JPEG",
  "image/png": "une image PNG",
};

// Cœur du dépôt GED, partagé entre le formulaire Documents et les dépôts
// contextuels (diagnostic S2, bail S4…) : type réel vérifié (RM-A4.9),
// anti-doublon par empreinte, upload Storage isolé par agence, fiche document
// + rattachement à l'agence. Retourne l'id du document créé.
export async function deposerFichierGed(
  supabase: SupabaseClient,
  user: User,
  orgId: string,
  fichier: File,
  type: string,
  titre: string,
  // La fiche document est immuable (update révoqué en base) : le versionnage
  // (remplace_id) et l'expiration se posent À L'INSERTION, jamais après coup.
  options?: { remplaceId?: string; expireLe?: string }
): Promise<ResultatDepotGed> {
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

  // Un PDF dont l'en-tête est valide mais le corps tronqué passe la détection de
  // type et ne s'ouvrira jamais. On conserve des documents à valeur légale.
  if (mime === "application/pdf" && !pdfComplet(octets)) {
    return {
      erreur:
        "Ce PDF est incomplet : il a probablement été coupé pendant l'envoi. Renvoyez-le, un document tronqué ne s'ouvrira pas.",
    };
  }

  // L'extension annonçait autre chose que le contenu réel : accepté, mais dit.
  const extensionAnnoncee = fichier.name.split(".").pop()?.toLowerCase() ?? "";
  const avertissement =
    extensionAnnoncee && extensionAnnoncee !== EXTENSIONS[mime]
      ? `Ce fichier est en réalité ${NOMS_FORMAT[mime]}, malgré son extension « .${extensionAnnoncee} ». Il a été enregistré comme tel.`
      : undefined;

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
      // Détection par empreinte du CONTENU (recette 22/08 : le titre peut
      // différer, c'est bien le même fichier octet pour octet — le dire).
      erreur: `Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « ${doublon.titre ?? "sans titre"} ». Rattachez cette pièce existante plutôt que de la déposer en double.`,
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
      ...(options?.remplaceId ? { remplace_id: options.remplaceId } : {}),
      ...(options?.expireLe ? { expire_le: options.expireLe } : {}),
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

  // Rattachement minimal (module 12) : toujours l'agence
  const { error: erreurLien } = await supabase.from("document_liens").insert({
    document_id: document.id,
    organization_id: orgId,
    entite: "organisation",
    entite_id: orgId,
  });
  if (erreurLien) {
    return { erreur: `Document déposé mais rattachement en échec : ${erreurLien.message}` };
  }

  return { documentId: document.id, avertissement };
}
