import { rendrePdf } from "@/lib/documents/rendu";
import { verifierAccesEspace } from "@/lib/espace";
import { csvSuiviLoyers, documentSuiviLoyers } from "@/lib/export-suivi-loyers";
import { lireSelectionLoyers, lireSuiviMensuelLoyers } from "@/lib/suivi-mensuel-loyers";

const entetes = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const { supabase, estProprietaire, organisation, traverseeLectureSeule } = await verifierAccesEspace(orgId);
  if (!estProprietaire || traverseeLectureSeule) return new Response("Accès refusé.", { status: 403, headers: entetes });
  const params = new URL(req.url).searchParams;
  const format = params.get("format");
  if (format !== "csv" && format !== "pdf") return new Response("Format inconnu.", { status: 400, headers: entetes });
  const selection = lireSelectionLoyers(Object.fromEntries(params));
  const { lignes, totaux, entite, biens, erreurPerimetre } = await lireSuiviMensuelLoyers(supabase, orgId, selection);
  if (erreurPerimetre || !totaux) return new Response("Les montants n’ont pas pu être vérifiés. Aucun export n’est disponible.", { status: 503, headers: entetes });
  const headers = {
    ...entetes,
    "Content-Disposition": `attachment; filename="suivi-loyers-${selection.mois}.${format}"`,
    "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
  };
  if (format === "csv") return new Response(csvSuiviLoyers(lignes, totaux), { headers });
  try {
    const contexte = {
      mois: selection.mois, espace: organisation.name,
      selection: [entite?.nom, biens?.find(b => b.id === selection.bien)?.nom].filter(Boolean).join(" · ") || "Tout le patrimoine",
    };
    const pdf = await rendrePdf(documentSuiviLoyers(lignes, totaux, contexte));
    return new Response(new Uint8Array(pdf), { headers });
  } catch {
    return new Response("Le PDF n’a pas pu être préparé. Réessayez ou choisissez le format CSV.", { status: 503, headers: entetes });
  }
}
