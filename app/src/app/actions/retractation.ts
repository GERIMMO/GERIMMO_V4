"use server";

// LA RÉTRACTATION EN LIGNE (plan de conformité du 23/10/2026, R01 et R37 ; décision 5 : remboursement intégral).
//
// « Renoncer au contrat ici » : le responsable déclare, depuis son espace, renoncer à son abonnement (ou au passage de
// son abonnement à l'annuel) pendant le délai. Ouvert à toutes les formules, sans chercher à savoir si le client est un
// consommateur (choix 2 du plan). Ouvert aussi en lecture seule : la table et les écritures de service sont hors de la
// garde des comptes gelés.
//
// L'ORDRE, ET POURQUOI. (1) Droits et délai vérifiés ici, à l'heure du serveur. (2) La déclaration est enregistrée
// AVANT toute écriture chez Stripe (`retractation_enregistrer`, clé stable) : sa date est celle du clic, et un échec
// ensuite ne la perd pas. (3) Stripe : fin de la souscription et remboursements, ou retour au mensuel — sous le verrou
// des gestes de facturation, chaque écriture avec sa clé d'idempotence. (4) L'exécution est consignée. (5) L'accusé
// part, une fois. Rejouer l'action reprend là où elle s'est arrêtée, sans rien doubler.
//
// UNE RÉTRACTATION REÇUE PAR COURRIEL est saisie ici par le super-administrateur permanent (second facteur), avec sa
// date de réception : même délai, même exécution, même accusé.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { clientStripe, configurationStripe, messageStripePourClient } from "@/lib/stripe";
import { REGIME_TVA } from "@/lib/editeur";
import { MESSAGE_SESSION_EXPIREE } from "@/lib/session-expiree";
import { envoyerAccuseRetractation, lireContexteCourrier } from "@/lib/courriers-contrat-envoi";
import { declarationRetractation, heureParis, type NatureRetractation } from "@/lib/courriers-contrat";
import { etatRetractation, type LigneRetractation } from "@/lib/retractation-etat";
import { ligneRetractationDuResponsable, ligneRetractationParLeService } from "@/lib/retractation-serveur";
import { jourEnLettres, retractationOuverte } from "@/lib/delai-retractation";
import { retracterPassageAnnuel, retracterSouscription, type ExecutionRetractation } from "@/lib/retractation-stripe";
import { choixExplicite } from "@/lib/stripe-offres";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";
import { dateParis } from "@/lib/heure-paris-calcul";
import { formuleParCode, offreFormule, offreParticulier } from "@/lib/tarifs";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import { ArretSupervision } from "@/lib/controle-effets";

export type EtatRetractationAction = { erreur?: string };

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lireNature(v: FormDataEntryValue | null): NatureRetractation | null {
  return v === "abonnement" || v === "passage_annuel" ? v : null;
}

/** La clé stable d'une déclaration : une par souscription, ou par demande de passage à l'annuel. */
function cleRetractation(nature: NatureRetractation, subscription: string, demandeLe: Date | null): string {
  return nature === "abonnement"
    ? `retractation-abonnement-${subscription}`
    : `retractation-passage-${subscription}-${Math.floor((demandeLe?.getTime() ?? 0) / 1000)}`;
}

