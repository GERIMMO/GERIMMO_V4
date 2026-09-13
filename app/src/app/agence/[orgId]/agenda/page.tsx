import Link from "next/link";
import { CalendarDays, Clock3, ArrowUpRight } from "lucide-react";
import { chargerAgendaGestion } from "@/app/actions/agenda-gestion";
import { TAILLE_PAGE_AGENDA } from "@/lib/agenda-gestion";
import { premier } from "@/lib/postgrest";
import { jourLong, creneauTexte, STATUTS_MISSION } from "@/app/artisan/libelles";
import { EchecLecture } from "../documents/echec-lecture";

export const metadata = { title: "Agenda — Gerimmo" };
const VUES = [{ id: "semaine", nom: "Rendez-vous" }, { id: "a-planifier", nom: "Dates à confirmer" }, { id: "a-verifier", nom: "À vérifier" }];

export default async function PageAgenda({ params, searchParams }: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ vue?: string; semaine?: string; page?: string }>;
}) {
  const { orgId } = await params;
  const agenda = await chargerAgendaGestion(orgId, await searchParams);
  const base = `/agence/${orgId}`;
  const lien = (vue = agenda.vue, semaine = agenda.semaine.lundi, page = 1) => `${base}/agenda?${new URLSearchParams({ vue, semaine, page: String(page) })}`;
  return <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-7">
    <div className="portail-hero">
      <p className="portail-surtitre">Le suivi des interventions</p><h1>Mon agenda</h1>
      <p className="mt-2 text-sm">Qui intervient, où et quand : les rendez-vous de vos dossiers, réunis au même endroit.</p>
    </div>
    <nav className="dossier-nav" aria-label="Vues de l’agenda">
      {VUES.map((v) => <Link key={v.id} href={lien(v.id as typeof agenda.vue)} aria-current={agenda.vue === v.id ? "page" : undefined} className={agenda.vue === v.id ? "agenda-onglet-actif" : ""}>{v.nom}</Link>)}
    </nav>
    {agenda.vue === "semaine" ? <section className="agenda-periode" aria-label="Semaine affichée">
      <div><p className="eyebrow">Semaine du</p><h2>{jourLong(`${agenda.semaine.lundi}T12:00:00Z`)}</h2><p className="text-xs text-muted-foreground">Jusqu’au {jourLong(`${agenda.semaine.dimanche}T12:00:00Z`)} · Heure de Paris</p></div>
      <nav className="dossier-nav" aria-label="Changer de semaine">
        <Link href={lien("semaine", agenda.semaine.precedent)} aria-label="Semaine précédente">←</Link>
        <Link href={`${base}/agenda`}>Cette semaine</Link>
        <Link href={lien("semaine", agenda.semaine.suivant)} aria-label="Semaine suivante">→</Link>
      </nav>
    </section> : <p className="text-sm text-muted-foreground">{agenda.vue === "a-planifier" ? "Ces missions n’ont pas encore de rendez-vous confirmé. Ouvrez le dossier pour suivre l’acceptation de l’artisan et les propositions de créneaux." : "Le créneau est passé, mais l’intervention n’est pas indiquée comme terminée. Vérifiez son avancement avec l’artisan avant de conclure à un retard."}</p>}
    {agenda.erreur ? <EchecLecture quoi={["les rendez-vous de votre portefeuille"]} /> : <>
      <p className="text-sm text-muted-foreground">{agenda.total} intervention{agenda.total > 1 ? "s" : ""}{agenda.vue === "semaine" ? " sur cette semaine" : " dans cette vue"}</p>
      {agenda.lignes.length === 0 ? <div className="agenda-vide"><CalendarDays className="size-8" aria-hidden="true" />
        <h2>{agenda.total > 0 ? "Cette page ne contient plus de rendez-vous" : agenda.vue === "semaine" ? "Aucun rendez-vous confirmé cette semaine" : agenda.vue === "a-planifier" ? "Aucune date à confirmer" : "Aucune intervention à vérifier"}</h2>
        <p>{agenda.vue === "semaine" ? "Les dates choisies dans les dossiers d’incident apparaissent ici automatiquement." : "Vous pouvez continuer le suivi depuis vos incidents."}</p>
        <Link className="lien-discret" href={agenda.total > 0 ? lien(agenda.vue, agenda.semaine.lundi) : `${base}/incidents`}>{agenda.total > 0 ? "Revenir à la première page" : "Voir mes incidents"} →</Link>
      </div> : <div className="space-y-3">{agenda.lignes.map((r) => {
        const incident = premier(r.incident)!;
        const lot = premier(incident.lot);
        const bien = premier(lot?.bien);
        const artisan = premier(r.artisan);
        return <article className="agenda-rendezvous" key={r.id}>
          <div className="agenda-horaire"><Clock3 className="size-4" aria-hidden="true" /><p>{creneauTexte(r.debut_prevu, r.fin_prevue)}</p></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2>{lot?.nom ?? "Logement du dossier"}</h2><span className={r.statut === "terminee" ? "puce puce-verte" : "puce puce-grise"}>{STATUTS_MISSION[r.statut] ?? "À consulter"}</span></div>
            <p className="text-sm mt-1">{artisan?.raison_sociale ?? "Artisan du dossier"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{[bien?.address_line1, bien?.city].filter(Boolean).join(" · ")}</p>
            <Link href={`${base}/incidents/${incident.id}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm underline-offset-4 hover:underline">Ouvrir le dossier {incident.numero}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
          </div>
        </article>;
      })}</div>}
      {(agenda.total > TAILLE_PAGE_AGENDA || agenda.page > 1) && <nav className="dossier-nav" aria-label="Pages de l’agenda">
        {agenda.page > 1 && <Link href={lien(agenda.vue, agenda.semaine.lundi, agenda.page - 1)}>Page précédente</Link>}
        <span className="self-center text-sm">Page {agenda.page}</span>
        {agenda.page * TAILLE_PAGE_AGENDA < agenda.total && <Link href={lien(agenda.vue, agenda.semaine.lundi, agenda.page + 1)}>Page suivante</Link>}
      </nav>}
    </>}
  </main>;
}
