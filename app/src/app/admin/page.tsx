import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { familleOrganisation } from "@/lib/clients-supervision";
import { faitsManquants } from "@/lib/editeur";
import { chargerDecisionsAttendues } from "@/lib/decisions-attendues";
import { MesureAutonomie } from "@/components/mesure-autonomie";

// Le nom de l'entrée de menu (audit 25/09, C8) : « Vue d'ensemble ».
export const metadata = { title: "Chiffres et clients — Gerimmo" };

// 25/09 (audit C1, C4, C7, C29) : la vue d'ensemble ne rejoue plus le début de
// journée. Elle renvoie à « Aujourd'hui » avec LE chiffre partagé, puis montre
// ce qui n'est pas une décision : les organisations, les clients, et — une
// seule fois dans la console — la mesure de ce que Gerimmo automatise.

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
  accent?: "or" | "vert" | "rouge" | "bleu" | "ambre";
  href?: string;
}) {
  const contenu = (
    <>
      <span className="libelle-champ">{libelle}</span>
      <div className="chiffre montant">{valeur}</div>
      {precision && (
        <span className="mono-discret sans-majuscules">{precision}</span>
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

export default async function PageAdmin() {
  const supabase = await createClient();

  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond.
  // On lit `error` : une console de pilotage qui affiche zéro parce qu'une
  // requête a échoué est pire que pas de console du tout.
  const [orgs, lots, decisions] = await Promise.all([
    supabase.from("organizations").select("id, name, status, type, essai_fin").order("name"),
    supabase.from("lots").select("id", { count: "exact", head: true }).neq("etat", "archive"),
    // Le même calcul que la barre haute et « Aujourd'hui » (lib/decisions-attendues.ts).
    chargerDecisionsAttendues(supabase, process.env, faitsManquants().length),
  ]);

  const enEchec = [orgs.error, lots.error].filter(Boolean).length + decisions.indisponibles.length;
  const organisations = (orgs.data ?? []) as Organisation[];
  const parStatut = (s: string) => organisations.filter((o) => o.status === s).length;
  const agences = organisations.filter((o) => familleOrganisation(o.type) === "agence").length;
  const proprietairesDirects = organisations.length - agences;
  const suspendues = parStatut("suspendue");
  const artisansEnAttente = decisions.artisans;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Chiffres et clients</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-discret">
            {orgs.error ? "Organisations indisponibles" : `${organisations.length} organisation${organisations.length > 1 ? "s" : ""}`}
          </span>
          {/* Le geste le plus commercial du produit : il n'existait pas, et
              l'ouverture d'une agence se faisait en SQL. */}
          <Link href="/admin/organisations/nouvelle" className="btn-or">
            Ouvrir une organisation
          </Link>
        </div>
      </div>

      {/* L'échec de lecture se dit AVANT les cartes : lu après, il arrivait
          une fois les chiffres incomplets déjà pris pour argent comptant. */}
      {enEchec > 0 && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-[var(--destructive)] bg-[var(--destructive-soft)] p-4 text-sm text-[var(--destructive-soft-foreground)]"
        >
          {enEchec} lecture{enEchec > 1 ? "s" : ""} de cette page
          {enEchec > 1 ? " ont" : " a"} échoué : les chiffres ci-dessous sont
          incomplets. Rechargez — s&apos;ils ne reviennent pas, c&apos;est la base qui
          ne répond pas.
        </div>
      )}

      {/* Le début de journée est sur UN écran (audit C1) : ici, seulement le
          chiffre et la porte. Il inclut la santé du service (audit C7). */}
      <Link
        href="/admin/brief"
        className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm hover:underline ${
          decisions.total > 0
            ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]"
            : "border-[var(--filet)] bg-[var(--ivoire)] text-[var(--encre)]"
        }`}
      >
        <span className="min-w-0 flex-1">
          <b className="font-semibold">Aujourd’hui</b> :{" "}
          {decisions.total > 0
            ? `${decisions.total} décision${decisions.total > 1 ? "s" : ""} attend${decisions.total > 1 ? "ent" : ""}`
            : "rien n’attend de décision"}
          {decisions.santeBloquants > 0 && ` — dont la santé du service (${decisions.santeBloquants} point${decisions.santeBloquants > 1 ? "s" : ""})`}
          {!decisions.pointPrepare && " · le point de ce matin n’est pas encore préparé"}.
        </span>
        <span className="shrink-0 font-semibold">Ouvrir Aujourd’hui →</span>
      </Link>

      {/* Indicateurs — wiki/personas/Super Admin.md : agences par statut,
          lots gérés (base de facturation), volumes. La rangée dit ce
          qu'elle compte (24/09), chaque tuile mène à la liste des clients, et
          la couleur suit la valeur : « Suspendues 0 » n'est plus rouge. */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Organisations</h2>
          <span className="mono-discret">par statut d&apos;abonnement</span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Indicateur libelle="Actives" valeur={orgs.error ? "—" : parStatut("active")} accent="vert"
            precision="abonnement en cours" href="/admin/clients" />
          <Indicateur libelle="En essai" valeur={orgs.error ? "—" : parStatut("essai")} accent="ambre"
            precision="14 jours, sans carte" href="/admin/clients" />
          <Indicateur libelle="Suspendues" valeur={orgs.error ? "—" : suspendues} accent={!orgs.error && suspendues > 0 ? "rouge" : undefined}
            precision="lecture seule, export ouvert" href="/admin/clients" />
          <Indicateur libelle="Lots gérés" valeur={lots.error ? "—" : lots.count ?? 0} accent="bleu"
            precision="base de facturation" href="/admin/clients" />
        </div>
      </section>

      {/* LES CLIENTS ONT LEUR ÉCRAN (19/09) : celle-ci renvoie à l'autre, en
          disant seulement combien ils sont. Les artisans ne sont pas des
          clients (audit C29) : leur file se dit à part. */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[length:var(--pas-section)] text-[var(--encre)]">Clients</h2>
          <span className="mono-discret">{orgs.error ? "—" : organisations.length}</span>
        </div>
        {orgs.error ? (
          <p>La liste des clients est indisponible. Rechargez la page pour la consulter.</p>
        ) : (
          <div className="colonne-liste">
            <Link href="/admin/clients" className="rang w-full">
              <span className="min-w-0 flex-1">
                <b>
                  {agences} agence{agences > 1 ? "s" : ""} · {proprietairesDirects} propriétaire
                  {proprietairesDirects > 1 ? "s" : ""} bailleur{proprietairesDirects > 1 ? "s" : ""}
                </b>
                <br />
                <small>Les fiches, l&apos;abonnement et l&apos;entrée dans leur espace.</small>
              </span>
              <span className="lien-discret shrink-0 text-sm">Ouvrir →</span>
            </Link>
            <Link href="/admin/artisans" className="rang w-full">
              <span className="min-w-0 flex-1">
                <b>{artisansEnAttente === null ? "Inscriptions d’artisans indisponibles" : `${artisansEnAttente} inscription${artisansEnAttente > 1 ? "s" : ""} artisan en attente`}</b>
                <br />
                <small>Les artisans sont des inscrits dont l&apos;entreprise se vérifie, pas des clients.</small>
              </span>
              <span className="lien-discret shrink-0 text-sm">{artisansEnAttente ? "Valider →" : "Voir →"}</span>
            </Link>
          </div>
        )}
      </section>

      {/* La mesure vit ICI et nulle part ailleurs dans la console (audit C1,
          C4) : en bas, parce qu'elle ne demande aucune décision. */}
      {/* Le même pas qu'entre deux sections (48 px) : l'enveloppe cassait la
          règle `.section-ecran + .section-ecran` et la mesure collait aux clients. */}
      <div id="mesures" className="mt-12 scroll-mt-6">
        <MesureAutonomie detail titre="Ce que Gerimmo automatise, toutes organisations" />
      </div>
    </main>
  );
}
