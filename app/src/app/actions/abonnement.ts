"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import {
  assurerClientStripe,
  clientStripe,
  configurationStripe,
  ouvrirPortailFacturation,
  verifierClientDeLOrganisation,
} from "@/lib/stripe";
import { origineDeRetour } from "@/lib/site";
import { CONDITIONS_VERSION, REGIME_TVA } from "@/lib/editeur";
import {
  ERREUR_ACCEPTATION_CONDITIONS,
  ERREUR_CONDITIONS_PERIMEES,
  MOTIF_CONDITIONS_A_ACCEPTER,
  estLaVersionEnVigueur,
} from "@/lib/garde-souscription";
import { conditionsEnVigueurAccepteesPar, lireMotifIdentiteEditeur } from "@/lib/garde-souscription-serveur";
import { MESSAGE_SESSION_EXPIREE } from "@/lib/session-expiree";
import {
  GRILLE,
  apercuChangement,
  appliquerHausse,
  libererEcheancierDe,
  offrePour,
  resilierAEcheance,
  type ChoixOffre,
  type EchecHausse,
} from "@/lib/stripe-offres";
import { ouvrirPageDePaiementUnique, registreDeService } from "@/lib/souscription-unique";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";
import { clientDeService } from "@/lib/supabase/service";
import { offreAgence, offreParticulier, type Offre, type Periodicite } from "@/lib/tarifs";
import { baseEspace } from "@/lib/racine-espace";
import { baseDeLOrganisation } from "@/lib/racine-espace-serveur";

export type EtatAbonnementAction = { erreur?: string; succes?: boolean };

/**
 * L'adresse de retour, prise sur la requête en cours.
 *
 * Stripe exige des adresses ABSOLUES : une action serveur n'a pas d'origine
 * implicite. On la lit dans les en-têtes plutôt que de la fixer en dur, sans
 * quoi une recette sur un déploiement de préproduction renverrait le client en
 * production après paiement.
 *
 * C'est ce que le commentaire promettait ; ce n'est ce que le code fait que
 * depuis le 12/09. `NEXT_PUBLIC_SITE_URL` passait AVANT l'en-tête : posée sur
 * tous les environnements Vercel — ce que personne ne pense à éviter — elle
 * renvoyait bel et bien en production un client qui payait depuis une
 * préproduction. La priorité vit désormais dans `origineDeRetour`, avec la
 * raison écrite à côté.
 */
async function origineDeLaRequete(): Promise<string | null> {
  const h = await headers();
  return origineDeRetour(
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto")
  );
}

/**
 * Souscrire : ouvrir la page de paiement de Stripe.
 *
 * QUI PEUT L'APPELER. `mon_client_stripe` vérifie les droits du responsable.
 * L'association au dossier Stripe est ensuite enregistrée par le serveur,
 * après vérification de son appartenance à l'organisation. Le remplacement
 * d'un client Stripe supprimé et la sortie de la grille historique exigent
 * aussi cette vérification des droits (audit 29/09). La clé de Stripe
 * utilisée ici ne donne accès qu'à la facturation.
 *
 * ELLE MARCHE MÊME SI LE COMPTE EST FERMÉ, et c'est le point délicat : la garde
 * d'écriture des comptes suspendus exclut délibérément les tables d'abonnement
 * (migration 20260911300000). Sans cette exclusion, le client ne pourrait pas
 * payer parce qu'il n'a pas payé.
 *
 * DEUX GARDES DE CONTRAT (lot B3, 19/10/2026 ; lib/garde-souscription.ts),
 * après les motifs Stripe et TVA et avant tout appel à Stripe : l'identité de
 * l'éditeur, lue dans `supervision_identite` par-dessus le code (souscription
 * ET hausse, sauf levée explicite par le superadmin) ; la version en vigueur des conditions générales, acceptée par le
 * compte qui clique, dans `acceptations_cgu` (souscription seulement). L'écran
 * dit les mêmes phrases et propose la case qui enregistre l'acceptation
 * (`accepterConditionsGenerales`).
 */
