import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { IncidentsLocataire, type IncidentLocataire } from "../incidents-locataire";
import { aEchoue, PanneLecture } from "../panne-lecture";
import { ReflexesUrgence } from "../reflexes-urgence";
import type { CreneauPropose, SuiviIntervention } from "./suivi-intervention";

export const metadata = { title: "Mes demandes" };

// « Mes demandes » (maquette v10) : le suivi de chaque signalement — avec,
// avant toute intervention, qui prend la réparation en charge. La page
// s'appelait « Signaler un problème » comme l'entrée de menu ET comme son
// propre bouton (relevé 11/09) : le locataire touchait deux fois les mêmes
// mots et croyait que le premier clic n'avait pas pris. La déclaration a sa
// page, /incident ; celle-ci porte ce qu'elle montre.
//
// Sprint 7 : la carte de chaque demande porte désormais l'ÉTAPE RÉELLE de
// l'intervention (on cherche un artisan · devis reçus · rendez-vous le … ·
// réalisée) et le seul geste qu'on demande au locataire — choisir son créneau.
// Trois lectures, une seule tournée : l'état des demandes, leur suivi, et les
// créneaux proposés. Les tables du module 8 ne sont pas lisibles par le
// locataire (politiques réservées aux gestionnaires) : tout passe par ces RPC.
export default async function PageDemandesLocataire(
  props: PageProps<"/locataire/[orgId]/demandes">
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: incidentsBruts, error: eIncidents },
    { data: suivisBruts, error: eSuivis },
    { data: creneauxBruts, error: eCreneaux },
  ] = await Promise.all([
    supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
    supabase.rpc("mon_suivi_intervention", { p_org: orgId }),
    // Les créneaux n'appartiennent qu'à l'adhésion active (ma_personne_locataire
    // l'exige) : bail terminé, on ne lance même pas la lecture.
    adhesionActive
      ? supabase.rpc("mes_creneaux_locataire", { p_org: orgId })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const incidents = (incidentsBruts ?? []) as IncidentLocataire[];
  const suivis = (suivisBruts ?? []) as SuiviIntervention[];
  const creneaux = (creneauxBruts ?? []) as CreneauPropose[];
  const enCours = incidents.filter((i) => i.etat !== "clos");
  // Un créneau qui attend son choix est la seule chose qu'on lui demande de
  // tout le cycle : il se dit en haut de page, avant la liste.
  const suivisAChoisir = suivis.filter((s) => s.etape === "creneau_a_choisir");
  const aChoisir = suivisAChoisir.length;
  // La carte d'alerte MÈNE à la demande (24/09) : « plus bas dans la demande
  // concernée » n'y conduisait pas. IncidentsLocataire met ces demandes en
  // tête et ancre chaque carte (#demande-<id>).
  const premiereAChoisir = suivisAChoisir[0]?.incident_id;
  // Le bouton de signalement ne sort que s'il y a une liste à dépasser — ou
  // si la lecture est tombée, auquel cas l'état vide (qui porte son propre
  // bouton or vers /incident) n'est pas affiché du tout (relevé 11/09).
  const boutonSignaler = adhesionActive && (incidents.length > 0 || aEchoue(eIncidents));

  return (
    <div className="space-y-4">
      {/* 24/09 : le bouton « Signaler un problème » passe dans l'en-tête, à
          droite de la mention (titre + mention + action) ; la carte « Un
          souci dans le logement ? » qui ne servait qu'à le porter repoussait
          la première demande sous trois cartes. */}
      <div className="entete-page">
        <h1>Mes demandes</h1>
        {((!aEchoue(eIncidents) && incidents.length > 0) || boutonSignaler) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!aEchoue(eIncidents) && incidents.length > 0 && (
              <span className="mono-discret">
                {enCours.length} en cours · {incidents.length - enCours.length} terminée
                {incidents.length - enCours.length > 1 ? "s" : ""}
              </span>
            )}
            {boutonSignaler && (
              <Link href={`/locataire/${orgId}/incident`} className="btn-or">
                Signaler un problème{"\u00a0"}→
              </Link>
            )}
          </div>
        )}
      </div>

      {aEchoue(eIncidents) && <PanneLecture quoi="vos demandes" />}
      {/* Le suivi tombé ne doit pas faire croire qu'il ne se passe rien : sans
          lui, la carte n'affiche que l'état de l'incident, muet sur l'artisan. */}
      {!aEchoue(eIncidents) && aEchoue(eSuivis, eCreneaux) && (
        <PanneLecture quoi="l'avancement de vos demandes" />
      )}

      {/* Le seul geste attendu passe en premier, et la carte entière mène à
          la demande concernée (24/09). */}
      {aChoisir > 0 && adhesionActive && premiereAChoisir && (
        <a
          href={`#demande-${premiereAChoisir}`}
          className="loc-carte group block border-l-4 border-l-[var(--warning)] transition-colors hover:border-[var(--marque)] hover:border-l-[var(--warning)]"
        >
          <h3 className="text-base font-medium">
            {aChoisir > 1
              ? `${aChoisir} rendez-vous attendent votre choix`
              : "Un rendez-vous attend votre choix"}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            L&apos;artisan a proposé ses créneaux&nbsp;: choisissez celui qui vous
            arrange. Tant que personne n&apos;a choisi, la réparation attend.
          </p>
          <span className="btn-or mt-3">Choisir mon créneau{"\u00a0"}→</span>
        </a>
      )}

      {/* La consigne de sécurité reste ici ET accompagne désormais le
          formulaire sur /incident : une consigne d'urgence ne se déménage
          pas, elle se trouve là où le locataire atterrit. */}
      <ReflexesUrgence
        hrefSignalement={adhesionActive ? `/locataire/${orgId}/incident` : undefined}
      />

      {/* Chaque signalement porte sa propre carte, avec son fil d'étapes */}
      <IncidentsLocataire
        orgId={orgId}
        incidents={incidents}
        suivis={suivis}
        creneaux={creneaux}
        peutAgir={adhesionActive}
        lectureEnEchec={aEchoue(eIncidents)}
      />
    </div>
  );
}
