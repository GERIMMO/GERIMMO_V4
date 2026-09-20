import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { actionSansDonnees, ecranSansDonnees, ETATS_RETOUR, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { FormulaireRetour, SoutenirIdee } from "./formulaire-retour";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
export const metadata={title:"Aide et retours — Gerimmo"};
export default async function PageAssistance({searchParams}:{searchParams:Promise<{ecran?:string;action?:string;type?:string;sel?:string;vue?:string;page?:string}>}){
 const params=await searchParams;const c=await createClient();const{data:{user}}=await c.auth.getUser();if(!user)redirect('/connexion?suite=%2Fassistance');
 const page=pageRetour(params.page);
 const vue=params.vue==='idees'?'idees':params.vue==='agence'?'agence':'suivi';
 const [adhesions,fiche]=await Promise.all([c.from('memberships').select('organization_id,role,organizations(name)').eq('account_id',user.id).eq('status','active'),c.from('artisans').select('id').eq('account_id',user.id).maybeSingle()]);
 const organisations=(adhesions.data??[]).filter(m=>m.organization_id).map(m=>({id:m.organization_id as string,nom:(m.organizations as unknown as {name:string}|null)?.name??'Mon organisation'}));
 const orgAdmin=(adhesions.data??[]).filter(m=>m.role==='admin_agence').map(m=>m.organization_id as string);
 let requete=c.from('retours_utilisateurs').select('*',{count:'exact'}).order('cree_le',{ascending:false}).range((page-1)*20,page*20-1);
 if(vue==='idees')requete=requete.eq('nature','idee');else if(vue==='agence')requete=requete.in('organization_id',orgAdmin.length?orgAdmin:['00000000-0000-0000-0000-000000000000']);else requete=requete.eq('auteur_id',user.id);
 const{data,error,count}=await requete;const retours=(data??[]) as RetourUtilisateur[];
 const ids=retours.map(r=>r.id);const traces=ids.length?await c.from('retours_historique').select('id,retour_id,evenement,message,cree_le').in('retour_id',ids).order('cree_le',{ascending:true}):{data:[],error:null};
 return <div className="min-h-screen bg-[var(--creme)] text-[var(--encre)]">
  <header className="bandeau-appli"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4"><MarqueGerimmo/><Link href="/espaces" className="lien-bandeau">Mes espaces</Link></div></header>
  <main className="mx-auto max-w-5xl p-4 sm:p-7 space-y-6"><div className="repere-visuel repere-visuel-legal" aria-hidden="true"/><div><h1 className="font-heading text-3xl">Aide et retours</h1><p className="mt-2 text-sm text-muted-foreground">Signalez un problème, suivez une demande ou proposez une amélioration.</p></div>
   <nav aria-label="Suivi des demandes" className="flex flex-wrap gap-4 text-sm"><Link href="/assistance#mes-demandes" aria-current={vue==='suivi'?'page':undefined}>Mes demandes</Link><Link href="/assistance?vue=idees#mes-demandes" aria-current={vue==='idees'?'page':undefined}>Idées de mes espaces</Link>{orgAdmin.length>0&&<Link href="/assistance?vue=agence#mes-demandes" aria-current={vue==='agence'?'page':undefined}>Suivi de mon agence</Link>}</nav>
   {vue==='suivi'&&<section id="nouvelle" className="rounded-2xl border border-[var(--filet)] bg-white p-5 sm:p-6"><h2 className="mb-4 font-heading text-xl">Nouvelle demande</h2><FormulaireRetour cle={randomUUID()} ecran={ecranSansDonnees(params.ecran??'/espaces')} action={actionSansDonnees(params.action??'')} organisations={organisations} contestation={Boolean(fiche.data)&&params.type==='contestation'}/></section>}
   <section id="mes-demandes" className="space-y-3"><h2 className="font-heading text-xl">{vue==='idees'?'Idées à soutenir':vue==='agence'?'Demandes de mon agence':'Mes demandes et leurs réponses'}</h2>
    {(error||traces.error||adhesions.error)&&<p role="alert" className="rounded-lg border border-destructive p-3 text-sm">Le suivi n’a pas pu être chargé complètement. Rechargez avant de conclure qu’une demande est absente.</p>}
    {!error&&retours.length===0&&<p className="text-sm text-muted-foreground">Aucune demande à afficher dans cette vue.</p>}
    {retours.map(r=><article id={`demande-${r.id}`} key={r.id} className={`rounded-xl border bg-white p-5 ${params.sel===r.id?'border-[var(--or)]':'border-[var(--filet)]'}`}>
     <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{r.titre}</h3><span className="puce puce-prep">{ETATS_RETOUR[r.etat]}</span></div>
     <p className="mt-2 text-xs text-muted-foreground">{new Date(r.cree_le).toLocaleDateString('fr-FR')} · Référence {r.id.slice(0,8).toUpperCase()}</p><p className="mt-3 whitespace-pre-wrap text-sm">{r.description}</p>
     {r.reexaminer_le&&<p className="mt-3 text-sm">Réexamen prévu le {new Date(r.reexaminer_le+'T12:00:00').toLocaleDateString('fr-FR')}.</p>}
     <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">Historique et réponses</summary><ol className="mt-3 space-y-3">{(traces.data??[]).filter(t=>t.retour_id===r.id).map(t=><li key={t.id} className="border-l-2 border-[var(--filet)] pl-3"><time className="text-xs text-muted-foreground">{new Date(t.cree_le).toLocaleString('fr-FR')}</time><p className="whitespace-pre-wrap">{t.message}</p></li>)}</ol></details>
     {r.nature==='idee'&&<SoutenirIdee id={r.id}/>}
    </article>)}
    <nav aria-label="Pages des demandes" className="flex justify-between gap-3 text-sm">{page>1?<Link className="underline" href={`/assistance?vue=${vue}&page=${page-1}#mes-demandes`}>Précédente</Link>:<span/>}<span>Page {page}</span>{page*20<(count??0)&&<Link className="underline" href={`/assistance?vue=${vue}&page=${page+1}#mes-demandes`}>Suivante</Link>}</nav>
   </section>
  </main>
 </div>;
}
