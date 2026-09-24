import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditeurPublication } from "./editeur-publication";
import { sansJargon } from "@/lib/erreurs";
import { libellePeriode } from "@/lib/periode-publication";

export const metadata = { title: "Écrire un article — Supervision" };

const ETATS: Record<string, string> = {
  proposition: "Proposition",
  brouillon: "Brouillon",
  refusee: "Écarté",
  archivee: "Retiré du journal",
};

export default async function PagePublication({ params }: PageProps<"/admin/publications/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("publications")
    .select("id, titre, slug, chapo, corps, seo_description, statut, sources, periode, veine, publie_le, facebook_texte, facebook_image_url, facebook_post_id, facebook_publie_le, facebook_erreur")
    .eq("id", id)
    .maybeSingle();

  if (!p) notFound();
  // L'en-tête dit l'écran et l'état de l'article (24/09) : il répétait le
  // titre, premier champ éditable 60 px plus bas, sans suivre sa saisie, et
  // en 20 px au lieu du h1 commun.
  const periode = libellePeriode(p.periode);
  const etat =
    p.statut === "publiee"
      ? `Paru${p.publie_le ? ` le ${new Date(p.publie_le).toLocaleDateString("fr-FR")}` : ""}`
      : ETATS[p.statut] ?? "Brouillon";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <Link
        href="/admin/publications"
        className="lien-discret inline-flex items-center gap-1.5 text-[13px] text-[var(--bleu)]"
      >
        ← Tous les articles
      </Link>
      <div className="entete-page mt-2 mb-6">
        <h1>Écrire un article</h1>
        <span className="mono-discret">
          {etat}
          {periode ? ` · ${periode}` : ""}
        </span>
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
        facebookTexte={p.facebook_texte}
        facebookImageUrl={p.facebook_image_url}
        facebookPostId={p.facebook_post_id}
        facebookPublieLe={p.facebook_publie_le}
        facebookErreur={p.facebook_erreur ? sansJargon(p.facebook_erreur) : null}
      />
    </main>
  );
}
