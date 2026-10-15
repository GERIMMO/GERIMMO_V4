import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { TitreEcran } from "@/components/titre-ecran";
import { ImageJournal } from "@/components/image-journal";
import { verifierAccesEspace } from "@/lib/espace";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import styles from "./journal.module.css";
import { baseEspace } from "@/lib/racine-espace";

export const metadata = { title: "Le journal — Gerimmo" };

export default async function PageJournal({ params, searchParams }: PageProps<"/agence/[orgId]/journal">) {
  const { orgId } = await params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const base = baseEspace(orgId, estProprietaire);
  const { page: numero } = await searchParams;
  const page = typeof numero === "string" && /^[1-9]\d{0,4}$/.test(numero) ? Number(numero) : 1;
  const taille = 12;
  const { data, error } = await supabase.from("publications")
    .select("id, titre, slug, chapo, publie_le, facebook_image_url")
    .eq("statut", "publiee").lte("publie_le", new Date().toISOString()).not("slug", "is", null)
    .order("publie_le", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * taille, page * taille);
  const articles = (data ?? []).slice(0, taille);
  const suite = (data ?? []).length > taille;
  return <main className={`mx-auto w-full max-w-6xl p-4 sm:p-7 ${styles.page}`}>
    <Link href={`${base}`} className={styles.retour}>← Tableau de bord</Link>
    <header className="entete-page"><div><TitreEcran rubrique="journal">Le journal Gerimmo</TitreEcran><p className="mt-3 text-sm text-muted-foreground">Actualités et conseils pour votre location.</p></div></header>
    {error ? <p className="err" role="alert">Les articles n’ont pas pu être chargés. Rechargez la page dans un instant.</p> : articles.length === 0 ? <div className="vide-guide"><BookOpen size={28} aria-hidden="true" /><h2>{page === 1 ? "Les premiers articles arrivent bientôt" : "Aucun article sur cette page"}</h2><p>Retrouvez ici les publications de Gerimmo.</p>{page > 1 && <Link className="lien-discret" href={`${base}/journal`}>Revenir aux derniers articles</Link>}</div> : <>
      <ul className={styles.grille}>{articles.map(a => <li key={a.id}><Link className={styles.carte} href={`${base}/journal/${a.slug}`}>
        <ImageJournal url={a.facebook_image_url} titre={a.titre} tailles="(min-width: 1100px) 350px, (min-width: 700px) 45vw, 100vw" />
        <div className={styles.texte}><time dateTime={a.publie_le}>{new Date(a.publie_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}</time><h2>{titreSansDoublon(a.titre)}</h2>{a.chapo && <p>{a.chapo}</p>}<span>Lire l’article <ArrowRight size={16} aria-hidden="true" /></span></div>
      </Link></li>)}</ul>
      {(page > 1 || suite) && <nav aria-label="Pages du journal" className={styles.pagination}>{page > 1 && <Link className="btn-secondaire" href={`${base}/journal?page=${page - 1}`}>← Articles précédents</Link>}<span>Page {page}</span>{suite && <Link className="btn-secondaire" href={`${base}/journal?page=${page + 1}`}>Articles suivants →</Link>}</nav>}
    </>}
  </main>;
}
