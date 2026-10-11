import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageJournal } from "@/components/image-journal";
import { TexteMarkdown } from "@/components/texte-markdown";
import { verifierAccesEspace } from "@/lib/espace";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import styles from "../journal.module.css";

export const metadata = { title: "Article du journal — Gerimmo" };

export default async function PageArticle({ params }: PageProps<"/agence/[orgId]/journal/[slug]">) {
  const { orgId, slug } = await params;
  const { supabase } = await verifierAccesEspace(orgId);
  const { data: a, error } = await supabase.from("publications")
    .select("titre, chapo, corps, publie_le, facebook_image_url")
    .eq("slug", slug).eq("statut", "publiee").lte("publie_le", new Date().toISOString()).maybeSingle();
  if (!error && !a) notFound();
  return <main className={`mx-auto w-full max-w-4xl p-4 sm:p-7 ${styles.page}`}>
    <Link href={`/agence/${orgId}/journal`} className={styles.retour}>← Tous les articles</Link>
    {error || !a ? <p className="err" role="alert">L’article n’a pas pu être chargé. Rechargez la page dans un instant.</p> : <article className={styles.lecture}>
      <header><p className="eyebrow">Le journal Gerimmo</p><h1>{titreSansDoublon(a.titre)}</h1><time dateTime={a.publie_le}>{new Date(a.publie_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}</time></header>
      <ImageJournal url={a.facebook_image_url} titre={a.titre} priorite />
      {a.chapo && <p className={styles.chapo}>{a.chapo}</p>}
      <TexteMarkdown contenu={a.corps ?? ""} />
    </article>}
  </main>;
}
