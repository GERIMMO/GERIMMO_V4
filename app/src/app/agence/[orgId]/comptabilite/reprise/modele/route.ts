import { gabaritCsv } from "@/lib/reprise-soldes";

// Le gabarit de la balance d'ouverture, servi en CSV. Une route plutôt qu'un
// fichier statique : les colonnes vivent dans lib/reprise-soldes.ts, et le
// gabarit ne peut donc pas prendre du retard sur ce que la reprise sait lire.
export async function GET() {
  return new Response(gabaritCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gerimmo-balance-ouverture.csv"',
      "Cache-Control": "no-store",
    },
  });
}
