import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { MenuPublicMobile } from "@/components/menu-public-mobile";
import "@/app/vitrine.css";

const NAVIGATION = [
  ["/#fonctionnalites", "La solution"],
  ["/tarifs", "Tarifs"],
  ["/outils", "Outils gratuits"],
  ["/journal", "Journal"],
] as const;

/** Navigation commune à toute la vitrine ; toutes les destinations restent accessibles au téléphone. */
export function EnTetePublic() {
  return <BandeauPublic />;
}

function BandeauPublic() {
  return (
    <header className="bandeau-public public-navigation print:hidden">
      <div className="public-navigation-interieur">
        <Link href="/" aria-label="Gerimmo — accueil" className="public-logo"><MarqueGerimmo /><span className="ambiance-repere" aria-hidden="true" /></Link>
        <nav aria-label="Navigation principale" className="public-nav-bureau">
          {NAVIGATION.map(([href, titre]) => <Link key={href} href={href}>{titre}</Link>)}
        </nav>
        <div className="public-acces">
          <Link href="/connexion" className="public-connexion">Se connecter</Link>
          <Link href="/inscription" className="btn-or public-inscription">Créer mon compte <ArrowUpRight size={16} aria-hidden /></Link>
        </div>
        <MenuPublicMobile liens={NAVIGATION} />
      </div>
    </header>
  );
}

// « Agences » (20/10/2026) : la liste d'attente des agences, dans le pied seulement — ni dans NAVIGATION ni dans le menu
// mobile, pour ne pas charger la navigation principale d'une offre qui n'est pas ouverte.
const GROUPES_PIED = [
  { titre: "Découvrir", liens: [["/#fonctionnalites", "La solution"], ["/tarifs", "Tarifs"], ["/outils", "Outils gratuits"], ["/journal", "Journal"]] },
  { titre: "Votre espace", liens: [["/inscription", "Créer mon compte"], ["/connexion", "Se connecter"], ["/#contact", "Nous écrire"], ["/artisan/inscription", "Rejoindre le réseau d’artisans"], ["/agences", "Agences"]] },
  { titre: "Informations", liens: [["/mentions-legales", "Mentions légales"], ["/conditions", "Conditions générales"], ["/confidentialite", "Confidentialité"]] },
];

export function PiedPublic({ courant }: { courant?: string }) {
  return (
    <footer className="public-pied print:hidden">
      <div className="public-conteneur public-pied-grille">
        <div className="public-pied-marque">
          {/* Cible tactile de 44 px (audit final, PUB-07 : le logo du pied faisait 140 × 18 px). */}
          <Link href="/" aria-label="Gerimmo — accueil" className="inline-flex min-h-11 items-center"><MarqueGerimmo surEncre /></Link>
          <p>Vos biens, vos locataires et vos documents.<br />Tout simplement, au même endroit.</p>
        </div>
        {GROUPES_PIED.map(({ titre, liens }) => (
          <nav key={titre} aria-label={titre}><p>{titre}</p>{liens.map(([href, libelle]) => <Link key={href} href={href} aria-current={href === courant ? "page" : undefined}>{libelle}</Link>)}</nav>
        ))}
      </div>
      <div className="public-conteneur public-pied-bas"><span>© Gerimmo {new Date().getFullYear()}</span><span>L’immobilier en confiance.</span></div>
    </footer>
  );
}
