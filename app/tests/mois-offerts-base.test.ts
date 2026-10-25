import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url=process.env.SUPABASE_DB_URL; verifierBaseDeTest(url);
describe.skipIf(!url)("mois offerts : droits, calendrier, confirmation et rejeu",()=>{
 let db:Client,org:string,sa:string,client:string;
 const agir=async(id:string,aal="aal2")=>{await db.query("reset role");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:"authenticated",aal})]);await db.query("set local role authenticated");};
 const appel=async(id:string,confirmer=false,attendu:unknown=null,mois=2)=> (await db.query("select public.offrir_mois_abonnement($1,$2,$3,$4,'Compensation bug', $5,$6) r",[id,client,org,mois,confirmer,attendu])).rows[0].r;
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();await db.query("begin");
  for(const kind of ["sa","client"]){const id=randomUUID();await db.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,'{}','{}')",[id,`${id}@test.local`]);await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing",[id,`${id}@test.local`]);if(kind==="sa")sa=id;else client=id;}
  org=(await db.query("insert into public.organizations(name,type,status,essai_fin) values('Cadeau fictif','proprietaire_direct','essai',public.aujourdhui_paris()+10) returning id")).rows[0].id;
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin'),($2,$3,'proprietaire_direct')",[sa,client,org]);
 });
 afterAll(async()=>{await db?.query("rollback");await db?.end();});
 beforeEach(async()=>{await db.query("savepoint cas");await agir(sa);});
 afterEach(async()=>{await db.query("rollback to savepoint cas");await db.query("reset role");});
 it("l’aperçu ne modifie rien et le cadeau conserve le temps restant",async()=>{const id=randomUUID();const p=await appel(id);expect(p.nature).toBe("acces");await db.query("reset role");expect((await db.query("select count(*)::int n from public.mois_offerts where organization_id=$1",[org])).rows[0].n).toBe(0);const fin=(await db.query("select (essai_fin+interval '2 months')::date::text fin from public.organizations where id=$1",[org])).rows[0].fin;await agir(sa);const r=await appel(id,true,p);expect(r.fin).toBe(fin);expect((await appel(id,true,p)).id).toBe(id);await db.query("reset role");expect((await db.query("select count(*)::int n from public.mois_offerts where organization_id=$1",[org])).rows[0].n).toBe(1);});
 it("refuse le propriétaire",async()=>{await agir(client);await expect(appel(randomUUID())).rejects.toThrow("Accès refusé");});
 it("exige le second facteur",async()=>{await agir(sa,"aal1");await expect(appel(randomUUID())).rejects.toThrow("Accès refusé");});
 it("refuse une confirmation altérée",async()=>{await expect(appel(randomUUID(),true,{nature:"acces",fin:"2099-01-01"})).rejects.toThrow("période a changé");});
 it("refuse zéro mois",async()=>{await expect(appel(randomUUID(),false,null,0)).rejects.toThrow("1 à 12 mois");});
 it("ne rouvre pas un espace suspendu",async()=>{await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");await db.query("update public.organizations set status='suspendue' where id=$1",[org]);await agir(sa);await expect(appel(randomUUID())).rejects.toThrow("réactivé");});
 it("crée un crédit annuel sans prolonger l’essai",async()=>{await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");await db.query("insert into public.abonnements(organization_id,stripe_customer_id,stripe_subscription_id,stripe_statut,periodicite,montant_periode_cents) values($1,'cus_cadeau','sub_cadeau','active','annuel',7200) on conflict(organization_id) do update set stripe_customer_id='cus_cadeau',stripe_subscription_id='sub_cadeau',stripe_statut='active',periodicite='annuel',montant_periode_cents=7200",[org]);await agir(sa);const id=randomUUID();const p=await appel(id);expect(p.montant_cents).toBe(1200);const r=await appel(id,true,p);expect(r.nature).toBe("credit");expect(r.applique_le).toBeNull();});
 it("bloque un ancien écran de paiement pendant la période offerte",async()=>{const id=randomUUID(),p=await appel(id);await appel(id,true,p);await db.query("reset role");await db.query("set local role service_role");await expect(db.query("select * from public.intention_souscription_reserver($1,repeat('a',64),45,120)",[org])).rejects.toThrow("accès est offert");});
});
