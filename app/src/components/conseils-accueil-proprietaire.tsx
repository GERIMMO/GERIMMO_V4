import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen, FileText, Lightbulb } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ImageJournal } from "./image-journal";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";
import styles from "@/app/agence/[orgId]/accueil-proprietaire.module.css";

type Article = { id: string; titre: string; slug: string; facebook_image_url: string | null };
export async function ConseilsAccueilProprietaire({ db, base }: { db: SupabaseClient; base: string }) {
  let articles: Article[] = [];
  let indisponible = false;
  try {
    const { data, error } = await db.from("publications").select("id,titre,slug,facebook_image_url")
      .eq("statut", "publiee").lte("publie_le", new Date().toISOString()).not("slug", "is", null)
      .order("publie_le", { ascending: false }).order("id", { ascending: false }).limit(3);
    indisponible = Boolean(error);
    articles = error ? [] : (data ?? []) as Article[];
  } catch { indisponible = true; }
  const premier = articles[0];
  return <section className={`${styles.carte} ${styles.conseils}`} aria-labelledby="conseils-accueil-titre">
    <h2 id="conseils-accueil-titre" className={styles.titreLigne}><BookOpen size={23} aria-hidden="true"/>Nos articles et conseils</h2>
    {premier ? <Link className={styles.articleVedette} href={`${base}/journal/${premier.slug}`}>
      <ImageJournal className={styles.vignetteConseil} url={premier.facebook_image_url} titre={premier.titre} tailles="140px"/>
      <div><small>À la une</small><h3>{titreSansDoublon(premier.titre)}</h3></div><ArrowRight size={17} aria-hidden="true"/>
    </Link> : <Link className={styles.articleVedette} href={`${base}/faq#questions-titre`}>
      <span className={styles.vignetteConseil}><Image src="/illustrations/accueil-evenements/automne.webp" alt="" width={280} height={190}/></span>
      <div><small>Prise en main</small><h3>Bien démarrer avec Gerimmo</h3></div><ArrowRight size={17} aria-hidden="true"/>
    </Link>}
    <ul className={styles.conseilsListe}>
      {articles.slice(1).map(a=><li key={a.id}><Link href={`${base}/journal/${a.slug}`}><span><FileText size={19} aria-hidden="true"/></span><b>{titreSansDoublon(a.titre)}</b><ArrowRight size={16} aria-hidden="true"/></Link></li>)}
      {articles.length < 2 && <li><Link href={`${base}/documents`}><span><FileText size={19} aria-hidden="true"/></span><b>Retrouver mes documents</b><ArrowRight size={16} aria-hidden="true"/></Link></li>}
      {articles.length < 3 && <li><Link href={`${base}/incidents`}><span><Lightbulb size={20} aria-hidden="true"/></span><b>Suivre mes incidents</b><ArrowRight size={16} aria-hidden="true"/></Link></li>}
    </ul>
    {indisponible && <p className={styles.note}>Les articles sont momentanément indisponibles.</p>}
    <Link className={styles.lienPied} href={`${base}/journal`}>Voir tous les articles<ArrowRight size={16} aria-hidden="true"/></Link>
  </section>;
}