export async function retracterAbonnement(
  orgId: string,
  _etat: EtatRetractationAction,
  formData: FormData
): Promise<EtatRetractationAction> {
  const nature = lireNature(formData.get("nature"));
  if (!nature) return { erreur: "Choisissez ce à quoi vous renoncez." };
  const nom = String(formData.get("nom") ?? "").replace(/\s+/g, " ").trim();
  if (nom.length < 2 || nom.length > 200) return { erreur: "Indiquez votre nom et votre prénom." };
  const adresse = String(formData.get("adresse") ?? "").trim();
  if (!ADRESSE.test(adresse) || adresse.length > 320 || /[\r\n]/.test(adresse)) {
    return { erreur: "Indiquez une adresse électronique valide pour recevoir l'accusé de réception." };
  }
  const reglages = configurationStripe();
  if (!reglages.pret) return { erreur: "Le paiement en ligne n'est pas ouvert : écrivez-nous, nous enregistrons votre rétractation." };
  const service = clientDeService();
  if (!service) return { erreur: "Le service est momentanément indisponible. Réessayez dans un instant, ou écrivez-nous." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: MESSAGE_SESSION_EXPIREE };

  // (1) Les droits : le responsable de l'espace (ma_retractation ne rend rien à un autre), ou le super-administrateur
  // permanent qui saisit une rétractation reçue par courriel.
  const lue = await ligneRetractationDuResponsable(supabase, orgId);
  if (lue === undefined) return { erreur: "Votre abonnement n'a pas pu être lu. Rechargez la page." };
  let ligne: LigneRetractation | null = lue;
  let canal: "en_ligne" | "courriel" = "en_ligne";
  let declareeLe: Date | null = null;
  if (!ligne) {
    const { data: superviseur } = await supabase.rpc("is_permanent_super_admin");
    if (superviseur !== true) return { erreur: "Réservé au responsable de l'espace." };
    const recue = new Date(String(formData.get("recue_le") ?? ""));
    if (!Number.isFinite(recue.getTime()) || recue.getTime() > Date.now()) {
      return { erreur: "Indiquez la date et l'heure de réception du courriel de rétractation." };
    }
    canal = "courriel";
    declareeLe = recue;
    ligne = await ligneRetractationParLeService(service, orgId);
    if (!ligne) return { erreur: "L'abonnement de cet espace n'a pas pu être lu." };
  }

  const contexte = await lireContexteCourrier(service, orgId).catch(() => null);
  const subscription = contexte?.stripe_subscription_id ?? null;
  if (!contexte || !subscription) return { erreur: "Aucun abonnement en cours pour cet espace." };

  const stripe = clientStripe(reglages.config);
  let conclusionStripe: Date | null = null;
  if (!ligne.souscrit_le) {
    try {
      const s = await stripe.subscriptions.retrieve(subscription);
      conclusionStripe = typeof s.start_date === "number" ? new Date(s.start_date * 1000) : null;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      return { erreur: messageStripePourClient(e) };
    }
  }
  const instant = declareeLe ?? new Date();
  const etat = etatRetractation(ligne, instant, conclusionStripe);
  const droit = nature === "abonnement" ? etat.abonnement : etat.passage;
  if (!droit.conclusion) return { erreur: "Il n'y a pas de délai de rétractation en cours pour cet abonnement." };
  // Une déclaration déjà enregistrée se reprend (exécution ou accusé restés en chemin), même après le délai.
  if (!droit.declareeLe && !retractationOuverte(droit.conclusion, instant)) {
    return {
      erreur: `Le délai de rétractation a pris fin le ${jourEnLettres(droit.dernierJour ?? dateParis(instant))} à 23 h 59 (heure de Paris). Vous pouvez résilier votre abonnement depuis « Mon abonnement ».`,
    };
  }

  // (2) La déclaration, enregistrée avant tout geste chez Stripe.
  const estAgence = contexte.public_tarif === "agence";
  const texte = declarationRetractation({ nature, formule: contexte.formule, estAgence, organisation: contexte.organisation, reference: droit.conclusion, nom });
  const cle = cleRetractation(nature, subscription, nature === "passage_annuel" ? droit.conclusion : null);
  const { data: enregistree, error: erreurEnregistrement } = await service.rpc("retractation_enregistrer", {
    p_org: orgId,
    p_subscription: subscription,
    p_nature: nature,
    p_cle: cle,
    p_texte: texte,
    p_adresse: adresse,
    p_account: user.id,
    p_canal: canal,
    p_declaree_le: declareeLe?.toISOString() ?? null,
    p_passage_demande_le: nature === "passage_annuel" ? droit.conclusion.toISOString() : null,
  });
  const r = ((enregistree ?? []) as {
    id: string;
    declaree_le: string;
    executee_le: string | null;
    accuse_envoye_le: string | null;
    montant_rembourse_cents: number | string;
  }[])[0];
  if (erreurEnregistrement || !r) return { erreur: "Votre déclaration n'a pas pu être enregistrée. Réessayez dans un instant, ou écrivez-nous." };
  const recueLe = new Date(r.declaree_le);
  const enregistreeLe = `Votre déclaration est bien enregistrée (le ${jourEnLettres(dateParis(recueLe))} à ${heureParis(recueLe)}, heure de Paris).`;

  // (3) et (4) L'exécution chez Stripe, sous le verrou des gestes de facturation, puis consignée.
  let montantCents = Number(r.montant_rembourse_cents) || 0;
  let passageEffectue = etat.passage.effectue;
  if (!r.executee_le) {
    const verrou = await prendreVerrouFacturation(service, orgId, nature === "abonnement" ? "resiliation" : "periodicite");
    if (!verrou.ok) return { erreur: `${enregistreeLe} ${verrou.erreur}` };
    try {
      const sous = verrou.proteger(stripe);
      let execution: ExecutionRetractation & { passageEffectue?: boolean };
      if (nature === "abonnement") {
        execution = await retracterSouscription(sous, { subscription, cle });
      } else {
        if (!REGIME_TVA) return { erreur: `${enregistreeLe} Le régime de TVA de l'éditeur manque : écrivez-nous, nous terminons la rétractation.` };
        const s = await sous.subscriptions.retrieve(subscription);
        const formule = formuleParCode(contexte.formule);
        const capacite = contexte.unites_souscrites ?? formule?.biens ?? 1;
        const offreMensuelle = formule ? (offreFormule(formule, capacite, "mensuel") ?? offreParticulier(capacite, "mensuel")) : offreParticulier(capacite, "mensuel");
        execution = await retracterPassageAnnuel(sous, {
          subscription,
          cle,
          orgId,
          offreMensuelle,
          regime: REGIME_TVA,
          demandeLe: droit.conclusion,
          choix: choixExplicite(s) ? "explicite" : "auto",
        });
        if (!execution.passageEffectue) await service.rpc("retractation_passage_annuel_annuler", { p_org: orgId });
        passageEffectue = Boolean(execution.passageEffectue);
      }
      const { error: erreurExecution } = await service.rpc("retractation_executee", {
        p_id: r.id,
        p_montant_cents: execution.montantCents,
        p_refunds: execution.refunds,
      });
      if (erreurExecution) console.error("[rétractation] exécution non consignée :", erreurExecution.message.slice(0, 200));
      montantCents = execution.montantCents;
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      await service.from("tech_log").insert({ evenement: "retractation_a_terminer", details: { organisation: orgId, retractation: r.id, nature } });
      return {
        erreur: `${enregistreeLe} Son exécution n'a pas pu être confirmée par notre prestataire de paiement (${messageStripePourClient(e).replace(/[\s.]+$/, "")}) : réessayez dans un instant. À défaut, nous la terminons nous-mêmes dans le délai de remboursement.`,
      };
    } finally {
      await verrou.rendre();
    }
  }

  // (5) L'accusé, une fois.
  if (!r.accuse_envoye_le) {
    const aujourdhui = dateParis(new Date());
    const essaiFin = nature === "abonnement" && contexte.essai_fin && contexte.essai_fin >= aujourdhui ? contexte.essai_fin : null;
    const accuse = await envoyerAccuseRetractation(service, {
      retractationId: r.id,
      cle,
      destinataire: adresse,
      nature,
      organisation: contexte.organisation,
      declaration: texte,
      declareeLe: recueLe,
      montantRembourseCents: montantCents,
      essaiFin,
      passageEffectue,
    }).catch((e: unknown) => {
      if (e instanceof ArretSupervision) throw e;
      return { envoye: false, motif: "envoi impossible" };
    });
    if (!accuse.envoye) {
      return {
        erreur: `${enregistreeLe} La rétractation est exécutée, mais l'accusé de réception n'a pas pu partir (${accuse.motif ?? "envoi impossible"}) : réessayez dans un instant pour le recevoir.`,
      };
    }
  }
  redirect(`${await baseDeLOrganisation(supabase, orgId)}/abonnement?retractation=${nature === "abonnement" ? "abonnement" : "passage"}`);
}
