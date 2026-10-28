import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, House, FileText, Wallet, Bell, KeyRound, Wrench, Check, ShieldCheck, Smartphone, ChevronDown } from "lucide-react";
import { createClientPublic } from "@/lib/supabase/public";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { CartesOffresPubliques } from "@/components/cartes-offres-publiques";
import { ImageJournal } from "@/components/image-journal";
import { FormulaireDevisVitrine } from "./formulaire-devis-vitrine";
import { AncreAuChargement } from "@/components/ancre-au-chargement";
import { ApercuTableauDeBord, ApercuQuittance } from "./apercus-produit";
import { REGIME_TVA } from "@/lib/editeur";
import { badgeEssai, dureeEssai, etiquetteTaxes, libelleOffreLancement, mentionTaxesPubliques } from "@/lib/tarifs";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import { TuileOutil, outilsPresentes } from "@/components/outils/icones-outils";

export const revalidate = 3600;
export function generateMetadata() {
  return metadonneesPubliques({
    titre: "Gerimmo — Vos locations, l’esprit tranquille",
    description: `Vos biens, baux, loyers, documents et interventions réunis. La gestion locative pour propriétaires bailleurs et SCI, avec un espace locataire. Essai de ${dureeEssai()}, sans carte.`,
    chemin: "/",
  });
}
const TTC = etiquetteTaxes("ttc", REGIME_TVA);
const avec = (e: string | null) => (e ? ` ${e}` : "");
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
    "Chaque organisation (nom propre, SCI) a ses lots, son livre, sa fiscalité — étanches. Vos locataires ne voient que leur logement et leurs pièces.",
  ],
  [
    "Que se passe-t-il si j'arrête ?",
    "La résiliation prend effet à la prochaine échéance : l'accès payé reste ouvert jusque-là. Ensuite, vos données restent consultables et exportables, en lecture seule. Le compte est supprimé après vingt-quatre mois sans connexion ni abonnement, après deux avertissements par courriel ; certaines pièces suivent leur propre durée (page Confidentialité). Vous pouvez aussi demander la suppression après export. Aucun frais de sortie.",
  ],
  // Relecture du 23/10 (plan de conformité, lot 4) : la V1 réserve l'offre aux propriétaires qui gèrent eux-mêmes leurs
  // biens (conditions générales, articles 1 et 2) ; « le bien d'un proche » en sortait.
  [
    "Puis-je gérer une SCI ou une indivision ?",
    "Oui, pour vos propres biens : en nom propre, en SCI ou en indivision. Chaque organisation est séparée, et vous passez de l'une à l'autre depuis le même compte.",
  ],
  // La liste d'attente des agences (20/10/2026) : l'offre agences est hors du site public depuis le 13/10 ; la question
  // revient, la réponse renvoie à /agences (section #agences ci-dessous) sans prix ni date.
  [
    "Gerimmo est-il ouvert aux agences de gestion ?",
    "Pas encore : la V1 s'adresse aux propriétaires bailleurs et aux SCI. L'offre pour les agences est en préparation ; inscrivez votre agence sur la liste d'attente et nous vous préviendrons à son ouverture.",
  ],
];


