import { ConfirmationPaiement } from "./confirmation-paiement";
// « Mon abonnement » — grille du 28/09/2026.
//
// CE QUI EST TOUJOURS À L'ÉCRAN : le volume facturé, la formule, la
// périodicité, la prochaine échéance, le montant réellement facturé par Stripe
// et les changements programmés. Avant toute hausse : le nouveau montant, sa
// date d'effet et le prorata calculé par Stripe, puis une confirmation. Les
// montants viennent de lib/tarifs.ts — le même module que le site et Stripe.

import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Check, CreditCard, ShieldCheck, Users } from "lucide-react";
import styles from "./abonnement.module.css";
import { notFound } from "next/navigation";
import { BoutonPortail, BoutonResiliation, FormulaireHausse, FormulairePeriodicite } from "./boutons-abonnement";
import { DetailMontants, FormulaireSouscription } from "./formulaire-souscription";
import { REGIME_TVA } from "@/lib/editeur";
import { motifIdentiteEditeur } from "@/lib/garde-souscription";
import { lireGardeSouscription } from "@/lib/garde-souscription-serveur";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate } from "@/lib/ged";
import { clientStripe, configurationStripe } from "@/lib/stripe";
import { apercuChangement, datePremierPrelevement } from "@/lib/stripe-offres";
import { joursJusquaParis } from "@/lib/heure-paris-calcul";
import { dernierJourRetractation, jourEnLettres } from "@/lib/delai-retractation";
import { etatRetractation } from "@/lib/retractation-etat";
import { ligneRetractationDuResponsable } from "@/lib/retractation-serveur";
import {
  FORMULES_PARTICULIER,
  etiquetteTaxes,
  euros,
  formuleParCode,
  montantsOffre,
  offreAgence,
  offreFormule,
  offreParticulier,
  parPeriode,
  type Offre,
  type Periodicite,
} from "@/lib/tarifs";
import { EncadreLectureImpossible, EnteteReglages, statutAbonnement } from "../profil/famille-reglages";
import { baseEspace } from "@/lib/racine-espace";

type Etat = {
  statut: string;
  ecriture_ouverte: boolean;
  essai_fin: string | null;
  jours_essai_restants: number | null;
  public_tarif: "agence" | "proprietaire_direct";
  unites_a_couvrir: number | null;
  unites_souscrites: number | null;
};

type Paiement = {
  stripe_statut: string | null;
  paye: boolean;
  periode_fin: string | null;
  annulation_demandee: boolean;
  paiement_en_retard: boolean;
  lecture_seule_le: string | null;
  jours_avant_lecture_seule: number | null;
  periodicite: Periodicite;
  formule: string | null;
  unites_souscrites: number | null;
  montant_periode_cents: number | null;
  periodicite_suivante: Periodicite | null;
  souscrit: boolean;
};

function offreActuelle(p: Paiement, publicTarif: "agence" | "proprietaire_direct"): Offre | null {
  if (!p.souscrit || p.unites_souscrites === null) return null;
  if (publicTarif === "agence") return offreAgence(p.unites_souscrites);
  const f = formuleParCode(p.formule);
  return f ? offreFormule(f, p.unites_souscrites, p.periodicite) : null;
}

function libelleOffre(o: Offre): string {
  if (o.public === "agence") return o.lots <= 10 ? "Socle agence — jusqu’à 10 lots" : `Capacité agence — ${o.lots} lots`;
  return o.biensSupplementaires > 0
    ? `Formule ${o.formule.nom} + ${o.biensSupplementaires} bien${o.biensSupplementaires > 1 ? "s" : ""} supplémentaire${o.biensSupplementaires > 1 ? "s" : ""}`
    : `Formule ${o.formule.nom}`;
}

// Plan du 23/10 (R55) : un éditeur en franchise de TVA n'écrit ni « TTC » ni « HT » à côté d'un prix (aucune TVA
// facturée, article 8.4 des conditions) ; l'étiquette vient de `etiquetteTaxes`, comme sur le site public.
const TTC = etiquetteTaxes("ttc", REGIME_TVA);
const HT = etiquetteTaxes("ht", REGIME_TVA);
/** « 5,99 € » suivi de l'étiquette de taxe s'il y en a une. */
function avecTaxe(montant: string, etiquette: string | null): string {
  return etiquette ? `${montant} ${etiquette}` : montant;
}

