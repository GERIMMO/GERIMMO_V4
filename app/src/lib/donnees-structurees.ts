// LES DONNÉES STRUCTURÉES DES PAGES PUBLIQUES (20/11/2026).
//
// POURQUOI. Gerimmo cherche ses premiers propriétaires sans budget publicitaire : Google est le premier canal. Le
// plan du site et les métadonnées existent depuis le 29/09 ; il manquait la description lisible par les moteurs
// (schema.org, en JSON-LD) de ce que montre chaque page : qui publie le site, le fil d'Ariane d'un outil ou d'un
// article, la date et l'auteur d'un article, les questions fréquentes de l'accueil.
//
// CE QUE L'ON S'INTERDIT. Rien n'est déclaré ici qui ne soit déjà écrit à l'écran : chaque bloc se construit à partir
// des mêmes données que la page (catalogue des outils, article lu en base, questions de l'accueil). Aucune offre
// commerciale (`Offer`) ni note (`aggregateRating`) : les ventes sont fermées et aucun avis n'est recueilli.
//
// Fonctions pures : aucune lecture de variable d'environnement ici, l'adresse du site est passée par l'appelant.

export type DonneeStructuree = Record<string, unknown>;

const CONTEXTE = "https://schema.org";
const NOM = "Gerimmo";

/** Une adresse absolue sur le site (« /outils » → « https://gerimmo.app/outils »). */
export function adresseAbsolue(site: string, chemin: string): string {
  return new URL(chemin, `${site.replace(/\/+$/, "")}/`).href;
}

/** L'éditeur du site, tel que le pied de page et les mentions légales le nomment. */
export function organisation(site: string, logo: string): DonneeStructuree {
  return {
    "@context": CONTEXTE,
    "@type": "Organization",
    "@id": `${adresseAbsolue(site, "/")}#organisation`,
    name: NOM,
    url: adresseAbsolue(site, "/"),
    logo: adresseAbsolue(site, logo),
  };
}

/** Le site lui-même : son nom et sa langue. Pas de moteur de recherche interne, donc pas de `SearchAction`. */
export function siteWeb(site: string, description: string): DonneeStructuree {
  return {
    "@context": CONTEXTE,
    "@type": "WebSite",
    "@id": `${adresseAbsolue(site, "/")}#site`,
    name: NOM,
    url: adresseAbsolue(site, "/"),
    description,
    inLanguage: "fr-FR",
    publisher: { "@id": `${adresseAbsolue(site, "/")}#organisation` },
  };
}

/** Le fil d'Ariane d'une page : chaque étape avec son adresse absolue, la dernière étant la page elle-même. */
export function filAriane(site: string, etapes: { nom: string; chemin: string }[]): DonneeStructuree {
  return {
    "@context": CONTEXTE,
    "@type": "BreadcrumbList",
    itemListElement: etapes.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.nom,
      item: adresseAbsolue(site, e.chemin),
    })),
  };
}

/** Les questions fréquentes, exactement celles affichées par la page (texte brut, sans balise). */
export function questionsFrequentes(questions: [string, string][]): DonneeStructuree {
  return {
    "@context": CONTEXTE,
    "@type": "FAQPage",
    mainEntity: questions.map(([question, reponse]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: reponse },
    })),
  };
}

/** Un article du journal : titre, description, image, dates, auteur et éditeur (Gerimmo). */
export function articleJournal(
  site: string,
  a: { chemin: string; titre: string; description?: string; image: string; logo: string; publieLe: string | null; modifieLe: string | null },
): DonneeStructuree {
  const editeur = { "@type": "Organization", name: NOM, url: adresseAbsolue(site, "/"), logo: { "@type": "ImageObject", url: adresseAbsolue(site, a.logo) } };
  return {
    "@context": CONTEXTE,
    "@type": "BlogPosting",
    headline: a.titre,
    ...(a.description ? { description: a.description } : {}),
    url: adresseAbsolue(site, a.chemin),
    mainEntityOfPage: { "@type": "WebPage", "@id": adresseAbsolue(site, a.chemin) },
    image: [adresseAbsolue(site, a.image)],
    ...(a.publieLe ? { datePublished: a.publieLe } : {}),
    ...(a.modifieLe || a.publieLe ? { dateModified: a.modifieLe ?? a.publieLe } : {}),
    inLanguage: "fr-FR",
    author: editeur,
    publisher: editeur,
  };
}

/**
 * Le texte du bloc `<script type="application/ld+json">`. Le JSON est rendu inerte dans le HTML : « < », « > » et
 * « & » sont échappés en \uXXXX (un « </script> » venu d'un titre d'article ne peut pas fermer la balise), comme
 * les séparateurs de ligne U+2028 et U+2029. Le JSON lu par le moteur reste identique.
 */
export function serialiserDonnees(donnees: DonneeStructuree | DonneeStructuree[]): string {
  return JSON.stringify(donnees)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
