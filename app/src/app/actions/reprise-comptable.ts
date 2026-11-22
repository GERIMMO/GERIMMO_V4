"use server";

import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { sansJargon } from "@/lib/erreurs";
import { lireCsv, tresorerieDuFichier } from "@/lib/reprise-soldes";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { erreurDuChamp, lireMontantSigne } from "@/lib/saisie-montant";

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
  // Lue sur le texte tel que tapé (« 42000,50 » vaut 42000,5), comme tous les montants (VER-TS-02) : elle peut être
  // négative (découvert) ou nulle, jamais vide (`Number("")` valait 0 et passait), ni « 1e4 » ou « 42 000 ».
  const tresorerieLue = lireMontantSigne(tresorerieSaisie);
  if ("erreur" in tresorerieLue) {
    return {
      erreur: tresorerieSaisie
        ? erreurDuChamp("Trésorerie reprise", tresorerieLue.erreur)
        : "Indiquez la trésorerie que vous reprenez : c'est elle que le détail du fichier doit justifier.",
      contenu,
      fichier,
      dateBascule,
      tresorerieFichier,
    };
  }
  const tresorerieAnnoncee = tresorerieLue.montant;
  if (!dateBascule) {
    return { erreur: "Indiquez la date de bascule.", contenu, fichier, tresorerieFichier };
  }

  // La reprise s'ouvre au premier contrôle, et se réutilise ensuite : sans
  // cela, chaque passe en créerait une, et la base refuserait la deuxième.
  //
  // Audit palier 1 (P1-02). La reprise ouverte se lit EN BASE, plus seulement dans le formulaire : après un
  // rechargement, l'identifiant porté par l'écran est perdu, et `ouvrir_reprise` refuse d'en ouvrir une seconde —
  // l'écran restait bloqué. Elle porte aussi SA date et SA trésorerie, fixées à l'ouverture et seules lues par la
  // base au contrôle comme à la bascule : si l'écran en annonce d'autres, on ne contrôle pas sous d'anciennes
  // valeurs. Un nouveau contrôle repart alors d'une reprise neuve (l'ancienne est abandonnée : un contrôle n'a
  // rien écrit dans les comptes) ; une bascule, elle, est refusée tant qu'on n'a pas recontrôlé.
  const saisie = { contenu, fichier, dateBascule, tresorerieAnnoncee, tresorerieFichier };
  const { data: ouvertes, error: lectureOuverte } = await supabase
    .from("reprises_portefeuille")
    .select("id, date_bascule, tresorerie_annoncee")
    .eq("organization_id", orgId)
    .in("statut", ["en_cours", "controle"])
    .order("cree_le", { ascending: false })
    .limit(1);
  if (lectureOuverte) {
    return { ...saisie, erreur: "La reprise en cours n’a pas pu être vérifiée. Réessayez dans un instant." };
  }
  const ouverte = ((ouvertes ?? []) as { id: string; date_bascule: string | null; tresorerie_annoncee: number | string | null }[])[0] ?? null;
  const memeReprise = ouverte !== null
    && String(ouverte.date_bascule ?? "").slice(0, 10) === dateBascule
    && Math.round(Number(ouverte.tresorerie_annoncee ?? 0) * 100) === Math.round(tresorerieAnnoncee * 100);

  if (bascule) {
    // On ne bascule que la reprise qu'on vient de contrôler, sous les valeurs contrôlées.
    if (!ouverte || !memeReprise || (repriseId && repriseId !== ouverte.id)) {
      return {
        ...saisie,
        reprise: memeReprise && ouverte ? ouverte.id : undefined,
        erreur: ouverte && !memeReprise
          ? "La date de bascule ou la trésorerie ont changé depuis le dernier contrôle. Contrôlez de nouveau la balance avant de basculer."
          : "Cette reprise n’est plus celle que vous avez contrôlée. Contrôlez de nouveau la balance avant de basculer.",
      };
    }
    repriseId = ouverte.id;
  } else if (ouverte && memeReprise) {
    repriseId = ouverte.id;
  } else {
    if (ouverte) {
      const { error: abandon } = await supabase.rpc("abandonner_reprise", { p_org: orgId, p_reprise: ouverte.id });
      if (abandon) return { ...saisie, erreur: sansJargon(abandon.message) };
    }
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
  const { data, error } = await supabase.rpc("abandonner_reprise", { p_org: orgId, p_reprise: repriseId });
  if (error) return { erreur: sansJargon(error.message) };
  // La base rend « faux » quand rien n'a été abandonné : reprise déjà basculée, déjà abandonnée, ou d'un autre espace.
  if (data !== true) return { erreur: "Cette reprise n’est plus en cours. Rechargez la page pour voir son état." };
  revalidatePath(`/agence/${orgId}/comptabilite/reprise`);
  revalidatePath(`/espace/${orgId}/comptabilite/reprise`);
  return {};
}
