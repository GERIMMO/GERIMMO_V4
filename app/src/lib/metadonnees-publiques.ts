// LES MÉTADONNÉES DES PAGES PUBLIQUES (29/09).
//
// Ce que lisent les moteurs de recherche et les aperçus de partage : titre,
// description, adresse canonique, carte Open Graph. Next.js fusionne les
// métadonnées SUPERFICIELLEMENT : une page qui pose `openGraph` remplace tout
// celui de la mise en page racine (docs generate-metadata, « Merging »). Les
// champs communs vivent donc ici, et chaque page les reprend.

import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";
import type { Metadata } from "next";
import { couperAuMot } from "@/lib/utils";

export const NOM_DU_SITE = "Gerimmo";

/**
 * Le logo officiel sert aussi aux aperçus de partage.
 */
const IMAGE_PARTAGE = {
  url: CHARTE_GERIMMO.logo,
  width: CHARTE_GERIMMO.logoLargeur,
  height: CHARTE_GERIMMO.logoHauteur,
  alt: "Gerimmo — L’immobilier en confiance",
};

export const OPEN_GRAPH_PAR_DEFAUT = {
  siteName: NOM_DU_SITE,
  locale: "fr_FR",
  type: "website" as const,
  images: [IMAGE_PARTAGE],
};

/** Les métadonnées complètes d'une page publique, adresse canonique comprise. */
export function metadonneesPubliques({
  titre,
  description,
  chemin,
}: {
  titre: string;
  description: string;
  /** Le chemin de la page, relatif à `metadataBase` (mise en page racine). */
  chemin: string;
}): Metadata {
  return {
    title: titre,
    description,
    alternates: { canonical: chemin },
    openGraph: { ...OPEN_GRAPH_PAR_DEFAUT, title: titre, description, url: chemin },
  };
}

/**
 * La description d'un article, coupée à un mot entier (29/09). Une
 * description enregistrée qui n'est que le début tronqué du chapô (le relais
 * de veille coupait à 160 caractères, au milieu d'un mot) est recalculée
 * depuis le chapô.
 */
export function descriptionArticle(a: { seo_description: string | null; chapo: string | null }): string | undefined {
  const seo = a.seo_description?.trim() || null;
  const chapo = a.chapo?.trim() || null;
  const tronquee = seo && chapo && chapo.length > seo.length && chapo.startsWith(seo);
  const texte = tronquee ? chapo : seo ?? chapo;
  return texte ? couperAuMot(texte, 160) : undefined;
}
