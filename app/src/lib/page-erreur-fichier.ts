/**
 * Page d'erreur des routes qui SERVENT UN FICHIER (pièces de la GED, bail).
 *
 * Ces routes renvoient une `Response` brute, pas un composant React : elles
 * n'ont donc ni la feuille de style de l'application, ni ses jetons. C'est le
 * SEUL endroit du produit où les valeurs de la charte sont écrites en clair —
 * et elles le sont ici, une fois, plutôt que recopiées dans chaque route.
 *
 * Avant le 2026-09-11, les trois routes portaient chacune sa propre page, en
 * `system-ui` sur fond gris : un visiteur à qui l'on refusait une pièce
 * tombait sur un écran qui n'avait rien de Gerimmo, au moment précis où il
 * fallait le rassurer. Les valeurs ci-dessous suivent la charte v2 ; si la
 * charte bouge, ce fichier est le seul à suivre.
 */

// Reflet des jetons de src/app/globals.css — tenus à jour ensemble.
const CHARTE = {
  creme: "#faf7f0",
  ivoire: "#ffffff",
  encre: "#14304f",
  corps: "#1c2024",
  texteSecondaire: "#4a4844",
  filet: "#e4dcca",
  or: "#c9a227",
} as const;

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param retour Ce que l'on propose de faire ensuite, propre à l'espace
 *   (« depuis la page Documents », « depuis votre espace »…).
 */
export function pageErreurFichier(
  status: number,
  titre: string,
  message: string,
  retour: string
): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(titre)} — Gerimmo</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: ${CHARTE.creme}; color: ${CHARTE.corps};
    font-family: ui-sans-serif, system-ui, sans-serif;
    /* 16 px : sous cette taille, iOS zoome (acquis de l'audit mobile). */
    font-size: 16px; line-height: 1.5;
  }
  main {
    max-width: 26rem; margin: 1rem; padding: 2rem 1.75rem;
    background: ${CHARTE.ivoire}; border: 1px solid ${CHARTE.filet};
    border-top: 3px solid ${CHARTE.or};
  }
  .marque {
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${CHARTE.texteSecondaire}; margin: 0 0 1rem;
  }
  h1 { font-size: 1.125rem; font-weight: 500; color: ${CHARTE.encre}; margin: 0 0 .5rem; }
  p { color: ${CHARTE.texteSecondaire}; font-size: .875rem; margin: .5rem 0 0; }
</style>
</head>
<body>
  <main>
    <p class="marque">Gerimmo</p>
    <h1>${echapper(titre)}</h1>
    <p>${echapper(message)}</p>
    <p>Vous pouvez fermer cet onglet et réessayer ${echapper(retour)}.</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
