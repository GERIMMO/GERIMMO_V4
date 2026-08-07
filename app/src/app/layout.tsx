import type { Metadata } from "next";
import { Cormorant_Garamond, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Charte graphique GERIMMO v2.0 (maquette août 2026) — trois rôles, trois
// polices : Cormorant Garamond pour la marque, les titres et les chiffres
// clés ; Instrument Sans pour l'interface ; IBM Plex Mono pour les libellés.
const titres = Cormorant_Garamond({
  variable: "--font-titres",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const interface_ = Instrument_Sans({
  variable: "--font-interface",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const libelles = IBM_Plex_Mono({
  variable: "--font-libelles",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Gerimmo",
  description: "Gestion locative pour agences et propriétaires",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${titres.variable} ${interface_.variable} ${libelles.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
