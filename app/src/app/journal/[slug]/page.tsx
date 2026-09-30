import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { EncartOutils } from "@/components/outils/encart-outils";
import { TexteMarkdown } from "@/components/texte-markdown";
import { OPEN_GRAPH_PAR_DEFAUT, descriptionArticle } from "@/lib/metadonnees-publiques";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import { dureeEssai } from "@/lib/tarifs";

// L'essai annoncé suit le jour (offre de lancement : 2 mois jusqu'au
// 31/12/2026, 1 mois ensuite) : la page se reconstruit au plus tard toutes
// les heures.
export const revalidate = 3600;

async function charger(slug: string) {
  const supabase = await createClient();
  // La RLS ne laisse voir que les articles parus : inutile de refiltrer ici,
  // mais on garde le filtre par sécurité si la politique changeait un jour.
  const { data } = await supabase
    .from("publications")
    .select("titre, chapo, corps, publie_le, seo_description, sources, veine")
    .eq("slug", slug)
    .eq("statut", "publiee")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/journal/[slug]">) {
  const { slug } = await params;
  const a = await charger(slug);
  if (!a) return { title: "Article introuvable — Gerimmo" };
  const description = descriptionArticle(a);
  const chemin = `/journal/${slug}`;
  return {
    title: `${titreSansDoublon(a.titre)} — Journal Gerimmo`,
    description,
    alternates: { canonical: chemin },
    openGraph: {
      ...OPEN_GRAPH_PAR_DEFAUT,
      type: "article",
      title: titreSansDoublon(a.titre),
      description,
      url: chemin,
      ...(a.publie_le ? { publishedTime: a.publie_le } : {}),
    },
  };
}

export default async function PageArticle({ params }: PageProps<"/journal/[slug]">) {
  const { slug } = await params;
  const a = await charger(slug);
  if (!a) notFound();

  const paruLe = a.publie_le
    ? new Date(a.publie_le).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    // flex-col : sans elle, le main.flex-1 ne poussait pas le pied en bas (24/09).
    <div className="flex min-h-full flex-1 flex-col bg-[var(--creme)]">
      <EnTetePublic />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-7 sm:py-14">
        <Link href="/journal" className="lien-discret text-[13px]">
          ← Journal
        </Link>

        <h1 className="mt-3 font-heading text-3xl leading-tight text-[var(--encre)] sm:text-4xl">
          {titreSansDoublon(a.titre)}
        </h1>
        {paruLe && <p className="mono-discret mt-2.5">Paru le {paruLe}</p>}
        {a.chapo && (
          <p className="mt-5 border-l-2 border-[var(--or)] pl-4 text-[16px] leading-relaxed text-[var(--texte-secondaire)]">
            {a.chapo}
          </p>
        )}

        <div className="mt-8 text-[15px]">
          <TexteMarkdown contenu={a.corps ?? ""} />
        </div>

        {/* Ce que le produit fait du sujet — sans quitter le ton de l'article.
            29/09 : « Ces règles… » ne se dit que sous un article de RÈGLE,
            c'est-à-dire né d'une veine éditoriale (publication_veines :
            révision, régularisation, restitution…). Sous un relais de veille
            ou un article sur le produit, la phrase ne voulait rien dire. */}
        <aside className="mt-12 border border-[var(--filet)] bg-[var(--ivoire)] p-5">
          <p className="eyebrow">Dans Gerimmo</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
            {a.veine ? (
              <>
                Ces règles ne sont pas qu&apos;un article : elles sont tenues par
                l&apos;application. Quittances émises à l&apos;encaissement, échéances qui
                vous trouvent, retenues justifiées ligne par ligne.
              </>
            ) : (
              <>
                Baux, quittances, incidents et documents restent reliés au
                logement concerné, et chaque locataire dispose de son espace.
              </>
            )}
          </p>
          <Link href="/inscription" className="btn-or mt-4">
            Créer mon compte — {dureeEssai()} d&apos;essai
          </Link>
        </aside>
        <div className="mt-6">
          <EncartOutils chapo="Révision de loyer, quittance, garantie des loyers, fiscalité du meublé, rentabilité : les calculs du bailleur, sans compte." />
        </div>
      </main>

      <PiedPublic />
    </div>
  );
}
