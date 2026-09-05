"use server";

import { sansJargon } from "@/lib/erreurs";
import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierGerant } from "@/lib/ged-acces";
import { detecterMimeReel, pdfComplet, EXTENSIONS, TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatPieceDemandee = {
  erreur?: string;
  succes?: string;
  valeurs?: Record<string, string>;
};

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
  const libelle = String(formData.get("libelle") ?? "").trim();
  const type = String(formData.get("type") ?? "justificatif");
  const note = String(formData.get("note") ?? "").trim();
  if (!libelle) return { erreur: "Nommez la pièce demandée (ex. : RIB, avis d'imposition).", valeurs };
  if (!["piece_identite", "justificatif", "attestation_assurance"].includes(type))
    return { erreur: "Type de pièce invalide.", valeurs };

  const { error } = await supabase.from("pieces_demandees").insert({
    organization_id: orgId,
    person_id: personId,
    type,
    libelle,
    note: note || null,
    demandee_par: user.id,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Demande envoyée — elle s'affiche dans l'espace du locataire." };
}

export async function relancerPieceDemandee(
  orgId: string,
  personId: string,
  demandeId: string
): Promise<EtatPieceDemandee> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase
    .from("pieces_demandees")
    .update({ relancee_le: new Date().toISOString() })
    .eq("id", demandeId)
    .eq("organization_id", orgId);
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/personnes/${personId}`);
  return { succes: "Relance notée — le locataire la voit sur sa demande." };
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
// (contenu vérifié, PDF complet, 10 Mo max), puis RPC definer qui crée le
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

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0)
    return { erreur: "Choisissez le fichier à déposer — une photo lisible suffit." };
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

  const { error } = await supabase.rpc("deposer_ma_piece", {
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
  return { succes: "Pièce déposée. Merci — votre agence est notifiée." };
}
