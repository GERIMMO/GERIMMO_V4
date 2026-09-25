"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant } from "@/lib/ged-acces";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { detecterMimeReel, EXTENSIONS } from "@/lib/file-type";
import {
  annulerDemandeYoutrust,
  configurationYoutrust,
  creerDemandeYoutrust,
  ErreurYoutrust,
} from "@/lib/youtrust";
// 25/09 : le signataire est prévenu par e-mail dans le parcours manuel.
import { notifierSignatureDemandee } from "@/lib/notifications";

export type EtatSignature = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
};

// Signature préenregistrée de l'organisation (chantier documentaire 08/09) :
// une image (PNG/JPEG, fond clair) apposée sur les documents émis SEULE —
// quittances, reçus, courriers. Jamais sur un bail ni un EDL : là, la
// signature reste un acte des parties. Réservé au responsable. L'enregistrement
// passe par une RPC (audit 09/09) : elle met l'ancien fichier en file de purge
// — une signature manuscrite est une donnée personnelle, rien ne traîne.
export async function enregistrerSignature(
  orgId: string,
  _etat: EtatSignature,
  formData: FormData
): Promise<EtatSignature> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation." };
  }
  const { data: responsableReel, error: erreurDroit } = await supabase.rpc("has_org_role", {
    org: orgId, roles: ROLES_RESPONSABLES,
  });
  if (erreurDroit || !responsableReel) return { erreur: "La signature est réservée au responsable de l’organisation, hors accès de supervision." };
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Choisissez l'image de votre signature (PNG ou JPEG)." };
  }
  if (fichier.size > 1_000_000) {
    return { erreur: "Image trop lourde (1 Mo maximum) — une signature scannée suffit." };
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMimeReel(octets);
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return { erreur: "Format refusé : PNG ou JPEG uniquement (contenu vérifié)." };
  }

  const chemin = `${orgId}/signature-${randomUUID()}.${EXTENSIONS[mime]}`;
  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (erreurUpload) return { erreur: sansJargon(erreurUpload.message) };

  const { error } = await supabase.rpc("definir_signature_organisation", {
    p_org: orgId,
    p_path: chemin,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/profil`);
  return {
    succes:
      "Signature enregistrée — elle s'apposera désormais sur vos quittances, reçus et courriers générés.",
  };
}

export async function retirerSignature(orgId: string): Promise<EtatSignature> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation." };
  }
  const { data: responsableReel, error: erreurDroit } = await supabase.rpc("has_org_role", {
    org: orgId, roles: ROLES_RESPONSABLES,
  });
  if (erreurDroit || !responsableReel) return { erreur: "La signature est réservée au responsable de l’organisation, hors accès de supervision." };
  const { error } = await supabase.rpc("definir_signature_organisation", {
    p_org: orgId,
    p_path: null,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/profil`);
  return { succes: "Signature retirée — la zone restera vierge sur les prochains documents." };
}

