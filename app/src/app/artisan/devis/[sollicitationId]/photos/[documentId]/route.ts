import { servirPhoto } from "@/lib/photos-demande-artisan";

/**
 * Une photo jointe par le locataire, vue depuis la demande de devis (D16, fiche ART-15).
 *
 * L'adresse reste une adresse Gerimmo stable : chaque ouverture revérifie le droit en base, trace l'accès, puis redirige vers
 * une URL signée de 60 secondes. Voir lib/photos-demande-artisan.ts.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/artisan/devis/[sollicitationId]/photos/[documentId]">
) {
  const { sollicitationId, documentId } = await ctx.params;
  return servirPhoto({ sollicitation: sollicitationId }, documentId, "depuis votre demande de devis");
}
