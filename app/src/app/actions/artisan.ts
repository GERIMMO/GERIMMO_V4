"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sansJargon } from "@/lib/erreurs";
import { valeursDuFormulaire } from "@/lib/formulaires";
import {
  detecterMimeReel,
  pdfComplet,
  EXTENSIONS,
  TAILLE_MAX_OCTETS,
  type MimeAccepte,
} from "@/lib/file-type";
import { verifierArtisanAction } from "@/app/artisan/acces";
import type { LigneAgenda, LigneSollicitation } from "@/app/artisan/acces";
import { LISTE_METIERS } from "@/app/artisan/libelles";

/**
 * Actions du portail artisan.
 *
 * TOUTES passent par une RPC SECURITY DEFINER : aucune écriture directe n'est
 * possible depuis une session d'artisan (le socle du 2026-09-11 révoque
 * `insert/update/delete` à `authenticated` sur les quatorze tables du module).
 * Les gardes ci-dessous sont donc de la défense en profondeur, jamais la
 * défense elle-même : chaque RPC redéduit l'identité de l'appelant par
 * `mon_artisan_id()` et refuse ce qui ne lui appartient pas.
 *
 * Les messages d'erreur de la base sont rédigés en français à hauteur
 * d'utilisateur et nomment la règle (« Ajoutez la photo du travail réalisé… ») :
 * ils sont affichés TELS QUELS, `sansJargon` ne retirant que la référence
 * interne au référentiel.
 */

export type EtatArtisanAction = {
  erreur?: string;
  succes?: string;
  avertissement?: string;
  /** Saisie renvoyée en erreur pour que le formulaire la repose (recette 22/08). */
  valeurs?: Record<string, string>;
};

const REFUS: EtatArtisanAction = {
  erreur: "Accès refusé — reconnectez-vous, puis réessayez.",
};

// ══════════════════════════════════════════════════════════════════════════
// Outils communs
// ══════════════════════════════════════════════════════════════════════════

/**
 * Prépare un fichier et le monte au Storage.
 *
 * Deux espaces, deux préfixes — et ce n'est pas un détail de rangement :
 *   · `<organization_id>/…` pour les devis et les photos de chantier : ce sont
 *     des pièces D'AGENCE, sous sa rétention, et la politique storage
 *     `ged_insert_artisan` n'y laisse écrire que pendant une mission vivante ;
 *   · `artisans/<artisan_id>/…` pour les attestations : elles sont GLOBALES
 *     (RM-8.2.8, elles valent pour toutes les agences) et ne doivent donc
 *     franchir aucune frontière d'agence — le premier segment n'étant pas un
 *     UUID d'organisation, la purge des fichiers sans fiche ne les atteint pas.
 * La RPC appelée ensuite revérifie le préfixe ; ici on le construit, on ne le
 * reçoit jamais du navigateur.
 *
 * L'ordre — tout ce qui se vérifie AVANT la montée — n'est pas cosmétique :
 * seul le super admin peut supprimer un objet du Storage (politique
 * `ged_delete`). Un fichier monté qu'une RPC refuse ensuite reste donc en
 * place ; on réduit ce cas à ce qui ne se vérifie pas d'avance.
 */
async function preparerFichierArtisan(
  supabase: SupabaseClient,
  prefixe: string,
  fichier: File,
  mimesAcceptes: readonly MimeAccepte[]
): Promise<
  | { erreur: string }
  | { chemin: string; mime: MimeAccepte; taille: number; empreinte: string }
> {
  if (fichier.size === 0) return { erreur: "Le fichier est vide." };
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return { erreur: "Fichier trop volumineux (10 Mo maximum)." };
  }
  const octets = new Uint8Array(await fichier.arrayBuffer());

  // RM-A4.9 : le type RÉEL, jamais l'extension ni le Content-Type déclaré.
  const mime = detecterMimeReel(octets);
  if (!mime || !mimesAcceptes.includes(mime)) {
    return {
      erreur:
        mimesAcceptes.length === 1 && mimesAcceptes[0] === "application/pdf"
          ? "Envoyez un PDF."
          : mimesAcceptes.includes("application/pdf")
            ? "Envoyez une photo (JPEG, PNG) ou un PDF."
            : "Envoyez une photo (JPEG ou PNG).",
    };
  }
  if (mime === "application/pdf" && !pdfComplet(octets)) {
    return {
      erreur:
        "Ce PDF est incomplet : il a probablement été coupé pendant l'envoi. Renvoyez-le.",
    };
  }

  const empreinte = createHash("sha256").update(octets).digest("hex");
  const chemin = `${prefixe}/${randomUUID()}.${EXTENSIONS[mime]}`;
  const { error } = await supabase.storage
    .from("documents")
    .upload(chemin, octets, { contentType: mime });
  if (error) {
    return { erreur: `L'envoi du fichier a échoué : ${sansJargon(error.message)}` };
  }
  return { chemin, mime, taille: fichier.size, empreinte };
}

