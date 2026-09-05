import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { IncidentsLocataire, type IncidentLocataire } from "../incidents-locataire";

export const metadata = { title: "Signaler un problème — Gerimmo" };

// « Signaler un problème » (maquette v10) : les bons réflexes d'urgence, le
// signalement en deux gestes, puis le suivi de chaque demande — avec, avant
// toute intervention, qui prend la réparation en charge.
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
    <div className="space-y-4">
      <div className="entete-page">
        <h1>Signaler un problème</h1>
        {incidents.length > 0 && (
          <span className="mono-discret">
            {enCours.length} en cours · {incidents.length - enCours.length} clos
          </span>
        )}
      </div>

      <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
        <h3 className="text-base font-medium">En cas d&apos;urgence</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Fuite importante : fermez d&apos;abord le robinet d&apos;arrêt d&apos;eau.
          Odeur de gaz : aérez, ne touchez aucun interrupteur, appelez Urgence
          Sécurité Gaz au 0 800 47 33 33. Danger pour les personnes : le 112.
          Puis signalez ici — votre gestionnaire est prévenu immédiatement.
        </p>
      </div>

      <div className="loc-carte">
        <h3 className="text-base font-medium">Un souci dans le logement ?</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Décrivez-le en deux gestes, photo à l&apos;appui. Signaler tôt protège le
          logement — et avant toute intervention, on vous dit qui prend la
          réparation en charge : jamais de surprise sur la facture.
        </p>
        <Link href={`/locataire/${orgId}/incident`} className="btn-or mt-3 inline-block">
          Signaler un problème →
        </Link>
      </div>

      {/* Chaque signalement porte sa propre carte, avec son fil d'étapes */}
      <IncidentsLocataire orgId={orgId} incidents={incidents} />
    </div>
  );
}
