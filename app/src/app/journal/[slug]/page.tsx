import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { EncartOutils } from "@/components/outils/encart-outils";
import { DemandeRappel } from "@/components/demande-rappel";
import { TexteMarkdown } from "@/components/texte-markdown";
import { OPEN_GRAPH_PAR_DEFAUT, descriptionArticle } from "@/lib/metadonnees-publiques";
import { ImageJournal, imageArticle } from "@/components/image-journal";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import { dureeEssai } from "@/lib/tarifs";
import { DonneesStructurees } from "@/components/donnees-structurees";
import { articleJournal, filAriane } from "@/lib/donnees-structurees";
import { adresseCanonique } from "@/lib/site";
import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";
import { MentionIaArticle } from "@/components/mention-ia-article";

export const revalidate = 3600;

async function charger(slug: string) {
  const supabase = await createClient();
  // La RLS ne laisse voir que les articles parus : inutile de refiltrer ici,
  // mais on garde le filtre par sécurité si la politique changeait un jour.
  const { data } = await supabase
    .from("publications")
    .select("titre, chapo, corps, publie_le, updated_at, seo_description, sources, veine, facebook_image_url, origine")
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
  // 06/10 : l'aperçu de partage montre l'illustration de l'article (1536×1024,
  // telle quelle : Facebook et LinkedIn recadrent), et non plus le logo carré.
  const image = imageArticle(a.facebook_image_url);
  const images = image.repli ? OPEN_GRAPH_PAR_DEFAUT.images : [{ url: image.src, width: 1536, height: 1024, alt: titreSansDoublon(a.titre) }];
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
      images,
      ...(a.publie_le ? { publishedTime: a.publie_le } : {}),
    },
    twitter: { card: "summary_large_image", title: titreSansDoublon(a.titre), description, images: images.map((i) => i.url) },
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

  const site = adresseCanonique();
  const chemin = `/journal/${slug}`;
  const titre = titreSansDoublon(a.titre);
  // L'illustration de repli est un SVG, que Google ne retient pas pour un article : le logo la remplace ici.
  const illustration = imageArticle(a.facebook_image_url);
  return (
    // flex-col : sans elle, le main.flex-1 ne poussait pas le pied en bas (24/09).
    <div className="site-public flex min-h-full flex-1 flex-col">
      {/* Pour les moteurs de recherche (20/11/2026) : l'article (titre, image, dates, éditeur) et son fil d'Ariane. */}
      <DonneesStructurees
        donnees={[
          articleJournal(site, {
            chemin,
            titre,
            description: descriptionArticle(a),
            image: illustration.repli ? CHARTE_GERIMMO.logo : illustration.src,
            logo: CHARTE_GERIMMO.logo,
            publieLe: a.publie_le,
            modifieLe: a.updated_at,
          }),
          filAriane(site, [
            { nom: "Accueil", chemin: "/" },
            { nom: "Le journal", chemin: "/journal" },
            { nom: titre, chemin },
          ]),
        ]}
      />
      <EnTetePublic />

      <main className="public-lecture flex-1">
        {/* Lien de retour au format commun : « ← Libellé de la page d'arrivée », au-dessus du titre. */}
        <Link href="/journal" className="public-retour">
          ← Le journal
        </Link>

        <h1 className="mt-1">{titreSansDoublon(a.titre)}</h1>
        {paruLe && <p className="mono-discret mt-2.5">Paru le {paruLe}</p>}
        {/* Décision du 24/11/2026 (Q13) : la mention est visible sous la date, pour un article d'origine « ia » (M4). */}
        <MentionIaArticle origine={a.origine} className="mono-discret sans-majuscules mt-1" />
        {/* 06/10 : l'illustration de l'article en tête, format large. */}
        <ImageJournal url={a.facebook_image_url} titre={titreSansDoublon(a.titre)} priorite className="mt-6" />
        {a.chapo && (
          <p className="public-article-chapo mt-5">{a.chapo}</p>
        )}

        <div className="mt-8 text-[15px]">
          <TexteMarkdown contenu={a.corps ?? ""} />
        </div>

        {/* Ce que le produit fait du sujet — sans quitter le ton de l'article.
            29/09 : « Ces règles… » ne se dit que sous un article de RÈGLE,
            c'est-à-dire né d'une veine éditoriale (publication_veines :
            révision, régularisation, restitution…). Sous un relais de veille
            ou un article sur le produit, la phrase ne voulait rien dire. */}
        <aside className="loc-carte mt-12" data-appel-inscription>
          <p className="eyebrow">Dans Gerimmo</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
            {a.veine ? (
              <>
                Depuis le dossier du logement, vous pouvez préparer une quittance
                à partir des encaissements enregistrés et retrouver les documents du bail.
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
        {/* « Être rappelé » (20/11) : le lecteur qui préfère un appel laisse son numéro. */}
        <div className="mt-6">
          <DemandeRappel origine={`/journal/${slug}`} />
        </div>
      </main>

      <PiedPublic />
    </div>
  );
}
