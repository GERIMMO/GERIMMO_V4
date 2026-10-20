import type { NextRequest } from "next/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { verifierLocataire } from "@/lib/ged-acces";
import { servirFichierSigne } from "@/lib/fichier-signe";

// Droits et trace vérifiés avant la création du lien de lecture temporaire.

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
  const { supabase, user } = await verifierLocataire(orgId, { lecture: true });
  if (!user) {
    return pageErreurFichier(
      403,
      "Accès refusé",
      "Votre session a peut-être expiré, ou vous n'avez plus accès à cet espace. Reconnectez-vous puis réessayez."
    , "depuis votre espace");
  }

  const { data, error: erreurLecture } = await supabase.rpc("mon_bail_document_locataire", {
    p_org: orgId,
  });
  // Sans cette lecture, une requête tombée rendait « Bail introuvable » : on
  // annonçait au locataire qu'aucun bail signé n'existait alors qu'on n'avait
  // simplement pas pu le chercher (relevé 11/09).
  if (erreurLecture) {
    return pageErreurFichier(
      503,
      "Consultation momentanément impossible",
      "Votre bail n'a pas pu être consulté à l'instant : la lecture a échoué. Il n'est pas perdu — réessayez dans un instant.",
      "depuis votre espace"
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
      "Bail introuvable",
      "Aucun bail signé n'est disponible pour votre compte dans cette agence."
    , "depuis votre espace");
  }
  if (doc.purged_at || !doc.storage_path) {
    return pageErreurFichier(
      410,
      "Document purgé",
      "Ce document a été supprimé en application de sa règle de conservation (RGPD). Seule sa fiche de traçabilité subsiste."
    , "depuis votre espace");
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
      "depuis votre espace"
    );
  }

  return servirFichierSigne(supabase, { path: doc.storage_path, mime: doc.mime_type,
    titre: doc.titre, mode, retour: "depuis votre dossier Documents" });
}
