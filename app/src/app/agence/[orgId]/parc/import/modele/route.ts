import { gabaritCsv } from "@/lib/import-parc";

// Le gabarit d'import, servi en CSV. Une route plutôt qu'un fichier statique :
// les colonnes vivent dans lib/import-parc.ts, et le gabarit ne peut donc pas
// prendre du retard sur ce que l'import sait lire.
export async function GET() {
  return new Response(gabaritCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gerimmo-parc-gabarit.csv"',
      "Cache-Control": "no-store",
    },
  });
}
