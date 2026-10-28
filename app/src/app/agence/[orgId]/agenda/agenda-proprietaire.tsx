import { deElide } from "@/lib/elision";
import Link from "next/link";
import { ArrowRight, CalendarCheck2, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Info, MapPin, SearchCheck, Wrench } from "lucide-react";
import { TitreEcran } from "@/components/titre-ecran";
import type { chargerAgendaGestion, RendezVousGestion } from "@/app/actions/agenda-gestion";
import { jourParis, decalerJour, TAILLE_PAGE_AGENDA } from "@/lib/agenda-gestion";
import { premier } from "@/lib/postgrest";
import { jourLong, heure, creneauTexte, STATUTS_MISSION } from "@/app/artisan/libelles";
import { EchecLecture } from "../documents/echec-lecture";
import styles from "./agenda-proprietaire.module.css";

type Agenda = Awaited<ReturnType<typeof chargerAgendaGestion>>;
const VUES = [
  { id: "mois", nom: "Calendrier", description: "Vos rendez-vous datés", icone: CalendarDays, ton: "marine" },
  { id: "a-planifier", nom: "Dates à confirmer", description: "Créneaux à convenir", icone: Clock3, ton: "or" },
  { id: "a-verifier", nom: "À vérifier", description: "Interventions à suivre", icone: SearchCheck, ton: "vert" },
] as const;
const JOURS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

