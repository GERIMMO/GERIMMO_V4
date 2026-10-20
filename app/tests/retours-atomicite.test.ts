import {readFileSync,readdirSync} from 'node:fs';
import {Client} from 'pg';
import {describe,it,expect} from 'vitest';
import {verifierBaseDeTest} from './garde-base';
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
const retours=readdirSync('supabase/retours-arriere').filter(n=>n.endsWith('.sql')).map(n=>({nom:n,sql:readFileSync(`supabase/retours-arriere/${n}`,'utf8')})).filter(r=>r.sql.startsWith('-- Instruction atomique ;'));
const refusMetier:Record<string,RegExp>={
 '20261014200000':/des fonctions appellent encore le prédicat/,
 '20261014500000':/ces fonctions citent encore public\.aujourdhui_paris/,
 '20261014600000':/la migration 20261014601000 .*encore appliquée/,
 '20261014601000':/la migration 20261014602000 .*encore appliquée/,
 '20261014810000':/la migration 20261014812000 .*encore appliquée/,
 '20261014811000':/la migration 20261014812000 .*encore appliquée/,
};
describe('Retours historiques : atomicité du fichier exact',()=>{
 it('recense les 71 anciens retours et les cinq nouveaux',()=>{expect(retours).toHaveLength(76);});
 describe.skipIf(!url)('sur base fictive',()=>{
  it.each(retours.map(r=>({...r,resultat:refusMetier[r.nom.slice(0,14)]?'refus métier attendu, annulation conservée':'retour entièrement exécuté, puis annulation forcée'})))('$nom : $resultat',async({nom,sql})=>{
   const db=new Client({connectionString:url});await db.connect();
   try {
    await db.query('create temporary table temoin_atomicite_retour(v integer)');
    // Le BEGIN et le retour sont dans le MÊME message : ce cas échappait à
    // la comparaison des horodatages de statement et de transaction.
    // Le banc local n'a pas pg_cron : seule son opération textuelle manque.
    // Le substitut est lui-même annulé dans la transaction de cet essai.
    const cron="create or replace function cron.unschedule(job_name text) returns boolean language plpgsql as $stub$ begin delete from cron.job where jobname=job_name; return found; end $stub$;";
    const tentative=db.query('begin; '+cron+' insert into temoin_atomicite_retour values(1); '+sql+'; select 1/0; commit;');
    const attendu=refusMetier[nom.slice(0,14)];
    if(attendu)await expect(tentative).rejects.toMatchObject({code:'P0001',message:expect.stringMatching(attendu)});
    else await expect(tentative).rejects.toMatchObject({code:'22012'});
    await db.query('rollback');
    expect((await db.query('select count(*)::int n from temoin_atomicite_retour')).rows[0].n).toBe(0);
   } finally{await db.query('rollback');await db.end();}
  });
 });
});