type EtatAbonnementLu = {
  statut: string;
  /** Faux quand le compte est gelé en lecture seule (essai arrivé à son terme, défaut de paiement). */
  ecriture_ouverte: boolean;
  essai_fin: string | null;
  public_tarif: "agence" | "proprietaire_direct";
  unites_facturees: number;
  en_ligne_possible: boolean;
  grille: string;
  unites_a_couvrir: number | null;
  unites_souscrites: number | null;
};

type PaiementLu = {
  souscrit: boolean;
  periodicite: Periodicite;
  formule: string | null;
  unites_souscrites: number | null;
  montant_periode_cents: number | null;
  stripe_statut: string | null;
};

/** Le régime de TVA déclaré — sans lui, aucune souscription de la nouvelle grille. */
const REGIME_ABSENT =
  "Le paiement en ligne n'est pas encore ouvert : le régime de TVA de l'éditeur doit d'abord être renseigné pour afficher les taxes exactes. Écrivez-nous : nous prolongeons votre essai le temps de l'ouvrir.";

/**
 * L'essai court-il encore ? Statut « essai » ET écriture ouverte : un essai
 * arrivé à son terme garde son statut, seule l'écriture se ferme
 * (public.org_ecriture_ouverte). C'est le `enEssai` de lib/garde-souscription.ts.
 */
function essaiEnCours(etat: EtatAbonnementLu): boolean {
  return etat.statut === "essai" && etat.ecriture_ouverte;
}

function lirePeriodicite(v: FormDataEntryValue | null): Periodicite | null {
  return v === "mensuel" || v === "annuel" ? v : null;
}

function lireEntier(v: FormDataEntryValue | null): number | null {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isSafeInteger(n) ? n : null;
}

async function lireEtat(orgId: string) {
  const supabase = await createClient();
  const [{ data: org }, { data: etatBrut, error: erreurEtat }, { data: paiementBrut, error: erreurPaiement }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, type, email_contact").eq("id", orgId).maybeSingle(),
      supabase.rpc("etat_abonnement", { p_org: orgId }),
      supabase.rpc("mon_abonnement", { p_org: orgId }),
    ]);
  return {
    supabase,
    org: org as { id: string; name: string; type: string; email_contact: string | null } | null,
    etat: ((etatBrut ?? []) as EtatAbonnementLu[])[0] ?? null,
    paiement: ((paiementBrut ?? []) as PaiementLu[])[0] ?? null,
    erreur: erreurEtat?.message ?? erreurPaiement?.message ?? null,
  };
}

/**
 * « explicite » quand l'offre coûte plus que celle qui couvre le portefeuille
 * d'aujourd'hui : le client a choisi une formule supérieure (ou des lots en
 * réserve). La tâche de nuit ne la rabaisse pas d'elle-même à l'échéance.
 */
function choixDe(offre: Offre, unitesACouvrir: number): ChoixOffre {
  const couvrante =
    offre.public === "agence" ? offreAgence(unitesACouvrir) : offreParticulier(unitesACouvrir, offre.periodicite);
  return offre.montantCents > couvrante.montantCents || offre.capacite > Math.max(couvrante.capacite, unitesACouvrir)
    ? "explicite"
    : "auto";
}

/**
 * Le client Stripe de l'organisation, retrouvé, créé ou REMPLACÉ, puis
 * enregistré. Un client supprimé chez Stripe (audit 29/09, point 12) est
 * remplacé par le chemin de service : `abonnement_client_pose` ne remplace
 * jamais un client existant, et c'est voulu — l'identifiant suivi ne vient
 * pas du navigateur. Le remplacement n'a lieu qu'après que `mon_client_stripe`
 * (réservée au responsable) a rendu l'ancien identifiant, et que Stripe a dit,
 * à nous, qu'il est supprimé.
 */
