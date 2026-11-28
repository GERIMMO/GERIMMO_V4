import { prochaineActionIncident } from "@/lib/prochaine-action-incident";
import { BandeauProchaineAction } from "@/components/prochaine-action-incident";
import { LectureImpossibleArtisan } from "../../ui";
import { EchangesIntervention } from "@/components/echanges-intervention";
import { lireEtatDiscussion, phraseContactOccupant, type EtatDiscussion } from "@/lib/contact-occupant";
import { lireInterlocuteurLocataire } from "@/lib/interlocuteur-locataire-serveur";
import { AccuseAnnulation } from "./accuse-annulation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { mentionEtage } from "@/lib/etage";
import { ligneReglementPourArtisan, phraseEtatPourArtisan } from "@/lib/reglement-facture";
import { chargerAgenda, chargerCreneauxMission, chargerDemandesRdv, chargerFacturesRefusees, chargerPhotosDemande, chargerReglementsFactures, chargerRelancesFactures, chargerRendezVousManques, verifierAccesArtisan } from "../../acces";
import { formaterDateParis } from "@/lib/heure-paris";
import { FormulaireRendezVousManque } from "./rendez-vous-manque";
import { RelanceFacture } from "./relance-facture";
import { AvisFactureRefusee } from "../facture-refusee";
import { libelleMotifRdv, instantRdv } from "@/lib/rendez-vous-locataire";
import { PhotosDeLaDemande } from "../../photos-demande";
import {
  creneauTexte,
  euros,
  libelle,
  NATURES_TRAVAUX,
  STATUTS_MISSION,
} from "../../libelles";
import {
  Avertissement,
  Erreur,
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
import { AvertissementRendezVousAnticipe } from "./avertissement-rendez-vous";
import { BoutonDemarrer } from "./bouton-demarrer";
import { DatesLocataire } from "./dates-locataire";
import { raisonRetourFacture } from "./facture/depot-possible";

export const metadata = { title: "Ma mission" };

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
  const { supabase } = await verifierAccesArtisan();
  const { interventionId } = await props.params;
  const { termine, de, raison } = await props.searchParams;
  // Le retour ramène d'où l'on vient : la même carte s'ouvre depuis
  // « Aujourd'hui » et depuis l'agenda (tour du 24/09).
  const depuisAujourdhui = de === "aujourdhui";

  // D16 (14/10) : les photos jointes par le locataire, que la base ne rend que pour une mission encore vivante.
  // D23 : le règlement que le client déclare sur la facture de cette mission (date et moyen seulement).
  // D22 : la dernière demande du locataire sur ce rendez-vous (report ou annulation).
  // P2-04 : les rendez-vous manqués de cette mission, et l'état de relance de ses factures.
  const [agenda, photos, reglements, demandesRdv, refusees, rdvManques, relances] = await Promise.all([
    chargerAgenda(),
    chargerPhotosDemande(null, interventionId),
    chargerReglementsFactures(),
    chargerDemandesRdv(),
    chargerFacturesRefusees(),
    chargerRendezVousManques(interventionId),
    chargerRelancesFactures(),
  ]);
  if (agenda.erreur) return <LectureImpossibleArtisan href={`/artisan/missions/${interventionId}`} />;
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();
  // Phase 3, reprise du lot 49 : l'étage suit la règle des documents et des autres écrans (lib/etage.ts) : « 1er » s'affiche
  // « 1er étage », et n'est pas redit quand le nom du lot le nomme déjà. L'écran affichait « Duplex RDC et 1er étage · 1er ».
  const etage = mentionEtage(mission.etage, mission.lot_nom);
  // Reprise du lot 48 (U08) : l'en-tête de la discussion nommait le « Propriétaire » à l'artisan d'une mission d'agence, dont
  // l'interlocuteur est le gestionnaire. Le type de l'espace client se lit dans `organisations_portail`, déjà ouverte à
  // l'artisan membre de l'espace (aucun droit nouveau) ; illisible, l'en-tête reste celui d'avant (« Propriétaire »).
  const interlocuteur = await lireInterlocuteurLocataire(supabase, mission.organization_id);
  // Audit palier 1 (P1-03) : la facture EN VIGUEUR de la mission ; une facture refusée se lit à part, tant qu'aucune
  // autre ne l'a remplacée (la plus récente d'abord).
  const factureReglement = reglements.lignes.find((r) => r.intervention_id === interventionId && r.etat !== "refusee");
  const factureRefusee = mission.facture_deposee ? undefined : refusees.lignes.find((r) => r.intervention_id === interventionId);
  // Décision D22 : un report en attente se traite ici (retenir une de ses dates, ou refuser) ; une annulation s'affiche
  // pour information tant qu'aucun nouveau rendez-vous n'est fixé.
  const demandeRdv = demandesRdv.lignes.find((d) => d.intervention_id === interventionId) ?? null;
  // P2-04 : l'heure du rendez-vous confirmé est passée sans que la mission ait démarré.
  const rendezVousPasse = mission.statut === "planifiee" && Boolean(mission.debut_prevu) && new Date(mission.debut_prevu!).getTime() <= new Date().getTime();
  const relance = factureReglement ? relances.lignes.find((r) => r.facture_id === factureReglement.facture_id) : undefined;
  const reportEnAttente =
    mission.statut === "planifiee" && demandeRdv?.type === "report" && demandeRdv.statut === "en_attente" ? demandeRdv : null;
  const annulationLocataire =
    mission.statut === "acceptee" && mission.creneaux_en_attente === 0 && demandeRdv?.type === "annulation" ? demandeRdv : null;

  const vivante = ["acceptee", "planifiee", "en_cours"].includes(mission.statut);
  // Des dates sont chez le locataire : rien n'attend l'artisan, et reproposer
  // annulerait ces dates (RM-10.4.1). Même lecture que la carte de l'agenda.
  const attendLocataire = mission.statut === "acceptee" && mission.creneaux_en_attente > 0;
  // Audit 27/09 : le locataire a répondu par ses propres dates — c'est
  // l'artisan qui doit trancher (A5 : confirmé ou arbitrage).
  const repondreLocataire =
    mission.statut === "acceptee" && mission.dates_locataire_en_attente > 0;
  // Les dates elles-mêmes, et plus seulement leur nombre : l'artisan doit
  // garder les siennes libres jusqu'à la réponse (audit du 27/09).
  const creneaux =
    attendLocataire || repondreLocataire || reportEnAttente
      ? await chargerCreneauxMission(mission.intervention_id)
      : { lignes: [], erreur: false };
  const mesDates = creneaux.lignes.filter(
    (c) => c.statut === "propose" && c.propose_par === "artisan"
  );
  const datesLocataire = creneaux.lignes.filter(
    (c) => c.statut === "propose" && c.propose_par === "locataire"
  );
  // L'itinéraire n'est un bouton que lorsqu'on s'y rend : avant le
  // rendez-vous, un bouton de 56 px en tête de fiche prenait la place du
  // geste attendu (24/09).
  const surLeDepart = mission.statut === "planifiee" || mission.statut === "en_cours";
  const occupant = [mission.occupant_prenom, mission.occupant_nom]
    .filter(Boolean)
    .join(" ");
  // Reprise du lot 60 (R2) : lue seulement quand la carte « Sur place » doit écrire où laisser un message.
  const discussion: EtatDiscussion = vivante && occupant && !mission.occupant_telephone ? await lireEtatDiscussion(supabase, interventionId) : "fermee";
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

      {demandesRdv.erreur && <Erreur>Les demandes de changement de rendez-vous n’ont pas pu être chargées. Rechargez la page avant de modifier les dates.</Erreur>}
      {termine && mission.statut === "terminee" && mission.compte_rendu_depose && (
        <Succes>
          Compte rendu enregistré. L&apos;intervention est terminée : vous pouvez
          déposer votre facture.
        </Succes>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
        <Etiquette
          ton={
            repondreLocataire
              ? "alerte"
              : attendLocataire
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
          {repondreLocataire
            ? "Dates du locataire à confirmer"
            : attendLocataire
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
      <BandeauProchaineAction action={prochaineActionIncident(
        mission.statut === "terminee" ? "termine" : "affecte",
        { statut: mission.statut, date: mission.debut_prevu, attendLocataire: mission.creneaux_en_attente > 0 && mission.dates_locataire_en_attente === 0 },
        mission.agence_nom,
      )} />

      {/* 25/09 (A12) : renvoyé du bilan sans avoir démarré, l'artisan lisait
          la même fiche sans un mot. La raison du retour s'écrit — sous
          l'en-tête, juste au-dessus du geste qu'elle annonce (nuit du 25/09 :
          posée avant le titre, elle faisait un second bandeau). */}
      {raison === "demarrer" && mission.statut !== "en_cours" && (
        <Avertissement>
          Le bilan ne s&apos;ouvre qu&apos;une fois l&apos;intervention démarrée : le
          bouton est ci-dessous.
        </Avertissement>
      )}
      {/* Même règle pour la facture (relevé du 26/11) : renvoyé de /facture, l'artisan lit pourquoi. */}
      {raison === "facture" && raisonRetourFacture(mission) && <Avertissement>{raisonRetourFacture(mission)}</Avertissement>}

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
        // Le filet d'état ne reste que si un geste est attendu (dates à reproposer, lecture à vérifier) :
        // quand le locataire choisit, c'est une information.
        <Carte className={creneaux.erreur || mesDates.length === 0 ? "border-l-4 border-l-[var(--warning)]" : undefined}>
          <TitreSection>
            {creneaux.erreur ? "Disponibilité à vérifier" : mesDates.length ? "Le locataire choisit un créneau" : "Proposez de nouvelles dates"}
          </TitreSection>
          {!creneaux.erreur && (
            <p className="text-base text-[var(--corps)]">
              {mesDates.length
                ? "Le locataire peut choisir parmi les dates ci-dessous. Gardez-les libres jusqu’à sa réponse."
                : "Aucun des créneaux proposés n’est encore disponible dans votre agenda."}
            </p>
          )}
          {mesDates.length > 0 && (
            <ul className="mt-2 space-y-1">
              {mesDates.map((c) => (
                <li key={c.creneau_id} className="text-base font-medium text-[var(--corps)]">
                  {creneauTexte(c.debut, c.fin)}
                </li>
              ))}
            </ul>
          )}
          {creneaux.erreur && (
            <p className={`mt-2 ${CLASSE_AIDE}`}>Le détail des dates n&apos;a pas pu être chargé.</p>
          )}
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

      {repondreLocataire && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>Le locataire vous propose d&apos;autres dates</TitreSection>
          <p className="mb-3 text-base text-[var(--corps)]">
            Aucune de vos dates ne lui convenait. Retenez l&apos;une des siennes, ou
            refusez-les : le gérant fixera alors le rendez-vous.
          </p>
          {creneaux.erreur ? (
            <p className={CLASSE_AIDE}>
              Les dates du locataire n&apos;ont pas pu être chargées. Rechargez la page.
            </p>
          ) : (
            <DatesLocataire
              interventionId={mission.intervention_id}
              dates={datesLocataire.map(({ creneau_id, debut, fin }) => ({ creneau_id, debut, fin }))}
            />
          )}
        </Carte>
      )}

      {mission.statut === "acceptee" && !attendLocataire && !repondreLocataire && (
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

      {/* Décision D22 : le locataire demande à reporter. Son rendez-vous tient tant que l'artisan n'a pas répondu ;
          retenir une de ses dates déplace le rendez-vous, refuser le maintient (le gérant arbitre). */}
      {reportEnAttente && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>Le locataire demande un report</TitreSection>
          <p className="text-base text-[var(--corps)]">
            Il ne pourra pas être présent au rendez-vous prévu. Motif&nbsp;: {libelleMotifRdv(reportEnAttente.motif_code)}
            {reportEnAttente.motif_texte ? ` — « ${reportEnAttente.motif_texte} »` : ""}.
          </p>
          <p className={`mt-1 mb-3 ${CLASSE_AIDE}`}>
            Le rendez-vous actuel reste valable tant que vous n&apos;avez pas répondu
            {reportEnAttente.expire_le ? ` (au plus tard ${instantRdv(reportEnAttente.expire_le)})` : ""}. Sans
            réponse, il est maintenu et le gérant est prévenu.
          </p>
          {creneaux.erreur ? (
            <p className={CLASSE_AIDE}>
              Les dates du locataire n&apos;ont pas pu être chargées. Rechargez la page.
            </p>
          ) : (
            <DatesLocataire
              interventionId={mission.intervention_id}
              dates={datesLocataire.map(({ creneau_id, debut, fin }) => ({ creneau_id, debut, fin }))}
            />
          )}
        </Carte>
      )}

      {/* Décision D22 (variante B) : l'annulation a pris effet ; c'est une information, sans geste bloquant. */}
      {annulationLocataire && (
        <Avertissement>
          Le locataire a annulé le rendez-vous {instantRdv(annulationLocataire.rdv_debut)}. Motif&nbsp;:{" "}
          {libelleMotifRdv(annulationLocataire.motif_code)}
          {annulationLocataire.motif_texte ? ` — « ${annulationLocataire.motif_texte} »` : ""}. Ne vous déplacez pas à
          cette date ; la mission reste à vous&nbsp;: proposez de nouveaux créneaux.
          <AccuseAnnulation demandeId={annulationLocataire.demande_id} interventionId={interventionId} vueLe={annulationLocataire.annulation_vue_le ?? null} />
        </Avertissement>
      )}

      {mission.statut === "planifiee" && (
        <div className="space-y-3">
          {/* D20 (ART-21) : démarrer plus de 2 h avant le rendez-vous confirmé reste possible ; on le dit. */}
          <AvertissementRendezVousAnticipe debutPrevu={mission.debut_prevu} finPrevue={mission.fin_prevue} geste="demarrer" />
          <BoutonDemarrer interventionId={mission.intervention_id} />
          {/* Pendant une demande de report, on répond à la demande (ci-dessus) : la base refuse de « déplacer » à côté. */}
          {!reportEnAttente && (
            <Link
              href={`/artisan/missions/${mission.intervention_id}/creneaux`}
              className={CLASSE_BOUTON_SECONDAIRE}
            >
              Déplacer le rendez-vous
            </Link>
          )}
          {/* P2-04 (RM-10.5.3) : l'heure est passée ; si le locataire n'était pas là, on le consigne. */}
          {rendezVousPasse && !reportEnAttente && (
            <details className="artisan-carte" data-rdv-passe>
              <summary className="min-h-11 cursor-pointer content-center text-base font-semibold text-[var(--encre)]">
                Le locataire était absent au rendez-vous ?
              </summary>
              <div className="pt-3">
                <FormulaireRendezVousManque interventionId={mission.intervention_id} />
              </div>
            </details>
          )}
        </div>
      )}

      {/* P2-04 : ce qui a été consigné sur les rendez-vous de cette mission, pour l'un comme pour l'autre. */}
      {rdvManques.erreur && <Erreur>Les rendez-vous manqués de cette mission n’ont pas pu être lus : rechargez la page.</Erreur>}
      {rdvManques.lignes.length > 0 && (
        <Carte>
          <TitreSection>Rendez-vous manqués</TitreSection>
          <ul className="space-y-2" data-rdv-manques>
            {rdvManques.lignes.map((r) => (
              <li key={r.rdv_debut} className="text-base text-[var(--corps)]" data-absent={r.absent}>
                {creneauTexte(r.rdv_debut, null)} —{" "}
                {r.absent === "locataire"
                  ? r.consigne_role === "artisan"
                    ? "vous avez indiqué que le locataire était absent."
                    : "votre client a indiqué que le locataire était absent."
                  : "votre client a indiqué que vous ne vous êtes pas présenté."}
                {r.note ? ` « ${r.note} »` : ""}
              </li>
            ))}
          </ul>
          {rdvManques.lignes.some((r) => r.absent === "artisan") && (
            <p className={`mt-2 ${CLASSE_AIDE}`}>
              Une absence qui vous est attribuée est comptée dans vos rendez-vous manqués, un repère visible de vous
              seul (« Mes évaluations »). Si elle est inexacte, écrivez à votre client dans la discussion de la mission.
            </p>
          )}
        </Carte>
      )}

      {mission.statut === "en_cours" && (
        <div className="space-y-3">
          <AvertissementRendezVousAnticipe debutPrevu={mission.debut_prevu} finPrevue={mission.fin_prevue} geste="terminer" />
          <Link
            href={`/artisan/missions/${mission.intervention_id}/compte-rendu`}
            className={CLASSE_BOUTON_PRINCIPAL}
          >
            Rendre compte du travail
          </Link>
          <p className={CLASSE_AIDE}>
            Deux écrans : la photo du travail réalisé, puis ce que vous avez
            fait. Sans le compte rendu, l&apos;intervention ne peut pas être
            terminée ; vous pourrez ensuite déposer votre facture.
          </p>
        </div>
      )}

      {/* Où aller — en gros, et cliquable : sur un chantier, on ouvre l'itinéraire. */}
      <Carte>
        <TitreSection>Où</TitreSection>
        <p className="text-base break-words text-[var(--corps)]">
          {adresse || "Adresse communiquée par votre interlocuteur"}
        </p>
        {(mission.lot_nom || etage || mission.piece) && (
          <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
            {[mission.lot_nom, etage, mission.piece].filter(Boolean).join(" · ")}
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
          {mission.montant_plafond_cents !== null &&
            mission.montant_plafond_cents !== mission.montant_ttc_cents && (
              <LigneInfo libelle="Avenant accepté">
                {euros(mission.montant_plafond_cents)} TTC
              </LigneInfo>
            )}
        </div>
      </Carte>

      <PhotosDeLaDemande photos={photos.photos} erreur={photos.erreur} base={`/artisan/missions/${mission.intervention_id}/photos`} />

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
          {/* Phase 3, lot 60 (E005) : sans numéro, la carte promettait un « contact ouvert » qu'elle ne donnait pas.
              Elle dit ce qui manque et où écrire ; la base décide toujours seule de ce qu'elle rend. */}
          {/* Reprise du lot 60 (R2) : la phrase ne renvoie à la discussion que si elle est ouverte et lisible, et dit qui la lit
              (lib/contact-occupant.ts). */}
          <p className={`mt-2 ${CLASSE_AIDE}`} data-contact-occupant={mission.occupant_telephone ? "telephone" : "nom-seul"} data-discussion={discussion}>
            {phraseContactOccupant({ telephone: mission.occupant_telephone, discussion })}
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
            <LigneInfo libelle="Facture">
              {mission.facture_deposee ? "Déposée" : factureRefusee ? "Refusée : à corriger" : "À déposer"}
            </LigneInfo>
            {mission.facture_deposee && factureReglement && <LigneInfo libelle={`Facture n° ${factureReglement.numero}`}>{euros(factureReglement.montant_ttc_cents)} TTC</LigneInfo>}
            {mission.facture_deposee && (
              <LigneInfo libelle="Règlement">
                {reglements.erreur
                  ? "État non lu : rechargez la page"
                  : factureReglement
                    ? phraseEtatPourArtisan(factureReglement)
                    : "Déposée, en attente de contrôle"}
              </LigneInfo>
            )}
          </div>
          {factureReglement && factureReglement.reglements.length > 0 && (
            <ul className={`mt-2 space-y-1 ${CLASSE_AIDE}`}>
              {factureReglement.reglements.map((r, i) => (
                <li key={`${r.date_reglement}-${i}`}>{ligneReglementPourArtisan(r)}</li>
              ))}
            </ul>
          )}
          {factureReglement && factureReglement.reglements.length > 0 && (
            <p className={`mt-1 ${CLASSE_AIDE}`}>
              Déclaration de votre client, sans virement de Gerimmo : vérifiez la réception sur votre compte.
            </p>
          )}
          {/* P2-04 : la relance d'une facture déposée et pas réglée en totalité. */}
          {mission.facture_deposee && factureReglement && relances.erreur && <p className={`mt-2 ${CLASSE_AIDE}`}>L’état de relance de cette facture n’a pas pu être lu : rechargez la page.</p>}
          {mission.facture_deposee && factureReglement && relance && (
            <div className="mt-3 space-y-2" data-etat-relance>
              {relance.relancee_le && (
                <p className={CLASSE_AIDE}>
                  Relancée le {formaterDateParis(relance.relancee_le)}{relance.relances > 1 ? ` (${relance.relances} relances)` : ""}.
                </p>
              )}
              {relance.relancable ? (
                <RelanceFacture factureId={factureReglement.facture_id} interventionId={mission.intervention_id} numero={factureReglement.numero} />
              ) : (
                <p className={CLASSE_AIDE}>
                  {relance.relancee_le ? "Prochaine relance possible" : "Relance possible"} à partir du {formaterDateParis(relance.relance_possible_le)}
                  {relance.relancee_le ? "." : " (30 jours après le dépôt)."}
                </p>
              )}
            </div>
          )}
          {factureRefusee && <div className="mt-3"><AvisFactureRefusee facture={factureRefusee} /></div>}
          {!mission.facture_deposee && refusees.erreur && <p className={`mt-2 ${CLASSE_AIDE}`}>Les refus éventuels de votre client n’ont pas pu être lus : rechargez la page.</p>}
          {!mission.facture_deposee && mission.compte_rendu_depose && mission.photo_apres_deposee ? (
            <Link
              href={`/artisan/missions/${mission.intervention_id}/facture`}
              className={`${CLASSE_BOUTON_PRINCIPAL} mt-3`}
            >
              {factureRefusee ? "Déposer une facture corrigée" : "Déposer ma facture"}
            </Link>
          ) : (
            <Link
              href="/artisan/facturation"
              className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            >
              Voir ma facturation
            </Link>
          )}
        </Carte>
      )}
      <EchangesIntervention intervention={interventionId} interlocuteur={interlocuteur} />
    </div>
  );
}
