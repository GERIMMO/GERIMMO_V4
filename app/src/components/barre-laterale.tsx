"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { MarqueOrganisation } from "@/components/marque-organisation";
import { Tiroir } from "@/components/ui/tiroir";
import { IconeTrait } from "@/components/icone-trait";
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

function Icone({ nom }: { nom: string }) {
  return <IconeTrait nom={nom} />;
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
  marque,
}: {
  orgId: string;
  /** Le mot sous la marque : « Espace agence », « Mon espace ». */
  espace: string;
  navigation: NavigationEspace;
  /** Le propriétaire qui a plusieurs organisations (SCI, nom propre) choisit ici. */
  organisations?: OrganisationDuSelecteur[];
  /** L'essai en cours, s'il y en a un : jours restants (négatif = terminé) et où l'on paie. */
  essai?: { jours: number; href: string } | null;
  marque?: { nom?: string | null; logoUrl?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const toutes = [...navigation.principales, ...navigation.secondaires];
  const active = entreeActive(toutes, pathname);
  const secondaireActive = navigation.secondaires.some((e) => e === active);

  return (
    <>
      <div className="coquille-marque">
        <Link href={`/agence/${orgId}`} aria-label="Accueil" className="flex min-w-0 max-w-full items-center gap-2.5 overflow-hidden">
          <MarqueOrganisation marque={{ nom_portail: marque?.nom, logo_url: marque?.logoUrl }} />
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
