import type { NextRequest } from "next/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { verifierGerant } from "@/lib/ged-acces";
import { lirePresentationSignatures } from "@/lib/lecture-presentation-signatures";
import { etatSignatureDocument } from "@/lib/presentation-signatures";
import { servirFichierSigne } from "@/lib/fichier-signe";

// Droits et trace vérifiés avant la création du lien de lecture temporaire.

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
    .select("storage_path, titre, mime_type, purged_at, type")
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

  let libelle: string | undefined;
  if (doc.type === "bail") {
    const suivi = await lirePresentationSignatures(orgId, { documents: [documentId] });
    if (!suivi.erreur && etatSignatureDocument(suivi.circuits, documentId) === "signe") libelle = "Bail signé";
  }
  return servirFichierSigne(supabase, { path: doc.storage_path, mime: doc.mime_type,
    titre: doc.titre, libelle, mode, apercuImage: request.nextUrl.searchParams.get("apercu") === "image", retour: "depuis votre dossier Documents" });
}
