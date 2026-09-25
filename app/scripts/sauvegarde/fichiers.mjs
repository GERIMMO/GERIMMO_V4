import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMITE = 64 * 1024 * 1024;
const empreinte = b => createHash('sha256').update(b).digest('hex');
export function lireCle(texte) {
  if (!/^[a-f0-9]{64}$/i.test(texte ?? '')) throw new Error('La clé de sauvegarde doit contenir 64 caractères hexadécimaux.');
  return Buffer.from(texte,'hex');
}
// Exportées le 25/09 pour l'export de la base (base.mjs) : même format GERIMMO1.
export function chiffrer(octets,cle) {
  const nonce=randomBytes(12),chiffreur=createCipheriv('aes-256-gcm',cle,nonce);
  const contenu=Buffer.concat([chiffreur.update(octets),chiffreur.final()]);
  return Buffer.concat([Buffer.from('GERIMMO1'),nonce,chiffreur.getAuthTag(),contenu]);
}
export function dechiffrer(octets,cle) {
  if (octets.length<36 || octets.subarray(0,8).toString()!=='GERIMMO1') throw new Error('Archive non reconnue.');
  const d=createDecipheriv('aes-256-gcm',cle,octets.subarray(8,20));d.setAuthTag(octets.subarray(20,36));
  try {return Buffer.concat([d.update(octets.subarray(36)),d.final()]);}catch {throw new Error('Clé incorrecte ou sauvegarde altérée.');}
}
export function cheminSur(nom) {
  if (typeof nom!=='string' || !nom || /[\\\x00-\x1f]/.test(nom) || nom.split('/').some(p=>!p||p==='.'||p==='..') || nom.length>1024) throw new Error('Chemin de fichier invalide.');
  return nom;
}
async function resultat(promesse,etape) {
  const {data,error}=await promesse;
  if(error || data==null) throw new Error(`Sauvegarde interrompue : ${etape}.`);
  return data;
}
export async function inventaire(storage) {
  const buckets=await resultat(storage.listBuckets(),'liste des espaces');
  const fichiers=[];
  async function parcourir(bucket,prefixe='',profondeur=0) {
    if(profondeur>30)throw new Error('Arborescence trop profonde.');
    for(let offset=0;;offset+=100) {
      const lignes=await resultat(storage.from(bucket).list(prefixe,{limit:100,offset,sortBy:{column:'name',order:'asc'}}),'liste des fichiers');
      for(const ligne of lignes) {
        // Un nom de résultat ne doit pas introduire de sous-chemin supplémentaire.
        const nom=cheminSur(ligne.name);if(nom.includes('/'))throw new Error('Nom de résultat invalide.');
        const objet=cheminSur(prefixe?`${prefixe}/${nom}`:nom);
        if(ligne.id==null)await parcourir(bucket,objet,profondeur+1);
        else fichiers.push({bucket,nom:objet,taille:Number(ligne.metadata?.size??-1),modifie:ligne.updated_at??null,type:ligne.metadata?.mimetype??'application/octet-stream'});
      }
      if(lignes.length<100)break;
      if(offset>1_000_000)throw new Error('Inventaire trop volumineux : traitement spécifique nécessaire.');
    }
  }
  for(const b of buckets) {cheminSur(b.id);if(b.id.includes('/'))throw new Error('Espace invalide.');await parcourir(b.id);}
  fichiers.sort((a,b)=>`${a.bucket}/${a.nom}`.localeCompare(`${b.bucket}/${b.nom}`));
  if(new Set(fichiers.map(f=>`${f.bucket}/${f.nom}`)).size!==fichiers.length)throw new Error('Inventaire instable ou doublonné.');
  return {buckets:buckets.map(b=>({id:b.id,public:b.public,file_size_limit:b.file_size_limit,allowed_mime_types:b.allowed_mime_types})).sort((a,b)=>a.id.localeCompare(b.id)),fichiers};
}
export async function sauvegarder(storage,dossier,cle,source) {
  // Le dossier doit être neuf : aucune archive précédente n'est écrasée.
  await fs.mkdir(dossier,{mode:0o700});
  const debut=await inventaire(storage),objets=[];
  for(const f of debut.fichiers) {
    if(f.taille>LIMITE)throw new Error('Un fichier dépasse 64 Mo : sauvegarde interrompue, utiliser un export adapté.');
    const blob=await resultat(storage.from(f.bucket).download(f.nom),'téléchargement');
    if(blob.size>LIMITE)throw new Error('Un fichier dépasse 64 Mo.');
    const contenu=Buffer.from(await blob.arrayBuffer());
    if(f.taille>=0 && contenu.length!==f.taille)throw new Error('Un fichier a changé pendant la sauvegarde.');
    const fichier=`${String(objets.length).padStart(8,'0')}.gcm`;
    await fs.writeFile(path.join(dossier,fichier),chiffrer(contenu,cle),{mode:0o600,flag:'wx'});
    objets.push({...f,fichier,taille:contenu.length,sha256:empreinte(contenu)});
  }
  const fin=await inventaire(storage);
  if(JSON.stringify(fin)!==JSON.stringify(debut))throw new Error('Le stockage a changé : archive incomplète, recommencer pendant une période sans écriture.');
  const manifeste={version:1,date:new Date().toISOString(),source,buckets:debut.buckets,objets};
  await fs.writeFile(path.join(dossier,'manifeste.gcm'),chiffrer(Buffer.from(JSON.stringify(manifeste)),cle),{mode:0o600,flag:'wx'});
  return {fichiers:objets.length,octets:objets.reduce((s,f)=>s+f.taille,0)};
}
async function lireFichierSur(dossier,nom) {
  const chemin=path.join(dossier,nom),stat=await fs.lstat(chemin);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>LIMITE+1024*1024)throw new Error('Fichier de sauvegarde invalide.');
  return fs.readFile(chemin);
}
export async function verifier(dossier,cle) {
  const root=await fs.lstat(dossier);if(!root.isDirectory()||root.isSymbolicLink())throw new Error('Dossier de sauvegarde invalide.');
  const m=JSON.parse(dechiffrer(await lireFichierSur(dossier,'manifeste.gcm'),cle).toString());
  if(m.version!==1 || !Array.isArray(m.objets) || !Array.isArray(m.buckets))throw new Error('Version de sauvegarde inconnue.');
  const noms=new Set(),fichiers=new Set();
  for(const f of m.objets) {
    cheminSur(f.bucket);cheminSur(f.nom);
    if(f.bucket.includes('/')||!/^\d{8}\.gcm$/.test(f.fichier)||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.taille)||f.taille<0||f.taille>LIMITE)throw new Error('Manifeste invalide.');
    const identite=`${f.bucket}/${f.nom}`;
    if(noms.has(identite)||fichiers.has(f.fichier))throw new Error('Entrée doublonnée.');noms.add(identite);fichiers.add(f.fichier);
    const octets=dechiffrer(await lireFichierSur(dossier,f.fichier),cle);
    if(octets.length!==f.taille||empreinte(octets)!==f.sha256)throw new Error('Intégrité d’un fichier non confirmée.');
  }
  return m;
}
export async function extraire(dossier,cle,destination) {
  // Toute l'archive est vérifiée avant de créer un seul fichier en clair.
  const m=await verifier(dossier,cle);await fs.mkdir(destination,{mode:0o700});
  for(const f of m.objets) {
    const contenu=dechiffrer(await lireFichierSur(dossier,f.fichier),cle);
    if(empreinte(contenu)!==f.sha256)throw new Error('Archive modifiée après vérification.');
    const cible=path.join(destination,f.bucket,f.nom);await fs.mkdir(path.dirname(cible),{recursive:true,mode:0o700});
    await fs.writeFile(cible,contenu,{flag:'wx',mode:0o600});
  }
  await fs.writeFile(path.join(destination,'restauration.json'),JSON.stringify(m,null,2),{flag:'wx',mode:0o600});
  return {fichiers:m.objets.length,octets:m.objets.reduce((s,f)=>s+f.taille,0)};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [commande,dossier,destination]=process.argv.slice(2),cle=lireCle(process.env.GERIMMO_BACKUP_KEY);
    if(!dossier)throw new Error('Indiquer un dossier de sauvegarde.');
    let bilan;
    if(commande==='sauvegarder') {
      const {createClient}=await import('@supabase/supabase-js');
      const url=new URL(process.env.GERIMMO_BACKUP_SOURCE_URL??'');
      if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Connexion sécurisée obligatoire.');
      const secret=process.env.GERIMMO_BACKUP_SERVICE_KEY;if(!secret)throw new Error('Connexion de sauvegarde absente.');
      const client=createClient(url.origin,secret,{auth:{persistSession:false,autoRefreshToken:false}});
      bilan=await sauvegarder(client.storage,dossier,cle,url.origin);
    }else if(commande==='verifier') {
      const m=await verifier(dossier,cle);bilan={fichiers:m.objets.length,integrite:'vérifiée'};
    }else if(commande==='extraire'&&destination)bilan=await extraire(dossier,cle,destination);
    else throw new Error('Commandes : sauvegarder, verifier ou extraire (avec un dossier de destination neuf).');
    console.log(JSON.stringify(bilan));
  }catch(e){console.error(e instanceof Error?e.message:'Opération interrompue.');process.exitCode=1;}
}
