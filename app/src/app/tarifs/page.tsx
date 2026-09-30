import Link from "next/link";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { EncartOutils } from "@/components/outils/encart-outils";
import { Article } from "@/components/coquille-legale";
import { TableauAgences, TableauParticuliers } from "@/components/grilles-tarifaires";
import { REGIME_TVA } from "@/lib/editeur";
import { DUREE_ESSAI, etiquetteTaxes, mentionTaxesPubliques } from "@/lib/tarifs";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

const TTC = etiquetteTaxes("ttc", REGIME_TVA);
const HT = etiquetteTaxes("ht", REGIME_TVA);
const avec = (e: string | null) => (e ? ` ${e}` : "");

export const metadata = metadonneesPubliques({
  titre: "Tarifs — Gerimmo",
  description: `Particuliers et SCI : de Solo (1 bien, 5,99 €${avec(TTC)}/mois) à Patrimoine (20 biens), mensuel ou annuel. Agences : dès 39 €${avec(HT)}/mois, tranches cumulatives.${REGIME_TVA?.nature === "franchise" ? " TVA non applicable, art. 293 B du CGI." : ""} Essai gratuit de ${DUREE_ESSAI}.`,
  chemin: "/tarifs",
});

// La page des tarifs (grille du 28/09/2026). Les tableaux sont rendus depuis
// lib/tarifs.ts, le module qui sert aussi à facturer : aucun prix n'est
// recopié ici. Ce qui n'est pas proposé est dit — pas de promesse sur des
// services externes dont le coût n'est pas défini.
export default function PageTarifs() {
  const mentionTaxes = mentionTaxesPubliques(REGIME_TVA);
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 sm:px-7 sm:py-10">
        <div className="entete-page">
          <h1>Tarifs</h1>
        </div>
        <p className="mesure-lecture text-[15px] text-[var(--texte-secondaire)]">
          Les fonctions de gestion sont les mêmes dans chaque formule : seul le nombre de biens, ou de lots sous mandat
          pour une agence, fait le prix. Essai gratuit de {DUREE_ESSAI}, sans carte bancaire.
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
            <li>Le socle de 39 €{avec(HT)} s&apos;applique dès la souscription, même sous dix lots. Aucun abonnement ne démarre à la création du compte.</li>
            <li>Sans supplément : les comptes de vos collaborateurs et les accès de vos locataires. Vos propriétaires reçoivent leurs rapports de gestion sans abonnement à prendre.</li>
            <li>L&apos;essai de {DUREE_ESSAI}, sans carte, s&apos;ouvre sur demande : écrivez-nous depuis l&apos;accueil, rubrique Agences.</li>
            <li>Aucun frais d&apos;installation pour démarrer seul ; une reprise manuelle de vos données peut vous être proposée sur devis, jamais facturée d&apos;office.</li>
          </ul>
        </Article>

        <Article titre="Changer, arrêter">
          <ul className="list-disc space-y-1 pl-5">
            <li>Toute augmentation vous est présentée avant d&apos;être appliquée : nouveau montant, date d&apos;effet et prorata. Rien n&apos;est prélevé sans votre confirmation.</li>
            <li>Une baisse s&apos;applique d&apos;elle-même à la prochaine échéance, quand votre parc le permet.</li>
            <li>Souscrire pendant l&apos;essai ne le raccourcit pas : le premier prélèvement part à sa fin, date affichée.</li>
            <li>À la fin de l&apos;essai ou des droits payés, vos données restent consultables et exportables en lecture seule, tant que le compte existe. Rien n&apos;est supprimé automatiquement du fait de l&apos;arrêt ; vous pouvez demander la suppression après export (article 9 des conditions générales).</li>
          </ul>
        </Article>

        <Article titre="Ce qui n'est pas dans l'abonnement">
          <ul className="list-disc space-y-1 pl-5">
            <li>Les travaux et interventions d&apos;artisans : toujours sur devis, facturés séparément. Le réseau d&apos;artisans dépend de la commune du bien et du métier, après validation ; le prix de l&apos;abonnement n&apos;en dépend pas. La gestion, elle, est ouverte partout en France.</li>
            <li>La signature électronique n&apos;est pas encore proposée. Aucun envoi de SMS ni service bancaire n&apos;est inclus.</li>
          </ul>
        </Article>

        <EncartOutils
          titre="Avant de vous lancer : nos outils gratuits"
          chapo="Chiffrez votre projet sans créer de compte : rentabilité d'un achat, fiscalité d'une location meublée, garantie des loyers."
          chemins={["/outils/rentabilite-locative", "/outils/simulateur-lmnp", "/outils/comparateur-gli-visale"]}
        />

        <p className="text-[13px] text-[var(--texte-secondaire)]">{mentionTaxes}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/inscription" className="btn-or">
            Commencer l&apos;essai gratuit
          </Link>
          <Link href="/conditions" className="btn-secondaire">
            Conditions générales d&apos;utilisation et de vente
          </Link>
        </div>
      </main>
      <PiedPublic courant="/tarifs" />
    </div>
  );
}
