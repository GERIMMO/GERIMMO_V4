import type { NextRequest } from "next/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { verifierLocataire } from "@/lib/ged-acces";
import { servirFichierSigne } from "@/lib/fichier-signe";

// Droits et trace vérifiés avant la création du lien de lecture temporaire.

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/locataire/[orgId]/documents/[documentId]/fichier">
) {
  const { orgId, documentId } = await ctx.params;
  const mode =
    request.nextUrl.searchParams.get("mode") === "telechargement"
      ? "telechargement"
      : "consultation";

  // Défense en profondeur : adhésion 'locataire' active exigée ici, dans les
  // RPC definer ET dans la policy storage (revue 26/08)
  const { supabase, user } = await verifierLocataire(orgId, { lecture: true });
  if (!user) {
    return pageErreurFichier(
      403,
      "Accès refusé",
      "Votre session a peut-être expiré, ou vous n'avez plus accès à cet espace. Reconnectez-vous puis réessayez."
    , "depuis « Mes documents »");
  }

  const { data, error: erreurLecture } = await supabase.rpc("mon_document_locataire", {
    p_org: orgId,
    p_doc: documentId,
  });
  // Sans cette lecture, une requête tombée rendait « Pièce introuvable » : on
  // annonçait au locataire que sa pièce n'existait pas alors qu'on n'avait
  // simplement pas pu la chercher (relevé 11/09).
  if (erreurLecture) {
    return pageErreurFichier(
      503,
      "Consultation momentanément impossible",
      "Vos pièces n'ont pas pu être consultées à l'instant : la lecture a échoué. Cette pièce n'est pas perdue — réessayez dans un instant.",
      "depuis « Mes documents »"
    );
  }
  const doc = ((data ?? []) as {
    document_id: string;
    titre: string | null;
    mime_type: string;
    storage_path: string | null;
    purged_at: string | null;
  }[])[0];
  if (!doc) {
    return pageErreurFichier(
      404,
      "Pièce introuvable",
      "Cette pièce n'existe pas ou n'est pas à votre disposition."
    , "depuis « Mes documents »");
  }
  if (doc.purged_at || !doc.storage_path) {
    return pageErreurFichier(
      410,
      "Document purgé",
      "Ce document a été supprimé en application de sa règle de conservation (RGPD). Seule sa fiche de traçabilité subsiste."
    , "depuis « Mes documents »");
  }

  const { error: erreurTrace } = await supabase.rpc("log_document_access", {
    doc: doc.document_id,
    acces: mode,
  });
  if (erreurTrace) {
    // La trace est une exigence, pas une option : sans trace, pas d'accès
    return pageErreurFichier(500,
      "Accès momentanément impossible",
      "La consultation n'a pas pu être enregistrée au journal d'accès ; elle est donc refusée. Réessayez dans un instant.",
      "depuis « Mes documents »"
    );
  }

  return servirFichierSigne(supabase, { path: doc.storage_path, mime: doc.mime_type,
    titre: doc.titre, mode, apercuIntegre: request.nextUrl.searchParams.get("apercu") === "integre", retour: "depuis votre dossier Documents" });
}
