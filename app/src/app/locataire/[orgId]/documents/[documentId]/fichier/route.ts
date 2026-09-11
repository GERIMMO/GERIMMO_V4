import type { NextRequest } from "next/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { verifierLocataire } from "@/lib/ged-acces";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";

// Consultation d'une pièce par le locataire (« Mes documents »). Même
// architecture que les autres routes de fichier : l'accès est porté par la
// RPC definer mon_document_locataire (pièce de SON dossier ou bail signé de
// SON bail), la trace est obligatoire avant tout accès (RM-0b.7.5) et le
// lien signé Supabase ne sort jamais du serveur (RM-A4.10).


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

  const { data: fichier, error: erreurFichier } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (erreurFichier || !fichier) {
    return pageErreurFichier(502,
      "Fichier indisponible",
      "Le fichier n'a pas pu être relu depuis le stockage. Réessayez dans un instant ; si le problème persiste, signalez-le à votre agence.",
      "depuis « Mes documents »"
    );
  }

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