async function assurerEtEnregistrerClient(
  stripe: ReturnType<typeof clientStripe>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  org: { name: string; email_contact: string | null }
): Promise<{ ok: true; customer: string } | { ok: false; erreur: string }> {
  const { data: clientExistant, error: erreurLecture } = await supabase.rpc("mon_client_stripe", { p_org: orgId });
  if (erreurLecture) return { ok: false, erreur: "Impossible de vérifier vos droits sur ce dossier de paiement. Réessayez." };
  const existant = (clientExistant as string | null) ?? null;
  const client = await assurerClientStripe(stripe, {
    orgId,
    nom: org.name,
    email: org.email_contact ?? null,
    existant,
  });
  if (!client.ok) return client;
  // Le client Stripe doit porter l'identifiant de CETTE organisation, relu
  // chez Stripe par le serveur, avant tout enregistrement (audit sécurité
  // 29/09).
  const appartient = await verifierClientDeLOrganisation(stripe, client.customer, orgId);
  if (!appartient.ok) return appartient;
  if (client.remplace && existant) {
    const service = clientDeService();
    if (!service) {
      return { ok: false, erreur: "Votre dossier de paiement doit être recréé : écrivez-nous, nous le faisons aussitôt." };
    }
    const { error } = await service.rpc("abonnement_client_remplace", {
      p_org: orgId,
      p_ancien: existant,
      p_nouveau: client.customer,
    });
    if (error) return { ok: false, erreur: sansJargon(error.message) };
    return { ok: true, customer: client.customer };
  }
  // On enregistre le client AVANT d'ouvrir la page de paiement. Dans l'autre
  // ordre, un client qui paie puis ferme son onglet laisserait un webhook
  // portant un identifiant qu'on ne saurait rattacher à personne.
  const service = clientDeService();
  if (!service) return { ok: false, erreur: "Le service de paiement est momentanément indisponible. Réessayez plus tard." };
  const { error: erreurPose } = await service.rpc("abonnement_client_pose", {
    p_org: orgId,
    p_customer: client.customer,
  });
  if (erreurPose) return { ok: false, erreur: sansJargon(erreurPose.message) };
  return { ok: true, customer: client.customer };
}

/**
 * Souscrire : ouvrir la page de paiement de Stripe, avec le MONTANT que le
 * client vient de lire. Grille du 28/09/2026 : formule et périodicité
 * choisies, formule plus chère que nécessaire seulement si elle est choisie
 * explicitement, case de confirmation cochée, montant recalculé ici et
 * comparé à celui qui a été affiché — un écart refuse la souscription.
 */
