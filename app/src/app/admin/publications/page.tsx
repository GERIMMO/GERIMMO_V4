import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BoutonChercherSujets } from "./bouton-chercher-sujets";

export const metadata = { title: "Journal — Console d'administration" };

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

function jour(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Combien de faits datés restent à fournir avant qu'un article puisse paraître.
// C'est l'information la plus utile de la file : elle dit le travail restant.
function trous(corps: string | null): number {
  if (!corps) return 0;
  return (corps.match(/\[\[à compléter/g) ?? []).length;
}

function Rang({ p }: { p: Publication }) {
  const restants = trous(p.corps);
  return (
    <Link
      href={`/admin/publications/${p.id}`}
      className="block border-b border-[var(--filet-leger)] px-4 py-3 last:border-b-0 hover:bg-[var(--filet-leger)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-heading text-[15px] text-[var(--encre)]">{p.titre}</span>
        <span className="mono-discret !text-[10px]">{p.periode}</span>
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
          <span className="puce puce-encre">Prêt à paraître</span>
        )}
        {p.sources.slice(0, 2).map((s) => (
          <span key={s} className="mono-discret !text-[9px] sans-majuscules">
            {s.replace(/^wiki\//, "").replace(/\.md$/, "")}
          </span>
        ))}
      </div>
      {p.refus_motif && (
        <p className="mt-1.5 text-[12px] italic text-[var(--texte-secondaire)]">
          Écarté : {p.refus_motif}
        </p>
      )}
    </Link>
  );
}

function Section({
  titre,
  explication,
  publications,
}: {
  titre: string;
  explication: string;
  publications: Publication[];
}) {
  if (publications.length === 0) return null;
  return (
    <section className="section-ecran">
      <div className="entete-carte mb-2">
        <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">{titre}</h2>
        <span className="mono-discret">{publications.length}</span>
      </div>
      <p className="mb-3 text-[13px] text-[var(--texte-secondaire)]">{explication}</p>
      <div className="border border-[var(--filet)] bg-[var(--ivoire)]">
        {publications.map((p) => (
          <Rang key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

export default async function PageJournalAdmin() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("publications")
    .select(
      "id, veine, periode, statut, titre, slug, chapo, corps, sources, propose_le, publie_le, refus_motif"
    )
    .order("propose_le", { ascending: false });

  const tout = (data ?? []) as Publication[];
  const par = (s: string) => tout.filter((p) => p.statut === s);
  const propositions = par("proposition");
  const brouillons = par("brouillon");
  const parus = par("publiee");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-2">
        <h1>Journal</h1>
        <BoutonChercherSujets />
      </div>
      <p className="mesure-lecture mb-6 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
        Chaque lundi à 6 h, Gerimmo regarde le calendrier du métier et propose
        les sujets dont c&apos;est le moment. Une proposition apporte un angle, un
        plan et sa source dans le référentiel — <strong>jamais un chiffre</strong>.
        Les faits datés sont laissés en blanc, et un article ne peut pas paraître
        tant qu&apos;il en reste un.
      </p>

      {tout.length === 0 && (
        <div className="vide-guide">
          <p className="titre">La file est vide</p>
          <p className="explication">
            Aucun sujet n&apos;a encore été proposé. Le moteur se déclenche le lundi
            matin, mais vous pouvez lui demander tout de suite ce que le mois en
            cours appelle.
          </p>
          <div className="geste">
            <BoutonChercherSujets />
          </div>
        </div>
      )}

      <Section
        titre="À écrire"
        explication="Le sujet est arrivé à son moment. Ouvrez-le pour compléter les faits datés et l'amener à parution."
        publications={propositions}
      />
      <Section
        titre="En cours d'écriture"
        explication="Commencés, pas encore parus."
        publications={brouillons}
      />
      <Section
        titre="Parus"
        explication="En ligne dans le journal public."
        publications={parus}
      />
      <Section
        titre="Écartés"
        explication="Refusés avec leur motif — ils ne seront pas reproposés pour cette période."
        publications={par("refusee")}
      />
      <Section
        titre="Retirés"
        explication="Dépubliés, conservés ici."
        publications={par("archivee")}
      />
    </main>
  );
}
