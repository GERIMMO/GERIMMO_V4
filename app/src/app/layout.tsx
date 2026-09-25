import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { BoutonAssistance } from "@/components/bouton-assistance";

// Charte v3 — bleu (17/09/2026). Deux polices, deux rôles : Manrope, ronde et
// géométrique, pour la marque, les titres et les chiffres clés ; Figtree, la
// même famille de dessin en plus sobre, pour tout le reste — corps, libellés,
// pastilles. La v2 en avait trois (Cormorant, Instrument, Plex Mono) et une
// serif à empattements qui datait le produit ; les libellés en capitales
// monospace partent avec elle.
// LES POLICES SONT DANS LE DÉPÔT (26/09). `next/font/google` les téléchargeait
// chez Google à chaque construction, et ce téléchargement a fait échouer deux
// mises en production (24/09 et 25/09, « Turbopack build failed » sur
// manrope…module.css). Les mêmes fichiers variables (latin et latin étendu,
// licence OFL, dossier `polices/`) sont servis d'ici : la construction ne
// dépend plus d'aucun réseau, et le rendu est identique.
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

export const metadata: Metadata = {
  title: "Gerimmo",
  description: "Gestion locative pour agences et propriétaires",
  icons: {
    icon: "/logo/gerimmo-mark.svg",
    shortcut: "/logo/gerimmo-mark.svg",
    apple: "/logo/gerimmo-mark.svg",
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
      <body className="min-h-full flex flex-col">{children}<BoutonAssistance /></body>
    </html>
  );
}
