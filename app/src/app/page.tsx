import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { FormulaireDevisVitrine } from "./formulaire-devis-vitrine";
import {
  ApercuTableauDeBord,
  ApercuQuittance,
  ApercuMobileIncident,
} from "./apercus-produit";

export const metadata = {
  title: "Gerimmo — La gérance immobilière, tenue au carré",
  description:
    "Baux, quittances automatiques, incidents, états des lieux, fiscalité : la gestion locative des propriétaires bailleurs et des agences. Premier bien offert.",
};

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
    "Le même travail, tenu par l'outil. 5,99 € par bien et par mois, le premier offert.",
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

const FAQ: [string, string][] = [
  [
    "Le premier bien est-il vraiment gratuit ?",
    "Oui — offert, à vie, sans carte bancaire. L'essai de 14 jours ouvre ensuite la formule complète, chaque bien supplémentaire coûte 5,99 € par mois, sans engagement.",
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
    "Mandats, honoraires, rapports de gestion, portefeuilles par agent : l'espace agence couvre la gérance complète. La tarification se fait sur devis, par palier de lots.",
  ],
  [
    "Que se passe-t-il si j'arrête ?",
    "Vos données restent exportables, et un bien retiré cesse d'être compté le mois suivant. Aucun engagement, aucun frais de sortie.",
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

  return (
    <div className="min-h-full bg-[var(--creme)]">
      <EnTetePublic />

      {/* ------------------------------------------------------------ Héros */}
      <header className="vitrine-hero">
        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-7 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <p className="eyebrow text-[var(--marque-sombre)]">Gestion locative</p>
              <h1 className="mt-4 max-w-[14ch] text-balance font-heading text-[40px] font-extrabold leading-[1.05] tracking-[-0.025em] text-[var(--encre)] sm:text-[56px]">
                Le sérieux d&apos;une agence, sans les honoraires.
              </h1>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-[var(--texte-secondaire)]">
                Baux, quittances automatiques, incidents, états des lieux, livre
                et fiscalité — et un espace pour chaque locataire. Pour les
                propriétaires bailleurs qui gèrent en direct, et pour les
                agences.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {/* 24/09 : une même cible, un même nom. /inscription s'appelait
                    ici « Commencer », ailleurs « Créer mon compte » ou
                    « Découvrir la gestion en direct ». */}
                <Link href="/inscription" className="btn-or !px-5 !py-3 !text-[15px]">
                  Créer mon compte — 1ᵉʳ bien offert
                </Link>
                <a href="#agences" className="btn-secondaire">
                  Je suis une agence →
                </a>
              </div>
              <p className="mt-5 text-[13px] text-[var(--libelle)]">
                Essai de 14 jours, sans carte bancaire. Aucun honoraire de
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
                  Il y consulte son bail signé et ses quittances, dépose son
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
                "Son espace à lui : bail signé, quittances, attestation d'assurance, incidents suivis étape par étape, messagerie avec son gestionnaire.",
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
          <TitreSection sur="Tarifs" titre="Un prix simple, tout compris" />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="vitrine-carte vitrine-carte-mise-en-avant">
              <p className="eyebrow text-[var(--marque-sombre)]">Propriétaire bailleur</p>
              <p className="mt-4 font-heading text-[40px] font-extrabold leading-none tracking-[-0.02em] text-[var(--encre)]">
                <span className="montant">5,99 €</span>
                <span className="text-[15px] font-medium tracking-normal text-[var(--texte-secondaire)]"> / bien / mois</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-[14px] text-[var(--texte-secondaire)]">
                {[
                  "1ᵉʳ bien offert, à vie",
                  "Essai de 14 jours sans carte",
                  "Sans engagement — un bien retiré n'est plus compté",
                  "Espaces locataires inclus, sans limite",
                  "Aucuns frais de mise en place",
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
            <div className="vitrine-carte">
              <p className="eyebrow text-[var(--marque-sombre)]">Agence immobilière</p>
              <p className="mt-4 font-heading text-[40px] font-extrabold leading-none tracking-[-0.02em] text-[var(--encre)]">
                Sur devis
                <span className="text-[15px] font-medium tracking-normal text-[var(--texte-secondaire)]"> — par palier de lots</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-[14px] text-[var(--texte-secondaire)]">
                {[
                  "Mandats, honoraires, rapports de gestion",
                  "Portefeuilles par agent",
                  "Facture d'honoraires numérotée, jointe au rapport",
                  "Essai de 14 jours",
                ].map((l) => (
                  <li key={l} className="flex gap-2.5">
                    <Coche />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
              <a href="#agences" className="btn-secondaire mt-7 inline-flex">
                Demander un devis →
              </a>
            </div>
          </div>
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
                      {a.titre}
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
            {FAQ.map(([q, r]) => (
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
        <section id="agences" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-7 sm:pb-24">
          <div className="vitrine-bandeau">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="eyebrow text-[var(--sur-marque)]/80">Agences</p>
                <h2 className="mt-2 max-w-[18ch] text-balance font-heading text-[28px] font-bold leading-[1.15] text-[var(--sur-marque)] sm:text-[34px]">
                  Parlons de votre portefeuille
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--sur-marque)]/85">
                  Dites-nous qui vous êtes et combien de lots vous gérez : nous
                  revenons vers vous sous 48 h ouvrées avec une proposition par
                  palier de lots, mise en route comprise.
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
