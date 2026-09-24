import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { libellePeriode } from "@/lib/periode-publication";
import { BoutonChercherSujets } from "./bouton-chercher-sujets";

// Le nom de l'entrée de barre (24/09) : « Journal » seul se confondait avec
// « Journaux et conservation », et l'onglet disait encore « Console
// d'administration ».
export const metadata = { title: "Articles du journal — Supervision" };

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

// Le prochain passage du moteur (pg_cron, lundi 6 h UTC) : la page ne lit
// pas l'historique de pg_cron, elle dit donc quand il PASSERA.
function prochainLundi(maintenant = new Date()): string {
  const jour = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(), 6));
  const ecart = (8 - jour.getUTCDay()) % 7;
  jour.setUTCDate(jour.getUTCDate() + (ecart === 0 && maintenant.getTime() >= jour.getTime() ? 7 : ecart));
  return jour.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
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
          <span className="puce puce-encre">Prêt à paraître</span>
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
}: {
  titre: string;
  explication: string;
  publications: Publication[];
  vide?: React.ReactNode;
}) {
  if (publications.length === 0 && !vide) return null;
  return (
    <section className="section-ecran">
      <div className="entete-carte mb-2">
        <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">
          {titre}
          <span className="font-normal text-[var(--texte-secondaire)]"> · {publications.length}</span>
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
    </section>
  );
}

export default async function PageJournalAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase
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
  const derniereProposition =
    tout.filter((p) => p.veine).map((p) => p.propose_le).sort().at(-1) ?? null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-2">
        <h1>Articles du journal</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/publications/nouvelle" className="btn-or text-sm">Nouvel article</Link>
          <BoutonChercherSujets />
        </div>
      </div>
      <p className="mesure-lecture mb-6 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
        Chaque lundi à 6 h, Gerimmo regarde le calendrier du métier et propose
        les sujets dont c&apos;est le moment. Une proposition apporte un angle, un
        plan et sa source dans le référentiel — <strong>jamais un chiffre</strong>.
        Les faits datés sont laissés en blanc, et un article ne peut pas paraître
        tant qu&apos;il en reste un.
      </p>

      {error && <div role="alert" className="err">Le journal n’a pas pu être chargé. Rechargez la page : ce n’est pas une file vide.</div>}

      {!error && tout.length === 0 && (
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

      {/* La file de travail ne disparaît plus quand elle est vide (24/09) :
          rien ne disait si le moteur du lundi avait tourné sans rien trouver. */}
      {!error && tout.length > 0 && (
        <Section
          titre="À écrire"
          explication="Le sujet est arrivé à son moment. Ouvrez-le pour compléter les faits datés et l'amener à parution."
          publications={propositions}
          vide={
            <div className="vide-guide">
              <p className="titre">Aucun sujet en attente</p>
              <p className="explication">
                {derniereProposition
                  ? `Dernière proposition reçue le ${jour(derniereProposition)}. `
                  : ""}
                Le moteur cherche de nouveaux sujets chaque lundi matin ; prochain
                passage le {prochainLundi()}.
              </p>
              <div className="geste">
                <BoutonChercherSujets />
              </div>
            </div>
          }
        />
      )}
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
