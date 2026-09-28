import Link from "next/link";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { Article } from "@/components/coquille-legale";
import { TableauAgences, TableauParticuliers } from "@/components/grilles-tarifaires";
import { REGIME_TVA } from "@/lib/editeur";
import { JOURS_ESSAI, MENTION_REGIME_INCONNU } from "@/lib/tarifs";

export const metadata = {
  title: "Tarifs — Gerimmo",
  description:
    "Particuliers et SCI : de Solo (1 bien, 5,99 € TTC/mois) à Patrimoine (20 biens), mensuel ou annuel. Agences : dès 39 € HT/mois, tranches cumulatives. Essai gratuit de 14 jours.",
};

// La page des tarifs (grille du 28/09/2026). Les tableaux sont rendus depuis
// lib/tarifs.ts, le module qui sert aussi à facturer : aucun prix n'est
// recopié ici. Ce qui n'est pas proposé est dit — pas de promesse sur des
// services externes dont le coût n'est pas défini.
export default function PageTarifs() {
  const mentionTaxes = !REGIME_TVA
    ? MENTION_REGIME_INCONNU
    : REGIME_TVA.nature === "franchise"
      ? "TVA non applicable, art. 293 B du CGI : les prix HT des agences sont aussi les montants payés."
      : `Particuliers : prix TTC, TVA ${REGIME_TVA.tauxPourcent} % incluse. Agences : prix HT, TVA ${REGIME_TVA.tauxPourcent} % en sus, détaillée avant paiement.`;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:px-7 sm:py-10">
        <div className="entete-page">
          <h1>Tarifs</h1>
        </div>
        <p className="mesure-lecture text-[15px] text-[var(--texte-secondaire)]">
          Les fonctions de gestion sont les mêmes dans chaque formule : seul le nombre de biens, ou de lots sous mandat
          pour une agence, fait le prix. Essai gratuit de {JOURS_ESSAI} jours, sans carte bancaire.
        </p>

        <Article titre="Particuliers et SCI gérant leurs propres biens">
          <TableauParticuliers />
          <ul className="list-disc space-y-1 pl-5">
            <li>La formule la moins chère qui couvre votre parc vous est proposée d&apos;office ; une formule plus grande ne se souscrit que si vous la choisissez, montant affiché.</li>
            <li>Mensuel : sans engagement, résiliable à tout moment pour la prochaine échéance.</li>
            <li>Annuel : payé en une fois pour douze mois (deux mois offerts), renouvelé à sa date anniversaire ; résiliable pour la prochaine échéance annuelle. Le montant annuel prélevé est affiché avant paiement.</li>
            <li>Sont comptés les biens activement gérés, occupés ou vacants. Un logement et ses annexes louées au même bail comptent pour un bien ; un parking loué séparément compte pour un bien. Un bien archivé n&apos;est plus compté et reste consultable.</li>
            <li>Une SCI qui gère ses propres biens relève de cette grille ; une agence qui gère pour des tiers relève de la grille agences.</li>
          </ul>
        </Article>

        <Article titre="Agences immobilières">
          <TableauAgences />
          <ul className="list-disc space-y-1 pl-5">
            <li>Mensuel uniquement, sans engagement, selon les lots distincts sous mandat actif — vacants compris.</li>
            <li>Le socle de 39 € HT s&apos;applique dès la souscription, même sous dix lots. Aucun abonnement ne démarre à la création du compte.</li>
            <li>Sans supplément : les comptes de vos collaborateurs, les accès des propriétaires que vous invitez et ceux de vos locataires. Un propriétaire invité n&apos;a pas d&apos;abonnement à prendre pour consulter les biens que vous gérez.</li>
            <li>Aucun frais d&apos;installation pour démarrer seul ; une reprise manuelle de vos données peut vous être proposée sur devis, jamais facturée d&apos;office.</li>
          </ul>
        </Article>

        <Article titre="Changer, arrêter">
          <ul className="list-disc space-y-1 pl-5">
            <li>Toute augmentation vous est présentée avant d&apos;être appliquée : nouveau montant, date d&apos;effet et prorata. Rien n&apos;est prélevé sans votre confirmation.</li>
            <li>Une baisse s&apos;applique d&apos;elle-même à la prochaine échéance, quand votre parc le permet.</li>
            <li>Souscrire pendant l&apos;essai ne le raccourcit pas : le premier prélèvement part à sa fin, date affichée.</li>
            <li>À la fin de l&apos;essai ou des droits payés, vos données restent consultables et exportables en lecture seule. Rien n&apos;est supprimé automatiquement.</li>
          </ul>
        </Article>

        <Article titre="Ce qui n'est pas dans l'abonnement">
          <ul className="list-disc space-y-1 pl-5">
            <li>Les travaux et interventions d&apos;artisans : toujours sur devis, facturés séparément. Le réseau d&apos;artisans dépend de la commune du bien et du métier, après validation ; le prix de l&apos;abonnement n&apos;en dépend pas. La gestion, elle, est ouverte partout en France.</li>
            <li>La signature électronique n&apos;est pas encore proposée. Aucun envoi de SMS ni service bancaire n&apos;est inclus.</li>
          </ul>
        </Article>

        <p className="text-[13px] text-[var(--texte-secondaire)]">{mentionTaxes}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/inscription" className="btn-or">
            Commencer l&apos;essai gratuit
          </Link>
          <Link href="/conditions" className="btn-secondaire">
            Conditions générales
          </Link>
        </div>
      </main>
      <PiedPublic courant="/tarifs" />
    </div>
  );
}
