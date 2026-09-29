import type { MetadataRoute } from "next";
import { adresseCanonique } from "@/lib/site";

// robots.txt (29/09). Le site public — vitrine, tarifs, journal, pages
// légales, connexion et inscription — est ouvert aux robots ; les espaces
// privés ne le sont pas. Ils exigent de toute façon une session (src/proxy.ts),
// mais un robot n'a pas à y être invité : chaque adresse privée qu'il suit le
// ramène à la page de connexion.
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
  "/espaces",
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
      allow: ["/", "/artisan/inscription"],
      // Le plus long chemin l'emporte : /artisan/inscription reste ouverte.
      disallow: SEGMENTS_PRIVES,
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
