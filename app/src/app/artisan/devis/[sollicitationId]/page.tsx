import { notFound, redirect } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import { chargerFicheArtisan, chargerSollicitations, verifierAccesArtisan } from "../../acces";
import { jourCourt, libelle, NATURES_TRAVAUX } from "../../libelles";
import {
  Avertissement,
  Carte,
  Etiquette,
  LigneInfo,
  MarqueAgence,
  Retour,
  TitreSection,
} from "../../ui";
import { FormulaireDevis } from "./formulaire-devis";

export const metadata = { title: "Répondre à une demande — Espace artisan" };

/**
 * Répondre à une demande de devis.
 *
 * CE QUE L'ÉCRAN MONTRE EST EXACTEMENT CE QUE LA BASE REND : nature des
 * travaux, catégorie, description du désordre, commune, agence. Pas l'adresse
 * exacte, pas l'occupant — il chiffre un désordre, il n'a pas encore de
 * rendez-vous chez quelqu'un. L'adresse précise arrive avec la mission, s'il
 * est retenu.
 *
 * La décennale exigée est AFFICHÉE quand la nature des travaux la réclame
 * (RM-8.2.9) : il ne serait pas ici si la sienne n'était pas valide — le
 * filtre l'aurait écarté de la recherche — mais il doit savoir que la mission
 * en dépend, et qu'elle est REVÉRIFIÉE au moment où l'agence retient un devis.
 */
export default async function PageRepondreDevis(
  props: PageProps<"/artisan/devis/[sollicitationId]">
) {
  await verifierAccesArtisan();
  const { sollicitationId } = await props.params;

  const [{ fiche }, sollicitations] = await Promise.all([
    chargerFicheArtisan(),
    chargerSollicitations(),
  ]);
  const demande = sollicitations.lignes.find(
    (l) => l.sollicitation_id === sollicitationId
  );
  if (!demande) notFound();
  // Une demande close n'attend plus rien : la liste la montre, cet écran non.
  if (demande.statut !== "envoyee") redirect("/artisan/devis");

  // Trente jours : la validité par défaut du module 9, celle que la base
  // appliquerait si le champ restait vide.
  const dans30Jours = new Date();
  dans30Jours.setDate(dans30Jours.getDate() + 30);

  const decennaleManquante = demande.decennale_requise && fiche?.decennale_valide === false;

  return (
    <div className="space-y-5">
      <Retour href="/artisan/devis">Mes demandes</Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={demande.agence_nom} taille="grande" />
        {demande.urgence === "urgente" && <Etiquette ton="alerte">Urgent</Etiquette>}
      </div>

      <div>
        <h1 className="text-[1.375rem] leading-tight text-[var(--encre)]">
          {titreIncident(demande.categorie)}
        </h1>
        <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
          Demande reçue le {jourCourt(demande.envoyee_le)}
        </p>
      </div>

      <Carte>
        <TitreSection>Le désordre</TitreSection>
        <p className="text-base break-words text-[var(--corps)]">
          {demande.description || "Aucune description transmise."}
        </p>
        <div className="mt-2">
          <LigneInfo libelle="Nature des travaux">
            {libelle(NATURES_TRAVAUX, demande.nature_travaux)}
          </LigneInfo>
          <LigneInfo libelle="Où">
            {[demande.ville, demande.code_postal].filter(Boolean).join(" · ") ||
              "Commune non communiquée"}
          </LigneInfo>
          <LigneInfo libelle="Assurance décennale">
            {demande.decennale_requise ? "Exigée pour ces travaux" : "Non exigée"}
          </LigneInfo>
        </div>
        <p className="mt-3 text-[0.8125rem] text-[var(--texte-secondaire)]">
          L&apos;adresse exacte et le contact de l&apos;occupant vous sont communiqués si
          votre devis est retenu.
        </p>
      </Carte>

      {decennaleManquante && (
        <Avertissement>
          Ces travaux exigent une décennale valide, et la vôtre ne l&apos;est plus.
          Elle est revérifiée au moment où l&apos;agence retient un devis : mettez-la
          à jour, sinon le vôtre ne pourra pas être retenu.
        </Avertissement>
      )}

      <FormulaireDevis
        sollicitationId={sollicitationId}
        echeanceParDefaut={dans30Jours.toISOString().slice(0, 10)}
      />
    </div>
  );
}
