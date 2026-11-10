import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifierBaseDeTest } from './garde-base';
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)('Supervision V1 : lecture bornée sous RLS',()=>{
 let db:Client,admin:string,ordinaire:string;
 const id='a'.repeat(64);
 beforeAll(async()=>{
  db=new Client({connectionString:url});await db.connect();await db.query('begin');
  admin=randomUUID();ordinaire=randomUUID();
  for(const compte of [admin,ordinaire])await db.query("insert into auth.users(id,email) values($1,$2)",[compte,`${compte}@example.invalid`]);
  await db.query("insert into public.memberships(account_id,role) values($1,'super_admin')",[admin]);
  await db.query("insert into public.courriels_durables(id,empreinte,etat) values($1,'preuve-test','en_attente')",[id]);
 });
 afterAll(async()=>{await db?.query('rollback');await db?.end();});
 async function lecture(compte:string,aal:string,colonne='id'){
  await db.query('savepoint lecture');
  try{
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role:'authenticated',aal})]);
   await db.query('set local role authenticated');
   return await db.query(`select ${colonne} from public.courriels_durables where id=$1`,[id]);
  }finally{await db.query('rollback to savepoint lecture');}
 }
 it('un compte ordinaire ne voit aucune opération',async()=>{expect((await lecture(ordinaire,'aal2')).rows).toEqual([]);});
 it('le super administrateur sans second facteur ne voit aucune opération',async()=>{expect((await lecture(admin,'aal1')).rows).toEqual([]);});
 it('le super administrateur avec second facteur voit les seuls champs accordés',async()=>{expect((await lecture(admin,'aal2')).rows).toEqual([{id}]);});
 it('le super administrateur ne peut pas lire le contenu chiffré ou toutes les colonnes',async()=>{await expect(lecture(admin,'aal2','*')).rejects.toMatchObject({code:'42501'});});
 it('aucun rôle utilisateur ne peut écrire dans les files techniques',async()=>{
  for(const table of ['courriels_durables','notification_intentions'])for(const role of ['anon','authenticated']){
   const {rows:[r]}=await db.query("select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE') as ecriture",[role,`public.${table}`]);
   expect(r.ecriture).toBe(false);
  }
 });
});
