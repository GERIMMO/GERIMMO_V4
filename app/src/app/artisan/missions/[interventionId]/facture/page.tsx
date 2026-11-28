import type { LigneDevis } from "@/lib/devis-structure";
import { clientDeService } from "@/lib/supabase/service";
import { LectureImpossibleArtisan } from "../../../ui";
import { notFound, redirect } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerAgenda, chargerFacturesRefusees, verifierAccesArtisan } from "../../../acces";
import { AvisFactureRefusee } from "../../facture-refusee";
import { euros } from "../../../libelles";
import { Carte, EnteteSousPage, LigneInfo, MarqueAgence, Retour, TitreSection } from "../../../ui";
import { AvertissementRendezVousAnticipe } from "../avertissement-rendez-vous";
import { FormulaireFacture } from "./formulaire-facture";
import { factureDeposable } from "./depot-possible";

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
  const { fiche } = await verifierAccesArtisan();
  const { interventionId } = await props.params;
  const agenda = await chargerAgenda();
  if (agenda.erreur) return <LectureImpossibleArtisan href={`/artisan/missions/${interventionId}/facture`} />;
  const mission = agenda.lignes.find((l) => l.intervention_id === interventionId);
  if (!mission) notFound();
  // Le renvoi dit pourquoi (`?raison=facture`, depot-possible.ts) : silencieux, il ramenait l'artisan à la fiche sans un mot.
  if (!factureDeposable(mission)) {
    redirect(`/artisan/missions/${interventionId}?raison=facture`);
  }

  // Audit palier 1 (P1-03) : si la facture précédente a été refusée, son motif se relit au moment de la corriger.
  const factureRefusee = (await chargerFacturesRefusees()).lignes.find((r) => r.intervention_id === interventionId);

  const service = clientDeService();
  const [profil, lienDevis] = await Promise.all([
    service?.from("artisan_profils_documents").select("adresse,mentions").eq("artisan_id", fiche.artisan_id).maybeSingle(),
    service?.from("incident_interventions").select("devis_id")
      .eq("id", interventionId).eq("organization_id", mission.organization_id).eq("artisan_id", fiche.artisan_id).maybeSingle(),
  ]);
  const devis = lienDevis?.data?.devis_id ? await service?.from("incident_devis").select("lignes")
    .eq("id", lienDevis.data.devis_id).eq("organization_id", mission.organization_id)
    .eq("artisan_id", fiche.artisan_id).maybeSingle() : null;
  const lignes = Array.isArray(devis?.data?.lignes) ? devis.data.lignes as LigneDevis[] : [];


  return (
    <div className="space-y-5">
      <Retour href={`/artisan/missions/${interventionId}`}>La mission</Retour>
      {/* Même ligne d'en-tête que la fiche de mission : la marque du client, puis le titre. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={mission.agence_nom} taille="grande" />
      </div>
      <EnteteSousPage
        titre={factureRefusee ? "Déposer une facture corrigée" : "Déposer ma facture"}
        mention={`${titreIncident(mission.categorie)} · ${mission.incident_numero}`}
      />
      {factureRefusee && <AvisFactureRefusee facture={factureRefusee} />}

      <Carte>
        <TitreSection>Montants de référence</TitreSection>
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

      {(!service || lienDevis?.error || devis?.error) && <p role="status">Les prestations du devis sont indisponibles. Vous pouvez les saisir à partir de votre exemplaire.</p>}
      <FormulaireFacture
        interventionId={interventionId}
        plafondCents={mission.montant_plafond_cents}
        devisCents={mission.montant_ttc_cents}
        lignesDevis={lignes}
        referenceDossier={mission.incident_numero}
        adresseEntreprise={profil?.data?.adresse ?? ""}
        mentionsEntreprise={profil?.data?.mentions ?? ""}
        lieuTravaux={[mission.adresse, mission.code_postal, mission.ville].filter(Boolean).join(" ")}
      />
    </div>
  );
}
