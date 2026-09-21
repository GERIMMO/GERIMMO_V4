import type { Metadata } from "next";
import { Manrope, Figtree } from "next/font/google";
import "./globals.css";
import { BoutonAssistance } from "@/components/bouton-assistance";

// Charte v3 — bleu (17/09/2026). Deux polices, deux rôles : Manrope, ronde et
// géométrique, pour la marque, les titres et les chiffres clés ; Figtree, la
// même famille de dessin en plus sobre, pour tout le reste — corps, libellés,
// pastilles. La v2 en avait trois (Cormorant, Instrument, Plex Mono) et une
// serif à empattements qui datait le produit ; les libellés en capitales
// monospace partent avec elle.
const titres = Manrope({
  variable: "--font-titres",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const interface_ = Figtree({
  variable: "--font-interface",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
