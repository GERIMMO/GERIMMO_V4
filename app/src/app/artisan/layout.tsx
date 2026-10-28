import Link from "next/link";
import { CircleHelp, Wrench } from "lucide-react";
import { MenuCompte } from "@/components/menu-compte";
import { LienAssistance } from "@/components/bouton-assistance";
import styles from "./portail-artisan.module.css";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { BandeauSessionSupervision } from "@/components/bandeau-session-supervision";
import { NavArtisan } from "@/components/nav-artisan";
import {
  chargerFicheArtisan,
  chargerPieces,
  chargerAgenda,
  chargerSollicitations,
} from "./acces";
import { degreEcheance, demandeAChiffrer } from "./libelles";
import { AcceptationConditionsArtisans } from "./acceptation-conditions-artisans";
import { conditionsArtisansAAccepter } from "@/lib/conditions-acceptation-serveur";

// Un seul suffixe pour tout l'espace (audit du 13/10, DES-B-07) : les pages ne
// donnent que le nom de l'écran, le gabarit y ajoute « — Gerimmo ». Il ne
// s'applique pas à la page du même segment (app/artisan/page.tsx), qui porte
// donc son suffixe en toutes lettres ; le titre par défaut sert aux écrans qui
// n'en déclarent pas.
export const metadata = { title: { default: "Espace artisan — Gerimmo", template: "%s — Gerimmo" } };

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
  const { user, fiche, supabase } = await chargerFicheArtisan();

  // Sans session, une seule page du portail est atteignable : l'inscription
  // (le proxy ne laisse passer que /artisan/inscription, audit du 27/09).
  // Elle reçoit un bandeau réduit — la marque et « Se connecter » — et crée
  // le compte avant la fiche. Chaque autre page garde sa propre garde
  // (verifierAccesArtisan), qui renvoie à la connexion.
  if (!user) {
    return (
      <div className="artisan-app flex min-h-svh flex-col bg-[var(--creme)]">
        <header className="artisan-bandeau bandeau-appli">
          <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-3 px-4 py-2.5">
            {/* La tuile bleu nuit est celle de la feuille de style (`tuile`), la même sur tous les fonds clairs (D28 A). */}
            <Link href="/" aria-label="Accueil de Gerimmo" className="flex min-h-11 min-w-0 items-center rounded-xl">
              <MarqueGerimmo surEncre tuile />
            </Link>
            <Link
              href="/connexion?suite=%2Fartisan"
              className="lien-bandeau min-h-11 justify-center px-3"
            >
              Se connecter
            </Link>
          </div>
        </header>
        <main className="artisan-corps mx-auto w-full max-w-[960px] flex-1 px-4 pt-6 pb-16 sm:px-7 sm:pt-8">
          {children}
        </main>
      </div>
    );
  }

  // Plan de conformité du 23/10 (R10) : dès que les conditions de l'espace artisan sont publiées
  // (CONDITIONS_ARTISANS_VERSION), le compte qui ne les a pas acceptées voit leur case à la place de la page demandée.
  // D'ici là, rien n'est exigé ni lu. La garde est de parcours : les données restent protégées en base. Elle se tait
  // pendant un diagnostic du super-administrateur (lecture seule), comme la coquille agence en traversée.
  // Elle ne vise que les comptes qui ont une fiche artisan (audit final, DOC-01) : sans fiche, la page garde sa propre
  // garde (verifierAccesArtisan), qui renvoie le locataire ou le gérant vers ses espaces et l'artisan neuf à l'inscription,
  // où il accepte déjà ces conditions avec son mot de passe.
  const [[agenda, sollicitations, pieces], autresEspaces, conditionsAAccepter] = await Promise.all([
    fiche
      ? Promise.all([chargerAgenda(), chargerSollicitations(), chargerPieces()])
      : Promise.resolve([null, null, null] as const),
    lireAutresEspaces(user.id),
    fiche ? conditionsArtisansAAccepter(supabase, user.id) : Promise.resolve(null),
  ]);

  // « Mes espaces » ne s'affiche que s'il mène ailleurs (audit du 27/09) : pour
  // un compte qui n'est qu'artisan, /espaces renvoie aussitôt ici, et le clic
  // ne servait à rien. Les autres espaces sont les adhésions actives d'un
  // autre rôle, et l'espace de locataire sorti (lecture seule), comme sur
  // /espaces. En cas d'échec de lecture, le lien reste : mieux vaut un clic
  // inutile qu'un espace introuvable.
  async function lireAutresEspaces(compte: string) {
    const { data, error } = await supabase
      .from("memberships")
      .select("role, status")
      .eq("account_id", compte);
    if (error) return true;
    return ((data ?? []) as { role: string; status: string }[]).some(
      (m) =>
        m.role !== "artisan" &&
        (m.status === "active" || (m.status === "inactive" && m.role === "locataire"))
    );
  }

  // Un seul compte pour l'onglet d'arrivée : ce qui attend un geste. Une
  // mission à accepter et un compte rendu non déposé sont deux urgences de
  // nature différente, mais la question de l'artisan est la même.
  const aFaireMaintenant =
    agenda?.lignes.filter(
      (l) =>
        l.statut === "proposee" || (l.statut === "en_cours" && !l.compte_rendu_depose)
    ).length ?? 0;
  // D18 (livraison 2) : une révision demandée compte comme un devis à chiffrer.
  const devisAChiffrer =
    sollicitations?.lignes.filter((l) => demandeAChiffrer(l.statut)).length ?? 0;
  // Le seuil de la pastille est J-30, pas l'expiration : prévenu le jour où
  // l'assurance tombe, l'artisan est déjà retiré des listes d'affectation
  // pour les travaux qui l'exigent (RM-8.2.2). RM-8.2.5 échelonne J-60/J-30/
  // J-7/J+0 ; l'onglet s'allume au deuxième seuil, le détail est sur la page.
  // Aucune pièce déposée allume aussi le point (tour du 24/09) : une liste
  // vide passait pour « à jour », alors que sans attestation l'artisan n'est
  // proposé à personne. Une lecture en échec, elle, n'allume rien.
  const aucunePiece = Boolean(pieces && !pieces.erreur && pieces.lignes.length === 0);
  const piecesAAJour =
    !aucunePiece &&
    !(pieces?.lignes ?? []).some((p) => {
      const degre = degreEcheance(p.jours_avant_echeance, p.expiree);
      return degre === "expiree" || degre === "critique" || degre === "proche";
    });

  // RM-8.2 / pivot du 2026-09-04 : tant que la plateforme n'a pas validé
  // l'inscription, aucune agence ne peut solliciter l'artisan. Le lui taire
  // le laisserait attendre des demandes qui ne viendront jamais.
  const enAttente = fiche?.statut_plateforme === "en_attente";
  const refuse = fiche?.statut_plateforme === "refuse";

  const nom = fiche?.raison_sociale ?? "Espace artisan";
  const initiales = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((mot) => mot[0]).join("");
  const compteLiens = [
    ...(fiche ? [{ href: "/artisan/entreprise", libelle: "Mon entreprise" }] : []),
    { href: "/compte", libelle: "Sécurité du compte" },
    ...(autresEspaces ? [{ href: "/espaces", libelle: "Mes espaces" }] : []),
  ];
  const navigation = { aFaireMaintenant, devisAChiffrer, piecesAAJour };

  return (
    <div className={`artisan-app experience-unifiee ${styles.shell}`}>
      <BandeauSessionSupervision />
      <div className={fiche ? styles.workspace : styles.onboarding}>
        {fiche && (
          <aside data-espace-menu className={`${styles.sidebar} ambiance-menu-artisan`}>
            <Link href="/artisan" aria-label="Accueil de mon espace artisan" className={styles.brand}>
              <MarqueGerimmo surEncre />
              <span>Espace artisan</span>
            </Link>
            <NavArtisan {...navigation} presentation="bureau" clientsExternes />
            <div className={styles.sidebarFoot}>
              <LienAssistance><CircleHelp size={19} aria-hidden /> Aide</LienAssistance>
              <span>Votre activité, en confiance.</span>
            </div>
          </aside>
        )}
        <div className={styles.body}>
          <header data-espace-entete className={`${styles.topbar} ambiance-haut-artisan`}>
            {/* De 700 à 999 px l'en-tête est blanc : tuile (D28 A, DES-B-10). Sous 700 px il est déjà bleu nuit,
                la feuille de style du portail efface alors la tuile. */}
            <Link href="/artisan" aria-label="Accueil de mon espace artisan" className={`${styles.mobileBrand} rounded-xl`}>
              <MarqueGerimmo tuile />
            </Link>
            <span className={styles.spaceLabel}><Wrench size={18} aria-hidden /> Espace artisan</span>
            <div className={styles.topbarActions}>
              <span className="ambiance-repere" aria-hidden="true" />
              <span data-aide-mobile><LienAssistance className={styles.help} title="Aide">
                <CircleHelp size={19} aria-hidden /><span>Aide</span>
              </LienAssistance></span>
              <MenuCompte initiales={initiales} titre={nom} liens={compteLiens} compteId={user.id} />
            </div>
          </header>
          {enAttente && (
            <p role="status" className={styles.pending}>
              Inscription en cours de validation par Gerimmo. Retrouvez vos pièces
              déposées et les justificatifs encore attendus dans « Mes attestations ».
              Vous pourrez recevoir de nouvelles demandes après validation.
            </p>
          )}
          {refuse && (
            <p role="alert" className={styles.refused}>
              Votre inscription a été refusée.
              {fiche?.statut_motif ? ` Motif\u00a0: ${fiche.statut_motif}` : ""}
            </p>
          )}
          <main className={`artisan-corps ${styles.content}`}>
            {conditionsAAccepter ? <AcceptationConditionsArtisans version={conditionsAAccepter.version} date={conditionsAAccepter.date} /> : children}
          </main>
        </div>
      </div>
      {fiche && <NavArtisan {...navigation} />}
    </div>
  );
}
