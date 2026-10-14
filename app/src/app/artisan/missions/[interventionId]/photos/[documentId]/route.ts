import { servirPhoto } from "@/lib/photos-demande-artisan";

/**
 * Une photo jointe par le locataire, vue depuis la mission (D16, fiche ART-15).
 *
 * Même contrôle que depuis la demande de devis : droit revérifié en base, accès tracé, redirection vers une URL signée de
 * 60 secondes. Voir lib/photos-demande-artisan.ts.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/artisan/missions/[interventionId]/photos/[documentId]">
) {
  const { interventionId, documentId } = await ctx.params;
  return servirPhoto({ intervention: interventionId }, documentId, "depuis votre mission");
}
