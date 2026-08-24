import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { IncidentsLocataire, type IncidentLocataire } from "../incidents-locataire";

export const metadata = { title: "Mes demandes — Gerimmo" };

// Onglet « Mes demandes » (maquette pLocIncidents) : chaque signalement avec
// son statut dans les mots du locataire, qui prend en charge, contestation et
// réouverture pour le déclarant.
export default async function PageDemandesLocataire(
  props: PageProps<"/locataire/[orgId]/demandes">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const { data: incidentsBruts } = await supabase.rpc("mes_incidents_locataire", {
    p_org: orgId,
  });
  const incidents = (incidentsBruts ?? []) as IncidentLocataire[];
  const enCours = incidents.filter((i) => i.etat !== "clos");

  return (
    <main className="mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7">
      <div className="entete-page">
        <h1>Mes demandes</h1>
        <div className="flex items-center gap-3">
          {incidents.length > 0 && (
            <span className="mono-discret">
              {enCours.length} en cours · {incidents.length - enCours.length} clos
            </span>
          )}
          <Link href={`/locataire/${orgId}/incident`} className="btn-or">
            Signaler un problème
          </Link>
        </div>
      </div>

      {/* Chaque signalement porte sa propre carte (maquette pLocIncidents) —
          plus d'enveloppe commune ici */}
      <IncidentsLocataire orgId={orgId} incidents={incidents} />
    </main>
  );
}
