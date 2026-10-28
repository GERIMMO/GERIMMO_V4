'use client';
import {preparerDepotDirect} from '@/app/actions/depot-direct';
import {createClient} from '@/lib/supabase/client';
import {detecterMimeReel,pdfComplet} from './file-type';
import {BUCKET_TRANSIT,PREFIXE_DEPOT,MARQUEUR_DEPOT,EVENEMENT_DEPOT,MAX_DEPOT_DIRECT,MAX_FORMULAIRE_DIRECT} from './depot-direct-commun';
export class ErreurDepotDirect extends Error {}
const transferts=new WeakMap<File,{ref:string;expire:number}>();
// La signature seule ne prouve pas qu’une image s’ouvre (audit #264, DOC-10) : le décodeur natif
// du navigateur la lit avant tout transfert, sans bibliothèque à charger. Sans décodeur, on laisse passer.
async function imageLisible(octets:Uint8Array<ArrayBuffer>,mime:string){
 if(typeof createImageBitmap!=='function')return true;
 try{(await createImageBitmap(new Blob([octets],{type:mime}))).close();return true;}catch{return false;}
}
/** Prépare le transport avant l'action métier. Aucune nouvelle soumission automatique après une erreur. */
export async function preparerDepotsDirects(form:FormData,options:{imagesSeulement?:boolean}={}) {
 const reperes=form.getAll(MARQUEUR_DEPOT).map(v=>{try{return JSON.parse(String(v)) as {id:string;nom:string};}catch{return null;}})
  .filter((v):v is {id:string;nom:string}=>!!v&&typeof v.id==='string'&&typeof v.nom==='string');
 form.delete(MARQUEUR_DEPOT);
 if(!reperes.length)return;
 const noms=new Set(reperes.map(r=>r.nom));
 const fichiers=Array.from(form.entries()).filter((e):e is [string,File]=>noms.has(e[0])&&e[1] instanceof File&&e[1].size>0);
 if(fichiers.length>10||fichiers.reduce((n,[,f])=>n+f.size,0)>MAX_FORMULAIRE_DIRECT)throw new ErreurDepotDirect('Déposez au maximum dix fichiers et 50 Mo par envoi.');
 // Un champ qui n'accepte que des photos (accept="image/…", sans PDF) refuse tout autre fichier en parlant de photo,
 // pas de « PDF complet » (audit final, DOC-18).
 const photosSeulement=(nom:string)=>reperes.filter(r=>r.nom===nom).some(r=>{const champ=document.getElementById(r.id);return champ instanceof HTMLInputElement&&/image\//i.test(champ.accept)&&!/pdf/i.test(champ.accept);});
 const client=createClient();const references=new Map<File,string>();
 for(const [nom,fichier] of fichiers){
  const informer=(texte:string)=>{for(const r of reperes.filter(r=>r.nom===nom)){const champ=document.getElementById(r.id);if(champ instanceof HTMLInputElement&&Array.from(champ.files??[]).includes(fichier))champ.dispatchEvent(new CustomEvent(EVENEMENT_DEPOT,{detail:texte}));}};
  try {
   if(fichier.size>MAX_DEPOT_DIRECT)throw new ErreurDepotDirect('Ce fichier dépasse 10 Mo. Réduisez sa taille avant de l’envoyer.');
   informer('Vérification du fichier…');
   const octets=new Uint8Array(await fichier.arrayBuffer());const mime=detecterMimeReel(octets);
   if((options.imagesSeulement||photosSeulement(nom))&&mime!=='image/jpeg'&&mime!=='image/png')throw new ErreurDepotDirect(`Le fichier « ${fichier.name} » n'est pas une image JPEG ou PNG.`);
   if(!mime||(mime==='application/pdf'&&!pdfComplet(octets)))throw new ErreurDepotDirect('Choisissez un PDF complet, JPEG ou PNG.');
   if(mime!=='application/pdf'&&!(await imageLisible(octets,mime)))throw new ErreurDepotDirect(`L’image « ${fichier.name} » est endommagée ou illisible. Choisissez une photo ou un scan qui s’ouvre sur votre appareil.`);
   const precedent=transferts.get(fichier);
   if(precedent&&precedent.expire>Date.now()){references.set(fichier,precedent.ref);informer('');continue;}
   const empreinte=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',octets)),b=>b.toString(16).padStart(2,'0')).join('');
   const reservation=await preparerDepotDirect({nom:fichier.name,mime,taille:fichier.size,empreinte});
   // « transfere » : le même fichier attend déjà en transit (nouvel essai) ; rien à renvoyer.
   if(reservation.erreur||!reservation.id||!reservation.chemin||(!reservation.transfere&&!reservation.jeton))throw new ErreurDepotDirect(reservation.erreur??'Le transfert ne peut pas être préparé.');
   if(!reservation.transfere&&reservation.jeton){
    informer('Transfert du fichier en cours…');
    // Blob au MIME réel, indépendant de l’extension annoncée par le navigateur.
    const {error}=await client.storage.from(BUCKET_TRANSIT).uploadToSignedUrl(reservation.chemin,reservation.jeton,new Blob([octets],{type:mime}),{contentType:mime,upsert:false});
    if(error)throw new ErreurDepotDirect('Le transfert a été interrompu. Votre saisie et votre fichier sont conservés ; réessayez.');
   }
   const ref=PREFIXE_DEPOT+reservation.id;references.set(fichier,ref);transferts.set(fichier,{ref,expire:Date.now()+90*60_000});
   // Le bouton du formulaire suit l’action métier. Ce statut suit seulement
   // les octets, y compris dans les formulaires pilotés par onSubmit.
   informer('');
  }catch(e){informer('Transfert non terminé — fichier conservé.');if(e instanceof ErreurDepotDirect)throw e;throw new ErreurDepotDirect('Le transfert n’a pas abouti. Votre saisie et votre fichier sont conservés ; réessayez.');}
 }
 for(const nom of noms){const valeurs=form.getAll(nom);form.delete(nom);for(const v of valeurs)form.append(nom,v instanceof File?(references.get(v)??v):v);}
}
