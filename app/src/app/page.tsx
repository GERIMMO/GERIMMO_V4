import Link from "next/link";
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
    "Bail, quittance, décompte de restitution, rapport de gestion : produits depuis vos données, à votre en-tête, prêts à envoyer.",
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
      <p className="eyebrow">{sur}</p>
      <h2 className="mt-1.5 font-heading text-[26px] leading-tight text-[var(--encre)] sm:text-[30px]">
        {titre}
      </h2>
    </>
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
      {/* ------------------------------------------------------------ Héros */}
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <EnTetePublic />

        <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-16 sm:px-7 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="eyebrow text-[var(--or)]">Gestion locative</p>
              <h1 className="mt-3 max-w-xl font-heading text-[38px] leading-[1.08] text-[var(--sur-encre)] sm:text-[var(--pas-affiche)]">
                Le sérieux d&apos;une agence,
                <br />
                sans les honoraires.
              </h1>
              <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-[var(--sur-encre)]/80">
                Baux, quittances automatiques, incidents, états des lieux, livre
                et fiscalité — et un espace pour chaque locataire. Pour les
                propriétaires bailleurs qui gèrent en direct, et pour les
                agences.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/inscription" className="btn-or !px-5 !py-2.5 !text-[14px]">
                  Commencer — 1ᵉʳ bien offert
                </Link>
                <a
                  href="#agences"
                  className="rounded-lg border border-[var(--sur-encre)]/30 px-4 py-2.5 text-sm text-[var(--sur-encre)]/90 hover:border-[var(--sur-encre)]/60"
                >
                  Je suis une agence →
                </a>
              </div>
              <p className="mt-4 text-xs text-[var(--sur-encre)]/55">
                Essai de 14 jours, sans carte bancaire. Aucun honoraire de
                gestion, jamais.
              </p>
            </div>

            {/* L'aperçu n'est pas une image : c'est l'interface réelle,
                construite avec les mêmes classes que l'application. */}
            <div className="lg:pl-4">
              <ApercuTableauDeBord />
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* --------------------------------------------- Ce que ça remplace */}
        <section className="border-b border-[var(--filet)] bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <TitreSection sur="Ce que Gerimmo remplace" titre="Quatre corvées en moins" />
            <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
              {REMPLACE.map(([quoi, quand, comment]) => (
                <div key={quoi} className="border-t-2 border-t-[var(--or)] pt-3.5">
                  <h3 className="font-heading text-[17px] text-[var(--encre)]">{quoi}</h3>
                  <p className="mono-discret mt-1 !text-[10px] sans-majuscules">{quand}</p>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
                    {comment}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Quittancement */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_420px]">
            <div>
              <TitreSection
                sur="Le geste le plus fréquent"
                titre="L'encaissement écrit tout le reste"
              />
              <p className="mesure-lecture mt-4 text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
                Vous notez qu&apos;un loyer est rentré. Gerimmo émet la quittance,
                l&apos;inscrit au livre, calcule le prorata du premier mois et
                referme la relance. Un paiement partiel produit un reçu, promu
                en quittance dès que le mois est soldé.
              </p>
              <p className="mesure-lecture mt-3 text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
                Et si vous supprimez un encaissement saisi par erreur, la
                quittance correspondante est retirée : le document ne survit
                jamais à l&apos;argent qu&apos;il atteste.
              </p>
            </div>
            <ApercuQuittance />
          </div>
        </section>

        {/* ------------------------------------------------ Espace locataire */}
        <section className="border-y border-[var(--filet)] bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <div className="grid items-center gap-10 lg:grid-cols-[260px_1fr]">
              <ApercuMobileIncident />
              <div>
                <TitreSection
                  sur="Inclus, sans supplément"
                  titre="Chaque locataire a son espace"
                />
                <p className="mesure-lecture mt-4 text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
                  Il y consulte son bail signé et ses quittances, dépose son
                  attestation d&apos;assurance, signale un incident photo à
                  l&apos;appui, annonce son départ. Depuis son téléphone, sans
                  installer d&apos;application.
                </p>
                <p className="mesure-lecture mt-3 text-[15px] leading-relaxed text-[var(--texte-secondaire)]">
                  Chaque geste qu&apos;il fait lui-même est un appel que vous ne
                  recevez pas — et une pièce qui arrive au bon endroit du
                  dossier.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- Pour qui */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <TitreSection sur="Pour qui" titre="Trois espaces, un même dossier" />
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
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
              <div
                key={titre}
                className="border border-[var(--filet)] bg-[var(--ivoire)] p-5"
              >
                <h3 className="font-heading text-[17px] text-[var(--encre)]">{titre}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
                  {texte}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ Fonctionnalités */}
        <section className="border-y border-[var(--filet)] bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <TitreSection
              sur="Ce que Gerimmo fait pour vous"
              titre="Du bail à la restitution du dépôt"
            />
            <div className="mt-8 grid gap-x-9 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
              {FONCTIONNALITES.map(([titre, texte]) => (
                <div key={titre}>
                  <h3 className="text-[15px] font-semibold text-[var(--encre)]">{titre}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
                    {texte}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Tarifs */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <TitreSection sur="Tarifs" titre="Un prix simple, tout compris" />
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className="border border-[var(--filet)] border-l-[3px] border-l-[var(--or)] bg-[var(--ivoire)] p-6">
              <h3 className="font-heading text-[18px] text-[var(--encre)]">
                Propriétaire bailleur
              </h3>
              <p className="mt-3 font-heading text-[34px] leading-none text-[var(--encre)]">
                <span className="montant">5,99 €</span>
                <span className="text-[15px] text-muted-foreground"> / bien / mois</span>
              </p>
              <ul className="mt-4 space-y-2 text-[13.5px] text-[var(--texte-secondaire)]">
                <li>✓ 1ᵉʳ bien offert, à vie</li>
                <li>✓ Essai de 14 jours sans carte</li>
                <li>✓ Sans engagement — un bien retiré n&apos;est plus compté</li>
                <li>✓ Espaces locataires inclus, sans limite</li>
                <li>✓ Aucuns frais de mise en place</li>
              </ul>
              <Link href="/inscription" className="btn-or mt-5 inline-flex">
                Créer mon compte
              </Link>
            </div>
            <div className="border border-[var(--filet)] border-l-[3px] border-l-[var(--encre)] bg-[var(--ivoire)] p-6">
              <h3 className="font-heading text-[18px] text-[var(--encre)]">
                Agence immobilière
              </h3>
              <p className="mt-3 font-heading text-[34px] leading-none text-[var(--encre)]">
                Sur devis
                <span className="text-[15px] text-muted-foreground"> — par palier de lots</span>
              </p>
              <ul className="mt-4 space-y-2 text-[13.5px] text-[var(--texte-secondaire)]">
                <li>✓ Mandats, honoraires, rapports de gestion</li>
                <li>✓ Portefeuilles par agent</li>
                <li>✓ Tarification par palier de lots</li>
                <li>✓ Essai de 14 jours</li>
              </ul>
              <a
                href="#agences"
                className="mt-5 inline-flex rounded-lg border border-[var(--encre)]/25 px-4 py-2 text-sm text-[var(--encre)] hover:border-[var(--encre)]"
              >
                Demander un devis →
              </a>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Journal */}
        {articles && articles.length > 0 && (
          <section className="border-y border-[var(--filet)] bg-card">
            <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
              <div className="entete-carte">
                <div>
                  <TitreSection sur="Journal" titre="Ce qu'il faut savoir, quand ça compte" />
                </div>
                <Link href="/journal" className="lien-discret text-[13px]">
                  Tout le journal →
                </Link>
              </div>
              <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-3">
                {articles.map((a) => (
                  <article key={a.id}>
                    <h3 className="font-heading text-[17px] leading-snug text-[var(--encre)]">
                      <Link href={`/journal/${a.slug}`} className="hover:underline">
                        {a.titre}
                      </Link>
                    </h3>
                    {a.chapo && (
                      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
                        {a.chapo}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------- FAQ */}
        <section className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
          <TitreSection sur="Questions fréquentes" titre="Ce qu'on nous demande" />
          <div className="mt-8 grid gap-x-9 gap-y-6 sm:grid-cols-2">
            {FAQ.map(([q, r]) => (
              <div key={q}>
                <h3 className="text-[15px] font-semibold text-[var(--encre)]">{q}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
                  {r}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- Devis agences */}
        <section id="agences" className="bg-[var(--encre)] text-[var(--sur-encre)]">
          <div className="mx-auto w-full max-w-6xl px-4 section-vitrine sm:px-7">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="eyebrow text-[var(--or)]">Agences</p>
                <h2 className="mt-1.5 font-heading text-[26px] leading-tight sm:text-[30px]">
                  Parlons de votre portefeuille
                </h2>
                <p className="mt-4 max-w-md text-[14px] leading-relaxed text-[var(--sur-encre)]/75">
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
