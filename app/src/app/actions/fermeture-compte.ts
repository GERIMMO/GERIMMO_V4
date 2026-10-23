"use server";

// LA FERMETURE D'UN COMPTE, DÉCLENCHÉE PAR LE SUPER-ADMINISTRATEUR (plan de conformité du 23/10/2026, R15).
//
// Avant le 30/11, la fermeture se programme depuis /admin/donnees, sur une demande « Données personnelles » du titulaire
// (le libre-service « Fermer mon compte » suivra au lot 5). Réservé au super-administrateur permanent, second facteur
// compris (`is_permanent_super_admin()`). La clé de service ne sert qu'après ce contrôle :
//  1. bilan sans effacement (`simuler_fermeture_compte`) ;
//  2. si une souscription Stripe vit encore : arrêt à la date d'effet (fin de la période payée, ou J+14 avec un
//     remboursement au prorata), sous le verrou des gestes de facturation ;
//  3. programmation en base (`programmer_fermeture_compte`), qui fixe la date d'effet et enregistre le bilan ; refusée,
//     l'arrêt posé chez Stripe est défait.
// L'effacement lui-même a lieu la nuit de la date d'effet (pg_cron « fermetures-comptes »), après la sauvegarde du jour.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { clientStripe, configurationStripe } from "@/lib/stripe";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";
import { annulerStripeFermeture, preparerStripeFermeture, type AbonnementFermeture } from "@/lib/comptes-fermeture-serveur";
import { jourEnLettres, type ChoixFermeture } from "@/lib/comptes-fermeture";
import type { EtatRetour } from "./retours";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BilanSimulationAffiche = {
  erreur?: string;
  bilan?: {
    organisations_effacees: { organisation: string; nom: string | null; biens: number; lots: number; baux: number; personnes: number; documents: number; fichiers: number; membres_invites: number; demandes_zoho: number }[];
    adhesions_retirees: number;
    dossiers_tiers: number;
    proprietaires_prevenus: number;
    artisan: string | null;
    archive_requise: string[];
    acceptations: number;
    abonnement: AbonnementFermeture;
    references_restantes: Record<string, number>;
    mode_prevu: "suppression" | "neutralisation";
    super_admin: boolean;
  };
};

async function superviseur(): Promise<{ uid: string } | { erreur: string }> {
  const session = await createClient();
  const droit = await session.rpc("is_permanent_super_admin");
  if (droit.error || droit.data !== true) return { erreur: "Réservé au compte de supervision permanent, avec second facteur." };
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { erreur: "Connexion requise." };
  return { uid: user.id };
}

function choixLu(valeur: FormDataEntryValue | null): ChoixFermeture | null {
  return valeur === "fin_periode" || valeur === "j14_prorata" ? valeur : null;
}

/** « Afficher le bilan » : ce que la fermeture effacerait, sans rien effacer. */
export async function simulerFermetureCompte(accountId: string): Promise<BilanSimulationAffiche> {
  if (!UUID.test(accountId)) return { erreur: "Compte inconnu." };
  const droit = await superviseur();
  if ("erreur" in droit) return { erreur: droit.erreur };
  const session = await createClient();
  const { data, error } = await session.rpc("simuler_fermeture_compte", { p_account: accountId });
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "Le bilan est indisponible : rien n'a été programmé." };
  return { bilan: data as BilanSimulationAffiche["bilan"] };
}