function moisLong(jour: string) {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

function RendezVous({ rendezVous: r, base }: { rendezVous: RendezVousGestion; base: string }) {
  const incident = premier(r.incident);
  if (!incident) return null;
  const lot = premier(incident.lot);
  const bien = premier(lot?.bien);
  const artisan = premier(r.artisan);
  const adresse = [bien?.address_line1, bien?.city].filter(Boolean).join(", ");
  return <Link href={`${base}/incidents/${incident.id}`} className={styles.rendezVous} data-termine={r.statut === "terminee"}>
    <span className={styles.horaire}><Clock3 size={15} aria-hidden="true" />{creneauTexte(r.debut_prevu, r.fin_prevue)}</span>
    <span className={styles.titreRendezVous}>{lot?.nom || "Logement du dossier"}</span>
    <span className={styles.statut}>{r.statut === "terminee" && <Check size={12} aria-hidden="true" />}{STATUTS_MISSION[r.statut] ?? "À consulter"}</span>
    <span className={styles.detailRendezVous}><Wrench size={14} aria-hidden="true" />{artisan?.raison_sociale || "Artisan du dossier"}</span>
    {adresse && <span className={styles.detailRendezVous}><MapPin size={14} aria-hidden="true" />{adresse}</span>}
    <span className={styles.ouvrir}>Dossier {incident.numero}<ArrowRight size={15} aria-hidden="true" /></span>
  </Link>;
}

export function AgendaProprietaire({ agenda, comptesVues, base, aujourdhui }: {
  agenda: Agenda; comptesVues: Record<string, number> | null; base: string; aujourdhui: string;
}) {
  const lien = (vue: string, extra: Record<string, string> = {}) => `${base}/agenda?${new URLSearchParams({ vue, ...extra })}`;
  const lienMois = (mois: string, jour?: string) => lien("mois", { mois, ...(jour ? { jour } : {}) });
  const parJour = new Map<string, RendezVousGestion[]>();
  if (agenda.vue === "mois") for (const r of agenda.lignes) {
    if (!r.debut_prevu) continue;
    const jour = jourParis(new Date(r.debut_prevu));
    parJour.set(jour, [...(parJour.get(jour) ?? []), r]);
  }
  const duJour = parJour.get(agenda.jour) ?? [];
  const dateSelectionnee = new Date(`${agenda.jour}T12:00:00Z`);
  const joursFin = (7 - (agenda.mois.decalage + agenda.mois.jours.length) % 7) % 7;
  const moisAffiche = moisLong(agenda.mois.premier);
  const aConfirmer = comptesVues?.["a-planifier"] ?? 0;
  const vueCourante = VUES.find((vue) => vue.id === agenda.vue);

  return <main className={`mx-auto w-full p-4 sm:p-7 ${styles.page}`}>
    <header className={`entete-page ${styles.entete}`}>
      <div><TitreEcran rubrique="agenda">Agenda</TitreEcran>
        <p>Vos interventions, leurs dates et les rendez-vous à venir.</p>
      </div>
      <Link href={`${base}/incidents`} className="btn-secondaire"><Wrench size={16} aria-hidden="true" />Voir mes incidents</Link>
    </header>

    <nav className={styles.vues} aria-label="Vues de l’agenda">
      {VUES.map(({ id, nom, description, icone: Icone, ton }) => {
        const compte = id === "mois" ? (agenda.vue === "mois" && !agenda.erreur ? agenda.total : null) : comptesVues?.[id];
        return <Link key={id} href={lien(id)} aria-current={agenda.vue === id ? "page" : undefined} data-ton={ton} data-attention={id !== "mois" && (compte ?? 0) > 0}>
          <span className={styles.iconeVue}><Icone size={21} aria-hidden="true" /></span>
          <span><strong>{nom}</strong><small>{description}</small></span>
          {compte != null ? <span className={styles.compteur}>{compte}</span> : id !== "mois" && <span className={styles.compteur} aria-label="Nombre indisponible">—</span>}
        </Link>;
      })}
    </nav>

    {agenda.erreur ? <EchecLecture quoi={["vos rendez-vous"]} /> : agenda.vue === "mois" ? <div className={styles.disposition}>
      <section className={styles.calendrier} aria-label={`Calendrier ${deElide(moisAffiche)}`}>
        <header className={styles.enteteMois}>
          <div><h2>{moisAffiche}</h2><p>{agenda.total} rendez-vous ce mois-ci</p></div>
          <nav className={styles.navigationMois} aria-label="Changer de mois">
            {/* Sans préchargement (audit final, UX-13) : chaque case du mois et chaque mois voisin lançaient un rendu
                serveur à l'ouverture — 80 requêtes avant tout geste. Les onglets de vue, eux, restent préchargés. */}
            <Link href={lienMois(agenda.mois.precedent.slice(0, 7))} prefetch={false} aria-label="Mois précédent" scroll={false}><ChevronLeft size={18} aria-hidden="true" /></Link>
            <Link href={`${base}/agenda`} prefetch={false} className={styles.aujourdhuiLien}>Aujourd’hui</Link>
            <Link href={lienMois(agenda.mois.suivant.slice(0, 7))} prefetch={false} aria-label="Mois suivant" scroll={false}><ChevronRight size={18} aria-hidden="true" /></Link>
          </nav>
        </header>
        <div className={styles.grille} role="group" aria-label={`Rendez-vous ${deElide(moisAffiche)}`}>
          {JOURS.map((jour) => <span key={jour} className={styles.nomJour} aria-hidden="true">{jour}</span>)}
          {Array.from({ length: agenda.mois.decalage }, (_, i) => <span key={`avant-${i}`} className={styles.horsMois} aria-hidden="true">{Number(decalerJour(agenda.mois.premier, i - agenda.mois.decalage).slice(8))}</span>)}
          {agenda.mois.jours.map((jour, i) => {
            const rendezVous = parJour.get(jour) ?? [];
            const nb = rendezVous.length;
            const jourActuel = jour === aujourdhui;
            return <Link key={jour} href={lienMois(agenda.mois.mois, jour)} scroll={false} prefetch={false}
              aria-current={jour === agenda.jour ? "date" : undefined}
              className={styles.jour} data-aujourdhui={jourActuel} data-weekend={(i + agenda.mois.decalage) % 7 >= 5}>
              {/* Nom accessible : le chiffre affiché d'abord, puis la date complète masquée à l'écran (WCAG 2.5.3). */}
              <span className={styles.numero}>{Number(jour.slice(8))}</span>
              <span className="sr-only">{` — ${jourLong(`${jour}T12:00:00Z`)}${jourActuel ? ", aujourd’hui" : ""}, ${nb} rendez-vous`}</span>
              {nb > 0 && <span className={styles.evenement} aria-hidden="true"><span className={styles.pointEvenement} /><span className={styles.heureEvenement}>{heure(rendezVous[0].debut_prevu)}</span><span className={styles.nombreEvenements}>{nb > 1 ? `+${nb - 1}` : "1 RDV"}</span></span>}
            </Link>;
          })}
          {Array.from({ length: joursFin }, (_, i) => <span key={`apres-${i}`} className={styles.horsMois} aria-hidden="true">{i + 1}</span>)}
        </div>
        <footer className={styles.legende}><span><i className={styles.repereAujourdhui} />Aujourd’hui</span><span><i className={styles.repereSelection} />Jour sélectionné</span><span><i className={styles.repereRendezVous} />Rendez-vous</span><span className={styles.fuseau}>Heure de Paris</span></footer>
      </section>

      <section id="rendez-vous-du-jour" className={styles.journee} aria-live="polite" aria-label={`Rendez-vous du ${jourLong(`${agenda.jour}T12:00:00Z`)}`}>
        <header className={styles.enteteJournee}>
          <span className={styles.dateBadge} aria-hidden="true"><strong>{dateSelectionnee.getUTCDate()}</strong><span>{dateSelectionnee.toLocaleDateString("fr-FR", { month: "short", timeZone: "Europe/Paris" })}</span></span>
          <div><span className={styles.surtitre}>{agenda.jour === aujourdhui ? "Aujourd’hui" : "Jour sélectionné"}</span><h2>{dateSelectionnee.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" })}</h2><p>{duJour.length} rendez-vous</p></div>
        </header>
        {duJour.length ? <div className={styles.rendezVousDuJour}>{duJour.map((r) => <RendezVous key={r.id} rendezVous={r} base={base} />)}</div> : <div className={styles.journeeVide}>
          <span className={styles.iconeVide}><CalendarCheck2 size={28} strokeWidth={1.5} aria-hidden="true" /></span>
          <h3>Aucun rendez-vous prévu</h3><p>Rien n’est programmé pour cette journée. Sélectionnez une autre date pour consulter ses rendez-vous.</p>
          <Link className={styles.lienAction} href={aConfirmer > 0 ? lien("a-planifier") : `${base}/incidents`}>{aConfirmer > 0 ? "Confirmer une date" : "Suivre mes incidents"}<ArrowRight size={15} aria-hidden="true" /></Link>
        </div>}
        <div className={styles.conseil}><Info size={16} aria-hidden="true" /><p>Les rendez-vous apparaissent ici dès qu’un créneau est convenu dans le dossier d’incident.</p></div>
      </section>
    </div> : <section className={styles.suivi}>
      <header className={styles.enteteSuivi}><div><h2>{vueCourante?.nom ?? "Interventions"}</h2><p>{agenda.vue === "a-planifier" ? "Ouvrez un dossier pour suivre les propositions de créneaux et convenir d’une date." : "Le créneau est passé. Consultez le dossier pour vérifier si l’intervention est terminée."}</p></div><span className={styles.totalSuivi}>{agenda.total} intervention{agenda.total > 1 ? "s" : ""}</span></header>
      {agenda.lignes.length ? <div className={styles.listeSuivi}>{agenda.lignes.map((r) => <RendezVous key={r.id} rendezVous={r} base={base} />)}</div> : <div className={styles.suiviVide}>
        <span className={styles.iconeVide}><CalendarCheck2 size={30} strokeWidth={1.5} aria-hidden="true" /></span>
        <h3>{agenda.total > 0 ? "Aucune intervention sur cette page" : agenda.vue === "a-planifier" ? "Aucune date à confirmer" : "Aucune intervention à vérifier"}</h3>
        <p>{agenda.total > 0 ? "Retrouvez les interventions sur la première page." : "Retrouvez vos rendez-vous dans le calendrier ou poursuivez le suivi de vos incidents."}</p>
        <Link className={styles.lienAction} href={agenda.total > 0 ? lien(agenda.vue) : lien("mois")}>{agenda.total > 0 ? "Revenir à la première page" : "Revenir au calendrier"}<ArrowRight size={15} aria-hidden="true" /></Link>
      </div>}
      {(agenda.total > TAILLE_PAGE_AGENDA || agenda.page > 1) && <nav className={styles.pagination} aria-label="Pages de l’agenda">
        {agenda.page > 1 && <Link href={lien(agenda.vue, { page: String(agenda.page - 1) })}>Page précédente</Link>}<span>Page {agenda.page}</span>
        {agenda.page * TAILLE_PAGE_AGENDA < agenda.total && <Link href={lien(agenda.vue, { page: String(agenda.page + 1) })}>Page suivante</Link>}
      </nav>}
    </section>}
  </main>;
}
