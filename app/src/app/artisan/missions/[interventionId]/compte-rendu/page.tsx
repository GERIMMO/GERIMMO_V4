import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../../../acces";
import {
  Avertissement,
  Carte,
  CLASSE_AIDE,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_SOBRE,
  EnteteSousPage,
  Etiquette,
  MarqueAgence,
  Retour,
  TitreSection,
  Vide,
} from "../../../ui";
import { PhotoChantier } from "./photo-chantier";

export const metadata = { title: "Photo du travail — Espace artisan" };

/**
 * COMPTE RENDU — ÉCRAN 1 SUR 2 (RM-19.3.1) : LA PHOTO.
 *
 * Pourquoi un écran entier pour une photo : parce que c'est elle qui commande
 * tout le reste. `deposer_compte_rendu` refuse d'écrire tant qu'aucune photo
 * « après » n'existe (RM-7.5.2), et un déclencheur de table refuse de son côté
 * le passage à « terminée » — y compris par écriture directe. La photo n'est
 * donc pas une pièce jointe qu'on relègue en bas d'un formulaire : c'est la
 * condition. La reléguer, c'était laisser l'artisan remplir six champs pour se
 * faire refuser à l'envoi, sur un chantier, sous le soleil.
 *
 * Le second écran (« Le bilan ») ne s'ouvre qu'une fois la photo partie : il
 * n'y a rien à taper tant que la condition n'est pas remplie.
 */
export default async function PageComptePhoto(
  props: PageProps<"/artisan/missions/[interventionId]/compte-rendu">
) {
  await verifierAccesArtisan();
  const { interventionId } = await props.params;

  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();

  // Le compte rendu ne se dépose qu'en cours d'intervention. Déjà déposé, la
  // mission est terminée : on renvoie à la mission plutôt que d'afficher un
  // formulaire qui sera refusé.
  if (mission.compte_rendu_depose || mission.statut === "terminee") {
    redirect(`/artisan/missions/${interventionId}`);
  }

  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}`}>La mission</Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* La pastille garde la taille de la fiche de mission : l'en-tête ne
            rétrécit pas au moment où l'on entre dans l'action (24/09). */}
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
        <Etiquette ton="encre">Étape 1 sur 2</Etiquette>
      </div>

      <EnteteSousPage
        titre="La photo du travail réalisé"
        mention={`${titreIncident(mission.categorie)}${mission.ville ? ` · ${mission.ville}` : ""}`}
      />

      {mission.statut !== "en_cours" && (
        <Avertissement>
          Démarrez l&apos;intervention avant d&apos;en rendre compte : le bouton est
          sur la page de la mission.
        </Avertissement>
      )}

      <PhotoChantier
        interventionId={interventionId}
        moment="apres"
        dejaEnvoyee={mission.photo_apres_deposee}
        titre="Photographier le travail terminé"
        aide="Sans elle, l'intervention ne peut pas être terminée — donc pas de facture."
      />

      {mission.photo_apres_deposee ? (
        <Link
          href={`/artisan/missions/${interventionId}/compte-rendu/bilan`}
          className={CLASSE_BOUTON_PRINCIPAL}
        >
          Continuer — le bilan
        </Link>
      ) : (
        <Vide>Une fois la photo envoyée, touchez « Continuer — le bilan ».</Vide>
      )}

      <Carte>
        <TitreSection>Avant et pendant (facultatif)</TitreSection>
        <p className="mb-3 text-[0.9375rem] text-[var(--texte-secondaire)]">
          Utile quand l&apos;état d&apos;origine explique le prix, ou quand on découvre
          autre chose en ouvrant. Le locataire consulte ces photos avant de vous
          noter.
        </p>
        <div className="space-y-4">
          <PhotoChantier
            interventionId={interventionId}
            moment="avant"
            dejaEnvoyee={false}
            titre="Photo avant"
          />
          <PhotoChantier
            interventionId={interventionId}
            moment="pendant"
            dejaEnvoyee={false}
            titre="Photo pendant"
          />
        </div>
        <p className={`mt-3 ${CLASSE_AIDE}`}>
          Dix photos au maximum pour cette intervention.
        </p>
      </Carte>

      <Link href={`/artisan/missions/${interventionId}`} className={CLASSE_BOUTON_SOBRE}>
        Reprendre plus tard
      </Link>
    </div>
  );
}
