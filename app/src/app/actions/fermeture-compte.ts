"use server";

// LA FERMETURE D'UN COMPTE, DÉCLENCHÉE PAR LE SUPER-ADMINISTRATEUR (plan de conformité du 23/10/2026, R15).
//
// Avant le 30/11, la fermeture se programme depuis /admin/donnees, sur une demande « Données personnelles » du titulaire
// (le libre-service « Fermer mon compte » suivra au lot 5). Réservé au super-administrateur permanent, second facteur
// compris (`is_permanent_super_admin()`). La clé de service ne sert qu'après ce contrôle :
//  1. bilan sans effacement (`simuler_fermeture_compte`) ;
//  2. si une souscription Stripe vit encore : état relevé, puis arrêt à la date d'effet (fin de la période payée, ou J+14
//     avec un remboursement de la part non utilisée), sous le verrou des gestes de facturation ; refus avant tout geste
//     si plusieurs souscriptions vivent, ou si le compte laisserait une souscription à des gestionnaires restants ;
//  3. programmation en base (`programmer_fermeture_compte`), qui fixe la date d'effet et enregistre le bilan ; refusée,
//     l'arrêt posé chez Stripe est défait.
// L'effacement lui-même a lieu la nuit de la date d'effet (pg_cron « fermetures-comptes »), après la sauvegarde du jour.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { clientStripe, configurationStripe } from "@/lib/stripe";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";
import { annulerStripeFermeture, preparerStripeFermeture, type AbonnementFermeture, type EtatStripeAvant } from "@/lib/comptes-fermeture-serveur";
import { nuitDu, type ChoixFermeture } from "@/lib/comptes-fermeture";
import type { EtatRetour } from "./retours";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BilanSimulationAffiche = {
  erreur?: string;
  bilan?: {
    organisations_effacees: { organisation: string; nom: string | null; biens: number; lots: number; baux: number; personnes: number; documents: number; fichiers: number; membres_invites: number; demandes_zoho: number }[];
    adhesions_retirees: number;
    souscriptions_laissees?: string[];
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
  // Déjà programmée (second clic, autre onglet) : refus AVANT tout geste Stripe — défaire l'arrêt d'un second essai
  // lèverait celui de la fermeture déjà programmée.
  const existante = await service.from("fermetures_comptes").select("id").eq("account_id", accountId).eq("statut", "programmee").limit(1).maybeSingle();
  if (existante.error) return { erreur: "Les fermetures programmées sont illisibles : rien n'a été programmé." };
  if (existante.data) return { erreur: "Une fermeture est déjà programmée pour ce compte." };

  const simulation = await service.rpc("simuler_fermeture_compte", { p_account: accountId });
  if (simulation.error || !simulation.data) return { erreur: simulation.error ? sansJargon(simulation.error.message) : "Le bilan est indisponible." };
  const lu = simulation.data as { abonnement?: AbonnementFermeture; souscriptions_laissees?: string[] };
  const abo = (lu.abonnement ?? {}) as AbonnementFermeture;
  if ((abo.souscriptions_vivantes ?? 0) > 1) {
    return { erreur: "Les espaces à effacer portent plusieurs souscriptions en cours : résiliez-les d’abord une à une, puis programmez la fermeture." };
  }
  if ((lu.souscriptions_laissees ?? []).length > 0) {
    return { erreur: "Ce compte est le dernier titulaire d’un espace qui garde d’autres gestionnaires et une souscription en cours : faites transmettre la titularité ou résilier la souscription d’abord. Rien n’a été programmé." };
  }
  if (abo.payee_en_cours && !choix) {
    return { erreur: "Un abonnement payé est en cours : choisissez, avec le titulaire, la fin de la période payée ou une fermeture à quatorze jours avec remboursement de la part non utilisée." };
  }

  let remboursement: { montant_cents: number; factures: { facture: string; montant_cents: number }[] } | null = null;
  let avant: EtatStripeAvant | null = null;
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
      avant = preparation.avant ?? null;
      annuler = () => annulerStripeFermeture(stripe, abo, abo.payee_en_cours ? choix : null, avant);
    }
    const { data, error } = await service.rpc("programmer_fermeture_compte", {
      p_account: accountId,
      p_origine: "super_admin",
      p_choix: abo.payee_en_cours ? choix : null,
      p_demande_id: demandeId,
      p_par: droit.uid,
      p_remboursement: remboursement,
      p_stripe_avant: avant,
    });
    if (error || !data) {
      // 23505 : une fermeture a été programmée entre-temps ; son arrêt Stripe est le même et doit rester.
      if (annuler && (error as { code?: string } | null)?.code !== "23505") await annuler();
      return { erreur: error ? sansJargon(error.message) : "La programmation n'est pas confirmée : réessayez." };
    }
    const r = data as { effacement_prevu_le: string };
    revalidatePath("/admin/donnees");
    return {
      succes: `Fermeture programmée : l’effacement aura lieu dans la ${nuitDu(r.effacement_prevu_le)}, après la sauvegarde du jour.${remboursement ? " Le remboursement de la part non utilisée sera fait dès l’arrêt de la souscription chez Stripe, cette même nuit." : ""}`,
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
  const r = data as { choix: ChoixFermeture | null; abonnement: AbonnementFermeture; stripe_avant?: EtatStripeAvant | null };
  if (!r.abonnement?.vivante) return { succes: "Fermeture annulée : rien ne sera effacé." };
  const reglages = configurationStripe();
  const verrou = r.abonnement.organisation ? await prendreVerrouFacturation(service, r.abonnement.organisation, "resiliation") : null;
  const reprise = reglages.pret && verrou?.ok
    ? await annulerStripeFermeture(verrou.proteger(clientStripe(reglages.config)), r.abonnement, r.choix, r.stripe_avant ?? null).finally(() => verrou.rendre())
    : { ok: false as const, erreur: "paiement en ligne ou verrou indisponible" };
  if (!reprise.ok) {
    return { succes: "Fermeture annulée : rien ne sera effacé. L’état d’avant n’a pas pu être remis chez Stripe : remettez-le dans le tableau de bord Stripe (date d’arrêt retirée, ou résiliation demandée par le client gardée)." };
  }
  return {
    succes: `Fermeture annulée : rien ne sera effacé, et l’abonnement revient à son état d’avant la fermeture chez Stripe.${reprise.echeancierNonRetabli
      ? " Le changement de formule programmé avant la fermeture a été levé et ne revient pas : le titulaire doit le reprogrammer depuis « Mon abonnement »."
      : ""}`,
  };
}

/** « Enregistrer le nouveau bilan » : après un refus « bilan changé », la supervision relit et enregistre le périmètre réel. */
export async function enregistrerNouveauBilan(_etat: EtatRetour, formulaire: FormData): Promise<EtatRetour> {
  const id = String(formulaire.get("fermeture_id") ?? "");
  if (!UUID.test(id)) return { erreur: "Fermeture inconnue : rechargez la page." };
  const droit = await superviseur();
  if ("erreur" in droit) return { erreur: droit.erreur };
  const session = await createClient();
  const { data: ligne, error: lecture } = await session.from("fermetures_comptes").select("account_id").eq("id", id).eq("statut", "programmee").maybeSingle();
  if (lecture || !ligne) return { erreur: "Aucune fermeture programmée sous cet identifiant." };
  const { data, error } = await session.rpc("simuler_fermeture_compte", { p_account: (ligne as { account_id: string }).account_id, p_fermeture: id });
  if (error || !data) return { erreur: error ? sansJargon(error.message) : "Le bilan n’a pas pu être enregistré." };
  revalidatePath("/admin/donnees");
  const b = data as { organisations_effacees?: unknown[]; adhesions_retirees?: number };
  const espaces = b.organisations_effacees?.length ?? 0;
  const acces = b.adhesions_retirees ?? 0;
  return {
    succes: `Nouveau bilan enregistré : ${espaces === 0 ? "aucun espace effacé entièrement" : espaces === 1 ? "1 espace effacé entièrement" : `${espaces} espaces effacés entièrement`}, ${acces === 0 ? "aucun accès retiré" : acces === 1 ? "1 accès retiré" : `${acces} accès retirés`}. La fermeture s’exécutera la nuit suivante.`,
  };
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
