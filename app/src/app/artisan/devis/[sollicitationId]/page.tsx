import Link from "next/link";
import { notFound } from "next/navigation";
import { titreIncident } from "@/lib/incidents";
import {
  chargerFicheArtisan,
  chargerSollicitations,
  verifierAccesArtisan,
  type LigneSollicitation,
} from "../../acces";
import {
  dateSimple,
  euros,
  jourCourt,
  libelle,
  NATURES_TRAVAUX,
  STATUTS_SOLLICITATION,
} from "../../libelles";
import {
  Avertissement,
  Carte,
  CLASSE_AIDE,
  EnteteSousPage,
  Etiquette,
  LigneInfo,
  MarqueAgence,
  Retour,
  TitreSection,
} from "../../ui";
import { FormulaireDevis } from "./formulaire-devis";

/** Le titre suit l'écran : un formulaire de réponse, ou le récapitulatif d'une demande close. */
export async function generateMetadata(
  props: PageProps<"/artisan/devis/[sollicitationId]">
) {
  const { sollicitationId } = await props.params;
  const sollicitations = await chargerSollicitations();
  const demande = sollicitations.lignes.find((l) => l.sollicitation_id === sollicitationId);
  return {
    title: `${demande && demande.statut !== "envoyee" ? "Demande de devis" : "Répondre à une demande"} — Espace artisan`,
  };
}

const TON_STATUT: Record<LigneSollicitation["statut"], "alerte" | "ok" | "encre" | "neutre"> = {
  envoyee: "alerte",
  retenue: "ok",
  devis_depose: "encre",
  declinee: "neutre",
  non_retenue: "neutre",
  expiree: "neutre",
  annulee: "neutre",
};

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
  // Une demande close n'attend plus rien, mais elle se relit : la liste la
  // montre coupée à trois lignes, et y renvoyer laissait l'artisan sans moyen
  // de lire la description entière ni de retrouver son devis (tour du 24/09).
  const close = demande.statut !== "envoyee";

  // Trente jours : la validité par défaut du module 9, celle que la base
  // appliquerait si le champ restait vide.
  const dans30Jours = new Date();
  dans30Jours.setDate(dans30Jours.getDate() + 30);

  const decennaleManquante = demande.decennale_requise && fiche?.decennale_valide === false;

  return (
    <div className="space-y-5">
      <Retour href="/artisan/devis">Demandes de devis</Retour>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={demande.agence_nom} taille="grande" />
        <span className="flex flex-wrap items-center gap-2">
          {demande.urgence === "urgente" && <Etiquette ton="alerte">Urgent</Etiquette>}
          {close && (
            <Etiquette ton={TON_STATUT[demande.statut]}>
              {libelle(STATUTS_SOLLICITATION, demande.statut)}
            </Etiquette>
          )}
        </span>
      </div>

      <EnteteSousPage
        titre={titreIncident(demande.categorie)}
        mention={`Demande reçue le ${jourCourt(demande.envoyee_le)}`}
      />

      {/* « Quoi », comme sur la fiche de mission (Où / Quoi / Sur place) :
          « Le désordre » est un mot d'expert d'assurance (24/09). */}
      <Carte>
        <TitreSection>Quoi</TitreSection>
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
        {!close && (
          <p className={`mt-3 ${CLASSE_AIDE}`}>
            L&apos;adresse exacte et le contact de l&apos;occupant vous sont communiqués si
            votre devis est retenu.
          </p>
        )}
      </Carte>

      {close ? (
        <Carte>
          <TitreSection>Ma réponse</TitreSection>
          {/* L'état est l'étiquette de l'en-tête ; ici, ce qu'il a répondu. */}
          <div>
            {demande.montant_ttc_cents !== null && (
              <LigneInfo libelle="Montant">{euros(demande.montant_ttc_cents)} TTC</LigneInfo>
            )}
            {demande.valide_jusqu_au && (
              <LigneInfo libelle="Valable jusqu'au">{dateSimple(demande.valide_jusqu_au)}</LigneInfo>
            )}
          </div>
          {demande.montant_ttc_cents !== null ? (
            <a
              href={`/api/devis/${demande.sollicitation_id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            >
              Ouvrir le détail de mon devis (PDF)
            </a>
          ) : (
            <p className={`mt-3 ${CLASSE_AIDE}`}>
              Aucun devis n&apos;a été envoyé pour cette demande.
            </p>
          )}
        </Carte>
      ) : (
        <>
          {decennaleManquante && (
            <Avertissement>
              Ces travaux exigent une décennale valide, et la vôtre ne l&apos;est plus.
              Elle est revérifiée au moment où l&apos;agence retient un devis :{" "}
              <Link href="/artisan/attestations" className="font-semibold underline underline-offset-4">
                mettez-la à jour
              </Link>
              , sinon le vôtre ne pourra pas être retenu.
            </Avertissement>
          )}

          <FormulaireDevis
            sollicitationId={sollicitationId}
            echeanceParDefaut={dans30Jours.toISOString().slice(0, 10)}
          />
        </>
      )}
    </div>
  );
}
