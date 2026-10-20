import type { MetadataRoute } from "next";
import { adresseCanonique } from "@/lib/site";

// robots.txt (29/09). Le site public — vitrine, tarifs, outils gratuits,
// journal, pages légales, connexion et inscription — est ouvert aux robots ;
// les espaces privés ne le sont pas. Ils exigent de toute façon une session
// (src/proxy.ts), mais un robot n'a pas à y être invité : chaque adresse
// privée qu'il suit le ramène à la page de connexion.
//
// La liste suit les premiers segments privés de src/app (SEGMENTS_CONNUS dans
// src/proxy.ts, hors pages publiques). /artisan est privé, sauf son inscription.
// tests/robots-sitemap.test.ts la garde en phase avec les dossiers.
const SEGMENTS_PRIVES = [
  "/actions",
  "/admin",
  "/agence",
  "/api",
  "/artisan",
  "/assistance",
  "/attestation-loyer",
  "/auth",
  "/compte",
  // D27 : l'alias des écrans du propriétaire direct (réécrit par le proxy vers /agence). Pas un dossier de src/app,
  // donc hors du test des dossiers : tests/alias-espace-proxy.test.ts le tient.
  "/espace",
  "/espaces",
  "/invitations",
  "/locataire",
  "/quittance",
  "/relais",
  "/securite",
  "/veille",
];

export default function robots(): MetadataRoute.Robots {
  const site = adresseCanonique();
  return {
    rules: {
      userAgent: "*",
      // /agences (la liste d'attente des agences, 20/10/2026) est publique ; or « /agence », l'espace privé interdit
      // ci-dessous, en est un PRÉFIXE, et une règle de robots.txt vaut pour tout ce qui commence par elle. La
      // permission, plus longue, l'emporte — comme /artisan/inscription sur /artisan.
      allow: ["/", "/artisan/inscription", "/agences"],
      // Le plus long chemin l'emporte : /artisan/inscription et /agences restent ouvertes.
      disallow: SEGMENTS_PRIVES,
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
