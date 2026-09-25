import { notFound, redirect } from "next/navigation";
import type { LigneDevis } from "@/lib/devis-structure";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, verifierAccesArtisan } from "../../../../acces";
import { euros } from "../../../../libelles";
import { EnteteSousPage, Erreur, Etiquette, MarqueAgence, Retour, Succes } from "../../../../ui";
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
  const { supabase } = await verifierAccesArtisan();
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
  // 25/09 (A12) : le renvoi dit pourquoi (`?raison=`) — silencieux, il
  // ramenait l'artisan à son point de départ sans un mot.
  if (mission.statut !== "en_cours") {
    redirect(`/artisan/missions/${interventionId}?raison=demarrer`);
  }
  if (!mission.photo_apres_deposee) {
    redirect(`/artisan/missions/${interventionId}/compte-rendu?raison=photo`);
  }

  const { data: budgetBrut, error: erreurBudget } = await supabase.rpc("mon_budget_intervention", { p_intervention: interventionId });
  const budget = budgetBrut as { plafond_cents: number | null; lignes: LigneDevis[]; avenants: {id: string; statut: string; motif: string; nouveau_montant_cents: number; decision_motif: string | null}[] } | null;

  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}/compte-rendu`}>
        La photo
      </Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Même taille de pastille que la fiche de mission (24/09). */}
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
        <Etiquette ton="encre">Étape 2 sur 2</Etiquette>
      </div>

      <EnteteSousPage
        titre="Le bilan"
        mention={`${titreIncident(mission.categorie)}${
          mission.montant_ttc_cents !== null
            ? ` · devis retenu ${euros(mission.montant_ttc_cents)} TTC`
            : ""
        }`}
      />

      <Succes>Photo du travail réalisé : envoyée.</Succes>

      {erreurBudget && <Erreur>Le budget autorisé n’a pas pu être relu. Rechargez cette page avant de terminer l’intervention.</Erreur>}
      {!erreurBudget && <FormulaireBilan
        interventionId={interventionId}
        montantDevisCents={budget?.plafond_cents ?? mission.montant_ttc_cents}
        lignesInitiales={budget?.lignes ?? []}
        avenants={budget?.avenants ?? []}
      />}
    </div>
  );
}
