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
// descriptionRequise : l'agence décrit toujours (elle retranscrit un appel) ;
// le locataire peut s'en passer si une photo parle pour lui (RM-19.2.2,
// report du 21/08 levé par Tahir le 05/09).
function lireChampsDeclaration(formData: FormData, descriptionRequise = true): {
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
  if (!description && descriptionRequise) {
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
// uploads en parallèle, puis les RPC en séquence (le plafond de cinq photos se
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
  // RM-19.2.2 : deux photos et la pièce suffisent — la description devient
  // facultative… à condition qu'une photo parle à sa place.
  const champs = lireChampsDeclaration(formData, false);
  if (champs.erreur) return { erreur: champs.erreur, valeurs };
  const photos = lirePhotos(formData);
  if (photos.erreur) return { erreur: photos.erreur, valeurs };
  if (!champs.description && (photos.fichiers?.length ?? 0) === 0) {
    return {
      erreur: "Ajoutez au moins une photo, ou décrivez le problème en une phrase.",
      valeurs,
    };
  }

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
  // `avertissement` porte la seule mauvaise nouvelle de l'écran de succès : la
  // photo — la saisie que RM-19.2.2 tient pour essentielle — n'est pas partie.
  // Qui consomme ce retour doit donc LAISSER LIRE : le jumeau agence
  // (`ouvrirIncident`, plus bas) refuse pour cette raison de rediriger quand il
  // est posé. Relevé du 11/09 : l'écran locataire, lui, arme une minuterie de
  // 2,5 s sur `succes` seul et emporte l'avertissement avant qu'il ait été lu —
  // le correctif est dans le composant client, le serveur ne peut pas désarmer
  // une minuterie.
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
  // Relevé du 11/09 : on renvoyait sur /incidents/<id>, une route qui ne fait
  // plus que rediriger vers ?sel= — deux navigations serveur pour un seul clic.
  redirect(`/agence/${orgId}/incidents?sel=${incidentId}`);
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

  // Depuis la recette du 24/08 le dossier est rendu DANS la liste (?sel=) :
  // revalider /incidents/<id>, qui ne fait plus que rediriger, ne rafraîchit
  // plus rien. C'est la liste qui porte le volet.
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

  revalidatePath(`/agence/${orgId}/incidents`);
  return { succes: "Photo jointe à l'incident." };
}

// ============================================================
// Artisan, devis, intervention — le volet agence du module 8/9/10/11
//
// Toutes les règles sont défendues en base par les fonctions SECURITY DEFINER
// de la migration 20260911180000 : aucune affectation sans imputation
// (RM-7.2.7), deux artisans au maximum en parallèle sous verrou de ligne
// (RM-9.1.1), décennale revérifiée à la sélection du devis (RM-8.2.9),
// révision d'imputation impossible sans signalement d'artisan (RM-7.5.3).
// Ces actions ne recopient AUCUNE de ces règles : elles vérifient la session,
// mettent la saisie en forme, et rendent le message de la base tel quel — il
// est rédigé à hauteur d'agent et nomme la règle.
// ============================================================

// Un créneau saisi par le gérant arrive en heure de Paris (« jeudi 9 h »),
// jamais en UTC. Or Vercel tourne en UTC : `new Date("2026-09-17T09:00")`
// y donne 9 h UTC, soit 11 h à Paris en été — le locataire attendrait
// l'artisan deux heures trop tard. On mesure donc le décalage que Paris
// applique à CET instant-là, plutôt que de supposer +1 ou +2.
// Même parti pris que formaterDate/aujourdhuiParis (lib/ged.ts) : l'agence
// travaille à l'heure de Paris, pas à celle du serveur.
// Non exportée : un fichier « use server » n'a le droit d'exporter que des
// fonctions asynchrones, et celle-ci est un calcul pur. Elle reste locale.
function instantParis(saisieLocale: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(saisieLocale);
  if (!m) return null;
  const commeUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const decalage = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - instant;
  };
  // Deux passes : la première suppose le décalage de l'instant « comme UTC »,
  // la seconde le corrige si l'on a traversé une bascule d'heure d'été.
  const approche = commeUTC - decalage(commeUTC);
  const instant = commeUTC - decalage(approche);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}

// Les écrans que touche un geste d'affectation : la fiche d'incident (dans la
// liste, via ?sel=), la file d'alertes (chaînage RM-7.5.3 / réaffectation) et
// le tableau de bord. Locale, pour la même raison qu'instantParis.
function revaliderIncident(orgId: string) {
  revalidatePath(`/agence/${orgId}/incidents`);
  revalidatePath(`/agence/${orgId}/alertes`);
  revalidatePath(`/agence/${orgId}`);
}

