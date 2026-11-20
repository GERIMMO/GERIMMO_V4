import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./prestige.css";
import "./harmonie.css";
import "./proprietaire.css";
import "./experience-unifiee.css";
import "./ambiances.css";
// Design System « Maison » (20/11/2026) : dernière feuille chargée, elle porte les jetons et les règles communes.
import "./systeme.css";
import { AmbianceSite } from "@/components/ambiance-site";
import { ProtectionSaisie } from "@/components/protection-saisie";
import { RepliHorsLigne } from "@/components/repli-hors-ligne";
import { BoutonAssistance } from "@/components/bouton-assistance";
import { ContinuiteEspace } from "@/components/continuite-espace";
import { OPEN_GRAPH_PAR_DEFAUT } from "@/lib/metadonnees-publiques";
import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";
import { adresseCanonique } from "@/lib/site";

// Polices locales : Figtree pour l’interface, Manrope pour les chiffres et
// libellés, Fraunces pour les titres (Design System « Maison », 20/11/2026).
// Georgia, police du système, n’existe ni sur Android ni sur Linux : les titres
// y changeaient de dessin. Fraunces est embarquée, donc identique partout ;
// Georgia reste la police de repli. Aucun téléchargement externe à la construction.
const titres = localFont({
  variable: "--font-titres",
  src: [
    { path: "./polices/manrope-latin-wght-normal.woff2", weight: "200 800", style: "normal" },
    { path: "./polices/manrope-latin-ext-wght-normal.woff2", weight: "200 800", style: "normal" },
  ],
  display: "swap",
});

const interface_ = localFont({
  variable: "--font-interface",
  src: [
    { path: "./polices/figtree-latin-wght-normal.woff2", weight: "300 900", style: "normal" },
    { path: "./polices/figtree-latin-ext-wght-normal.woff2", weight: "300 900", style: "normal" },
  ],
  display: "swap",
});

// Titres : le fichier latin (67 Ko) et le latin étendu (59 Ko, noms propres) sont tous deux préchargés.
// NE JAMAIS DÉCLARER ICI UNE POLICE SANS LA PRÉCHARGER (`preload: false`). Constat du 20/11/2026, dans WebKit (Safari) :
// une police déclarée mais pas encore chargée lui fait croire que « du contenu arrive encore ». Tant que la page ne
// montre que « Chargement de la page… », il ne dessine alors RIEN avant la fin du chargement des scripts : sur un
// réseau lent, l'écran reste figé au lieu d'afficher le contenu dès qu'il arrive. Le parcours
// e2e/bouton-envoi-hydratation (WebKit) le détecte, et tests/polices-prechargees.test.ts garde la règle.
// Pas de fichier italique : il pesait 81 Ko pour une seule phrase de l'accueil. L'emphase d'un titre se marque par la couleur.
// Les plages de caractères sont écrites en toutes lettres : le chargeur de polices n'accepte que des littéraux.
const affiche = localFont({
  variable: "--font-affiche",
  src: [{ path: "./polices/fraunces-latin-opsz-normal.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});
const afficheEtendue = localFont({
  variable: "--font-affiche-etendue",
  src: [{ path: "./polices/fraunces-latin-ext-opsz-normal.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
  display: "swap",
});

const DESCRIPTION = "Gestion locative pour propriétaires bailleurs";

// Une seule identité pour les onglets, favoris et aperçus de partage.
export const metadata: Metadata = {
  metadataBase: new URL(adresseCanonique()),
  title: "Gerimmo",
  description: DESCRIPTION,
  openGraph: { ...OPEN_GRAPH_PAR_DEFAUT, title: "Gerimmo", description: DESCRIPTION },
  icons: {
    icon: { url: CHARTE_GERIMMO.icone, type: "image/png", sizes: CHARTE_GERIMMO.iconeTaille },
    shortcut: CHARTE_GERIMMO.icone,
    apple: { url: CHARTE_GERIMMO.iconeEcran, type: "image/png", sizes: CHARTE_GERIMMO.iconeEcranTaille },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${titres.variable} ${interface_.variable} ${affiche.variable} ${afficheEtendue.variable} h-full antialiased`}
    >
      <body className="gerimmo-prestige min-h-full flex flex-col"><ContinuiteEspace />{children}<AmbianceSite /><ProtectionSaisie /><RepliHorsLigne /><BoutonAssistance /></body>
    </html>
  );
}
