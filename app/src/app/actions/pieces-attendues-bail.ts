"use server";
import { jourValide } from "@/lib/presentation-document";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { resoudreDepotsFormulaire } from "@/lib/depot-direct";
import { deposerFichierGed } from "@/lib/ged-depot";
import { aujourdhuiParis } from "@/lib/ged";
import { estUuid } from "@/lib/identifiants";
import { premier } from "@/lib/postgrest";
import { naturePieceAttendue, statutPieceAttendue, type NaturePieceAttendue } from "@/lib/pieces-attendues-bail";

export type EtatPieceAttendueBail = {
  erreur?: string;
  succes?: string;
  documentId?: string;
  statut?: ReturnType<typeof statutPieceAttendue>;
  valeurs?: Record<string, string>;
};

export async function enregistrerPieceAttendueBail(orgId: string, bailId: string, nature: NaturePieceAttendue, _etat: EtatPieceAttendueBail, form: FormData): Promise<EtatPieceAttendueBail> {
  const documentChoisi = String(form.get("document_id") ?? "").trim();
  const documentPrecedent = String(form.get("document_precedent_id") ?? "").trim();
  const expiration = String(form.get("expire_le") ?? "").trim();
  const valeurs = { document_id: documentChoisi, expire_le: expiration };
  const erreur = (message: string): EtatPieceAttendueBail => ({ erreur: message, valeurs });
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return erreur("Accès refusé.");
  if (![orgId, bailId].every(estUuid) || !naturePieceAttendue(nature)) return erreur("Cette pièce attendue est introuvable.");
  if (documentChoisi && !estUuid(documentChoisi)) return erreur("Choisissez un document de la liste.");
  if (documentPrecedent && !estUuid(documentPrecedent)) return erreur("Rechargez le dossier pour vérifier l’assurance actuellement enregistrée.");
  if (expiration) {
    if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(expiration) || !jourValide(expiration)) {
      return erreur("Indiquez une date d’échéance valide, ou laissez-la vide si elle est inconnue.");
    }
  }
  const { data: bail, error: lecture } = await supabase.from("baux")
    .select("id,etat,lot_id,lot:lots!baux_lot_meme_org_fk(bien_id)")
    .eq("id", bailId).eq("organization_id", orgId).maybeSingle();
  const bienId = premier(bail?.lot)?.bien_id;
  if (lecture || bail?.etat !== "brouillon" || !bail.lot_id || !bienId) return erreur("Le bail doit être un brouillon accessible avec son logement.");
  const portefeuille = await supabase.rpc("lot_hors_portefeuille", { p_org: orgId, p_lot: bail.lot_id });
  if (portefeuille.error || portefeuille.data !== false) return erreur("Ce logement n’est pas accessible dans votre portefeuille.");
  let lecturePiece = supabase.from("pieces_attendues_bail").select("document_id")
    .eq("organization_id", orgId).eq("lot_id", bail.lot_id).eq("nature", nature);
  lecturePiece = nature === "assurance_proprietaire" ? lecturePiece.is("bail_id", null) : lecturePiece.eq("bail_id", bailId);
  const { data: pieceActuelle, error: erreurPiece } = await lecturePiece.maybeSingle();
  if (erreurPiece) return erreur("L’assurance actuelle n’a pas pu être vérifiée. Réessayez.");
  if ((pieceActuelle?.document_id ?? "") !== documentPrecedent) return erreur("Cette assurance a changé depuis l’ouverture du formulaire. Rechargez le dossier.");

  const revalider = () => {
    for (const racine of ["/agence", "/espace"]) {
      revalidatePath(`${racine}/${orgId}/baux/${bailId}`);
      revalidatePath(`${racine}/${orgId}/documents`);
      revalidatePath(`${racine}/${orgId}/parc/${bienId}/lots/${bail.lot_id}`);
    }
  };
  const erreurDepot = await resoudreDepotsFormulaire(supabase, form);
  if (erreurDepot) return erreur(erreurDepot);
  const fichier = form.get("fichier");
  const aFichier = fichier instanceof File && fichier.size > 0;
  if (Boolean(documentChoisi) === aFichier) return erreur("Choisissez un document existant ou déposez un fichier, un seul à la fois.");

  let documentId = documentChoisi;
  let expireLe: string | null = expiration || null;
  let avertissement: string | undefined;
  if (documentChoisi) {
    const { data: document, error: lectureDocument } = await supabase.from("documents")
      .select("id,purged_at,expire_le").eq("id", documentChoisi).eq("organization_id", orgId).maybeSingle();
    if (lectureDocument || !document || document.purged_at) return erreur("Ce document est inaccessible ou son fichier a été purgé. Choisissez une pièce disponible.");
    const remplacement = await supabase.from("documents").select("id").eq("organization_id", orgId)
      .eq("remplace_id", documentChoisi).limit(1).maybeSingle();
    if (remplacement.error) return erreur("La version de ce document n’a pas pu être vérifiée. Réessayez.");
    if (remplacement.data) return erreur("Cette attestation a été remplacée. Choisissez sa nouvelle version.");
    if (expiration && document.expire_le !== expiration) return erreur("L’échéance du document existant est conservée. Déposez une nouvelle attestation pour en indiquer une autre.");
    expireLe = document.expire_le;
  } else {
    const titre = nature === "assurance_proprietaire" ? "Attestation d’assurance du propriétaire" : "Attestation d’assurance du locataire";
    const depot = await deposerFichierGed(supabase, user, orgId, fichier as File, "attestation_assurance", titre, { ...(expiration ? { expireLe: expiration } : {}) });
    if (depot.erreur || !depot.documentId) return erreur(depot.erreur ?? "Le fichier n’a pas pu être enregistré.");
    documentId = depot.documentId;
    avertissement = depot.avertissement;
  }

  // Une transaction sous la session courante recontrôle le brouillon, attache
  // la pièce et remplace uniquement l'affectation vue à l'ouverture du formulaire.
  const { data: confirmation, error: affectation } = await supabase.rpc("affecter_piece_attendue_bail", {
    p_org: orgId, p_bail: bailId, p_nature: nature, p_document: documentId,
    p_document_precedent: documentPrecedent || null,
  });
  revalider();
  if (affectation || confirmation !== documentId) {
    if (affectation?.code === "40001") return { ...erreur("Cette assurance a changé pendant l’enregistrement. Le document est conservé dans Documents ; rechargez le dossier avant de le sélectionner."), documentId };
    return { ...erreur("Le document est conservé, mais son classement comme assurance n’a pas été confirmé. Rechargez le dossier puis réessayez avec la pièce existante."), documentId };
  }
  const statut = statutPieceAttendue(expireLe, aujourdhuiParis());
  return {
    documentId, statut,
    succes: ["Attestation enregistrée.", statut === "expiree" ? "Son échéance est passée : une attestation à jour reste à fournir." : "La couverture reste à vérifier.", avertissement].filter(Boolean).join(" "),
  };
}