/** La mission demandée, telle que l'agenda la rend — ou rien si elle n'est pas à lui. */
async function maMission(
  supabase: SupabaseClient,
  interventionId: string
): Promise<LigneAgenda | null> {
  const { data } = await supabase.rpc("mon_agenda_artisan", { p_du: null, p_au: null });
  return (
    ((data ?? []) as LigneAgenda[]).find((l) => l.intervention_id === interventionId) ?? null
  );
}

async function maSollicitation(
  supabase: SupabaseClient,
  sollicitationId: string
): Promise<LigneSollicitation | null> {
  const { data } = await supabase.rpc("mes_sollicitations");
  return (
    ((data ?? []) as LigneSollicitation[]).find(
      (l) => l.sollicitation_id === sollicitationId
    ) ?? null
  );
}

/** Rafraîchit tout ce qui compte un en-cours : badges d'onglets compris. */
function rafraichirMission(interventionId: string) {
  revalidatePath("/artisan");
  revalidatePath("/artisan/agenda");
  revalidatePath("/artisan/facturation");
  revalidatePath(`/artisan/missions/${interventionId}`);
}

/**
 * « 1 234,56 », « 1234.56 », « 1 234 » → centimes.
 * Le clavier d'un téléphone met la virgule, celui d'un ordinateur le point :
 * refuser l'un des deux ferait échouer la saisie une fois sur deux.
 */
