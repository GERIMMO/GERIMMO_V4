import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { destinationSure } from "@/lib/destination-sure";
import { actionSansDonnees, ecranSansDonnees, ETATS_RETOUR, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { FormulaireRetour, SoutenirIdee } from "./formulaire-retour";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
export const metadata={title:"Aide et retours — Gerimmo"};
// Couleur de la puce selon l'état (24/09) : toujours orange jusqu'ici, même
// « Résolu ». Comme ailleurs : vert = terminé, gris = écarté, orange = en attente.
const PUCE_ETAT:Record<string,string>={resolu:'puce-loue',retenue:'puce-loue',deja_couverte:'puce-loue',non_retenue:'puce-grise'};
export default async function PageAssistance({searchParams}:{searchParams:Promise<{ecran?:string;action?:string;type?:string;sel?:string;vue?:string;page?:string;retour?:string}>}){
 const params=await searchParams;const c=await createClient();const{data:{user}}=await c.auth.getUser();if(!user)redirect('/connexion?suite=%2Fassistance');
 const page=pageRetour(params.page);
 const vue=params.vue==='idees'?'idees':params.vue==='agence'?'agence':'suivi';
 // Retour à la page d'où l'aide a été ouverte (24/09). Le bouton transmet le
 // chemin réel ; il n'est jamais stocké (seul `ecran`, anonymisé, part avec la
 // demande) et ne sert qu'aux liens de cette page. destinationSure n'accepte
 // qu'un chemin interne ; /assistance elle-même est écartée.
 const retourSur=destinationSure(params.retour,'');const retour=/^\/assistance(\/|$|[?#])/.test(retourSur)?'':retourSur;
 // Le contexte d'arrivée suit les changements de vue et de page : sinon le
 // lien de retour et l'écran joint à la demande se perdaient au premier clic.
 const contexte=new URLSearchParams();if(params.ecran)contexte.set('ecran',ecranSansDonnees(params.ecran));if(params.action)contexte.set('action',actionSansDonnees(params.action));if(retour)contexte.set('retour',retour);
 const lien=(extra:Record<string,string>,ancre:string)=>{const q=new URLSearchParams(extra);contexte.forEach((v,k)=>q.set(k,v));const s=q.toString();return `/assistance${s?`?${s}`:''}${ancre}`;};
 const onglet=(v:string)=>`filtre inline-flex items-center justify-center${vue===v?' actif':''}`;
 const [adhesions,fiche]=await Promise.all([c.from('memberships').select('organization_id,role,organizations(name)').eq('account_id',user.id).eq('status','active'),c.from('artisans').select('id').eq('account_id',user.id).maybeSingle()]);
 const organisations=(adhesions.data??[]).filter(m=>m.organization_id).map(m=>({id:m.organization_id as string,nom:(m.organizations as unknown as {name:string}|null)?.name??'Mon organisation'}));
 const orgAdmin=(adhesions.data??[]).filter(m=>m.role==='admin_agence').map(m=>m.organization_id as string);
 let requete=c.from('retours_utilisateurs').select('*',{count:'exact'}).order('cree_le',{ascending:false}).range((page-1)*20,page*20-1);
 if(vue==='idees')requete=requete.eq('nature','idee');else if(vue==='agence')requete=requete.in('organization_id',orgAdmin.length?orgAdmin:['00000000-0000-0000-0000-000000000000']);else requete=requete.eq('auteur_id',user.id);
 const{data,error,count}=await requete;const retours=(data??[]) as RetourUtilisateur[];
 const ids=retours.map(r=>r.id);const traces=ids.length?await c.from('retours_historique').select('id,retour_id,evenement,message,cree_le').in('retour_id',ids).order('cree_le',{ascending:true}):{data:[],error:null};
 return <div className="min-h-screen bg-[var(--creme)] text-[var(--encre)]">
  <header className="bandeau-appli"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4"><MarqueGerimmo/><div className="flex items-center gap-1">
   {retour&&<Link href={retour} className="lien-bandeau" aria-label="Retour à la page précédente"><span aria-hidden>←</span><span>Retour<span className="hidden sm:inline"> à la page précédente</span></span></Link>}
   <Link href="/espaces" className="lien-bandeau">Mes espaces</Link></div></div></header>
  <main className="mx-auto max-w-5xl p-4 sm:p-7 space-y-6"><div><h1 className="font-heading text-3xl">Aide et retours</h1><p className="mt-2 text-sm text-muted-foreground">Signalez un problème, suivez une demande ou proposez une amélioration.</p></div>
   {/* Des pastilles de filtre plutôt que des liens nus (24/09) : la vue
       courante se voit, et la cible monte à 44 px au doigt (a.filtre). */}
   <nav aria-label="Suivi des demandes" className="flex flex-wrap gap-2"><Link className={onglet('suivi')} href={lien({},'#mes-demandes')} aria-current={vue==='suivi'?'page':undefined}>Mes demandes</Link><Link className={onglet('idees')} href={lien({vue:'idees'},'#mes-demandes')} aria-current={vue==='idees'?'page':undefined}>Idées de mes espaces</Link>{orgAdmin.length>0&&<Link className={onglet('agence')} href={lien({vue:'agence'},'#mes-demandes')} aria-current={vue==='agence'?'page':undefined}>Suivi de mon agence</Link>}</nav>
   {vue==='suivi'&&<section id="nouvelle" className="rounded-2xl border border-[var(--filet)] bg-white p-5 sm:p-6"><h2 className="mb-4 font-heading text-xl">Nouvelle demande</h2><FormulaireRetour cle={randomUUID()} ecran={ecranSansDonnees(params.ecran??'/espaces')} action={actionSansDonnees(params.action??'')} organisations={organisations} contestation={Boolean(fiche.data)&&params.type==='contestation'} idee={params.type==='idee'} retour={retour} contexte={contexte.toString()}/></section>}
   <section id="mes-demandes" className="space-y-3"><h2 className="font-heading text-xl">{vue==='idees'?'Idées à soutenir':vue==='agence'?'Demandes de mon agence':'Mes demandes et leurs réponses'}</h2>
    {(error||traces.error||adhesions.error)&&<p role="alert" className="rounded-lg border border-destructive p-3 text-sm">Le suivi n’a pas pu être chargé complètement. Rechargez avant de conclure qu’une demande est absente.</p>}
    {/* Un message par vue, avec le geste qui manque (24/09) : le formulaire
        n'existe que dans « Mes demandes ». */}
    {!error&&retours.length===0&&<p className="text-sm text-muted-foreground">{page>1?'Aucune demande sur cette page.':vue==='idees'?<>Aucune idée proposée dans vos espaces pour l’instant. <Link className="font-medium text-[var(--encre)] underline" href={lien({type:'idee'},'#nouvelle')}>Proposer une idée</Link></>:vue==='agence'?'Aucune demande concernant votre agence pour l’instant.':'Vous n’avez encore envoyé aucune demande : le formulaire ci-dessus sert à en ouvrir une.'}</p>}
    {retours.map(r=>{
     // La dernière étape du suivi — le plus souvent la réponse de la
     // supervision, ce qu'on vient lire — s'affiche sans clic (24/09) ; seules
     // les étapes antérieures restent repliées, dépliées si l'on arrive par
     // « Consulter ma demande ».
     const etapes=(traces.data??[]).filter(t=>t.retour_id===r.id);const derniere=etapes.at(-1);const anterieures=etapes.slice(0,-1);
     return <article id={`demande-${r.id}`} key={r.id} className={`rounded-xl border bg-white p-5 ${params.sel===r.id?'border-[var(--or)]':'border-[var(--filet)]'}`}>
     <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{r.titre}</h3><span className={`puce ${PUCE_ETAT[r.etat]??'puce-prep'}`}>{ETATS_RETOUR[r.etat]}</span></div>
     <p className="mt-2 text-xs text-muted-foreground">{new Date(r.cree_le).toLocaleDateString('fr-FR')} · Référence {r.id.slice(0,8).toUpperCase()}</p><p className="mt-3 whitespace-pre-wrap text-sm">{r.description}</p>
     {r.reexaminer_le&&<p className="mt-3 text-sm">Réexamen prévu le {new Date(r.reexaminer_le+'T12:00:00').toLocaleDateString('fr-FR')}.</p>}
     {derniere&&<div className="mt-4 rounded-lg bg-[var(--creme)] p-3 text-sm"><p className="text-xs text-muted-foreground">{derniere.evenement==='creation'?'Suivi':'Réponse de la supervision'} · <time dateTime={derniere.cree_le}>{new Date(derniere.cree_le).toLocaleString('fr-FR')}</time></p><p className="mt-1 whitespace-pre-wrap">{derniere.message}</p></div>}
     {anterieures.length>0&&<details open={params.sel===r.id} className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Étapes précédentes ({anterieures.length})</summary><ol className="mt-3 space-y-3">{anterieures.map(t=><li key={t.id} className="border-l-2 border-[var(--filet)] pl-3"><time className="text-xs text-muted-foreground">{new Date(t.cree_le).toLocaleString('fr-FR')}</time><p className="whitespace-pre-wrap">{t.message}</p></li>)}</ol></details>}
     {r.nature==='idee'&&<SoutenirIdee id={r.id}/>}
    </article>;})}
    {/* La pagination ne s'affiche que s'il y a plus d'une page (24/09). */}
    {((count??0)>20||page>1)&&<nav aria-label="Pages des demandes" className="flex justify-between gap-3 text-sm">{page>1?<Link className="underline" href={lien({vue,page:String(page-1)},'#mes-demandes')}>Précédente</Link>:<span/>}<span>Page {page}</span>{page*20<(count??0)?<Link className="underline" href={lien({vue,page:String(page+1)},'#mes-demandes')}>Suivante</Link>:<span/>}</nav>}
   </section>
  </main>
 </div>;
}
