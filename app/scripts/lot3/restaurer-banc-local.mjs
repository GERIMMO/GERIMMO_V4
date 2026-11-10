// Exercice strictement local, sans écrasement : cible neuve obligatoire.
import {Client} from 'pg';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,statSync,cpSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const origine='postgresql://postgres@127.0.0.1:55449/';
const source='gerimmo_ci_lottrois',cible='gerimmo_ci_lottrois_restauree_finale';
const outils=process.env.GERIMMO_PGBIN;if(!outils)throw Error('Chemin des outils PostgreSQL locaux requis');
const sortie='output/lot3/restauration-finale';mkdirSync(sortie,{recursive:true});
const executer=(outil,args)=>execFileSync(join(outils,outil),args,{stdio:'pipe'});
const connexion=async nom=>{const c=new Client({connectionString:origine+nom});await c.connect();return c;};
const admin=await connexion('postgres');
try {if((await admin.query('select 1 from pg_database where datname=$1',[cible])).rowCount)throw Error('Cible déjà présente : aucun écrasement autorisé');}finally{await admin.end();}
const debut=Date.now();executer('pg_dump',['-Fc','--no-owner','-f',sortie+'/base-fictive.dump',origine+source]);
executer('psql',[origine+'postgres','-v','ON_ERROR_STOP=1','-c',`create database ${cible}`]);
executer('pg_restore',['--no-owner','--exit-on-error','-d',origine+cible,sortie+'/base-fictive.dump']);
async function inventaire(nom){const db=await connexion(nom);try{
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','auth','storage') order by 1,2")).rows;
 const resultat={};for(const t of tables){const f='"'+t.schemaname+'"."'+t.tablename+'"';resultat[f]=(await db.query(`select count(*)::int nombre,encode(sha256(convert_to(coalesce(string_agg(row_to_json(t)::text,E'\\n' order by row_to_json(t)::text),''),'UTF8')),'hex') empreinte from ${f} t`)).rows[0];}
 const droits=(await db.query("select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by 1,2,3")).rows;
 const roles=(await db.query("select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema in ('public','auth','storage') order by 1,2,3,4")).rows;
 return {tables:resultat,politiques:createHash('sha256').update(JSON.stringify(droits)).digest('hex'),droits:createHash('sha256').update(JSON.stringify(roles)).digest('hex')};
}finally{await db.end();}}
const avant=await inventaire(source),apres=await inventaire(cible);if(JSON.stringify(avant)!==JSON.stringify(apres))throw Error('Intégrité de restauration non conforme');
const stockage='/tmp/gerimmo-lot3-stockage';
function fichiers(base,prefixe=''){return readdirSync(join(base,prefixe)).sort().flatMap(n=>{const rel=join(prefixe,n);return statSync(join(base,rel)).isDirectory()?fichiers(base,rel):[{chemin:rel,sha256:createHash('sha256').update(readFileSync(join(base,rel))).digest('hex')}];});}
let objets=[];if(existsSync(stockage)){if(existsSync(sortie+'/stockage'))throw Error('Copie stockage déjà présente');cpSync(stockage,sortie+'/stockage',{recursive:true});objets=fichiers(stockage);if(JSON.stringify(objets)!==JSON.stringify(fichiers(sortie+'/stockage')))throw Error('Stockage différent');}
writeFileSync(sortie+'/preuve.json',JSON.stringify({source,cible,duree_secondes:(Date.now()-debut)/1000,tables_verifiees:Object.keys(avant.tables).length,integrite_donnees_et_droits:true,inventaire:avant,objets_copies:objets.length,empreintes_objets:objets,limite:'Copie physique des objets du banc UI distinct ; pas une preuve de complétude documentaire de la base SQL ni de restauration managée Auth.'},null,2));
console.log('Restauration locale vérifiée ; aucune base existante écrasée.');
