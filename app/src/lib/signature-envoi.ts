import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { configurationSignatureBail, type CircuitBail, type SignataireBail } from "@/lib/signature-bail";
import { activerDemandeSignature, preparerCircuitSignature } from "@/lib/signature-prestataire";
import { verifierAvantEffet } from "@/lib/controle-effets";
import { sansJargon } from "@/lib/erreurs";
import { assemblerSignatureDocument, selectionDuCircuit } from "@/lib/signature-document";
import { signatureEnEssai } from "@/lib/signature-essai";
import { fermetureModeleSignature } from "@/lib/signature-interrupteurs";
import { clientDeService } from "@/lib/supabase/service";
import { bailleurDesSignataires, lienConfidentialite, messageInvitationSignature } from "@/lib/message-invitation-signature";

// L'ENVOI D'UN CIRCUIT DE SIGNATURE, commun au propriétaire (action `envoyerSignatureBail`) et à la caution qui vient de
// confirmer son mobile (action publique `confirmerMobileCaution`, décision du dirigeant du 23/10).
//
// Deux temps :
//  1. `controlerEnvoi` : tout ce qui se vérifie sans effet (réglages, environnement, dossier inchangé, PDF et annexes
//     identiques à la préparation). Une erreur ici n'a rien changé.
//  2. `envoyerApresControle` : confirmation sur place de l'état des lieux, réservation, création et activation chez le
//     prestataire. Une panne après la réservation laisse le circuit « à vérifier », jamais une seconde demande.
// `db` est le client de la session du propriétaire, ou le client de service quand c'est la caution qui déclenche
// l'envoi : toutes les lectures y sont bornées à l'organisation du circuit.

export const REFUS_CONFIRMATION_EDL =
  "Confirmez que l’état des lieux a été établi contradictoirement, sur place, et indiquez la date de la visite avant l’envoi en signature.";
export const REFUS_MOBILE_CAUTION_NON_CONFIRME =
  "La caution doit confirmer elle-même son numéro de mobile avant l’envoi en signature.";

/** Le garant d'un acte de cautionnement a-t-il confirmé lui-même son numéro (lien à usage unique) ? */
export function telephoneGarantConfirme(signataires: SignataireBail[]): boolean {
  const garants = signataires.filter((s) => s.qualite === "Garant");
  return garants.length === 1 && Boolean(garants[0].telephoneConfirmeLe) && /^\+[1-9]\d{7,14}$/.test(garants[0].telephone);
}

export type ControleEnvoi = {
  config: NonNullable<ReturnType<typeof configurationSignatureBail>>;
  titre: string;
  contenu: Uint8Array;
  annexes: { pdf: Uint8Array; nomFichier: string }[];
};

