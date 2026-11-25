import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { MODELES } from "@/lib/documents/modeles";
import { chargerCiblesCatalogue, DOSSIERS_PAR_PAGE } from "@/lib/documents/catalogue-cibles";
import { lireLignes, texte } from "@/lib/documents/modeles/catalogue-bail";
import { FormulaireCatalogue } from "./formulaire-catalogue";
import { buttonVariants } from "@/components/ui/button";
import { baseEspace, racineEspace } from "@/lib/racine-espace";
// Même nom que le H1 et que le lien qui y mène depuis Documents (24/09).
export const metadata={title:"Préparer un document — Gerimmo"};
export default async function PageCatalogue({params,searchParams}:{params:Promise<{orgId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {orgId}=await params, brut=await searchParams;
  const {supabase,organisation,role,estProprietaire}=await verifierAccesEspace(orgId);
  // Décision D27 : les écrans du propriétaire direct vivent sous /espace/<id>, ceux des agences sous /agence/<id>.
  const baseOrg = baseEspace(orgId, estProprietaire);
  const valeur=(k:string)=>typeof brut[k]==="string"?brut[k] as string:"";
  const recherche=valeur("q").trim(),bail=valeur("bail");
  const page=Math.min(10000,Math.max(0,Number.parseInt(valeur("page"),10)||0));
  // Phase 3, lot 46 (T20) : une page part du rang où la précédente s'est arrêtée (la liste écarte après lecture les dossiers que
  // le modèle refuse, et lit plus loin pour en montrer 50). `de` garde le rang de départ de chaque page déjà parcourue après la
  // première, pour « Dossiers précédents » ; sans `de` valide (lien ancien), la page n repart du rang n × 50, comme avant.
  const departs=(()=>{const l=valeur("de").split(",").filter(Boolean).map(Number);return l.length===page&&l.every((n,i)=>Number.isSafeInteger(n)&&n>0&&(i===0||n>l[i-1]))?l:Array.from({length:page},(_,i)=>(i+1)*DOSSIERS_PAR_PAGE);})();
  const disponibles=CATALOGUE_DOCUMENTS.filter(m=>(organisation.type==="agence"||m.famille!=="Mandats et agence") && (role!=="agent"||!["cloture_mensuelle","recap_fiscal_agence","rapport_gestion","bordereau_versement","facture_honoraires"].includes(m.code)));
  const choisi=disponibles.find(m=>m.id===valeur("modele"));
  const normaliser=(s:string)=>s.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const situations=[...new Set(disponibles.map(m=>m.famille))];
  const situation=situations.find(f=>f===valeur("situation")) ?? "";
  const montrerModeles=Boolean(recherche || situation);
  const filtres=disponibles.filter(m=>!situation||m.famille===situation).filter(m=>!recherche||normaliser(`${m.nom} ${m.description}`).includes(normaliser(recherche)));
  const familles=[...new Set(disponibles.map(m=>m.famille))].filter(f=>filtres.some(m=>m.famille===f));
  // « Entrée et contrat » → « entree-et-contrat » : l'ancre de sa section
  const ancre=(f:string)=>normaliser(f).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const enPreparation=filtres.filter(m=>!Object.hasOwn(MODELES,m.code)).length;
  const base=`${baseOrg}/documents/catalogue`;
  const lien=(mod:string,num=0,de:number[]=[])=>`${base}?${new URLSearchParams({modele:mod,...(bail?{bail}:{}),...(situation?{situation}:{}),...(num?{page:String(num),de:de.join(",")}:{})})}`;
  let cibles:Awaited<ReturnType<typeof chargerCiblesCatalogue>>={choix:[],suite:false},erreur="";
  let garants:{id:string;libelle:string;bailId:string}[]=[];
  let titulaires:{id:string;libelle:string;bailId:string}[]=[];
  if(choisi&&Object.hasOwn(MODELES,choisi.code)) {
    try {
      cibles=await chargerCiblesCatalogue(supabase,orgId,choisi,page?departs[page-1]:0,bail||undefined);
      if(choisi.id==="cautionnement"&&cibles.choix.length) {
        const roles=await lireLignes(supabase.from("bail_personnes").select("person_id,bail_id").eq("organization_id",orgId).eq("role","garant").in("bail_id",cibles.choix.map(c=>c.id)));
        const ids=[...new Set(roles.map(r=>texte(r.person_id)))];
        const personnes=ids.length?await lireLignes(supabase.from("persons").select("id,nom,prenom").eq("organization_id",orgId).in("id",ids)):[];
        garants=roles.flatMap(r=>{const p=personnes.find(p=>p.id===r.person_id);return p?[{id:texte(p.id),libelle:[p.nom,p.prenom].filter(Boolean).join(" "),bailId:texte(r.bail_id)}]:[];});
      }
      // Phase 3 (C22) : le colocataire sortant se choisit parmi les titulaires du contrat commun (locataire principal et
      // colocataires), comme les titulaires que l'avenant lit lui-même.
      if(choisi.id==="avenant_remplacement"&&cibles.choix.length) {
        const ids=cibles.choix.map(c=>c.id);
        const [baux,roles]=await Promise.all([
          lireLignes(supabase.from("baux").select("id,locataire_principal").eq("organization_id",orgId).in("id",ids)),
          lireLignes(supabase.from("bail_personnes").select("person_id,bail_id").eq("organization_id",orgId).eq("role","colocataire").in("bail_id",ids)),
        ]);
        const liens=[...baux.filter(b=>b.locataire_principal).map(b=>({person_id:texte(b.locataire_principal),bail_id:texte(b.id)})),...roles.map(r=>({person_id:texte(r.person_id),bail_id:texte(r.bail_id)}))];
        const personnesIds=[...new Set(liens.map(l=>l.person_id))];
        const personnes=personnesIds.length?await lireLignes(supabase.from("persons").select("id,nom,prenom").eq("organization_id",orgId).in("id",personnesIds)):[];
        const vus=new Set<string>();
        titulaires=liens.flatMap(l=>{const p=personnes.find(p=>p.id===l.person_id);const cle=`${l.bail_id}|${l.person_id}`;if(!p||vus.has(cle))return [];vus.add(cle);return [{id:texte(p.id),libelle:[p.nom,p.prenom].filter(Boolean).join(" "),bailId:l.bail_id}];});
      }
    } catch {erreur="Les dossiers n’ont pas pu être chargés. Actualisez la page pour réessayer.";}
  }
  return <main className="mx-auto w-full max-w-6xl flex-1 space-y-7 p-4 sm:p-7">
    {/* Sous-page : le retour « ← Parent » AU-DESSUS de l'en-tête, comme la fiche
        du bien (25/09 — il était dans le bandeau, un troisième style de retour). */}
    <div><Link href={`${baseOrg}/documents`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">← Documents</Link>
    <header className="entete-page"><div><TitreEcran rubrique="documents">Préparer un document</TitreEcran><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choisissez une situation ou recherchez un document.</p></div></header></div>
    {choisi?<><Link href={`${base}?${new URLSearchParams({... (situation?{situation}:{}),...(bail?{bail}:{})})}`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">← Choisir un autre document</Link><section className="rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-card p-5 shadow-[var(--ombre-1)] sm:p-7"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{choisi.famille}</p><h2 className="mt-2">{choisi.nom}</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">{choisi.description}</p>
      {!Object.hasOwn(MODELES,choisi.code)?<p role="status" className="rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-[var(--filet-leger)] p-4 text-sm">Ce modèle est en préparation : Gerimmo ne présentera pas un document provisoire à la place de la pièce attendue.</p>:
      erreur?<p role="alert" className="err">{erreur}</p>:cibles.choix.length?<FormulaireCatalogue key={`${choisi.id}-${page}-${bail}`} orgId={orgId} modeleId={choisi.id} choix={cibles.choix} garants={garants} titulaires={titulaires} racine={racineEspace(estProprietaire)}/>:<p className="rounded-[var(--rayon-carte)] bg-[var(--filet-leger)] p-4 text-sm">Aucun dossier compatible sur cette page. Vérifiez les informations et l’avancement du dossier concerné.{bail&&<> <Link href={lien(choisi.id).replace(`&bail=${bail}`,"")} className="underline">Afficher tous les dossiers</Link></>}</p>}
      {(page>0||cibles.suite)&&<nav aria-label="Pages des dossiers" className="mt-5 flex items-center gap-4 text-sm">{page>0&&<Link href={lien(choisi.id,page-1,departs.slice(0,page-1))} className="underline">Dossiers précédents</Link>}<span>Page {page+1} · 50 dossiers au maximum</span>{cibles.suite&&<Link href={lien(choisi.id,page+1,[...departs,cibles.suivant??(page+1)*DOSSIERS_PAR_PAGE])} className="underline">Dossiers suivants</Link>}</nav>}
    </section></>:<>
      {/* Tour du 24/09. Les situations sont les titres de section de la page :
          une liste à valider puis recharger coûtait trois gestes pour
          descendre d'un écran. Ce sont désormais des ancres, sans aller-retour
          serveur. Le champ texte reste seul à filtrer ; « Filtrer » et non
          « Rechercher », réservé à la recherche globale de la barre haute.
          Champ et bouton à la même hauteur (h-10). */}
      <div className="space-y-4 rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-card p-4 shadow-[var(--ombre-1)]">
        <form data-saisie-libre className="flex flex-wrap items-end gap-3">{bail&&<input type="hidden" name="bail" value={bail}/>}<label className="min-w-56 flex-1 text-sm font-medium">Filtrer les modèles<input name="q" defaultValue={recherche} placeholder="Bail, charges, intervention…" className="mt-2 min-h-11 w-full rounded-[var(--rayon-champ)] border border-[var(--filet-champ)] bg-card px-3"/></label><button type="submit" className={buttonVariants({variant:"secondary",className:"min-h-11"})}>Filtrer</button>{recherche&&<Link href={base} className="inline-flex min-h-11 items-center text-sm underline">Effacer le filtre</Link>}</form>
        {montrerModeles&&familles.length>1&&<nav aria-label="Aller à une situation"><p className="mb-2 text-sm font-medium">Aller à une situation</p><div className="flex flex-wrap gap-2">{familles.map(f=><a key={f} href={`#${ancre(f)}`} className="filtre">{f}</a>)}</div></nav>}
      </div>
      {!montrerModeles && <section>
        <h2 className="mb-2 text-xl">De quoi avez-vous besoin ?</h2><p className="mb-5 text-sm text-muted-foreground">Choisissez une situation, puis le document et le dossier concerné.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{situations.map((f,i)=><Link key={f} href={`${base}?${new URLSearchParams({situation:f,...(bail?{bail}:{})})}`} className="carte-rubrique rounded-[var(--rayon-carte)] p-5 shadow-[var(--ombre-1)]" data-ton={["bleu","or","vert"][i%3]}>
          <span className="eyebrow">{String(i+1).padStart(2,"0")}</span><h3 className="my-2 text-lg">{f}</h3><p className="text-sm text-muted-foreground">{disponibles.filter(m=>m.famille===f).length} documents</p><span className="mt-3 inline-block text-sm font-semibold">Choisir →</span>
        </Link>)}</div>
      </section>}
      {montrerModeles && <Link href={`${base}${bail?`?bail=${encodeURIComponent(bail)}`:""}`} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline">← Changer de situation</Link>}
      {montrerModeles && <>
      <p className="text-sm text-muted-foreground">{filtres.length} modèle{filtres.length>1?"s":""}{enPreparation>0?`, dont ${enPreparation} en préparation`:""}</p>
      {familles.map(f=><section key={f} id={ancre(f)} className="scroll-mt-[calc(var(--hauteur-haut)+1rem)]"><h2 className="mb-3 text-lg font-semibold">{f}</h2><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{filtres.filter(m=>m.famille===f).map(m=><Link key={m.id} href={lien(m.id)} className="carte-rubrique group flex flex-col rounded-[var(--rayon-carte)] p-5 shadow-[var(--ombre-1)]"><h3 className="font-semibold text-[var(--encre)]">{m.nom}</h3><p className="mb-4 mt-2 flex-1 text-sm text-muted-foreground">{m.description}</p><span className="text-xs font-medium">{Object.hasOwn(MODELES,m.code)?"Choisir un dossier →":"En préparation"}</span></Link>)}</div></section>)}
      {!filtres.length&&<div className="vide-guide"><p className="titre">Aucun modèle ne correspond à ce filtre.</p><p className="explication">Essayez un autre mot (bail, charges, intervention) ou revenez à la liste des situations.</p><span className="geste"><Link href={base} className={buttonVariants({variant:"outline",size:"sm"})}>Effacer le filtre</Link></span></div>}
      </>}
    </>}
  </main>;
}
