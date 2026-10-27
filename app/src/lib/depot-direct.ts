import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {detecterMimeReel,pdfComplet,TAILLE_MAX_DEPOT_OCTETS} from './file-type';
import {BUCKET_TRANSIT,PREFIXE_DEPOT,MAX_DEPOT_DIRECT,MAX_FORMULAIRE_DIRECT,descriptionDepotValide,type DescriptionDepot} from './depot-direct-commun';
import {formaterHeureParis} from './heure-paris';
const verifies=new WeakSet<File>();
// Une réservation reprise doit laisser le temps de soumettre le formulaire.
const MARGE_REPRISE=30*60_000;
/** Seul un fichier réellement relu et contrôlé côté serveur bénéficie du transport direct. */
export function limiteFichierDepose(f:File){return verifies.has(f)?MAX_DEPOT_DIRECT:TAILLE_MAX_DEPOT_OCTETS;}
export async function reserverDepotDirect(db:SupabaseClient,description:DescriptionDepot) {
 if(!descriptionDepotValide(description))return {erreur:'Choisissez un PDF, JPEG ou PNG de 10 Mo maximum.'};
 const {data:{user},error:auth}=await db.auth.getUser();
 if(auth||!user)return {erreur:'Reconnectez-vous avant de déposer le document.'};
 // Nouvel essai du même fichier (doublon refusé par l’action métier, saisie corrigée, page rechargée) :
 // sa réservation encore valable est reprise, sans quota ni stockage supplémentaires (audit #264, DOC-13).
 const reprise=await db.from('depots_temporaires').select('id,chemin').eq('compte_id',user.id).eq('empreinte',description.empreinte)
  .eq('nom',description.nom).eq('mime',description.mime).eq('taille',description.taille)
  .gt('expire_le',new Date(Date.now()+MARGE_REPRISE).toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(reprise.data){
  const {id,chemin}=reprise.data as {id:string;chemin:string};
  const present=await db.storage.from(BUCKET_TRANSIT).list(user.id,{search:id,limit:10});
  if(!present.error&&(present.data??[]).some(o=>o.name===id))return {id,chemin,transfere:true as const};
  // Transfert interrompu : le même chemin réservé reçoit un nouvel essai.
  if(!present.error){
   const signe=await db.storage.from(BUCKET_TRANSIT).createSignedUploadUrl(chemin,{upsert:false});
   if(!signe.error&&signe.data)return {id,chemin:signe.data.path,jeton:signe.data.token};
  }
 }
 const r=await db.from('depots_temporaires').insert({nom:description.nom,mime:description.mime,taille:description.taille,empreinte:description.empreinte}).select('id,chemin').single();
 if(r.error||!r.data){
  if(r.error?.message?.includes('Limite des dépôts'))return {erreur:await messageQuota(db,user.id)};
  return {erreur:'Le dépôt ne peut pas être préparé. Vérifiez votre accès ou réessayez dans une heure si vous avez envoyé beaucoup de fichiers.'};
 }
 // Session de l’utilisateur, jamais de clé de service : la policy borne le chemin réservé.
 const signe=await db.storage.from(BUCKET_TRANSIT).createSignedUploadUrl(r.data.chemin,{upsert:false});
 if(signe.error||!signe.data)return {erreur:'Le transfert ne peut pas être préparé. Votre fichier reste sélectionné.'};
 return {id:r.data.id as string,chemin:signe.data.path,jeton:signe.data.token};
}
/** La limite glissante (20 fichiers ou 100 Mo par heure) se libère quand la plus ancienne réservation de l’heure sort de la fenêtre. */
async function messageQuota(db:SupabaseClient,compte:string):Promise<string> {
 const plusAncienne=await db.from('depots_temporaires').select('created_at').eq('compte_id',compte)
  .gt('created_at',new Date(Date.now()-3_600_000).toISOString()).order('created_at',{ascending:true}).limit(1).maybeSingle();
 const debut=plusAncienne.data?Date.parse(String(plusAncienne.data.created_at)):Number.NaN;
 const reprise=Number.isFinite(debut)?` Vous pourrez reprendre vers ${formaterHeureParis(debut+3_600_000)} (heure de Paris).`:' Réessayez dans une heure.';
 return `Vous avez envoyé beaucoup de fichiers en peu de temps (20 fichiers ou 100 Mo par heure au plus).${reprise} Votre fichier reste sélectionné.`;
}
/** Remplace uniquement les références de transit ; les fichiers classiques suivent leur circuit existant. */
export async function resoudreDepotsFormulaire(db:SupabaseClient,form:FormData):Promise<string|null> {
 const refs=Array.from(form.entries()).filter((e):e is [string,string]=>typeof e[1]==='string'&&e[1].startsWith(PREFIXE_DEPOT));
 if(!refs.length)return null;
 if(refs.length>10)return 'Déposez au maximum dix fichiers à la fois.';
 const {data:{user},error:auth}=await db.auth.getUser();
 if(auth||!user)return 'Reconnectez-vous avant de déposer le document.';
 const fichiers=new Map<string,File>();let total=0;
 for(const [,ref] of refs){
  const id=ref.slice(PREFIXE_DEPOT.length);
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return 'Référence du fichier invalide. Sélectionnez-le à nouveau.';
  const r=await db.from('depots_temporaires').select('id,compte_id,nom,mime,taille,empreinte,chemin,expire_le').eq('id',id).eq('compte_id',user.id).single();
  const d=r.data;
  if(r.error||!d||d.compte_id!==user.id||d.chemin!==`${user.id}/${id}`||!descriptionDepotValide(d)||!Number.isFinite(Date.parse(d.expire_le))||Date.parse(d.expire_le)<=Date.now())return 'Ce transfert a expiré ou n’est pas accessible. Sélectionnez le fichier à nouveau.';
  total+=d.taille;if(total>MAX_FORMULAIRE_DIRECT)return 'Déposez au maximum 50 Mo à la fois.';
  if(fichiers.has(ref))continue;
  const lu=await db.storage.from(BUCKET_TRANSIT).download(d.chemin);
  if(lu.error||!lu.data)return 'Le fichier transféré est indisponible. Votre saisie est conservée ; réessayez.';
  if(lu.data.size!==d.taille||lu.data.size>MAX_DEPOT_DIRECT)return 'Le transfert est incomplet. Sélectionnez le fichier à nouveau.';
  const octets=new Uint8Array(await lu.data.arrayBuffer());
  if(createHash('sha256').update(octets).digest('hex')!==d.empreinte||detecterMimeReel(octets)!==d.mime||(d.mime==='application/pdf'&&!pdfComplet(octets)))return 'Le contenu du fichier ne correspond pas au document envoyé. Sélectionnez un PDF complet, JPEG ou PNG.';
  const f=new File([octets],d.nom,{type:d.mime});verifies.add(f);fichiers.set(ref,f);
 }
 // Ne muter le formulaire qu'après validation de l'ensemble, en gardant l’ordre des fichiers multiples.
 for(const nom of new Set(refs.map(([n])=>n))){const valeurs=form.getAll(nom);form.delete(nom);for(const v of valeurs)form.append(nom,typeof v==='string'?(fichiers.get(v)??v):v);}
 return null;
}
