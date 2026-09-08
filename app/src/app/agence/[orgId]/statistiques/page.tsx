import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille } from "@/lib/portefeuille";
import { IMPUTATIONS_INCIDENT } from "@/lib/incidents";

export const metadata = { title: "Statistiques — Gerimmo" };

// Statistiques (maquette v6) : des métriques RÉELLES tirées des incidents —
// résolution, délai moyen de clôture, répartition des imputations, lots les
// plus signalés. L'agent lit son portefeuille, l'admin toute l'agence.
// Les coûts par intervention arrivent avec les devis/factures d'artisans (T5).
export default async function PageStatistiques(
  props: PageProps<"/agence/[orgId]/statistiques">
) {
  const { orgId } = await props.params;
  const { supabase, user, role, estProprietaire } = await verifierAccesEspace(orgId);

  const [{ data: incidentsBruts }, { data: lots }] = await Promise.all([
    supabase
      .from("incidents")
      .select("id, lot_id, etat, imputation, created_at, clos_le")
      .eq("organization_id", orgId),
    supabase.from("lots").select("id, nom").eq("organization_id", orgId),
  ]);
  const perimetre = estProprietaire
    ? null
    : await lotsDuPortefeuille(supabase, orgId, role, user.id);
  const nomLot = new Map(((lots ?? []) as { id: string; nom: string }[]).map((l) => [l.id, l.nom]));
  const incidents = ((incidentsBruts ?? []) as {
    id: string;
    lot_id: string;
    etat: string;
    imputation: string | null;
    created_at: string;
    clos_le: string | null;
  }[]).filter((i) => perimetre === null || perimetre.has(i.lot_id));

  const clos = incidents.filter((i) => i.etat === "clos");
  const enCours = incidents.length - clos.length;
  const delais = clos
    .filter((i) => i.clos_le)
    .map((i) => (new Date(i.clos_le!).getTime() - new Date(i.created_at).getTime()) / 86_400_000);
  const delaiMoyen = delais.length
    ? Math.round((delais.reduce((s, d) => s + d, 0) / delais.length) * 10) / 10
    : null;
  const sous15j = delais.length
    ? Math.round((delais.filter((d) => d <= 15).length / delais.length) * 100)
    : null;

  const parImputation = new Map<string, number>();
  for (const i of incidents) {
    const cle = i.imputation ?? "a_qualifier";
    parImputation.set(cle, (parImputation.get(cle) ?? 0) + 1);
  }
  const parLot = new Map<string, number>();
  for (const i of incidents) parLot.set(i.lot_id, (parLot.get(i.lot_id) ?? 0) + 1);
  const topLots = [...parLot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-7">
      <div className="entete-page">
        <h1>{role === "agent" ? "Mes statistiques" : "Statistiques"}</h1>
        <span className="mono-discret">
          {incidents.length} incident{incidents.length > 1 ? "s" : ""} au total
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="loc-carte loc-kpi">
          <p className="text-[13px] font-semibold text-[var(--encre)]">Résolus sous 15 jours</p>
          <p className="v">{sous15j !== null ? `${sous15j} %` : "—"}</p>
          <p className="text-xs text-muted-foreground">
            {clos.length} incident{clos.length > 1 ? "s" : ""} clos
          </p>
        </div>
        <div className="loc-carte loc-kpi">
          <p className="text-[13px] font-semibold text-[var(--encre)]">Délai moyen de clôture</p>
          <p className="v">{delaiMoyen !== null ? `${delaiMoyen.toLocaleString("fr-FR")} j` : "—"}</p>
          <p className="text-xs text-muted-foreground">du signalement à la clôture</p>
        </div>
        <div className="loc-carte loc-kpi">
          <p className="text-[13px] font-semibold text-[var(--encre)]">En cours</p>
          <p className="v">{enCours}</p>
          <p className="text-xs text-muted-foreground">
            incident{enCours > 1 ? "s" : ""} ouvert{enCours > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="loc-carte">
        <h3 className="text-base font-medium">Qui paie — répartition des imputations</h3>
        {incidents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aucun incident pour l&apos;instant.</p>
        ) : (
          <div className="mt-2">
            {[...parImputation.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([imp, n]) => (
                <div key={imp} className="ligne-info">
                  <span>
                    {imp === "a_qualifier"
                      ? "Pas encore qualifié"
                      : (IMPUTATIONS_INCIDENT[imp] ?? imp)}
                  </span>
                  <span>
                    {n} · {Math.round((n / incidents.length) * 100)} %
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="loc-carte">
        <h3 className="text-base font-medium">Lots les plus signalés</h3>
        {topLots.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Rien à signaler — c&apos;est bon signe.</p>
        ) : (
          <div className="mt-2">
            {topLots.map(([lotId, n]) => (
              <div key={lotId} className="ligne-info">
                <span>{nomLot.get(lotId) ?? "Lot"}</span>
                <span>
                  {n} incident{n > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Un même lot signalé plusieurs fois pour la même famille de panne :
          l&apos;argument chiffré à présenter au propriétaire pour des travaux de
          fond. Les coûts par intervention arriveront avec les devis d&apos;artisans.
        </p>
      </div>
    </main>
  );
}
