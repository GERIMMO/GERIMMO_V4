import Link from "next/link";
import { chargerPieces, verifierAccesArtisan } from "../acces";
import {
  dateSimple,
  degreEcheance,
  libelle,
  LISTE_PIECES,
  PIECES_ARTISAN,
  texteEcheance,
  type DegreEcheance,
} from "../libelles";
import {
  Avertissement,
  Carte,
  Erreur,
  Etiquette,
  Retour,
  Succes,
  TitreSection,
} from "../ui";
import { FormulairePiece } from "./formulaire-piece";

export const metadata = { title: "Mes attestations — Espace artisan" };

const TON_ECHEANCE: Record<DegreEcheance, "ok" | "attente" | "alerte" | "neutre"> = {
  expiree: "alerte",
  critique: "alerte",
  proche: "attente",
  a_venir: "attente",
  ok: "ok",
  sans_date: "neutre",
};

/**
 * Mes attestations et leur validité (8.2).
 *
 * L'écran ne tient AUCUN drapeau : la validité se lit de la pièce, à l'instant
 * de la question — `mes_pieces_artisan` calcule l'échéance à chaque appel.
 * C'est ce qui fait qu'une décennale déposée rétablit immédiatement l'artisan
 * dans les listes d'affectation (RM-8.2.2), sans qu'aucun traitement n'ait à
 * repasser derrière.
 *
 * RM-8.2.5 échelonne les rappels à J-60 / J-30 / J-7 / J+0. Où vivent ces
 * ALERTES reste ouvert depuis le pivot du 2026-09-04 (la vigilance de
 * conformité est sortie de l'agence, et la table `alerts` est org-scopée par
 * construction — l'artisan n'appartient à aucune agence). Ce que cet écran
 * fait, en attendant, est ce qui ne prête à aucun doute : dire les échéances
 * à celui qui doit agir, avec les mêmes seuils.
 */
export default async function PageAttestations(props: PageProps<"/artisan/attestations">) {
  const { fiche } = await verifierAccesArtisan();
  const { inscrit } = await props.searchParams;
  const pieces = await chargerPieces();

  const deposees = new Map(pieces.lignes.map((p) => [p.type, p]));
  const manquantes = LISTE_PIECES.filter(
    (t) => t !== "certification" && !deposees.has(t)
  );

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <div>
        <p className="eyebrow">Valables pour toutes les agences</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-tight text-[var(--encre)]">
          Mes attestations
        </h1>
      </div>

      {inscrit && (
        <Succes>
          Votre entreprise est inscrite. Déposez maintenant votre décennale et
          votre RC pro : Gerimmo valide l&apos;inscription au vu de ces pièces, et
          aucune agence ne peut vous solliciter avant.
        </Succes>
      )}

      {pieces.erreur && (
        <Erreur>
          Vos attestations n&apos;ont pas pu être lues. Ne déposez pas à l&apos;aveugle :
          rechargez dans un instant.
        </Erreur>
      )}

      {fiche.statut_plateforme === "en_attente" && (
        <Avertissement>
          Votre inscription est examinée par Gerimmo. Elle ne sera validée
          qu&apos;au vu de vos justificatifs.
        </Avertissement>
      )}

      <section className="space-y-3">
        <TitreSection>Déposées</TitreSection>
        {pieces.lignes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[0.9375rem] text-[var(--texte-secondaire)]">
            Aucune attestation déposée pour l&apos;instant.
          </p>
        ) : (
          pieces.lignes.map((p) => {
            const degre = degreEcheance(p.jours_avant_echeance, p.expiree);
            return (
              <div
                key={p.piece_id}
                className="rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-base font-medium text-[var(--corps)]">
                    {libelle(PIECES_ARTISAN, p.type)}
                  </p>
                  <Etiquette ton={TON_ECHEANCE[degre]}>
                    {texteEcheance(p.jours_avant_echeance, p.expiree)}
                  </Etiquette>
                </div>
                <p className="mt-1 text-[0.9375rem] text-[var(--texte-secondaire)]">
                  {p.emise_le ? `Émise le ${dateSimple(p.emise_le)}. ` : ""}
                  {p.expire_le ? `Valable jusqu'au ${dateSimple(p.expire_le)}.` : ""}
                </p>
                {p.type === "decennale" && p.expiree && (
                  <p className="mt-2 text-[0.9375rem] text-[var(--destructive-soft-foreground)]">
                    Vous n&apos;êtes plus proposé pour les travaux qui exigent une
                    décennale. Vos interventions en cours ne sont pas
                    interrompues, et un nouveau dépôt vous rétablit
                    immédiatement.
                  </p>
                )}
                <Link
                  href={`/artisan/attestations/${p.piece_id}/fichier`}
                  className="mt-2 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
                >
                  Ouvrir le document
                </Link>
              </div>
            );
          })
        )}
      </section>

      {manquantes.length > 0 && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>Encore attendues</TitreSection>
          <ul className="space-y-1 text-[0.9375rem] text-[var(--corps)]">
            {manquantes.map((t) => (
              <li key={t}>{PIECES_ARTISAN[t]}</li>
            ))}
          </ul>
        </Carte>
      )}

      <FormulairePiece typeSuggere={manquantes[0]} />

      <Carte>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Ces pièces sont les vôtres, pas celles d&apos;une agence : vous les
          déposez une fois et elles valent partout. Seule la décennale
          conditionne l&apos;affectation, et seulement pour les travaux qui
          l&apos;exigent.
        </p>
      </Carte>
    </div>
  );
}
