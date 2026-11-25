"use server";
import { resoudreDepotsFormulaire, limiteFichierDepose } from "@/lib/depot-direct";


import { sansJargon } from "@/lib/erreurs";
import { lireInterlocuteurLocataire } from "@/lib/interlocuteur-locataire-serveur";
import { messageDeLaBasePourLocataire } from "@/lib/interlocuteur-locataire";
import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";
import { detecterMimeReel, pdfComplet, EXTENSIONS } from "@/lib/file-type";
import { valeursDuFormulaire } from "@/lib/formulaires";
// 25/09 : le locataire est prévenu par e-mail de la demande et de la relance.
import { notifierPieceDemandee } from "@/lib/notifications";
import { REFERENCE_PIECES_DECRET, demandeUniqueDejaFaite, noteDecret, pieceDecret } from "@/lib/pieces-decret-2015";
// Reprise T3R-2 : la place de la personne se lit dans un module commun à l'action et à la fiche de la personne.
import { lireRegimePieces } from "@/lib/pieces-regime";

export type EtatPieceDemandee = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
  valeurs?: Record<string, string>;
};

// Le mot juste sur ce qui n'est pas parti — l'écran le montre, l'action le dit.
function avertissementEnvoi(motif: string | undefined): string {
  return motif === "sans_adresse"
    ? "Le locataire n'a pas d'adresse e-mail : il ne verra la demande qu'en ouvrant son espace."
    : "L'e-mail au locataire n'a pas pu partir ; la demande reste visible dans son espace.";
}

// Pièces réclamées au locataire (RM-0b.2.5) : le gérant demande, le locataire
// dépose depuis son espace, la demande se solde toute seule.

export async function demanderPieceLocataire(
  orgId: string,
  personId: string,
  _etat: EtatPieceDemandee,
  formData: FormData
): Promise<EtatPieceDemandee> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const valeurs = valeursDuFormulaire(formData);
  let libelle = String(formData.get("libelle") ?? "").trim();
  let type = String(formData.get("type") ?? "justificatif");
  let note = String(formData.get("note") ?? "").trim();

  const { data: personne, error: erreurPersonne } = await supabase.from("persons")
    .select("id, account_id").eq("id", personId).eq("organization_id", orgId).is("archived_at", null).maybeSingle();
  if (erreurPersonne || !personne) return { erreur: "Cette fiche est introuvable ou inaccessible.", valeurs };

  // Lot T3 (R19-A1) : avant la signature du bail, et pour une caution, la pièce se choisit dans les listes du décret du
  // 5 novembre 2015 (annexes I et II) ; le nom libre est refusé ICI, côté serveur, même pour une requête directe. Après
  // la signature, la demande faite au locataire reste libre, comme avant. Les demandes déjà enregistrées ne sont pas touchées.
  const regime = await lireRegimePieces(supabase, orgId, personId);
  if ("erreur" in regime) return { erreur: regime.erreur, valeurs };
  if (!regime.libre) {
    const piece = pieceDecret(String(formData.get("piece_decret") ?? ""), regime.annexes);
    if (!piece)
      return {
        erreur: `Choisissez la pièce dans la liste : avant la signature du bail, et pour une caution, seules les pièces de la liste du ${REFERENCE_PIECES_DECRET} peuvent être exigées.`,
        valeurs,
      };
    if (piece.unique) {
      // « Une pièce », « une seule pièce » : pas de seconde demande de la même rubrique tant que la première est en cours.
      // Reprise T3R-6 : une pièce déjà reçue (identité périmée, illisible) peut être redemandée.
      const { data: existantes, error: erreurExistantes } = await supabase.from("pieces_demandees")
        .select("libelle, satisfaite_le").eq("organization_id", orgId).eq("person_id", personId);
      if (erreurExistantes) return { erreur: "Impossible de vérifier les demandes déjà faites. Réessayez.", valeurs };
      const enCours = ((existantes ?? []) as { libelle: string; satisfaite_le?: string | null }[]).filter((d) => !d.satisfaite_le).map((d) => String(d.libelle));
      if (demandeUniqueDejaFaite(piece, enCours))
        return {
          erreur: `Cette demande est déjà faite pour cette personne et toujours en cours (« ${piece.libelle} ») : le décret ne permet d’exiger qu’une pièce de cette rubrique. Annulez la demande en cours pour la refaire.`,
          valeurs,
        };
    }
    libelle = piece.libelle;
    type = piece.type;
    note = noteDecret(piece) ?? "";
  }
  if (!libelle) return { erreur: "Nommez la pièce demandée (ex. : avis d'imposition, justificatif de domicile).", valeurs };
  if (libelle.length > 120) return { erreur: "Le nom de la pièce doit tenir sur 120 caractères.", valeurs };
  if (!["piece_identite", "justificatif", "attestation_assurance"].includes(type))
    return { erreur: "Type de pièce invalide.", valeurs };

  const { data: demande, error } = await supabase
    .from("pieces_demandees")
    .insert({
      organization_id: orgId,
      person_id: personId,
      type,
      libelle,
      note: note || null,
      demandee_par: user.id,
    })
    .select("id")
    .single();
  if (error) return { erreur: sansJargon(error.message), valeurs };
  if (!personne.account_id) {
    revalidatePath(`/agence/${orgId}/personnes/${personId}`);
    return { succes: "Demande préparée — invitez la personne à son espace pour qu’elle puisse y répondre." };
  }
  const envoi = await notifierPieceDemandee(supabase, orgId, personId, { id: demande.id, libelle, note: note || null }, false);
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return {
    succes: envoi.envoyee
      ? "Demande envoyée — le locataire est prévenu par e-mail et la voit dans son espace."
      : "Demande envoyée — elle s'affiche dans l'espace du locataire.",
    avertissement: envoi.envoyee ? undefined : avertissementEnvoi(envoi.motif),
  };
}