/** « Programmer la fermeture » d'un compte, sur sa demande « Données personnelles ». */
export async function programmerFermetureCompte(_etat: EtatRetour, formulaire: FormData): Promise<EtatRetour> {
  const accountId = String(formulaire.get("account_id") ?? "");
  const demandeId = String(formulaire.get("demande_id") ?? "");
  const choix = choixLu(formulaire.get("choix"));
  if (!UUID.test(accountId) || !UUID.test(demandeId)) return { erreur: "Demande ou compte inconnu : rechargez la page." };
  const droit = await superviseur();
  if ("erreur" in droit) return { erreur: droit.erreur };
  const service = clientDeService();
  if (!service) return { erreur: "La clé de service n'est pas configurée sur ce serveur : la fermeture ne peut pas être programmée." };

  const simulation = await service.rpc("simuler_fermeture_compte", { p_account: accountId });
  if (simulation.error || !simulation.data) return { erreur: simulation.error ? sansJargon(simulation.error.message) : "Le bilan est indisponible." };
  const abo = ((simulation.data as { abonnement?: AbonnementFermeture }).abonnement ?? {}) as AbonnementFermeture;
  if (abo.payee_en_cours && !choix) {
    return { erreur: "Un abonnement payé est en cours : choisissez, avec le titulaire, la fin de la période payée ou une fermeture à quatorze jours avec remboursement de la part non utilisée." };
  }

  let remboursement: { facture: string; montant_cents: number } | null = null;
  let annuler: (() => Promise<unknown>) | null = null;
  const verrou = abo.vivante && abo.organisation ? await prendreVerrouFacturation(service, abo.organisation, "resiliation") : null;
  if (verrou && !verrou.ok) return { erreur: verrou.erreur };
  try {
    if (abo.vivante) {
      const reglages = configurationStripe();
      if (!reglages.pret) return { erreur: "Une souscription est en cours mais le paiement en ligne n'est pas configuré ici : rien n'a été programmé." };
      const stripe = verrou && verrou.ok ? verrou.proteger(clientStripe(reglages.config)) : clientStripe(reglages.config);
      const preparation = await preparerStripeFermeture(stripe, abo, abo.payee_en_cours ? choix : null);
      if (!preparation.ok) return { erreur: `Stripe : ${preparation.erreur} Rien n'a été programmé.` };
      remboursement = preparation.remboursement;
      annuler = () => annulerStripeFermeture(stripe, abo, abo.payee_en_cours ? choix : null);
    }
    const { data, error } = await service.rpc("programmer_fermeture_compte", {
      p_account: accountId,
      p_origine: "super_admin",
      p_choix: abo.payee_en_cours ? choix : null,
      p_demande_id: demandeId,
      p_par: droit.uid,
      p_remboursement: remboursement,
    });
    if (error || !data) {
      if (annuler) await annuler();
      return { erreur: error ? sansJargon(error.message) : "La programmation n'est pas confirmée : réessayez." };
    }
    const r = data as { effacement_prevu_le: string };
    revalidatePath("/admin/donnees");
    return {
      succes: `Fermeture programmée : l'effacement aura lieu dans la nuit du ${jourEnLettres(r.effacement_prevu_le)}, après la sauvegarde du jour.${remboursement ? " Le remboursement de la part non utilisée sera fait à l'effacement." : ""}`,
    };
  } finally {
    if (verrou && verrou.ok) await verrou.rendre();
  }
}

/** « Annuler la fermeture » : avant l'effacement seulement ; l'arrêt posé chez Stripe est levé. */
export async function annulerFermetureCompte(_etat: EtatRetour, formulaire: FormData): Promise<EtatRetour> {
  const id = String(formulaire.get("fermeture_id") ?? "");
  const motif = String(formulaire.get("motif") ?? "").trim();
  if (!UUID.test(id)) return { erreur: "Fermeture inconnue : rechargez la page." };
  const droit = await superviseur();
  if ("erreur" in droit) return { erreur: droit.erreur };
  const service = clientDeService();
  if (!service) return { erreur: "La clé de service n'est pas configurée sur ce serveur." };
  const { data, error } = await service.rpc("annuler_fermeture_compte", { p_fermeture: id, p_motif: motif });
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "L'annulation n'est pas confirmée." };
  revalidatePath("/admin/donnees");
  const r = data as { choix: ChoixFermeture | null; abonnement: AbonnementFermeture };
  if (!r.abonnement?.vivante) return { succes: "Fermeture annulée : rien ne sera effacé." };
  const reglages = configurationStripe();
  const verrou = r.abonnement.organisation ? await prendreVerrouFacturation(service, r.abonnement.organisation, "resiliation") : null;
  const reprise = reglages.pret && verrou?.ok
    ? await annulerStripeFermeture(verrou.proteger(clientStripe(reglages.config)), r.abonnement, r.choix).finally(() => verrou.rendre())
    : { ok: false as const, erreur: "paiement en ligne ou verrou indisponible" };
  return reprise.ok
    ? { succes: "Fermeture annulée : rien ne sera effacé, et l'abonnement continue chez Stripe." }
    : { succes: "Fermeture annulée : rien ne sera effacé. L'arrêt programmé chez Stripe n'a pas pu être levé : levez-le dans le tableau de bord Stripe." };
}

/** « Geler » (litige, créance : motif écrit) ou « Lever le gel » (motif vide). */
export async function gelerFermetureCompte(_etat: EtatRetour, formulaire: FormData): Promise<EtatRetour> {
  const id = String(formulaire.get("fermeture_id") ?? "");
  const motif = String(formulaire.get("motif") ?? "").trim();
  if (!UUID.test(id)) return { erreur: "Fermeture inconnue : rechargez la page." };
  const droit = await superviseur();
  if ("erreur" in droit) return { erreur: droit.erreur };
  const session = await createClient();
  const { error } = await session.rpc("geler_fermeture_compte", { p_fermeture: id, p_motif: motif === "" ? null : motif });
  if (error) return { erreur: sansJargon(error.message) };
  revalidatePath("/admin/donnees");
  return { succes: motif === "" ? "Gel levé : la fermeture s'exécutera à sa date." : "Fermeture gelée : rien ne sera effacé tant que le gel est posé." };
}