export async function demarrerAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const { supabase, org, etat, paiement, erreur } = await lireEtat(orgId);
  if (erreur) return { erreur: sansJargon(erreur) };
  if (!org || !etat) return { erreur: "Votre organisation n'a pas pu être lue. Rechargez la page." };
  if (etat.grille !== GRILLE) return basculerVersGrilleActuelle(orgId, paiement);

  if (paiement?.souscrit) {
    return { erreur: "Un abonnement est déjà en cours : changez de formule depuis cette page plutôt que d'en ouvrir un second." };
  }
  if (formData.get("confirmation") !== "oui") {
    return { erreur: "Cochez la case de confirmation après avoir vérifié le montant." };
  }
  const reglages = configurationStripe();
  if (!reglages.pret) {
    return { erreur: "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous : nous prolongeons votre accès le temps de le mettre en place." };
  }
  if (!REGIME_TVA) return { erreur: REGIME_ABSENT };

  // Lot B3 (19/10) : deux conditions de contrat, après les motifs Stripe et
  // TVA (le banc local sans clés garde sa phrase) et AVANT tout appel à Stripe.
  // 1. L'identité de l'éditeur, lue en base par-dessus le code : sans mentions
  //    légales complètes, pas de paiement — même phrase qu'à l'écran. Une
  //    lecture en échec ferme aussi. « Votre essai continue » seulement si
  //    l'essai court encore (un essai gelé garde le statut « essai »).
  const motifIdentite = await lireMotifIdentiteEditeur(essaiEnCours(etat));
  if (motifIdentite) return { erreur: motifIdentite };
  // 2. La version en vigueur des conditions, acceptée par LE COMPTE qui clique.
  //    L'écran propose la case qui l'enregistre (accepterConditionsGenerales) ;
  //    ici on vérifie seulement : cette action n'enregistre rien.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erreur: MESSAGE_SESSION_EXPIREE };
  if (!(await conditionsEnVigueurAccepteesPar(supabase, user.id))) return { erreur: MOTIF_CONDITIONS_A_ACCEPTER };

  const estAgence = etat.public_tarif === "agence";
  const periodicite: Periodicite = estAgence ? "mensuel" : (lirePeriodicite(formData.get("periodicite")) ?? "mensuel");
  const unites = etat.unites_a_couvrir ?? 0;
  const offre = estAgence
    ? offreAgence(unites)
    : offrePour("proprietaire_direct", unites, periodicite, String(formData.get("formule") ?? "") || offreParticulier(unites, periodicite).formule.code);
  if (!offre) {
    return { erreur: `Cette formule ne couvre pas vos ${unites} biens : choisissez une formule qui les couvre.` };
  }
  if (lireEntier(formData.get("montant_attendu_cents")) !== offre.montantCents) {
    return { erreur: "Le montant a changé depuis l'affichage (votre portefeuille a évolué) : vérifiez le récapitulatif mis à jour, puis confirmez à nouveau." };
  }

  const origine = await origineDeLaRequete();
  if (!origine) return { erreur: "L'adresse du site n'a pas pu être déterminée. Rechargez la page." };

  const stripe = clientStripe(reglages.config);
  const client = await assurerEtEnregistrerClient(stripe, supabase, orgId, org);
  if (!client.ok) return { erreur: client.erreur };

  // Décision D27 : au retour du paiement, le propriétaire direct revient sous /espace/<id>.
  const retour = `${origine}${baseEspace(orgId, !estAgence)}/abonnement`;
  // Défaut A01 (audit du 23/10/2026) : une seule page de paiement par
  // organisation, réservée en base avant tout appel qui en ouvre une ; deux
  // onglets reçoivent la même (lib/souscription-unique.ts).
  const service = clientDeService();
  if (!service) return { erreur: "Le service de paiement est momentanément indisponible. Réessayez plus tard." };
  const session = await ouvrirPageDePaiementUnique(stripe, registreDeService(service), {
    offre,
    regime: REGIME_TVA,
    customer: client.customer,
    orgId,
    retourOk: `${retour}?paiement=ok`,
    retourAnnule: `${retour}?paiement=annule`,
    essaiFin: etat.statut === "essai" ? etat.essai_fin : null,
    choix: choixDe(offre, unites),
  });
  if (!session.ok) return { erreur: session.erreur };
  redirect(session.url);
}

/**
 * La phrase d'une hausse refusée (défaut A02, audit du 23/10/2026) : elle dit
 * ce qui est SÛR. « Rien n'a été modifié » seulement si l'échéancier programmé
 * est resté en place ou a été recréé à l'identique ; sinon, la phrase dit
 * qu'il doit être reprogrammé, et par qui.
 *
 * Relecture adverse du 23/10 : une hausse « incertaine » ne recopie pas un
 * motif qui affirmerait « Rien n'a été prélevé » ; une hausse sans échéancier
 * ne parle pas d'un changement programmé qu'il n'y a pas ; un échéancier retiré
 * AILLEURS (libération refusée par Stripe) est dit comme tel. Le motif est
 * toujours en français (`messageStripePourClient`).
 */
