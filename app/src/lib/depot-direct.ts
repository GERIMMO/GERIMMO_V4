import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {detecterMimeReel,pdfComplet,TAILLE_MAX_DEPOT_OCTETS} from './file-type';
import {BUCKET_TRANSIT,PREFIXE_DEPOT,MAX_DEPOT_DIRECT,MAX_FORMULAIRE_DIRECT,descriptionDepotValide,type DescriptionDepot} from './depot-direct-commun';
const verifies=new WeakSet<File>();
/** Seul un fichier réellement relu et contrôlé côté serveur bénéficie du transport direct. */
export function limiteFichierDepose(f:File){return verifies.has(f)?MAX_DEPOT_DIRECT:TAILLE_MAX_DEPOT_OCTETS;}
export async function reserverDepotDirect(db:SupabaseClient,description:DescriptionDepot) {
 if(!descriptionDepotValide(description))return {erreur:'Choisissez un PDF, JPEG ou PNG de 10 Mo maximum.'};
 const {data:{user},error:auth}=await db.auth.getUser();
 if(auth||!user)return {erreur:'Reconnectez-vous avant de déposer le document.'};
 const r=await db.from('depots_temporaires').insert({nom:description.nom,mime:description.mime,taille:description.taille,empreinte:description.empreinte}).select('id,chemin').single();
 if(r.error||!r.data)return {erreur:'Le dépôt ne peut pas être préparé. Vérifiez votre accès ou réessayez dans une heure si vous avez envoyé beaucoup de fichiers.'};
 // Session de l’utilisateur, jamais de clé de service : la policy borne le chemin réservé.
 const signe=await db.storage.from(BUCKET_TRANSIT).createSignedUploadUrl(r.data.chemin,{upsert:false});
 if(signe.error||!signe.data)return {erreur:'Le transfert ne peut pas être préparé. Votre fichier reste sélectionné.'};
 return {id:r.data.id as string,chemin:signe.data.path,jeton:signe.data.token};
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
