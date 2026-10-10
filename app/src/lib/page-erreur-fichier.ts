import { CHARTE_GERIMMO as CHARTE } from "@/lib/charte-gerimmo";

/** Les réponses fichier n’utilisent pas le layout React : identité partagée
 * et styles autonomes, sans toucher au statut ni à l’échappement des données. */
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
    border-top: 3px solid ${CHARTE.or}; border-radius: 12px;
  }
  .marque {
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${CHARTE.texteSecondaire}; margin: 0 0 1rem;
  }
  h1 { font-family: Georgia, serif; font-size: 1.75rem; font-weight: 400; color: ${CHARTE.encre}; margin: 0 0 .5rem; }
  p { color: ${CHARTE.texteSecondaire}; font-size: .875rem; margin: .5rem 0 0; }
</style>
</head>
<body>
  <main>
    <img class="marque" src="${CHARTE.logo}" alt="Gerimmo — L’immobilier en confiance" width="120" height="95">
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
