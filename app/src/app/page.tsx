import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { FormulaireDevisVitrine } from "./formulaire-devis-vitrine";
import { AncreAuChargement } from "@/components/ancre-au-chargement";
import {
  ApercuTableauDeBord,
  ApercuQuittance,
  ApercuMobileIncident,
} from "./apercus-produit";
import { TableauAgences, TableauParticuliers } from "@/components/grilles-tarifaires";
import { REGIME_TVA } from "@/lib/editeur";
import { badgeEssai, dureeEssai, etiquetteTaxes, libelleOffreLancement, mentionTaxesPubliques } from "@/lib/tarifs";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import { TuileOutil, outilsPresentes } from "@/components/outils/icones-outils";

// 30/09 : la durée de l'essai dépend du jour (offre de lancement : 2 mois
// jusqu'au 31/12/2026, 1 mois ensuite). Métadonnées et textes sont calculés
// au rendu ; la page, si elle devient statique, se reconstruit toutes les heures.
export const revalidate = 3600;

export function generateMetadata() {
  return metadonneesPubliques({
    titre: "Gerimmo — La gérance immobilière, tenue au carré",
    description: `Baux, quittances automatiques, incidents, états des lieux, fiscalité : la gestion locative partout en France pour les propriétaires bailleurs et les agences. Essai gratuit de ${dureeEssai()}, sans carte.`,
    chemin: "/",
  });
}

// 29/09 : l'étiquette de taxe suit le régime de l'éditeur (lib/editeur.ts).
// En franchise en base, « 39 € HT » laissait croire qu'une TVA s'ajoutait :
// le prix s'affiche nu, la mention de l'article 293 B juste à côté.
const TTC = etiquetteTaxes("ttc", REGIME_TVA);
const HT = etiquetteTaxes("ht", REGIME_TVA);
const avec = (e: string | null) => (e ? ` ${e}` : "");
const MENTION_TAXES = mentionTaxesPubliques(REGIME_TVA);

// Site vitrine — ce que voit un visiteur avant toute connexion. Un connecté
// est renvoyé vers ses espaces par le proxy. Tout ce qui est promis ici
// existe dans l'application (politique « fonctionnalités honnêtes ») : aucune
// capture d'un écran qui n'existe pas, aucun témoignage, aucun chiffre d'usage
// — nous n'en avons pas à montrer, et nous n'en inventerons pas.
//
// Charte v3 (17/09) : la page s'ouvre sur du blanc et du bleu, pas sur un
// bloc marine ; les sections alternent blanc et gris perle ; les cartes sont
// des cartes (rayon, filet, ombre au survol) et non des colonnes à filet
// laiton. Le contenu, lui, n'a pas bougé.

const REMPLACE: [string, string, string][] = [
  [
    "Le tableur de suivi",
    "Qui a payé, combien, quand",
    "L'encaissement se saisit en un clic et écrit tout le reste : quittance, écriture au livre, relance close.",
  ],
  [
    "Le rappel qu'on oublie",
    "Assurance, diagnostics, préavis",
    "Les échéances vous trouvent au lieu d'attendre que vous y pensiez — et une alerte ne se ferme que par l'action.",
  ],
  [
    "Le dossier de fin de bail",
    "Retenues, litiges, dépôt",
    "L'état des lieux de sortie se compare à celui d'entrée : chaque retenue se justifie ligne par ligne, vétusté déduite.",
  ],
  [
    "Les honoraires d'agence",
    "6 à 8 % des loyers, chaque mois",
    `Le même travail, tenu par l'outil. Dès 5,99 €${avec(TTC)} par mois pour un bien, sans engagement.`,
  ],
];

