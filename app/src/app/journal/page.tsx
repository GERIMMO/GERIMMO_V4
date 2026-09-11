import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";

export const metadata = {
  title: "Journal — Gerimmo",
  description:
    "Ce qu'un bailleur doit savoir, au moment où ça compte : révision des loyers, régularisation des charges, restitution du dépôt, impayés.",
};

function jour(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PageJournal() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("publications")
    .select("id, titre, slug, chapo, publie_le")
    .eq("statut", "publiee")
    .order("publie_le", { ascending: false })
    .limit(50);

  const articles = data ?? [];

  return (
    <div className="min-h-full bg-[var(--creme)]">
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <EnTetePublic />
        <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-12 sm:px-7 sm:pt-12 sm:pb-16">
          <p className="eyebrow text-[var(--or)]">Journal</p>
          <h1 className="mt-2 max-w-2xl font-heading text-3xl leading-tight sm:text-4xl">
            Ce qu&apos;il faut savoir, au moment où ça compte
          </h1>
          <p className="mesure-lecture mt-4 text-[15px] leading-relaxed text-[var(--sur-encre)]/80">
            Les règles de la gestion locative, expliquées quand elles servent —
            et sourcées. Nous n&apos;écrivons rien que nous n&apos;ayons vérifié.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-7">
        {articles.length === 0 ? (
          <div className="vide-guide">
            <p className="titre">Le premier article arrive</p>
            <p className="explication">
              Le journal se remplit au fil du calendrier du métier : révision des
              loyers, régularisation des charges, restitution des dépôts.
              Revenez bientôt — ou créez votre compte, l&apos;essentiel est déjà
              dans l&apos;application.
            </p>
            <div className="geste">
              <Link href="/inscription" className="btn-or">
                Créer mon compte
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <article key={a.id}>
                <p className="mono-discret !text-[10px] sans-majuscules">{jour(a.publie_le)}</p>
                <h2 className="mt-1.5 font-heading text-[19px] leading-snug text-[var(--encre)]">
                  <Link href={`/journal/${a.slug}`} className="hover:underline">
                    {a.titre}
                  </Link>
                </h2>
                {a.chapo && (
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
                    {a.chapo}
                  </p>
                )}
                <Link
                  href={`/journal/${a.slug}`}
                  className="lien-discret mt-2.5 inline-block text-[13px]"
                >
                  Lire →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <PiedPublic />
    </div>
  );
}
