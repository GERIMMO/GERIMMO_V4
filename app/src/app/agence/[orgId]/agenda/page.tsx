import Link from "next/link";
import { CalendarDays, Clock3, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "@/lib/portefeuille";
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

// Toute la carte mène au dossier (24/09, « je veux que tout le carré soit
// cliquable ») : seul le petit lien du bas y menait. La mention « Ouvrir le
// dossier » reste, soulignée au survol de la carte, pour dire où l'on va.
function CarteRendezVous({ r, base }: { r: RendezVousGestion; base: string }) {
  const incident = premier(r.incident)!;
  const lot = premier(incident.lot);
  const bien = premier(lot?.bien);
  const artisan = premier(r.artisan);
  return (
    <Link href={`${base}/incidents/${incident.id}`} className="agenda-rendezvous group">
      <div className="agenda-horaire"><Clock3 className="size-4" aria-hidden="true" /><p>{creneauTexte(r.debut_prevu, r.fin_prevue)}</p></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3>{lot?.nom ?? "Logement du dossier"}</h3>
          <span className={r.statut === "terminee" ? "puce puce-verte" : "puce puce-grise"}>{STATUTS_MISSION[r.statut] ?? "À consulter"}</span>
        </div>
        <p className="mt-1 text-sm">{artisan?.raison_sociale ?? "Artisan du dossier"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{[bien?.address_line1, bien?.city].filter(Boolean).join(" · ")}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm underline-offset-4 group-hover:underline">
          Ouvrir le dossier {incident.numero}<ArrowUpRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

// Les compteurs des onglets (24/09) : sans chiffre, il fallait ouvrir
// « Dates à confirmer » et « À vérifier » chaque jour pour savoir s'il y avait
// quelque chose à faire. Mêmes filtres et même périmètre portefeuille que
// `chargerAgendaGestion` (actions/agenda-gestion.ts) — une lecture en tête
// seule par onglet. `null` : le compte n'a pas pu être lu, l'onglet se tait.
async function compterVuesAgenda(orgId: string): Promise<Record<string, number> | null> {
  const { supabase, user, role } = await verifierAccesEspace(orgId);
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  if (portefeuille instanceof PortefeuilleIndisponible) return null;
  if (portefeuille?.size === 0) return { "a-planifier": 0, "a-verifier": 0 };
  const compter = () => {
    let q = supabase.from("incident_interventions").select(
      "id, incident:incidents!incident_interventions_incident_meme_org_fk!inner(lot_id)",
      { count: "exact", head: true }
    ).eq("organization_id", orgId).eq("incident.organization_id", orgId);
    if (portefeuille) q = q.in("incident.lot_id", [...portefeuille]);
    return q;
  };
  const [aPlanifier, aVerifier] = await Promise.all([
    compter().in("statut", ["proposee", "acceptee"]).is("debut_prevu", null),
    compter().in("statut", ["planifiee", "en_cours"]).lt("fin_prevue", new Date().toISOString()),
  ]);
  if (aPlanifier.error || aVerifier.error) return null;
  return { "a-planifier": aPlanifier.count ?? 0, "a-verifier": aVerifier.count ?? 0 };
}

export default async function PageAgenda({ params, searchParams }: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ vue?: string; mois?: string; jour?: string; page?: string }>;
}) {
  const { orgId } = await params;
  // cache() : même lecture que le layout et que l'action, pour la mention
  // « Mon portefeuille » de l'agent (comme Loyers, Statistiques, Messages).
  const { role } = await verifierAccesEspace(orgId);
  const sp = await searchParams;
  const [agenda, comptesVues] = await Promise.all([
    chargerAgendaGestion(orgId, { ...sp, vue: sp.vue ?? "mois" }),
    compterVuesAgenda(orgId),
  ]);
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
    {/* L'en-tête standard de l'espace (tour du 24/09) : le hero bleu était
        le seul de son genre hors accueil. Titre, mention, une phrase — comme
        « Loyers & charges ». */}
    <div>
      {/* L'écart sous le filet est celui de .entete-page (24/09). */}
      <div className="entete-page">
        <h1>Agenda</h1>
        <span className="mono-discret">
          {role === "agent" ? "Mon portefeuille · " : ""}
          {agenda.vue === "mois" ? moisLong(agenda.mois.premier) : `${agenda.total} intervention${agenda.total > 1 ? "s" : ""}`}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">Qui intervient, où et quand : les rendez-vous de vos dossiers, réunis au même endroit.</p>
    </div>
    <nav className="dossier-nav" aria-label="Vues de l’agenda">
      {VUES.map((v) => {
        // Le chiffre ne s'affiche que s'il y a quelque chose à faire.
        const nb = comptesVues?.[v.id] ?? 0;
        return <Link key={v.id} href={lien(v.id)} aria-current={agenda.vue === v.id ? "page" : undefined} className={agenda.vue === v.id ? "agenda-onglet-actif" : ""}>{v.nom}{nb > 0 && ` · ${nb}`}</Link>;
      })}
    </nav>

    {agenda.erreur ? <EchecLecture quoi={["les rendez-vous de votre portefeuille"]} /> : agenda.vue === "mois" ? <>
      {/* Ni sur-titre « Calendrier » sous l'onglet du même nom, ni second
          titre du mois : le mois est la mention d'en-tête, qui suit la
          navigation (24/09). Les flèches deviennent des chevrons dans une
          cible de 44 px, et la rangée se distingue des onglets de vue
          (.agenda-nav-mois). */}
      <section className="agenda-periode" aria-label={`Mois affiché : ${moisLong(agenda.mois.premier)}`}>
        <p className="text-xs text-muted-foreground">{agenda.total} rendez-vous ce mois-ci · Heure de Paris</p>
        <nav className="dossier-nav agenda-nav-mois" aria-label="Changer de mois">
          <Link href={lienMois(agenda.mois.precedent.slice(0, 7))} aria-label="Mois précédent" className="inline-flex min-w-11 items-center justify-center"><ChevronLeft className="size-4" aria-hidden="true" /></Link>
          <Link href={`${base}/agenda`} className="inline-flex items-center">Ce mois-ci</Link>
          <Link href={lienMois(agenda.mois.suivant.slice(0, 7))} aria-label="Mois suivant" className="inline-flex min-w-11 items-center justify-center"><ChevronRight className="size-4" aria-hidden="true" /></Link>
        </nav>
      </section>

      {/* Un groupe de liens, pas une grille ARIA : une grille exige des rangées
          et une navigation aux flèches. Chaque jour porte son nom complet. */}
      <div className="agenda-calendrier" role="group" aria-label={`Rendez-vous de ${moisLong(agenda.mois.premier)}`}>
        {JOURS_SEMAINE.map((n) => <div key={n} aria-hidden="true" className="agenda-nom-jour">{n}</div>)}
        {Array.from({ length: agenda.mois.decalage }, (_, i) => <div key={`vide-${i}`} aria-hidden="true" />)}
        {agenda.mois.jours.map((j) => {
          const nb = parJour.get(j)?.length ?? 0;
          const actif = j === agenda.jour;
          return (
            <Link
              key={j}
              href={lienMois(agenda.mois.mois, j)}
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
            {/* D'où viennent les dates, et le geste réel (25/09, D14) : on ne
                pose pas de rendez-vous ici — il naît d'un incident, quand
                l'artisan et vous convenez du créneau. Pas de bouton « Ajouter
                un rendez-vous » qui n'existerait pas derrière. */}
            <p>Un rendez-vous naît d’un dossier d’incident : une fois l’incident déclaré et l’artisan retenu, la date convenue s’inscrit ici d’elle-même. Un chiffre sur une case du calendrier signale un jour occupé.</p>
            {/* Un geste, comme les états vides des deux autres onglets (24/09) :
                vers les dates à confirmer s'il y en a, sinon vers la
                déclaration — pas d'un état vide à un autre. */}
            {(comptesVues?.["a-planifier"] ?? 0) > 0
              ? <Link className="lien-discret" href={lien("a-planifier")}>Voir les dates à confirmer →</Link>
              : <Link className="lien-discret" href={`${base}/incidents/nouveau`}>Déclarer un incident →</Link>}
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
