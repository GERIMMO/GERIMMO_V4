"use server";
import { resoudreDepotsFormulaire, limiteFichierDepose } from "@/lib/depot-direct";


import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import {
  detecterMimeReel,
  pdfComplet,
  EXTENSIONS,
} from "@/lib/file-type";
import { valeursDuFormulaire } from "@/lib/formulaires";
import { baseEspace } from "@/lib/racine-espace";

export type EtatDocumentGed = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

// Le formulaire transmet les filtres, jamais une destination de navigation.
// Les valeurs répétées ou trop longues sont ignorées comme un filtre absent.
function filtresApresRemplacement(formData: FormData): URLSearchParams {
  const resultat = new URLSearchParams();
  const brut = formData.get("retour_filtres");
  if (typeof brut !== "string" || brut.length > 4096) return resultat;
  const filtres = new URLSearchParams(brut);
  for (const [cle, maximum] of [["type", 80], ["q", 200], ["du", 10], ["au", 10]] as const) {
    const valeurs = filtres.getAll(cle);
    if (valeurs.length !== 1 || !valeurs[0] || valeurs[0].length > maximum) continue;
    if ((cle === "du" || cle === "au") && !/^\d{4}-\d{2}-\d{2}$/.test(valeurs[0])) continue;
    resultat.set(cle, valeurs[0]);
  }
  return resultat;
}

// Remplacer une pièce par une nouvelle version (maquette pageDocument :
// « Le remplacement conserve l'historique »). Le fichier est vérifié comme au
// dépôt (type réel, PDF complet, anti-doublon), puis la RPC definer
// remplacer_document_ged fait le reste EN UNE TRANSACTION : fiche versionnée,
// rattachements copiés, pointeur baux.document_signe déplacé (revue 26/08 :
// la copie applicative des liens pouvait laisser une version orpheline).
export async function remplacerDocument(
  orgId: string,
  documentId: string,
  _etat: EtatDocumentGed,
  formData: FormData
): Promise<EtatDocumentGed> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, formData);
  if (erreurDepotDirect) return { erreur: erreurDepotDirect };
  const fichier = formData.get("fichier");
  const titre = String(formData.get("titre") ?? "").trim();
  const expireLe = String(formData.get("expire_le") ?? "").trim();
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez le fichier de la nouvelle version.", valeurs };
  }
  if (fichier.size > limiteFichierDepose(fichier)) {
    return { erreur: `Fichier trop volumineux (${limiteFichierDepose(fichier) / 1024 / 1024} Mo maximum).`, valeurs };
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMimeReel(octets);
  if (!mime) {
    return {
      erreur:
        "Format refusé : seuls les fichiers PDF, JPEG et PNG sont acceptés (contenu réel vérifié).",
      valeurs,
    };
  }
  if (mime === "application/pdf" && !pdfComplet(octets)) {
    return {
      erreur:
        "Ce PDF est incomplet : il a probablement été coupé pendant l'envoi. Renvoyez-le, un document tronqué ne s'ouvrira pas.",
      valeurs,
    };
  }

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
      erreur: `Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « ${doublon.titre ?? "sans titre"} ». La nouvelle version doit différer de l'existante.`,
      valeurs,
    };
  }

  const chemin = `${orgId}/${crypto.randomUUID()}.${EXTENSIONS[mime]}`;
  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (erreurUpload) {
    return { erreur: `Échec du dépôt : ${sansJargon(erreurUpload.message)}`, valeurs };
  }

  const { data: nouvelleVersion, error: erreurRpc } = await supabase.rpc(
    "remplacer_document_ged",
    {
      p_org: orgId,
      p_remplace: documentId,
      p_storage_path: chemin,
      p_mime: mime,
      p_taille: fichier.size,
      p_empreinte: empreinte,
      p_titre: titre,
      p_expire: expireLe || null,
    }
  );
  if (erreurRpc || !nouvelleVersion) {
    // 23505 : deux index d'unicité partagent ce code — le nom de la
    // contrainte départage (revue 26/08, passe n°2)
    if (erreurRpc?.code === "23505") {
      return {
        erreur: erreurRpc.message.includes("empreinte")
          ? "Un fichier au contenu strictement identique vient d'être déposé par ailleurs (doublon détecté). Actualisez la liste."
          : "Une version plus récente vient d'être déposée par ailleurs — actualisez la fiche.",
        valeurs,
      };
    }
    return { erreur: sansJargon(erreurRpc?.message ?? "Échec du remplacement."), valeurs };
  }

  revalidatePath(`/agence/${orgId}/documents`);
  revalidatePath(`/espace/${orgId}/documents`);
  // Ouvrir la nouvelle version dans la même liste filtrée, sous la racine du profil.
  const parametres = filtresApresRemplacement(formData);
  parametres.set("sel", nouvelleVersion);
  redirect(`${baseEspace(orgId, role === "proprietaire_direct")}/documents?${parametres}`);
}

// Les entités rattachables depuis la fiche de pièce (module 12 — l'énum
// entite_liee en connaît d'autres, posées par leurs modules respectifs)
const ENTITES_RATTACHABLES: Record<string, { table: string; libelle: string }> = {
  personne: { table: "persons", libelle: "la personne" },
  lot: { table: "lots", libelle: "le lot" },
  bail: { table: "baux", libelle: "le bail" },
};

// Rattacher une pièce à une autre fiche (maquette pageDocument : une pièce
// est stockée une fois et apparaît sur chacune de ses fiches).
export async function rattacherDocument(
  orgId: string,
  documentId: string,
  _etat: EtatDocumentGed,
  formData: FormData
): Promise<EtatDocumentGed> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const entite = String(formData.get("entite") ?? "");
  const entiteId = String(formData.get("entite_id") ?? "").trim();
  const cible = ENTITES_RATTACHABLES[entite];
  if (!cible) return { erreur: "Choisissez le type de fiche à rattacher.", valeurs };
  if (!entiteId) return { erreur: "Choisissez la fiche à rattacher.", valeurs };

  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!doc) return { erreur: "Pièce introuvable dans l'agence.", valeurs };

  // L'intégrité du rattachement est applicative (pas de FK polymorphe) : la
  // fiche cible doit exister dans la même agence
  const { data: fiche } = await supabase
    .from(cible.table)
    .select("id")
    .eq("id", entiteId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!fiche) return { erreur: `Impossible de trouver ${cible.libelle} dans l'agence.`, valeurs };

  const { error } = await supabase.from("document_liens").insert({
    document_id: documentId,
    organization_id: orgId,
    entite,
    entite_id: entiteId,
  });
  if (error) {
    if (error.code === "23505") {
      return { erreur: "Cette pièce est déjà rattachée à cette fiche.", valeurs };
    }
    return { erreur: sansJargon(error.message), valeurs };
  }

  revalidatePath(`/agence/${orgId}/documents`);
  revalidatePath(`/espace/${orgId}/documents`);
  return { succes: "Pièce rattachée — elle apparaît désormais sur cette fiche." };
}
