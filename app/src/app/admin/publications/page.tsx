import { lirePage, numeroPage } from "@/lib/pagination-supervision";
import { formaterDateParis } from "@/lib/heure-paris";
import { Pagination } from "../pagination";
import { LectureIndisponible } from "../lecture-indisponible";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { libellePeriode } from "@/lib/periode-publication";
import { BoutonChercherSujets } from "./bouton-chercher-sujets";

// Le nom de l'entrée de barre (24/09) : « Journal » seul se confondait avec
// « Journaux et conservation », et l'onglet disait encore « Console
// d'administration ».
export const metadata = { title: "Articles du site" };

type Publication = {
  id: string;
  veine: string | null;
  periode: string;
  statut: string;
  titre: string;
  slug: string | null;
  chapo: string | null;
  corps: string | null;
  sources: string[];
  propose_le: string;
  publie_le: string | null;
  refus_motif: string | null;
};

const jour = formaterDateParis;

// Combien de faits datés restent à fournir avant qu'un article puisse paraître.
// C'est l'information la plus utile de la file : elle dit le travail restant.
function trous(corps: string | null): number {
  if (!corps) return 0;
  return (corps.match(/\[\[à compléter/g) ?? []).length;
}

// Le rang commun de la console, en bloc (24/09). La période se lit en
// français, et les chemins internes des sources (« wiki/… ») ne s'affichent
// plus : l'éditeur les montre, là où l'on écrit.
function Rang({ p }: { p: Publication }) {
  const restants = trous(p.corps);
  const periode = libellePeriode(p.periode);
  return (
    <Link href={`/admin/publications/${p.id}`} className="rang flex-col items-stretch gap-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-heading text-[15px] text-[var(--encre)]">{p.titre}</span>
        {periode && <span className="mono-discret sans-majuscules">{periode}</span>}
      </div>
      {p.chapo && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
          {p.chapo}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {restants > 0 ? (
          <span className="puce puce-prep">
            {restants} fait{restants > 1 ? "s" : ""} à fournir
          </span>
        ) : p.statut === "publiee" ? (
          <span className="puce puce-loue">Paru le {jour(p.publie_le)}</span>
        ) : (
          <span className="puce puce-encre">{STATUTS[p.statut] ?? "À vérifier"}</span>
        )}
      </div>
      {p.refus_motif && (
        <p className="mt-1.5 text-[12px] italic text-[var(--texte-secondaire)]">
          Écarté : {p.refus_motif}
        </p>
      )}
    </Link>
  );
}

// Le compteur est collé au titre (« Parus · 1 », 24/09) : posé au bord
// opposé, il flottait à 840 px de ce qu'il comptait. Une section vide
// disparaît, sauf si la page lui donne un état vide à montrer.
function Section({
  titre,
  explication,
  publications,
  vide,
  pied,
}: {
  titre: string;
  explication: string;
  publications: Publication[];
  vide?: React.ReactNode;
  pied?: React.ReactNode;
}) {
  if (publications.length === 0 && !vide) return null;
  return (
    <section className="section-ecran">
      <div className="entete-carte mb-2">
        <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
          {titre}
          <span className="font-normal text-[var(--texte-secondaire)]"> · {publications.length} sur cette page</span>
        </h2>
      </div>
      <p className="mb-3 text-[13px] text-[var(--texte-secondaire)]">{explication}</p>
      {publications.length === 0 ? (
        vide
      ) : (
        <div className="colonne-liste">
          {publications.map((p) => (
            <Rang key={p.id} p={p} />
          ))}
        </div>
      )}
      {publications.length > 0 && pied}
    </section>
  );
}

const STATUTS: Record<string, string> = { proposition: "À écrire", brouillon: "Brouillons", programmee: "Programmés", reportee: "Reportés", publiee: "Parus", refusee: "Écartés", archivee: "Retirés" };

export default async function PageJournalAdmin({ searchParams }: { searchParams: Promise<{ page?: string; statut?: string }> }) {
  const p = await searchParams;
  const statut = p.statut && Object.hasOwn(STATUTS, p.statut) ? p.statut : "";
  const supabase = await createClient();
  const lecture = await lirePage((a,b) => {
    let q = supabase.from("publications").select("id,veine,periode,statut,titre,slug,chapo,corps,sources,propose_le,publie_le,refus_motif", { count: "exact" });
    if (statut) q = q.eq("statut", statut);
    return q.order("propose_le", { ascending: false }).order("id").range(a,b);
  }, numeroPage(p.page));
  const tout = (lecture.data ?? []) as Publication[];
  const adresse = (page: number) => `/admin/publications?${new URLSearchParams({ ...(statut ? { statut } : {}), page: String(page) })}`;
  return <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
    <div className="entete-page mb-4"><TitreEcran rubrique="journal">Articles du site</TitreEcran><Link href="/admin/publications/nouvelle" className="btn-or text-sm">Nouvel article</Link></div>
    <p className="mb-4 text-sm text-muted-foreground">Retrouvez tous les articles, y compris ceux programmés ou reportés. Le rythme des préparations et des diffusions se consulte dans <Link href="/admin/marketing" className="underline">Marketing et contenus</Link>.</p>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><form method="get" action="/admin/publications" className="flex flex-wrap items-end gap-3"><label className="text-sm">État de l’article<select name="statut" className="champ mt-1 block" defaultValue={statut}><option value="">Tous les états</option>{Object.entries(STATUTS).map(([s,l]) => <option key={s} value={s}>{l}</option>)}</select></label><button className="btn-secondaire">Filtrer</button></form><BoutonChercherSujets /></div>
    {lecture.error ? <LectureIndisponible sujet="Articles" retour={adresse(lecture.page)} /> : <>
      <p role="status" className="mb-4 text-sm text-muted-foreground">{tout.length} affiché{tout.length > 1 ? "s" : ""} sur {lecture.count ?? "—"} article{lecture.count !== 1 ? "s" : ""}{statut ? ` · ${STATUTS[statut]}` : " · Tous les états"}</p>
      {!tout.length && <div className="vide-guide"><p className="titre">{statut ? "Aucun article dans cet état" : "Aucun article enregistré"}</p><p className="explication">{statut ? "Choisissez un autre état ou consultez tous les articles." : "Créez un article ou demandez des propositions de sujets."}</p>{statut && <Link href="/admin/publications" className="btn-secondaire">Tous les articles</Link>}</div>}
      {Object.entries(STATUTS).map(([s,l]) => <Section key={s} titre={l} explication="" publications={tout.filter(p => p.statut === s)} />)}
      {lecture.count !== null && <Pagination page={lecture.page} total={lecture.count} adresse={adresse} libelle="Articles" />}
    </>}
  </main>;
}
