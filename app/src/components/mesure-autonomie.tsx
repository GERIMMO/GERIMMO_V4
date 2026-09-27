import { createClient } from '@/lib/supabase/server';
type Ligne={automatiques:number;humaines:number};
type Mesures=Ligne&{messages:number;sans_appel:number;avec_appel:number;clics_minimum:number;organisations:(Ligne&{organization_id:string|null;nom:string|null;messages:number})[];domaines:(Ligne&{domaine:string})[]};
const domaines:Record<string,string>={location:'Locations et états des lieux',incident:'Incidents et artisans',finance:'Finances',document:'Documents et signatures',message:'Messages',marketing:'Marketing',territoire:'Développement territorial',qualite:'Qualité'};
function pourcent(m:Ligne){const total=Number(m.automatiques)+Number(m.humaines);return total?Math.round(100*Number(m.automatiques)/total):null;}
function taux(m:Ligne){const p=pourcent(m);return p===null?'En attente':`${p} %`;}
// Chaque tuile dit ce qu'elle compte sous son chiffre (24/09) : « Dossiers
// confirmés sans appel » et « Clics d'envoi évités au minimum » se lisaient
// sans savoir qui confirmait ni quels clics. Les aides reprennent, en une
// ligne, la note « Comprendre ces chiffres » — rien d'autre n'est affirmé.
type Compteur=Exclude<keyof Mesures,'organisations'|'domaines'>;
const tuiles:[string,Compteur,string][]=[
 ['Actions automatiques','automatiques','Résultats enregistrés par Gerimmo'],
 ['Actions humaines','humaines','Résultats enregistrés par une personne'],
 ['Messages déposés ou transmis','messages','Acceptés par le service, lecture non prouvée'],
 ['Confirmés sans appel téléphonique','sans_appel','Dossiers dont le gestionnaire a confirmé le bilan'],
 ['Confirmés après un appel','avec_appel','Dossiers où un appel a été nécessaire'],
 ['Clics d’envoi de quittances évités','clics_minimum','Au minimum un clic par organisation et mois terminé'],
];
export async function MesureAutonomie({orgId,detail=false,titre='Ce que Gerimmo fait pour vous'}:{orgId?:string;detail?:boolean;titre?:string}) {
 const db=await createClient();const {data,error}=await db.rpc('mesures_automatisation',{p_org:orgId??null});const m=error?null:data as Mesures|null;
 return <section className="section-ecran space-y-4">
  {/* Le titre est une prop (24/09) : « Ce que Gerimmo fait pour vous » parle
      à un client dans son espace ; la supervision, qui voit toutes les
      organisations, dit ce qu'elle regarde. */}
  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">30 derniers jours · objectif : 90 %</p><h2 className="text-xl font-semibold text-[var(--encre)]">{titre}</h2></div><span className="puce puce-prep">{m&&Number(m.automatiques)+Number(m.humaines)>0?`${taux(m)} des actions suivies`:'Mesure en démarrage'}</span></div>
  {!m&&<p role="alert" className="err">Les mesures sont momentanément indisponibles. Les chiffres manquants ne sont pas des zéros.</p>}
  {/* Deux tuiles par rang dès le téléphone (24/09) : six tuiles empilées
      occupaient deux écrans avant la première explication. */}
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{tuiles.map(([nom,cle,aide])=><div key={nom} className="kpi bleu"><span className="libelle-champ">{nom}</span><strong className="chiffre block">{m?m[cle]:'—'}</strong><span className="mono-discret sans-majuscules mt-1 block">{aide}</span></div>)}</div>
  {/* La grille par activité s'affiche ouverte (24/09) : repliée derrière
      « Résultats par activité », elle n'était jamais dépliée alors qu'elle
      porte le seul détail lisible du taux. Seule la note reste repliée. */}
  {m&&<div className="loc-carte"><h3 className="mb-3 font-semibold">Par activité</h3><div className="grid gap-3 sm:grid-cols-2">{m.domaines.map(d=><div key={d.domaine} className="rounded-lg bg-muted/40 p-3"><b className="text-sm">{domaines[d.domaine]??'Autres actions suivies'}</b><p className="mt-1 text-sm">{d.automatiques} automatiques · {d.humaines} humaines · {taux(d)}</p></div>)}{m.domaines.length===0&&<p className="text-sm">Aucune action mesurée pendant cette période.</p>}</div></div>}
  {/* Par organisation, dans une carte titrée (24/09) : le tableau flottait
      sous la note sans nom. Sous 640 px, une liste remplace le tableau à
      cinq colonnes, qui obligeait à défiler latéralement pour lire le taux ;
      la région défilante disparaît avec lui pour ne pas laisser un
      conteneur focalisable vide. */}
  {detail&&m&&<div className="loc-carte"><h3 className="mb-3 font-semibold">Par organisation</h3>
   <ul className="sm:hidden divide-y divide-border">{m.organisations.map(o=><li key={o.organization_id??'plateforme'} className="py-2 first:pt-0 last:pb-0"><b className="text-sm">{o.nom??'Plateforme Gerimmo'}</b><p className="mt-0.5 text-sm text-muted-foreground">{o.automatiques} automatiques · {o.humaines} humaines · {pourcent(o)===null?'taux en attente':`${pourcent(o)} % suivi`}</p></li>)}</ul>
   <div className="hidden overflow-x-auto sm:block" tabIndex={0} role="region" aria-label="Automatisation par organisation"><table className="tableau hidden w-full text-sm sm:table"><thead><tr><th className="text-left">Organisation</th><th>Automatiques</th><th>Humaines</th><th>Messages</th><th>Taux suivi</th></tr></thead><tbody>{m.organisations.map(o=><tr key={o.organization_id??'plateforme'}><td>{o.nom??'Plateforme Gerimmo'}</td><td className="text-center">{o.automatiques}</td><td className="text-center">{o.humaines}</td><td className="text-center">{o.messages}</td><td className="text-center">{taux(o)}</td></tr>)}</tbody></table></div>
   {m.organisations.length===0&&<p className="text-sm text-muted-foreground">Aucune action mesurée pendant cette période.</p>}</div>}
  <details className="loc-carte"><summary className="cursor-pointer font-semibold">Comprendre ces chiffres</summary><div className="mt-3 space-y-2 text-sm text-muted-foreground"><p>Le taux compare les résultats enregistrés automatiquement aux résultats enregistrés par une personne. Il mesure des actions, pas du temps de travail. Un lot de documents peut produire plusieurs résultats.</p><p>Les clics comparent les quittances automatiques au bouton d’envoi groupé du mois : un seul clic minimum par organisation et mois terminé, uniquement si toutes les quittances ont une trace d’envoi automatique dans les 30 derniers jours. Les mois avec un envoi manuel, un document non envoyé ou une trace manquante sont exclus. Navigation et saisie ne sont pas comptées.</p><p>Le bilan avec ou sans appel est une confirmation du gestionnaire enregistrée pendant cette période. Les dossiers sans confirmation ne sont classés dans aucune des deux catégories. Un message accepté par le service n’est pas une preuve de lecture.</p><p>La mesure couvre les étapes des baux et incidents, les encaissements, les quittances et avis transmis, les rappels, les documents classés, retours signés, devis et avenants, comptes rendus d’intervention, états des lieux signés et messages du site. Elle ne couvre pas encore les appels téléphoniques eux-mêmes, le travail hors plateforme, ni tous les gestes administratifs. Le taux de 90 % sur toute la gestion n’est donc pas encore démontré.</p></div></details>
 </section>;
}