function phraseHausseRefusee(r: EchecHausse, signalee: boolean): string {
  const motif = r.erreur.replace(/[\s.]+$/, "");
  const reprogrammer = signalee
    ? "doit être reprogrammé : nous nous en occupons."
    : "doit être reprogrammé, mais le signalement automatique a échoué : écrivez-nous pour que nous le reprogrammions.";
  if (r.hausse === "incertaine") {
    const incertaine =
      "Notre prestataire de paiement n'a pas confirmé si la hausse a été appliquée. Rechargez la page dans un instant pour voir votre abonnement à jour, avant toute nouvelle tentative.";
    return r.echeancier === "a_reprogrammer"
      ? `${incertaine} Votre changement programmé pour la prochaine échéance ${reprogrammer}`
      : incertaine;
  }
  if (r.echeancier === "a_reprogrammer" && r.liberationRefusee) {
    return `La hausse n'a pas été appliquée et rien n'a été prélevé : votre changement programmé pour la prochaine échéance venait d'être retiré ou modifié par ailleurs (autre onglet ?). Ce changement ${reprogrammer} Rechargez la page avant toute nouvelle tentative.`;
  }
  if (r.echeancier === "a_reprogrammer") {
    return `La hausse n'a pas été appliquée : ${motif}. Votre changement programmé pour la prochaine échéance a été retiré pendant la tentative et ${reprogrammer}`;
  }
  return `Le changement n'a pas été appliqué, rien n'a été modifié : ${r.erreur}`;
}

/**
 * La trace durable d'une hausse refusée qui a touché à l'échéancier :
 * ses étapes externes, dans `audit_log` (`abonnement_hausse_tracer`). Un échec
 * d'écriture ne change pas la réponse au client : il reste au journal serveur.
 */
async function tracerHausseRefusee(orgId: string, r: EchecHausse): Promise<void> {
  if (r.echeancier === "intouche" && r.hausse === "non_appliquee") return;
  const issue = r.hausse === "incertaine" ? "hausse_incertaine" : r.echeancier === "restaure" ? "echeancier_restaure" : "echeancier_a_reprogrammer";
  const service = clientDeService();
  const { error } = service
    ? await service.rpc("abonnement_hausse_tracer", { p_org: orgId, p_issue: issue, p_etapes: r.etapes })
    : { error: { message: "clé de service absente" } };
  if (error) console.error("[stripe hausse] trace non écrite :", issue, error.message.slice(0, 200));
}

/**
 * Confirmer une HAUSSE de capacité (formule supérieure, biens supplémentaires,
 * lots sous mandat). Le client a lu le nouveau montant, sa date d'effet et le
 * prorata calculé par Stripe ; on recalcule tout ici, avec la même date de
 * prorata, et l'on refuse si un seul chiffre a bougé. La capacité n'est
 * relevée en base que par le webhook, d'après ce que Stripe facture.
 */
