import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { transactionsInterdites } from '../verifier-transactions-migration.mjs';
export const commerciales=JSON.parse(readFileSync(new URL('./migrations-commerciales.json',import.meta.url),'utf8'));
export function conditionner(source,nom){
 if(!/^[0-9]+_[a-z0-9_]+\.sql$/.test(nom))throw Error('Nom de migration invalide');
 if(nom==='20261110053019_verrou_paiements_pilote.sql'||/securite_instance_pilote|refuser_finance_pilote/.test(source))throw Error('Verrou pilote interdit en livraison commerciale');
 const entree=commerciales.find(x=>x.fichier===nom);
 let sql=source;
 if(entree){
  if(createHash('sha256').update(source).digest('hex')!==entree.sha256)throw Error('Empreinte de migration commerciale différente : revue requise');
  if(!/^begin;\r?\n/i.test(source)||!/\ncommit;\s*$/i.test(source))throw Error('Enveloppe transactionnelle inattendue');
  sql=source.replace(/^begin;\r?\n/i,'').replace(/\ncommit;\s*$/i,'\n');
 }
 if(transactionsInterdites(sql).length)throw Error('Transaction interne interdite');
 return sql;
}
export function verifierLot(noms){
 if(noms.some(n=>n==='20261110053019_verrou_paiements_pilote.sql'))throw Error('Verrou pilote interdit');
 const selection=noms.filter(n=>commerciales.some(c=>c.fichier===n));
 if(selection.length&&JSON.stringify(noms)!==JSON.stringify(commerciales.map(c=>c.fichier)))throw Error('Le lot commercial doit contenir les migrations exactes du manifeste validé dans leur ordre');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [mode,...fichiers]=process.argv.slice(2);
  if(mode==='lot'){verifierLot(fichiers);}
  else if(['verifier','afficher'].includes(mode)&&fichiers.length===1){
   const chemin=fichiers[0],nom=chemin.split('/').at(-1);
   const sql=conditionner(readFileSync(chemin,'utf8'),nom);
   if(mode==='afficher')process.stdout.write(sql);
  }else throw Error('Usage : lot fichiers | verifier fichier | afficher fichier');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
