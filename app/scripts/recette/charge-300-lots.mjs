// Banc SQL jetable : aucun accès distant et aucune donnée réelle admis.
import { Client } from 'pg';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const url = new URL(process.env.GERIMMO_CHARGE_DB ?? '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^\/gerimmo_ci_charge_[a-z_]+$/.test(url.pathname)) {
  throw new Error('Une base locale jetable nommée gerimmo_ci_charge_* est obligatoire.');
}
const db = new Client({connectionString:url.href, statement_timeout:15000});
await db.connect();
const identifiant = async (sql, args=[]) => (await db.query(sql,args)).rows[0].id;
try {
  const compte = await db.query('select count(*)::int n from public.organizations');
  assert.equal(compte.rows[0].n,0,'Le banc exige une base vide de toute organisation.');
  await db.query('begin');
  const org = await identifiant("insert into organizations(name,status,type) values('CHARGE FICTIVE — 300 lots','active','agence') returning id");
  const autre = await identifiant("insert into organizations(name,status,type) values('CHARGE FICTIVE — témoin isolé','active','agence') returning id");
  const utilisateur = () => identifiant(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','charge-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
  const admin=await utilisateur(), temoin=await utilisateur();
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$4,'admin_agence')",[admin,org,temoin,autre]);
  await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) select $1,'Immeuble fictif '||g,'appartement',g||' rue Fictive','75001','Ville fictive' from generate_series(1,30) g",[org]);
  await db.query("insert into lots(organization_id,bien_id,nom,etat,surface_m2,pieces) select $1,b.id,'Lot fictif '||g,'loue',60,3 from biens b cross join generate_series(1,10) g where b.organization_id=$1",[org]);
  await db.query("insert into baux(organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance) select $1,id,'nu','actif',700,100,current_date-400,5 from lots where organization_id=$1",[org]);
  await db.query("insert into appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance) select $1,b.id,(date_trunc('month',current_date)-g*interval '1 month')::date,700,100,800,(date_trunc('month',current_date)-g*interval '1 month')::date+4 from baux b cross join generate_series(0,11) g where b.organization_id=$1",[org]);
  await db.query("insert into ecritures(organization_id,bail_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle) select $1,b.id,b.lot_id,'loyer','recette',800,(current_date-g*30),(current_date-g*30),'Encaissement fictif' from baux b cross join generate_series(0,11) g where b.organization_id=$1",[org]);
  await db.query("insert into incidents(organization_id,lot_id,bail_id,numero,canal,categorie,description) select $1,b.lot_id,b.id,'CHARGE-'||row_number() over(),'agence','plomberie_canalisation','Incident fictif pour le banc de charge' from baux b where b.organization_id=$1",[org]);
  await db.query('commit');
  await db.query('analyze');
  const requetes = [
    ['baux_et_lots', "select b.id,l.nom,b.loyer_hc,b.charges from baux b join lots l on l.id=b.lot_id where b.organization_id=$1 order by l.nom,b.id limit 300",300],
    ['comptabilite', "select b.id,sum(e.montant) total from baux b join ecritures e on e.bail_id=b.id where b.organization_id=$1 group by b.id",300],
    ['incidents', "select i.id,l.nom,i.etat from incidents i join lots l on l.id=i.lot_id where i.organization_id=$1 order by i.created_at desc limit 300",300],
    ['loyers', "select b.id,sum(a.montant_du) total from baux b join appels_loyer a on a.bail_id=b.id where b.organization_id=$1 group by b.id",300],
  ];
  const mesures=Object.fromEntries(requetes.map(([n])=>[n,[]]));
  const depart=performance.now();
  await Promise.all(Array.from({length:10},async()=>{
    const client=new Client({connectionString:url.href,statement_timeout:15000});await client.connect();
    try {
      for(let passage=0;passage<10;passage++) {
        await client.query('begin');
        await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin,role:'authenticated',aal:'aal2'})]);
        await client.query('set local role authenticated');
        for(const[n,sql,nombre] of requetes){const t=performance.now();const r=await client.query(sql,[org]);mesures[n].push(performance.now()-t);assert.equal(r.rowCount,nombre);if(n==='comptabilite'||n==='loyers')for(const ligne of r.rows)assert.equal(Number(ligne.total),9600);}
        await client.query('rollback');
      }
    } finally { await client.end(); }
  }));
  await db.query('begin');
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:temoin,role:'authenticated',aal:'aal2'})]);
  await db.query('set local role authenticated');
  for(const[,sql] of requetes)assert.equal((await db.query(sql,[org])).rowCount,0,'Aucun dossier ne doit traverser les organisations');
  await db.query('rollback');
  const statistiques=Object.fromEntries(Object.entries(mesures).map(([nom,valeurs])=>{valeurs.sort((a,b)=>a-b);return[nom,{requetes:valeurs.length,p50_ms:+valeurs[49].toFixed(2),p95_ms:+valeurs[94].toFixed(2),max_ms:+valeurs[99].toFixed(2)}];}));
  const rapport={date:new Date().toISOString(),environnement:'PostgreSQL local isolé ; aucun service externe',lots:300,baux:300,appels:3600,ecritures:3600,incidents:300,lecteurs_simultanes:10,requetes:400,duree_ms:Math.round(performance.now()-depart),isolation_verifiee:true,statistiques,limite:'Mesure SQL avec les droits réels et jointures principales ; ne mesure pas le réseau, Vercel ni 300 visiteurs simultanés.'};
  await fs.mkdir('tmp/charge',{recursive:true});await fs.writeFile('tmp/charge/rapport-300-lots.json',JSON.stringify(rapport,null,2));console.log(JSON.stringify(rapport,null,2));
} finally {await db.end();}
