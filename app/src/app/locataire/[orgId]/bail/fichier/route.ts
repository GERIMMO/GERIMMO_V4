import type { NextRequest } from "next/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { verifierLocataire } from "@/lib/ged-acces";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";

// Consultation du bail signé par le locataire (RM-4.7). Même architecture que
// la route agence : le fichier est servi par cette route, l'URL visible reste
// une URL Gerimmo stable, le lien signé Supabase ne sort jamais du serveur
// (RM-A4.10). L'accès est porté par la RPC definer mon_bail_document_locataire
// (locataire principal ou colocataire du bail, bail actif ou en préavis) et la
// trace est obligatoire avant tout accès (RM-0b.7.5).


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

  const { data: fichier, error: erreurFichier } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);
  if (erreurFichier || !fichier) {
    return pageErreurFichier(502,
      "Fichier indisponible",
      "Le fichier n'a pas pu être relu depuis le stockage. Réessayez dans un instant ; si le problème persiste, signalez-le à votre agence.",
      "depuis votre espace"
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