/** Vérifications sans effet, dans l'ordre historique de `envoyerSignatureBail`. Lève une erreur lisible. */
export async function controlerEnvoi(p: { db: SupabaseClient; org: string; bail: string; circuit: CircuitBail }): Promise<ControleEnvoi> {
  const { db, org, bail, circuit } = p;
  // Fermeture ciblée d'un modèle : refus avant toute lecture du dossier, toute réservation et tout appel au prestataire.
  const fermeture = fermetureModeleSignature(circuit.modele);
  if (fermeture) throw new Error(fermeture);
  const config = configurationSignatureBail(process.env, circuit.prestataire, org);
  if (circuit.modele && circuit.modele !== "bail" && circuit.prestataire !== "zoho") throw new Error("Ce type de document doit être signé avec Zoho. Préparez un nouveau circuit après la connexion de Zoho.");
  if (circuit.modele === "devis_artisan" && process.env.ZOHO_SIGN_DEVIS_ACTIF !== "true" && !signatureEnEssai(org)) throw new Error("La signature des devis sera disponible après les essais du circuit.");
  if (circuit.modele && circuit.modele !== "bail" && process.env.ZOHO_SIGN_DOCUMENTS_ACTIF !== "true" && !signatureEnEssai(org)) throw new Error("L’envoi des nouveaux types de documents n’est pas encore activé.");
  if (!config) throw new Error("La signature électronique n’est pas encore activée. Le PDF reste disponible et aucun envoi n’a été effectué.");
  if (circuit.environnement !== config.environnement) throw new Error("L’environnement de signature a changé. Annulez cette préparation puis préparez un nouveau PDF.");
  if (new Date(circuit.expire_le).getTime() <= Date.now() + 86_400_000) throw new Error(circuit.modele === "devis_artisan" ? "La validité du devis est trop courte pour ouvrir la signature. Demandez à l’artisan une offre valable plus longtemps." : "Cette préparation est trop ancienne. Actualisez le PDF avant de l’envoyer.");
  if (config.environnement === "sandbox" && !(process.env.ZOHO_SIGN_ORGS_TEST ?? "").split(",").map((x) => x.trim()).includes(org)) throw new Error("Cet espace n’est pas autorisé pour les essais de signature.");
  const service = clientDeService();
  if (!service) throw new Error("Le suivi sécurisé est indisponible.");
  const preparation = await assemblerSignatureDocument(db, org, selectionDuCircuit(circuit));
  if (preparation.manquants.length || preparation.empreinte !== circuit.empreinte) throw new Error("Le dossier a changé depuis la préparation. Préparez et relisez un nouveau PDF.");
  if (!circuit.modele || circuit.modele === "bail") {
    const controle = await db.rpc("controler_mise_en_location", { p_bail: bail });
    if (controle.error) throw new Error(sansJargon(controle.error.message));
  }
  const { data: doc, error: edoc } = await db.from("documents").select("storage_path,empreinte,mime_type").eq("id", circuit.document_id).eq("organization_id", org).single();
  if (edoc || !doc || doc.mime_type !== "application/pdf") throw new Error("Le PDF à signer n’est pas disponible.");
  const fichier = await db.storage.from("documents").download(doc.storage_path);
  if (fichier.error || !fichier.data) throw new Error("Le PDF n’a pas pu être chargé.");
  const contenu = new Uint8Array(await fichier.data.arrayBuffer());
  if (createHash("sha256").update(contenu).digest("hex") !== circuit.pdf_hash) throw new Error("Le fichier ne correspond plus au PDF préparé. Préparez une nouvelle version avant l’envoi.");
  const annexes: { pdf: Uint8Array; nomFichier: string }[] = [];
  let total = contenu.byteLength;
  for (const a of circuit.annexes) {
    const piece = await db.storage.from("documents").download(a.storage_path);
    if (piece.error || !piece.data) throw new Error("Une annexe n’a pas pu être chargée.");
    total += piece.data.size;
    if (total > 50_000_000) throw new Error("Les annexes dépassent 50 Mo. Réduisez la taille des PDF avant l’envoi.");
    const octets = new Uint8Array(await piece.data.arrayBuffer());
    if (createHash("sha256").update(octets).digest("hex") !== a.empreinte) throw new Error("Une annexe a changé. Préparez un nouveau dossier avant l’envoi.");
    annexes.push({ pdf: octets, nomFichier: `annexe-${annexes.length + 1}.pdf` });
  }
  return { config, titre: preparation.titreGed, contenu, annexes };
}

/** Le message de l'invitation du prestataire pour ce circuit (R53 ; rappel de l'état des lieux d'entrée). */
export async function messageInvitationCircuit(db: SupabaseClient, org: string, circuit: CircuitBail): Promise<string> {
  let edlEntree = false;
  if (circuit.modele === "edl") {
    const r = await db.from("etats_des_lieux").select("type").eq("id", circuit.cible_id ?? "").eq("organization_id", org).single();
    if (r.error || !r.data) throw new Error("État des lieux inaccessible.");
    edlEntree = r.data.type === "entree";
  }
  return messageInvitationSignature({ modele: circuit.modele, bailleur: bailleurDesSignataires(circuit.signataires), lienConfidentialite: lienConfidentialite(), edlEntree });
}

/**
 * Où l'envoi s'est arrêté (relecture du 24/10), pour dire juste à la caution ce qui se passe ensuite :
 *  · `avant_envoi` : rien n'a changé, le circuit reste prêt (le numéro confirmé y reste) ;
 *  · `abandonne` : la réservation a été défaite, le circuit est annulé (une nouvelle préparation, donc un nouveau lien) ;
 *  · `a_verifier` : le prestataire a peut-être reçu la demande ; le circuit est à vérifier.
 */
export type EtapeEchecEnvoi = "avant_envoi" | "abandonne" | "a_verifier";
export type ResultatEnvoi = { envoye: true } | { erreur: string; etape: EtapeEchecEnvoi };

/**
 * Réservation, création et activation chez le prestataire. `visiteLe` (AAAA-MM-JJ) : la date de la visite saisie par
 * le bailleur pour un état des lieux, confirmée en base juste avant la réservation.
 */
