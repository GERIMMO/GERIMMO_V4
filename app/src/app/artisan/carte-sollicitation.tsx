import Link from "next/link";
import { titreIncident } from "@/lib/incidents";
import type { LigneSollicitation } from "./acces";
import {
  dateSimple,
  euros,
  jourCourt,
  libelle,
  NATURES_TRAVAUX,
  STATUTS_SOLLICITATION,
} from "./libelles";
import { Etiquette, MarqueAgence } from "./ui";

/**
 * Une demande de devis (9.2).
 *
 * Ce que la base lui donne, et rien d'autre : la nature des travaux, la
 * catégorie, la description du désordre, la COMMUNE — pas l'adresse exacte,
 * pas l'occupant, jamais le devis du concurrent. Ce n'est pas une pudeur
 * d'écran : c'est la projection de `mes_sollicitations` (module 8). Il chiffre
 * sur ce qu'on lui dit du désordre, il n'a pas encore de rendez-vous chez
 * quelqu'un.
 */
export function CarteSollicitation({ ligne }: { ligne: LigneSollicitation }) {
  const aChiffrer = ligne.statut === "envoyee";
  const ton =
    ligne.statut === "envoyee"
      ? "alerte"
      : ligne.statut === "retenue"
        ? "ok"
        : ligne.statut === "devis_depose"
          ? "encre"
          : "neutre";

  const contenu = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={ligne.agence_nom} />
        <Etiquette ton={ton}>{libelle(STATUTS_SOLLICITATION, ligne.statut)}</Etiquette>
      </div>

      <p className="mt-3 text-base font-medium text-[var(--corps)]">
        {titreIncident(ligne.categorie)}
        {ligne.urgence === "urgente" && (
          <span className="ml-2 align-middle">
            <Etiquette ton="alerte">Urgent</Etiquette>
          </span>
        )}
      </p>
      <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
        {libelle(NATURES_TRAVAUX, ligne.nature_travaux)}
        {ligne.decennale_requise ? " · décennale exigée" : ""}
        {ligne.ville ? ` · ${ligne.ville}` : ""}
        {ligne.code_postal ? ` (${ligne.code_postal})` : ""}
      </p>
      {ligne.description && (
        <p className="mt-2 line-clamp-3 text-[0.9375rem] break-words text-[var(--corps)]">
          {ligne.description}
        </p>
      )}

      {ligne.montant_ttc_cents !== null ? (
        <p className="mt-2.5 text-[0.9375rem] text-[var(--texte-secondaire)]">
          Votre devis : {euros(ligne.montant_ttc_cents)} TTC
          {ligne.valide_jusqu_au ? ` · valable jusqu'au ${dateSimple(ligne.valide_jusqu_au)}` : ""}
        </p>
      ) : (
        <p className="mt-2.5 text-[0.9375rem] text-[var(--texte-secondaire)]">
          Demande reçue le {jourCourt(ligne.envoyee_le)}
        </p>
      )}

      {aChiffrer && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[0.9375rem] font-medium text-[var(--or-texte)]">
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-current stroke-2">
            <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Répondre à cette demande
        </p>
      )}
    </>
  );

  // Seule une demande encore ouverte mène quelque part : une demande close
  // n'a pas d'écran, et un lien qui ne fait rien se clique quand même.
  if (!aChiffrer) {
    return (
      <div className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3.5 opacity-90">
        {contenu}
      </div>
    );
  }
  return (
    <Link
      href={`/artisan/devis/${ligne.sollicitation_id}`}
      className="block rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3.5 transition-colors hover:border-[var(--encre)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)]"
    >
      {contenu}
    </Link>
  );
}
