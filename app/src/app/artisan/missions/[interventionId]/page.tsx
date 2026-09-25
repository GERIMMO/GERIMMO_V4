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
  Avertissement,
  Carte,
  CLASSE_AIDE,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_SECONDAIRE,
  EnteteSousPage,
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
  const { termine, de, raison } = await props.searchParams;
  // Le retour ramène d'où l'on vient : la même carte s'ouvre depuis
  // « Aujourd'hui » et depuis l'agenda (tour du 24/09).
  const depuisAujourdhui = de === "aujourdhui";

  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();

  const vivante = ["acceptee", "planifiee", "en_cours"].includes(mission.statut);
  // Des dates sont chez le locataire : rien n'attend l'artisan, et reproposer
  // annulerait ces dates (RM-10.4.1). Même lecture que la carte de l'agenda.
  const attendLocataire = mission.statut === "acceptee" && mission.creneaux_en_attente > 0;
  // L'itinéraire n'est un bouton que lorsqu'on s'y rend : avant le
  // rendez-vous, un bouton de 56 px en tête de fiche prenait la place du
  // geste attendu (24/09).
  const surLeDepart = mission.statut === "planifiee" || mission.statut === "en_cours";
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
      {depuisAujourdhui ? (
        <Retour href="/artisan">Aujourd&apos;hui</Retour>
      ) : (
        <Retour href="/artisan/agenda">Mon agenda</Retour>
      )}

      {termine && (
        <Succes>
          Compte rendu envoyé. L&apos;intervention est terminée et l&apos;agence peut
          facturer.
        </Succes>
      )}

      {/* 25/09 (A12) : renvoyé du bilan sans avoir démarré, l'artisan lisait
          la même fiche sans un mot. La raison du retour s'écrit. */}
      {raison === "demarrer" && mission.statut !== "en_cours" && (
        <Avertissement>
          Le bilan ne s&apos;ouvre qu&apos;une fois l&apos;intervention démarrée : le
          bouton est ci-dessous.
        </Avertissement>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
        <Etiquette
          ton={
            attendLocataire
              ? "attente"
              : mission.statut === "proposee"
                ? "alerte"
                : mission.statut === "terminee"
                  ? "ok"
                  : mission.statut === "en_cours"
                    ? "attente"
                    : "encre"
          }
        >
          {attendLocataire
            ? "En attente du locataire"
            : libelle(STATUTS_MISSION, mission.statut)}
        </Etiquette>
      </div>

      {/* Le créneau ne s'écrit que s'il existe : sans lui, l'étiquette dit
          déjà « rendez-vous à fixer », 40 px plus haut (24/09). */}
      <EnteteSousPage titre={titreIncident(mission.categorie)}>
        {mission.debut_prevu && (
          <p className="mt-1 text-[1.0625rem] font-medium text-[var(--corps)]">
            {creneauTexte(mission.debut_prevu, mission.fin_prevue)}
          </p>
        )}
        {mission.urgence === "urgente" && (
          <p className="mt-2">
            <Etiquette ton="alerte">Urgent</Etiquette>
          </p>
        )}
      </EnteteSousPage>

      {/* Le geste attendu maintenant, sous le titre : rendu en bas, sous
          « Où », « Quoi » et « Sur place », il n'apparaissait qu'en faisant
          défiler (tour du 24/09). */}
      {mission.statut === "proposee" && (
        <AccepterOuRefuser interventionId={mission.intervention_id} />
      )}

      {/* 25/09 (A10) : l'état d'abord — rien n'attend l'artisan, le
          locataire choisit. Les deux gestes possibles restent, en liens
          discrets : deux boutons de même poids laissaient croire qu'il
          fallait faire quelque chose. */}
      {mission.statut === "acceptee" && attendLocataire && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>Rien à faire pour l&apos;instant : le locataire choisit</TitreSection>
          <p className="text-base text-[var(--corps)]">
            {mission.creneaux_en_attente} date{mission.creneaux_en_attente > 1 ? "s" : ""}{" "}
            proposée{mission.creneaux_en_attente > 1 ? "s" : ""} au locataire. Vous serez
            prévenu de son choix.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
            <Link
              href={`/artisan/missions/${mission.intervention_id}/creneaux`}
              className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            >
              Proposer d&apos;autres créneaux
            </Link>
            <BoutonDemarrer interventionId={mission.intervention_id} sansRendezVous discret />
          </div>
          <p className={`mt-1 ${CLASSE_AIDE}`}>
            Proposer d&apos;autres dates annule celles en attente ; démarrer sans
            rendez-vous n&apos;a de sens que pour un dépannage sans attendre.
          </p>
        </Carte>
      )}

      {mission.statut === "acceptee" && !attendLocataire && (
        <div className="space-y-3">
          <Link
            href={`/artisan/missions/${mission.intervention_id}/creneaux`}
            className={CLASSE_BOUTON_PRINCIPAL}
          >
            Proposer des créneaux
          </Link>
          <p className={CLASSE_AIDE}>
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
            Déplacer le rendez-vous
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
          <p className={CLASSE_AIDE}>
            Deux écrans : la photo du travail réalisé, puis ce que vous avez
            fait. Sans le compte rendu, l&apos;intervention ne peut pas être
            terminée — et sans elle, l&apos;agence ne peut pas facturer.
          </p>
        </div>
      )}

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
        {/* Un appui, l'itinéraire : c'est le geste que l'artisan fait de toute
            façon, en recopiant l'adresse à la main dans son téléphone. `rel`
            coupe le référent — le service de cartes reçoit l'adresse que
            l'artisan lui donne, jamais l'écran d'où il vient.
            À CONFIRMER (signalé au rapport de lot) : le choix du fournisseur de
            cartes est un appel à un tiers, et aucune source du wiki ne le
            tranche. Il tient en une ligne, ici. */}
        {adresse && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={
              surLeDepart
                ? `${CLASSE_BOUTON_SECONDAIRE} mt-3`
                : "mt-2 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            }
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
          <p className={`mt-2 ${CLASSE_AIDE}`}>
            Ce contact vous est ouvert le temps de la mission, et refermé à la fin.
          </p>
        </Carte>
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
