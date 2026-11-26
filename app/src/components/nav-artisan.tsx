"use client";

import Link from "next/link";
import { useState } from "react";
import { Tiroir } from "@/components/ui/tiroir";
import { LienAssistance } from "@/components/bouton-assistance";
import { usePathname } from "next/navigation";
import { Banknote, BookOpen, Building2, CalendarDays, FileCheck2, FileText, LayoutDashboard, Star, Users, type LucideIcon } from "lucide-react";
import styles from "@/app/artisan/portail-artisan.module.css";

/** Sur téléphone : quatre accès directs, puis le menu des autres rubriques. */

// Phase 3, lot 60 (E007, E124). « Nouveau chantier et devis » vit à l'adresse /artisan/devis/nouveau mais appartient aux
// clients externes (son retour y mène, son sous-titre dit « sans demande reçue par Gerimmo ») : comparée par son début,
// l'adresse allumait « Devis » — les demandes reçues par Gerimmo, avec leur badge. Elle est donc retirée de « Devis » et
// rattachée à « Clients externes », comme les fiches de chantier.
const PAGES_CLIENTS_EXTERNES = ["/artisan/chantiers", "/artisan/devis/nouveau"];
const SAUF_DEVIS = ["/artisan/devis/nouveau"];

/** Une entrée est allumée sur son adresse et ses sous-pages, sur les adresses rattachées (`aussi`), jamais sur celles retirées (`sauf`). */
export function entreeActive(pathname: string, e: { href: string; exact?: boolean; aussi?: string[]; sauf?: string[] }): boolean {
  if (e.exact) return pathname === e.href;
  if ((e.sauf ?? []).some((p) => pathname.startsWith(p))) return false;
  return pathname.startsWith(e.href) || (e.aussi ?? []).some((p) => pathname.startsWith(p));
}

const IC: Record<string, string> = {
  jour: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  agenda:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  devis: '<path d="M6.5 3h7l4.5 4.5V21h-11.5z"/><path d="M13.5 3v5h4.5M9 13h6M9 17h4"/>',
  factures: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  entreprise:
    '<path d="M4 20V9.5L12 4l8 5.5V20"/><path d="M9.5 20v-6h5v6"/>',
};

/** Les rubriques du menu du téléphone (celles qui n'ont pas d'onglet dans la barre du bas). */
export function entreesMenuArtisan({ clientsExternes, piecesAAJour }: { clientsExternes: boolean; piecesAAJour: boolean }): { href: string; libelle: string; aussi?: string[]; point?: boolean; aide?: boolean }[] {
  return [
    { href: "/artisan/entreprise", libelle: "Ma fiche entreprise" },
    { href: "/artisan/attestations", libelle: "Mes attestations", point: !piecesAAJour },
    ...(clientsExternes ? [{ href: "/artisan/clients", libelle: "Clients externes", aussi: PAGES_CLIENTS_EXTERNES }] : []),
    { href: "/artisan/note", libelle: "Mes évaluations" },
    { href: "/artisan/regles", libelle: "Les règles à connaître" },
    // Reprise du lot 60 (R7) : l'adresse était figée sur l'accueil (`ecran=/artisan`, `retour=/artisan`) ; ouverte depuis une
    // mission, l'aide partait avec le mauvais écran et « Retour » ne ramenait pas d'où l'on venait. L'entrée est rendue
    // par `LienAssistance`, comme le « ? » de l'en-tête : elle porte le chemin réel.
    { href: "/assistance", libelle: "Aide en cas de problème", aide: true },
  ];
}

function Icone({ nom }: { nom: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-6 shrink-0 fill-none stroke-current stroke-[1.6] [stroke-linecap:round] [stroke-linejoin:round]"
      dangerouslySetInnerHTML={{ __html: IC[nom] ?? "" }}
    />
  );
}

