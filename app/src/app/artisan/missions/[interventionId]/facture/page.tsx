import { LectureImpossibleArtisan } from "../../../ui";
import { notFound, redirect } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../../../acces";
import { euros } from "../../../libelles";
import { Carte, EnteteSousPage, LigneInfo, MarqueAgence, Retour } from "../../../ui";
import { AvertissementRendezVousAnticipe } from "../avertissement-rendez-vous";
import { FormulaireFacture } from "./formulaire-facture";

export const metadata = { title: "Déposer ma facture" };

/**
 * Déposer la facture d'une intervention (module 9.7 — audit du 27/09).
 *
 * Le cycle devis → acceptation → intervention → compte rendu s'arrêtait là :
 * « Ma facturation » n'était qu'une liste. Wiki, concepts/Devis : facture
 * pré-remplie du devis, écart alerté sans blocage, exige intervention
 * terminée + photo. La page ne s'ouvre que lorsque ces conditions tiennent ;
 * la base les revérifie.
 */
export default async function PageFacture(
  props: PageProps<"/artisan/missions/[interventionId]/facture">
) {
  await verifierAccesArtisan();
  const { interventionId } = await props.params;
  const agenda = await chargerAgenda();
  if (agenda.erreur) return <LectureImpossibleArtisan href={`/artisan/missions/${interventionId}/facture`} />;
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();
  if (
    mission.statut !== "terminee" ||
    !mission.compte_rendu_depose ||
    !mission.photo_apres_deposee ||
    mission.facture_deposee
  ) {
    redirect(`/artisan/missions/${interventionId}`);
  }

  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}`}>La mission</Retour>
      <MarqueAgence nom={mission.agence_nom} taille="grande" />
      <EnteteSousPage
        titre="Déposer ma facture"
        mention={`${titreIncident(mission.categorie)} · ${mission.incident_numero}`}
      />

      <Carte>
        <LigneInfo libelle="Devis retenu">
          {mission.montant_ttc_cents !== null ? `${euros(mission.montant_ttc_cents)} TTC` : "—"}
        </LigneInfo>
        {mission.montant_plafond_cents !== null &&
          mission.montant_plafond_cents !== mission.montant_ttc_cents && (
            <LigneInfo libelle="Avenant accepté">
              {euros(mission.montant_plafond_cents)} TTC
            </LigneInfo>
          )}
        {mission.montant_final_cents !== null && (
          <LigneInfo libelle="Montant final du compte rendu">
            {euros(mission.montant_final_cents)} TTC
          </LigneInfo>
        )}
      </Carte>

      {/* D20 (ART-21) : facturer plus de 2 h avant le rendez-vous confirmé reste possible ; on le dit. */}
      <AvertissementRendezVousAnticipe debutPrevu={mission.debut_prevu} finPrevue={mission.fin_prevue} geste="facturer" />

      <FormulaireFacture
        interventionId={interventionId}
        plafondCents={mission.montant_plafond_cents}
      />
    </div>
  );
}
