"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { lireCsv } from "@/lib/import-parc";
import { ROLES_RESPONSABLES } from "@/lib/ged";

export type ResultatLigne = {
  ligne: number;
  statut: "ok" | "erreur";
  message: string;
  bien_id: string | null;
  lot_id: string | null;
  bail_id: string | null;
};

export type EtatImport = {
  erreur?: string;
  /** Le contenu du fichier, reposé pour que « Importer » n'exige pas un second dépôt. */
  contenu?: string;
  /** Nom du fichier lu, pour que l'écran dise sur quoi il travaille. */
  fichier?: string;
  controle?: boolean;
  resultats?: ResultatLigne[];
  inconnues?: string[];
  manquantes?: string[];
};

// Taille plafonnée : au-delà, ce n'est plus un parc, c'est un incident.
// 2 Mo laissent passer plusieurs milliers de lignes.
const TAILLE_MAX = 2 * 1024 * 1024;
const LIGNES_MAX = 5000;

/**
 * Contrôler puis importer un parc.
 *
 * Deux passes DÉLIBÉRÉMENT séparées : on ne fait pas basculer un parc entier
 * sur un fichier qu'on n'a pas regardé. La première ne écrit rien et rend, ligne
 * par ligne, ce qui passera et ce qui coince ; la seconde écrit, et rend le même
 * tableau avec ce qui a réellement été créé.
 */
export async function importerParc(
  orgId: string,
  _etat: EtatImport,
  formData: FormData
): Promise<EtatImport> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation : un import engage tout le parc." };
  }

  const bascule = formData.get("bascule") !== null;
  // Le fichier au premier passage, son contenu reposé ensuite.
  let contenu = String(formData.get("contenu") ?? "");
  let fichier = String(formData.get("nom_fichier") ?? "");
  const depose = formData.get("fichier");
  if (depose instanceof File && depose.size > 0) {
    if (depose.size > TAILLE_MAX) {
      return { erreur: `Fichier trop lourd (${Math.round(depose.size / 1024)} ko) — 2 Mo au maximum.` };
    }
    contenu = await depose.text();
    fichier = depose.name;
  }
  if (!contenu.trim()) return { erreur: "Déposez un fichier CSV." };

  const lecture = lireCsv(contenu);
  if ("erreur" in lecture) return { erreur: lecture.erreur, fichier };
  if (lecture.manquantes.length > 0) {
    return {
      erreur: `Colonnes obligatoires absentes : ${lecture.manquantes.join(", ")}.`,
      contenu,
      fichier,
      inconnues: lecture.inconnues,
    };
  }
  if (lecture.lignes.length === 0) {
    return { erreur: "Le fichier ne contient aucune ligne sous l'en-tête.", contenu, fichier };
  }
  if (lecture.lignes.length > LIGNES_MAX) {
    return {
      erreur: `${lecture.lignes.length} lignes : découpez le fichier, ${LIGNES_MAX} au maximum par import.`,
      fichier,
    };
  }

  const { data, error } = await supabase.rpc("importer_parc", {
    p_org: orgId,
    p_lignes: lecture.lignes,
    p_controle_seulement: !bascule,
  });
  if (error) return { erreur: sansJargon(error.message), contenu, fichier };

  if (bascule) {
    revalidatePath(`/agence/${orgId}/parc`);
    revalidatePath(`/agence/${orgId}`);
  }
  return {
    contenu,
    fichier,
    controle: !bascule,
    resultats: (data ?? []) as ResultatLigne[],
    inconnues: lecture.inconnues,
  };
}
