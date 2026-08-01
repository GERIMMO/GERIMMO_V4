import { verifierAccesEspace } from "@/lib/espace";

// Export CSV du journal de gestion (pas de FEC) — RM-A6 : mention « journal de gestion ».
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data } = await supabase
    .from("ecritures")
    .select("date_piece, date_imputation, categorie, sens, montant, libelle, systeme, contre_ecriture_de")
    .eq("organization_id", orgId)
    .order("date_imputation")
    .order("created_at");

  const champ = (v: unknown) => String(v ?? "").replace(/[;\n\r]/g, " ");
  const entete = [
    "date_piece",
    "date_imputation",
    "categorie",
    "sens",
    "montant",
    "libelle",
    "auto",
    "contre_ecriture_de",
  ].join(";");
  const lignes = (
    (data ?? []) as {
      date_piece: string;
      date_imputation: string;
      categorie: string;
      sens: string;
      montant: number;
      libelle: string | null;
      systeme: boolean;
      contre_ecriture_de: string | null;
    }[]
  ).map((e) =>
    [
      e.date_piece,
      e.date_imputation,
      champ(e.categorie),
      e.sens,
      e.montant,
      champ(e.libelle),
      e.systeme ? "oui" : "non",
      e.contre_ecriture_de ?? "",
    ].join(";")
  );

  const csv = ["Journal de gestion", entete, ...lignes].join("\r\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="journal-de-gestion.csv"',
    },
  });
}
