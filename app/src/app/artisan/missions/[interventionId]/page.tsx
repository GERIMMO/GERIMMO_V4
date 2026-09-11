import Link from "next/link";
import { notFound } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../../acces";
import {
  creneauTexte,
  euros,
  libelle,
  NATURES_TRAVAUX,
  STATUTS_MISSION,
} from "../../libelles";
import {
  Carte,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_SECONDAIRE,
  Etiquette,
  LigneInfo,
  MarqueAgence,
  Retour,
  Succes,
  TitreSection,
} from "../../ui";
import { AccepterOuRefuser } from "./accepter-refuser";
import { BoutonDemarrer } from "./bouton-demarrer";

export const metadata = { title: "Ma mission — Espace artisan" };

/**
 * La mission : tout ce qu'il faut pour y aller, et le geste attendu maintenant.
 *
 * La page n'interroge aucune table — elle relit la ligne dans
 * `mon_agenda_artisan`, qui est la seule lecture que la base ouvre à
 * l'artisan. Une mission qui n'y figure pas n'est pas à lui : `notFound()`,
 * et non un message d'erreur qui confirmerait qu'elle existe ailleurs.
 *
 * LE CONTACT DE L'OCCUPANT n'apparaît que pendant la mission vivante, et ce
 * n'est pas l'écran qui le décide : la base ne le rend qu'entre l'acceptation
 * et la fin. Avant, il juge la mission sur l'adresse ; après, il garde sa
 * ligne d'historique, plus le téléphone de quelqu'un chez qui il n'a plus à
 * se rendre.
 */
export default async function PageMission(
  props: PageProps<"/artisan/missions/[interventionId]">
) {
  await verifierAccesArtisan();
  const { interventionId } = await props.params;
  const { termine } = await props.searchParams;

  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();

  const vivante = ["acceptee", "planifiee", "en_cours"].includes(mission.statut);
  const occupant = [mission.occupant_prenom, mission.occupant_nom]
    .filter(Boolean)
    .join(" ");
  const adresse = [
    mission.adresse,
    [mission.code_postal, mission.ville].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-5">
      <Retour href="/artisan/agenda">Mon agenda</Retour>

      {termine && (
        <Succes>
          Compte rendu envoyé. L&apos;intervention est terminée et l&apos;agence peut
          facturer.
        </Succes>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
        <Etiquette
          ton={
            mission.statut === "proposee"
              ? "alerte"
              : mission.statut === "terminee"
                ? "ok"
                : mission.statut === "en_cours"
                  ? "attente"
                  : "encre"
          }
        >
          {libelle(STATUTS_MISSION, mission.statut)}
        </Etiquette>
      </div>

      <div>
        <h1 className="text-[1.375rem] leading-tight text-[var(--encre)]">
          {titreIncident(mission.categorie)}
        </h1>
        <p className="mt-1 text-[1.0625rem] font-medium text-[var(--corps)]">
          {creneauTexte(mission.debut_prevu, mission.fin_prevue)}
        </p>
        {mission.urgence === "urgente" && (
          <p className="mt-2">
            <Etiquette ton="alerte">Urgent</Etiquette>
          </p>
        )}
      </div>

      {/* Où aller — en gros, et cliquable : sur un chantier, on ouvre l'itinéraire. */}
      <Carte>
        <TitreSection>Où</TitreSection>
        <p className="text-base break-words text-[var(--corps)]">
          {adresse || "Adresse communiquée par l'agence"}
        </p>
        {(mission.lot_nom || mission.etage || mission.piece) && (
          <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
            {[mission.lot_nom, mission.etage, mission.piece].filter(Boolean).join(" · ")}
          </p>
        )}
        {adresse && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${CLASSE_BOUTON_SECONDAIRE} mt-3`}
          >
            Ouvrir l&apos;itinéraire
          </a>
        )}
      </Carte>

      <Carte>
        <TitreSection>Quoi</TitreSection>
        <p className="text-base break-words text-[var(--corps)]">
          {mission.description || "Aucune description transmise."}
        </p>
        <div className="mt-2">
          <LigneInfo libelle="Nature des travaux">
            {libelle(NATURES_TRAVAUX, mission.nature_travaux)}
          </LigneInfo>
          <LigneInfo libelle="Référence de l'incident">{mission.incident_numero}</LigneInfo>
          {mission.montant_ttc_cents !== null && (
            <LigneInfo libelle="Devis retenu">
              {euros(mission.montant_ttc_cents)} TTC
            </LigneInfo>
          )}
        </div>
      </Carte>

      {vivante && (occupant || mission.occupant_telephone) && (
        <Carte>
          <TitreSection>Sur place</TitreSection>
          {occupant && <p className="text-base text-[var(--corps)]">{occupant}</p>}
          {mission.occupant_telephone && (
            <a
              href={`tel:${mission.occupant_telephone.replace(/\s/g, "")}`}
              className={`${CLASSE_BOUTON_SECONDAIRE} mt-3`}
            >
              Appeler {mission.occupant_telephone}
            </a>
          )}
          <p className="mt-2 text-[0.8125rem] text-[var(--texte-secondaire)]">
            Ce contact vous est ouvert le temps de la mission, et refermé à la fin.
          </p>
        </Carte>
      )}

      {/* Le geste attendu maintenant — un seul, en bas, à portée de pouce. */}
      {mission.statut === "proposee" && (
        <AccepterOuRefuser interventionId={mission.intervention_id} />
      )}

      {mission.statut === "acceptee" && (
        <div className="space-y-3">
          <Link
            href={`/artisan/missions/${mission.intervention_id}/creneaux`}
            className={CLASSE_BOUTON_PRINCIPAL}
          >
            Proposer des créneaux
          </Link>
          <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
            Vous proposez en premier, trois créneaux au minimum. Le locataire
            choisit, ou vous en propose trois à son tour.
          </p>
          <BoutonDemarrer interventionId={mission.intervention_id} sansRendezVous />
        </div>
      )}

      {mission.statut === "planifiee" && (
        <div className="space-y-3">
          <BoutonDemarrer interventionId={mission.intervention_id} />
          <Link
            href={`/artisan/missions/${mission.intervention_id}/creneaux`}
            className={CLASSE_BOUTON_SECONDAIRE}
          >
            Proposer d&apos;autres créneaux
          </Link>
        </div>
      )}

      {mission.statut === "en_cours" && (
        <div className="space-y-3">
          <Link
            href={`/artisan/missions/${mission.intervention_id}/compte-rendu`}
            className={CLASSE_BOUTON_PRINCIPAL}
          >
            Rendre compte du travail
          </Link>
          <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
            Deux écrans : la photo du travail réalisé, puis ce que vous avez
            fait. Sans le compte rendu, l&apos;intervention ne peut pas être
            terminée — et sans elle, l&apos;agence ne peut pas facturer.
          </p>
        </div>
      )}

      {mission.statut === "terminee" && (
        <Carte>
          <TitreSection>Terminée</TitreSection>
          <div>
            <LigneInfo libelle="Compte rendu">
              {mission.compte_rendu_depose ? "Déposé" : "Manquant"}
            </LigneInfo>
            <LigneInfo libelle="Photo du travail réalisé">
              {mission.photo_apres_deposee ? "Déposée" : "Manquante"}
            </LigneInfo>
          </div>
          <Link
            href="/artisan/facturation"
            className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
          >
            Voir ma facturation
          </Link>
        </Carte>
      )}
    </div>
  );
}
