import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./prestige.css";
import "./harmonie.css";
import { BoutonAssistance } from "@/components/bouton-assistance";
import { OPEN_GRAPH_PAR_DEFAUT } from "@/lib/metadonnees-publiques";
import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";
import { adresseCanonique } from "@/lib/site";

// Polices locales : Figtree pour l’interface, Manrope pour les chiffres et
// libellés. Les titres Prestige en Georgia sont définis dans prestige.css.
// Aucun téléchargement externe n’est nécessaire pour construire le site.
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

const DESCRIPTION = "Gestion locative pour agences et propriétaires";

// Une seule identité pour les onglets, favoris et aperçus de partage.
export const metadata: Metadata = {
  metadataBase: new URL(adresseCanonique()),
  title: "Gerimmo",
  description: DESCRIPTION,
  openGraph: { ...OPEN_GRAPH_PAR_DEFAUT, title: "Gerimmo", description: DESCRIPTION },
  icons: {
    icon: { url: CHARTE_GERIMMO.logo, type: "image/png", sizes: "2016x1594" },
    shortcut: CHARTE_GERIMMO.logo,
    apple: { url: CHARTE_GERIMMO.logo, type: "image/png" },
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
      className={`${titres.variable} ${interface_.variable} h-full antialiased`}
    >
      <body className="gerimmo-prestige min-h-full flex flex-col">{children}<BoutonAssistance /></body>
    </html>
  );
}
