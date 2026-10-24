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
//
// RELECTURES ADVERSES DU 24/10. L'exécution et l'accusé vivent dans lib/retractation-execution.ts, partagé avec la
// reprise de nuit (I4) ; l'accusé reprend la déclaration ENREGISTRÉE ; une déclaration déjà exécutée et accusée qu'on
// confirme de nouveau reçoit une copie de son accusé (M5) ; la date saisie par la supervision est lue à l'heure de Paris
// quel que soit le fuseau du serveur (point 4).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { clientStripe, configurationStripe, messageStripePourClient } from "@/lib/stripe";
import { MESSAGE_SESSION_EXPIREE } from "@/lib/session-expiree";
import { envoyerAccuseRetractation, envoyerReceptionRetractation, lireContexteCourrier } from "@/lib/courriers-contrat-envoi";
import { declarationRetractation, heureParis, type NatureRetractation } from "@/lib/courriers-contrat";
import { etatRetractation, type LigneRetractation } from "@/lib/retractation-etat";
import { ligneRetractationDuResponsable, ligneRetractationParLeService } from "@/lib/retractation-serveur";
import { terminerRetractation, type DeclarationRetractation } from "@/lib/retractation-execution";
import { jourEnLettres, retractationOuverte } from "@/lib/delai-retractation";
import { instantParis } from "@/lib/dates-supervision";
import { dateParis } from "@/lib/heure-paris-calcul";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";
import { ArretSupervision } from "@/lib/controle-effets";

export type EtatRetractationAction = { erreur?: string };

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lireNature(v: FormDataEntryValue | null): NatureRetractation | null {
  return v === "abonnement" || v === "passage_annuel" ? v : null;
}

/** Une empreinte courte et stable (FNV-1a, 32 bits) : distingue deux adresses dans une clé d'envoi sans l'y écrire. */
function empreinteCourte(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
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
    // Relecture adverse du 24/10 (point 4) : le champ « date et heure » est saisi à l'heure de Paris ; le serveur
    // (UTC sur l'hébergeur) ne doit pas le lire à la sienne. Une heure inexistante ou ambiguë (changement d'heure)
    // n'est jamais devinée.
    const saisie = instantParis(String(formData.get("recue_le") ?? ""));
    const recue = saisie ? new Date(saisie) : null;
    if (!recue || recue.getTime() > Date.now()) {
      return {
        erreur: "Indiquez la date et l'heure de réception de la déclaration (heure de Paris), sans date future ni heure ambiguë du changement d'heure.",
      };
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

  // (2) La déclaration, enregistrée avant tout geste chez Stripe. Rejouée, elle rend la ligne telle qu'enregistrée.
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
  const r = ((enregistree ?? []) as DeclarationRetractation[])[0];
  if (erreurEnregistrement || !r) return { erreur: "Votre déclaration n'a pas pu être enregistrée. Réessayez dans un instant, ou écrivez-nous." };
  const recueLe = new Date(r.declaree_le);
  const enregistreeLe = `Votre déclaration est bien enregistrée (le ${jourEnLettres(dateParis(recueLe))} à ${heureParis(recueLe)}, heure de Paris).`;

  // (3), (4) et (5) L'exécution chez Stripe sous le verrou, consignée une fois, puis l'accusé, une fois — à l'adresse
  // saisie maintenant par le client.
  const issue = await terminerRetractation(service, stripe, r, { destinataire: adresse });
  if (issue.etat === "verrou") return { erreur: `${enregistreeLe} ${issue.erreur}` };
  if (issue.etat === "execution_impossible") {
    // Relecture adverse du 24/10 (I4) : l'accusé de réception de la déclaration part sans délai (L. 221-21), même si
    // son exécution attend ; l'accusé complet suivra (nouvel essai, ou reprise de nuit).
    const reception = await envoyerReceptionRetractation(service, {
      retractationId: r.id,
      cle: r.cle,
      destinataire: adresse,
      nature,
      organisation: contexte.organisation,
      declaration: r.texte_declaration,
      declareeLe: recueLe,
    }).catch((e: unknown) => {
      if (e instanceof ArretSupervision) throw e;
      return { envoye: false };
    });
    return {
      erreur: `${enregistreeLe}${reception.envoye ? " L'accusé de réception de votre déclaration vous est envoyé par courriel." : ""} Son exécution n'a pas pu être confirmée (${issue.erreur.replace(/[\s.]+$/, "")}) : réessayez dans un instant. À défaut, nous la terminons nous-mêmes dans le délai de remboursement.`,
    };
  }
  if (issue.etat === "accuse_impossible") {
    return {
      erreur: `${enregistreeLe} La rétractation est exécutée, mais l'accusé de réception n'a pas pu partir (${issue.motif}) : réessayez dans un instant pour le recevoir.`,
    };
  }
  // Relecture adverse du 24/10 (M5) : la page invite à confirmer de nouveau si l'accusé n'est pas parvenu. Une
  // déclaration déjà exécutée et accusée reçoit alors une copie de son accusé (une par adresse et par dizaine de
  // minutes : un double clic n'en envoie pas deux), à l'adresse saisie maintenant.
  if (issue.accuseDejaEnvoye && !r.nouvelle) {
    const aujourdhui = dateParis(new Date());
    const copie = await envoyerAccuseRetractation(service, {
      retractationId: r.id,
      cle: r.cle,
      copie: `${Math.floor(Date.now() / 600_000)}-${empreinteCourte(adresse.toLowerCase())}`,
      destinataire: adresse,
      nature,
      organisation: contexte.organisation,
      declaration: r.texte_declaration,
      declareeLe: recueLe,
      montantRembourseCents: issue.montantCents,
      essaiFin: nature === "abonnement" && contexte.essai_fin && contexte.essai_fin >= aujourdhui ? contexte.essai_fin : null,
      passageEffectue: issue.passageEffectue,
      mensualiteCents: issue.mensualiteCents,
    }).catch((e: unknown) => {
      if (e instanceof ArretSupervision) throw e;
      return { envoye: false, motif: "envoi impossible" };
    });
    if (!copie.envoye) {
      return { erreur: `${enregistreeLe} La rétractation est exécutée ; la copie de l'accusé de réception n'a pas pu partir (${copie.motif ?? "envoi impossible"}) : réessayez dans un instant.` };
    }
  }
  redirect(`${await baseDeLOrganisation(supabase, orgId)}/abonnement?retractation=${nature === "abonnement" ? "abonnement" : "passage"}`);
}