export async function confirmerHausse(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const { supabase, etat, paiement, erreur } = await lireEtat(orgId);
  if (erreur) return { erreur: sansJargon(erreur) };
  if (!etat || !paiement) return { erreur: "Votre abonnement n'a pas pu être lu. Rechargez la page." };
  if (etat.grille !== GRILLE || !paiement.souscrit) {
    return { erreur: "Aucun abonnement de la grille actuelle n'est en cours pour cette organisation." };
  }
  if (formData.get("confirmation") !== "oui") {
    return { erreur: "Cochez la case de confirmation après avoir vérifié le nouveau montant." };
  }
  const reglages = configurationStripe();
  if (!reglages.pret) return { erreur: "Le paiement en ligne n'est pas ouvert." };
  if (!REGIME_TVA) return { erreur: REGIME_ABSENT };
  // Lot B3 (19/10) : une hausse est un paiement ; sans l'identité complète de
  // l'éditeur, elle attend aussi. Les conditions ne sont pas redemandées : le
  // contrat est déjà formé (arbitrage du 19/10). Un client abonné n'est pas
  // en essai : la phrase s'arrête avant « Votre essai continue ».
  const motifIdentite = await lireMotifIdentiteEditeur(essaiEnCours(etat));
  if (motifIdentite) return { erreur: motifIdentite };

  const unites = lireEntier(formData.get("unites"));
  if (unites === null || unites < Math.max(1, etat.unites_a_couvrir ?? 0)) {
    return { erreur: "La capacité demandée doit couvrir au moins votre portefeuille actuel." };
  }
  const offre = offrePour(etat.public_tarif, unites, paiement.periodicite, String(formData.get("formule") ?? ""));
  if (!offre) return { erreur: "Cette formule ne couvre pas le nombre de biens demandé." };
  // Une hausse de CAPACITÉ au même prix reste une hausse à confirmer (une
  // agence de 5 lots qui en confie un 6ᵉ reste dans le socle) : elle n'est
  // refusée que si elle n'augmente ni le montant ni la capacité.
  if (
    (paiement.montant_periode_cents ?? 0) >= offre.montantCents &&
    offre.capacite <= (paiement.unites_souscrites ?? 0)
  ) {
    return { erreur: "Ce changement ne coûte pas plus cher : une baisse s'applique d'elle-même à la prochaine échéance." };
  }
  if (lireEntier(formData.get("montant_attendu_cents")) !== offre.montantCents) {
    return { erreur: "Le montant a changé depuis l'affichage : vérifiez le récapitulatif mis à jour." };
  }
  const prorationDate = lireEntier(formData.get("proration_date"));
  if (!prorationDate) return { erreur: "Le calcul du prorata a expiré : rechargez la page." };

  const { data: souscription } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
  if (!souscription) return { erreur: "Votre souscription n'a pas pu être retrouvée. Rechargez la page." };
  // Relecture adverse du 23/10 (A02) : un geste de facturation à la fois pour l'organisation. Pris APRÈS la
  // vérification des droits (ma_souscription_stripe ne rend rien à un autre que le responsable) et AVANT l'aperçu :
  // un second onglet qui passerait après la hausse verrait un prorata différent et serait refusé.
  const verrou = await prendreVerrouFacturation(clientDeService(), orgId, "hausse");
  if (!verrou.ok) return { erreur: verrou.erreur };
  try {
    const stripe = clientStripe(reglages.config);
    const apercu = await apercuChangement(stripe, {
      subscription: souscription as string,
      offre,
      regime: REGIME_TVA,
      maintenant: prorationDate,
    });
    if (!apercu.ok) return { erreur: apercu.erreur };
    if (apercu.immediatCents !== lireEntier(formData.get("immediat_attendu_cents"))) {
      return { erreur: "Le prorata a changé depuis l'affichage : vérifiez le montant mis à jour, puis confirmez à nouveau." };
    }
    const r = await appliquerHausse(stripe, {
      subscription: souscription as string,
      offre,
      regime: REGIME_TVA,
      orgId,
      prorationDate,
      choix: choixDe(offre, etat.unites_a_couvrir ?? 0),
    });
    if (!r.ok) {
      // Défaut A02 : un échéancier retiré et non recréé (ou une hausse incertaine)
      // fait recalculer l'échéance par la tâche de nuit — le même signal que
      // sur le chemin de réussite ci-dessous, qui était le seul à le poser.
      let signalee = true;
      if (r.echeancier === "a_reprogrammer") {
        const { error } = await supabase.rpc("abonnement_changements_a_recalculer", { p_org: orgId });
        if (error) {
          signalee = false;
          console.error("[stripe hausse] échéance non marquée à recalculer :", error.message.slice(0, 200));
        }
      }
      await tracerHausseRefusee(orgId, r);
      return { erreur: phraseHausseRefusee(r, signalee) };
    }
    // L'échéancier libéré emportait une baisse ou une périodicité programmée :
    // la tâche de nuit la reprogrammera, sur la nouvelle offre.
    if (r.echeancierLibere) await supabase.rpc("abonnement_changements_a_recalculer", { p_org: orgId });
  } finally {
    await verrou.rendre();
  }
  redirect(`${baseEspace(orgId, etat.public_tarif === "proprietaire_direct")}/abonnement?changement=ok`);
}

