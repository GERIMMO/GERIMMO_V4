import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EnTetePublic, PiedPublic } from "@/components/chrome-public";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { ImageJournal } from "@/components/image-journal";
import { titreSansDoublon } from "@/lib/sujet-veille-marketing";

// 29/09 : la description ne promet plus des sujets précis (révision,
// régularisation, impayés) que le journal ne traite pas forcément : elle dit
// ce qu'il est.
export const metadata = metadonneesPubliques({
  titre: "Journal — Gerimmo",
  description:
    "Le journal de Gerimmo : actualités et repères sur la gestion locative, pour les propriétaires bailleurs et leurs locataires.",
  chemin: "/journal",
});

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
    .select("id, titre, slug, chapo, publie_le, facebook_image_url")
    .eq("statut", "publiee")
    .order("publie_le", { ascending: false })
    .limit(50);

  const articles = data ?? [];

  return (
    // flex-col : le body est une colonne flex, et sans elle le main.flex-1 ne
    // poussait rien — le pied flottait à mi-écran, 200 px de vide dessous (24/09).
    <div className="site-public flex min-h-full flex-1 flex-col">
      <EnTetePublic />
      {/* Charte v3 : le journal s'ouvre comme la vitrine, sur blanc lumineux —
          plus d'aplat marine sous le bandeau. 24/09 : plus de photo non plus.
          Celle des pages de connexion, sans rapport avec le journal, faisait
          d'une page secondaire la plus décorée du site. */}
      <header className="public-page-intro">
        <div className="public-conteneur">
          <p className="eyebrow">Journal</p>
          <h1>Ce qu&apos;il faut savoir, au moment où ça compte</h1>
          <p>
            Les règles de la gestion locative, expliquées quand elles servent —
            et sourcées. Nous n&apos;écrivons rien que nous n&apos;ayons vérifié.
          </p>
        </div>
      </header>

      <main className="public-conteneur flex-1 py-10 sm:py-14">
        {articles.length === 0 ? (
          <div className="vide-guide">
            <p className="titre">Le premier article arrive</p>
            <p className="explication">
              Le journal se remplit au fil du calendrier du métier : révision des
              loyers, régularisation des charges, restitution des dépôts.
              Revenez bientôt — ou créez votre compte, l&apos;essentiel est déjà
              dans l&apos;application.
            </p>
            {/* L'appel à créer un compte s'efface pour une personne venue de son espace (systeme.css). */}
            <div className="geste" data-appel-inscription>
              <Link href="/inscription" className="btn-or">
                Créer mon compte
              </Link>
            </div>
          </div>
        ) : (
          <div className="public-journal-grille">
            {/* 24/09 : un seul lien couvre toute la carte. Seuls le titre et
                « Lire → » réagissaient, deux liens vers la même adresse ;
                la date et le chapo restaient inertes. */}
            {articles.map((a) => (
              <article key={a.id}>
                <Link
                  href={`/journal/${a.slug}`}
                  className="public-article journal-carte"
                >
                  {/* 06/10 : la vignette de l'article (son illustration Facebook,
                      ou le repli de la charte). */}
                  <ImageJournal url={a.facebook_image_url} titre={a.titre} tailles="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" />
                  <p className="mono-discret sans-majuscules">{jour(a.publie_le)}</p>
                  <h2>{titreSansDoublon(a.titre)}</h2>
                  {a.chapo && <p>{a.chapo}</p>}
                  <span>Lire l’article <span aria-hidden>→</span></span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <PiedPublic courant="/journal" />
    </div>
  );
}
