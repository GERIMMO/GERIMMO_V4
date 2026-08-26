import type { NextRequest } from "next/server";
import { verifierLocataire } from "@/lib/ged-acces";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";

// Consultation du bail signé par le locataire (RM-4.7). Même architecture que
// la route agence : le fichier est servi par cette route, l'URL visible reste
// une URL Gerimmo stable, le lien signé Supabase ne sort jamais du serveur
// (RM-A4.10). L'accès est porté par la RPC definer mon_bail_document_locataire
// (locataire principal ou colocataire du bail, bail actif ou en préavis) et la
// trace est obligatoire avant tout accès (RM-0b.7.5).

function pageErreur(status: number, titre: string, message: string) {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre} — Gerimmo</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; min-height: 100vh;
         margin: 0; align-items: center; justify-content: center; background: #fafafa; color: #171717; }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; margin-bottom: .5rem; }
  p { color: #525252; font-size: .9rem; line-height: 1.5; }
</style>
</head>
<body><main><h1>${titre}</h1><p>${message}</p><p>Vous pouvez fermer cet onglet et réessayer depuis votre espace.</p></main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/locataire/[orgId]/bail/fichier">
) {
  const { orgId } = await ctx.params;
  const mode =
    request.nextUrl.searchParams.get("mode") === "telechargement"
      ? "telechargement"
      : "consultation";

  // Défense en profondeur : adhésion 'locataire' active exigée ici, dans les
  // RPC definer ET dans la policy storage (revue 26/08)
  const { supabase, user } = await verifierLocataire(orgId);
  if (!user) {
    return pageErreur(
      403,
      "Accès refusé",
      "Votre session a peut-être expiré, ou vous n'avez plus accès à cet espace. Reconnectez-vous puis réessayez."
    );
  }

  const { data } = await supabase.rpc("mon_bail_document_locataire", { p_org: orgId });
  const doc = ((data ?? []) as {
    document_id: string;
    titre: string | null;
    mime_type: string;
    storage_path: string | null;
    purged_at: string | null;
  }[])[0];
  if (!doc) {
    return pageErreur(
      404,
      "Bail introuvable",
      "Aucun bail signé n'est disponible pour votre compte dans cette agence."
    );
  }
  if (doc.purged_at || !doc.storage_path) {
    return pageErreur(
      410,
      "Document purgé",
      "Ce document a été supprimé en application de sa règle de conservation (RGPD). Seule sa fiche de traçabilité subsiste."
    );
  }

  const { error: erreurTrace } = await supabase.rpc("log_document_access", {
    doc: doc.document_id,
    acces: mode,
  });
  if (erreurTrace) {
    // La trace est une exigence, pas une option : sans trace, pas d'accès
    return pageErreur(
      500,
      "Accès momentanément impossible",
      "La consultation n'a pas pu être enregistrée au journal d'accès ; elle est donc refusée. Réessayez dans un instant."
    );
  }

  const { data: fichier, error: erreurFichier } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (erreurFichier || !fichier) {
    return pageErreur(
      502,
      "Fichier indisponible",
      "Le fichier n'a pas pu être relu depuis le stockage. Réessayez dans un instant ; si le problème persiste, signalez-le à votre agence."
    );
  }

  // Liste blanche MIME : un type inattendu se sert en octet-stream téléchargé,
  // jamais rendu inline (revue 26/08 — pas de HTML servi sur notre origine)
  const mimeSur = doc.mime_type in EXTENSIONS ? (doc.mime_type as MimeAccepte) : null;
  const extension = mimeSur ? EXTENSIONS[mimeSur] : "bin";
  const titre = doc.titre ?? "Bail signé";
  const nomFichier = titre.endsWith(`.${extension}`) ? titre : `${titre}.${extension}`;
  const nomAscii = nomFichier.replace(/"/g, "'").replace(/[^\x20-\x7E]/g, "_");
  const disposition =
    mode === "telechargement" || !mimeSur ? "attachment" : "inline";

  return new Response(fichier, {
    headers: {
      "Content-Type": mimeSur ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${nomAscii}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