export default async function PageVitrine() {
  // Lecture publique sans cookie (audit final, PUB-05) : la page reste statique et relue toutes les heures.
  const supabase = createClientPublic();
  const { data: articles } = supabase
    ? await supabase.from("publications")
      .select("id, titre, slug, chapo, publie_le, facebook_image_url")
      .eq("statut", "publiee").order("publie_le", { ascending: false }).limit(3)
    : { data: null };
  const duree = dureeEssai();
  const offre = libelleOffreLancement();
  return (
    <div className="site-public">
      <EnTetePublic />
      <main>
        <header className="public-hero">
          <div className="public-conteneur public-hero-grille">
            <div className="public-hero-texte">
              <p className="eyebrow">L’immobilier en confiance</p>
              <h1>Vos locations,<br /><em>l’esprit tranquille.</em></h1>
              <p className="public-chapo">Du premier bail au suivi des loyers, retrouvez vos biens, vos locataires et vos documents dans un espace simple et organisé.</p>
              <div className="public-actions">
                {/* Le bandeau porte déjà le bouton doré « Créer mon compte » : un seul primaire par écran (audit final, UX-18). */}
                <Link href="/inscription" className="btn-secondaire">Créer mon compte <ArrowUpRight size={18} aria-hidden /></Link>
                <a href="#fonctionnalites" className="btn-secondaire">Découvrir Gerimmo <ArrowRight size={17} aria-hidden /></a>
              </div>
              <Link href="/tarifs" title={offre ?? undefined} className="public-essai"><span aria-hidden className="public-point" />{badgeEssai()}</Link>
              <p className="public-note">Sans carte bancaire · Gestion locative partout en France</p>
            </div>
            <div className="public-hero-visuel">
              <Image src="/illustrations/interieur-gerimmo-2026.jpg" alt="Un salon lumineux ouvert sur l’extérieur" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 550px" preload className="public-hero-photo" />
              <div className="public-photo-legende"><House size={18} aria-hidden /><span>Des biens bien suivis.<br /><strong>Des propriétaires sereins.</strong></span></div>
              <div className="public-hero-apercu"><ApercuTableauDeBord /></div>
            </div>
          </div>
          <div className="public-conteneur public-reperes">
            <span><House aria-hidden /> Propriétaires & SCI</span><span><Wrench aria-hidden /> Un réseau d’artisans</span><span><Smartphone aria-hidden /> Un espace pour vos locataires</span><span><ShieldCheck aria-hidden /> Vos dossiers au même endroit</span>
          </div>
        </header>

        <section aria-labelledby="outils-gratuits" className="public-conteneur public-outils-rapides">
          <div><p className="eyebrow">Pour commencer, sans compte</p><h2 id="outils-gratuits">Un calcul à faire ?</h2><Link href="/outils" className="public-lien">Essayer nos outils gratuits <ArrowRight aria-hidden size={16} /></Link></div>
          <ul>{outilsPresentes().map(o => <li key={o.chemin}><Link href={o.chemin}><TuileOutil chemin={o.chemin} taille="sm" /><span>{o.court}</span><ArrowUpRight size={14} aria-hidden /></Link></li>)}</ul>
        </section>

        {/* Ce que Gerimmo remplace : les informations dispersées entre plusieurs dossiers. */}
        <section id="fonctionnalites" className="public-section public-section-blanche">
          <div className="public-conteneur">
            <div className="public-titre-section"><div><p className="eyebrow">Votre gestion, au même endroit</p><h2>Moins de recherches.<br />Plus de clarté.</h2></div><p>Chaque information reste liée au bon logement. Vous savez où en est votre location et quelle est la prochaine action.</p></div>
            <div className="public-fonctions">
              {[
                { Icone: House, titre: "Vos biens, en un regard", texte: "Adresse, caractéristiques, diagnostics : une fiche claire par lot, avec l’historique de sa location.", couleur: "bleu" },
                { Icone: FileText, titre: "Un bail, étape par étape", texte: "Retrouvez vos personnes et les informations du logement. Complétez le contrat, puis générez son PDF.", couleur: "or" },
                { Icone: Wallet, titre: "Des loyers bien suivis", texte: "Enregistrez les encaissements, retrouvez les quittances et consultez votre livre de recettes et dépenses.", couleur: "vert" },
                { Icone: Bell, titre: "Les bons rappels", texte: "Assurance, diagnostics, échéances : identifiez les éléments à compléter et accédez au dossier concerné.", couleur: "rose" },
              ].map(({ Icone, titre, texte, couleur }) => <article key={titre} className={`public-fonction public-ton-${couleur}`}><span className="public-icone"><Icone aria-hidden size={23} /></span><h3>{titre}</h3><p>{texte}</p></article>)}
            </div>
            <div className="public-parcours">
              <div><p className="eyebrow">Simple dès le départ</p><h3>Votre première location en trois temps</h3></div>
              <ol><li><span>01</span><div><strong>Ajoutez votre lot</strong><p>Le logement et ses caractéristiques.</p></div></li><li><span>02</span><div><strong>Préparez votre bail</strong><p>Les personnes, les dates et le loyer.</p></div></li><li><span>03</span><div><strong>Suivez votre location</strong><p>Les loyers, les pièces et les échanges.</p></div></li></ol>
            </div>
          </div>
        </section>

        <section id="espaces" className="public-section public-conteneur">
          <div className="public-titre-section"><div><p className="eyebrow">À chacun son espace</p><h2>Les bonnes informations.<br />Pour la bonne personne.</h2></div><p>Propriétaires, locataires et artisans : chacun retrouve les éléments utiles à son rôle.</p></div>
          <div className="public-espaces">
            {[
              { Icone: KeyRound, titre: "Propriétaires bailleurs", texte: "Pilotez vos locations en direct, seul ou en indivision. Vos documents et vos loyers restent reliés à chaque bien.", lien: "/inscription", action: "Créer mon compte", couleur: "bleu" },
              { Icone: House, titre: "Locataires", texte: "Consultez vos quittances et votre bail signé, déposez votre assurance et suivez vos demandes depuis votre téléphone.", lien: "/connexion", action: "Accéder à mon espace", couleur: "vert" },
              { Icone: Wrench, titre: "Artisans", texte: "Retrouvez les demandes qui vous sont confiées, préparez vos devis et suivez vos rendez-vous et interventions.", lien: "/artisan/inscription", action: "Rejoindre le réseau", couleur: "rose" },
            ].map(({ Icone, titre, texte, lien, action, couleur }) => <article key={titre} className={`public-espace public-ton-${couleur}`}><span className="public-icone"><Icone size={24} aria-hidden /></span><h3>{titre}</h3><p>{texte}</p><Link href={lien} className="public-lien">{action}<ArrowUpRight size={16} aria-hidden /></Link></article>)}
          </div>
          <p className="public-note public-reseau-note">Le réseau d’artisans grandit avec ses inscrits : chaque artisan choisit sa zone et ses métiers, puis Gerimmo vérifie son inscription. La gestion locative reste accessible partout en France, indépendamment de ce réseau.</p>
          {/* La liste d'attente des agences (20/10/2026) : les agences sont hors du site public depuis le 13/10 ; celles qui
              arrivent ici trouvent le chemin de /agences. En fin de la section des espaces (même bloc que « trois temps »
              dans la section précédente), pour ne pas rompre l'alternance des fonds. Pas de prix, pas de date. */}
          <section id="agences" aria-labelledby="agences-titre" className="public-parcours">
            <div><p className="eyebrow">Agences de gestion</p><h2 id="agences-titre">Vous gérez des biens pour des mandants ?</h2></div>
            <div><p className="public-description">L’offre Gerimmo pour les agences de gestion locative est en préparation. Inscrivez votre agence sur la liste d’attente : nous vous préviendrons à son ouverture.</p><Link href="/agences" className="btn-secondaire mt-5">Rejoindre la liste d’attente <ArrowRight size={17} aria-hidden /></Link></div>
          </section>
        </section>

        <section className="public-section public-section-blanche">
          <div className="public-conteneur public-suivi">
            <div className="public-suivi-visuel"><Image src="/illustrations/intervention-gerimmo-2026.jpg" alt="Un artisan intervient sous l’évier d’un logement" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 550px" /><div className="public-suivi-etiquette"><Wrench aria-hidden size={20} /><div><strong>Un incident, un suivi clair</strong><span>Signalement · Devis · Intervention</span></div></div></div>
            <div><p className="eyebrow">Du quotidien aux imprévus</p><h2>Gardez le fil.<br />Même quand tout ne va pas comme prévu.</h2><p className="public-description">Un problème signalé par le locataire, un document à retrouver, un loyer reçu : chaque événement a sa place dans le dossier.</p><ul className="public-liste"><li><Check aria-hidden /> Les signalements et les échanges restent regroupés.</li><li><Check aria-hidden /> Le locataire suit l’avancement de sa demande.</li><li><Check aria-hidden /> Les quittances se préparent depuis les encaissements.</li></ul><details className="public-exemple"><summary>Voir un exemple de quittance <ChevronDown size={17} aria-hidden /></summary><ApercuQuittance /></details></div>
          </div>
        </section>

        <section id="tarifs" className="public-section public-conteneur">
          <div className="public-titre-section"><div><p className="eyebrow">Particuliers & SCI</p><h2>Un tarif à la taille<br />de votre patrimoine.</h2></div><p>Les mêmes fonctions dans chaque formule. Seul le nombre de biens change. Commencez par {duree} d’essai gratuit, sans carte bancaire.</p></div>
          <CartesOffresPubliques />
          <p className="public-note">{mentionTaxesPubliques(REGIME_TVA)} Travaux et interventions sur devis, facturés séparément.</p>
        </section>

        {articles && articles.length > 0 && <section className="public-section public-section-blanche"><div className="public-conteneur"><div className="public-titre-section"><div><p className="eyebrow">Le journal Gerimmo</p><h2>Des repères pour<br />mieux gérer.</h2></div><Link href="/journal" className="public-lien">Tout le journal <ArrowRight size={17} aria-hidden /></Link></div><div className="public-journal-grille">{articles.map(a => <Link key={a.id} href={`/journal/${a.slug}`} className="public-article"><ImageJournal url={a.facebook_image_url} titre={a.titre} tailles="(max-width: 700px) 100vw, 360px" /><div><p className="eyebrow">{a.publie_le ? new Date(a.publie_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Journal"}</p><h3>{titreSansDoublon(a.titre)}</h3>{a.chapo && <p>{a.chapo}</p>}<span className="public-lien">Lire l’article <ArrowUpRight size={16} aria-hidden /></span></div></Link>)}</div></div></section>}

        <section className="public-section public-conteneur public-faq"><div><p className="eyebrow">On vous répond</p><h2>Avant de<br />vous lancer.</h2><p className="public-description">Les réponses aux questions les plus fréquentes.</p></div><div>{faq(duree).map(([q, r]) => <details key={q}><summary>{q}<ChevronDown size={18} aria-hidden /></summary><p>{r}</p></details>)}</div></section>
        <AncreAuChargement />
        <section id="contact" className="public-conteneur scroll-mt-28 public-contact"><div className="public-contact-interieur"><div><p className="eyebrow">Une question ?</p><h2>Écrivez-nous,<br />on vous répond.</h2><p>Une question sur Gerimmo, sur vos données ou sur votre compte ? Dites-nous en quelques mots de quoi il s’agit. Nous répondons sous 48 h ouvrées.</p><ul className="public-liste"><li><Check aria-hidden /> Une réponse d’une personne, pas d’un robot.</li><li><Check aria-hidden /> Vos informations ne servent qu’à vous répondre.</li><li><Check aria-hidden /> Pour exercer vos droits sur vos données, indiquez-le dans votre message.</li></ul></div><FormulaireDevisVitrine /></div></section>
      </main>
      <PiedPublic />
    </div>
  );
}
