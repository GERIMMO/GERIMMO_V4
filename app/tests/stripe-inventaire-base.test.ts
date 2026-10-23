import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)("Inventaire global Stripe en base",()=>{
 let db:Client; const jeton=randomUUID();
 const prendre=async(token=jeton)=>(await db.query("select public.stripe_inventaire_prendre($1) r",[token])).rows[0].r;
 const page=async(lignes:unknown[],suite=false,curseur:string|null=null,token=jeton)=>(await db.query("select public.stripe_inventaire_page($1,$2,$3,$4) r",[token,curseur,JSON.stringify(lignes),suite])).rows[0].r;
 const ligne=(id="sub_fictif",statut="active")=>({souscription:id,client:"cus_fictif",statut});
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 afterAll(async()=>{await db.end();});
 beforeEach(async()=>{await db.query("begin; delete from public.stripe_souscriptions_non_suivies; update public.stripe_inventaire set cycle=null,curseur=null,verrou_jeton=null,verrou_jusqua=null,complet_le=null,passage_le=null,lus=0");});
 afterEach(async()=>{await db.query("rollback");});
 it("détecte un client absent, même avec zéro abonnement Gerimmo",async()=>{
   await prendre();expect(await page([ligne()])).toMatchObject({lus:1,ecarts:1,incomplet:false});
   expect((await db.query("select motif from public.stripe_souscriptions_non_suivies where souscription='sub_fictif'")).rows[0].motif).toBe("client_absent");
 });
 it("repère une deuxième souscription puis retire l'écart quand elle est résiliée",async()=>{
   const org=(await db.query("insert into public.organizations(name,type,status) values('Inventaire fictif','proprietaire_direct','essai') returning id")).rows[0].id;
   await db.query("insert into public.abonnements(organization_id,stripe_customer_id,stripe_subscription_id) values($1,'cus_fictif','sub_connue')",[org]);
   await prendre();expect(await page([ligne("sub_connue"),ligne()],true)).toMatchObject({ecarts:1,incomplet:true});
   expect((await db.query("select motif from public.stripe_souscriptions_non_suivies")).rows[0].motif).toBe("souscription_non_suivie");
   expect(await page([ligne("sub_fictif","canceled")],false,"sub_fictif")).toMatchObject({ecarts:0});
 });
 it("ne signale pas les abonnements terminés ou expirés",async()=>{
   await prendre();expect(await page([ligne("sub_un","canceled"),ligne("sub_deux","incomplete_expired")])).toMatchObject({ecarts:0});
 });
 it("conserve le curseur et les anciens écarts lors d'une interruption",async()=>{
   await prendre();await page([ligne()],true);await db.query("select public.stripe_inventaire_liberer($1,true)",[jeton]);
   const reprise=await prendre();expect(reprise.curseur).toBe("sub_fictif");
   expect((await db.query("select count(*)::int n from public.stripe_souscriptions_non_suivies")).rows[0].n).toBe(1);
   await page([],false,"sub_fictif");
   expect((await db.query("select complet_le is not null ok,erreur from public.stripe_inventaire")).rows[0]).toEqual({ok:true,erreur:false});
 });
 it("ne retire un ancien écart absent qu’après un cycle complet",async()=>{
   await db.query("insert into public.stripe_souscriptions_non_suivies values('sub_ancienne','cus_ancien','client_absent',$1,now())",[randomUUID()]);
   await prendre();expect(await page([ligne()],true)).toMatchObject({ecarts:2});
   expect(await page([],false,"sub_fictif")).toMatchObject({ecarts:1});
 });
 it("un second travailleur attend et l'ancien ne peut plus valider après expiration",async()=>{
   await prendre();expect(await prendre(randomUUID())).toBeNull();
   await db.query("update public.stripe_inventaire set verrou_jusqua=now()-interval '1 second'");await prendre(randomUUID());
   await expect(page([ligne()])).rejects.toThrow("expirée");
 });
 it("un curseur périmé refuse une page et ne double pas le compteur",async()=>{
   await prendre();await page([ligne()],true);await expect(page([ligne()],true)).rejects.toThrow("expirée");
 });
 it.each([{lignes:[{souscription:"sub_fictif",client:"cus_fictif",statut:"active",email:"personne@example.invalid"}]},{lignes:[]},{lignes:[{souscription:"sub_fictif",client:"cus_fictif",statut:"active"},{souscription:"sub_fictif",client:"cus_fictif",statut:"active"}]}])("refuse les pages incohérentes ou les coordonnées",async({lignes})=>{
   await prendre();await expect(page(lignes,true)).rejects.toThrow();
 });
 it.each(["anon","authenticated"])("%s ne peut lire ni écrire les tables privées",async(role)=>{
   const droits=(await db.query("select has_table_privilege($1,'public.stripe_inventaire','select') lecture,has_table_privilege($1,'public.stripe_souscriptions_non_suivies','insert') ecriture,has_function_privilege($1,'public.stripe_inventaire_prendre(uuid)','execute') prise",[role])).rows[0];
   expect(droits).toEqual({lecture:false,ecriture:false,prise:false});
 });
 it("la supervision refuse un compte ordinaire",async()=>{
   await db.query("set local role authenticated;select set_config('request.jwt.claims','{}',true)");
   await expect(db.query("select public.supervision_stripe_inventaire()")).rejects.toThrow("supervision");
 });
});
