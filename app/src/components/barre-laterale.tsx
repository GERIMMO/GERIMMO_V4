"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { Tiroir } from "@/components/ui/tiroir";
import {
  entreeActive,
  entreesBarreBasse,
  type EntreeNav,
  type NavigationEspace,
} from "@/lib/navigation-espace";

/**
 * LA BARRE LATÉRALE v4 — une seule pour les trois rôles de l'espace agence.
 *
 * Avant : deux composants (`nav-agence-premium`, `nav-proprietaire`) avec
 * chacun ses icônes, ses règles et son rendu ; le locataire et l'artisan en
 * ont deux autres. Celle-ci reçoit ses ENTRÉES calculées côté serveur
 * (`navigationEspace`) et ne sait que les dessiner — à trois largeurs :
 *  · ≥ 1024 px : colonne de 232 px, icône + libellé ;
 *  · 641–1023 px : rail d'icônes, le libellé en infobulle ;
 *  · ≤ 640 px : barre basse de quatre entrées + « Menu » qui ouvre un tiroir
 *    avec tout. Un téléphone n'est pas un ordinateur rétréci.
 */

// Un seul trait, 1,6 px, arrondi : les icônes se lisent comme une famille.
const ICONES: Record<string, string> = {
  maison: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11h13V9"/>',
  parc: '<path d="M3 21V9l6-4 6 4v12"/><path d="M15 21V11l6-3v13M7 13h2M7 17h2"/>',
  cle: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M17 12v3M20.5 12v2"/>',
  gens: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3.5 3.5 0 0 1 0 7M15.5 13.5A6 6 0 0 1 21 20"/>',
  euro: '<path d="M17 5.5A7 7 0 0 0 6.5 12 7 7 0 0 0 17 18.5M4 10h9M4 14h9"/>',
  outil: '<path d="M14.5 6.5a4 4 0 0 0-5.6 4.9L4 16.3V20h3.7l4.9-4.9a4 4 0 0 0 4.9-5.6L15 12l-3-3z"/>',
  livre: '<path d="M4 4h9a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M17 8h3v12h-9"/>',
  cloche: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  bulle: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
  roue: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
  mallette: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2M3 13h18"/>',
  carte: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  cles: '<path d="M12 15a4 4 0 1 0-4-4"/><path d="M4 20l6-6M7 17l2 2"/><circle cx="16" cy="8" r="3"/>',
  quest: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7M12 17h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

function Icone({ nom }: { nom: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: ICONES[nom] ?? "" }} />;
}

function Badge({ e }: { e: EntreeNav }) {
  const nb = e.badge ?? 0;
  if (nb <= 0) return null;
  return (
    <span className={`coquille-badge${e.critique ? " critique" : ""}`} aria-hidden="true">
      {nb > 99 ? "99+" : nb}
    </span>
  );
}

function Entree({ e, active, onClick }: { e: EntreeNav; active: boolean; onClick?: () => void }) {
  const nb = e.badge ?? 0;
  return (
    <Link
      href={e.href}
      className={active ? "actif" : undefined}
      aria-current={active ? "page" : undefined}
      title={e.libelle}
      aria-label={nb > 0 ? `${e.libelle}, ${nb} élément${nb > 1 ? "s" : ""} à traiter` : undefined}
      onClick={onClick}
    >
      <Icone nom={e.icone} />
      <span className="lib">{e.libelle}</span>
      <Badge e={e} />
    </Link>
  );
}

export type OrganisationDuSelecteur = { id: string; nom: string };

