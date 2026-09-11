"use server";

import { revalidatePath } from "next/cache";
import { sansJargon } from "@/lib/erreurs";
import { verifierLocataire } from "@/lib/ged-acces";
import { valeursDuFormulaire } from "@/lib/formulaires";
import {
  CRENEAUX_MINIMUM,
  demiJournee,
  instantParis,
} from "@/app/locataire/[orgId]/demandes/creneaux";
import type { EtatIncidentAction } from "@/app/actions/incidents";

// ════════════════════════════════════════════════════════════════════════════
// LES TROIS SEULS GESTES DU LOCATAIRE SUR UNE INTERVENTION
//
// Il choisit un créneau, il en propose d'autres si aucun ne convient, il note
// ce qu'il a vu une fois le travail fait. C'est tout, et c'est voulu :
// « ni le locataire ni Gerimmo n'approuvent l'intervention » (module 8) — il
// ne valide ni le devis, ni l'artisan, ni le montant. Un quatrième geste
// n'existe pas ici ; s'il en apparaissait un, l'écran mentirait.
//
// Ces actions vivent à part de `actions/incidents.ts` : ce fichier-là porte
// déjà la déclaration, la qualification et tous les gestes d'agence, et trois
// agents travaillaient dessus le 11/09. Le découpage suit le persona.
//
// Toutes les gardes sont en base (RPC SECURITY DEFINER du socle du module 8) :
// appartenance de l'incident à SON bail, statut du créneau, intervention
// terminée, note unique. `verifierLocataire` n'est ici que la défense en
// profondeur — la première porte, jamais la seule.
// ════════════════════════════════════════════════════════════════════════════

/** Les trois écrans que touche un geste de suivi du locataire. */
function revaliderSuivi(orgId: string) {
  revalidatePath(`/locataire/${orgId}`);
  revalidatePath(`/locataire/${orgId}/demandes`);
}

// ── Choisir le créneau proposé par l'artisan (RM-10.2.1) ───────────────────
export async function choisirMonCreneau(
  orgId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const creneau = String(formData.get("creneau") ?? "");
  if (!creneau) return { erreur: "Choisissez l'un des créneaux proposés." };

  const { error } = await supabase.rpc("choisir_creneau", {
    p_org: orgId,
    p_creneau: creneau,
  });
  if (error) return { erreur: sansJargon(error.message) };

  revaliderSuivi(orgId);
  return {
    succes:
      "Rendez-vous confirmé — l'artisan est prévenu. Vous le retrouvez ici, et un rappel vous parviendra la veille.",
  };
}

// ── Aucun ne convient : en proposer trois à son tour (RM-10.2.2) ───────────
//
// « Un refus sec bloquerait sans faire avancer » : la base refuse d'ailleurs
// moins de trois créneaux. On les contrôle ici d'abord, pour que le locataire
// lise un reproche utile plutôt qu'un message de base de données — et pour
// attraper ce que la base ne voit pas : une date déjà passée, ou trois fois la
// même demi-journée (qui ferait « trois créneaux » sur le papier et un seul en
// réalité).
export async function proposerMesCreneaux(
  orgId: string,
  interventionId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const creneaux: { debut: string; fin: string }[] = [];
  const vus = new Set<string>();

  for (let i = 0; i < CRENEAUX_MINIMUM; i++) {
    const date = String(formData.get(`date-${i}`) ?? "").trim();
    const moment = demiJournee(String(formData.get(`moment-${i}`) ?? ""));
    if (!date || !moment) {
      return {
        erreur: `Indiquez vos ${CRENEAUX_MINIMUM} disponibilités : une date et un moment de la journée pour chacune.`,
        valeurs,
      };
    }
    if (date <= aujourdhui) {
      return { erreur: "Proposez des dates à venir — celles-ci sont déjà passées.", valeurs };
    }
    const cle = `${date}-${moment.valeur}`;
    if (vus.has(cle)) {
      return {
        erreur: "Vos trois propositions doivent être différentes — sinon l'artisan n'a qu'un choix.",
        valeurs,
      };
    }
    vus.add(cle);
    const debut = instantParis(date, moment.debut);
    const fin = instantParis(date, moment.fin);
    if (!debut || !fin) return { erreur: "Date invalide.", valeurs };
    creneaux.push({ debut, fin });
  }

  const { error } = await supabase.rpc("contre_proposer_creneaux", {
    p_org: orgId,
    p_intervention: interventionId,
    p_creneaux: creneaux,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderSuivi(orgId);
  return {
    succes:
      "Vos disponibilités sont transmises à l'artisan. Il confirme l'une d'elles, ou votre gestionnaire vous appelle.",
  };
}

// ── Noter l'intervention (RM-11.1) ─────────────────────────────────────────
//
// « Ce qu'il a vu sur place » : une note globale, pas de critère de prix ni de
// technique — il n'a payé ni jugé ni l'un ni l'autre (la contrainte de table
// le lui interdit d'ailleurs). Facultatif et jamais bloquant (RM-11.1.3/4) :
// sans réponse, la note reste simplement absente du calcul.
export async function noterMonIntervention(
  orgId: string,
  interventionId: string,
  _etat: EtatIncidentAction,
  formData: FormData
): Promise<EtatIncidentAction> {
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) return { erreur: "Accès refusé." };

  const valeurs = valeursDuFormulaire(formData);
  const note = Number(formData.get("note"));
  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return { erreur: "Donnez une note de 1 à 5 étoiles.", valeurs };
  }
  const commentaire = String(formData.get("commentaire") ?? "").trim();

  const { error } = await supabase.rpc("noter_artisan_locataire", {
    p_org: orgId,
    p_intervention: interventionId,
    p_note: note,
    p_commentaire: commentaire || null,
  });
  if (error) return { erreur: sansJargon(error.message), valeurs };

  revaliderSuivi(orgId);
  return { succes: "Merci — votre avis est enregistré." };
}