// Ouvre la mise en concurrence sur un incident qualifié. Le MÉTIER est un
// choix explicite de l'agent : RM-8.3 dit « métier déduit de la catégorie de
// l'incident », mais aucune source ne donne la table de correspondance — et
// « humidité / infiltration » n'a pas de métier évident. On ne l'invente pas
// (voir le rapport) ; l'écran montre la catégorie, l'agent tranche.
export async function ouvrirConsultation(
  orgId: string,
  incidentId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const metier = String(formData.get("metier") ?? "");
  const nature = String(formData.get("nature") ?? "");
  const validite = Number(formData.get("validite") ?? 30);
  const devisUnique = formData.get("devis_unique") === "on";

  if (!metier) return { erreur: "Choisissez le métier recherché.", valeurs };
  if (!nature) {
    return {
      erreur:
        "Choisissez la nature des travaux — c'est elle qui décide si la décennale est exigée.",
      valeurs,
    };
  }
  if (!Number.isInteger(validite) || validite < 1 || validite > 365) {
    return { erreur: "La validité demandée se compte en jours, de 1 à 365.", valeurs };
  }

  const { error } = await supabase.rpc("ouvrir_consultation", {
    p_org: orgId,
    p_incident: incidentId,
    p_metier: metier,
    p_nature: nature,
    p_devis_unique_assume: devisUnique,
    p_validite_jours: validite,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderIncident(orgId);
  return {
    succes:
      "Mise en concurrence ouverte — sollicitez maintenant un ou deux artisans dans la liste.",
  };
}

// RM-9.1.1 : deux au maximum en parallèle, compté sous verrou en base. Si
// l'artisan n'est pas affectable, la base nomme la raison (décennale, métier,
// liste noire…) — on la rend telle quelle.
export async function solliciterArtisan(
  orgId: string,
  consultationId: string,
  artisanId: string,
  _etat: EtatIncidentAction,
  _formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("solliciter_artisan", {
    p_org: orgId,
    p_consultation: consultationId,
    p_artisan: artisanId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revaliderIncident(orgId);
  return { succes: "Demande de devis envoyée — l'artisan la voit dans son espace." };
}

// LA SECONDE APPROBATION — la sélection opérationnelle. Elle appartient à
// l'agence ou au propriétaire : ni le locataire, ni Gerimmo (module 8). À ne
// pas confondre avec la validation plateforme, qui porte sur le droit
// d'exister et n'appartient qu'au super admin.
export async function retenirDevis(
  orgId: string,
  devisId: string,
  _etat: EtatIncidentAction,
  _formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const { error } = await supabase.rpc("retenir_devis", {
    p_org: orgId,
    p_devis: devisId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revaliderIncident(orgId);
  return {
    succes:
      "Devis retenu — la mission est confiée à l'artisan, l'autre devis est écarté. Il proposera ses créneaux après acceptation.",
  };
}

// RM-10.4.1 : après six créneaux refusés, « le problème n'est plus logistique
// mais relationnel » — le gérant règle au téléphone et saisit le rendez-vous.
export async function fixerRendezVous(
  orgId: string,
  interventionId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const debut = instantParis(String(formData.get("debut") ?? ""));
  const fin = instantParis(String(formData.get("fin") ?? ""));
  const motif = String(formData.get("motif") ?? "").trim();
  if (!debut || !fin) {
    return { erreur: "Indiquez le début et la fin du rendez-vous.", valeurs };
  }
  if (fin <= debut) {
    return { erreur: "La fin du rendez-vous doit suivre son début.", valeurs };
  }

  const { error } = await supabase.rpc("fixer_creneau_arbitrage", {
    p_org: orgId,
    p_intervention: interventionId,
    p_debut: debut,
    p_fin: fin,
    p_motif: motif || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderIncident(orgId);
  return {
    succes:
      "Rendez-vous fixé — l'artisan et le locataire le voient dans leur espace, les créneaux en attente tombent.",
  };
}

// RM-7.5.3 — l'artisan a signalé une cause différente, l'agent révise AVANT
// facturation. La base refuse le geste s'il n'existe aucun signalement, et
// hors des états « en cours » et « terminé » : c'est ce qui distingue cette
// révision de la qualification, fermée dès le départ en intervention.
export async function reviserImputation(
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

  const { error } = await supabase.rpc("reviser_imputation_apres_diagnostic", {
    p_org: orgId,
    p_incident: incidentId,
    p_imputation: imputation,
    p_justification: justification,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderIncident(orgId);
  return {
    succes:
      "Imputation révisée après diagnostic — la facturation suivra cette décision, et le locataire en est informé.",
  };
}

// L'agence retire la mission : l'incident revient à « qualifié », les créneaux
// deviennent caducs. Distinct du refus de l'artisan, qui, lui, ouvre l'alerte
// de réaffectation.
export async function annulerMission(
  orgId: string,
  interventionId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) {
    return { erreur: "Dites pourquoi vous annulez — l'artisan et le locataire l'apprendront.", valeurs };
  }

  const { error } = await supabase.rpc("annuler_mission", {
    p_org: orgId,
    p_intervention: interventionId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderIncident(orgId);
  return { succes: "Mission annulée — l'incident revient en attente d'affectation." };
}

// Module 11 : le gérant note sur trois critères (50 % du score composite) —
// « le seul à voir l'ensemble ». Son commentaire reste privé à son agence
// (RM-11.2.2) : l'artisan ne lira jamais que sa moyenne.
export async function evaluerArtisan(
  orgId: string,
  interventionId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierGerant(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const notes = { qualite: 0, delai: 0, prix: 0 };
  for (const cle of ["qualite", "delai", "prix"] as const) {
    const n = Number(formData.get(cle) ?? 0);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { erreur: "Notez les trois critères, de 1 à 5.", valeurs };
    }
    notes[cle] = n;
  }

  const { error } = await supabase.rpc("evaluer_artisan_gerant", {
    p_org: orgId,
    p_intervention: interventionId,
    p_qualite: notes.qualite,
    p_delai: notes.delai,
    p_prix: notes.prix,
    p_commentaire: String(formData.get("commentaire") ?? "").trim() || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderIncident(orgId);
  revalidatePath(`/agence/${orgId}/artisans`);
  return {
    succes:
      "Artisan noté. Votre commentaire reste dans votre agence ; seule la moyenne remonte à son profil.",
  };
}