function centimes(brut: string): number | null {
  const propre = brut.replace(/\s| | /g, "").replace(",", ".").replace("€", "");
  if (!/^\d+(\.\d{1,2})?$/.test(propre)) return null;
  return Math.round(Number(propre) * 100);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. Inscription et fiche (module 8, pivot du 2026-09-04)
// ══════════════════════════════════════════════════════════════════════════

function lireMetiers(formData: FormData): string[] {
  return formData
    .getAll("metiers")
    .map(String)
    .filter((m) => (LISTE_METIERS as readonly string[]).includes(m));
}

/** « 75011, 75012 » ou « 75011 75012 » → ["75011","75012"]. */
function lireCodesPostaux(brut: string): { codes?: string[]; erreur?: string } {
  const codes = brut
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const fautif = codes.find((c) => !/^\d{5}$/.test(c));
  if (fautif) return { erreur: `« ${fautif} » n'est pas un code postal à cinq chiffres.` };
  return { codes: [...new Set(codes)] };
}

export async function inscrireMonEntreprise(
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (fiche) return { erreur: "Votre compte porte déjà une fiche artisan." };

  const valeurs = valeursDuFormulaire(formData);
  const raisonSociale = String(formData.get("raison_sociale") ?? "").trim();
  const siret = String(formData.get("siret") ?? "").replace(/\s/g, "");
  const telephone = String(formData.get("telephone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const metiers = lireMetiers(formData);
  const zones = lireCodesPostaux(String(formData.get("codes_postaux") ?? ""));

  if (!raisonSociale) return { erreur: "Indiquez le nom de votre entreprise.", valeurs };
  if (!/^\d{14}$/.test(siret)) {
    return { erreur: "Le SIRET compte quatorze chiffres.", valeurs };
  }
  if (!telephone) {
    return {
      erreur: "Votre mobile est obligatoire — c'est par lui qu'on vous joint sur le chantier.",
      valeurs,
    };
  }
  if (metiers.length === 0) return { erreur: "Choisissez au moins un métier.", valeurs };
  if (zones.erreur) return { erreur: zones.erreur, valeurs };

  const { error } = await supabase.rpc("inscrire_mon_entreprise_artisan", {
    p_raison_sociale: raisonSociale,
    p_siret: siret,
    p_telephone: telephone,
    p_email: email || null,
    p_metiers: metiers,
    p_codes_postaux: zones.codes ?? [],
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath("/artisan", "layout");
  redirect("/artisan/attestations?inscrit=1");
}

export async function mettreAJourMetiersZones(
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  const metiers = lireMetiers(formData);
  const zones = lireCodesPostaux(String(formData.get("codes_postaux") ?? ""));
  if (metiers.length === 0) return { erreur: "Choisissez au moins un métier.", valeurs };
  if (zones.erreur) return { erreur: zones.erreur, valeurs };

  const { error } = await supabase.rpc("artisan_definir_metiers_zones", {
    p_artisan: fiche.artisan_id,
    p_metiers: metiers,
    p_codes_postaux: zones.codes ?? [],
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath("/artisan/entreprise");
  return { succes: "Métiers et zone d'intervention enregistrés." };
}

/**
 * RM-8.4.2 : l'artisan décide SEUL de sa visibilité. Ni l'agence ni le super
 * admin n'ont de porte ici — `definir_ma_visibilite` n'accepte aucun artisan
 * en paramètre.
 */
export async function definirMaVisibilite(
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const visibilite = String(formData.get("visibilite") ?? "");
  if (visibilite !== "privee" && visibilite !== "publique") {
    return { erreur: "Choix de visibilité inconnu." };
  }
  const { error } = await supabase.rpc("definir_ma_visibilite", {
    p_visibilite: visibilite,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revalidatePath("/artisan/entreprise");
  return {
    succes:
      visibilite === "publique"
        ? "Votre profil est désormais visible de toutes les agences de la plateforme."
        : "Votre profil n'est plus visible que des agences auxquelles vous êtes déjà rattaché.",
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 2. Attestations (RM-8.2.1 : c'est l'artisan qui dépose)
// ══════════════════════════════════════════════════════════════════════════

export async function deposerMaPiece(
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  const type = String(formData.get("type") ?? "");
  const emiseLe = String(formData.get("emise_le") ?? "").trim();
  const expireLe = String(formData.get("expire_le") ?? "").trim();
  const fichier = formData.get("fichier");

  if (!["decennale", "rc_pro", "urssaf", "kbis", "certification"].includes(type)) {
    return { erreur: "Choisissez le type d'attestation.", valeurs };
  }
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: "Joignez l'attestation (photo ou PDF).", valeurs };
  }
  // Contrôlé ici AVANT la montée du fichier : la RPC le refuserait ensuite, et
  // l'objet monté resterait au Storage sans possibilité de l'en retirer.
  if (type !== "certification" && !expireLe) {
    return {
      erreur: "Indiquez la date de fin de validité — c'est elle qui fait foi.",
      valeurs,
    };
  }

  const prepare = await preparerFichierArtisan(
    supabase,
    `artisans/${fiche.artisan_id}`,
    fichier,
    ["application/pdf", "image/jpeg", "image/png"]
  );
  if ("erreur" in prepare) return { erreur: prepare.erreur, valeurs };

  const { error } = await supabase.rpc("deposer_ma_piece_artisan", {
    p_type: type,
    p_storage_path: prepare.chemin,
    p_mime: prepare.mime,
    p_taille: prepare.taille,
    p_empreinte: prepare.empreinte,
    p_emise_le: emiseLe || null,
    p_expire_le: expireLe || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath("/artisan", "layout");
  return {
    succes:
      type === "decennale"
        ? "Décennale enregistrée. Vous êtes à nouveau proposé pour les travaux qui l'exigent."
        : "Attestation enregistrée. Elle remplace la précédente du même type.",
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 3. Demandes de devis (9.2)
// ══════════════════════════════════════════════════════════════════════════

export async function declinerMaSollicitation(
  sollicitationId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();

  const { error } = await supabase.rpc("decliner_sollicitation", {
    p_sollicitation: sollicitationId,
    p_motif: motif || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath("/artisan");
  revalidatePath("/artisan/devis");
  redirect("/artisan/devis");
}

export async function deposerMonDevis(
  sollicitationId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  const montant = centimes(String(formData.get("montant") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const valideJusquAu = String(formData.get("valide_jusqu_au") ?? "").trim();
  const fichier = formData.get("fichier");

  if (montant === null || montant <= 0) {
    return { erreur: "Indiquez le montant TTC du devis, en euros.", valeurs };
  }
  if (!description) {
    return { erreur: "Décrivez ce que couvre le devis.", valeurs };
  }

  // Le chemin de stockage doit être sous le dossier de CETTE agence : on le
  // déduit de la sollicitation, jamais d'un champ du formulaire.
  const sollicitation = await maSollicitation(supabase, sollicitationId);
  if (!sollicitation) {
    return { erreur: "Cette demande de devis ne vous est pas adressée.", valeurs };
  }

  let piece: { chemin: string; mime: MimeAccepte; taille: number; empreinte: string } | null =
    null;
  if (fichier instanceof File && fichier.size > 0) {
    const prepare = await preparerFichierArtisan(
      supabase,
      sollicitation.organization_id,
      fichier,
      ["application/pdf", "image/jpeg", "image/png"]
    );
    if ("erreur" in prepare) return { erreur: prepare.erreur, valeurs };
    piece = prepare;
  }

  const { error } = await supabase.rpc("deposer_devis", {
    p_sollicitation: sollicitationId,
    p_montant_ttc_cents: montant,
    p_description: description,
    p_valide_jusqu_au: valideJusquAu || null,
    p_storage_path: piece?.chemin ?? null,
    p_mime: piece?.mime ?? null,
    p_taille: piece?.taille ?? null,
    p_empreinte: piece?.empreinte ?? null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revalidatePath("/artisan");
  revalidatePath("/artisan/devis");
  redirect("/artisan/devis?envoye=1");
}

// ══════════════════════════════════════════════════════════════════════════
// 4. La mission (7.4) et les créneaux (10.1)
// ══════════════════════════════════════════════════════════════════════════

// Ni `etat` ni `formData` ici : accepter ne se saisit pas, cela se décide.
// `useActionState` les passera quand même, la signature les ignore.
export async function accepterMaMission(
  interventionId: string
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const { error } = await supabase.rpc("accepter_mission", {
    p_intervention: interventionId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  rafraichirMission(interventionId);
  // RM-10.1.1 : l'artisan propose EN PREMIER, et c'est le geste qui suit
  // immédiatement l'acceptation. On l'y conduit plutôt que de le laisser
  // chercher : l'écran suivant est celui dont la mission a besoin.
  redirect(`/artisan/missions/${interventionId}/creneaux`);
}

export async function refuserMaMission(
  interventionId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) {
    return {
      erreur: "Dites pourquoi vous refusez — l'agence doit réaffecter en connaissance de cause.",
      valeurs,
    };
  }

  const { error } = await supabase.rpc("refuser_mission", {
    p_intervention: interventionId,
    p_motif: motif,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  rafraichirMission(interventionId);
  redirect("/artisan?refus=1");
}

/**
 * RM-10.1.1 : trois créneaux au MINIMUM, et ils partent ensemble.
 *
 * Le champ `creneaux` est un tableau JSON construit par le navigateur, en
 * heure ABSOLUE (ISO avec fuseau). C'est volontaire : un « 08:00 » envoyé nu
 * serait interprété dans le fuseau du serveur — l'artisan proposerait 10 h en
 * croyant proposer 8 h. Le seul appareil qui connaisse son fuseau est le sien.
 */
export async function proposerMesCreneaux(
  interventionId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  let creneaux: { debut: string; fin: string }[];
  try {
    const brut: unknown = JSON.parse(String(formData.get("creneaux") ?? "[]"));
    if (!Array.isArray(brut)) throw new Error("forme");
    creneaux = brut.map((c) => ({
      debut: String((c as { debut?: unknown }).debut ?? ""),
      fin: String((c as { fin?: unknown }).fin ?? ""),
    }));
  } catch {
    return { erreur: "Les créneaux saisis n'ont pas pu être lus. Reprenez-les.", valeurs };
  }

  const complets = creneaux.filter((c) => c.debut && c.fin);
  if (complets.length < 3) {
    return {
      erreur: `Proposez au moins trois créneaux : le locataire doit avoir un vrai choix. Vous en avez rempli ${complets.length}.`,
      valeurs,
    };
  }
  const invalide = complets.find(
    (c) =>
      Number.isNaN(Date.parse(c.debut)) ||
      Number.isNaN(Date.parse(c.fin)) ||
      Date.parse(c.fin) <= Date.parse(c.debut)
  );
  if (invalide) {
    return { erreur: "Chaque créneau doit se terminer après avoir commencé.", valeurs };
  }
  const passe = complets.find((c) => Date.parse(c.debut) < Date.now());
  if (passe) {
    return { erreur: "Un créneau ne se propose pas dans le passé.", valeurs };
  }

  const { error } = await supabase.rpc("proposer_creneaux", {
    p_intervention: interventionId,
    p_creneaux: complets,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  rafraichirMission(interventionId);
  return {
    succes: `${complets.length} créneaux envoyés. Le locataire choisit, ou vous en propose d'autres à son tour.`,
  };
}

export async function demarrerMonIntervention(
  interventionId: string
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const { error } = await supabase.rpc("demarrer_intervention", {
    p_intervention: interventionId,
  });
  if (error) return { erreur: sansJargon(error.message) };

  rafraichirMission(interventionId);
  return { succes: "Intervention démarrée." };
}

// ══════════════════════════════════════════════════════════════════════════
// 5. Le compte rendu (7.5) — deux écrans, la photo d'abord
// ══════════════════════════════════════════════════════════════════════════

/**
 * La photo part DÈS QU'ELLE EST PRISE, avant le texte.
 *
 * C'est la réponse au réseau faible du chantier : un envoi court qu'on peut
 * recommencer, plutôt qu'un seul gros envoi photo + texte qui échoue en bloc
 * et fait tout ressaisir. Quand l'artisan arrive au second écran, l'essentiel
 * est déjà en sécurité — et `deposer_compte_rendu` exige justement qu'une
 * photo « après » existe déjà (RM-7.5.2).
 */
export async function deposerPhotoChantier(
  interventionId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const moment = String(formData.get("moment") ?? "apres");
  if (!["avant", "pendant", "apres"].includes(moment)) {
    return { erreur: "Moment de la photo inconnu." };
  }
  const fichiers = formData
    .getAll("photo")
    .filter((p): p is File => p instanceof File && p.size > 0);
  if (fichiers.length === 0) {
    return { erreur: "Aucune photo sélectionnée." };
  }

  const mission = await maMission(supabase, interventionId);
  if (!mission) return { erreur: "Cette mission ne vous est pas confiée." };

  const echecs: string[] = [];
  let deposees = 0;
  for (const fichier of fichiers) {
    const prepare = await preparerFichierArtisan(
      supabase,
      mission.organization_id,
      fichier,
      ["image/jpeg", "image/png"]
    );
    if ("erreur" in prepare) {
      echecs.push(`« ${fichier.name} » : ${prepare.erreur}`);
      continue;
    }
    const { error } = await supabase.rpc("deposer_photo_intervention", {
      p_intervention: interventionId,
      p_moment: moment,
      p_storage_path: prepare.chemin,
      p_mime: prepare.mime,
      p_taille: prepare.taille,
      p_empreinte: prepare.empreinte,
    });
    if (error) echecs.push(`« ${fichier.name} » : ${sansJargon(error.message)}`);
    else deposees += 1;
  }

  rafraichirMission(interventionId);
  revalidatePath(`/artisan/missions/${interventionId}/compte-rendu`);

  if (deposees === 0) {
    return { erreur: echecs.join(" ; ") || "La photo n'est pas partie. Réessayez." };
  }
  return {
    succes: deposees === 1 ? "Photo envoyée." : `${deposees} photos envoyées.`,
    avertissement: echecs.length > 0 ? `Non envoyées : ${echecs.join(" ; ")}.` : undefined,
  };
}

export async function deposerMonCompteRendu(
  interventionId: string,
  _etat: EtatArtisanAction,
  formData: FormData
): Promise<EtatArtisanAction> {
  const { supabase, fiche } = await verifierArtisanAction();
  if (!fiche) return REFUS;

  const valeurs = valeursDuFormulaire(formData);
  const travaux = String(formData.get("travaux") ?? "").trim();
  const causeReelle = String(formData.get("cause_reelle") ?? "").trim();
  const imputation = String(formData.get("imputation_suggeree") ?? "").trim();
  const montantBrut = String(formData.get("montant_final") ?? "").trim();
  const nouvelleIntervention = formData.get("nouvelle_intervention") === "oui";

  if (!travaux) {
    return {
      erreur: "Dites ce que vous avez fait — le compte rendu conditionne la facturation.",
      valeurs,
    };
  }
  const montant = montantBrut ? centimes(montantBrut) : null;
  if (montantBrut && montant === null) {
    return { erreur: "Le montant final se saisit en euros (ex. : 320,50).", valeurs };
  }
  if (
    imputation &&
    !["locataire", "proprietaire", "degradation_fautive"].includes(imputation)
  ) {
    return { erreur: "Cause suggérée inconnue.", valeurs };
  }
  // RM-7.5.3 : l'artisan SIGNALE, il ne requalifie pas. Une imputation
  // suggérée sans un mot d'explication n'est pas un signalement : c'est un
  // verdict sans motif, que l'agent ne pourra pas arbitrer.
  if (imputation && !causeReelle) {
    return {
      erreur:
        "Expliquez ce que vous avez constaté : c'est votre constat qui permet à l'agence de trancher, pas la case cochée.",
      valeurs,
    };
  }

  const { error } = await supabase.rpc("deposer_compte_rendu", {
    p_intervention: interventionId,
    p_travaux: travaux,
    p_cause_reelle: causeReelle || null,
    p_imputation_suggeree: imputation || null,
    p_montant_final_cents: montant,
    p_nouvelle_intervention: nouvelleIntervention,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  rafraichirMission(interventionId);
  redirect(`/artisan/missions/${interventionId}?termine=1`);
}
