import { createClient } from "@/lib/supabase/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";
import type { PieceArtisan } from "@/app/artisan/acces";

/**
 * Relire une de ses attestations.
 *
 * Trois différences avec les routes de fichier des autres espaces, et chacune
 * a une raison :
 *
 *  · AUCUN JOURNAL D'ACCÈS. `log_document_access` prend un identifiant de
 *    `documents` ; or ces fichiers n'ont volontairement aucune fiche dans cette
 *    table — ce sont des pièces GLOBALES (RM-8.2.8), hors de la GED de toute
 *    agence, parce qu'une pièce d'agence ne franchit pas de frontière d'agence
 *    et que celles-ci doivent justement la franchir. Il n'y a donc rien à
 *    tracer ici : l'artisan relit SON propre document.
 *  · LE CHEMIN NE VIENT JAMAIS DE L'URL. On demande `mes_pieces_artisan()` et
 *    on ne sert que ce qu'elle a rendu. Un identifiant de pièce qui n'est pas
 *    dans cette liste n'existe pas pour cet appelant.
 *  · LE LIEN SIGNÉ NE SORT PAS DU SERVEUR (RM-A4.10) : on télécharge et on
 *    réémet, comme les autres routes.
 *
 * La politique storage `ged_select_artisan` referme le tout en base : elle ne
 * laisse relire que `artisans/<son id>/…` et les fichiers de ses propres
 * missions.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/artisan/attestations/[pieceId]/fichier">
) {
  const { pieceId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return pageErreurFichier(
      403,
      "Accès refusé",
      "Votre session a peut-être expiré. Reconnectez-vous, puis réessayez.",
      "depuis « Mes attestations »"
    );
  }

  const { data, error } = await supabase.rpc("mes_pieces_artisan");
  if (error) {
    return pageErreurFichier(
      503,
      "Consultation momentanément impossible",
      "Vos attestations n'ont pas pu être relues à l'instant. Ce document n'est pas perdu — réessayez dans un instant.",
      "depuis « Mes attestations »"
    );
  }

  const piece = ((data ?? []) as PieceArtisan[]).find((p) => p.piece_id === pieceId);
  if (!piece) {
    return pageErreurFichier(
      404,
      "Attestation introuvable",
      "Ce document n'existe pas, ou a été remplacé par une version plus récente.",
      "depuis « Mes attestations »"
    );
  }

  const { data: fichier, error: erreurFichier } = await supabase.storage
    .from("documents")
    .download(piece.storage_path);
  if (erreurFichier || !fichier) {
    return pageErreurFichier(
      502,
      "Fichier indisponible",
      "Le document n'a pas pu être relu depuis le stockage. Réessayez dans un instant.",
      "depuis « Mes attestations »"
    );
  }

  // Liste blanche MIME : un type inattendu se sert en octet-stream téléchargé,
  // jamais rendu en ligne sur notre origine. Le type vient de l'extension du
  // chemin, que la RPC de dépôt a posée depuis le type RÉEL des octets.
  const extension = piece.storage_path.split(".").pop()?.toLowerCase() ?? "";
  const mime = (Object.entries(EXTENSIONS) as [MimeAccepte, string][]).find(
    ([, ext]) => ext === extension
  )?.[0];
  const nomFichier = `${piece.type}.${mime ? EXTENSIONS[mime] : "bin"}`;

  return new Response(fichier, {
    headers: {
      "Content-Type": mime ?? "application/octet-stream",
      "Content-Disposition": `${mime ? "inline" : "attachment"}; filename="${nomFichier}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
