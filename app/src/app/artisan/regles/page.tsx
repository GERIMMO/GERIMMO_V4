import Link from "next/link";
import { verifierAccesArtisan } from "../acces";
import { PUBLICS_VEILLE, sourceVeille } from "@/lib/veille-reglementaire";
import { dateSimple } from "../libelles";
import { Carte, CLASSE_AIDE, EnteteSousPage, Erreur, Retour, TitreSection, Vide } from "../ui";

export const metadata = { title: "Les règles à connaître — Espace artisan" };

const PAR_PAGE = 20;

/**
 * Les règles à connaître pour un artisan — DANS sa coquille.
 *
 * 25/09 (A18) : `/veille?public=artisan` s'ouvrait hors de l'espace artisan
 * (ni barre d'onglets, ni en-tête standard), sous un hero bleu plein, avec
 * les filtres des quatre autres publics. Cet écran lit la même table
 * (`regulatory_watch_published`, aucune lecture nouvelle), ne montre que ce
 * qui concerne les artisans, et l'état vide ramène à « Mon entreprise ».
 */
export default async function PageReglesArtisan(props: PageProps<"/artisan/regles">) {
  const { supabase } = await verifierAccesArtisan();
  const { page: pageBrute } = await props.searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(pageBrute ?? "1")) || 1));

  const { data, error, count } = await supabase
    .from("regulatory_watch_published")
    .select("id,titre,resume,action_conseillee,publics,source_nom,source_url,application_le,valide_le", {
      count: "exact",
    })
    .contains("publics", ["artisan"])
    .order("valide_le", { ascending: false })
    .order("id")
    .range((page - 1) * PAR_PAGE, page * PAR_PAGE - 1);

  const lignes = (data ?? []) as {
    id: string;
    titre: string;
    resume: string;
    action_conseillee: string;
    publics: string[];
    source_nom: string;
    source_url: string;
    application_le: string | null;
    valide_le: string;
  }[];

  return (
    <div className="space-y-6">
      <Retour href="/artisan/entreprise">Mon entreprise</Retour>

      <EnteteSousPage
        titre="Les règles à connaître"
        mention={`Ce qui change pour les ${PUBLICS_VEILLE.artisan.toLowerCase()}, et les démarches à prévoir`}
      />

      {error ? (
        <Erreur>Les informations sont momentanément indisponibles. Rechargez dans un instant.</Erreur>
      ) : lignes.length === 0 ? (
        <Vide action={{ href: "/artisan/entreprise", libelle: "Revenir à mon entreprise" }}>
          Aucune nouvelle règle pour les artisans pour l&apos;instant. Ce qui vous
          concerne apparaîtra ici, relu avant publication.
        </Vide>
      ) : (
        lignes.map((i) => {
          const source = sourceVeille(i.source_url);
          return (
            <Carte key={i.id}>
              <TitreSection>{i.titre}</TitreSection>
              <p className="whitespace-pre-line text-base text-[var(--corps)]">{i.resume}</p>
              <div className="mt-4 rounded-lg bg-[var(--marque-clair)] p-4">
                <p className="font-medium text-[var(--encre)]">Ce que vous pouvez prévoir</p>
                <p className="mt-2 whitespace-pre-line text-[0.9375rem] text-[var(--corps)]">
                  {i.action_conseillee}
                </p>
              </div>
              <p className={`mt-3 ${CLASSE_AIDE}`}>
                {i.application_le
                  ? `Application annoncée : ${dateSimple(i.application_le)}.`
                  : "Date d'application à vérifier dans la source selon votre situation."}
              </p>
              {source && (
                <a
                  className="mt-1 inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
                  href={source}
                  target="_blank"
                  rel="noreferrer"
                >
                  Consulter {i.source_nom}
                </a>
              )}
              <p className={`mt-2 ${CLASSE_AIDE}`}>
                Information relue le {dateSimple(i.valide_le)}. Vérifiez les conditions et
                les règles locales dans la source avant d&apos;agir.
              </p>
            </Carte>
          );
        })
      )}

      {(page > 1 || page * PAR_PAGE < (count ?? 0)) && (
        <nav aria-label="Pagination" className="flex justify-between">
          {page > 1 ? (
            <Link
              href={`/artisan/regles?page=${page - 1}`}
              className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            >
              Précédente
            </Link>
          ) : (
            <span />
          )}
          {page * PAR_PAGE < (count ?? 0) && (
            <Link
              href={`/artisan/regles?page=${page + 1}`}
              className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium text-[var(--encre)] underline underline-offset-4"
            >
              Suivante
            </Link>
          )}
        </nav>
      )}

      <Carte>
        <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
          Cette sélection aide à repérer les changements. Elle ne remplace pas
          l&apos;examen de votre situation par un professionnel compétent.
        </p>
      </Carte>
    </div>
  );
}
