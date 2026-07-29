import type { NextRequest } from "next/server";
import { verifierGerant } from "@/lib/ged-acces";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";

// Consultation / téléchargement d'une pièce. Le fichier est servi par cette
// route : l'URL visible reste une URL Gerimmo stable — un refresh revérifie
// les droits, retrace l'accès et relit le fichier. Le lien signé Supabase ne
// sort jamais du serveur (RM-A4.10), donc plus d'erreur brute « InvalidJWT »
// à l'expiration. Trace obligatoire avant tout accès (RM-0b.7.5, RM-12.5.8).

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
<body><main><h1>${titre}</h1><p>${message}</p><p>Vous pouvez fermer cet onglet et réessayer depuis la page Documents.</p></main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/agence/[orgId]/documents/[documentId]/fichier">
) {
  const { orgId, documentId } = await ctx.params;
  const mode =
    request.nextUrl.searchParams.get("mode") === "telechargement"
      ? "telechargement"
      : "consultation";

  const { supabase, user } = await verifierGerant(orgId);
  if (!user) {
    return pageErreur(
      403,
      "Accès refusé",
      "Votre session a peut-être expiré, ou vous n'avez pas accès aux documents de cette agence. Reconnectez-vous puis réessayez."
    );
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, titre, mime_type, purged_at")
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!doc) {
    return pageErreur(404, "Document introuvable", "Ce document n'existe pas ou n'appartient pas à cette agence.");
  }
  if (doc.purged_at || !doc.storage_path) {
    return pageErreur(
      410,
      "Document purgé",
      "Ce document a été supprimé en application de sa règle de conservation (RGPD). Seule sa fiche de traçabilité subsiste."
    );
  }

  const { error: erreurTrace } = await supabase.rpc("log_document_access", {
    doc: documentId,
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
      "Le fichier n'a pas pu être relu depuis le stockage. Réessayez dans un instant ; si le problème persiste, signalez-le."
    );
  }

  // Nom de fichier : le titre, complété de l'extension réelle ; variante ASCII
  // en repli + forme UTF-8 (RFC 5987) pour conserver les accents
  const extension = EXTENSIONS[doc.mime_type as MimeAccepte] ?? "bin";
  const titre = doc.titre ?? "document";
  const nomFichier = titre.endsWith(`.${extension}`) ? titre : `${titre}.${extension}`;
  const nomAscii = nomFichier.replace(/"/g, "'").replace(/[^\x20-\x7E]/g, "_");
  const disposition = mode === "telechargement" ? "attachment" : "inline";

  return new Response(fichier, {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `${disposition}; filename="${nomAscii}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
