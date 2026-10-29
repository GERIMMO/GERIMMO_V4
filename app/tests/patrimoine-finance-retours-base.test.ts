import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
const noms=['20261028143735_patrimoine_consommations_releves','20261028154615_factures_fourniture_journal_atomique','20261028155855_regularisations_depuis_fournitures','20261028171201_historique_contrats_fourniture'];
const lire=(nom:string,retour=false)=>readFileSync(`supabase/${retour?'retours-arriere':'migrations'}/${nom}${retour?'.retour':''}.sql`,'utf8');
describe.skipIf(!url)("retours des fournitures et finances, sans perte de preuves",()=>{
 let db:Client;
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db?.end();});
 beforeEach(async()=>{await db.query('begin');});
 afterEach(async()=>{await db.query('rollback');});
 it("défait deux fois les modules vides dans leur ordre inverse, sans dépendance résiduelle",async()=>{
  for(let n=0;n<2;n++)for(const nom of [...noms].reverse())await db.query(lire(nom,true));
  const r=(await db.query("select to_regclass('public.paiements_factures_fourniture') paiement,to_regclass('public.brouillons_regularisation_fourniture') brouillon,to_regnamespace('consommations_interne') prive")).rows[0];
  expect(r).toEqual({paiement:null,brouillon:null,prive:null});
 });
 it("réinstalle les fonctions, droits et gardes après le retour complet vide",async()=>{
  for(const nom of [...noms].reverse())await db.query(lire(nom,true));
  for(const nom of noms)await db.query(lire(nom));
  await db.query(lire('20261028161204_indexes_patrimoine_consommations'));
  await db.query(lire('20261028161755_gardes_abonnement_patrimoine'));
  const r=(await db.query("select has_function_privilege('authenticated','public.payer_facture_fourniture(uuid,uuid,date)','execute') payer,has_function_privilege('authenticated','public.preparer_regularisation_fourniture(uuid,uuid,integer)','execute') preparer,has_function_privilege('anon','public.payer_facture_fourniture(uuid,uuid,date)','execute') anon,has_function_privilege('authenticated','consommations_interne.source_regularisation(uuid,uuid,integer)','execute') interne")).rows[0];
  expect(r).toEqual({payer:true,preparer:true,anon:false,interne:false});
  expect((await db.query("select count(*)::int n from pg_trigger where tgname in ('conso_historique_contrat','conso_verrou_contrat_facture')")).rows[0].n).toBe(2);
  expect((await db.query("select has_function_privilege('authenticated','consommations_interne.garder_historique_contrat()','execute') autorise")).rows[0].autorise).toBe(false);
  expect((await db.query("select relrowsecurity from pg_class where oid='public.paiements_factures_fourniture'::regclass")).rows[0].relrowsecurity).toBe(true);
 });
});