export async function envoyerApresControle(p: { db: SupabaseClient; org: string; circuit: CircuitBail; acteur: string; controle: ControleEnvoi; visiteLe?: string }): Promise<ResultatEnvoi> {
  const { db, org, circuit, acteur, controle } = p;
  const id = circuit.id;
  let reserve = false;
  let abandonne = false;
  let appelPrestataire = false;
  try {
    const service = clientDeService();
    if (!service) throw new Error("Le suivi sécurisé est indisponible.");
    // Décision du 23/10 : le numéro saisi par le bailleur ne sert jamais à un acte de cautionnement (garde aussi en base).
    if (circuit.modele === "cautionnement" && !telephoneGarantConfirme(circuit.signataires)) throw new Error(REFUS_MOBILE_CAUTION_NON_CONFIRME);
    if (circuit.modele === "edl") {
      if (!p.visiteLe || !/^\d{4}-\d{2}-\d{2}$/.test(p.visiteLe)) throw new Error(REFUS_CONFIRMATION_EDL);
      const confirmation = await service.rpc("confirmer_edl_sur_place", { p_circuit: id, p_actor: acteur, p_visite_le: p.visiteLe });
      if (confirmation.error) throw new Error(sansJargon(confirmation.error.message));
    }
    const message = await messageInvitationCircuit(db, org, circuit);
    await verifierAvantEffet(service, "signatures");
    const reservation = await service.rpc("reserver_envoi_signature_bail", { p_circuit: id, p_actor: acteur });
    if (reservation.error) throw new Error(sansJargon(reservation.error.message));
    reserve = true;
    // Relecture du 24/10 : les signataires envoyés au prestataire sont ceux de la ligne réservée, que la garde en base
    // vient de valider (numéro confirmé par la caution, confirmation sur place…), et non ceux lus avant la réservation.
    const ligne = reservation.data as Partial<CircuitBail> | null;
    if (!ligne || typeof ligne !== "object" || ligne.id !== id || !Array.isArray(ligne.signataires) || ligne.signataires.length !== circuit.signataires.length) {
      throw new Error("La réservation de l’envoi n’a pas pu être relue. Aucun appel au prestataire n’a été effectué.");
    }
    const signataires = ligne.signataires as SignataireBail[];
    // Après la réservation, les relevés EDL sont verrouillés en base. Une
    // écriture concurrente juste avant ce verrou doit aussi invalider le PDF.
    if (circuit.modele === "edl" || circuit.modele === "devis_artisan") {
      const verrouille = await assemblerSignatureDocument(db, org, selectionDuCircuit(circuit));
      if (verrouille.manquants.length || verrouille.empreinte !== circuit.empreinte) {
        throw new Error("Le relevé a changé. Aucun appel au prestataire n’a été effectué. Préparez un nouveau PDF.");
      }
    }
    const { config } = controle;
    const expiration = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(circuit.expire_le));
    const cree = await preparerCircuitSignature({ config, pdf: controle.contenu, nomFichier: "document-gerimmo.pdf",
      titre: signatureEnEssai(org) ? "GERIMMO — ESSAI DE SIGNATURE SANS ENGAGEMENT" : config.environnement === "sandbox" ? "TEST FICTIF — Document Gerimmo" : controle.titre, referenceExterne: id, expiration,
      signataires, annexes: controle.annexes, message, creationCommencee: () => { appelPrestataire = true; }, demandeCreee: async (externalId) => {
        const attache = await service.from("bail_signature_circuits").update({ external_request_id: externalId }).eq("id", id).eq("etat", "preparation").select("id").single();
        if (attache.error) throw new Error("Le suivi de la demande doit être vérifié avant toute activation.");
      } });
    const attache = await service.from("bail_signature_circuits").update({ external_document_id: cree.documentId,
      signataires: signataires.map((s, i) => ({ ...s, externalId: cree.signataireIds[i], statut: "initiated" })) }).eq("id", id).eq("etat", "preparation").select("id").single();
    if (attache.error) throw new Error("Les signataires n’ont pas pu être rattachés. Aucune activation n’a été demandée.");
    await verifierAvantEffet(service, "signatures");
    await activerDemandeSignature(config, cree.demandeId, { ...circuit, external_document_id: cree.documentId, signataires: signataires.map((s, i) => ({ ...s, externalId: cree.signataireIds[i] })) }, message);
    const miseAJour = await service.from("bail_signature_circuits").update({ etat: "en_cours", envoye_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("etat", "preparation");
    if (miseAJour.error) throw new Error("L’envoi doit être rapproché du prestataire.");
    return { envoye: true };
  } catch (e) {
    if (reserve && !appelPrestataire) {
      // La réservation a réussi, mais aucune création distante n’a commencé.
      // Une panne de relecture ne doit pas laisser un circuit impossible à annuler.
      const service = clientDeService();
      const retrait = await service?.rpc("abandonner_preparation_signature", { p_circuit: id, p_actor: acteur });
      if (retrait?.data === true && !retrait.error) { reserve = false; abandonne = true; }
    }
    if (reserve) {
      await clientDeService()?.from("bail_signature_circuits").update({ etat: "a_verifier", erreur: "L’envoi n’a pas pu être confirmé. Actualisez le suivi avant toute nouvelle demande." }).eq("id", id).in("etat", ["preparation", "en_cours"]);
      return { erreur: "L’envoi n’a pas pu être confirmé. Actualisez le suivi ; ne créez pas une deuxième demande.", etape: "a_verifier" };
    }
    return { erreur: e instanceof Error ? sansJargon(e.message) : "Cette opération n’a pas pu être confirmée. Actualisez le suivi avant de réessayer.", etape: abandonne ? "abandonne" : "avant_envoi" };
  }
}