export async function relancerPieceDemandee(
  orgId: string,
  personId: string,
  demandeId: string
): Promise<EtatPieceDemandee> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { data: personne } = await supabase.from("persons").select("account_id")
    .eq("id", personId).eq("organization_id", orgId).is("archived_at", null).maybeSingle();
  if (!personne?.account_id) return { erreur: "Invitez d’abord la personne à son espace pour qu’elle puisse répondre." };
  // 25/09 : « Relancer » envoie réellement — la date seule ne relançait personne.
  const { data: demande, error } = await supabase
    .from("pieces_demandees")
    .update({ relancee_le: new Date().toISOString() })
    .eq("id", demandeId)
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .is("satisfaite_le", null)
    .select("id, libelle, note")
    .maybeSingle();
  if (error) return { erreur: sansJargon(error.message) };
  if (!demande) return { erreur: "Cette demande est introuvable ou déjà satisfaite." };
  const envoi = await notifierPieceDemandee(supabase, orgId, personId, demande, true);
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return {
    succes: envoi.envoyee
      ? "Relance envoyée par e-mail — le locataire la voit aussi sur sa demande."
      : "Relance notée — le locataire la voit sur sa demande.",
    avertissement: envoi.envoyee ? undefined : avertissementEnvoi(envoi.motif),
  };
}

export async function annulerPieceDemandee(
  orgId: string,
  personId: string,
  demandeId: string
): Promise<EtatPieceDemandee> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("pieces_demandees")
    .delete()
    .eq("id", demandeId)
    .eq("organization_id", orgId)
    .is("satisfaite_le", null);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Demande annulée." };
}

// Dépôt par le locataire — mêmes contrôles de fichier que l'attestation
// (contenu vérifié, PDF complet, 4 Mo max), puis RPC definer qui crée le
// document, solde la demande et alerte l'agence.
export async function deposerMaPiece(
  orgId: string,
  demandeId: string,
  _etat: EtatPieceDemandee,
  formData: FormData
): Promise<EtatPieceDemandee> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: "Vous n'êtes pas connecté." };

  const erreurDepotDirect = await resoudreDepotsFormulaire(supabase, formData);

  if (erreurDepotDirect) return { erreur: erreurDepotDirect };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0)
    return { erreur: "Choisissez le fichier à déposer — une photo lisible suffit." };
  if (fichier.size > limiteFichierDepose(fichier))
    return { erreur: `Fichier trop volumineux (${limiteFichierDepose(fichier) / 1024 / 1024} Mo maximum).` };

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

  const { error } = await supabase.rpc("deposer_ma_piece", {
    p_org: orgId,
    p_demande: demandeId,
    p_storage_path: chemin,
    p_mime: mime,
    p_taille: fichier.size,
    p_empreinte: empreinte,
  });
  // Lot 47 (reprise) : le refus de la base (« … dans cette agence ») est rendu dans les mots de l'espace.
  if (error) return { erreur: messageDeLaBasePourLocataire(sansJargon(error.message), await lireInterlocuteurLocataire(supabase, orgId)) };

  revalidatePath(`/locataire/${orgId}/documents`);
  revalidatePath(`/locataire/${orgId}`);
  // Lot 47 : « votre gestionnaire » seulement dans un espace d'agence ; chez un propriétaire, « votre bailleur ».
  return { succes: `Pièce déposée. Merci — votre ${await lireInterlocuteurLocataire(supabase, orgId)} est notifié.` };
}