/**
 * Accepter la version en vigueur des conditions générales depuis « Mon
 * abonnement » (lot B3, 19/10). La case du formulaire de souscription
 * l'appelle quand le compte n'a pas encore d'acceptation pour cette version ;
 * une fois la ligne écrite, le bouton de paiement se débloque, et
 * `demarrerAbonnement` retrouve l'acceptation en base.
 *
 * La version acceptée est celle que l'écran a AFFICHÉE (champ `cgu_version`) :
 * si elle n'est plus celle du serveur — page restée ouverte pendant un
 * déploiement —, on refuse plutôt que d'enregistrer l'accord sur un texte que
 * la personne n'a pas lu. La RPC `accepter_cgu` écrit à l'heure du serveur,
 * pour le compte connecté, en ajout seul ; la source est 'compte', la valeur
 * existante la plus proche (aucune migration ; la RPC y ramène toute autre
 * valeur). Rien n'est renvoyé que la décision : le client affiche la phrase ou
 * débloque le bouton.
 */
export async function accepterConditionsGenerales(
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  if (!estLaVersionEnVigueur(formData.get("cgu_version"))) return { erreur: ERREUR_CONDITIONS_PERIMEES };
  if (formData.get("cgu") !== "oui") return { erreur: MOTIF_CONDITIONS_A_ACCEPTER };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accepter_cgu", { p_version: CONDITIONS_VERSION, p_source: "compte" });
  if (error) return { erreur: ERREUR_ACCEPTATION_CONDITIONS };
  return { succes: true };
}

/**
 * Demander une autre périodicité pour la prochaine échéance (particuliers),
 * ou revenir sur cette demande. Un échéancier déjà programmé par la tâche de
 * nuit est libéré (audit 29/09, point 5) : sinon, une demande ANNULÉE
 * s'appliquerait quand même à l'échéance. La tâche de nuit reprogramme ce qui
 * reste à faire (la demande remet l'échéance « à préparer »).
 */
export async function demanderPeriodicite(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const periodicite = lirePeriodicite(formData.get("periodicite"));
  if (!periodicite) return { erreur: "Choisissez mensuel ou annuel." };
  const supabase = await createClient();
  const reglages = configurationStripe();
  // Relecture adverse du 23/10 (A02) : la libération de l'échéancier ne se croise plus avec une hausse en cours, qui
  // le reposerait. Le verrou est pris après la vérification des droits (ma_souscription_stripe), avant la demande.
  const souscription = reglages.pret
    ? ((await supabase.rpc("ma_souscription_stripe", { p_org: orgId })).data as string | null)
    : null;
  const verrou = souscription ? await prendreVerrouFacturation(clientDeService(), orgId, "periodicite") : null;
  if (verrou && !verrou.ok) return { erreur: verrou.erreur };
  try {
    const { error } = await supabase.rpc("demander_periodicite_suivante", {
      p_org: orgId,
      p_periodicite: periodicite,
    });
    if (error) return { erreur: sansJargon(error.message) };
    if (reglages.pret && souscription) {
      const r = await libererEcheancierDe(clientStripe(reglages.config), souscription);
      if (!r.ok) {
        return {
          erreur: `Votre demande est enregistrée, mais le changement déjà programmé chez notre prestataire de paiement n'a pas pu être retiré (${r.erreur.replace(/[\s.]+$/, "")}). Réessayez dans un instant.`,
        };
      }
    }
  } finally {
    if (verrou?.ok) await verrou.rendre();
  }
  redirect(`${await baseDeLOrganisation(supabase, orgId)}/abonnement?periodicite=programmee`);
}

