import { chargerNote, verifierAccesArtisan } from "../acces";
import { Carte, Erreur, LigneInfo, Retour, TitreSection } from "../ui";
import { Contestation } from "./contestation";

export const metadata = { title: "Ma note — Espace artisan" };

/**
 * Ma note (11.4).
 *
 * RM-11.3/11.4 : l'artisan voit sa moyenne ET le détail de sa fiabilité —
 * « le cacher serait déloyal ». Il ne voit JAMAIS qui a noté quoi, ni le
 * moindre commentaire : ceux du gérant restent privés à son agence
 * (RM-11.2.2). Ce n'est pas l'écran qui le décide : la projection de
 * `ma_note_artisan` ne contient ni évaluateur, ni commentaire, ni détail par
 * intervention. Il n'y a rien à masquer ici, il n'y a rien à afficher.
 *
 * DEUX FRANCHISES que cet écran assume plutôt que de les lisser :
 *  · la part « fiabilité » (25 %) n'est PAS intégrée au calcul. Le module 11
 *    nomme les cinq indicateurs mais ne dit nulle part comment les convertir
 *    en note sur 5 ; le barème n'a pas été inventé. La moyenne affichée est
 *    donc celle des appréciations humaines, renormalisée.
 *  · « RDV manqué » n'est pas encore mesuré : aucun geste du produit ne marque
 *    un rendez-vous comme manqué (module 10 non câblé de ce côté). L'indicateur
 *    rendrait 0 quoi qu'il arrive — on écrit « pas encore mesuré », ce qui est
 *    vrai, plutôt que « 0 », qui serait un compliment mensonger.
 */
export default async function PageNote() {
  const { fiche } = await verifierAccesArtisan();
  const { note, erreur } = await chargerNote();

  const moyenne = note?.note_publiee !== null && note?.note_publiee !== undefined
    ? Number(note.note_publiee)
    : null;

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <div>
        <p className="eyebrow">Module 11 — notation</p>
        <h1 className="mt-0.5 text-[1.5rem] leading-tight text-[var(--encre)]">Ma note</h1>
      </div>

      {erreur && (
        <Erreur>
          Votre note n&apos;a pas pu être lue à l&apos;instant. Rechargez dans un instant.
        </Erreur>
      )}

      <Carte>
        {note?.publiable && moyenne !== null ? (
          <>
            <p className="font-[family-name:var(--font-titres)] text-[2.75rem] leading-none text-[var(--encre)]">
              {moyenne.toFixed(1)}
              <span className="text-[1.25rem] text-[var(--texte-secondaire)]"> / 5</span>
            </p>
            <p className="mt-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
              Sur {note.nb_evaluations} évaluation{note.nb_evaluations > 1 ? "s" : ""}.
              C&apos;est cette note que les agences voient à côté de votre nom.
            </p>
          </>
        ) : (
          <>
            <p className="text-[1.25rem] text-[var(--encre)]">Pas encore publiée</p>
            <p className="mt-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
              {note?.nb_evaluations ?? 0} évaluation
              {(note?.nb_evaluations ?? 0) > 1 ? "s" : ""} reçue
              {(note?.nb_evaluations ?? 0) > 1 ? "s" : ""}. Votre note est publiée
              au-delà de trois : en dessous, les agences vous voient marqué
              « nouveau » plutôt que mal noté.
            </p>
          </>
        )}
      </Carte>

      <Carte>
        <TitreSection>Comment elle se compose</TitreSection>
        <ul className="space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>
            <b className="font-medium">Le gérant, 50 %</b> — qualité, délai,
            rapport qualité-prix. Il est le seul à voir l&apos;ensemble.
          </li>
          <li>
            <b className="font-medium">Le locataire, 25 %</b> — ce qu&apos;il a vu
            sur place. On ne lui fait juger ni le prix ni la technique.
          </li>
          <li>
            <b className="font-medium">La fiabilité, 25 %</b> — mesurée, jamais
            donnée à l&apos;appréciation de quiconque.
          </li>
        </ul>
        <p className="mt-3 text-[0.9375rem] text-[var(--texte-secondaire)]">
          La part « fiabilité » n&apos;est pas encore intégrée au calcul : ses
          indicateurs sont mesurés et vous sont montrés ci-dessous, mais le
          barème qui les convertit en note n&apos;est pas arrêté. La moyenne
          ci-dessus est donc celle des appréciations humaines.
        </p>
      </Carte>

      <Carte>
        <TitreSection>Ma fiabilité, en détail</TitreSection>
        <div>
          <LigneInfo libelle="Délai d'acceptation">
            {note?.delai_acceptation_heures !== null && note?.delai_acceptation_heures !== undefined
              ? `${Number(note.delai_acceptation_heures).toFixed(1)} h en moyenne`
              : "Aucune mission acceptée"}
          </LigneInfo>
          <LigneInfo libelle="Délai d'intervention">
            {note?.delai_intervention_jours !== null && note?.delai_intervention_jours !== undefined
              ? `${Number(note.delai_intervention_jours).toFixed(1)} jour(s) après acceptation`
              : "Aucune intervention démarrée"}
          </LigneInfo>
          <LigneInfo libelle="Taux de refus">
            {note?.taux_refus !== null && note?.taux_refus !== undefined
              ? `${Math.round(Number(note.taux_refus) * 100)} %`
              : "—"}
          </LigneInfo>
          <LigneInfo libelle="Rendez-vous manqués">Pas encore mesuré</LigneInfo>
          <LigneInfo libelle="Attestations expirées">
            {note?.pieces_expirees ?? 0}
          </LigneInfo>
        </div>
        <p className="mt-3 text-[0.8125rem] text-[var(--texte-secondaire)]">
          Ces mesures sont les vôtres : personne d&apos;autre que vous n&apos;y a accès
          dans ce détail.
        </p>
      </Carte>

      {/* Le droit à l'intervention humaine — présenté comme un droit (RM-A2.11),
          avec, avant le geste, l'information que Gerimmo doit à l'artisan. */}
      <Carte className="border-l-4 border-l-[var(--or)]">
        <TitreSection>Contester votre note est un droit</TitreSection>
        <p className="text-[0.9375rem] text-[var(--corps)]">
          Votre note combine des appréciations humaines et des indicateurs
          calculés, et elle influence votre classement dans les recherches des
          agences. À ce titre, vous pouvez exiger qu&apos;une personne la réexamine :
          c&apos;est votre droit à l&apos;intervention humaine.
        </p>
        <ul className="mt-3 space-y-2 text-[0.9375rem] text-[var(--corps)]">
          <li>
            Elle est arbitrée par un opérateur de Gerimmo —{" "}
            <b className="font-medium">jamais par l&apos;agence qui vous a noté</b>,
            qui serait juge et partie.
          </li>
          <li>
            Une évaluation retirée sort du calcul, et votre moyenne est
            recalculée immédiatement.
          </li>
          <li>
            Contester ne bloque rien : vous continuez à recevoir des demandes
            pendant l&apos;examen.
          </li>
        </ul>
        <div className="mt-4">
          <Contestation
            raisonSociale={fiche.raison_sociale}
            siret={fiche.siret}
            note={note?.publiable ? moyenne : null}
          />
        </div>
      </Carte>
    </div>
  );
}
