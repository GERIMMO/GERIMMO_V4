import {Client} from 'pg';import {readFileSync} from 'node:fs';
const u=new URL(process.env.SUPABASE_DB_URL??'');if(u.hostname!=='127.0.0.1'||!['/gerimmo_ci_sql','/gerimmo_ci_vun'].includes(u.pathname))throw Error('Source locale fictive obligatoire');
const source=u.pathname.slice(1);u.pathname='/postgres';const db=new Client({connectionString:u.href});await db.connect();
// Une base de profil déjà existante n'est jamais réinitialisée.
const nom=process.env.GERIMMO_PILOTE_NOM??'gerimmo_ci_lottrois';if(!['gerimmo_ci_lottrois','gerimmo_ci_vun_pilote'].includes(nom))throw Error('Nom de profil local invalide');
try{await db.query(`create database "${nom}" template "${source}"`);}finally{await db.end();}
u.pathname='/'+nom;const p=new Client({connectionString:u.href});await p.connect();try{await p.query(readFileSync(new URL('../../supabase/profils-locaux/20261110053019_verrou_paiements_pilote.sql',import.meta.url),'utf8'));}finally{await p.end();}
