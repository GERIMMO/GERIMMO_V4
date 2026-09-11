import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { IncidentsLocataire, type IncidentLocataire } from "../incidents-locataire";
import { aEchoue, PanneLecture } from "../panne-lecture";
import { ReflexesUrgence } from "../reflexes-urgence";

export const metadata = { title: "Mes demandes — Gerimmo" };

// « Mes demandes » (maquette v10) : le suivi de chaque signalement — avec,
// avant toute intervention, qui prend la réparation en charge. La page
// s'appelait « Signaler un problème » comme l'entrée de menu ET comme son
// propre bouton (relevé 11/09) : le locataire touchait deux fois les mêmes
// mots et croyait que le premier clic n'avait pas pris. La déclaration a sa
// page, /incident ; celle-ci porte ce qu'elle montre.
export default async function PageDemandesLocataire(
  props: PageProps<"/locataire/[orgId]/demandes">
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const { data: incidentsBruts, error: eIncidents } = await supabase.rpc(
    "mes_incidents_locataire",
    { p_org: orgId }
  );
  const incidents = (incidentsBruts ?? []) as IncidentLocataire[];
  const enCours = incidents.filter((i) => i.etat !== "clos");

  return (
    <div className="space-y-4">
      <div className="entete-page">
        <h1>Mes demandes</h1>
        {!aEchoue(eIncidents) && incidents.length > 0 && (
          <span className="mono-discret">
            {enCours.length} en cours · {incidents.length - enCours.length} clos
          </span>
        )}
      </div>

      {aEchoue(eIncidents) && <PanneLecture quoi="vos demandes" />}

      {/* La consigne de sécurité reste ici ET accompagne désormais le
          formulaire sur /incident : une consigne d'urgence ne se déménage
          pas, elle se trouve là où le locataire atterrit. */}
      <ReflexesUrgence />

      <div className="loc-carte">
        <h3 className="text-base font-medium">Un souci dans le logement ?</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Décrivez-le en deux gestes, photo à l&apos;appui. Signaler tôt protège le
          logement — et avant toute intervention, on vous dit qui prend la
          réparation en charge : jamais de surprise sur la facture.
        </p>
        {/* Liste vide, l'état vide de IncidentsLocataire porte déjà son
            propre bouton or vers /incident : deux boutons identiques l'un
            sous l'autre (relevé 11/09). Celui-ci ne sort que s'il y a une
            liste à dépasser — ou si la lecture est tombée, auquel cas
            l'état vide n'est pas affiché du tout. */}
        {adhesionActive && (incidents.length > 0 || aEchoue(eIncidents)) && (
          <Link href={`/locataire/${orgId}/incident`} className="btn-or mt-3">
            Signaler un problème →
          </Link>
        )}
      </div>

      {/* Chaque signalement porte sa propre carte, avec son fil d'étapes */}
      <IncidentsLocataire
        orgId={orgId}
        incidents={incidents}
        lectureEnEchec={aEchoue(eIncidents)}
      />
    </div>
  );
}
