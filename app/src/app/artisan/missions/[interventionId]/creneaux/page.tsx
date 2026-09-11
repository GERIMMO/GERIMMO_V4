import { notFound } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../../../acces";
import { creneauTexte } from "../../../libelles";
import { Avertissement, Carte, MarqueAgence, Retour, TitreSection } from "../../../ui";
import { FormulaireCreneaux } from "./formulaire-creneaux";

export const metadata = { title: "Proposer des créneaux — Espace artisan" };

/**
 * Écran des créneaux (10.1).
 *
 * CE QUE CET ÉCRAN NE PEUT PAS DIRE, et pourquoi il ne fait pas semblant :
 * il n'existe aucune lecture ouverte à l'artisan sur `intervention_creneaux`
 * (constat du 2026-09-11 : la table n'a pas de politique RLS le nommant — par
 * construction du modèle d'accès — et aucune RPC ne rend ses propres
 * créneaux). L'écran sait donc si un rendez-vous est POSÉ (la mission passe à
 * « planifiée » et porte son début), mais pas si une proposition est encore en
 * attente de réponse. Plutôt que d'inventer un état, il dit ce qu'il sait et
 * prévient de l'effet d'une nouvelle proposition : les créneaux encore en
 * attente deviennent caducs. Une RPC `mes_creneaux_artisan()` lèverait la
 * limite — elle est signalée au rapport de lot.
 */
export default async function PageCreneaux(
  props: PageProps<"/artisan/missions/[interventionId]/creneaux">
) {
  await verifierAccesArtisan();
  const { interventionId } = await props.params;

  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();

  const planifiee = mission.statut === "planifiee";

  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}`}>La mission</Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} />
      </div>

      <div>
        <h1 className="text-[1.375rem] leading-tight text-[var(--encre)]">
          Proposer des créneaux
        </h1>
        <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
          {titreIncident(mission.categorie)}
          {mission.ville ? ` · ${mission.ville}` : ""}
        </p>
      </div>

      {planifiee && (
        <Avertissement>
          Un rendez-vous est déjà fixé : {creneauTexte(mission.debut_prevu, mission.fin_prevue)}.
          En proposer d&apos;autres ne l&apos;annule pas, mais ne le remplace que si le
          locataire en choisit un nouveau.
        </Avertissement>
      )}

      <Carte>
        <TitreSection>Comment cela se passe</TitreSection>
        <ul className="space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>Vous proposez trois créneaux au minimum — c&apos;est ce qui donne un vrai choix.</li>
          <li>
            Le locataire en retient un, ou les refuse tous — mais il doit alors
            vous en proposer trois à son tour.
          </li>
          <li>
            Au sixième refus, le rendez-vous se règle avec le gérant, par
            téléphone : vous n&apos;avez plus rien à proposer.
          </li>
        </ul>
      </Carte>

      <FormulaireCreneaux interventionId={interventionId} />

      <p className="text-[0.8125rem] text-[var(--texte-secondaire)]">
        Une nouvelle proposition remplace celle qui était encore en attente.
      </p>
    </div>
  );
}
