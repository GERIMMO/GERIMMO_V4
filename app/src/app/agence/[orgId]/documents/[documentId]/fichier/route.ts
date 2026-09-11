import type { NextRequest } from "next/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { verifierGerant } from "@/lib/ged-acces";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";

// Consultation / téléchargement d'une pièce. Le fichier est servi par cette
// route : l'URL visible reste une URL Gerimmo stable — un refresh revérifie
// les droits, retrace l'accès et relit le fichier. Le lien signé Supabase ne
// sort jamais du serveur (RM-A4.10), donc plus d'erreur brute « InvalidJWT »
// à l'expiration. Trace obligatoire avant tout accès (RM-0b.7.5, RM-12.5.8).


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
    return pageErreurFichier(
      403,
      "Accès refusé",
      "Votre session a peut-être expiré, ou vous n'avez pas accès aux documents de cette agence. Reconnectez-vous puis réessayez."
    , "depuis la page Documents");
  }

  const { data: doc, error: erreurDoc } = await supabase
    .from("documents")
    .select("storage_path, titre, mime_type, purged_at")
    .eq("id", documentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  // Une lecture refusée n'est pas un document absent : répondre 404
  // « introuvable » ferait croire la pièce supprimée (relevé du 11/09).
  if (erreurDoc) {
    return pageErreurFichier(
      503,
      "Document momentanément illisible",
      "La fiche de ce document n'a pas pu être lue — ce n'est pas qu'il n'existe plus. Réessayez dans un instant ; si le problème persiste, signalez-le.",
      "depuis la page Documents"
    );
  }
  if (!doc) {
    return pageErreurFichier(404, "Document introuvable", "Ce document n'existe pas ou n'appartient pas à cette agence.", "depuis la page Documents");
  }
  if (doc.purged_at || !doc.storage_path) {
    return pageErreurFichier(
      410,
      "Document purgé",
      "Ce document a été supprimé en application de sa règle de conservation (RGPD). Seule sa fiche de traçabilité subsiste."
    , "depuis la page Documents");
  }

  const { error: erreurTrace } = await supabase.rpc("log_document_access", {
    doc: documentId,
    acces: mode,
  });
  if (erreurTrace) {
    // La trace est une exigence, pas une option : sans trace, pas d'accès
    return pageErreurFichier(500,
      "Accès momentanément impossible",
      "La consultation n'a pas pu être enregistrée au journal d'accès ; elle est donc refusée. Réessayez dans un instant.",
      "depuis la page Documents"
    );
  }

  const { data: fichier, error: erreurFichier } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (erreurFichier || !fichier) {
    return pageErreurFichier(502,
      "Fichier indisponible",
      "Le fichier n'a pas pu être relu depuis le stockage. Réessayez dans un instant ; si le problème persiste, signalez-le.",
      "depuis la page Documents"
    );
  }

  // Nom de fichier : le titre, complété de l'extension réelle ; variante ASCII
  // en repli + forme UTF-8 (RFC 5987) pour conserver les accents
  // Liste blanche MIME : un type inattendu se sert en octet-stream téléchargé,
  // jamais rendu inline (revue 26/08 — pas de HTML servi sur notre origine)
  const mimeSur = doc.mime_type in EXTENSIONS ? (doc.mime_type as MimeAccepte) : null;
  const extension = mimeSur ? EXTENSIONS[mimeSur] : "bin";
  const titre = doc.titre ?? "document";
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
