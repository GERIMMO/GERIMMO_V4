import Link from "next/link";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { FormulaireDevisVitrine } from "./formulaire-devis-vitrine";

export const metadata = {
  title: "Gerimmo — La gérance immobilière, tenue au carré",
  description:
    "Baux, quittances automatiques, incidents, états des lieux, fiscalité : la gestion locative des propriétaires bailleurs et des agences. Premier bien offert.",
};

// Site vitrine — ce que voit un visiteur avant toute connexion. Un connecté
// est renvoyé vers ses espaces par le proxy. Tout ce qui est promis ici
// existe dans l'application (politique « fonctionnalités honnêtes »).

function anneeCourante() {
  return new Date().getFullYear();
}

const FONCTIONNALITES: [string, string][] = [
  [
    "Quittances automatiques",
    "L'encaissement déclenche tout : quittance émise, écriture au livre, premier loyer au prorata. Un paiement partiel produit un reçu, promu en quittance au solde.",
  ],
  [
    "Espace locataire inclus",
    "Vos locataires consultent leur bail signé, leurs quittances, déposent leur attestation d'assurance, signalent un incident photo à l'appui et annoncent leur départ.",
  ],
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
];

export default function PageVitrine() {
  return (
    <div className="min-h-full bg-[var(--creme)]">
      {/* En-tête */}
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-7">
          <MarqueGerimmo surEncre />
          <nav className="flex items-center gap-3">
            <Link
              href="/connexion"
              className="text-[13px] text-[var(--sur-encre)]/80 hover:text-[var(--sur-encre)]"
            >
              Se connecter
            </Link>
            <Link href="/inscription" className="btn-or !py-1.5 text-[13px]">
              Créer mon compte
            </Link>
          </nav>
        </div>

        {/* Héros */}
        <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-14 sm:px-7 sm:pt-16 sm:pb-20">
          <p className="eyebrow text-[var(--or)]">Gestion locative</p>
          <h1 className="mt-2 max-w-2xl font-heading text-3xl leading-tight text-[var(--sur-encre)] sm:text-5xl">
            Vos biens, tenus au carré.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--sur-encre)]/80">
            Baux, quittances automatiques, incidents, états des lieux, livre et
            fiscalité — et un espace pour chaque locataire. Pour les
            propriétaires bailleurs qui gèrent en direct, et pour les agences.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/inscription" className="btn-or">
              Commencer — 1ᵉʳ bien offert
            </Link>
            <a
              href="#agences"
              className="rounded-lg border border-[var(--sur-encre)]/30 px-4 py-2 text-sm text-[var(--sur-encre)]/90 hover:border-[var(--sur-encre)]/60"
            >
              Je suis une agence →
            </a>
          </div>
          <p className="mt-3 text-xs text-[var(--sur-encre)]/55">
            Essai de 14 jours, sans carte bancaire. Aucun honoraire de gestion,
            jamais.
          </p>
        </div>
      </header>

      <main>
        {/* Pour qui */}
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-7">
          <p className="eyebrow">Pour qui</p>
          <h2 className="mt-1 font-heading text-2xl text-[var(--encre)]">
            Trois espaces, un même dossier
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="loc-carte">
              <h3 className="text-base font-medium">Propriétaire bailleur</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Vous gérez en direct : patrimoine en un regard, quittancement en
                un clic, veille réglementaire (DPE), récapitulatif fiscal 2044
                prêt à recopier.
              </p>
            </div>
            <div className="loc-carte">
              <h3 className="text-base font-medium">Locataire</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Son espace à lui : bail signé, quittances, attestation
                d&apos;assurance, incidents suivis étape par étape, messagerie avec
                son gestionnaire.
              </p>
            </div>
            <div className="loc-carte">
              <h3 className="text-base font-medium">Agence</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Mandats, honoraires, portefeuilles par agent, rapports de
                gestion — la gérance complète, du bail à la restitution du
                dépôt.
              </p>
            </div>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section className="border-y border-[var(--filet)] bg-card">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-7">
            <p className="eyebrow">Ce que Gerimmo fait pour vous</p>
            <h2 className="mt-1 font-heading text-2xl text-[var(--encre)]">
              Le sérieux d&apos;une agence, sans les honoraires
            </h2>
            <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {FONCTIONNALITES.map(([titre, texte]) => (
                <div key={titre}>
                  <h3 className="text-[15px] font-semibold text-[var(--encre)]">{titre}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{texte}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tarifs */}
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-7">
          <p className="eyebrow">Tarifs</p>
          <h2 className="mt-1 font-heading text-2xl text-[var(--encre)]">
            Un prix simple, tout compris
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="loc-carte border-l-4 border-l-[var(--or)]">
              <h3 className="text-base font-medium">Propriétaire bailleur</h3>
              <p className="mt-3 font-heading text-3xl text-[var(--encre)]">
                5,99 €<span className="text-base text-muted-foreground"> / bien / mois</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>✓ 1ᵉʳ bien offert, à vie</li>
                <li>✓ Essai de 14 jours sans carte</li>
                <li>✓ Sans engagement — un bien retiré n&apos;est plus compté</li>
                <li>✓ Espaces locataires inclus, sans limite</li>
                <li>✓ Aucuns frais de mise en place</li>
              </ul>
              <Link href="/inscription" className={`btn-or mt-4 inline-block`}>
                Créer mon compte
              </Link>
            </div>
            <div className="loc-carte">
              <h3 className="text-base font-medium">Agence immobilière</h3>
              <p className="mt-3 font-heading text-3xl text-[var(--encre)]">
                Sur devis<span className="text-base text-muted-foreground"> — par palier de lots</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li>✓ Mandats, honoraires, rapports de gestion</li>
                <li>✓ Portefeuilles par agent</li>
                <li>✓ Tarification par palier de lots</li>
                <li>✓ Essai de 14 jours</li>
              </ul>
              <a
                href="#agences"
                className="mt-4 inline-block rounded-lg border border-[var(--encre)]/25 px-4 py-2 text-sm text-[var(--encre)] hover:border-[var(--encre)]"
              >
                Demander un devis →
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-y border-[var(--filet)] bg-card">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-7">
            <p className="eyebrow">Questions fréquentes</p>
            <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {FAQ.map(([q, r]) => (
                <div key={q}>
                  <h3 className="text-[15px] font-semibold text-[var(--encre)]">{q}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Devis agences */}
        <section id="agences" className="bg-[var(--encre)] text-[var(--sur-encre)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-7">
            <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="eyebrow text-[var(--or)]">Agences</p>
                <h2 className="mt-1 font-heading text-2xl">
                  Parlons de votre portefeuille
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--sur-encre)]/75">
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

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-7">
        <MarqueGerimmo />
        <nav className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <Link href="/connexion" className="hover:text-[var(--encre)]">
            Se connecter
          </Link>
          <Link href="/inscription" className="hover:text-[var(--encre)]">
            Créer mon compte
          </Link>
          <a href="#agences" className="hover:text-[var(--encre)]">
            Devis agence
          </a>
          <Link href="/confidentialite" className="hover:text-[var(--encre)]">
            Confidentialité
          </Link>
          <span>© Gerimmo {anneeCourante()}</span>
        </nav>
      </footer>
    </div>
  );
}
