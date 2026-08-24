"use server";

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sansJargon } from "@/lib/erreurs";
import { verifierGerant, verifierLocataire } from "@/lib/ged-acces";
import { detecterMimeReel, EXTENSIONS, TAILLE_MAX_OCTETS } from "@/lib/file-type";
import { categorieIncident, MOTIFS_CLOTURE, PIECES_INCIDENT } from "@/lib/incidents";
import { valeursDuFormulaire } from "@/lib/formulaires";

export type EtatIncidentAction = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
  // Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08)
  valeurs?: Record<string, string>;
};

// Une déclaration porte au plus cinq photos — assez pour montrer le désordre,
// pas assez pour transformer la GED en pellicule.
const MAX_PHOTOS = 5;

// Contrôles communs aux deux formulaires de déclaration (locataire et agence)
function lireChampsDeclaration(formData: FormData): {
  erreur?: string;
  categorie?: string;
  description?: string;
  piece?: string;
  anciennete?: string;
  urgence?: string;
} {
  const categorie = String(formData.get("categorie") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const piece = String(formData.get("piece") ?? "").trim();
  const anciennete = String(formData.get("anciennete") ?? "").trim();
  const urgence = String(formData.get("urgence") ?? "normale");

  if (!categorieIncident(categorie)) {
    return { erreur: "Choisissez la catégorie la plus proche du problème." };
  }
  if (!description) {
    return {
      erreur: "Décrivez le problème en une phrase au moins — cela évite un aller-retour avec l'agence.",
    };
  }
  if (piece && !(PIECES_INCIDENT as readonly string[]).includes(piece)) {
    return { erreur: "Pièce inconnue." };
  }
  if (!["normale", "urgente"].includes(urgence)) {
    return { erreur: "Urgence invalide." };
  }
  return { categorie, description, piece, anciennete, urgence };
}

// Dépose les photos jointes : fichier au Storage (policies existantes), fiche
// document + lien via la fonction definer. Les photos qui échouent ne bloquent
// pas l'incident déjà créé — on le dit. Trois temps (revue n°2) : validation
// et empreintes en parallèle, contrôle anti-doublon AVANT l'upload (sinon
// l'objet Storage restait orphelin quand la fiche refusait l'empreinte),
// uploads en parallèle, puis les RPC en séquence (le plafond de dix photos se
// compte en base — des appels concurrents le fausseraient).
async function joindrePhotos(
  supabase: SupabaseClient,
  orgId: string,
  incidentId: string,
  fichiers: File[]
): Promise<string | undefined> {
  const echecs: string[] = [];

  type Prete = {
    fichier: File;
    octets: Uint8Array;
    mime: "image/jpeg" | "image/png";
    empreinte: string;
  };
  const pretes = (
    await Promise.all(
      fichiers.map(async (fichier): Promise<Prete | null> => {
        if (fichier.size === 0) return null;
        if (fichier.size > TAILLE_MAX_OCTETS) {
          echecs.push(`« ${fichier.name} » dépasse 10 Mo`);
          return null;
        }
        const octets = new Uint8Array(await fichier.arrayBuffer());
        const mime = detecterMimeReel(octets);
        if (mime !== "image/jpeg" && mime !== "image/png") {
          echecs.push(`« ${fichier.name} » n'est pas une image JPEG ou PNG`);
          return null;
        }
        const empreinte = createHash("sha256").update(octets).digest("hex");
        return { fichier, octets, mime, empreinte };
      })
    )
  ).filter((p): p is Prete => p !== null);

  let deposables = pretes;
  if (pretes.length > 0) {
    const { data: doublons } = await supabase
      .from("documents")
      .select("empreinte")
      .eq("organization_id", orgId)
      .in("empreinte", pretes.map((p) => p.empreinte))
      .is("purged_at", null);
    const dejaDeposees = new Set((doublons ?? []).map((d) => d.empreinte));
    deposables = pretes.filter((p) => {
      if (dejaDeposees.has(p.empreinte)) {
        echecs.push(`« ${p.fichier.name} » est déjà dans la GED`);
        return false;
      }
      return true;
    });
  }

  const uploads = await Promise.all(
    deposables.map(async (p) => {
      const chemin = `${orgId}/${randomUUID()}.${EXTENSIONS[p.mime]}`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(chemin, p.octets, { contentType: p.mime });
      if (error) {
        echecs.push(`« ${p.fichier.name} » : ${sansJargon(error.message)}`);
        return null;
      }
      return { ...p, chemin };
    })
  );

  for (const u of uploads) {
    if (!u) continue;
    const { error } = await supabase.rpc("joindre_photo_incident", {
      p_org: orgId,
      p_incident: incidentId,
      p_storage_path: u.chemin,
      p_mime: u.mime,
      p_taille: u.fichier.size,
      p_empreinte: u.empreinte,
    });
    if (error) echecs.push(`« ${u.fichier.name} » : ${sansJargon(error.message)}`);
  }

  return echecs.length > 0 ? `Photos non jointes : ${echecs.join(" ; ")}.` : undefined;
}

function lirePhotos(formData: FormData): { erreur?: string; fichiers?: File[] } {
  const fichiers = formData
    .getAll("photos")
    .filter((p): p is File => p instanceof File && p.size > 0);
  if (fichiers.length > MAX_PHOTOS) {
    return { erreur: `${MAX_PHOTOS} photos au maximum par déclaration.` };
  }
  return { fichiers };
}

// ============================================================
// Locataire
// ============================================================

// Déclaration depuis l'espace locataire (RM-7.1 : bail actif requis, vérifié
// en base). La photo est proposée avant la description (RM-19.2.2).
export async function declarerMonIncident(
  orgId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const champs = lireChampsDeclaration(formData);
  if (champs.erreur) return { erreur: champs.erreur, valeurs };
  const photos = lirePhotos(formData);
  if (photos.erreur) return { erreur: photos.erreur, valeurs };

  const { data: incidentId, error } = await supabase.rpc("declarer_mon_incident", {
    p_org: orgId,
    p_categorie: champs.categorie,
    p_description: champs.description,
    p_piece: champs.piece || null,
    p_anciennete: champs.anciennete || null,
    p_urgence: champs.urgence,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  const avertissement = await joindrePhotos(supabase, orgId, incidentId, photos.fichiers ?? []);

  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/demandes`);
  return {
    succes: "Signalement envoyé — votre gérant est prévenu. Suivez-le depuis votre espace.",
    avertissement,
  };
}

// Contestation de l'imputation : tracée, jamais bloquante (RM-7.2.5)
export async function contesterImputation(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    return {
      erreur: "Expliquez pourquoi vous contestez — votre message est transmis à l'agence.",
      valeurs,
    };
  }

  const { error } = await supabase.rpc("contester_imputation", {
    p_org: orgId,
    p_incident: incidentId,
    p_message: message,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/demandes`);
  return { succes: "Contestation transmise à l'agence. Elle ne suspend pas la réparation." };
}

// Le problème persiste : le locataire déclarant rouvre son incident clos
// (clos → rouvert, l'agence requalifie — registre A5)
export async function signalerProblemePersiste(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) return { erreur: "Dites en quelques mots ce qui ne va toujours pas.", valeurs };

  const { error } = await supabase.rpc("rouvrir_incident", {
    p_org: orgId,
    p_incident: incidentId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/demandes`);
  return { succes: "Signalement rouvert — votre gérant est prévenu." };
}

// ============================================================
// Agence
// ============================================================

// Saisie par l'agence (appel téléphonique). Redirige vers la fiche créée.
export async function ouvrirIncident(
  orgId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const lotId = String(formData.get("lot") ?? "");
  if (!lotId) return { erreur: "Choisissez le lot concerné.", valeurs };
  const champs = lireChampsDeclaration(formData);
  if (champs.erreur) return { erreur: champs.erreur, valeurs };
  const photos = lirePhotos(formData);
  if (photos.erreur) return { erreur: photos.erreur, valeurs };

  const { data: incidentId, error } = await supabase.rpc("ouvrir_incident_agence", {
    p_org: orgId,
    p_lot: lotId,
    p_categorie: champs.categorie,
    p_description: champs.description,
    p_piece: champs.piece || null,
    p_anciennete: champs.anciennete || null,
    p_urgence: champs.urgence,
  });
  if (error) return { erreur: `Ouverture impossible : ${sansJargon(error.message)}`, valeurs };

  const avertissement = await joindrePhotos(supabase, orgId, incidentId, photos.fichiers ?? []);
  revalidatePath(`/agence/${orgId}/incidents`);
  revalidatePath(`/agence/${orgId}`);
  if (avertissement) {
    // L'incident est bien créé : on le dit, avec ce qui n'a pas suivi —
    // rediriger en avalant l'avertissement le ferait disparaître.
    return { succes: "Incident ouvert — retrouvez-le en tête de liste.", avertissement };
  }
  redirect(`/agence/${orgId}/incidents/${incidentId}`);
}

// Qualification / imputation (RM-7.2) : l'agent tranche et justifie ; le
// repère juridique de la catégorie est une information, pas une pré-sélection
// (RM-7.2.1). Sert aussi à la REqualification d'un incident rouvert.
export async function qualifierIncident(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const imputation = String(formData.get("imputation") ?? "");
  const justification = String(formData.get("justification") ?? "").trim();
  if (!["locataire", "proprietaire", "degradation_fautive"].includes(imputation)) {
    return { erreur: "Choisissez qui prend la réparation en charge.", valeurs };
  }
  if (!justification) {
    return {
      erreur: "La justification est obligatoire — elle est opposable au locataire.",
      valeurs,
    };
  }

  const { error } = await supabase.rpc("qualifier_incident", {
    p_org: orgId,
    p_incident: incidentId,
    p_imputation: imputation,
    p_justification: justification,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/incidents/${incidentId}`);
  revalidatePath(`/agence/${orgId}/incidents`);
  // La qualification solde l'alerte « à qualifier » : la page Alertes (d'où la
  // pop-up de traitement peut être ouverte, recette 22/08) doit se rafraîchir.
  revalidatePath(`/agence/${orgId}/alertes`);
  // Tableau de bord : donut incidents + KPI
  revalidatePath(`/agence/${orgId}`);
  return { succes: "Incident qualifié — le locataire voit l'imputation dès maintenant." };
}

export async function cloturerIncident(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "");
  const commentaire = String(formData.get("commentaire") ?? "").trim();
  if (!(motif in MOTIFS_CLOTURE)) return { erreur: "Choisissez le motif de clôture.", valeurs };

  const { error } = await supabase.rpc("cloturer_incident", {
    p_org: orgId,
    p_incident: incidentId,
    p_motif: motif,
    p_commentaire: commentaire || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/incidents/${incidentId}`);
  revalidatePath(`/agence/${orgId}/incidents`);
  revalidatePath(`/agence/${orgId}/alertes`);
  revalidatePath(`/agence/${orgId}`);
  return { succes: "Incident clos — les alertes liées sont soldées." };
}

export async function rouvrirIncident(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) {
    return { erreur: "Dites pourquoi vous rouvrez — le désordre réapparu, par exemple.", valeurs };
  }

  const { error } = await supabase.rpc("rouvrir_incident", {
    p_org: orgId,
    p_incident: incidentId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath(`/agence/${orgId}/incidents/${incidentId}`);
  revalidatePath(`/agence/${orgId}/incidents`);
  revalidatePath(`/agence/${orgId}/alertes`);
  revalidatePath(`/agence/${orgId}`);
  return { succes: "Incident rouvert — il repasse par la qualification." };
}

// Attribution du dossier (maquette) : le responsable attribue à n'importe qui,
// un agent se saisit d'un dossier libre — les règles fines sont en base.
export async function attribuerIncident(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const responsable = String(formData.get("responsable") ?? "");

  const { error } = await supabase.rpc("attribuer_incident", {
    p_org: orgId,
    p_incident: incidentId,
    p_responsable: responsable || null,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath(`/agence/${orgId}/incidents/${incidentId}`);
  revalidatePath(`/agence/${orgId}/incidents`);
  revalidatePath(`/agence/${orgId}`);
  return { succes: responsable ? "Dossier attribué." : "Dossier remis au pot commun." };
}

// Photos complémentaires depuis la fiche agence (constat sur place)
export async function joindrePhotoIncident(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const photos = lirePhotos(formData);
  if (photos.erreur) return { erreur: photos.erreur };
  if (!photos.fichiers || photos.fichiers.length === 0) {
    return { erreur: "Choisissez une photo (JPEG ou PNG)." };
  }

  const avertissement = await joindrePhotos(supabase, orgId, incidentId, photos.fichiers);
  if (avertissement) return { erreur: avertissement };

  revalidatePath(`/agence/${orgId}/incidents/${incidentId}`);
  return { succes: "Photo jointe à l'incident." };
}
