import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { MODELES } from "@/lib/documents/modeles";
import { chargerCiblesCatalogue } from "@/lib/documents/catalogue-cibles";
import { lireLignes, texte } from "@/lib/documents/modeles/catalogue-bail";
import { FormulaireCatalogue } from "./formulaire-catalogue";
import { buttonVariants } from "@/components/ui/button";
// Même nom que le H1 et que le lien qui y mène depuis Documents (24/09).
export const metadata={title:"Préparer un document — Gerimmo"};
export default async function PageCatalogue({params,searchParams}:{params:Promise<{orgId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {orgId}=await params, brut=await searchParams;
  const {supabase,organisation,role}=await verifierAccesEspace(orgId);
  const valeur=(k:string)=>typeof brut[k]==="string"?brut[k] as string:"";
  const recherche=valeur("q").trim(),bail=valeur("bail");
  const page=Math.min(10000,Math.max(0,Number.parseInt(valeur("page"),10)||0));
  const disponibles=CATALOGUE_DOCUMENTS.filter(m=>(organisation.type==="agence"||m.famille!=="Mandats et agence") && (role!=="agent"||!["cloture_mensuelle","recap_fiscal_agence","rapport_gestion","bordereau_versement","facture_honoraires"].includes(m.code)));
  const choisi=disponibles.find(m=>m.id===valeur("modele"));
  const normaliser=(s:string)=>s.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const filtres=disponibles.filter(m=>!recherche||normaliser(`${m.nom} ${m.description}`).includes(normaliser(recherche)));
  const familles=[...new Set(disponibles.map(m=>m.famille))].filter(f=>filtres.some(m=>m.famille===f));
  // « Entrée et contrat » → « entree-et-contrat » : l'ancre de sa section
  const ancre=(f:string)=>normaliser(f).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const enPreparation=filtres.filter(m=>!Object.hasOwn(MODELES,m.code)).length;
  const base=`/agence/${orgId}/documents/catalogue`;
  const lien=(mod:string,num=0)=>`${base}?${new URLSearchParams({modele:mod,...(bail?{bail}:{}),...(num?{page:String(num)}:{})})}`;
  let cibles:Awaited<ReturnType<typeof chargerCiblesCatalogue>>={choix:[],suite:false},erreur="";
  let garants:{id:string;libelle:string;bailId:string}[]=[];
  if(choisi&&Object.hasOwn(MODELES,choisi.code)) {
    try {
      cibles=await chargerCiblesCatalogue(supabase,orgId,choisi,page,bail||undefined);
      if(choisi.id==="cautionnement"&&cibles.choix.length) {
        const roles=await lireLignes(supabase.from("bail_personnes").select("person_id,bail_id").eq("organization_id",orgId).eq("role","garant").in("bail_id",cibles.choix.map(c=>c.id)));
        const ids=[...new Set(roles.map(r=>texte(r.person_id)))];
        const personnes=ids.length?await lireLignes(supabase.from("persons").select("id,nom,prenom").eq("organization_id",orgId).in("id",ids)):[];
        garants=roles.flatMap(r=>{const p=personnes.find(p=>p.id===r.person_id);return p?[{id:texte(p.id),libelle:[p.nom,p.prenom].filter(Boolean).join(" "),bailId:texte(r.bail_id)}]:[];});
      }
    } catch {erreur="Les dossiers n’ont pas pu être chargés. Actualisez la page pour réessayer.";}
  }
  return <main className="mx-auto w-full max-w-6xl flex-1 space-y-7 p-4 sm:p-7">
    {/* Sous-page : le retour « ← Parent » de l'espace (24/09), comme « ← Mon parc » */}
    <header className="entete-page"><div><Link href={`/agence/${orgId}/documents`} className="lien-discret text-[13px]">← Documents</Link><h1 className="mt-2">Préparer un document</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choisissez le document utile à votre situation. Gerimmo reprend les informations du dossier et conserve le PDF dans votre espace Documents.</p></div></header>
    {choisi?<><Link href={base} className="text-sm text-primary hover:underline">← Tous les modèles</Link><section className="rounded-2xl border bg-card p-5 sm:p-7"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{choisi.famille}</p><h2 className="mt-2 text-2xl font-semibold">{choisi.nom}</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">{choisi.description}</p>
      {!Object.hasOwn(MODELES,choisi.code)?<p role="status" className="rounded-lg border p-4 text-sm">Ce modèle est en préparation : Gerimmo ne présentera pas un document provisoire à la place de la pièce attendue.</p>:
      erreur?<p role="alert" className="text-destructive">{erreur}</p>:cibles.choix.length?<FormulaireCatalogue key={`${choisi.id}-${page}-${bail}`} orgId={orgId} modeleId={choisi.id} choix={cibles.choix} garants={garants}/>:<p className="rounded-lg bg-muted p-4 text-sm">Aucun dossier compatible sur cette page. Vérifiez les informations et l’avancement du dossier concerné.{bail&&<> <Link href={lien(choisi.id).replace(`&bail=${bail}`,"")} className="underline">Afficher tous les dossiers</Link></>}</p>}
      {(page>0||cibles.suite)&&<nav aria-label="Pages des dossiers" className="mt-5 flex items-center gap-4 text-sm">{page>0&&<Link href={lien(choisi.id,page-1)} className="underline">Dossiers précédents</Link>}<span>Page {page+1} · 50 dossiers au maximum</span>{cibles.suite&&<Link href={lien(choisi.id,page+1)} className="underline">Dossiers suivants</Link>}</nav>}
    </section></>:<>
      {/* Tour du 24/09. Les situations sont les titres de section de la page :
          une liste à valider puis recharger coûtait trois gestes pour
          descendre d'un écran. Ce sont désormais des ancres, sans aller-retour
          serveur. Le champ texte reste seul à filtrer ; « Filtrer » et non
          « Rechercher », réservé à la recherche globale de la barre haute.
          Champ et bouton à la même hauteur (h-10). */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <form className="flex flex-wrap items-end gap-3"><label className="min-w-56 flex-1 text-sm font-medium">Filtrer les modèles<input name="q" defaultValue={recherche} placeholder="Bail, charges, intervention…" className="mt-2 h-10 w-full rounded-lg border bg-background px-3"/></label><button type="submit" className={buttonVariants({variant:"secondary",className:"h-10"})}>Filtrer</button>{recherche&&<Link href={base} className="text-sm underline">Effacer le filtre</Link>}</form>
        {familles.length>1&&<nav aria-label="Aller à une situation"><p className="mb-2 text-sm font-medium">Aller à une situation</p><div className="flex flex-wrap gap-2">{familles.map(f=><a key={f} href={`#${ancre(f)}`} className="filtre">{f}</a>)}</div></nav>}
      </div>
      <p className="text-sm text-muted-foreground">{filtres.length} modèle{filtres.length>1?"s":""}{enPreparation>0?`, dont ${enPreparation} en préparation`:""}</p>
      {familles.map(f=><section key={f} id={ancre(f)} className="scroll-mt-[calc(var(--hauteur-haut)+1rem)]"><h2 className="mb-3 text-lg font-semibold">{f}</h2><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{filtres.filter(m=>m.famille===f).map(m=><Link key={m.id} href={lien(m.id)} className="group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-primary"><h3 className="font-semibold text-primary">{m.nom}</h3><p className="mb-4 mt-2 flex-1 text-sm text-muted-foreground">{m.description}</p><span className="text-xs font-medium">{Object.hasOwn(MODELES,m.code)?"Choisir un dossier →":"En préparation"}</span></Link>)}</div></section>)}
      {!filtres.length&&<p>Aucun modèle ne correspond à ce filtre.</p>}
    </>}
  </main>;
}
