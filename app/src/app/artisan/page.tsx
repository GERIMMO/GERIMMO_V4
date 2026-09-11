import Link from "next/link";
import {
  chargerAgenda,
  chargerPieces,
  chargerSollicitations,
  verifierAccesArtisan,
} from "./acces";
import { CarteMission } from "./carte-mission";
import { CarteSollicitation } from "./carte-sollicitation";
import { degreEcheance, jourLong, PIECES_ARTISAN, texteEcheance, libelle } from "./libelles";
import { Avertissement, Carte, Erreur, TitreSection, Vide } from "./ui";

export const metadata = { title: "Aujourd'hui — Espace artisan" };

/**
 * L'écran d'arrivée : CE QUI M'ATTEND, dans l'ordre où il faut s'en occuper.
 *
 * Pas un tableau de bord : une file. L'artisan ouvre ce portail entre deux
 * chantiers, souvent d'une main — il n'a pas à chercher ce qui bloque. Trois
 * choses le bloquent vraiment, dans cet ordre :
 *   1. une attestation tombée — elle le retire des listes d'affectation pour
 *      les travaux qui l'exigent (RM-8.2.2), donc elle passe avant tout ;
 *   2. un compte rendu non déposé — sans lui, pas de fin d'intervention, donc
 *      PAS DE FACTURE (RM-7.5.2). C'est l'argent qui attend ;
 *   3. une mission non acceptée — l'agence, elle, attend.
 */
export default async function PageArtisanAccueil({
  searchParams,
}: PageProps<"/artisan">) {
  await verifierAccesArtisan();
  const { refus } = await searchParams;

  const [agenda, sollicitations, pieces] = await Promise.all([
    chargerAgenda(),
    chargerSollicitations(),
    chargerPieces(),
  ]);

  const aAccepter = agenda.lignes.filter((l) => l.statut === "proposee");
  const aRendreCompte = agenda.lignes.filter(
    (l) => l.statut === "en_cours" && !l.compte_rendu_depose
  );
  const aPlanifier = agenda.lignes.filter((l) => l.statut === "acceptee");
  const aChiffrer = sollicitations.lignes.filter((l) => l.statut === "envoyee");

  // Les prochaines interventions calées, l'aujourd'hui en tête.
  const debutDuJour = new Date();
  debutDuJour.setHours(0, 0, 0, 0);
  const aVenir = agenda.lignes
    .filter(
      (l) =>
        l.debut_prevu &&
        new Date(l.debut_prevu).getTime() >= debutDuJour.getTime() &&
        (l.statut === "planifiee" || l.statut === "en_cours")
    )
    .slice(0, 3);

  // RM-8.2.5 échelonne les seuils J-60/J-30/J-7/J+0. Le portail ne les
  // « alerte » pas au sens de la table `alerts` (org-scopée par construction,
  // et l'artisan n'appartient à aucune agence) : il les dit à celui qui doit
  // agir, sur son écran d'arrivée.
  const piecesTendues = pieces.lignes
    .map((p) => ({ piece: p, degre: degreEcheance(p.jours_avant_echeance, p.expiree) }))
    .filter((p) => ["expiree", "critique", "proche"].includes(p.degre));

  const rienAFaire =
    aAccepter.length === 0 &&
    aRendreCompte.length === 0 &&
    aPlanifier.length === 0 &&
    aChiffrer.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{jourLong(new Date().toISOString())}</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-tight text-[var(--encre)]">Aujourd&apos;hui</h1>
      </div>

      {refus && (
        <Avertissement>
          Mission refusée. L&apos;agence est prévenue et la réaffecte ; vous n&apos;avez
          rien d&apos;autre à faire.
        </Avertissement>
      )}

      {(agenda.erreur || sollicitations.erreur || pieces.erreur) && (
        <Erreur>
          Connexion instable : cette page peut être incomplète. Ne concluez pas
          d&apos;une liste vide qu&apos;il n&apos;y a rien — rechargez dans un instant.
        </Erreur>
      )}

      {piecesTendues.length > 0 && (
        <Carte className="border-l-4 border-l-[var(--warning)]">
          <TitreSection>Vos attestations</TitreSection>
          <ul className="space-y-1.5">
            {piecesTendues.map(({ piece, degre }) => (
              <li key={piece.piece_id} className="text-[0.9375rem] text-[var(--corps)]">
                <span className="font-medium">{libelle(PIECES_ARTISAN, piece.type)}</span> —{" "}
                {texteEcheance(piece.jours_avant_echeance, piece.expiree)}
                {piece.type === "decennale" && degre === "expiree" && (
                  <span className="block text-[var(--destructive-soft-foreground)]">
                    Vous n&apos;êtes plus proposé pour les travaux qui l&apos;exigent.
                    Vos interventions en cours, elles, ne sont pas interrompues.
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/artisan/attestations"
            className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
          >
            Déposer une attestation à jour
          </Link>
        </Carte>
      )}

      {rienAFaire ? (
        <Vide>
          Rien ne vous attend pour le moment. Les demandes de devis et les
          missions arrivent ici.
        </Vide>
      ) : (
        <div className="space-y-6">
          {aRendreCompte.length > 0 && (
            <section>
              <TitreSection>
                Rendre compte ({aRendreCompte.length}) — sans cela, pas de facture
              </TitreSection>
              <div className="space-y-3">
                {aRendreCompte.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    aFaire="Photo du travail réalisé, puis compte rendu"
                  />
                ))}
              </div>
            </section>
          )}

          {aAccepter.length > 0 && (
            <section>
              <TitreSection>Missions à accepter ({aAccepter.length})</TitreSection>
              <div className="space-y-3">
                {aAccepter.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    aFaire="Accepter ou refuser"
                  />
                ))}
              </div>
            </section>
          )}

          {aPlanifier.length > 0 && (
            <section>
              <TitreSection>Rendez-vous à caler ({aPlanifier.length})</TitreSection>
              <div className="space-y-3">
                {aPlanifier.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    aFaire="Proposer trois créneaux au locataire"
                  />
                ))}
              </div>
            </section>
          )}

          {aChiffrer.length > 0 && (
            <section>
              <TitreSection>Devis à chiffrer ({aChiffrer.length})</TitreSection>
              <div className="space-y-3">
                {aChiffrer.map((l) => (
                  <CarteSollicitation key={l.sollicitation_id} ligne={l} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {aVenir.length > 0 && (
        <section>
          <TitreSection>Prochaines interventions</TitreSection>
          <div className="space-y-3">
            {aVenir.map((l) => (
              <CarteMission key={l.intervention_id} ligne={l} />
            ))}
          </div>
          <Link
            href="/artisan/agenda"
            className="mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
          >
            Voir tout mon agenda
          </Link>
        </section>
      )}
    </div>
  );
}
