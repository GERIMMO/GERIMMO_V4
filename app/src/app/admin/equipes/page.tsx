import { TitreEcran } from "@/components/titre-ecran";
import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {EQUIPES,MISSIONS,type Mission} from '@/lib/missions';
import {bilanLisible,chargerEtatTaches,type EtatTache,type PassageDeMission} from '@/lib/sante-service';
import {formaterDateHeureParis,NOTE_FUSEAU} from '@/lib/heure-paris';
import {AtelierQualite} from './qualite';
import {Commandes} from './commandes';
// Le nom de l'entrée de menu (audit 25/09, C8).
export const metadata={title:'Travail des équipes — Gerimmo'};
const noms:Record<string,string>={reussi:'Passage terminé',a_reprendre:'À vérifier',interrompu:'Passage interrompu',en_cours:'En cours'};
// Audit console 27/09 : l'état de chaque carte vient de LA lecture partagée
// avec Santé (`chargerEtatTaches` : mêmes passages, même seuil de 26 heures,
// même bilan). « En retard » ici veut dire « en retard » là-bas.
const ETIQUETTES:Record<EtatTache,[string,string]>={ok:['À l’heure','puce-loue'],echec:['Passage à vérifier','puce-rouge'],retard:['En retard (plus de 26 heures)','puce-rouge'],jamais:['Premier passage attendu','puce-prep'],non_configuree:['Service non relié','puce-prep'],pause:['En pause','puce-grise']};
// 25/09 (audit C3) : chaque carte montre son dernier passage OUVERT — date à
// l'heure de Paris, état, bilan en clair — et les trois précédents dessous,
// sans accordéon. Le plan d'absence a UNE page : « Relais en mon absence ».
export default async function Page(){
 const db=await createClient();const [regles,historique,taches]=await Promise.all([db.from('agent_missions').select('cle,active'),db.from('agent_passages').select('id,mission,debut,fin,expiration,etat,resume,compte,bilan').order('debut',{ascending:false}).limit(200),chargerEtatTaches(db)]);
 const disponible=!regles.error&&!historique.error&&taches!==null;
 // « Lancer maintenant » n'est proposé que si la connexion des traitements est
 // posée, comme sur Santé (audit console 27/09).
 const lancement=Boolean(process.env.CRON_SECRET?.trim());
 return <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 p-4 sm:p-7"><div className="entete-page"><div className="min-w-0 flex-[1_1_20rem]"><TitreEcran rubrique="personnes">Travail des équipes</TitreEcran><p className="mesure-lecture mt-2 text-sm text-muted-foreground">Ce que Gerimmo fait seul chaque jour : les quittances, les relances, la veille, les publications. Pour chaque tâche, son dernier passage et son résultat ; « Lancer maintenant » la refait tout de suite, « Mettre en pause » l’arrête jusqu’à nouvel ordre. Les réglages de chaque agence, les validations et les plafonds restent applicables.</p></div></div>
 {!disponible&&<p role="alert" className="err">Le suivi est indisponible. Aucun état « à jour » ne peut être confirmé.</p>}
 {!lancement&&<p className="text-sm text-muted-foreground">« Lancer maintenant » sera possible une fois la connexion sécurisée des tâches programmées configurée : voir <Link href="/admin/sante" className="lien-discret">Santé et connexions</Link>.</p>}
 {/* La carte commune de la console (nuit du 25/09), avec plus d'air entre les cartes. */}
 <div className="grid gap-6 lg:grid-cols-2">{Object.entries(MISSIONS).map(([cle,m])=>{const regle=regles.data?.find(r=>r.cle===cle);const passages=(historique.data?.filter(p=>p.mission===cle)??[]) as (PassageDeMission&{id:string})[];const dernier=passages[0];const tache=taches?.find(t=>t.nom===cle);const [etat,puce]=!disponible||!regle||!tache?['État indisponible','puce-grise']:ETIQUETTES[tache.etat];return <section key={cle} className="loc-carte border-t-4 border-t-[var(--marque)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="libelle-champ">Équipe {EQUIPES[m.equipe].nom}</p><h2 className="mt-1 text-xl font-semibold">{m.nom}</h2></div><span className={`puce ${puce}`}>{etat}</span></div>
  <dl className="mt-4 space-y-1.5 text-sm"><div><dt className="inline font-semibold">Dernier passage : </dt><dd className="inline text-muted-foreground">{dernier?<><time dateTime={dernier.debut}>{formaterDateHeureParis(dernier.debut)}</time>{dernier.fin?` → ${formaterDateHeureParis(dernier.fin)}`:''} · {noms[dernier.etat]??dernier.etat}</>:'aucun depuis la mise en place de ce suivi'}</dd></div>{dernier&&<div><dt className="inline font-semibold">Bilan : </dt><dd className="inline text-muted-foreground">{bilanLisible(dernier)}</dd></div>}<div><dt className="inline font-semibold">Prochain passage : </dt><dd className="inline text-muted-foreground">{regle&&!regle.active?'en pause':`vers ${m.heure}`}</dd></div></dl>
  {disponible&&regle&&<Commandes mission={cle as Mission} active={regle.active} lancement={lancement}/>}<Link className="lien-discret mt-4 inline-block text-sm" href={m.lien}>Ouvrir les dossiers concernés →</Link>
  {passages.length>1&&<div className="mt-5 border-t border-[var(--filet)] pt-4"><p className="libelle-champ">Passages précédents</p><ol className="mt-3 space-y-2">{passages.slice(1,4).map(p=><li key={p.id} className="rounded-xl bg-[var(--filet-leger)] p-3.5 text-sm"><b>{formaterDateHeureParis(p.debut)}</b><p>{noms[p.etat]} · {bilanLisible(p)}</p></li>)}</ol></div>}</section>})}</div>
 <p className="text-sm text-muted-foreground">{NOTE_FUSEAU}</p>
 <AtelierQualite preparation={Boolean(process.env.GITHUB_AGENT_TOKEN)} demonstration={Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID)} active={process.env.GERIMMO_CODEX_ENABLED==='true'}/>
 <p className="text-sm text-muted-foreground">L’équipe qualité suit les propositions et leurs contrôles dans <Link href="/admin/autonomie#ameliorations" className="underline">Développement du site</Link>. Une proposition n’est pas une correction déjà publiée.</p></main>;
}
