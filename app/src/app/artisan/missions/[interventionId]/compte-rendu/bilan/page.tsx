import { notFound, redirect } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../../../../acces";
import { euros } from "../../../../libelles";
import { Etiquette, MarqueAgence, Retour, Succes } from "../../../../ui";
import { FormulaireBilan } from "./formulaire-bilan";

export const metadata = { title: "Le bilan — Espace artisan" };

/**
 * COMPTE RENDU — ÉCRAN 2 SUR 2 (RM-19.3.1).
 *
 * Cet écran ne s'ouvre pas tant que la photo « après » n'est pas partie :
 * `deposer_compte_rendu` la réclame avant d'écrire quoi que ce soit, et un
 * déclencheur de table refuse de toute façon le passage à « terminée » sans
 * elle. Laisser taper six champs pour se faire refuser à l'envoi, sur un
 * chantier, serait exactement ce que le module 19 cherche à éviter — on
 * renvoie donc à l'étape 1 plutôt que d'afficher un formulaire condamné.
 */
export default async function PageBilan(
  props: PageProps<"/artisan/missions/[interventionId]/compte-rendu/bilan">
) {
  await verifierAccesArtisan();
  const { interventionId } = await props.params;

  const agenda = await chargerAgenda();
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();

  if (mission.compte_rendu_depose || mission.statut === "terminee") {
    redirect(`/artisan/missions/${interventionId}`);
  }
  // La base refuse le compte rendu tant que l'intervention n'est pas démarrée
  // (« Démarrez l'intervention avant d'en rendre compte »). Or la photo
  // « après » s'accepte dès `acceptee` : sans ce renvoi, l'artisan remplissait
  // les quatre champs du bilan pour se faire refuser à l'envoi. Constat du
  // 11/09 — on le renvoie là où se trouve le bouton « Démarrer ».
  if (mission.statut !== "en_cours") {
    redirect(`/artisan/missions/${interventionId}`);
  }
  if (!mission.photo_apres_deposee) {
    redirect(`/artisan/missions/${interventionId}/compte-rendu`);
  }

  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}/compte-rendu`}>
        La photo
      </Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} />
        <Etiquette ton="encre">Étape 2 sur 2</Etiquette>
      </div>

      <div>
        <h1 className="text-[1.375rem] leading-tight text-[var(--encre)]">Le bilan</h1>
        <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
          {titreIncident(mission.categorie)}
          {mission.montant_ttc_cents !== null
            ? ` · devis retenu ${euros(mission.montant_ttc_cents)} TTC`
            : ""}
        </p>
      </div>

      <Succes>Photo du travail réalisé : envoyée.</Succes>

      <FormulaireBilan
        interventionId={interventionId}
        montantDevisCents={mission.montant_ttc_cents}
      />
    </div>
  );
}
