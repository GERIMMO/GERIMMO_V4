import { NavigationUtilisateurs } from "./navigation";
import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {lirePage,numeroPage,rechercheIlike} from '@/lib/pagination-supervision';
import {Pagination} from '../pagination';
import {LectureIndisponible} from '../lecture-indisponible';
import {TitreEcran} from '@/components/titre-ecran';
import { Search } from "lucide-react";
import { ListePersonnes, type PersonneAnnuaire } from "./liste-personnes";
import ui from "./utilisateurs.module.css";
import styles from '../repertoires.module.css';
export const ROLES_UTILISATEURS:Record<string,string>={proprietaire:'Propriétaires',locataire:'Locataires',garant:'Garants',artisan:'Artisans',superviseur:'Superviseurs',superviseur_delegue:'Relais de supervision',admin_agence:'Administrateurs d’agence',agent:'Agents',sans_role:'Sans rôle attribué'};
export async function AnnuairePersonnes({p}:{p:Record<string,string|string[]|undefined>}){
 const role=typeof p.role==='string'&&p.role in ROLES_UTILISATEURS?p.role:'';
 const recherche=typeof p.q==='string'?p.q.trim().slice(0,160):'';
 const db=await createClient();
 const r=await lirePage((a,b)=>{let q=db.from('supervision_utilisateurs').select('*',{count:'exact'});if(role)q=q.contains('roles',[role]);if(recherche){const v=rechercheIlike(recherche);q=q.or(`nom.ilike.${v},email.ilike.${v},espaces.ilike.${v}`);}if(p.acces==='sans')q=q.is('account_id',null);if(p.acces==='compte')q=q.not('account_id','is',null);return q.order('nom').order('cle').range(a,b);},numeroPage(p.page));
 const url=(page:number)=>`/admin/clients?${new URLSearchParams({q:recherche,role,acces:String(p.acces??''),page:String(page)})}`;
 const total = r.error ? "Lecture indisponible" : `${r.count ?? 0} personne${r.count === 1 ? "" : "s"}${recherche || role || p.acces ? " trouvée" + (r.count === 1 ? "" : "s") : ""}`;
 return <main className={`${styles.page} ${ui.page}`}><header className={`${styles.header} ${ui.entete}`}><TitreEcran rubrique="personnes">Utilisateurs</TitreEcran><span className={ui.total}>{total}</span></header><NavigationUtilisateurs vue="personnes"/>
 <section className={styles.directory} aria-label="Annuaire des personnes"><form method="get" className={ui.filtres}>
 <label>Nom, e-mail ou espace<span className={ui.recherche}><Search size={18} aria-hidden="true"/><input name="q" type="search" defaultValue={recherche} placeholder="Rechercher une personne…" maxLength={160} className="champ"/></span></label>
 <label>Rôle<select name="role" defaultValue={role} className="champ"><option value="">Tous les rôles</option>{Object.entries(ROLES_UTILISATEURS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>Compte<select name="acces" defaultValue={String(p.acces??'')} className="champ"><option value="">Tous</option><option value="compte">Avec compte</option><option value="sans">Sans compte</option></select></label><button className="btn-or">Rechercher</button></form>
 {(recherche || role || p.acces) && r.count !== 0 && <Link href="/admin/clients" className={ui.reinitialiser}>Effacer les filtres</Link>}
 {r.error?<LectureIndisponible sujet="L’annuaire des personnes" retour={url(1)}/>:<ListePersonnes personnes={(r.data ?? []) as PersonneAnnuaire[]}/>}
 <footer className={ui.pied}><p>Les profils incluent les anciens rôles. Les accès actuels sont détaillés dans chaque fiche.</p>{!r.error&&<Pagination page={r.page} total={r.count??0} adresse={url} libelle="Utilisateurs"/>}</footer></section></main>;
}
