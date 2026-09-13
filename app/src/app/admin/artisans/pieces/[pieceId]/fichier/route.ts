import { createClient } from "@/lib/supabase/server";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";
import { EXTENSIONS, type MimeAccepte } from "@/lib/file-type";

export async function GET(_request: Request, ctx: { params: Promise<{ pieceId: string }> }) {
  const supabase = await createClient();
  const { data: autorise, error: erreurAcces } = await supabase.rpc("is_super_admin");
  if (erreurAcces || autorise !== true) return pageErreurFichier(403, "Accès refusé", "Cette consultation est réservée à la supervision Gerimmo.", "depuis les inscriptions artisan");
  const { pieceId } = await ctx.params;
  const { data: piece, error } = await supabase.from("artisan_pieces")
    .select("id, artisan_id, type, storage_path").eq("id", pieceId).is("retiree_le", null).maybeSingle();
  if (error) return pageErreurFichier(503, "Consultation indisponible", "Impossible de relire le justificatif. Réessayez.", "depuis les inscriptions artisan");
  if (!piece || !piece.storage_path.startsWith(`artisans/${piece.artisan_id}/`)) return pageErreurFichier(404, "Justificatif introuvable", "Ce document n’existe pas ou a été remplacé.", "depuis les inscriptions artisan");
  const { error: erreurTrace } = await supabase.rpc("log_sa_access", {
    org: null,
    sa_action: "consultation_piece_artisan",
    sa_details: { artisan_id: piece.artisan_id, piece_id: piece.id },
  });
  if (erreurTrace) return pageErreurFichier(503, "Consultation indisponible", "La consultation ne peut pas être journalisée. Réessayez.", "depuis les inscriptions artisan");
  const { data: fichier, error: erreurFichier } = await supabase.storage.from("documents").download(piece.storage_path);
  if (erreurFichier || !fichier) return pageErreurFichier(502, "Fichier indisponible", "Le stockage n’a pas pu fournir le justificatif. Réessayez.", "depuis les inscriptions artisan");
  const extension = piece.storage_path.split(".").pop()?.toLowerCase() ?? "";
  const mime = (Object.entries(EXTENSIONS) as [MimeAccepte, string][]).find(([, ext]) => ext === extension)?.[0];
  return new Response(fichier, { headers: {
    "Content-Type": mime ?? "application/octet-stream",
    "Content-Disposition": `${mime ? "inline" : "attachment"}; filename="${piece.type}.${mime ? EXTENSIONS[mime] : "bin"}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
