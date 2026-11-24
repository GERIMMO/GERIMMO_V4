// LA DIFFUSION FACEBOOK SELON L'ÉTAT DE LA PAGE (décision du dirigeant du 25/11/2026, suite des défauts E198 et E101).
//
// La Page Facebook de Gerimmo se lit d'une seule façon, celle de « Vos canaux de diffusion » (admin/marketing) :
// reliée et lue (« Relié »), reliée mais illisible (« À vérifier »), ou pas reliée (« À relier »). Tant qu'elle n'est
// pas « Relié », la diffusion sur Facebook est MASQUÉE, pas seulement grisée, partout où elle est proposée (éditeur
// d'article, « Marketing et contenus »), et un court texte dit pourquoi et où vérifier la Page. Le refus du serveur
// (lib/facebook.ts) reste le garde-fou : ce module ne décide que de ce que l'écran propose.

export type EtatPageFacebook = "relie" | "a_verifier" | "a_relier";

/** L'état de la Page, d'après la lecture de santeFacebook() (lib/marketing-meta.ts). */
export function etatPageFacebook(sante: { configure: boolean; erreur?: string }): EtatPageFacebook {
  return sante.configure && !sante.erreur ? "relie" : sante.configure ? "a_verifier" : "a_relier";
}

/** Pourquoi la diffusion n'est pas proposée ; le renvoi à « Vos canaux de diffusion » le suit (où vérifier la Page). */
export const RAISON_DIFFUSION_MASQUEE: Record<Exclude<EtatPageFacebook, "relie">, string> = {
  a_verifier: "La connexion à la Page Facebook est à vérifier : Gerimmo n’arrive pas à lire la Page, la diffusion sur Facebook n’est donc pas proposée.",
  a_relier: "La Page Facebook n’est pas encore reliée à Gerimmo : la diffusion sur Facebook n’est pas proposée.",
};

/** L'endroit où la Page se vérifie : son état et sa connexion, sur « Marketing et contenus ». */
export const LIEN_CANAUX_DE_DIFFUSION = "/admin/marketing#canaux";
