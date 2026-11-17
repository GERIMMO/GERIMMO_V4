const { createRequire } = require('node:module');
const path = require('node:path');
const app = createRequire(path.resolve(__dirname, '../../../app/package.json'));
const url = new URL(process.env.SUPALOCAL_DB);
if (url.hostname !== '127.0.0.1' || !/^\/gerimmo_ci_\w+_api$/.test(url.pathname)) throw Error('Uniquement sur le banc fictif');
const {Client} = app('pg');
async function generer() {
 const client = new Client({connectionString:url.href});
 await client.connect();
 try {
  await client.query('BEGIN');
  await client.query(`insert into public.versions_conditions(document,version,date_effet,nature,texte_html,identite_editeur,resume_modifications)
  values ('conditions_clients','2026-11-14','2026-11-14','technique','<h1>Conditions de recette archivées</h1><p>Exemplaire fictif réservé à la recette.</p>','{}','Exemplaire de recette du journal des archives.') on conflict do nothing`);
  await client.query(`insert into public.publications (veine,periode,statut,titre,slug,chapo,corps,publie_le)
  select cle,'recette-public-v1','publiee','Retrouver les documents de son logement','guide-public-fictif-recette','Un guide fictif de lecture du dossier locatif sur le banc de démonstration.',
  repeat('Dans le dossier de votre location fictive, vous pouvez retrouver votre bail, les coordonnées des personnes habilitées et les justificatifs transmis. ',3),now()
  from public.publication_veines order by cle limit 1 on conflict do nothing`);
  await client.query('COMMIT');
  console.log('Archive et article fictifs présents sur le banc isolé.');
 } finally { await client.end(); }
}
generer().catch(e=>{console.error(e.message);process.exitCode=1;});
