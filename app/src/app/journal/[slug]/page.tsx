import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { TexteMarkdown } from "@/components/texte-markdown";

async function charger(slug: string) {
  const supabase = await createClient();
  // La RLS ne laisse voir que les articles parus : inutile de refiltrer ici,
  // mais on garde le filtre par sécurité si la politique changeait un jour.
  const { data } = await supabase
    .from("publications")
    .select("titre, chapo, corps, publie_le, seo_description, sources")
    .eq("slug", slug)
    .eq("statut", "publiee")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/journal/[slug]">) {
  const { slug } = await params;
  const a = await charger(slug);
  if (!a) return { title: "Article introuvable — Gerimmo" };
  return {
    title: `${a.titre} — Journal Gerimmo`,
    description: a.seo_description ?? a.chapo ?? undefined,
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
    <div className="min-h-full bg-[var(--creme)]">
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <EnTetePublic compact />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-7 sm:py-14">
        <Link href="/journal" className="lien-discret text-[13px]">
          ← Journal
        </Link>

        <h1 className="mt-3 font-heading text-3xl leading-tight text-[var(--encre)] sm:text-4xl">
          {a.titre}
        </h1>
        {paruLe && <p className="mono-discret mt-2.5 !text-[10px]">Paru le {paruLe}</p>}
        {a.chapo && (
          <p className="mt-5 border-l-2 border-[var(--or)] pl-4 text-[16px] leading-relaxed text-[var(--texte-secondaire)]">
            {a.chapo}
          </p>
        )}

        <div className="mt-8 text-[15px]">
          <TexteMarkdown contenu={a.corps ?? ""} />
        </div>

        {/* Ce que le produit fait du sujet — sans quitter le ton de l'article */}
        <aside className="mt-12 border border-[var(--filet)] bg-[var(--ivoire)] p-5">
          <p className="eyebrow">Dans Gerimmo</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--texte-secondaire)]">
            Ces règles ne sont pas qu&apos;un article : elles sont tenues par
            l&apos;application. Quittances émises à l&apos;encaissement, échéances qui
            vous trouvent, retenues justifiées ligne par ligne.
          </p>
          <Link href="/inscription" className="btn-or mt-4">
            Commencer — 1ᵉʳ bien offert
          </Link>
        </aside>
      </main>

      <PiedPublic />
    </div>
  );
}
