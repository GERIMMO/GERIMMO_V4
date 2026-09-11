import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";

export const metadata = { title: "Console d'administration — Gerimmo" };

// Console de supervision du Super Admin (wiki/personas/Super Admin.md § 18) :
// des INDICATEURS, puis les FILES D'ATTENTE. Le wiki en prescrit six ; quatre
// (modèles, contestations de notes, modèles WhatsApp, correctifs) relèvent de
// chantiers non construits — on ne les affiche pas vides pour faire nombre,
// on dit qu'elles viendront. Politique « fonctionnalités honnêtes ».

type Organisation = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  essai_fin: string | null;
};

function Indicateur({
  libelle,
  valeur,
  precision,
  accent,
  href,
}: {
  libelle: string;
  valeur: string | number;
  precision?: string;
  accent?: "or" | "vert" | "rouge" | "bleu";
  href?: string;
}) {
  const contenu = (
    <>
      <span className="libelle-champ">{libelle}</span>
      <div className="chiffre montant">{valeur}</div>
      {precision && (
        <span className="mono-discret sans-majuscules !text-[10px]">{precision}</span>
      )}
    </>
  );
  const classe = `kpi ${accent ?? ""}`;
  return href ? (
    <Link href={href} className={classe}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

function File({
  titre,
  compte,
  explication,
  href,
  action,
}: {
  titre: string;
  compte: number;
  explication: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 border border-[var(--filet)] bg-[var(--ivoire)] p-4 transition-colors hover:bg-[var(--survol)]"
    >
      <span
        aria-hidden
        className={`mt-0.5 w-[3px] shrink-0 self-stretch ${
          compte > 0 ? "bg-[var(--or)]" : "bg-[var(--filet)]"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-heading text-[16px] text-[var(--encre)]">{titre}</span>
          <span className={`puce ${compte > 0 ? "puce-prep" : "puce-grise"}`}>
            {compte === 0 ? "à jour" : `${compte} en attente`}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
          {explication}
        </span>
        <span className="lien-discret mt-1.5 inline-block text-[12.5px] group-hover:underline">
          {action} →
        </span>
      </span>
    </Link>
  );
}

export default async function PageAdmin() {
  const supabase = await createClient();

  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  // On lit `error` : une console de pilotage qui affiche zéro parce qu'une
  // requête a échoué est pire que pas de console du tout.
  const [orgs, devis, publications, lots] = await Promise.all([
    supabase.from("organizations").select("id, name, status, type, essai_fin").order("name"),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("publications").select("id, statut"),
    supabase.from("lots").select("id", { count: "exact", head: true }).neq("etat", "archive"),
  ]);

  const enEchec = [orgs.error, devis.error, publications.error, lots.error].filter(Boolean);
  const organisations = (orgs.data ?? []) as Organisation[];
  const parStatut = (s: string) => organisations.filter((o) => o.status === s).length;
  const aEcrire = (publications.data ?? []).filter(
    (p) => p.statut === "proposition" || p.statut === "brouillon"
  ).length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Supervision</h1>
        <div className="flex items-center gap-3">
          <span className="mono-discret">
            {organisations.length} organisation{organisations.length > 1 ? "s" : ""}
          </span>
          {/* Le geste le plus commercial du produit : il n'existait pas, et
              l'ouverture d'une agence se faisait en SQL. */}
          <Link href="/admin/organisations/nouvelle" className="btn-or">
            Ouvrir une organisation
          </Link>
        </div>
      </div>

      {enEchec.length > 0 && (
        <div
          role="alert"
          className="mb-6 border border-[var(--destructive)] bg-[var(--destructive-soft)] p-3.5 text-[13px] text-[var(--destructive-soft-foreground)]"
        >
          {enEchec.length} lecture{enEchec.length > 1 ? "s" : ""} de cette page
          {enEchec.length > 1 ? " ont" : " a"} échoué : les chiffres ci-dessous sont
          incomplets. Rechargez — s&apos;ils ne reviennent pas, c&apos;est la base qui
          ne répond pas.
        </div>
      )}

      {/* Indicateurs — wiki/personas/Super Admin.md : agences par statut,
          lots gérés (base de facturation), volumes. */}
      <section className="section-ecran">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicateur libelle="Actives" valeur={parStatut("active")} accent="vert"
            precision="abonnement en cours" />
          <Indicateur libelle="En essai" valeur={parStatut("essai")} accent="or"
            precision="14 jours, sans carte" />
          <Indicateur libelle="Suspendues" valeur={parStatut("suspendue")} accent="rouge"
            precision="lecture seule, export ouvert" />
          <Indicateur libelle="Lots gérés" valeur={lots.count ?? 0} accent="bleu"
            precision="base de facturation" />
        </div>
      </section>

      {/* Files d'attente RÉELLES */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">
            Ce qui attend une décision
          </h2>
        </div>
        <div className="grid gap-3">
          <File
            titre="Demandes de devis"
            compte={devis.count ?? 0}
            explication="Des agences ont demandé une proposition depuis le site. Le wiki promet une réponse sous 48 h ouvrées."
            href="/admin/devis"
            action="Traiter les demandes"
          />
          <File
            titre="Journal"
            compte={aEcrire}
            explication="Sujets proposés par le calendrier du métier, à compléter et publier. Un article ne paraît pas tant qu'un fait daté manque."
            href="/admin/publications"
            action="Ouvrir le journal"
          />
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--texte-secondaire)]">
          Le référentiel prévoit quatre autres files — demandes de modèles,
          contestations de notes d&apos;artisan, modèles de messages, retours
          utilisateurs (bugs, correctifs, idées). Les chantiers correspondants
          ne sont pas construits : elles apparaîtront ici quand ils le seront,
          pas avant.
        </p>
      </section>

      {/* Le parc d'organisations */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">
            Organisations
          </h2>
          <span className="mono-discret">{organisations.length}</span>
        </div>

        {organisations.length === 0 ? (
          <div className="vide-guide">
            <p className="titre">Aucune organisation</p>
            <p className="explication">
              Les propriétaires bailleurs ouvrent leur espace eux-mêmes depuis le
              site ; les agences sont créées ici après contrat. La première
              demande de devis arrivera dans la file ci-dessus.
            </p>
          </div>
        ) : (
          <div className="border border-[var(--filet)] bg-[var(--ivoire)]">
            {organisations.map((o) => (
              <Link
                key={o.id}
                href={`/admin/organisations/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--filet-leger)] px-4 py-3 last:border-b-0 hover:bg-[var(--survol)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-[var(--corps)]">{o.name}</span>
                  {o.type && (
                    <span className="mono-discret sans-majuscules !text-[10px]">
                      {o.type === "proprietaire_direct" ? "propriétaire en direct" : "agence"}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {o.status === "essai" && o.essai_fin && (
                    <span className="mono-discret sans-majuscules !text-[10px]">
                      jusqu&apos;au{" "}
                      {new Date(o.essai_fin).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  )}
                  <span
                    className={`puce ${
                      o.status === "active"
                        ? "puce-loue"
                        : o.status === "essai"
                          ? "puce-prep"
                          : o.status === "suspendue"
                            ? "puce-rouge"
                            : "puce-grise"
                    }`}
                  >
                    {LIBELLES_STATUT_ORGANISATION[o.status] ?? o.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
