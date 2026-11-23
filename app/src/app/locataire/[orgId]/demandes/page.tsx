import { RendezVousLocataireConfirme } from "@/components/rendez-vous-locataire-confirme";
import { EchangesIntervention } from "@/components/echanges-intervention";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { IncidentsLocataire, type IncidentLocataire } from "../incidents-locataire";
import { aEchoue, PanneLecture } from "../panne-lecture";
import { BORD_ETAT } from "../pastille-locataire";
import type { CreneauPropose, SuiviIntervention } from "./suivi-intervention";
import { signalementOuvert } from "../types";
import { lireIdentiteContact } from "../identite-contact";
import { interlocuteurDeLIdentite } from "@/lib/identite-contact-locataire";
import { auteurCoteEspace } from "@/lib/interlocuteur-locataire";
import { lireEnvoisProposes } from "@/lib/envois-suspendus";
import { instantRdv, type RendezVousLocataire } from "@/lib/rendez-vous-locataire";
import { etiquetteNouveauxMessages, lireEchangesNonLus } from "@/lib/echanges-intervention";
import { phraseRendezVousManque, rendezVousManquesAffiches, type RendezVousManqueLocataire } from "@/lib/rendez-vous-manque";

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
  // Lot 47 : « votre gestionnaire » seulement dans un espace d'agence ; chez un propriétaire, « votre bailleur ».
  const interlocuteur = interlocuteurDeLIdentite(await lireIdentiteContact(orgId));

  const [
    { data: incidentsBruts, error: eIncidents },
    { data: suivisBruts, error: eSuivis },
    { data: creneauxBruts, error: eCreneaux },
    { data: baux },
    { data: rendezVousBruts, error: eRendezVous },
    echangesNonLus,
    { data: rdvManquesBruts },
  ] = await Promise.all([
    supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
    supabase.rpc("mon_suivi_intervention", { p_org: orgId }),
    // Les créneaux n'appartiennent qu'à l'adhésion active (ma_personne_locataire
    // l'exige) : bail terminé, on ne lance même pas la lecture.
    adhesionActive
      ? supabase.rpc("mes_creneaux_locataire", { p_org: orgId })
      : Promise.resolve({ data: [], error: null }),
    // Recette 03/10 : le bouton « Signaler » ne sort que sur un bail actif.
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    // Décision D22 : ses rendez-vous confirmés et ce qu'il peut en faire (report, annulation). Même règle que les
    // créneaux : bail terminé, aucun geste, on ne lit pas.
    adhesionActive
      ? supabase.rpc("mes_rendez_vous_locataire", { p_org: orgId })
      : Promise.resolve({ data: [], error: null }),
    // Audit palier 1 (P1-05) : les discussions d'intervention qui portent un message qu'il n'a pas lu.
    lireEchangesNonLus(supabase, orgId),
    // Audit palier 1 (P2-04) : un rendez-vous confirmé manqué, et qui est dit absent. Lecture d'appoint : en échec,
    // rien n'est affiché (l'absence reste consignée au dossier, chez le propriétaire).
    supabase.rpc("mes_rdv_manques_locataire", { p_org: orgId }),
  ]);
  const peutSignaler = adhesionActive && signalementOuvert(baux as { etat: string }[] | null);
  // Audit palier 1 (P1-08) : le rappel de la veille est un envoi que le superviseur ouvre. Fermé (le défaut) ou
  // illisible, l'écran ne le promet pas et dit de noter la date.
  const rappelPromis = (await lireEnvoisProposes(supabase)).rappel_rendez_vous;

  const incidents = (incidentsBruts ?? []) as IncidentLocataire[];
  const suivis = (suivisBruts ?? []) as SuiviIntervention[];
  const creneaux = (creneauxBruts ?? []) as CreneauPropose[];
  const { rendezvous: selection } = await props.searchParams;
  const rendezVous = (rendezVousBruts ?? []) as RendezVousLocataire[];
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
  const boutonSignaler = peutSignaler && (incidents.length > 0 || aEchoue(eIncidents));
  // La carte « Un rendez-vous attend votre choix » est affichée (présentation seule : même test que plus bas).
  const creneauAttendu = aChoisir > 0 && adhesionActive && Boolean(premiereAChoisir);
  // Audit palier 1 (P1-05) : un message l'attend dans la discussion d'une intervention — dit en haut de page, avec
  // un lien qui mène à la discussion (elle est plus bas, sous les demandes). Seulement pour une discussion affichée ici.
  const discussionsAffichees = new Set(suivis.flatMap((s) => (s.intervention_id ? [s.intervention_id] : [])));
  const messagesALire = echangesNonLus.lignes.filter((e) => discussionsAffichees.has(e.intervention_id));
  const nombreALire = messagesALire.reduce((total, e) => total + Number(e.non_lus), 0);
  // P2-04 : le dernier rendez-vous manqué de chaque demande, tant qu'aucun nouveau rendez-vous n'est fixé et que
  // l'intervention n'est pas terminée. Le locataire lit qui est dit absent ; jamais la précision libre.
  const rdvManques = rendezVousManquesAffiches((rdvManquesBruts ?? []) as RendezVousManqueLocataire[], suivis);

  return (
    <div className="space-y-4">
      {/* 24/09 : le bouton « Signaler un problème » passe dans l'en-tête, à
          droite de la mention (titre + mention + action) ; la carte « Un
          souci dans le logement ? » qui ne servait qu'à le porter repoussait
          la première demande sous trois cartes. */}
      <div className="entete-page">
        <TitreEcran rubrique="incidents">Mes demandes</TitreEcran>
        {((!aEchoue(eIncidents) && incidents.length > 0) || boutonSignaler) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!aEchoue(eIncidents) && incidents.length > 0 && (
              <span className="mono-discret">
                {enCours.length} en cours · {incidents.length - enCours.length} terminée
                {incidents.length - enCours.length > 1 ? "s" : ""}
              </span>
            )}
            {/* Une seule action principale par écran (20/11) : tant qu'un
                créneau attend son choix, c'est lui le geste en bleu nuit ;
                « Signaler un problème » passe en bouton secondaire. */}
            {boutonSignaler && (
              <Link href={`/locataire/${orgId}/incident`} className={creneauAttendu ? "btn-secondaire" : "btn-or"}>
                Signaler un problème{"\u00a0"}→
              </Link>
            )}
          </div>
        )}
      </div>

      {!eRendezVous && <RendezVousLocataireConfirme orgId={orgId} lignes={rendezVous} selection={typeof selection === "string" ? selection : undefined}/>}
      {aEchoue(eIncidents) && <PanneLecture quoi="vos demandes" interlocuteur={interlocuteur} />}
      {/* Le suivi tombé ne doit pas faire croire qu'il ne se passe rien : sans
          lui, la carte n'affiche que l'état de l'incident, muet sur l'artisan. */}
      {!aEchoue(eIncidents) && aEchoue(eSuivis, eCreneaux, eRendezVous) && (
        <PanneLecture quoi="l'avancement de vos demandes" interlocuteur={interlocuteur} />
      )}

      {/* Le seul geste attendu passe en premier, et la carte entière mène à
          la demande concernée (24/09). */}
      {aChoisir > 0 && adhesionActive && premiereAChoisir && (
        <a
          href={`#demande-${premiereAChoisir}`}
          className={`loc-carte block ${BORD_ETAT.attention}`}
        >
          <h2 className="titre-carte text-base font-medium">
            {aChoisir > 1
              ? `${aChoisir} rendez-vous attendent votre choix`
              : "Un rendez-vous attend votre choix"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            L&apos;artisan a proposé ses créneaux&nbsp;: choisissez celui qui vous
            arrange. Tant que personne n&apos;a choisi, la réparation attend.
          </p>
          <span className="btn-or mt-3">Choisir mon créneau{"\u00a0"}→</span>
        </a>
      )}

      {messagesALire.length > 0 && (
        <a href={`#discussion-${messagesALire[0].intervention_id}`} data-nouveaux-messages className={`loc-carte block ${BORD_ETAT.attention}`}>
          <h2 className="titre-carte text-base font-medium">{etiquetteNouveauxMessages(nombreALire)} sur votre intervention</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {/* Lot 47 (reprise) : dans un espace d'agence, c'est le gestionnaire qui écrit dans la discussion. */}
            {auteurCoteEspace(interlocuteur)} ou l&apos;artisan vous a écrit dans la discussion de l&apos;intervention.
          </p>
          <span className="btn-secondaire mt-3">Lire la discussion{"\u00a0"}→</span>
        </a>
      )}

      {rdvManques.map((m) => (
        <a key={m.intervention_id} href={`#demande-${m.incident_id}`} data-rdv-manque={m.absent} className={`loc-carte block ${BORD_ETAT.attention}`}>
          <h2 className="titre-carte text-base font-medium">Rendez-vous manqué {instantRdv(m.rdv_debut)}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{phraseRendezVousManque(m, interlocuteur)}</p>
        </a>
      ))}

      {/* L’accès Urgence reste visible dans l’en-tête commun. */}
      {/* Chaque signalement porte sa propre carte, avec son fil d'étapes */}
      <IncidentsLocataire
        orgId={orgId}
        incidents={incidents}
        suivis={suivis}
        creneaux={creneaux}
        rendezVous={rendezVous}
        peutAgir={adhesionActive}
        peutSignaler={peutSignaler}
        lectureEnEchec={aEchoue(eIncidents)}
        rappelPromis={rappelPromis}
        interlocuteur={interlocuteur}
      />
      {!eSuivis && [...new Set(suivis.flatMap(s=>s.intervention_id?[s.intervention_id]:[]))].map(id=><EchangesIntervention key={id} intervention={id} />)}
    </div>
  );
}
