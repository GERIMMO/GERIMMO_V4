import Link from "next/link";
import { titreIncident } from "@/lib/incidents";
import type { LigneAgenda } from "./acces";
import { creneauTexte, STATUTS_MISSION, libelle } from "./libelles";
import { Etiquette, MarqueAgence } from "./ui";

/**
 * Une intervention, telle qu'elle se lit d'un coup d'œil sur un chantier.
 *
 * L'ordre de lecture est celui de la question qu'on se pose en marchant :
 * POUR QUI (la marque de l'agence, RM-19.3.3 — son agenda mélange les agences,
 * et il doit savoir pour qui il travaille à 14 h), QUAND, QUOI, OÙ. L'état
 * vient en dernier : il se déduit déjà du reste.
 *
 * La carte entière est le lien — viser un « Ouvrir » de 14 px avec des gants
 * ne marche pas.
 */
export function CarteMission({
  ligne,
  aFaire,
}: {
  ligne: LigneAgenda;
  /** Ce que la mission attend de lui, en toutes lettres. Rien si elle n'attend rien. */
  aFaire?: string;
}) {
  const planifiee = Boolean(ligne.debut_prevu);
  const ton =
    ligne.statut === "proposee"
      ? "alerte"
      : ligne.statut === "en_cours"
        ? "attente"
        : ligne.statut === "terminee"
          ? "ok"
          : "encre";

  return (
    <Link
      href={`/artisan/missions/${ligne.intervention_id}`}
      className="block rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3.5 transition-colors hover:border-[var(--encre)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MarqueAgence nom={ligne.agence_nom} />
        <Etiquette ton={ton}>{libelle(STATUTS_MISSION, ligne.statut)}</Etiquette>
      </div>

      <p
        className={`mt-3 text-[1.0625rem] font-medium ${
          planifiee ? "text-[var(--encre)]" : "text-[var(--texte-secondaire)]"
        }`}
      >
        {creneauTexte(ligne.debut_prevu, ligne.fin_prevue)}
      </p>

      {/* La référence du dossier : c'est le mot commun entre l'artisan et
          l'agence quand il appelle depuis le chantier. Elle n'était que sur la
          fiche de mission, un écran plus loin. */}
      <p className="mono-discret sans-majuscules mt-2">{ligne.incident_numero}</p>

      <p className="mt-1 text-base font-medium text-[var(--corps)]">
        {titreIncident(ligne.categorie)}
        {ligne.urgence === "urgente" && (
          <span className="ml-2 align-middle">
            <Etiquette ton="alerte">Urgent</Etiquette>
          </span>
        )}
      </p>

      <p className="mt-1 text-[0.9375rem] break-words text-[var(--texte-secondaire)]">
        {[ligne.adresse, [ligne.code_postal, ligne.ville].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(" — ") || "Adresse communiquée par l'agence"}
        {ligne.lot_nom ? ` · ${ligne.lot_nom}` : ""}
        {ligne.etage ? ` · ${ligne.etage}` : ""}
      </p>

      {aFaire && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[0.9375rem] font-medium text-[var(--or-texte)]">
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-current stroke-2">
            <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {aFaire}
        </p>
      )}
    </Link>
  );
}
