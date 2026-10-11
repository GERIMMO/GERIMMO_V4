import Link from "next/link";
import { chargerPieces, verifierAccesArtisan } from "../acces";
import {
  dateSimple,
  degreEcheance,
  LISTE_PIECES,
  PIECES_ARTISAN,
  texteEcheance,
  type DegreEcheance,
} from "../libelles";
import {
  Avertissement,
  Carte,
  EnteteSousPage,
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
  const { inscrit, type } = await props.searchParams;
  const pieces = await chargerPieces();

  const deposees = new Map(pieces.lignes.map((p) => [p.type, p]));
  // La pièce choisie dans « Encore attendues » arrive par l'adresse
  // (`?type=kbis#deposer`) : le formulaire s'ouvre dessus au lieu de la
  // première manquante. Une valeur inconnue est ignorée.
  const typeDemande =
    typeof type === "string" && (LISTE_PIECES as readonly string[]).includes(type)
      ? type
      : undefined;

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <EnteteSousPage rubrique="documents" titre="Mes attestations" mention="Un seul dossier pour toutes vos interventions" />

      {inscrit && (
        <Succes>
          Votre entreprise est inscrite. Déposez maintenant votre décennale et
          votre RC pro : Gerimmo valide l&apos;inscription au vu de ces pièces, et
          vous pourrez recevoir de nouvelles demandes après validation.
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

      <div className="grid gap-3 sm:grid-cols-2">
        {LISTE_PIECES.map(t => {
          const piece = deposees.get(t);
          const degre = piece ? degreEcheance(piece.jours_avant_echeance,piece.expiree) : null;
          return <Carte key={t}>
            <TitreSection>{PIECES_ARTISAN[t]}</TitreSection>
            <Etiquette ton={degre ? TON_ECHEANCE[degre] : t === "certification" ? "neutre" : "attente"}>{piece ? texteEcheance(piece.jours_avant_echeance,piece.expiree) : pieces.erreur ? "À vérifier" : t === "certification" ? "Facultatif" : "À déposer"}</Etiquette>
            {piece?.expire_le && <p className="mt-3 text-sm text-muted-foreground">Échéance : {dateSimple(piece.expire_le)}</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {piece && <Link className="inline-flex min-h-11 items-center underline" href={`/artisan/attestations/${piece.piece_id}/fichier`}>Ouvrir le document</Link>}
              <Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/artisan/attestations?type=${t}#deposer`}>{piece ? "Renouveler" : "Déposer"} →</Link>
            </div>
          </Carte>;
        })}
      </div>

      {/* La `key` remet la liste « Quelle attestation » sur la pièce demandée
          quand on en choisit une autre dans « Encore attendues ». */}
      {typeDemande && <FormulairePiece
        key={typeDemande ?? "suggeree"}
        typeSuggere={typeDemande}
      />}

      <Carte>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Ces pièces composent votre dossier professionnel : vous les
          déposez une fois et elles valent partout. Seule la décennale
          conditionne l&apos;affectation, et seulement pour les travaux qui
          l&apos;exigent.
        </p>
      </Carte>
    </div>
  );
}
