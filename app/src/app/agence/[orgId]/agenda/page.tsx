import Link from "next/link";
import { CalendarDays, Clock3, ArrowUpRight } from "lucide-react";
import { chargerAgendaGestion, type RendezVousGestion } from "@/app/actions/agenda-gestion";
import { jourParis, TAILLE_PAGE_AGENDA } from "@/lib/agenda-gestion";
import { premier } from "@/lib/postgrest";
import { jourLong, creneauTexte, STATUTS_MISSION } from "@/app/artisan/libelles";
import { EchecLecture } from "../documents/echec-lecture";

export const metadata = { title: "Agenda — Gerimmo" };

// Le calendrier d'abord (retour du porteur, 24/09 : « un calendrier mensuel où
// je clique sur le jour pour avoir le détail »). Les deux autres vues listent
// ce qui n'a pas encore de date, ou dont la date est passée sans conclusion.
const VUES = [
  { id: "mois", nom: "Calendrier" },
  { id: "a-planifier", nom: "Dates à confirmer" },
  { id: "a-verifier", nom: "À vérifier" },
] as const;
const JOURS_SEMAINE = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function moisLong(premier: string) {
  const texte = new Date(`${premier}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function CarteRendezVous({ r, base }: { r: RendezVousGestion; base: string }) {
  const incident = premier(r.incident)!;
  const lot = premier(incident.lot);
  const bien = premier(lot?.bien);
  const artisan = premier(r.artisan);
  return (
    <article className="agenda-rendezvous">
      <div className="agenda-horaire"><Clock3 className="size-4" aria-hidden="true" /><p>{creneauTexte(r.debut_prevu, r.fin_prevue)}</p></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3>{lot?.nom ?? "Logement du dossier"}</h3>
          <span className={r.statut === "terminee" ? "puce puce-verte" : "puce puce-grise"}>{STATUTS_MISSION[r.statut] ?? "À consulter"}</span>
        </div>
        <p className="mt-1 text-sm">{artisan?.raison_sociale ?? "Artisan du dossier"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{[bien?.address_line1, bien?.city].filter(Boolean).join(" · ")}</p>
        <Link href={`${base}/incidents/${incident.id}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm underline-offset-4 hover:underline">
          Ouvrir le dossier {incident.numero}<ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export default async function PageAgenda({ params, searchParams }: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ vue?: string; mois?: string; jour?: string; page?: string }>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;
  const agenda = await chargerAgendaGestion(orgId, { ...sp, vue: sp.vue ?? "mois" });
  const base = `/agence/${orgId}`;
  const lien = (vue: string, extra: Record<string, string> = {}) => `${base}/agenda?${new URLSearchParams({ vue, ...extra })}`;
  const lienMois = (mois: string, jour?: string) => lien("mois", { mois, ...(jour ? { jour } : {}) });
  const aujourdhui = jourParis(new Date());

  // Un rendez-vous compte sur le jour où il commence (heure de Paris).
  const parJour = new Map<string, RendezVousGestion[]>();
  if (agenda.vue === "mois") {
    for (const r of agenda.lignes) {
      if (!r.debut_prevu) continue;
      const j = jourParis(new Date(r.debut_prevu));
      parJour.set(j, [...(parJour.get(j) ?? []), r]);
    }
  }
  const duJour = parJour.get(agenda.jour) ?? [];

  return <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-7">
    <div className="portail-hero">
      <p className="portail-surtitre">Le suivi des interventions</p><h1>Mon agenda</h1>
      <p className="mt-2 text-sm">Qui intervient, où et quand : les rendez-vous de vos dossiers, réunis au même endroit.</p>
    </div>
    <nav className="dossier-nav" aria-label="Vues de l’agenda">
      {VUES.map((v) => <Link key={v.id} href={lien(v.id)} aria-current={agenda.vue === v.id ? "page" : undefined} className={agenda.vue === v.id ? "agenda-onglet-actif" : ""}>{v.nom}</Link>)}
    </nav>

    {agenda.erreur ? <EchecLecture quoi={["les rendez-vous de votre portefeuille"]} /> : agenda.vue === "mois" ? <>
      <section className="agenda-periode" aria-label="Mois affiché">
        <div><p className="eyebrow">Calendrier</p><h2>{moisLong(agenda.mois.premier)}</h2><p className="text-xs text-muted-foreground">{agenda.total} rendez-vous ce mois-ci · Heure de Paris</p></div>
        <nav className="dossier-nav" aria-label="Changer de mois">
          <Link href={lienMois(agenda.mois.precedent.slice(0, 7))} aria-label="Mois précédent">←</Link>
          <Link href={`${base}/agenda`}>Ce mois-ci</Link>
          <Link href={lienMois(agenda.mois.suivant.slice(0, 7))} aria-label="Mois suivant">→</Link>
        </nav>
      </section>

      <div className="agenda-calendrier" role="grid" aria-label={`Rendez-vous de ${moisLong(agenda.mois.premier)}`}>
        {JOURS_SEMAINE.map((n) => <div key={n} role="columnheader" className="agenda-nom-jour">{n}</div>)}
        {Array.from({ length: agenda.mois.decalage }, (_, i) => <div key={`vide-${i}`} aria-hidden="true" />)}
        {agenda.mois.jours.map((j) => {
          const nb = parJour.get(j)?.length ?? 0;
          const actif = j === agenda.jour;
          return (
            <Link
              key={j}
              href={lienMois(agenda.mois.mois, j)}
              role="gridcell"
              aria-current={actif ? "date" : undefined}
              aria-label={`${jourLong(`${j}T12:00:00Z`)}${nb ? `, ${nb} rendez-vous` : ""}`}
              className={`agenda-jour${actif ? " actif" : ""}${j === aujourdhui ? " aujourdhui" : ""}${nb ? " occupe" : ""}`}
            >
              <span className="agenda-jour-numero">{Number(j.slice(8))}</span>
              {nb > 0 && <span className="agenda-jour-compte" aria-hidden="true">{nb}</span>}
            </Link>
          );
        })}
      </div>

      <section aria-live="polite" className="space-y-3">
        <h2 className="text-lg">{jourLong(`${agenda.jour}T12:00:00Z`)}</h2>
        {duJour.length === 0 ? (
          <div className="agenda-vide">
            <CalendarDays className="size-8" aria-hidden="true" />
            <h3>Aucun rendez-vous ce jour-là</h3>
            <p>Les dates choisies dans les dossiers d’incident apparaissent ici automatiquement. Un chiffre sur une case du calendrier signale un jour occupé.</p>
          </div>
        ) : duJour.map((r) => <CarteRendezVous key={r.id} r={r} base={base} />)}
      </section>
    </> : <>
      <p className="text-sm text-muted-foreground">{agenda.vue === "a-planifier" ? "Ces missions n’ont pas encore de rendez-vous confirmé. Ouvrez le dossier pour suivre l’acceptation de l’artisan et les propositions de créneaux." : "Le créneau est passé, mais l’intervention n’est pas indiquée comme terminée. Vérifiez son avancement avec l’artisan avant de conclure à un retard."}</p>
      <p className="text-sm text-muted-foreground">{agenda.total} intervention{agenda.total > 1 ? "s" : ""} dans cette vue</p>
      {agenda.lignes.length === 0 ? <div className="agenda-vide"><CalendarDays className="size-8" aria-hidden="true" />
        <h2>{agenda.total > 0 ? "Cette page ne contient plus de rendez-vous" : agenda.vue === "a-planifier" ? "Aucune date à confirmer" : "Aucune intervention à vérifier"}</h2>
        <p>Vous pouvez continuer le suivi depuis vos incidents.</p>
        <Link className="lien-discret" href={agenda.total > 0 ? lien(agenda.vue) : `${base}/incidents`}>{agenda.total > 0 ? "Revenir à la première page" : "Voir mes incidents"} →</Link>
      </div> : <div className="space-y-3">{agenda.lignes.map((r) => <CarteRendezVous key={r.id} r={r} base={base} />)}</div>}
      {(agenda.total > TAILLE_PAGE_AGENDA || agenda.page > 1) && <nav className="dossier-nav" aria-label="Pages de l’agenda">
        {agenda.page > 1 && <Link href={lien(agenda.vue, { page: String(agenda.page - 1) })}>Page précédente</Link>}
        <span className="self-center text-sm">Page {agenda.page}</span>
        {agenda.page * TAILLE_PAGE_AGENDA < agenda.total && <Link href={lien(agenda.vue, { page: String(agenda.page + 1) })}>Page suivante</Link>}
      </nav>}
    </>}
  </main>;
}