const FONCTIONNALITES: [string, string][] = [
  [
    "Incidents qualifiés",
    "Chaque signalement est qualifié — qui paie, sur quel fondement — avant toute intervention. Le locataire est informé, sa contestation est tracée.",
  ],
  [
    "États des lieux guidés",
    "Grille pièce par pièce, sortie comparée à l'entrée, écarts mis en évidence — la retenue sur dépôt se justifie, ligne par ligne, décote de vétusté comprise.",
  ],
  [
    "Livre & fiscalité",
    "Un livre recettes-dépenses immuable (correction par contre-écriture, visible) et un récapitulatif 2044 rubrique par rubrique, quote-part d'indivision comprise.",
  ],
  [
    "Alertes qui travaillent",
    "Assurance qui expire, diagnostics, état des lieux à planifier, restitution du dépôt : les échéances vous trouvent — et une alerte se ferme par l'action, pas par oubli.",
  ],
  [
    "Documents générés",
    "Bail, quittance, décompte de restitution, rapport de gestion, facture d'honoraires : produits depuis vos données, à votre en-tête, prêts à envoyer.",
  ],
  [
    "Cloisonnement strict",
    "Chaque organisation — nom propre, SCI, agence — a ses lots, son livre, sa fiscalité. Vos locataires ne voient que leur logement et leurs pièces.",
  ],
];

const faq = (duree: string): [string, string][] => [
  [
    "Combien coûte Gerimmo pour un particulier ?",
    `Le prix dépend du nombre de biens, les fonctions sont les mêmes : Solo (1 bien) 5,99 €, Bailleur (jusqu'à 3) 9,99 €, Investisseur (jusqu'à 10) 19,99 €, Patrimoine (jusqu'à 20) 29,99 €${avec(TTC)} par mois — ou dix mensualités par an en paiement annuel. Au-delà de 20 biens, 1 € par bien et par mois. Essai gratuit de ${duree}, sans carte ; aucune formule n'est gratuite ensuite.`,
  ],
  [
    "Gerimmo lit-il mes comptes bancaires ?",
    "Non, jamais. La comptabilité est déclarative : vous enregistrez l'encaissement en un clic, tout le reste s'écrit tout seul.",
  ],
  [
    "Mes données sont-elles cloisonnées ?",
    "Chaque organisation (nom propre, SCI, agence) a ses lots, son livre, sa fiscalité — étanches. Vos locataires ne voient que leur logement et leurs pièces.",
  ],
  [
    "Et pour une agence ?",
    `Mandats, honoraires, rapports de gestion, portefeuilles par agent : l'espace agence couvre la gérance complète. Mensuel${avec(HT)}, selon les lots sous mandat actif : 39 € jusqu'à 10 lots, puis 2 € du 11ᵉ au 50ᵉ, 1,50 € du 51ᵉ au 200ᵉ et 1 € au-delà — tranches cumulatives. Comptes des collaborateurs et accès des locataires inclus ; les rapports de gestion sont envoyés à vos propriétaires.`,
  ],
  [
    "Que se passe-t-il si j'arrête ?",
    "La résiliation prend effet à la prochaine échéance : l'accès payé reste ouvert jusque-là. Ensuite, vos données restent consultables et exportables, en lecture seule, tant que le compte existe — rien n'est supprimé automatiquement du fait de l'arrêt, et vous pouvez demander la suppression après export. Aucun frais de sortie.",
  ],
  [
    "Puis-je gérer pour quelqu'un d'autre ?",
    "Oui : une SCI, l'indivision familiale, le bien d'un proche. Chaque organisation est séparée, et vous passez de l'une à l'autre depuis le même compte.",
  ],
];

function TitreSection({ sur, titre }: { sur: string; titre: string }) {
  return (
    <>
      <p className="eyebrow text-[var(--marque-sombre)]">{sur}</p>
      <h2 className="mt-2 max-w-[22ch] text-balance font-heading text-[26px] font-bold leading-[1.15] tracking-[-0.015em] text-[var(--encre)] sm:text-[32px]">
        {titre}
      </h2>
    </>
  );
}