export function BarreLaterale({
  orgId,
  espace,
  navigation,
  organisations = [],
  essai,
}: {
  orgId: string;
  /** Le mot sous la marque : « Espace agence », « Mon espace ». */
  espace: string;
  navigation: NavigationEspace;
  /** Le propriétaire qui a plusieurs organisations (SCI, nom propre) choisit ici. */
  organisations?: OrganisationDuSelecteur[];
  /** L'essai en cours, s'il y en a un : jours restants (négatif = terminé) et où l'on paie. */
  essai?: { jours: number; href: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toutes = [...navigation.principales, ...navigation.secondaires];
  const active = entreeActive(toutes, pathname);
  const secondaireActive = navigation.secondaires.some((e) => e === active);

  return (
    <>
      <div className="coquille-marque">
        <Link href={`/agence/${orgId}`} aria-label="Accueil" className="flex items-center gap-2.5">
          <MarqueGerimmo />
        </Link>
      </div>

      {organisations.length > 1 && (
        <div className="px-3 pb-2">
          <label htmlFor="selecteur-organisation" className="sr-only">
            Organisation
          </label>
          <select
            id="selecteur-organisation"
            value={orgId}
            onChange={(ev) => router.push(`/agence/${ev.target.value}`)}
            className="w-full rounded-lg border border-[var(--trait)] bg-[var(--surface)] px-2 py-1.5 text-[12.5px] text-[var(--texte)]"
          >
            {organisations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="coquille-menu" aria-label={espace}>
        {navigation.principales.map((e) => (
          <Entree key={e.href} e={e} active={e === active} />
        ))}
        {navigation.secondaires.length > 0 && (
          <details className="coquille-groupe" open={secondaireActive || undefined}>
            <summary title="Plus">
              <Icone nom="menu" />
              <span className="lib">Plus</span>
              <span className="chevron" aria-hidden>
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </summary>
            <div>
              {navigation.secondaires.map((e) => (
                <Entree key={e.href} e={e} active={e === active} />
              ))}
            </div>
          </details>
        )}
      </nav>

      {essai && (
        <div className="coquille-pied">
          <Link href={essai.href} className={`coquille-essai${essai.jours < 0 ? " termine" : ""}`}>
            <span>
              Essai gratuit
              <br />
              <b>{essai.jours < 0 ? "terminé" : `${essai.jours} jour${essai.jours > 1 ? "s" : ""} restant${essai.jours > 1 ? "s" : ""}`}</b>
            </span>
            <span aria-hidden>›</span>
          </Link>
        </div>
      )}
    </>
  );
}

/** La barre basse du téléphone, et son tiroir « Menu ». */
export function BarreBasse({
  espace,
  navigation,
}: {
  espace: string;
  navigation: NavigationEspace;
}) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const toutes = [...navigation.principales, ...navigation.secondaires];
  const active = entreeActive(toutes, pathname);
  const rapides = entreesBarreBasse(navigation);
  const resteACompter = toutes
    .filter((e) => !rapides.includes(e))
    .reduce((s, e) => s + (e.badge ?? 0), 0);

  return (
    <>
      <nav className="coquille-basse" aria-label={`${espace} (téléphone)`}>
        {rapides.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className={e === active ? "actif" : undefined}
            aria-current={e === active ? "page" : undefined}
            // Le mot visible est court ; le nom lu au lecteur d'écran reste entier.
            aria-label={(e.badge ?? 0) > 0 ? `${e.libelle}, ${e.badge} élément${(e.badge ?? 0) > 1 ? "s" : ""} à traiter` : e.libelle}
          >
            <Icone nom={e.icone} />
            <span aria-hidden="true">{e.court ?? e.libelle}</span>
            <Badge e={e} />
          </Link>
        ))}
        <button type="button" onClick={() => setOuvert(true)} aria-haspopup="dialog" aria-expanded={ouvert}>
          <Icone nom="menu" />
          <span>Menu</span>
          {resteACompter > 0 && (
            <span className="coquille-badge" aria-hidden="true">
              {resteACompter > 99 ? "99+" : resteACompter}
            </span>
          )}
        </button>
      </nav>
      {ouvert && (
        <Tiroir titre="Menu" fermer={() => setOuvert(false)}>
          <nav className="coquille-menu" aria-label={`${espace} (tout)`}>
            {toutes.map((e) => (
              <Entree key={e.href} e={e} active={e === active} onClick={() => setOuvert(false)} />
            ))}
          </nav>
        </Tiroir>
      )}
    </>
  );
}
