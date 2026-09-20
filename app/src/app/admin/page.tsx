import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { familleOrganisation } from "@/lib/clients-supervision";
import { dernieresTaches, type PasseConsignee } from "@/lib/tache";
import { faitsManquants } from "@/lib/editeur";
import { etatConfiguration, etatTaches, pointsBloquants } from "@/lib/sante-service";

export const metadata = { title: "Console d'administration — Gerimmo" };

// Indicateurs et files de décisions de la supervision.

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
  compte: number | null;
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
          (compte ?? 0) > 0 ? "bg-[var(--or)]" : "bg-[var(--filet)]"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-heading text-[16px] text-[var(--encre)]">{titre}</span>
          <span className={`puce ${(compte ?? 0) > 0 ? "puce-prep" : "puce-grise"}`}>
            {compte === null ? "indisponible" : compte === 0 ? "à jour" : `${compte} en attente`}
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
  const [orgs, devis, publications, lots, artisans, retours, contestations, journalTaches] = await Promise.all([
    supabase.from("organizations").select("id, name, status, type, essai_fin").order("name"),
    supabase.from("demandes_devis").select("id", { count: "exact", head: true }).is("traitee_le", null),
    supabase.from("publications").select("id, statut"),
    supabase.from("lots").select("id", { count: "exact", head: true }).neq("etat", "archive"),
    supabase.rpc("artisans_a_valider"),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).in("etat", ["nouveau", "en_examen", "en_cours"]).neq("nature", "contestation"),
    supabase.from("retours_utilisateurs").select("id", { count: "exact", head: true }).eq("nature", "contestation").neq("etat", "resolu"),
    supabase.from("tech_log").select("evenement, details, created_at").like("evenement", "tache_%").order("created_at", { ascending: false }).limit(200),
  ]);

  // La santé du service, en une ligne (20/09) : une variable absente ou une
  // tâche qui n'a jamais tourné ne se voit pas d'ici, et c'est ici qu'on
  // regarde. Le détail vit sur /admin/sante ; la supervision dit seulement
  // combien de points bloquent, et se tait quand tout est en place.
  const bloquants = pointsBloquants(
    etatConfiguration(process.env),
    journalTaches.error
      ? []
      : etatTaches(dernieresTaches((journalTaches.data ?? []) as PasseConsignee[]), new Date()),
    faitsManquants().length
  );

  const enEchec = [orgs.error, devis.error, publications.error, lots.error, artisans.error, retours.error, contestations.error].filter(Boolean);
  const organisations = (orgs.data ?? []) as Organisation[];
  const parStatut = (s: string) => organisations.filter((o) => o.status === s).length;
  const agences = organisations.filter((o) => familleOrganisation(o.type) === "agence").length;
  const proprietairesDirects = organisations.length - agences;
  const aEcrire = (publications.data ?? []).filter(
    (p) => p.statut === "proposition" || p.statut === "brouillon"
  ).length;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Supervision</h1>
        <div className="flex items-center gap-3">
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

      <Link href="/admin/brief" className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-[var(--filet)] bg-[var(--ivoire)] p-4 text-sm text-[var(--encre)] hover:bg-[var(--survol)]">
        <span><b>Brief de pilotage</b><span className="ml-2 text-[var(--texte-secondaire)]">Priorités, signaux utilisateurs et ordre de croissance.</span></span>
        <span className="lien-discret shrink-0">Ouvrir →</span>
      </Link>

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

      {bloquants > 0 && (
        <Link
          href="/admin/sante"
          className="mb-6 flex items-start gap-3 border border-[var(--warning)] bg-[var(--warning-soft)] p-3.5 text-[13px] text-[var(--warning-soft-foreground)] hover:underline"
        >
          <span className="min-w-0 flex-1">
            <b className="font-semibold">Le service n&apos;est pas prêt</b> : {bloquants} point
            {bloquants > 1 ? "s" : ""} bloque{bloquants > 1 ? "nt" : ""} — variable absente,
            tâche jamais passée ou document légal incomplet.
          </span>
          <span className="shrink-0">Santé du service →</span>
        </Link>
      )}

      {/* Indicateurs — wiki/personas/Super Admin.md : agences par statut,
          lots gérés (base de facturation), volumes. */}
      <section className="section-ecran">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicateur libelle="Actives" valeur={orgs.error ? "—" : parStatut("active")} accent="vert"
            precision="abonnement en cours" />
          <Indicateur libelle="En essai" valeur={orgs.error ? "—" : parStatut("essai")} accent="or"
            precision="14 jours, sans carte" />
          <Indicateur libelle="Suspendues" valeur={orgs.error ? "—" : parStatut("suspendue")} accent="rouge"
            precision="lecture seule, export ouvert" />
          <Indicateur libelle="Lots gérés" valeur={lots.error ? "—" : lots.count ?? 0} accent="bleu"
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
            titre="Inscriptions artisan"
            compte={artisans.error ? null : (artisans.data ?? []).length}
            explication="Vérifiez le SIRET et les justificatifs, puis validez ou refusez l’inscription avec un motif."
            href="/admin/artisans"
            action="Examiner les inscriptions"
          />
          <File
            titre="Demandes de devis"
            compte={devis.error ? null : devis.count ?? 0}
            explication="Demandes commerciales reçues depuis le site : consultez le besoin de l’agence et préparez votre réponse."
            href="/admin/devis"
            action="Traiter les demandes"
          />
          <File titre="Retours et idées" compte={retours.error ? null : retours.count ?? 0} explication="Qualifiez les problèmes, répondez aux utilisateurs et examinez les idées lors de la revue mensuelle." href="/admin/retours" action="Ouvrir le suivi" />
          <File titre="Contestations artisan" compte={contestations.error ? null : contestations.count ?? 0} explication="Examinez les demandes de révision dans un suivi privé entre l’artisan et la supervision." href="/admin/retours?nature=contestation" action="Examiner les contestations" />
          <File
            titre="Journal"
            compte={publications.error ? null : aEcrire}
            explication="Sujets proposés par le calendrier du métier, à compléter et publier. Un article ne paraît pas tant qu'un fait daté manque."
            href="/admin/publications"
            action="Ouvrir le journal"
          />
        </div>

      </section>

      {/* LES CLIENTS ONT LEUR ÉCRAN (19/09) : la liste complète vivait ici, à
          plat, agences et propriétaires mêlés et les artisans absents. Deux
          listes divergentes valent moins qu'une : celle-ci renvoie à l'autre,
          en disant seulement combien ils sont. */}
      <section className="section-ecran">
        <div className="entete-carte mb-3">
          <h2 className="font-heading text-[var(--pas-section)] text-[var(--encre)]">Clients</h2>
          <span className="mono-discret">{orgs.error ? "—" : organisations.length}</span>
        </div>
        {orgs.error ? (
          <p>La liste des clients est indisponible. Rechargez la page pour la consulter.</p>
        ) : (
          <Link
            href="/admin/clients"
            className="group flex items-center justify-between gap-3 border border-[var(--filet)] bg-[var(--ivoire)] p-4 transition-colors hover:bg-[var(--survol)]"
          >
            <span className="min-w-0">
              <span className="block font-heading text-[16px] text-[var(--encre)]">
                {agences} agence{agences > 1 ? "s" : ""} · {proprietairesDirects} propriétaire
                {proprietairesDirects > 1 ? "s" : ""} bailleur
                {proprietairesDirects > 1 ? "s" : ""}
                {artisans.error ? "" : ` · ${(artisans.data ?? []).length} artisan${(artisans.data ?? []).length > 1 ? "s" : ""} en attente`}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
                Les trois familles, leurs fiches, et l&apos;entrée dans leur
                espace.
              </span>
            </span>
            <span className="lien-discret shrink-0 text-[12.5px] group-hover:underline">
              Ouvrir →
            </span>
          </Link>
        )}
      </section>
    </main>
  );
}