function Coche() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="mt-0.5 size-4 shrink-0 fill-none stroke-[var(--marque)] stroke-[2.2]"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function PageVitrine() {
  // Le journal alimente la vitrine : trois articles parus, s'il y en a. La
  // section disparaît entièrement tant que rien n'est publié — mieux vaut
  // pas de rubrique qu'une rubrique vide.
  const supabase = await createClient();
  const { data: articles } = await supabase
    .from("publications")
    .select("id, titre, slug, chapo, publie_le")
    .eq("statut", "publiee")
    .order("publie_le", { ascending: false })
    .limit(3);
  const duree = dureeEssai();
  const offre = libelleOffreLancement();

  return (
    <div className="min-h-full bg-[var(--creme)]">
      <EnTetePublic />

      {/* ------------------------------------------------------------ Héros */}
      <header className="vitrine-hero">
        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-7 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <p className="eyebrow text-[var(--marque-sombre)]">Gestion locative · partout en France</p>
              <Link
                href="/tarifs"
                title={offre ?? undefined}
                className={`mt-4 inline-flex rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ${
                  offre
                    ? "border border-[var(--marque)] bg-[var(--marque-clair)] text-[var(--encre)]"
                    : "border border-[var(--or-filet)] bg-[var(--ivoire)] text-[var(--marque-sombre)]"
                }`}
              >
                {badgeEssai()}
              </Link>
              <h1 className="mt-4 max-w-[14ch] text-balance font-heading text-[40px] font-extrabold leading-[1.05] tracking-[-0.025em] text-[var(--encre)] sm:text-[56px]">
                Le sérieux d&apos;une agence, sans les honoraires.
              </h1>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-[var(--texte-secondaire)]">
                Baux, quittances automatiques, incidents, états des lieux, livre
                et fiscalité — et un espace pour chaque locataire. Pour les
                propriétaires bailleurs qui gèrent en direct, et pour les
                agences.
              </p>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--texte-secondaire)]">Le réseau d’artisans s’ouvre progressivement, selon la commune du bien et le métier recherché. Vos biens, baux et documents se gèrent partout en France, indépendamment de ce réseau.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {/* 24/09 : une même cible, un même nom. /inscription s'appelait
                    ici « Commencer », ailleurs « Créer mon compte » ou
                    « Découvrir la gestion en direct ». */}
                <Link href="/inscription" className="btn-or !px-5 !py-3 !text-[15px]">
                  Créer mon compte — {duree} d&apos;essai
                </Link>
                <a href="#agences" className="btn-secondaire">
                  Je suis une agence →
                </a>
              </div>
              <Link
                href="/outils"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--or-filet)] bg-[var(--ivoire)] py-1.5 pr-4 pl-1.5 text-[14px] font-semibold text-[var(--marque-sombre)] transition-colors hover:border-[var(--marque)] hover:bg-[var(--survol)]"
              >
                <span className="outil-puce">Gratuit</span>
                Essayer nos outils gratuits
                <span aria-hidden>→</span>
              </Link>
              <p className="mt-5 text-[13px] text-[var(--libelle)]">
                Essai de {duree}, sans carte bancaire. Aucun honoraire de
                gestion, jamais.
              </p>
            </div>

            {/* L'aperçu n'est pas une image : c'est l'interface réelle,
                construite avec les mêmes classes que l'application. */}
            <div className="vitrine-cadre">
              <ApercuTableauDeBord />
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------ Outils gratuits */}
        {/* 30/09 : les outils gratuits montent juste sous le héros — cinq
            cartes, sans compte. Ils étaient une ligne de liens en bas de page. */}
        <section aria-labelledby="outils-gratuits" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-7 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-[var(--marque-sombre)]">Outils gratuits · sans compte</p>
              <h2
                id="outils-gratuits"
                className="mt-2 max-w-[24ch] text-balance font-heading font-bold leading-[1.15] tracking-[-0.015em] text-[var(--encre)]"
              >
                Vos calculs de bailleur, en une minute
              </h2>
            </div>
            <Link href="/outils" className="lien-discret text-[13.5px]">
              Tous les outils →
            </Link>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {outilsPresentes().map((o) => (
              <li key={o.chemin} className="min-w-0">
                <Link href={o.chemin} className="vitrine-carte group flex h-full flex-col !p-5">
                  <TuileOutil chemin={o.chemin} />
                  <h3 className="mt-4 font-heading text-[16px] font-bold leading-snug text-[var(--encre)] group-hover:text-[var(--marque-sombre)]">
                    {o.court}
                  </h3>
                  <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">{o.accroche}</p>
                  <span className="mt-4 flex items-center justify-between gap-2">
                    <span className="outil-puce">Gratuit</span>
                    <span className="text-[13.5px] font-semibold text-[var(--marque-sombre)]">
                      Essayer <span aria-hidden>→</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------- Ce que ça remplace */}
        <section className="border-y border-[var(--filet)] bg-[var(--ivoire)]">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <TitreSection sur="Ce que Gerimmo remplace" titre="Quatre corvées en moins" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {REMPLACE.map(([quoi, quand, comment]) => (
                <div key={quoi} className="vitrine-carte">
                  <p className="eyebrow text-[var(--marque-sombre)]">{quand}</p>
                  <h3 className="mt-2 font-heading text-[18px] font-bold text-[var(--encre)]">{quoi}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
                    {comment}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Quittancement */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_440px]">
            <div>
              <TitreSection
                sur="Le geste le plus fréquent"
                titre="L'encaissement écrit tout le reste"
              />
              <p className="mesure-lecture mt-5 text-[16px] leading-relaxed text-[var(--texte-secondaire)]">
                Vous notez qu&apos;un loyer est rentré. Gerimmo émet la quittance,
                l&apos;inscrit au livre, calcule le prorata du premier mois et
                referme la relance. Un paiement partiel produit un reçu, promu
                en quittance dès que le mois est soldé.
              </p>
              <p className="mesure-lecture mt-3 text-[16px] leading-relaxed text-[var(--texte-secondaire)]">
                Et si vous supprimez un encaissement saisi par erreur, la
                quittance correspondante est retirée : le document ne survit
                jamais à l&apos;argent qu&apos;il atteste.
              </p>
            </div>
            {/* 24/09 : plus de second cadre crème autour de la quittance —
                la carte a déjà son filet et son ombre, et le cadre, presque
                de la couleur de la section, n'ajoutait qu'une marge. Seul
                l'aperçu du héros garde le sien. */}
            <ApercuQuittance />
          </div>
        </section>

        {/* ------------------------------------------------ Espace locataire */}
        <section className="border-y border-[var(--filet)] bg-[var(--ivoire)]">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <div className="grid items-center gap-10 lg:grid-cols-[300px_1fr]">
              <ApercuMobileIncident />
              <div>
                <TitreSection
                  sur="Inclus, sans supplément"
                  titre="Chaque locataire a son espace"
                />
                <p className="mesure-lecture mt-5 text-[16px] leading-relaxed text-[var(--texte-secondaire)]">
                  Il y consulte son bail (une fois signé) et ses quittances, dépose son
                  attestation d&apos;assurance, signale un incident photo à
                  l&apos;appui, annonce son départ. Depuis son téléphone, sans
                  installer d&apos;application.
                </p>
                <p className="mesure-lecture mt-3 text-[16px] leading-relaxed text-[var(--texte-secondaire)]">
                  Chaque geste qu&apos;il fait lui-même est un appel que vous ne
                  recevez pas — et une pièce qui arrive au bon endroit du
                  dossier.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- Pour qui */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-12 sm:px-7">
          <div className="grid overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--ivoire)] shadow-sm lg:grid-cols-2">
            <Image
              src="/illustrations/interieur-gerimmo-2026.jpg"
              width={1536}
              height={1024}
              sizes="(max-width: 1024px) 100vw, 50vw"
              alt="Salon lumineux d'un logement locatif"
              className="h-full max-h-[350px] w-full object-cover lg:max-h-none"
            />
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <p className="eyebrow text-[var(--marque-sombre)]">Un logement, un dossier clair</p>
              <h2 className="mt-2 font-heading text-[26px] font-bold leading-tight text-[var(--encre)]">
                Gardez le fil de chaque location
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
                Le bien, son bail, ses loyers et ses documents restent reliés. Vous retrouvez l&apos;information utile au moment d&apos;agir, sans reconstituer l&apos;historique.
              </p>
              <Link href="/inscription" className="btn-secondaire mt-5 self-start">
                Créer mon compte
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- Pour qui */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <TitreSection sur="Pour qui" titre="Trois espaces, un même dossier" />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              [
                "Propriétaire bailleur",
                "Vous gérez en direct : patrimoine en un regard, quittancement en un clic, veille réglementaire (DPE), récapitulatif fiscal 2044 prêt à recopier.",
              ],
              [
                "Locataire",
                "Son espace à lui : son bail (une fois signé), ses quittances, attestation d'assurance, incidents suivis étape par étape, messagerie avec son gestionnaire.",
              ],
              [
                "Agence",
                "Mandats, honoraires, portefeuilles par agent, rapports de gestion — la gérance complète, du bail à la restitution du dépôt.",
              ],
            ].map(([titre, texte]) => (
              <div key={titre} className="vitrine-carte">
                <h3 className="font-heading text-[18px] font-bold text-[var(--encre)]">{titre}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
                  {texte}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="mx-auto max-w-6xl px-4 pb-8 text-sm text-[var(--texte-secondaire)] sm:px-7">Toutes les offres de gestion locative sont accessibles en France. La mise en relation avec le réseau d’artisans dépend de la commune du bien et du métier recherché ; aucune date d’ouverture n’est annoncée.</p>
        {/* ------------------------------------------------ Fonctionnalités */}
        <section className="border-y border-[var(--filet)] bg-[var(--ivoire)]">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <TitreSection
              sur="Ce que Gerimmo fait pour vous"
              titre="Du bail à la restitution du dépôt"
            />
            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {FONCTIONNALITES.map(([titre, texte]) => (
                <div key={titre} className="flex gap-3">
                  <Coche />
                  <div>
                    <h3 className="text-[16px] font-semibold text-[var(--encre)]">{titre}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
                      {texte}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Tarifs */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-12 sm:px-7">
          <div className="grid overflow-hidden rounded-2xl border border-[var(--filet)] bg-[var(--ivoire)] shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col justify-center p-7 sm:p-10">
              <p className="eyebrow text-[var(--marque-sombre)]">Incident et intervention</p>
              <h2 className="mt-2 font-heading text-[26px] font-bold leading-tight text-[var(--encre)]">Une demande suivie jusqu&apos;à sa résolution</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
                Le locataire décrit le problème et joint ses photos. Le gestionnaire qualifie la demande, organise l&apos;intervention et conserve les échanges dans le dossier.
              </p>
            </div>
            {/* 25/09 (P2) : chargée d'emblée — différée, la moitié droite de
                la carte restait vide tant que l'image n'était pas défilée
                (relevé sur les captures pleine page). */}
            <Image
              src="/illustrations/intervention-gerimmo-2026.jpg"
              width={1536}
              height={1024}
              loading="eager"
              sizes="(max-width: 1024px) 100vw, 55vw"
              alt="Artisan intervenant sous un évier dans un logement"
              className="h-full max-h-[350px] w-full object-cover lg:max-h-none"
            />
          </div>
        </section>

        {/* ---------------------------------------------------------- Tarifs */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <TitreSection sur="Tarifs" titre="Un prix selon la taille de votre parc, tout compris" />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="vitrine-carte vitrine-carte-mise-en-avant min-w-0">
              <p className="eyebrow text-[var(--marque-sombre)]">Particuliers et SCI gérant leurs biens</p>
              <p className="mt-4 font-heading text-[32px] font-extrabold leading-none tracking-[-0.02em] text-[var(--encre)]">
                Dès <span className="montant">5,99&nbsp;€</span>
                <span className="text-[15px] font-medium tracking-normal text-[var(--texte-secondaire)]">{avec(TTC)} / mois</span>
              </p>
              <div className="mt-5">
                <TableauParticuliers />
              </div>
              <ul className="mt-5 space-y-2.5 text-[14px] text-[var(--texte-secondaire)]">
                {[
                  `Essai gratuit de ${duree}, sans carte bancaire`,
                  "Mensuel sans engagement, ou annuel payé en une fois",
                  "Mêmes fonctions dans chaque formule ; accès locataires inclus",
                  "Aucuns frais d'installation",
                ].map((l) => (
                  <li key={l} className="flex gap-2.5">
                    <Coche />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
              <Link href="/inscription" className="btn-or mt-7 inline-flex !px-5 !py-2.5">
                Créer mon compte
              </Link>
            </div>
            <div className="vitrine-carte min-w-0">
              <p className="eyebrow text-[var(--marque-sombre)]">Agences immobilières</p>
              <p className="mt-4 font-heading text-[32px] font-extrabold leading-none tracking-[-0.02em] text-[var(--encre)]">
                Dès <span className="montant">39&nbsp;€</span>
                <span className="text-[15px] font-medium tracking-normal text-[var(--texte-secondaire)]">{avec(HT)} / mois</span>
              </p>
              {REGIME_TVA?.nature === "franchise" && (
                <p className="mt-2 text-[13px] text-[var(--texte-secondaire)]">TVA non applicable, art. 293 B du CGI.</p>
              )}
              <div className="mt-5">
                <TableauAgences />
              </div>
              <ul className="mt-5 space-y-2.5 text-[14px] text-[var(--texte-secondaire)]">
                {[
                  "Mensuel, sans engagement, selon les lots sous mandat actif",
                  "Collaborateurs et locataires inclus, rapports envoyés à vos propriétaires",
                  `Essai de ${duree} ouvert sur demande, sans carte`,
                  "Reprise manuelle de vos données possible, sur devis",
                ].map((l) => (
                  <li key={l} className="flex gap-2.5">
                    <Coche />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
              <a href="#agences" className="btn-secondaire mt-7 inline-flex">
                Nous écrire →
              </a>
            </div>
          </div>
          <p className="mt-5 text-[13px] text-[var(--texte-secondaire)]">{MENTION_TAXES}</p>
          <p className="mt-2 text-[13.5px] text-[var(--texte-secondaire)]">
            Travaux et interventions d&apos;artisans : toujours sur devis, facturés à part, jamais inclus dans
            l&apos;abonnement.{" "}
            <Link href="/tarifs" className="lien-discret">
              Tout le détail des tarifs →
            </Link>
          </p>
        </section>

        {/* --------------------------------------------------------- Journal */}
        {articles && articles.length > 0 && (
          <section className="border-y border-[var(--filet)] bg-[var(--ivoire)]">
            <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
              <div className="entete-carte">
                <div>
                  <TitreSection sur="Journal" titre="Ce qu'il faut savoir, quand ça compte" />
                </div>
                <Link href="/journal" className="lien-discret text-[13.5px]">
                  Tout le journal →
                </Link>
              </div>
              {/* 24/09 : la carte entière est le lien. Elle se soulevait au
                  survol comme un bloc cliquable, mais seul le titre l'était. */}
              {/* 25/09 (P3) : la grille suit le nombre d'articles — un seul
                  article ne laisse plus deux tiers de vide. */}
              <div
                className={`mt-8 grid gap-4 ${
                  articles.length >= 3
                    ? "sm:grid-cols-3"
                    : articles.length === 2
                      ? "sm:grid-cols-2"
                      : "max-w-2xl"
                }`}
              >
                {articles.map((a) => (
                  <Link key={a.id} href={`/journal/${a.slug}`} className="vitrine-carte group block">
                    <h3 className="font-heading text-[17px] font-bold leading-snug text-[var(--encre)] group-hover:text-[var(--marque-sombre)]">
                      {titreSansDoublon(a.titre)}
                    </h3>
                    {a.chapo && (
                      <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
                        {a.chapo}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------- FAQ */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <TitreSection sur="Questions fréquentes" titre="Ce qu'on nous demande" />
          <div className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {faq(duree).map(([q, r]) => (
              <div key={q} className="border-t border-[var(--filet)] pt-5">
                <h3 className="text-[16px] font-semibold text-[var(--encre)]">{q}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
                  {r}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- Devis agences */}
        {/* scroll-mt : le titre ne passe plus sous le bandeau collant quand on
            arrive par /#agences (audit du 27/09). */}
        <AncreAuChargement />
        <section id="agences" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-16 sm:px-7 sm:pb-24">
          <div className="vitrine-bandeau">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="eyebrow text-[var(--sur-marque)]/80">Agences</p>
                <h2 className="mt-2 max-w-[18ch] text-balance font-heading text-[28px] font-bold leading-[1.15] text-[var(--sur-marque)] sm:text-[34px]">
                  Parlons de votre portefeuille
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--sur-marque)]/85">
                  Dites-nous qui vous êtes et combien de lots vous gérez : nous
                  revenons vers vous sous 48 h ouvrées. Le tarif est celui de la
                  grille publique, par tranches cumulatives de lots, sans frais
                  d&apos;installation ; une reprise de vos données peut être
                  chiffrée sur devis si vous la souhaitez.
                </p>
              </div>
              <FormulaireDevisVitrine />
            </div>
          </div>
        </section>
      </main>

      <PiedPublic />
    </div>
  );
}