function montantLu(o: Offre): string {
  const m = montantsOffre(o, REGIME_TVA);
  if (o.public === "agence") {
    return m.connu && HT
      ? `${euros(o.montantCents)} HT (${euros(m.ttcCents)} TTC) ${parPeriode(o.periodicite)}`
      : `${avecTaxe(euros(o.montantCents), HT)} ${parPeriode(o.periodicite)}`;
  }
  return `${avecTaxe(euros(o.montantCents), TTC)} ${parPeriode(o.periodicite)}`;
}

export async function PageAbonnement2026(props: PageProps<"/agence/[orgId]/abonnement">) {
  const { orgId } = await props.params;
  const recherche = await props.searchParams;
  const { supabase, user, organisation, role, estProprietaire } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  if (!["admin_agence", "proprietaire_direct"].includes(role)) notFound();
  const estAgence = organisation.type === "agence";
  const unite = estAgence ? "lot sous mandat" : "bien";

  const [{ data: etatBrut, error: erreurEtat }, { data: paiementBrut, error: erreurPaiement }, garde, ligneRetractation] = await Promise.all([
    supabase.rpc("etat_abonnement", { p_org: orgId }),
    supabase.rpc("mon_abonnement", { p_org: orgId }),
    // Lot B3 (19/10) : l'identité de l'éditeur (supervision_identite) et
    // l'acceptation, par ce compte, de la version en vigueur des conditions.
    lireGardeSouscription(supabase, user.id),
    // Plan du 23/10 (R01, R37) : le droit de rétractation, affiché même en lecture seule.
    ligneRetractationDuResponsable(supabase, orgId),
  ]);
  const retractation = etatRetractation(ligneRetractation ?? null);
  const etat = ((etatBrut ?? []) as Etat[])[0] ?? null;
  const paiement = ((paiementBrut ?? []) as Paiement[])[0] ?? null;
  if (erreurEtat || erreurPaiement || !etat || !paiement) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
        <EnteteReglages rubrique="abonnement" titre="Mon abonnement">L&apos;état de votre compte.</EnteteReglages>
        <EncadreLectureImpossible>
          L&apos;état de votre abonnement n&apos;a pas pu être lu. Ce n&apos;est pas un abonnement absent : rechargez
          la page dans un instant. Rien n&apos;est prélevé entre-temps.
        </EncadreLectureImpossible>
      </main>
    );
  }

  const publicTarif = etat.public_tarif;
  const enGestion = etat.unites_a_couvrir ?? 0;
  const ferme = !etat.ecriture_ouverte;
  const enEssai = etat.statut === "essai";
  const souscrit = paiement.souscrit;
  const actuelle = offreActuelle(paiement, publicTarif);
  const capacite = paiement.unites_souscrites;
  const reglages = configurationStripe();
  // Lot B3 : les mentions légales de l'éditeur manquent — même phrase que
  // l'action (lib/garde-souscription.ts), bouton indisponible, pas de case.
  // « Votre essai continue » seulement si l'essai court encore : un essai
  // arrivé à son terme garde le statut « essai » mais ferme l'écriture.
  const motifIdentite = motifIdentiteEditeur(garde.editeur, { enEssai: enEssai && !ferme, blocageIdentiteActif: garde.blocageIdentiteActif });
  const motifIndisponible = !reglages.pret
    ? "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous : nous prolongeons votre essai le temps de l'ouvrir."
    : !REGIME_TVA
      ? "Le paiement en ligne n'est pas encore ouvert : le régime de TVA de l'éditeur doit d'abord être renseigné pour afficher les taxes exactes. Écrivez-nous : nous prolongeons votre essai le temps de l'ouvrir."
      : motifIdentite;

  // ── La hausse à présenter : nécessaire (portefeuille au-delà de la capacité)
  // ou demandée (?capacite= pour une agence, ?formule= pour un particulier).
  let cible: Offre | null = null;
  if (souscrit && actuelle) {
    const demandeLots = Number.parseInt(String(recherche.capacite ?? ""), 10);
    const demandeFormule = formuleParCode(String(recherche.formule ?? ""));
    const demandeBiens = Number.parseInt(String(recherche.biens ?? ""), 10);
    if (publicTarif === "agence") {
      const lots = Math.max(enGestion, Number.isFinite(demandeLots) ? demandeLots : 0);
      if (lots > (capacite ?? 0)) cible = offreAgence(lots);
    } else if (Number.isFinite(demandeBiens) && demandeBiens > (capacite ?? 0)) {
      cible = offreParticulier(Math.max(enGestion, demandeBiens), paiement.periodicite);
    } else if (demandeFormule) {
      cible = offreFormule(demandeFormule, Math.max(enGestion, demandeFormule.biens), paiement.periodicite);
    } else if (enGestion > (capacite ?? 0)) {
      cible = offreParticulier(enGestion, paiement.periodicite);
    }
    // Audit 29/09, point 3 : une hausse de CAPACITÉ au même prix (agence
    // passée de 5 à 6 lots dans le socle) reste nécessaire — la garde refuse
    // le 6ᵉ lot tant qu'elle n'est pas confirmée. Seul ce qui n'augmente ni
    // le montant ni la capacité est écarté.
    if (cible && cible.montantCents <= actuelle.montantCents && cible.capacite <= (capacite ?? 0)) cible = null;
  }
  let apercu: { immediatCents: number; prorationDate: number; enEssai: boolean } | null = null;
  let erreurApercu: string | null = null;
  // Lot B3 : sans l'identité de l'éditeur, la hausse n'est pas présentée à la
  // confirmation (l'action la refuserait) ; le bloc dit le motif à sa place.
  if (cible && reglages.pret && REGIME_TVA && !motifIdentite) {
    const { data: souscription } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
    if (souscription) {
      const r = await apercuChangement(clientStripe(reglages.config), {
        subscription: souscription as string,
        offre: cible,
        regime: REGIME_TVA,
      });
      if (r.ok) apercu = r;
      else erreurApercu = r.erreur;
    }
  }

  // ── Les changements programmés, calculés comme la tâche de nuit les appliquera.
  // Comme la tâche de nuit : jamais au-delà de la capacité payée (une hausse
  // attend une confirmation, audit 29/09).
  const periodiciteSuivante = paiement.periodicite_suivante ?? paiement.periodicite;
  const baseEcheance = Math.min(enGestion, capacite ?? enGestion);
  const aEcheance: Offre | null =
    souscrit && actuelle && !paiement.annulation_demandee
      ? publicTarif === "agence"
        ? offreAgence(baseEcheance)
        : offreParticulier(baseEcheance, periodiciteSuivante)
      : null;
  const baisseProgrammee =
    aEcheance && actuelle && (aEcheance.montantCents < actuelle.montantCents || aEcheance.periodicite !== actuelle.periodicite)
      ? aEcheance
      : null;

  const premierPrelevement = enEssai ? datePremierPrelevement(etat.essai_fin) : null;
  const joursEssaiRestants = etat.essai_fin ? Math.max(0, joursJusquaParis(etat.essai_fin)) : null;
  const statut = statutAbonnement({
    paye: paiement.paye,
    essai: enEssai && !souscrit,
    ferme,
    enRetard: paiement.paiement_en_retard,
  });
  const retour = (cle: string) => (Array.isArray(recherche[cle]) ? recherche[cle]?.[0] : recherche[cle]);

  return (
    <main className={estAgence ? "mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7" : `mx-auto w-full space-y-5 p-4 sm:p-7 ${styles.page}`}>
      <EnteteReglages rubrique="abonnement" titre="Mon abonnement" mention={estAgence ? undefined : organisation.name}>
        {estAgence
          ? "Ce que vous payez, selon vos lots sous mandat, et l'état de votre compte."
          : "Votre formule, vos biens et votre facturation, en un coup d’œil."}
      </EnteteReglages>

      {retour("paiement") === "ok" && <ConfirmationPaiement confirme={paiement.paye && !ferme} />}
      {retour("paiement") === "annule" && (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm text-muted-foreground">
            Paiement interrompu : rien n&apos;a été prélevé, et rien n&apos;a changé.
          </p>
        </div>
      )}
      {retour("grille") === "actuelle" && (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm text-muted-foreground">
            Votre compte relève désormais des formules actuelles. Choisissez ci-dessous celle qui vous convient : le
            montant exact vous est présenté avant tout paiement.
          </p>
        </div>
      )}
      {retour("changement") === "ok" && (
        <div role="status" className="loc-carte border-l-4 border-l-[var(--success)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">Changement confirmé.</b>{" "}
            <span className="text-muted-foreground">
              Votre nouvelle capacité s&apos;applique dès que notre prestataire de paiement la confirme — quelques
              secondes. Vous pourrez alors reprendre la saisie qui l&apos;exigeait.
            </span>
          </p>
        </div>
      )}
      {retour("periodicite") === "programmee" && (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm text-muted-foreground">
            Changement de périodicité enregistré : il s&apos;appliquera à la prochaine échéance, sans rien changer à la
            période en cours.
          </p>
        </div>
      )}
      {retour("resiliation") && (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm text-muted-foreground">
            {retour("resiliation") === "programmee"
              ? retour("accuse") === "echec"
                ? "Résiliation enregistrée pour la prochaine échéance : votre accès payé reste entier jusque-là. L'accusé de réception n'a pas pu partir pour le moment : écrivez-nous si vous ne le recevez pas."
                : "Résiliation enregistrée pour la prochaine échéance : votre accès payé reste entier jusque-là. Un accusé de réception vous est envoyé par courriel."
              : "Résiliation annulée : votre abonnement se renouvelle normalement."}
          </p>
        </div>
      )}
      {retour("retractation") && (
        <div role="status" className="loc-carte border-l-4 border-l-[var(--success)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">Rétractation enregistrée.</b>{" "}
            <span className="text-muted-foreground">
              {retour("retractation") === "passage"
                ? "Votre abonnement reste ou redevient mensuel. L'accusé de réception vous est envoyé par courriel."
                : "Votre abonnement a pris fin ; ce que vous avez payé vous est remboursé intégralement. L'accusé de réception vous est envoyé par courriel."}
            </span>
          </p>
        </div>
      )}

      {paiement.paiement_en_retard && (
        <div role="alert" className={`loc-carte border-l-4 ${ferme ? "border-l-[var(--destructive)]" : "border-l-[var(--warning)]"}`}>
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              {ferme ? "Votre compte est en lecture seule, faute de règlement." : "Le dernier prélèvement n'est pas passé."}
            </b>{" "}
            <span className="text-muted-foreground">
              {ferme
                ? // Plan du 23/10 (R26) : ce qui est vrai en lecture seule, envois automatiques compris.
                  "Dès que le paiement aboutit, tout rouvre. Rien n'est supprimé du fait de l'impayé : vos données restent consultables et exportables. Les envois automatiques à vos locataires (appels de loyer, quittances, relances) sont interrompus jusque-là, sans rattrapage complet."
                : `Votre compte reste ouvert${paiement.lecture_seule_le ? ` jusqu'au ${formaterDate(paiement.lecture_seule_le)}` : ""}. Mettez votre moyen de paiement à jour ci-dessous.`}
            </span>
          </p>
        </div>
      )}

      {ferme && !paiement.paiement_en_retard && (
        <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">Votre compte est en lecture seule.</b>{" "}
            <span className="text-muted-foreground">
              {enEssai ? "Votre essai gratuit est arrivé à son terme." : "Vos droits d'accès payés ont pris fin."} Rien
              n&apos;a été supprimé : vous pouvez tout consulter et tout exporter. Souscrivez ci-dessous pour reprendre la
              saisie exactement où vous l&apos;avez laissée.
            </span>
          </p>
        </div>
      )}

      {estAgence && !ferme && enEssai && !souscrit && etat.essai_fin && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Essai gratuit jusqu&apos;au {formaterDate(etat.essai_fin)}
              {joursEssaiRestants !== null
                ? joursEssaiRestants === 0
                  ? " — dernier jour."
                  : ` — ${joursEssaiRestants} jour${joursEssaiRestants > 1 ? "s" : ""} restant${joursEssaiRestants > 1 ? "s" : ""}.`
                : "."}
            </b>{" "}
            <span className="text-muted-foreground">
              Aucune carte n&apos;est demandée pendant l&apos;essai, et rien ne sera prélevé sans votre accord. À son
              terme, la saisie se suspend jusqu&apos;à votre souscription ; vos données restent consultables et
              exportables. Souscrire avant la fin ne raccourcit pas l&apos;essai.
            </span>
          </p>
        </div>
      )}

      {/* PLAN DU 23/10 (R01, R37) : LE DROIT DE RÉTRACTATION, VISIBLE MÊME EN LECTURE SEULE, PENDANT TOUT LE DÉLAI. Une
          souscription que la base n'a pas encore datée (antérieure au 24/10) garde le bouton : la page de déclaration
          relit la date chez Stripe et dit si le délai court encore. */}
      {(retractation.abonnement.ouverte ||
        retractation.passage.ouverte ||
        (ligneRetractation?.abonnement_suivi && !ligneRetractation.souscrit_le && !ligneRetractation.retractation_abonnement_le)) && (
        <section className="loc-carte space-y-2 border-l-4 border-l-[var(--or)]" aria-labelledby="droit-retractation">
          <h2 id="droit-retractation" className="text-base">
            {retractation.abonnement.ouverte && retractation.abonnement.dernierJour
              ? `Droit de rétractation — jusqu'au ${jourEnLettres(retractation.abonnement.dernierJour)} inclus`
              : retractation.passage.ouverte && retractation.passage.dernierJour
                ? `Droit de rétractation du passage à l'annuel — jusqu'au ${jourEnLettres(retractation.passage.dernierJour)} inclus`
                : "Droit de rétractation"}
          </h2>
          <p className="mesure-lecture text-sm text-muted-foreground">
            {retractation.abonnement.ouverte || !retractation.passage.ouverte
              ? "Vous pouvez renoncer à votre abonnement, sans motif, pendant quatorze jours après la souscription : il prend fin aussitôt et ce que vous avez payé vous est remboursé intégralement."
              : retractation.passage.effectue
                ? "Vous pouvez renoncer au passage à la formule annuelle : votre abonnement redevient mensuel et l'échéance annuelle vous est remboursée intégralement."
                : "Vous pouvez renoncer au passage à la formule annuelle demandé : votre abonnement reste mensuel."}
          </p>
          <Link
            href={`${base}/abonnement/retractation${!retractation.abonnement.ouverte && retractation.passage.ouverte ? "?nature=passage_annuel" : ""}`}
            className="btn-secondaire inline-flex"
          >
            Renoncer au contrat ici
          </Link>
        </section>
      )}

      {/* L'ÉTAT, TOUJOURS VISIBLE. */}
      <div className={estAgence ? "loc-carte" : styles.synthese}>
        {!estAgence ? (
          <>
            <div className={styles.syntheseEntete}>
              <div className={styles.syntheseTitre}>
                <span className={styles.iconeSynthese}><ShieldCheck size={22} aria-hidden="true" /></span>
                <div>
                  <p className={styles.surtitre}>Votre situation actuelle</p>
                  <h2>{souscrit && actuelle ? libelleOffre(actuelle) : enEssai && !ferme ? "Votre essai Gerimmo" : "Votre espace propriétaire"}</h2>
                </div>
              </div>
              <span className={`puce ${statut.puce}`}>{statut.libelle}</span>
            </div>
            <div className={styles.indicateurs}>
              <div>
                <span><Building2 size={16} aria-hidden="true" /> Biens en gestion</span>
                <strong>{enGestion}{souscrit && capacite !== null && <small> / {capacite} inclus</small>}</strong>
                <Link href={`${base}/parc`}>Voir mes lots <ArrowRight size={13} aria-hidden="true" /></Link>
              </div>
              <div>
                <span><CalendarDays size={16} aria-hidden="true" /> {souscrit ? paiement.annulation_demandee ? "Fin de l’abonnement" : "Prochaine échéance" : enEssai ? "Fin de l’essai" : "Abonnement"}</span>
                <strong>{souscrit ? paiement.periode_fin ? formaterDate(paiement.periode_fin) : "À confirmer" : enEssai && etat.essai_fin ? formaterDate(etat.essai_fin) : "À souscrire"}</strong>
                <small>{!souscrit && enEssai && !ferme && joursEssaiRestants !== null
                  ? joursEssaiRestants === 0 ? "Dernier jour de votre essai" : `${joursEssaiRestants} jour${joursEssaiRestants > 1 ? "s" : ""} restant${joursEssaiRestants > 1 ? "s" : ""}`
                  : souscrit ? paiement.periodicite === "annuel" ? "Facturation annuelle" : "Facturation mensuelle" : "Vos données restent conservées"}</small>
              </div>
              <div>
                <span><CreditCard size={16} aria-hidden="true" /> {souscrit ? "Montant facturé" : "Prélèvement"}</span>
                <strong>{souscrit ? paiement.montant_periode_cents !== null ? euros(paiement.montant_periode_cents) : "À confirmer" : "Aucun"}</strong>
                <small>{souscrit ? (TTC ? `${TTC} ${parPeriode(paiement.periodicite)}` : parPeriode(paiement.periodicite)) : "Sans souscription, aucun prélèvement"}</small>
              </div>
            </div>
            {!ferme && enEssai && !souscrit && (
              <div className={styles.noteEssai}>
                <Check size={17} aria-hidden="true" />
                <p><strong>Profitez de tous vos jours d’essai.</strong> Souscrire maintenant ne raccourcit pas l’essai. Aucune carte n’est demandée pendant l’essai, aucun paiement sans votre accord.</p>
                <details><summary>À la fin de l’essai</summary><p>Sans souscription, la saisie se suspend. Vos données restent consultables et exportables.</p></details>
              </div>
            )}
            {actuelle && paiement.montant_periode_cents !== null && paiement.montant_periode_cents !== actuelle.montantCents && (
              <p className="mt-3 text-xs text-muted-foreground">Le montant facturé diffère de la grille ({euros(actuelle.montantCents)}) : votre avantage ou ancienne condition est conservé.</p>
            )}
          </>
        ) : (
          <>
        <div className="entete-carte">
          <h3>{souscrit && actuelle ? libelleOffre(actuelle) : "Aucun abonnement en cours"}</h3>
          <span className={`puce ${statut.puce}`}>{statut.libelle}</span>
        </div>
        <div className="ligne-info">
          <span>{estAgence ? "Lots sous mandat actif" : "Biens en gestion"}</span>
          <span className="montant font-medium">{enGestion}</span>
        </div>
        {souscrit && (
          <>
            <div className="ligne-info">
              <span>{estAgence ? "Capacité incluse dans votre abonnement" : "Capacité de votre formule"}</span>
              <span className="montant">{capacite ?? "—"}</span>
            </div>
            <div className="ligne-info">
              <span>Périodicité</span>
              <span className="montant">{paiement.periodicite === "annuel" ? "Annuelle" : "Mensuelle"}</span>
            </div>
            <div className="ligne-info">
              <span>Montant facturé</span>
              <span className="montant font-medium">
                {paiement.montant_periode_cents !== null
                  ? `${avecTaxe(euros(paiement.montant_periode_cents), estAgence ? HT : TTC)} ${parPeriode(paiement.periodicite)}`
                  : "—"}
              </span>
            </div>
            <div className="ligne-info">
              <span>{paiement.annulation_demandee ? "Fin de l'abonnement" : "Prochaine échéance"}</span>
              <span className="montant">{paiement.periode_fin ? formaterDate(paiement.periode_fin) : "—"}</span>
            </div>
            {actuelle && paiement.montant_periode_cents !== null && paiement.montant_periode_cents !== actuelle.montantCents && (
              <p className="mt-2 text-xs text-muted-foreground">
                Le montant facturé diffère de la grille pour cette capacité ({euros(actuelle.montantCents)}) : il reflète un
                avantage ou une ancienne condition, conservé tel quel.
              </p>
            )}
          </>
        )}

          </>
        )}

        {souscrit && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="libelle-champ mb-1">Changements programmés</p>
            {paiement.annulation_demandee ? (
              <p className="text-sm">
                Résiliation au {paiement.periode_fin ? formaterDate(paiement.periode_fin) : "terme de la période"} : l&apos;accès
                payé reste entier d&apos;ici là, puis le compte passe en lecture seule, données conservées.
              </p>
            ) : baisseProgrammee ? (
              <p className="text-sm">
                À l&apos;échéance du {paiement.periode_fin ? formaterDate(paiement.periode_fin) : "—"} : {libelleOffre(baisseProgrammee)},{" "}
                {montantLu(baisseProgrammee)}
                {baisseProgrammee.periodicite === "annuel" && baisseProgrammee.periodicite !== paiement.periodicite
                  ? " (prélevés en une fois pour douze mois)"
                  : ""}
                . Sans prorata : la période en cours reste acquise.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun.</p>
            )}
          </div>
        )}
      </div>

      {/* SOUSCRIRE : récapitulatif avant paiement. */}
      {!souscrit && (
        <section className={estAgence ? "loc-carte" : styles.choix} aria-labelledby="choisir-abonnement">
          <div className={estAgence ? "entete-carte" : styles.titreSection}>
            <h2 id="choisir-abonnement">{ferme ? "Reprendre avec un abonnement" : "Choisir ma formule"}</h2>
            {!estAgence && <p>Toutes les fonctionnalités sont incluses. Choisissez simplement la capacité qui vous convient.</p>}
          </div>
          <FormulaireSouscription
            orgId={orgId}
            publicTarif={publicTarif}
            unites={enGestion}
            regime={REGIME_TVA}
            premierPrelevement={premierPrelevement}
            ferme={ferme}
            motifIndisponible={motifIndisponible}
            conditionsAAccepter={!garde.conditionsAcceptees}
            dateLimiteRetractation={jourEnLettres(dernierJourRetractation(new Date()))}
          />
        </section>
      )}

      {/* UNE HAUSSE : montant, date d'effet, prorata, confirmation. */}
      {souscrit && cible && actuelle && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <div className="entete-carte">
            <h3>{enGestion > (capacite ?? 0) ? "Votre portefeuille dépasse votre abonnement" : "Changer de formule"}</h3>
          </div>
          <p className="mesure-lecture mb-3 text-sm text-muted-foreground">
            {enGestion > (capacite ?? 0)
              ? `Vous gérez ${enGestion} ${unite}${enGestion > 1 ? "s" : ""} pour une capacité de ${capacite}. Les données déjà saisies restent intactes ; tout nouvel ajout attend votre accord sur le montant ci-dessous.`
              : "Voici ce que changerait cette formule. Rien n'est appliqué sans votre confirmation."}
          </p>
          <div className="ligne-info">
            <span>Aujourd&apos;hui</span>
            <span className="montant">{libelleOffre(actuelle)} — {montantLu(actuelle)}</span>
          </div>
          <div className="ligne-info font-medium">
            <span className="!text-foreground">Nouveau</span>
            <span className="montant">{libelleOffre(cible)} — {montantLu(cible)}</span>
          </div>
          <div className="mt-2">
            <DetailMontants offre={cible} regime={REGIME_TVA} />
          </div>
          <ul className="mesure-lecture mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Date d&apos;effet : dès votre confirmation.</li>
            <li>
              {apercu
                ? apercu.enEssai
                  ? "Prorata : aucun — vous êtes encore en essai ; le premier prélèvement portera le nouveau montant."
                  : `Prorata prélevé aujourd'hui pour la fin de la période en cours : ${euros(apercu.immediatCents)} (calcul de notre prestataire de paiement).`
                : erreurApercu
                  ? `Le prorata n'a pas pu être calculé (${erreurApercu}) : le changement ne peut pas être confirmé pour l'instant.`
                  : // Lot B3 : quand un motif ferme le paiement, il prend la place de
                    // la promesse de prorata — pas les deux à la fois.
                    (motifIndisponible ?? "Le prorata sera calculé par notre prestataire de paiement avant confirmation.")}
            </li>
            <li>
              Puis {montantLu(cible)} à chaque échéance
              {paiement.periode_fin ? `, à partir du ${formaterDate(paiement.periode_fin)}` : ""}.
            </li>
          </ul>
          {apercu && (
            <div className="mt-3">
              <FormulaireHausse
                orgId={orgId}
                unites={cible.capacite}
                formule={cible.public === "particulier" ? cible.formule.code : null}
                montantCents={cible.montantCents}
                immediatCents={apercu.immediatCents}
                prorationDate={apercu.prorationDate}
                libelleConfirmation={`J'accepte le nouveau montant de ${montantLu(cible)}${apercu.immediatCents > 0 ? ` et le prélèvement immédiat de ${euros(apercu.immediatCents)} au prorata` : ""}.`}
              />
            </div>
          )}
        </div>
      )}

      {/* GÉRER : formules supérieures, périodicité, résiliation, factures. */}
      {souscrit && (
        <div className={estAgence ? "loc-carte space-y-4" : `loc-carte space-y-4 ${styles.gestion}`}>
          <div className="entete-carte">
            <h2>Gérer mon abonnement</h2>
          </div>
          {!estAgence && actuelle?.public === "particulier" && (
            <div>
              <p className="libelle-champ mb-1">Formules supérieures</p>
              <ul className="space-y-1 text-sm">
                {FORMULES_PARTICULIER.filter((f) => f.biens > (capacite ?? 0)).map((f) => (
                  <li key={f.code}>
                    <Link href={`${base}/abonnement?formule=${f.code}`} className="underline">
                      {f.nom} — jusqu&apos;à {f.biens} biens,{" "}
                      {avecTaxe(euros(paiement.periodicite === "annuel" ? f.annuelCents : f.mensuelCents), TTC)} {parPeriode(paiement.periodicite)}
                    </Link>
                  </li>
                ))}
                {(capacite ?? 0) >= 20 && (
                  <li className="text-muted-foreground">
                    Au-delà de 20 biens, chaque bien supplémentaire coûte {paiement.periodicite === "annuel" ? `${avecTaxe("10 €", TTC)} par an` : `${avecTaxe("1 €", TTC)} par mois`} ; il vous sera présenté à l&apos;ajout.
                  </li>
                )}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Une formule inférieure s&apos;applique d&apos;elle-même à la prochaine échéance quand votre nombre de biens le
                permet.
              </p>
            </div>
          )}
          {!estAgence && !paiement.annulation_demandee && (
            <div className="space-y-2">
              <p className="libelle-champ">Périodicité</p>
              {paiement.periodicite_suivante && paiement.periodicite_suivante !== paiement.periodicite ? (
                <>
                  <p className="text-sm">
                    Passage {paiement.periodicite_suivante === "annuel" ? "à l'annuel" : "au mensuel"} programmé à la
                    prochaine échéance.
                  </p>
                  <FormulairePeriodicite orgId={orgId} vers={paiement.periodicite} libelle="Garder la périodicité actuelle" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {paiement.periodicite === "mensuel"
                      ? `En annuel : ${avecTaxe(euros(offreParticulier(enGestion, "annuel").montantCents), TTC)} prélevés en une fois pour douze mois (deux mois offerts), à partir de la prochaine échéance. La demande de passage à l'annuel ouvre un nouveau délai de rétractation de quatorze jours.`
                      : `En mensuel : ${avecTaxe(euros(offreParticulier(enGestion, "mensuel").montantCents), TTC)} par mois, sans engagement, à partir de la fin de l'année payée.`}{" "}
                    La période en cours n&apos;est jamais convertie.
                  </p>
                  <FormulairePeriodicite
                    orgId={orgId}
                    vers={paiement.periodicite === "mensuel" ? "annuel" : "mensuel"}
                    libelle={paiement.periodicite === "mensuel" ? "Passer à l'annuel à l'échéance" : "Passer au mensuel à l'échéance"}
                  />
                </>
              )}
            </div>
          )}
          <div className="space-y-2">
            <p className="libelle-champ">Résiliation</p>
            <p className="text-sm text-muted-foreground">
              {paiement.periodicite === "annuel"
                ? "L'abonnement annuel se renouvelle pour douze mois à sa date anniversaire. Résilié, il prend fin à l'échéance annuelle : l'accès payé reste ouvert jusque-là."
                : "Sans engagement : résilié, l'abonnement prend fin à la prochaine échéance mensuelle ; l'accès payé reste ouvert jusque-là."}{" "}
              Ensuite, vos données restent consultables et exportables, en lecture seule — rien n&apos;est supprimé
              automatiquement.
            </p>
            {/* Plan du 23/10 (R04) : un seul chemin de résiliation, la page « Résilier votre contrat » (récapitulatif,
                date de fin, accusé de réception) ; le portail de paiement ne résilie plus. */}
            {paiement.annulation_demandee ? (
              <BoutonResiliation orgId={orgId} resilier={false} libelle="Annuler la résiliation" />
            ) : (
              <Link href={`${base}/abonnement/resiliation`} className="btn-secondaire inline-flex">
                Résilier votre contrat
              </Link>
            )}
          </div>
          <div className="space-y-2">
            <p className="libelle-champ">Carte et factures</p>
            <BoutonPortail orgId={orgId} />
          </div>
        </div>
      )}

      {!estAgence ? (
        <section className={styles.inclus} aria-labelledby="services-inclus">
          <div className={styles.titreSection}><h2 id="services-inclus">Inclus dans chaque formule</h2><p>La même qualité de service, quel que soit votre nombre de biens.</p></div>
          <div className={styles.services}>
            <div><Building2 size={20} aria-hidden="true" /><strong>Votre gestion au complet</strong><p>Toutes les fonctions disponibles pour votre profil.</p></div>
            <div><Users size={20} aria-hidden="true" /><strong>L’espace de vos locataires</strong><p>Leurs accès sont inclus, sans supplément.</p></div>
            <div><ShieldCheck size={20} aria-hidden="true" /><strong>Aucun frais d’installation</strong><p>Le tarif dépend du nombre de biens et de la périodicité.</p></div>
          </div>
          <details className={styles.precisions}>
            <summary>Services facturés à part ou non inclus</summary>
            <p>Les travaux et interventions d’artisans sont sur devis et facturés à part. Le réseau d’artisans dépend de la zone du bien et du métier. La signature des documents éligibles s’effectue avec Zoho Sign et vérification par SMS, selon les conditions et limites affichées avant l’envoi. Aucun service bancaire n’est inclus.</p>
          </details>
        </section>
      ) : <div className="loc-carte">
        <div className="entete-carte">
          <h3>Ce que comprend l&apos;abonnement</h3>
        </div>
        <ul className="mesure-lecture list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Toutes les fonctions de gestion disponibles pour votre profil, quelle que soit la formule : seul le nombre de{" "}
            {estAgence ? "lots sous mandat" : "biens"} change le prix.
          </li>
          <li>
            {estAgence
              ? "Sans supplément : les accès de vos locataires et les comptes de vos collaborateurs."
              : "Sans supplément : les accès de vos locataires."}
          </li>
          <li>
            Non compris : les travaux et interventions d&apos;artisans, toujours sur devis et facturés à part ; le réseau
            d&apos;artisans dépend de la zone du bien et du métier. La signature des documents éligibles s’effectue avec Zoho Sign et vérification
            par SMS, selon les conditions et limites affichées avant l’envoi. Aucun service bancaire n’est inclus.
          </li>
          <li>
            Aucun frais d&apos;installation.
            {estAgence ? " Une reprise manuelle de vos données peut vous être proposée sur devis, jamais facturée d'office." : ""}
          </li>
        </ul>
      </div>}
    </main>
  );
}
