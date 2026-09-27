import { notFound, redirect } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan, type LigneAgenda } from "../../../acces";
import { creneauTexte } from "../../../libelles";
import {
  Avertissement,
  DetailsInformation,
  EnteteSousPage,
  MarqueAgence,
  Retour,
} from "../../../ui";
import { FormulaireCreneaux } from "./formulaire-creneaux";

/**
 * Le titre reprend le mot du bouton qui mène ici (tour du 24/09) : depuis une
 * mission planifiée, on a touché « Déplacer le rendez-vous », et arriver sur
 * « Proposer des créneaux » obligeait à lire l'avertissement pour se savoir au
 * bon endroit.
 */
function titreEcran(mission: LigneAgenda | undefined): string {
  if (mission?.statut === "planifiee") return "Déplacer le rendez-vous";
  if (mission?.statut === "acceptee" && mission.creneaux_en_attente > 0)
    return "Proposer d'autres créneaux";
  return "Proposer des créneaux";
}

export async function generateMetadata(
  props: PageProps<"/artisan/missions/[interventionId]/creneaux">
) {
  const { interventionId } = await props.params;
  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  return { title: `${titreEcran(mission)} — Espace artisan` };
}

/**
 * Écran des créneaux (10.1).
 *
 * Complément du 24/09 : `mon_agenda_artisan` rend le NOMBRE de dates encore
 * en attente (`creneaux_en_attente`) ; l'écran prévient donc quand le
 * locataire n'a pas répondu. La limite ci-dessous tient toujours pour le
 * détail de ces dates, qu'il ne sait pas afficher.
 *
 * Audit du 27/09 : la RPC `mes_creneaux_artisan()` existe désormais. La
 * fiche de la mission affiche les dates en attente, celles de l'artisan comme
 * celles que le locataire lui oppose. Quand le locataire a répondu par ses
 * propres dates, cet écran n'a plus lieu d'être : la base refuse une nouvelle
 * proposition tant que l'artisan n'a pas retenu ou refusé les siennes (A5 :
 * « contre-proposé → confirmé ou arbitrage »). On le renvoie donc à la fiche,
 * où se font les deux gestes.
 */
export default async function PageCreneaux(
  props: PageProps<"/artisan/missions/[interventionId]/creneaux">
) {
  await verifierAccesArtisan();
  const { interventionId } = await props.params;

  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();
  if (mission.statut === "acceptee" && mission.dates_locataire_en_attente > 0) {
    redirect(`/artisan/missions/${interventionId}`);
  }

  const planifiee = mission.statut === "planifiee";
  const enAttente = mission.statut === "acceptee" && mission.creneaux_en_attente > 0;

  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}`}>La mission</Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
      </div>

      <EnteteSousPage
        titre={titreEcran(mission)}
        mention={`${titreIncident(mission.categorie)}${mission.ville ? ` · ${mission.ville}` : ""}`}
      />

      {planifiee && (
        <Avertissement>
          Un rendez-vous est déjà fixé : {creneauTexte(mission.debut_prevu, mission.fin_prevue)}.
          En proposer d&apos;autres L&apos;ANNULE : le locataire sera invité à
          rechoisir parmi vos nouvelles dates, et n&apos;aura plus l&apos;ancienne.
          Ne le faites que si vous ne pouvez pas l&apos;honorer.
        </Avertissement>
      )}

      {enAttente && (
        <Avertissement>
          Le locataire n&apos;a pas encore répondu à vos{" "}
          {mission.creneaux_en_attente} date{mission.creneaux_en_attente > 1 ? "s" : ""}.
          En proposer d&apos;autres les annule : ne le faites que si vous ne pouvez
          plus les tenir.
        </Avertissement>
      )}

      {/* La règle en une ligne, au lieu d'un encart de trois phrases qui
          repoussait le premier champ en bas de l'écran du téléphone ; le cas
          rare se lit à la demande, sous le formulaire (tour du 24/09). */}
      <p className="text-base text-[var(--corps)]">
        Trois créneaux au minimum ; le locataire en retient un ou vous en
        propose trois à son tour.
      </p>

      <FormulaireCreneaux interventionId={interventionId} />

      <DetailsInformation titre="Et si aucun créneau ne convient ?">
        <p className="text-[0.9375rem] text-[var(--corps)]">
          Le locataire peut refuser tous vos créneaux, mais il doit alors vous en
          proposer trois à son tour. Au sixième refus, le rendez-vous se règle
          avec l&apos;agence, par téléphone : vous n&apos;avez plus rien à proposer.
        </p>
      </DetailsInformation>
    </div>
  );
}
