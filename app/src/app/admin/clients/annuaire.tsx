import Link from "next/link";
import { Search, Home, Building2, Wrench, ClipboardCheck, ArrowUpRight, Users } from "lucide-react";
import { initiales, LIBELLES_FAMILLE, LIBELLES_STATUT_ARTISAN, type FamilleClient } from "@/lib/clients-supervision";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import { Pagination } from "../pagination";
import { LectureIndisponible } from "../lecture-indisponible";
import ui from "./utilisateurs.module.css";
import styles from "../repertoires.module.css";

export type ClientResume = { id: string; famille: FamilleClient; nom: string; detail: string; recherche: string; statut: string; ton: "vert" | "ambre" | "rouge" | "gris"; enAttente: boolean; href: string };
const FAMILLES = ["proprietaire", "artisan", "agence"] as const;
const ICONES = { proprietaire: Home, artisan: Wrench, agence: Building2 };
const PARAM_PAGES = { proprietaire: "pageProprietaires", artisan: "pageArtisans", agence: "pageAgences" };

export function Annuaire({ clients, famille, recherche, statut, totaux, lectures }: {
  clients: ClientResume[]; famille: string; recherche: string; statut: string;
  totaux: Record<FamilleClient | "attente", number | null>;
  lectures: Record<FamilleClient, { page: number; total: number | null; erreur: boolean }>;
}) {
  const adresse = (choix = famille, pageFamille?: FamilleClient, page = 1) => {
    const params = new URLSearchParams({vue:"espaces"});
    if (choix !== "tous") params.set("famille", choix);
    if (recherche) params.set("recherche", recherche);
    if (statut && choix === famille) params.set("statut", statut);
    if (pageFamille) for (const f of FAMILLES) {
      const n = f === pageFamille ? page : lectures[f].page;
      if (n > 1) params.set(PARAM_PAGES[f], String(n));
    }
    return `/admin/clients${params.size ? `?${params}` : ""}`;
  };
  const famillesVisibles = famille === "tous" ? FAMILLES : famille === "attente" ? ["artisan"] as const : [famille as FamilleClient];
  return <>
    <div className={`${styles.stats} ${ui.totaux}`} aria-label="Totaux de l’annuaire et filtres">
      {FAMILLES.map(f => { const Icone = ICONES[f]; return <Link key={f} href={adresse(famille === f ? "tous" : f)} className={`${styles.stat} ${ui.tuile}`} data-tone={f === "artisan" ? "ambre" : f === "proprietaire" ? "vert" : "bleu"} aria-current={famille === f ? "true" : undefined}><span className={styles.statIcon}><Icone size={20} aria-hidden="true" /></span><strong>{totaux[f] ?? "—"}</strong><span>{LIBELLES_FAMILLE[f]}</span>{totaux[f] === null && <small>Total indisponible</small>}</Link>; })}
      <Link href={adresse(famille === "attente" ? "tous" : "attente")} className={`${styles.stat} ${ui.tuile}`} data-tone="ambre" aria-current={famille === "attente" ? "true" : undefined}><span className={styles.statIcon}><ClipboardCheck size={20} aria-hidden="true" /></span><strong>{totaux.attente ?? "—"}</strong><span>Inscriptions à valider</span><small>Artisans</small></Link>
    </div>
    {(totaux.attente ?? 0) > 0 && <div className={styles.notice}><ClipboardCheck size={20} aria-hidden="true" /><p><strong>{totaux.attente} inscription{totaux.attente! > 1 ? "s" : ""} à examiner.</strong><span>Vérifiez le SIRET et les justificatifs avant de valider.</span></p><Link href="/admin/artisans">Examiner <ArrowUpRight size={16} aria-hidden="true" /></Link></div>}
    <section className={styles.directory} aria-labelledby="annuaire-titre">
      <div className={`${styles.directoryHeading} ${ui.titreListe}`}><div><h2 id="annuaire-titre">Espaces et entreprises</h2></div>{(famille !== "tous" || recherche || statut) && <Link href="/admin/clients?vue=espaces" className={styles.reset}>Effacer les filtres</Link>}</div>
      <form method="get" action="/admin/clients" className={styles.searchBar}><input type="hidden" name="vue" value="espaces"/>
        <input type="hidden" name="famille" value={famille} />
        <label className={styles.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Rechercher dans l’annuaire</span><input type="search" name="recherche" defaultValue={recherche} maxLength={160} placeholder="Nom, ville, e-mail ou SIRET…" /></label>
        <label className={styles.select}><span className="sr-only">Statut</span><select name="statut" defaultValue={statut}><option value="">Tous les statuts</option><optgroup label="Organisations">{Object.entries(LIBELLES_STATUT_ORGANISATION).map(([s,l]) => <option key={s} value={`org:${s}`}>{l}</option>)}</optgroup><optgroup label="Artisans">{Object.entries(LIBELLES_STATUT_ARTISAN).map(([s,l]) => <option key={s} value={`artisan:${s}`}>{l}</option>)}</optgroup></select></label>
        <button className="btn-or" type="submit">Rechercher</button>
      </form>
      {famillesVisibles.map(f => {
        const liste = clients.filter(c => c.famille === f), lecture = lectures[f], Icone = ICONES[f];
        return <section key={f} className={styles.family} aria-label={LIBELLES_FAMILLE[f]}><h3><Icone size={16} aria-hidden="true" />{LIBELLES_FAMILLE[f]}<span>{lecture.erreur ? "Indisponible" : `${liste.length} sur ${lecture.total ?? "—"}`}</span></h3>
          {lecture.erreur ? <LectureIndisponible sujet={LIBELLES_FAMILLE[f]} retour={adresse(famille, f, lecture.page)} /> : <>
            {liste.length === 0 ? <div className={styles.familyEmpty}><Users size={17} aria-hidden="true" /><span>{recherche || statut ? "Aucune fiche ne correspond à ces filtres." : "Aucune fiche dans cette catégorie."}</span></div> : liste.map(c => <Link key={c.id} href={c.href} className={styles.clientRow} data-attente={c.enAttente}><span className={styles.avatar} data-family={f} aria-hidden="true">{initiales(c.nom)}</span><span className={styles.clientIdentity}><strong>{c.nom}</strong><small>{c.detail}</small></span><span className={styles.badge} data-tone={c.ton}>{c.statut}</span><ArrowUpRight className={styles.rowArrow} size={17} aria-hidden="true" /></Link>)}
            {lecture.total !== null && <Pagination page={lecture.page} total={lecture.total} adresse={n => adresse(famille, f, n)} libelle={LIBELLES_FAMILLE[f]} />}
          </>}
        </section>;
      })}
    </section>
  </>;
}
