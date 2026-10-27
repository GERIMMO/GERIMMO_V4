import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileText, Wrench } from "lucide-react";
import styles from "./portail-artisan.module.css";
import {
  chargerAgenda,
  chargerPieces,
  chargerSollicitations,
  verifierAccesArtisan,
} from "./acces";
import { CarteMission } from "./carte-mission";
import { CarteSollicitation } from "./carte-sollicitation";
import { degreEcheance, demandeAChiffrer, jourLong, PIECES_ARTISAN, texteEcheance, libelle } from "./libelles";
import { Avertissement, Carte, CLASSE_BOUTON_SECONDAIRE, Erreur, TitreSection } from "./ui";
import { presenceReseau, rappelPresenceReseau } from "@/lib/reseau";
import { exclusionLue } from "@/lib/artisan-prive-exclusion";

export const metadata = { title: "Aujourd'hui — Gerimmo" };

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
  const { supabase, fiche } = await verifierAccesArtisan();
  const { refus } = await searchParams;
  // Décision du 23/10/2026 : le réseau propose l'artisan dans sa zone dès qu'il est validé et public. Ce qui manque se
  // dit dès l'arrivée, plutôt qu'un artisan validé mais privé qui attend des demandes qui ne viendront pas. Rester
  // privé est un choix : le rappel est alors informatif (relecture produit du 23/10, M-1).
  const { data: exclusion } = await supabase.rpc("artisan_exclusion_plateforme");
  const rappelReseau = rappelPresenceReseau(presenceReseau(fiche, exclusionLue(exclusion) === "liste_noire"));

  const [agenda, sollicitations, pieces] = await Promise.all([
    chargerAgenda(),
    chargerSollicitations(),
    chargerPieces(),
  ]);

  const aAccepter = agenda.lignes.filter((l) => l.statut === "proposee");
  const aRendreCompte = agenda.lignes.filter(
    (l) => l.statut === "en_cours" && !l.compte_rendu_depose
  );
  // « À fixer » = ce sur quoi l'artisan doit agir. Une mission dont les dates
  // sont posées attend le LOCATAIRE : la ranger ici enverrait l'artisan
  // reproposer, ce qui rend caduques les dates en cours et fait repartir le
  // ping-pong (RM-10.4.1).
  const aPlanifier = agenda.lignes.filter(
    (l) => l.statut === "acceptee" && l.creneaux_en_attente === 0
  );
  const enAttenteDuLocataire = agenda.lignes.filter(
    (l) => l.statut === "acceptee" && l.creneaux_en_attente > 0
  );
  // D18 (livraison 2) : une demande en révision est de nouveau à chiffrer.
  const aChiffrer = sollicitations.lignes.filter((l) => demandeAChiffrer(l.statut));

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
  // RM-8.2.5 pose QUATRE seuils : J-60, J-30, J-7, J+0. Le premier manquait
  // ici — il n'existait que sur « Mes attestations », où il fallait aller le
  // chercher. Or J-60 est précisément celui qui laisse le temps de demander un
  // renouvellement à son assureur sans urgence.
  const piecesTendues = pieces.lignes
    .map((p) => ({ piece: p, degre: degreEcheance(p.jours_avant_echeance, p.expiree) }))
    .filter((p) => ["expiree", "critique", "proche", "a_venir"].includes(p.degre));

  // « Rien ne vous attend » se dit quand l'écran n'a RIEN à montrer — pas
  // seulement quand il n'y a rien à faire. Une mission dont les dates sont
  // parties chez le locataire n'appelle aucun geste, mais la cacher derrière
  // un écran vide donnerait à l'artisan l'impression de l'avoir perdue.
  const rienAFaire =
    aAccepter.length === 0 &&
    aRendreCompte.length === 0 &&
    aPlanifier.length === 0 &&
    enAttenteDuLocataire.length === 0 &&
    aChiffrer.length === 0;
  const lectureIncertaine = Boolean(agenda.erreur || sollicitations.erreur || pieces.erreur);

  return (
    <div className="space-y-6">
      <div className={`portail-hero portail-hero-accueil ${styles.dailyHeader}`}>
        <p className="portail-surtitre">{jourLong(new Date().toISOString())}</p>
        <h1 className="mt-0.5">Aujourd&apos;hui</h1>
      </div>

      {refus && (
        <Avertissement>
          Mission refusée. Votre interlocuteur est prévenu et peut la réaffecter ; vous n&apos;avez
          rien d&apos;autre à faire.
        </Avertissement>
      )}

      {rappelReseau?.ton === "avertissement" && (
        <Avertissement>
          {rappelReseau.texte}{" "}
          <Link href="/artisan/entreprise" className="inline-flex min-h-11 items-center underline underline-offset-4">Voir le détail</Link>
        </Avertissement>
      )}


      {lectureIncertaine && (
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

      {!agenda.erreur && !sollicitations.erreur && (
        <nav className={styles.overview} aria-label="Résumé de mon activité">
          {[
            { href: aRendreCompte.length ? "#comptes-rendus" : "/artisan/agenda", valeur: aRendreCompte.length, libelle: "Comptes rendus à déposer", icone: ClipboardCheck, ton: "or" },
            { href: aAccepter.length ? "#missions-a-accepter" : "/artisan/agenda", valeur: aAccepter.length, libelle: "Missions à accepter", icone: Wrench, ton: "bleu" },
            { href: "/artisan/devis", valeur: aChiffrer.length, libelle: "Devis à chiffrer", icone: FileText, ton: "vert" },
            { href: aPlanifier.length ? "#rendez-vous-a-fixer" : "/artisan/agenda", valeur: aPlanifier.length, libelle: "Rendez-vous à fixer", icone: CalendarDays, ton: "violet" },
          ].map((indicateur) => (
            <Link key={indicateur.libelle} href={indicateur.href} className={styles.metric} data-a-faire={indicateur.valeur > 0}>
              <span className={styles.icon} data-tone={indicateur.ton}><indicateur.icone size={20} aria-hidden /></span>
              <span><strong>{indicateur.valeur}</strong><small>{indicateur.libelle}</small></span>
            </Link>
          ))}
        </nav>
      )}

      {rienAFaire && !lectureIncertaine ? (
        <Carte ton="vert">
          <TitreSection>Aucune mission à traiter maintenant</TitreSection>
          <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
            Les nouvelles missions et demandes de devis apparaîtront ici. Vous
            pouvez vérifier vos prochains rendez-vous et vos attestations.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/artisan/agenda" className={`${CLASSE_BOUTON_SECONDAIRE} sm:w-auto`}>
              Voir mon agenda
            </Link>
            <Link href="/artisan/attestations" className={`${CLASSE_BOUTON_SECONDAIRE} sm:w-auto`}>
              Mes attestations
            </Link>
          </div>
        </Carte>
      ) : rienAFaire ? null : (
        <div className="space-y-6">
          {aRendreCompte.length > 0 && (
            <section id="comptes-rendus" className="scroll-mt-28">
              <TitreSection>
                Rendre compte ({aRendreCompte.length}) — sans cela, pas de facture
              </TitreSection>
              <div className="artisan-liste">
                {aRendreCompte.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    origine="aujourdhui"
                    aFaire="Photo du travail réalisé, puis compte rendu"
                  />
                ))}
              </div>
            </section>
          )}

          {aAccepter.length > 0 && (
            <section id="missions-a-accepter" className="scroll-mt-28">
              <TitreSection>Missions à accepter ({aAccepter.length})</TitreSection>
              <div className="artisan-liste">
                {aAccepter.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    origine="aujourdhui"
                    aFaire="Accepter ou refuser"
                  />
                ))}
              </div>
            </section>
          )}

          {aPlanifier.length > 0 && (
            <section id="rendez-vous-a-fixer" className="scroll-mt-28">
              <TitreSection>Rendez-vous à fixer ({aPlanifier.length})</TitreSection>
              <div className="artisan-liste">
                {aPlanifier.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    origine="aujourdhui"
                    aFaire={
                      l.dates_locataire_en_attente > 0
                        ? `Le locataire propose ${l.dates_locataire_en_attente} date${l.dates_locataire_en_attente > 1 ? "s" : ""} : à confirmer`
                        : "Proposer trois créneaux au locataire"
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {aChiffrer.length > 0 && (
            <section>
              <TitreSection>Devis à chiffrer ({aChiffrer.length})</TitreSection>
              <div className="artisan-liste">
                {aChiffrer.map((l) => (
                  <CarteSollicitation key={l.sollicitation_id} ligne={l} />
                ))}
              </div>
            </section>
          )}
          {enAttenteDuLocataire.length > 0 && (
            <section>
              <TitreSection>
                Dates proposées, réponse attendue ({enAttenteDuLocataire.length})
              </TitreSection>
              <div className="artisan-liste">
                {enAttenteDuLocataire.map((l) => (
                  <CarteMission
                    key={l.intervention_id}
                    ligne={l}
                    origine="aujourdhui"
                    aFaire={`${l.creneaux_en_attente} date${l.creneaux_en_attente > 1 ? "s" : ""} au choix du locataire`}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {aVenir.length > 0 && (
        <section>
          <TitreSection>Prochaines interventions</TitreSection>
          <div className="artisan-liste">
            {aVenir.map((l) => (
              <CarteMission key={l.intervention_id} ligne={l} origine="aujourdhui" />
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
      {rappelReseau?.ton === "information" && (
        <details className={styles.networkNote}>
          <summary>Votre profil est privé</summary>
          <p>{rappelReseau.texte}</p>
          <Link href="/artisan/entreprise" className="inline-flex min-h-11 items-center underline underline-offset-4">Mon entreprise</Link>
        </details>
      )}
    </div>
  );
}
