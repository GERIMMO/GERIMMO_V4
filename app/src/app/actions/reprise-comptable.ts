"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { lireCsv, tresorerieDuFichier } from "@/lib/reprise-soldes";
import { ROLES_RESPONSABLES } from "@/lib/ged";

export type ResultatSolde = {
  ligne: number;
  statut: "ok" | "alerte" | "erreur";
  message: string;
  type: string;
  montant: number;
  tresorerie: boolean;
  bail_id: string | null;
  person_id: string | null;
};

export type EtatReprise = {
  erreur?: string;
  /** Le contenu du fichier, reposé pour que « Basculer » n'exige pas un second dépôt. */
  contenu?: string;
  fichier?: string;
  /** L'identifiant de la reprise ouverte, pour que la seconde passe la retrouve. */
  reprise?: string;
  dateBascule?: string;
  tresorerieAnnoncee?: number;
  /** Ce que le fichier représente, calculé côté client — pour montrer l'écart AVANT la base. */
  tresorerieFichier?: number;
  controle?: boolean;
  basculee?: boolean;
  resultats?: ResultatSolde[];
  inconnues?: string[];
};

// Une balance d'ouverture tient dans quelques centaines de lignes : au-delà,
// ce n'est plus une reprise, c'est un grand livre.
const TAILLE_MAX = 1024 * 1024;
const LIGNES_MAX = 2000;

/**
 * Contrôler puis basculer une balance d'ouverture.
 *
 * Deux passes délibérément séparées, comme l'import du parc — et pour une
 * raison de plus : ici, ce sont des euros. Le contrôle n'écrit rien et rend,
 * ligne par ligne, ce qui passera ; la bascule n'est possible qu'ensuite, et
 * seulement si le compte tombe juste.
 */
export async function reprendreSoldes(
  orgId: string,
  _etat: EtatReprise,
  formData: FormData
): Promise<EtatReprise> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return {
      erreur:
        "Réservé au responsable de l'organisation : une balance d'ouverture engage tout le portefeuille.",
    };
  }

  const bascule = formData.get("bascule") !== null;
  const dateBascule = String(formData.get("date_bascule") ?? "").trim();
  const tresorerieSaisie = String(formData.get("tresorerie") ?? "").trim();
  let repriseId = String(formData.get("reprise") ?? "").trim();

  let contenu = String(formData.get("contenu") ?? "");
  let fichier = String(formData.get("nom_fichier") ?? "");
  const depose = formData.get("fichier");
  if (depose instanceof File && depose.size > 0) {
    if (depose.size > TAILLE_MAX) {
      return { erreur: `Fichier trop lourd (${Math.round(depose.size / 1024)} ko) — 1 Mo au maximum.` };
    }
    contenu = await depose.text();
    fichier = depose.name;
  }
  if (!contenu.trim()) return { erreur: "Déposez un fichier CSV.", dateBascule };

  const lecture = lireCsv(contenu);
  if ("erreur" in lecture) return { erreur: lecture.erreur, fichier, dateBascule };
  if (lecture.manquantes.length > 0) {
    return {
      erreur: `Colonnes obligatoires absentes : ${lecture.manquantes.join(", ")}.`,
      contenu,
      fichier,
      dateBascule,
      inconnues: lecture.inconnues,
    };
  }
  if (lecture.lignes.length === 0) {
    return { erreur: "Le fichier ne contient aucune ligne sous l'en-tête.", contenu, fichier, dateBascule };
  }
  if (lecture.lignes.length > LIGNES_MAX) {
    return { erreur: `${lecture.lignes.length} lignes : ${LIGNES_MAX} au maximum par reprise.`, fichier };
  }

  const tresorerieFichier = tresorerieDuFichier(lecture.lignes);
  // Sans total annoncé, on prendrait celui du fichier — et l'écart serait nul
  // par construction, ce qui viderait le contrôle de son sens. C'est l'agence
  // qui annonce ce qu'elle reçoit, le fichier qui doit le justifier.
  const tresorerieAnnoncee = Number(tresorerieSaisie.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(tresorerieAnnoncee)) {
    return {
      erreur:
        "Indiquez la trésorerie que vous reprenez : c'est elle que le détail du fichier doit justifier.",
      contenu,
      fichier,
      dateBascule,
      tresorerieFichier,
    };
  }
  if (!dateBascule) {
    return { erreur: "Indiquez la date de bascule.", contenu, fichier, tresorerieFichier };
  }

  // La reprise s'ouvre au premier contrôle, et se réutilise ensuite : sans
  // cela, chaque passe en créerait une, et la base refuserait la deuxième.
  if (!repriseId) {
    const { data, error } = await supabase.rpc("ouvrir_reprise", {
      p_org: orgId,
      p_date_bascule: dateBascule,
      p_tresorerie: tresorerieAnnoncee,
      p_source: fichier || "fichier",
    });
    if (error) {
      return { erreur: sansJargon(error.message), contenu, fichier, dateBascule, tresorerieFichier };
    }
    repriseId = String(data);
  }

  const { data, error } = await supabase.rpc("reprendre_soldes", {
    p_org: orgId,
    p_reprise: repriseId,
    p_lignes: lecture.lignes,
    p_controle_seulement: !bascule,
  });
  if (error) {
    return {
      erreur: sansJargon(error.message),
      contenu,
      fichier,
      reprise: repriseId,
      dateBascule,
      tresorerieAnnoncee,
      tresorerieFichier,
    };
  }

  if (bascule) {
    revalidatePath(`/agence/${orgId}/comptabilite`);
    revalidatePath(`/agence/${orgId}`);
  }
  return {
    contenu,
    fichier,
    reprise: repriseId,
    dateBascule,
    tresorerieAnnoncee,
    tresorerieFichier,
    controle: !bascule,
    basculee: bascule,
    resultats: ((data ?? []) as ResultatSolde[]).map((r) => ({ ...r, montant: Number(r.montant) })),
    inconnues: lecture.inconnues,
  };
}

/** Abandonner une reprise en cours : le fichier était le mauvais, on recommence. */
export async function abandonnerReprise(orgId: string, repriseId: string): Promise<{ erreur?: string }> {
  const { supabase, user, role } = await verifierGerant(orgId);
  if (!user || !role || !ROLES_RESPONSABLES.includes(role)) {
    return { erreur: "Réservé au responsable de l'organisation." };
  }
  const { error } = await supabase.rpc("abandonner_reprise", { p_org: orgId, p_reprise: repriseId });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath(`/agence/${orgId}/comptabilite/reprise`);
  return {};
}