// « Envoyer pour signature » : le document généré devient visible dans
// l'espace du signataire (carte « À signer » de Mes documents) — il le
// télécharge, le signe et dépose le PDF signé ; le retour vous alerte.
// La RPC porte les gardes (audit 09/09) : types signables seulement (bail,
// courrier, quittance — jamais un EDL, RM-13.1.6), signataire rattaché AU
// document, espace locataire actif obligatoire (sinon la demande partait
// dans le vide), une seule demande en attente par document et personne.
// Signature en ligne (Yousign) : chantier S10.
export async function envoyerPourSignature(
  orgId: string,
  documentId: string,
  personId: string
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { data: demandeId, error } = await supabase.rpc("envoyer_pour_signature", {
    p_org: orgId,
    p_document: documentId,
    p_person: personId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  // La sandbox sert exclusivement aux PDF fictifs du développement. Tant que
  // l'abonnement API de production n'est pas posé, le parcours manuel éprouvé
  // reste actif et aucun document client ne quitte Gerimmo.
  const youtrust = configurationYoutrust();
  if (youtrust?.environnement === "production" && demandeId) {
    let demandeExterne: string | null = null;
    try {
      const [{ data: document, error: erreurDocument }, { data: personne, error: erreurPersonne }] =
        await Promise.all([
          supabase.from("documents").select("titre,storage_path,mime_type").eq("id", documentId).eq("organization_id", orgId).single(),
          supabase.from("persons").select("nom,prenom,email,telephone").eq("id", personId).eq("organization_id", orgId).single(),
        ]);
      if (erreurDocument || !document?.storage_path || document.mime_type !== "application/pdf") {
        throw new Error("La signature électronique exige un PDF disponible.");
      }
      if (erreurPersonne || !personne?.email) {
        throw new Error("Ajoutez l'adresse email du signataire avant l'envoi.");
      }
      const { data: fichier, error: erreurFichier } = await supabase.storage
        .from("documents")
        .download(document.storage_path);
      if (erreurFichier || !fichier) throw new Error("Le PDF à signer est indisponible.");

      const creee = await creerDemandeYoutrust({
        config: youtrust,
        pdf: new Uint8Array(await fichier.arrayBuffer()),
        nomFichier: `${(document.titre ?? "document").replace(/[^a-zA-Z0-9À-ÿ _-]/g, "").slice(0, 80) || "document"}.pdf`,
        titre: document.titre ?? "Document Gerimmo",
        referenceExterne: demandeId,
        signataire: {
          prenom: personne.prenom ?? "",
          nom: personne.nom,
          email: personne.email,
          telephone: telephoneInternational(personne.telephone),
        },
      });
      demandeExterne = creee.demandeId;
      const { error: erreurRattachement } = await supabase.rpc("rattacher_signature_youtrust", {
        p_org: orgId,
        p_demande: demandeId,
        p_request: creee.demandeId,
        p_document: creee.documentId,
        p_signer: creee.signataireId,
        p_statut: creee.statut,
      });
      if (erreurRattachement) throw new Error(erreurRattachement.message);
      revalidatePath(`/agence/${orgId}/documents`);
      return { succes: "Invitation de signature électronique envoyée. Son avancement apparaîtra ici." };
    } catch (e) {
      if (demandeExterne) await annulerDemandeYoutrust(youtrust, demandeExterne).catch(() => undefined);
      await supabase.rpc("annuler_demande_signature", { p_org: orgId, p_demande: demandeId });
      const detail = e instanceof ErreurYoutrust
        ? "Youtrust a refusé l'envoi. Vérifiez les coordonnées du signataire."
        : e instanceof Error ? e.message : "Envoi électronique impossible.";
      return { erreur: detail };
    }
  }

  // Parcours manuel : jusqu'ici, seul Youtrust en production écrivait au
  // signataire. Le locataire l'apprend désormais par e-mail, avec le lien.
  const envoi = demandeId
    ? await notifierSignatureDemandee(supabase, orgId, personId, documentId, String(demandeId))
    : { envoyee: false, motif: "introuvable" as const };
  revalidatePath(`/agence/${orgId}/documents`);
  return {
    succes: envoi.envoyee
      ? "Envoyé pour signature — le signataire est prévenu par e-mail ; le document apparaît dans « À signer » de son espace et vous serez alerté au retour du signé."
      : "Envoyé pour signature — le document apparaît dans « À signer » de son espace ; vous serez alerté au retour du signé.",
    avertissement: envoi.envoyee
      ? undefined
      : envoi.motif === "sans_adresse"
        ? "Le signataire n'a pas d'adresse e-mail : il ne verra la demande qu'en ouvrant son espace."
        : "L'e-mail au signataire n'a pas pu partir ; la demande reste visible dans son espace.",
  };
}

function telephoneInternational(telephone: string | null): string | null {
  if (!telephone) return null;
  const brut = telephone.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(brut)) return brut;
  const chiffres = brut.replace(/\D/g, "");
  if (/^0\d{9}$/.test(chiffres)) return `+33${chiffres.slice(1)}`;
  return null;
}

// Annuler une demande en attente (mauvais destinataire, signature obtenue
// autrement) — le document disparaît de son « À signer ».
export async function annulerDemandeSignature(
  orgId: string,
  demandeId: string
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("annuler_demande_signature", {
    p_org: orgId,
    p_demande: demandeId,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/documents`);
  return { succes: "Demande annulée." };
}

// Mise à disposition (RM-12 : un geste, jamais un effet de bord) : rend une
// quittance ou un courrier généré visible dans « Mes documents » du locataire
// rattaché — ou l'en retire.
export async function partagerDocument(
  orgId: string,
  documentId: string,
  partager: boolean
): Promise<EtatSignature> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };
  const { error } = await supabase.rpc("partager_document_locataire", {
    p_org: orgId,
    p_doc: documentId,
    p_partager: partager,
  });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/documents`);
  return {
    succes: partager
      ? "Mis à disposition — le locataire le voit dans « Mes documents »."
      : "Retiré de l'espace du locataire.",
  };
}
