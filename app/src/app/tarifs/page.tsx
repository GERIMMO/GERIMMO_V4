import Link from "next/link";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { EncartOutils } from "@/components/outils/encart-outils";
import { Article } from "@/components/coquille-legale";
import { CartesOffresPubliques } from "@/components/cartes-offres-publiques";
import { REGIME_TVA } from "@/lib/editeur";
import { badgeEssai, dureeEssai, etiquetteTaxes, libelleOffreLancement, mentionTaxesPubliques } from "@/lib/tarifs";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

const TTC = etiquetteTaxes("ttc", REGIME_TVA);
const avec = (e: string | null) => (e ? ` ${e}` : "");

// La durée de l'essai dépend du jour (offre de lancement jusqu'au 31/12/2026,
// 1 mois ensuite) : métadonnées calculées au rendu, page reconstruite au plus
// tard toutes les heures.
export const revalidate = 3600;

export function generateMetadata() {
  return metadonneesPubliques({
    titre: "Tarifs — Gerimmo",
    description: `Particuliers et SCI : de Solo (1 bien, 5,99 €${avec(TTC)}/mois) à Patrimoine (20 biens), mensuel ou annuel.${REGIME_TVA?.nature === "franchise" ? " TVA non applicable, art. 293 B du CGI." : ""} Essai gratuit de ${dureeEssai()}.`,
    chemin: "/tarifs",
  });
}

// La page des tarifs (grille du 28/09/2026). Les tableaux sont rendus depuis
// lib/tarifs.ts, le module qui sert aussi à facturer : aucun prix n'est
// recopié ici. Ce qui n'est pas proposé est dit — pas de promesse sur des
// services externes dont le coût n'est pas défini.
export default function PageTarifs() {
  const mentionTaxes = mentionTaxesPubliques(REGIME_TVA);
  const duree = dureeEssai();
  const offre = libelleOffreLancement();
  return (
    <div className="site-public flex min-h-full flex-1 flex-col">
      <EnTetePublic />
      <main className="flex-1">
        <header className="public-page-intro"><div className="public-conteneur">
          <p className="eyebrow">Des prix clairs, selon votre parc</p>
          <h1>Tarifs</h1>
          <p>Les mêmes fonctions de gestion, quelle que soit votre formule. Choisissez le rythme qui vous convient, après votre essai gratuit de {duree}, sans carte bancaire.</p>
          <p className="public-essai mt-4" title={offre ?? undefined}>{badgeEssai()}</p>
        </div></header>
        <div className="public-conteneur public-section">
          <CartesOffresPubliques />
          <p className="public-note">{mentionTaxes}</p>
          <div className="public-tarifs-details">
        <Article titre="Particuliers et SCI gérant leurs propres biens">
          <ul className="list-disc space-y-1 pl-5">
            <li>La formule la moins chère qui couvre votre parc vous est proposée d&apos;office ; une formule plus grande ne se souscrit que si vous la choisissez, montant affiché.</li>
            <li>Mensuel : sans engagement, résiliable à tout moment pour la prochaine échéance.</li>
            <li>Annuel : payé en une fois pour douze mois (deux mois offerts), renouvelé à sa date anniversaire ; résiliable pour la prochaine échéance annuelle. Le montant annuel prélevé est affiché avant paiement.</li>
            <li>Sont comptés les biens activement gérés, occupés ou vacants. Un logement et ses annexes louées au même bail comptent pour un bien ; un parking loué séparément compte pour un bien. Un bien archivé n&apos;est plus compté et reste consultable.</li>
            <li>Une SCI ou une indivision qui gère ses propres biens relève de cette grille.</li>
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

        {/* 23/10 (audit A06) : les circuits Zoho Sign sont ouverts depuis le 19/10 (bail, documents, devis) et le
            cautionnement depuis le 21/10, sous un plafond mensuel commun et un arrêt d'urgence (/admin/relais). Ni
            prix ni volume promis : la page dit seulement ce qui existe.
            Relecture du 23/10 : la signature n'est pas facturée au client (budget Zoho commun à Gerimmo) ; rangée
            sous « Ce qui n'est pas dans l'abonnement », elle se lisait comme exclue ou payante en sus. Elle est
            dans l'abonnement, avec les mêmes réserves de volume et de suspension. */}
        <Article titre="Ce qui est dans l'abonnement">
          <ul className="list-disc space-y-1 pl-5">
            <li>Toutes les fonctions de gestion et l&apos;espace locataire, quelle que soit votre formule.</li>
            <li>La signature électronique du bail, de l&apos;acte de cautionnement, de certains documents de la location et de l&apos;acceptation des devis, depuis l&apos;application, avec un code envoyé par SMS à chaque signataire. Elle n&apos;est pas illimitée : elle dépend d&apos;un volume mensuel commun et peut être momentanément suspendue.</li>
          </ul>
        </Article>

        <Article titre="Ce qui n'est pas dans l'abonnement">
          <ul className="list-disc space-y-1 pl-5">
            <li>Les travaux et interventions d&apos;artisans : toujours sur devis, facturés séparément. Le réseau d&apos;artisans dépend de la commune du bien et du métier, après validation ; le prix de l&apos;abonnement n&apos;en dépend pas. La gestion, elle, est ouverte partout en France.</li>
            <li>Aucun envoi de SMS en dehors du code de signature, aucun service bancaire.</li>
          </ul>
        </Article>

        {/* La liste d'attente des agences (20/10/2026) : l'offre et sa grille ne sont pas publiées ; aucun prix, aucune
            date ici, seulement le chemin pour être prévenu (tests/vitrine-agences.test.ts). */}
        <Article titre="Agences de gestion">
          <ul className="list-disc space-y-1 pl-5">
            <li>L&apos;offre pour les agences de gestion locative et sa grille ne sont pas publiées : elles sont en préparation. Cette page ne concerne que les particuliers et les SCI.</li>
            <li>Pour être prévenu de l&apos;ouverture de l&apos;offre aux agences, <Link href="/agences" className="lien-texte">inscrivez votre agence sur la liste d&apos;attente</Link>. Date d&apos;ouverture et tarifs ne sont pas encore fixés.</li>
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
          </div>
        </div>
      </main>
      <PiedPublic courant="/tarifs" />
    </div>
  );
}
