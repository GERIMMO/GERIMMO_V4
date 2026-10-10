import Link from "next/link";
import { ArrowRight, BookOpen, Newspaper } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import styles from "./accueil-proprietaire.module.css";

/** Les mêmes articles que le Journal, publiés depuis la console super admin. */
export async function ArticlesAccueil({ supabase }: { supabase: SupabaseClient }) {
  const { data, error } = await supabase
    .from("publications")
    .select("id, titre, slug, chapo, publie_le")
    .eq("statut", "publiee")
    .lte("publie_le", new Date().toISOString())
    .not("slug", "is", null)
    .order("publie_le", { ascending: false })
    .order("id", { ascending: false })
    .limit(3);
  const articles = data ?? [];

  return (
    <section className={`${styles.journal} loc-carte`} aria-labelledby="journal-accueil-titre">
      <div className={styles.enteteJournal}>
        <span className={styles.iconeJournal}><Newspaper size={22} aria-hidden="true" /></span>
        <div>
          <p className={styles.surtitreJournal}>À la une</p>
          <h2 id="journal-accueil-titre">Le journal Gerimmo</h2>
        </div>
      </div>
      <p className={styles.descriptionJournal}>Actualités et conseils pour votre location.</p>
      {error ? (
        <p className={styles.messageJournal} role="status">
          Les articles sont momentanément indisponibles. Réessayez dans un instant.
        </p>
      ) : articles.length === 0 ? (
        <div className={styles.journalVide}>
          <BookOpen size={25} aria-hidden="true" />
          <div>
            <p>Les premiers articles arrivent bientôt</p>
            <span>Retrouvez ici les prochaines publications de Gerimmo.</span>
          </div>
        </div>
      ) : (
        <ul className={styles.articles}>
          {articles.map((article) => (
            <li key={article.id}>
              <Link href={`/journal/${article.slug}`} className={styles.article}>
                <time dateTime={article.publie_le}>
                  {new Date(article.publie_le).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
                  })}
                </time>
                <h3>{titreSansDoublon(article.titre)}</h3>
                {article.chapo && <p>{article.chapo}</p>}
                <span className={styles.lireArticle}>Lire l’article <ArrowRight size={14} aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(articles.length > 0 || error) && (
        <Link href="/journal" className={styles.toutLeJournal}>
          Tous les articles <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
