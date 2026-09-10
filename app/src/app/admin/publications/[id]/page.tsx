import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditeurPublication } from "./editeur-publication";

export const metadata = { title: "Écrire — Journal Gerimmo" };

export default async function PagePublication({ params }: PageProps<"/admin/publications/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("publications")
    .select("id, titre, slug, chapo, corps, seo_description, statut, sources, periode, veine")
    .eq("id", id)
    .maybeSingle();

  if (!p) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <Link
        href="/admin/publications"
        className="lien-discret inline-flex items-center gap-1.5 text-[13px] text-[var(--bleu)]"
      >
        ← Journal
      </Link>
      <div className="entete-page mt-2 mb-6">
        <h1 className="!text-[var(--pas-section)]">{p.titre}</h1>
        <span className="mono-discret">{p.periode}</span>
      </div>
      <EditeurPublication
        id={p.id}
        titre={p.titre}
        slug={p.slug}
        chapo={p.chapo}
        corps={p.corps}
        seoDescription={p.seo_description}
        statut={p.statut}
        sources={p.sources ?? []}
      />
    </main>
  );
}
