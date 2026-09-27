import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormulaireAbonnementV2 } from "./formulaire-abonnement-v2";
import { BoutonPortail } from "./boutons-abonnement";
import { calculerTarif, formaterCentimes, GRILLE_PARTICULIERS, libellePeriodicite } from "@/lib/tarification";
import { dateAbonnement, statutAbonnementV2, type EtatAbonnementV2 } from "@/lib/abonnement-v2";
import { EncadreLectureImpossible, EnteteReglages } from "../profil/famille-reglages";

export async function PageAbonnementV2({ supabase, orgId, nom, recherche }: {
  supabase: SupabaseClient; orgId: string; nom: string; recherche: Record<string, string | string[] | undefined>;
}) {
  const { data, error } = await supabase.rpc("lire_abonnement_v2", { p_org: orgId });
  if (error || !data) return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-7">
    <EnteteReglages titre="Mon abonnement" mention={nom} />
    <EncadreLectureImpossible>Votre abonnement n’a pas pu être vérifié. Aucun paiement ni changement n’a été lancé. Rechargez cette page.</EncadreLectureImpossible>
  </main>;
  const etat = data as EtatAbonnementV2;
  const agence = etat.public_tarif === "agence";
  const offre = calculerTarif(etat.public_tarif, etat.volume_actuel, etat.periodicite ?? "mensuel");
  const souscrit = Boolean(etat.stripe_subscription_id) && !["canceled", "incomplete_expired"].includes(etat.statut);
  const enEssai = etat.essai_fin && etat.ecriture_ouverte && (!souscrit || etat.statut === "trialing");
  const demandeVolume = Number(recherche.volume);
  const volumeSuggere = Number.isSafeInteger(demandeVolume) && demandeVolume >= etat.volume_actuel && demandeVolume <= 1000000 ? demandeVolume : undefined;
  const changement = etat.changement_programme;
  const nomFormule = agence ? "Agence" : GRILLE_PARTICULIERS.find(f => f.formule === etat.formule)?.libelle;
  return <main className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-7">
    <EnteteReglages titre="Mon abonnement" mention={nom}>Votre formule, vos biens et vos prochaines échéances, au même endroit.</EnteteReglages>
    {(recherche.paiement === "ok" || recherche.paiement === "verification") && <div role="status" className="loc-carte border-l-4 border-l-[var(--marque)]">Votre retour du paiement a été reçu. L’état ci-dessous est mis à jour après confirmation de notre prestataire. Cette page ne vaut pas preuve de paiement.</div>}
    {recherche.paiement === "annule" && <div role="status" className="loc-carte">Vous avez quitté le parcours de paiement. Vous pouvez consulter l’état confirmé ci-dessous et reprendre lorsque vous le souhaitez.</div>}
    <section className="loc-carte !bg-[var(--marque-douce)]" aria-labelledby="titre-abonnement-actuel">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titre-abonnement-actuel">{souscrit ? nomFormule ?? "Votre formule" : enEssai ? "14 jours pour essayer" : "Choisissez votre formule"}</h2><span className="puce puce-grise">{statutAbonnementV2(etat)}</span></div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Portefeuille actuellement compté</dt><dd className="mt-1 text-xl font-semibold">{etat.volume_actuel} {agence ? "lots sous mandat" : "biens activement gérés"}</dd></div>
        <div><dt className="text-muted-foreground">Capacité confirmée</dt><dd className="mt-1 text-xl font-semibold">{enEssai && !souscrit ? "Libre pendant l’essai" : etat.capacite == null ? "Aucun abonnement souscrit" : `${etat.capacite} ${agence ? "lots" : "biens"}`}</dd></div>
        {souscrit && <div><dt className="text-muted-foreground">Volume retenu pour la facturation</dt><dd className="mt-1">{etat.volume_facture ?? etat.capacite} {agence ? "lots" : "biens"} · {agence ? "socle jusqu’à 10 lots inclus" : "dans la capacité de votre formule"}</dd></div>}
        <div><dt className="text-muted-foreground">Paiement</dt><dd className="mt-1">{souscrit && etat.montant_centimes != null ? `${formaterCentimes(etat.montant_centimes)} ${agence ? "HT" : "TTC"} ${libellePeriodicite(etat.periodicite ?? "mensuel")}` : "Aucun prélèvement sans souscription explicite"}</dd>
          {souscrit && agence && etat.total_centimes != null && <dd className="mt-1">Total à payer : {formaterCentimes(etat.total_centimes)}, dont {formaterCentimes(etat.taxe_centimes ?? 0)} de taxes.</dd>}</div>
        <div><dt className="text-muted-foreground">{enEssai ? "Fin de l’essai / premier prélèvement si souscrit" : etat.annulation_demandee ? "Accès payé jusqu’au" : "Prochaine échéance"}</dt><dd className="mt-1">{dateAbonnement(enEssai ? etat.essai_fin : etat.periode_fin)}</dd></div>
      </dl>
      {!etat.ecriture_ouverte && <p role="status" className="mt-4 rounded-lg bg-background p-3 text-sm">Vos données restent consultables et exportables. Pour reprendre la gestion et les modifications, souscrivez ou régularisez votre abonnement. Rien n’est supprimé automatiquement.</p>}
      {changement && <p className="mt-4 rounded-lg bg-background p-3 text-sm"><b>Changement prévu le {dateAbonnement(changement.date_effet)}</b> : {changement.volume != null ? `${changement.volume} ${agence ? "lots" : "biens"}` : "nouvelle formule"}{changement.montant_centimes != null ? ` · ${formaterCentimes(changement.montant_centimes)} ${agence ? "HT" : "TTC"}` : ""}{changement.periodicite ? ` ${libellePeriodicite(changement.periodicite)}` : ""}. Votre capacité actuelle reste valable jusque-là.</p>}
    </section>
    {(etat.volume_reserve ?? 0) > etat.volume_actuel && <p className="loc-carte text-sm">Votre portefeuille nécessite une capacité de {etat.volume_reserve} lots en tenant compte des mandats déjà actifs dont certains lots démarrent plus tard.</p>}
    <FormulaireAbonnementV2 orgId={orgId} publicTarif={etat.public_tarif} volumeActuel={Math.max(etat.volume_actuel, etat.volume_reserve ?? 0)} capacite={etat.capacite} periodiciteActuelle={etat.periodicite} souscrit={souscrit} essaiFin={enEssai ? etat.essai_fin : null} volumeSuggere={volumeSuggere} changementProgramme={Boolean(changement)} />
    <section className="loc-carte space-y-3"><h2>Comment votre portefeuille est compté</h2>
      <p className="text-sm text-muted-foreground">{agence ? "Chaque lot distinct sous mandat actif est compté une seule fois, même vacant. Archiver sa fiche ne retire pas un mandat toujours actif du volume facturé." : "Les logements et les parkings loués séparément comptent chacun pour un bien, qu’ils soient occupés ou vacants. Un logement et ses annexes rattachées, loués dans le même bail, comptent ensemble. Les biens archivés restent dans votre historique et sortent du volume actif."}</p>
      <p className="text-sm text-muted-foreground">{agence ? "Les accès de vos collaborateurs, de vos locataires et de vos propriétaires invités sont inclus sans supplément." : "Les accès de vos locataires sont inclus. Les biens confiés à une agence se consultent dans l’espace invité de cette agence, sans abonnement personnel supplémentaire."}</p>
      <p className="text-sm text-muted-foreground">Une augmentation de capacité demande votre confirmation du prix et de l’ajustement pour la période en cours. Une baisse prend effet à la prochaine échéance si votre portefeuille le permet. Archiver un bien ne supprime pas son historique.</p>
      <Link href={`/agence/${orgId}/parc`} className="text-sm font-medium text-primary underline">Consulter mes biens et mes archives</Link>
    </section>
    <section className="loc-carte space-y-3"><h2>Ce qui est compris</h2><p className="text-sm text-muted-foreground">Les fonctionnalités de gestion disponibles pour votre profil sont les mêmes dans toutes les formules. La gestion immobilière est accessible partout en France. Le réseau d’artisans dépend de la commune du bien et du métier ouvert ; cela ne change pas le prix de l’abonnement.</p>
      <p className="text-sm text-muted-foreground">Les travaux et interventions sont facturés séparément sur devis. Les signatures électroniques, SMS et autres prestations externes ne sont pas promis en quantité illimitée. Les options payantes demandent un tarif et un accord distincts. Aucun frais d’installation pour démarrer seul ; une reprise manuelle de données d’agence peut être proposée sur devis.</p>
      <p className="text-sm text-muted-foreground">Tarif correspondant au portefeuille actuel : <b>{formaterCentimes(offre.montantCentimes)} {agence ? "HT" : "TTC"} {libellePeriodicite(offre.periodicite)}</b>. Il s’agit d’une proposition, sans modification automatique de votre contrat.</p>
    </section>
    {etat.stripe_customer_id && <section className="loc-carte space-y-2"><h2>Factures et moyen de paiement</h2><p className="text-sm text-muted-foreground">Retrouvez vos factures et mettez à jour votre carte. Les changements de formule passent par le récapitulatif ci-dessus.</p><BoutonPortail orgId={orgId} /></section>}
    <Link href="/conditions" className="text-sm text-primary underline">Conditions de l’abonnement et de résiliation</Link>
  </main>;
}
