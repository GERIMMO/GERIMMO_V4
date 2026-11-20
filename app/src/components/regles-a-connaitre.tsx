/**
 * « Les règles à connaître », DANS la coquille d'un espace (20/11/2026).
 *
 * Le menu de l'agence et celui du locataire ouvraient `/veille` : une page servie hors de l'espace, sans menu, avec
 * un seul lien de retour. Seul l'artisan lisait ses règles dans sa coquille (`/artisan/regles`, 25/09). Ce composant
 * porte le même contenu que `/veille` — même table, mêmes onglets (décision D33), mêmes textes — pour les pages
 * `/agence/<id>/regles` (aussi servie sous `/espace/<id>/regles`) et `/locataire/<id>/regles`.
 *
 * Aucune lecture nouvelle : `regulatory_watch_published`, les informations validées et publiées, sous les mêmes
 * politiques que `/veille`. Aucune écriture.
 */
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TitreEcran } from "@/components/titre-ecran";
import { texteVeillePourPublic } from "@/lib/veille-public";
import { ONGLETS_VEILLE, PUBLICS_VEILLE, sourceVeille } from "@/lib/veille-reglementaire";

export const REGLES_PAR_PAGE = 20;
/** Dans l'adresse, « tous » lève le filtre : sans paramètre, la page ouvre sur le public du profil. */
export const TOUS_LES_PUBLICS = "tous";

export type PublicVeille = keyof typeof PUBLICS_VEILLE;
export type RegleAConnaitre = {
  id: string;
  titre: string;
  resume: string;
  action_conseillee: string;
  publics: string[];
  source_nom: string;
  source_url: string;
  application_le: string | null;
  valide_le: string;
};
type Recherche = Record<string, string | string[] | undefined>;

/**
 * Lit `?public` et `?page`. Sans `?public`, le public du profil ; « tous » (ou une valeur inconnue) lève le filtre.
 * « artisan » n'est pas proposé ici : l'artisan lit ses règles dans son propre espace.
 */
export function parametresRegles(recherche: Recherche, publicDuProfil: PublicVeille): { publicChoisi: PublicVeille | null; page: number } {
  const brut = typeof recherche.public === "string" ? recherche.public : undefined;
  const publicChoisi = brut === undefined
    ? publicDuProfil
    : brut !== "artisan" && Object.hasOwn(PUBLICS_VEILLE, brut) ? (brut as PublicVeille) : null;
  const pageBrute = typeof recherche.page === "string" ? Number.parseInt(recherche.page, 10) : 1;
  return { publicChoisi, page: Math.max(1, Math.min(1000, pageBrute || 1)) };
}

/** L'adresse d'un onglet ou d'une page, sous la page « règles » de l'espace. */
export function lienRegles(adresse: string, publicCible: PublicVeille | null, page = 1): string {
  const requete = new URLSearchParams({ public: publicCible ?? TOUS_LES_PUBLICS });
  if (page > 1) requete.set("page", String(page));
  return `${adresse}?${requete}`;
}

/** La même lecture que `/veille` : les informations publiées, les plus récentes d'abord, par pages de vingt. */
export async function lireRegles(supabase: SupabaseClient, publicChoisi: PublicVeille | null, page: number) {
  let requete = supabase
    .from("regulatory_watch_published")
    .select("id,titre,resume,action_conseillee,publics,source_nom,source_url,application_le,valide_le", { count: "exact" })
    .order("valide_le", { ascending: false })
    .order("id")
    .range((page - 1) * REGLES_PAR_PAGE, page * REGLES_PAR_PAGE - 1);
  if (publicChoisi) requete = requete.contains("publics", [publicChoisi]);
  const { data, error, count } = await requete;
  return { lignes: (data ?? []) as RegleAConnaitre[], total: count ?? 0, echec: Boolean(error) };
}

const jour = (date: string) => new Date(date).toLocaleDateString("fr-FR");

