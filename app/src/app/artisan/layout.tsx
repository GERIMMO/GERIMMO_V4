import Link from "next/link";
import { redirect } from "next/navigation";
import { seDeconnecter } from "@/app/actions/auth";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { NavArtisan } from "@/components/nav-artisan";
import {
  chargerFicheArtisan,
  chargerPieces,
  chargerAgenda,
  chargerSollicitations,
} from "./acces";
import { degreEcheance } from "./libelles";

export const metadata = { title: "Espace artisan — Gerimmo" };

/**
 * Coquille du portail artisan.
 *
 * Elle NE REDIRIGE PAS quand la fiche manque : `/artisan/inscription` est un
 * enfant de ce gabarit, et une garde ici renverrait l'inscription vers
 * elle-même en boucle. Le gabarit se contente donc de reconnaître la session ;
 * chaque page appelle `verifierAccesArtisan()`, qui envoie à l'inscription
 * l'artisan qui n'a pas encore de fiche. Sans fiche, la barre d'onglets est
 * masquée : il n'y a encore rien à voir derrière.
 *
 * Le bandeau du haut porte la marque GERIMMO, pas celle d'une agence : ce
 * portail traverse les agences (RM-19.3.3), aucune d'elles ne peut donc
 * l'habiller. Le logo de l'agence, lui, se pose sur CHAQUE intervention —
 * c'est là qu'il dit quelque chose.
 */
export default async function LayoutArtisan({
  children,
}: LayoutProps<"/artisan">) {
  const { user, fiche } = await chargerFicheArtisan();
  if (!user) redirect("/connexion?suite=%2Fartisan");

  const [agenda, sollicitations, pieces] = fiche
    ? await Promise.all([chargerAgenda(), chargerSollicitations(), chargerPieces()])
    : [null, null, null];

  // Un seul compte pour l'onglet d'arrivée : ce qui attend un geste. Une
  // mission à accepter et un compte rendu non déposé sont deux urgences de
  // nature différente, mais la question de l'artisan est la même.
  const aFaireMaintenant =
    agenda?.lignes.filter(
      (l) =>
        l.statut === "proposee" || (l.statut === "en_cours" && !l.compte_rendu_depose)
    ).length ?? 0;
  const devisAChiffrer =
    sollicitations?.lignes.filter((l) => l.statut === "envoyee").length ?? 0;
  // Le seuil de la pastille est J-30, pas l'expiration : prévenu le jour où
  // l'assurance tombe, l'artisan est déjà retiré des listes d'affectation
  // pour les travaux qui l'exigent (RM-8.2.2). RM-8.2.5 échelonne J-60/J-30/
  // J-7/J+0 ; l'onglet s'allume au deuxième seuil, le détail est sur la page.
  const piecesAAJour = !(pieces?.lignes ?? []).some((p) => {
    const degre = degreEcheance(p.jours_avant_echeance, p.expiree);
    return degre === "expiree" || degre === "critique" || degre === "proche";
  });

  // RM-8.2 / pivot du 2026-09-04 : tant que la plateforme n'a pas validé
  // l'inscription, aucune agence ne peut solliciter l'artisan. Le lui taire
  // le laisserait attendre des demandes qui ne viendront jamais.
  const enAttente = fiche?.statut_plateforme === "en_attente";
  const refuse = fiche?.statut_plateforme === "refuse";

  return (
    <div className="flex min-h-svh flex-col bg-[var(--creme)]">
      <header className="sticky top-0 z-20 border-b border-[var(--encre)] bg-[var(--encre)]">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-4 py-2.5">
          {/* 44 px de haut : c'est un lien de navigation, et on travaille ici
              debout, avec une main, parfois gantée. Le sigle ne mesurait que
              sa propre hauteur de texte. */}
          <Link
            href="/artisan"
            aria-label="Accueil de mon espace artisan"
            className="flex min-h-11 min-w-0 items-center"
          >
            <MarqueGerimmo surEncre />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/espaces"
              title="Mes espaces"
              aria-label="Mes espaces"
              className="flex size-11 items-center justify-center text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current stroke-[1.6]">
                <rect x="4" y="4" width="7" height="7" rx="1.5" />
                <rect x="13" y="4" width="7" height="7" rx="1.5" />
                <rect x="4" y="13" width="7" height="7" rx="1.5" />
                <rect x="13" y="13" width="7" height="7" rx="1.5" />
              </svg>
            </Link>
            <form action={seDeconnecter}>
              <button
                type="submit"
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="flex size-11 items-center justify-center text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
              >
                <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current stroke-[1.6]">
                  <path d="M9 4h-4v16h4" strokeLinecap="round" />
                  <path d="M13 8l4 4-4 4M17 12H8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </div>
        </div>
        <p className="mx-auto w-full max-w-[720px] px-4 pb-2 text-[0.8125rem] text-[var(--sur-encre)]/70">
          {fiche ? fiche.raison_sociale : "Espace artisan"}
        </p>
      </header>

      {enAttente && (
        <p
          role="status"
          className="border-b border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2.5 text-center text-[0.9375rem] text-[var(--warning-soft-foreground)]"
        >
          Inscription en cours de validation par Gerimmo. Déposez vos
          attestations : aucune agence ne peut vous solliciter avant.
        </p>
      )}
      {refuse && (
        <p
          role="alert"
          className="border-b border-[var(--destructive)] bg-[var(--destructive-soft)] px-4 py-2.5 text-center text-[0.9375rem] text-[var(--destructive-soft-foreground)]"
        >
          Votre inscription a été refusée.
          {fiche?.statut_motif ? ` Motif : ${fiche.statut_motif}` : ""}
        </p>
      )}

      {/* pb-28 : la barre d'onglets est fixe et recouvrirait le dernier bouton
          de la page — le compte rendu finit précisément par un bouton. */}
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-4 pb-28">
        {children}
      </main>

      {fiche && (
        <NavArtisan
          aFaireMaintenant={aFaireMaintenant}
          devisAChiffrer={devisAChiffrer}
          piecesAAJour={piecesAAJour}
        />
      )}
    </div>
  );
}
