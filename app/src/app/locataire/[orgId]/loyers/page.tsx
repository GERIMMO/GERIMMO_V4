import Link from "next/link";
import { eur } from "@/lib/ged";
import { COULEURS_STATUT_APPEL_LOYER, STATUTS_APPEL_LOYER } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Mes loyers — Gerimmo" };

// Écran « Mes loyers » — l'échéancier et les quittances, sorti de l'accueil
// pour suivre la navigation par onglets de la maquette (chromeLoc).
export default async function PageLoyersLocataire(
  props: PageProps<"/locataire/[orgId]/loyers">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const { data: echeancier } = await supabase.rpc("mon_echeancier_locataire", {
    p_org: orgId,
  });
  const lignesLoyer = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
    quittance_id: string | null;
  }[];
  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7">
      <div className="entete-page">
        <h1>Mes loyers</h1>
        {lignesLoyer.length > 0 && (
          <span className="mono-discret">
            {lignesLoyer.length} échéance{lignesLoyer.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          {lignesLoyer.length === 0 ? (
            <p className="vide">
              Aucune échéance pour l&apos;instant — votre échéancier apparaîtra ici dès
              l&apos;activation de votre bail.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lignesLoyer.map((l) => (
                <li key={l.periode} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-32 shrink-0 capitalize">{moisLong(l.periode)}</span>
                  <span className="w-24 shrink-0 text-right">{eur(l.montant_du)}</span>
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {l.statut === "partiel" ? `réglé ${eur(l.montant_couvert)}` : ""}
                  </span>
                  <span
                    className={`shrink-0 ${COULEURS_STATUT_APPEL_LOYER[l.statut] ?? "puce puce-grise"}`}
                  >
                    {STATUTS_APPEL_LOYER[l.statut] ?? l.statut}
                  </span>
                  {l.quittance_id && (
                    <Link
                      href={`/quittance/${l.quittance_id}`}
                      target="_blank"
                      className="shrink-0 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                    >
                      Voir la quittance
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