export function ReglesAConnaitre({
  adresse,
  accueil,
  libelleAccueil,
  publicChoisi,
  page,
  lignes,
  total,
  echec,
}: {
  /** L'adresse de la page dans l'espace, sans requête : `/agence/<id>/regles`, `/espace/<id>/regles`, `/locataire/<id>/regles`. */
  adresse: string;
  /** L'accueil de l'espace, pour l'état vide. */
  accueil: string;
  libelleAccueil: string;
  publicChoisi: PublicVeille | null;
  page: number;
  lignes: RegleAConnaitre[];
  total: number;
  echec: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / REGLES_PAR_PAGE));
  return (
    <div className="space-y-5">
      <header className="entete-page">
        <div>
          <TitreEcran rubrique="journal">Les règles à connaître</TitreEcran>
          <p className="mt-2 text-[0.9375rem] text-[var(--texte-secondaire)]">
            Ce qui change pour votre activité ou votre location, et les démarches à prévoir.
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Informations par public">
        <Link href={lienRegles(adresse, null)} aria-current={!publicChoisi ? "page" : undefined} className={`filtre inline-flex min-h-11 items-center${!publicChoisi ? " actif" : ""}`}>
          Tout voir
        </Link>
        {ONGLETS_VEILLE.map(cle => (
          <Link key={cle} href={lienRegles(adresse, cle)} aria-current={publicChoisi === cle ? "page" : undefined} className={`filtre inline-flex min-h-11 items-center${publicChoisi === cle ? " actif" : ""}`}>
            {PUBLICS_VEILLE[cle]}
          </Link>
        ))}
      </nav>

      {echec ? (
        <p role="alert" className="err">Les informations sont momentanément indisponibles. Rechargez dans un instant.</p>
      ) : lignes.length === 0 ? (
        <div className="vide-guide">
          <p className="titre">
            {publicChoisi ? `Aucune nouvelle règle pour ${PUBLICS_VEILLE[publicChoisi].toLowerCase()} pour l’instant.` : "Aucune nouvelle règle publiée pour l’instant."}
          </p>
          <p className="explication">Ce qui vous concerne apparaîtra ici, relu avant publication.</p>
          <div className="geste">
            <Link className="btn-secondaire" href={accueil}>{libelleAccueil}</Link>
          </div>
        </div>
      ) : (
        lignes.map(regle => {
          const source = sourceVeille(regle.source_url);
          return (
            <article key={regle.id} className="loc-carte">
              <div className="flex flex-wrap gap-2">
                {regle.publics.map(cle => (
                  <span key={cle} className="puce puce-prep">{PUBLICS_VEILLE[cle as PublicVeille] ?? cle}</span>
                ))}
              </div>
              <h2 className="mt-3 text-xl font-semibold">{regle.titre}</h2>
              <p className="mt-3 whitespace-pre-line">{texteVeillePourPublic(regle.resume, regle.publics, publicChoisi, false)}</p>
              <div className="mt-4 rounded-[var(--rayon-bouton)] border border-[var(--or-filet)] bg-[var(--or-clair)] p-4">
                <h3 className="font-semibold">Ce que vous pouvez prévoir</h3>
                <p className="mt-2 whitespace-pre-line">{texteVeillePourPublic(regle.action_conseillee, regle.publics, publicChoisi, true)}</p>
              </div>
              <p className="mt-3 text-sm">
                {regle.application_le
                  ? `Application annoncée : ${new Date(`${regle.application_le}T12:00:00Z`).toLocaleDateString("fr-FR")}.`
                  : "Date d’application à vérifier dans la source selon votre situation."}
              </p>
              {source && (
                <a className="mt-1 inline-flex min-h-11 items-center underline underline-offset-4" href={source} target="_blank" rel="noreferrer">
                  Consulter {regle.source_nom}
                </a>
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Information relue le {jour(regle.valide_le)}. Vérifiez les conditions et les règles locales dans la source avant d’agir.
              </p>
            </article>
          );
        })
      )}

      {(page > 1 || page < pages) && !echec && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {page > 1 ? <Link className="btn-secondaire min-h-11" href={lienRegles(adresse, publicChoisi, page - 1)}>← Précédente</Link> : <span />}
          <span>Page {page} sur {pages}</span>
          {page < pages ? <Link className="btn-secondaire min-h-11" href={lienRegles(adresse, publicChoisi, page + 1)}>Suivante →</Link> : <span />}
        </nav>
      )}

      <p className="text-sm text-muted-foreground">
        Cette sélection aide à repérer les changements. Elle ne remplace pas l’examen de votre situation par un professionnel compétent.
      </p>
    </div>
  );
}