export function NavArtisan({
  aFaireMaintenant = 0,
  devisAChiffrer = 0,
  piecesAAJour = true,
  presentation = "mobile",
  clientsExternes = false,
}: {
  /**
   * Ce qui attend un geste de sa part sur l'écran d'arrivée : missions à
   * accepter (7.4) ET comptes rendus à déposer (7.5). Les deux comptent
   * ensemble parce que le badge répond à une seule question — « est-ce que
   * quelque chose m'attend ? » ; en séparer un dirait à l'artisan qu'il n'a
   * rien à faire alors qu'une facture attend son compte rendu.
   */
  presentation?: "mobile" | "bureau";
  clientsExternes?: boolean;
  aFaireMaintenant?: number;
  /** Demandes de devis encore à chiffrer (9.2). */
  devisAChiffrer?: number;
  /** Une pièce expirée ou proche de l'échéance met une pastille sur l'onglet. */
  piecesAAJour?: boolean;
}) {
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const entrees = [
    { href: "/artisan", libelle: "Aujourd'hui", icone: "jour", exact: true, badge: aFaireMaintenant },
    {
      href: "/artisan/agenda",
      libelle: "Agenda",
      icone: "agenda",
      // 24/09 : la fiche d'une mission (et ses créneaux, son compte rendu) vit
      // sous /artisan/missions ; sans ce rattachement, aucun onglet n'y était
      // allumé et l'artisan venu de son agenda perdait son repère.
      aussi: ["/artisan/missions"],
      badge: 0,
    },
    { href: "/artisan/devis", libelle: "Devis", icone: "devis", badge: devisAChiffrer, sauf: SAUF_DEVIS },
    // Q89 (relevé du 26/11, choix d'affichage délégué) : la même rubrique s'appelait « Factures » ici, « Ma facturation »
    // dans le menu latéral et en titre de la page. La barre garde ses libellés courts, sans possessif (« Agenda » pour
    // « Mon agenda ») : « Ma facturation » ne tient pas dans un onglet de 70 px à 390 px (71 px mesurés à 11 px dans
    // Figtree, graisse 300, avant la graisse 500 de l'onglet) et s'afficherait tronqué.
    { href: "/artisan/facturation", libelle: "Facturation", icone: "factures", badge: 0, point: false },
  ] as { href: string; libelle: string; icone: string; exact?: boolean; badge: number; aussi?: string[]; sauf?: string[]; point?: boolean }[];

  if (presentation === "bureau") {
    const groupes: { titre: string; liens: { href: string; libelle: string; icone: LucideIcon; exact?: boolean; badge?: number; aussi?: string[]; sauf?: string[]; point?: boolean }[] }[] = [
      { titre: "Mon activité", liens: [
        { href: "/artisan", libelle: "Aujourd’hui", icone: LayoutDashboard, exact: true, badge: aFaireMaintenant },
        { href: "/artisan/agenda", libelle: "Mon agenda", icone: CalendarDays, aussi: ["/artisan/missions"] },
        { href: "/artisan/devis", libelle: "Demandes de devis", icone: FileText, badge: devisAChiffrer, sauf: SAUF_DEVIS },
        { href: "/artisan/facturation", libelle: "Ma facturation", icone: Banknote },
        ...(clientsExternes ? [{ href: "/artisan/clients", libelle: "Clients externes", icone: Users, aussi: PAGES_CLIENTS_EXTERNES }] : []),
      ] },
      { titre: "Mon entreprise", liens: [
        { href: "/artisan/entreprise", libelle: "Ma fiche entreprise", icone: Building2 },
        { href: "/artisan/attestations", libelle: "Mes attestations", icone: FileCheck2, point: !piecesAAJour },
        { href: "/artisan/note", libelle: "Mes évaluations", icone: Star },
        { href: "/artisan/regles", libelle: "Les règles à connaître", icone: BookOpen },
      ] },
    ];
    return (
      <nav aria-label="Mon espace artisan" className={styles.desktopNav}>
        {groupes.map((groupe) => (
          <div key={groupe.titre}>
            <p>{groupe.titre}</p>
            <ul>
              {groupe.liens.map((lien) => {
                const actif = entreeActive(pathname, lien);
                const IconeMenu = lien.icone;
                return (
                  <li key={lien.href}>
                    <Link href={lien.href} aria-current={actif ? "page" : undefined}>
                      <IconeMenu size={19} aria-hidden /><span>{lien.libelle}</span>
                      {Boolean(lien.badge) && <span className={styles.navBadge}>{lien.badge}<span className="sr-only"> en attente</span></span>}
                      {lien.point && <span className={styles.navPoint}><span className="sr-only">Attestations à déposer ou à renouveler</span></span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <>
    <nav
      aria-label="Mon espace artisan"
      className={`artisan-navigation ${styles.mobileNav} fixed inset-x-0 bottom-0 z-30 border-t border-[var(--filet)] bg-[var(--ivoire)] pb-[env(safe-area-inset-bottom)]`}
    >
      <ul className="mx-auto flex w-full max-w-[960px]">
        {entrees.map((e) => {
          const actif = entreeActive(pathname, e);
          const nb = e.badge ?? 0;
          return (
            <li key={e.href} className="min-w-0 flex-1">
              <Link
                href={e.href}
                aria-current={actif ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-colors ${
                  actif
                    ? "text-[var(--encre)]"
                    : "text-[var(--texte-secondaire)] hover:text-[var(--encre)]"
                }`}
              >
                {actif && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 top-0 h-[3px] rounded-b bg-[var(--prestige-champagne)]"
                  />
                )}
                <span className="relative">
                  <Icone nom={e.icone} />
                  {nb > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-[var(--marque)] px-1 text-center text-[11px] leading-5 font-medium text-[var(--sur-marque)]"
                    >
                      {nb > 9 ? "9+" : nb}
                    </span>
                  )}
                  {nb === 0 && e.point && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1.5 size-2.5 rounded-full bg-[var(--warning)]"
                    />
                  )}
                </span>
                <span className="w-full truncate text-[0.6875rem] leading-tight font-medium">
                  {e.libelle}
                </span>
                {nb > 0 ? <span className="sr-only"> — {nb} en attente</span> : e.point ? <span className="sr-only"> — attestations à déposer ou à renouveler</span> : null}
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">{/* `data-assistance` (reprise du lot 60, R7) : ouvrir le menu pour atteindre l'aide ne remplace pas la dernière action rapportée avec la demande (bouton-assistance.tsx). */}<button type="button" data-assistance aria-haspopup="dialog" aria-expanded={menuOuvert} onClick={() => setMenuOuvert(true)} className="relative flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[var(--encre)]"><Icone nom="menu" /><span className="text-[0.6875rem] font-medium">Menu</span>{!piecesAAJour && <span className="absolute right-3 top-2 size-2 rounded-full bg-[var(--warning)]"><span className="sr-only">Attestations à déposer ou à renouveler</span></span>}</button></li>
      </ul>
    </nav>
    {/* Phase 3, lot 60.
        E001 : « Aide en cas de problème » menait à /artisan/panne, la page d'échec de lecture de la fiche : l'artisan
        qui cherchait de l'aide y lisait une panne qui n'avait pas eu lieu. L'entrée mène à la page d'aide.
        E003, E008 : le point orange du bouton « Menu » n'était repris par aucune entrée du menu ouvert ; il est posé
        sur « Mes attestations », avec les mêmes mots qu'en présentation bureau.
        E121, E127 : la page s'appelle « Ma fiche entreprise » partout (« Mon entreprise » reste le titre du groupe du menu bureau). */}
    {menuOuvert && <Tiroir titre="Menu artisan" fermer={() => setMenuOuvert(false)}><nav aria-label="Autres rubriques artisan" className="grid gap-1">
      {entreesMenuArtisan({ clientsExternes, piecesAAJour }).map((e) => e.aide ? <LienAssistance key={e.href} nomVisible onClick={() => setMenuOuvert(false)} className="flex min-h-12 items-center gap-2 rounded-[var(--rayon-bouton)] px-3 text-[0.9375rem] font-medium text-[var(--encre)] transition-colors hover:bg-[var(--survol)]">{e.libelle}</LienAssistance> : <Link key={e.href} href={e.href} aria-current={entreeActive(pathname, e) ? "page" : undefined} onClick={() => setMenuOuvert(false)} className="flex min-h-12 items-center gap-2 rounded-[var(--rayon-bouton)] px-3 text-[0.9375rem] font-medium text-[var(--encre)] transition-colors hover:bg-[var(--survol)] aria-[current=page]:bg-[var(--filet-leger)] aria-[current=page]:font-semibold">{e.libelle}{e.point && <span data-point-attestations className="ml-auto size-2.5 shrink-0 rounded-full bg-[var(--warning)]"><span className="sr-only"> — attestations à déposer ou à renouveler</span></span>}</Link>)}
    </nav></Tiroir>}
    </>
  );
}
