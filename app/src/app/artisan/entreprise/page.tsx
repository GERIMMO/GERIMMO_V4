import Link from "next/link";
import { chargerNote, chargerPieces, verifierAccesArtisan } from "../acces";
import { degreEcheance, formaterSiret, formaterTelephone, METIERS } from "../libelles";
import { CLASSE_AIDE, Carte, EnteteSousPage, Etiquette, LigneInfo, TitreSection } from "../ui";
import { FormulaireMetiersZones, ReglageVisibilite } from "./reglages-entreprise";

export const metadata = { title: "Mon entreprise — Espace artisan" };

const ETATS_SIRET: Record<string, string> = {
  verifie: "Vérifié",
  non_verifie: "En cours de vérification",
  invalide: "Signalé invalide",
};

const ETATS_PLATEFORME: Record<string, string> = {
  en_attente: "Inscription en cours de validation",
  valide: "Inscription validée",
  refuse: "Inscription refusée",
};

/**
 * « Mon entreprise » : ce qui ne se règle pas sur un chantier.
 *
 * Attestations, facturation, note et visibilité sont des parcours de fin de
 * journée : ils ont leur place ici plutôt que dans les onglets du bas, réservés
 * à ce qui se fait debout. Ce qui, lui, bloque le travail — une attestation
 * tombée — remonte quand même en tête de l'écran d'arrivée : on ne laisse pas
 * une décennale expirée dans un sous-menu.
 */
export default async function PageEntreprise() {
  const { fiche } = await verifierAccesArtisan();
  const [pieces, note] = await Promise.all([chargerPieces(), chargerNote()]);

  const piecesTendues = pieces.lignes.filter((p) =>
    ["expiree", "critique", "proche"].includes(
      degreEcheance(p.jours_avant_echeance, p.expiree)
    )
  ).length;

  // Aucune attestation n'est pas un compteur neutre : sans elles, l'artisan
  // n'est proposé à personne. La ligne le dit, dans la couleur d'alerte, et
  // l'onglet porte le même point (gabarit) — tour du 24/09.
  const aucunePiece = !pieces.erreur && pieces.lignes.length === 0;
  const raccourcis = [
    {
      href: "/artisan/attestations",
      titre: "Mes attestations",
      detail: pieces.erreur
        ? "Liste illisible à l'instant — ouvrez pour vérifier"
        : aucunePiece
          ? "Aucune attestation déposée — à déposer pour être proposé aux agences"
          : piecesTendues > 0
            ? `${piecesTendues} à renouveler`
            : `${pieces.lignes.length} déposée${pieces.lignes.length > 1 ? "s" : ""}`,
      tendu: aucunePiece || piecesTendues > 0,
    },
    {
      href: "/artisan/facturation",
      titre: "Ma facturation",
      detail: "Les interventions terminées et leurs montants",
      tendu: false,
    },
    {
      href: "/artisan/note",
      titre: "Ma note",
      detail: note.note?.publiable
        ? `${Number(note.note.note_publiee ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sur 5 · ${note.note.nb_evaluations} avis`
        : "Pas encore publiée",
      tendu: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Le nom de l'onglet en titre, comme les pages sœurs : la raison
          sociale est déjà écrite dans le bandeau, juste au-dessus (24/09). */}
      <EnteteSousPage
        titre="Mon entreprise"
        mention="Vos attestations, votre facturation, votre note et votre fiche"
      />

      <nav aria-label="Mon entreprise" className="space-y-3">
        {raccourcis.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 border-[var(--filet)] bg-[var(--ivoire)] px-4 py-3 transition-colors hover:border-[var(--encre)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--or)]"
          >
            <span className="min-w-0">
              <span className="block text-base font-medium text-[var(--encre)]">
                {r.titre}
              </span>
              <span
                className={`block text-[0.9375rem] ${
                  r.tendu
                    ? "text-[var(--warning-soft-foreground)]"
                    : "text-[var(--texte-secondaire)]"
                }`}
              >
                {r.detail}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-5 shrink-0 fill-none stroke-[var(--texte-secondaire)] stroke-2"
            >
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </nav>

      <Carte>
        <TitreSection>Ma fiche</TitreSection>
        <div>
          <LigneInfo libelle="SIRET">
            <span className="font-[family-name:var(--font-libelles)] tabular-nums">
              {formaterSiret(fiche.siret)}
            </span>
          </LigneInfo>
          <LigneInfo libelle="Vérification du SIRET">
            <Etiquette ton={fiche.siret_etat === "verifie" ? "ok" : "attente"}>
              {ETATS_SIRET[fiche.siret_etat] ?? "Vérification à faire"}
            </Etiquette>
          </LigneInfo>
          <LigneInfo libelle="Inscription">
            <Etiquette
              ton={
                fiche.statut_plateforme === "valide"
                  ? "ok"
                  : fiche.statut_plateforme === "refuse"
                    ? "alerte"
                    : "attente"
              }
            >
              {ETATS_PLATEFORME[fiche.statut_plateforme] ?? "Statut à vérifier"}
            </Etiquette>
          </LigneInfo>
          <LigneInfo libelle="Mobile">{formaterTelephone(fiche.telephone)}</LigneInfo>
          <LigneInfo libelle="Adresse e-mail">{fiche.email ?? "—"}</LigneInfo>
        </div>
        {/* « Motif » se lit comme un refus : sous une inscription validée,
            c'est un commentaire (24/09). */}
        {fiche.statut_motif && (
          <p className="mt-3 text-[0.9375rem] text-[var(--texte-secondaire)]">
            {fiche.statut_plateforme === "valide"
              ? "Commentaire de Gerimmo"
              : "Motif communiqué par Gerimmo"}{" "}
            : {fiche.statut_motif}
          </p>
        )}
        {/* La phrase mène à qui corrige : sans lien, l'artisan qui voyait une
            erreur n'avait aucun moyen de la signaler (24/09). */}
        <p className={`mt-3 ${CLASSE_AIDE}`}>
          Raison sociale et SIRET se corrigent{" "}
          <Link
            href="/assistance?ecran=%2Fartisan%2Fentreprise&action=lien&retour=%2Fartisan%2Fentreprise"
            className="font-medium text-[var(--encre)] underline underline-offset-4"
          >
            auprès de Gerimmo
          </Link>{" "}
          : ils identifient votre entreprise sur toute la plateforme, pas
          seulement chez une agence.
        </p>
      </Carte>

      <FormulaireMetiersZones
        metiers={(fiche.metiers ?? []).filter((m) => m in METIERS)}
        codesPostaux={fiche.codes_postaux ?? []}
      />

      <ReglageVisibilite
        visibilite={fiche.visibilite}
        siretVerifie={fiche.siret_etat === "verifie"}
      />
    </div>
  );
}