/** Résilier pour la prochaine échéance, ou revenir sur cette résiliation. */
export async function resilierAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  formData: FormData
): Promise<EtatAbonnementAction> {
  const resilier = formData.get("resilier") === "oui";
  const reglages = configurationStripe();
  if (!reglages.pret) return { erreur: "Le paiement en ligne n'est pas ouvert." };
  const supabase = await createClient();
  const { data: souscription, error } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  if (!souscription) return { erreur: "Aucun abonnement en cours à résilier." };
  // Relecture adverse du 23/10 (A02) : jamais en même temps qu'une hausse, qui reposerait l'échéancier libéré ici.
  const verrou = await prendreVerrouFacturation(clientDeService(), orgId, "resiliation");
  if (!verrou.ok) return { erreur: verrou.erreur };
  try {
    const r = await resilierAEcheance(clientStripe(reglages.config), {
      subscription: souscription as string,
      resilier,
    });
    if (!r.ok) return { erreur: r.erreur };
    // Un échéancier libéré (audit 29/09, point 5) : si la résiliation est levée,
    // la tâche de nuit doit pouvoir reprogrammer l'échéance.
    if (r.echeancierLibere) await supabase.rpc("abonnement_changements_a_recalculer", { p_org: orgId });
  } finally {
    await verrou.rendre();
  }
  redirect(`${await baseDeLOrganisation(supabase, orgId)}/abonnement?resiliation=${resilier ? "programmee" : "annulee"}`);
}

/**
 * Grille historique : plus de nouvelle souscription à l'ancienne grille.
 *
 * Audit 29/09, point 10. Une organisation restée sur la grille historique SANS
 * souscription vivante tombait sur « votre premier bien est offert, il n'y a
 * rien à payer » — alors que la décision du 28/09 supprime cette gratuité et
 * gèle le compte jusqu'au paiement : une impasse. Elle bascule désormais sur
 * la grille actuelle (chemin de service, après la preuve que l'appelant est
 * le responsable : `mon_abonnement` ne rend rien à un autre), puis revient
 * sur « Mon abonnement », qui présente les formules et le montant exact avant
 * toute page de paiement. Celle qui paie encore à l'ancienne garde sa
 * souscription : elle se gère dans le portail.
 */
async function basculerVersGrilleActuelle(
  orgId: string,
  paiement: PaiementLu | null
): Promise<EtatAbonnementAction> {
  if (!paiement) return { erreur: "Réservé au responsable de l'organisation." };
  if (paiement.souscrit) {
    return {
      erreur:
        "Votre abonnement est en cours sur l'ancienne grille : il n'y a rien à souscrire de nouveau. Carte, factures et résiliation se règlent depuis « Carte et factures ».",
    };
  }
  const service = clientDeService();
  if (!service) {
    return { erreur: "La souscription n'a pas pu être ouverte. Écrivez-nous : nous prolongeons votre accès le temps de régler cela." };
  }
  const { error } = await service.rpc("abonnement_basculer_grille", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  redirect(`${await baseDeLOrganisation(service, orgId)}/abonnement?grille=actuelle`);
}

/**
 * L'espace de facturation : carte, factures, adresse, résiliation.
 *
 * Tout y est tenu par Stripe. Le réécrire prendrait des semaines pour un
 * résultat moins fiable — et une résiliation qu'on code soi-même est une
 * résiliation qu'on peut rater.
 */
export async function ouvrirPortailAbonnement(
  orgId: string,
  _etat: EtatAbonnementAction,
  _formData: FormData
): Promise<EtatAbonnementAction> {
  const reglages = configurationStripe();
  if (!reglages.pret) {
    return { erreur: "Le paiement en ligne n'est pas encore ouvert." };
  }
  const origine = await origineDeLaRequete();
  if (!origine) {
    return { erreur: "L'adresse du site n'a pas pu être déterminée. Rechargez la page." };
  }

  const supabase = await createClient();
  const { data: client, error } = await supabase.rpc("mon_client_stripe", { p_org: orgId });
  if (error) return { erreur: sansJargon(error.message) };
  if (!client) {
    return {
      erreur:
        "Aucun abonnement n'est encore ouvert pour cette organisation : il n'y a pas de facture à consulter.",
    };
  }

  const portail = await ouvrirPortailFacturation(clientStripe(reglages.config), {
    customer: client as string,
    retour: `${origine}${await baseDeLOrganisation(supabase, orgId)}/abonnement`,
  });
  if (!portail.ok) return { erreur: portail.erreur };
  redirect(portail.url);
}
