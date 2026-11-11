import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { montantAbonnementUnique } from "@/lib/tarifs";

const url=process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
describe.skipIf(!url)("nouveau tarif et avantage fondateur — base isolée",()=>{
  it("SQL et prix public concordent jusqu'à 100 lots dans les deux périodicités", async()=>{
    const db=new Client({connectionString:url});await db.connect();
    try {
      const r=await db.query("select n,public.montant_proprietaire_unique(n,'mensuel') m,public.montant_proprietaire_unique(n,'annuel') a from generate_series(0,100) n");
      for(const {n,m,a} of r.rows) expect([+m,+a]).toEqual([montantAbonnementUnique(n,"mensuel"),montantAbonnementUnique(n,"annuel")]);
    } finally {await db.end();}
  });
  it("réserve au plus dix places, exige la MFA et empêche un paiement pendant les six mois", async()=>{
    const db=new Client({connectionString:url});await db.connect();await db.query("begin");
    try {
      const compte=async()=>{
        const id=randomUUID(); const mail=id+"@example.test";
        await db.query("insert into auth.users(id,email,aud,role,raw_user_meta_data,raw_app_meta_data) values($1,$2,'authenticated','authenticated','{}','{}')",[id,mail]);
        await db.query("insert into public.accounts(id,email) values($1,$2) on conflict(id) do nothing",[id,mail]);return id;
      };
      const admin=await compte();await db.query("insert into public.memberships(account_id,role,status) values($1,'super_admin','active')",[admin]);
      const orgs:string[]=[];
      for(let i=0;i<11;i++){
        const titulaire=await compte();
        const org=(await db.query("insert into public.organizations(name,type,status) values('SCI fictive','proprietaire_direct','essai') returning id")).rows[0].id;
        await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[titulaire,org]);orgs.push(org);
      }
      const mfa=async(aal:string)=>{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin,role:"authenticated",aal})]);};
      const grant=(id:string)=>db.query("select public.accorder_avantage_fondateur($1)",[id]);
      await db.query("set local role authenticated");await mfa("aal1");await db.query("savepoint verification");
      await expect(grant(orgs[0])).rejects.toThrow(/double vérification/);await db.query("rollback to verification");
      await mfa("aal2");
      for(const id of orgs.slice(0,10)) await grant(id);
      await db.query("savepoint dix");await expect(grant(orgs[10])).rejects.toThrow(/dix places/);await db.query("rollback to dix;reset role");
      const stats=await db.query("select count(*)::int n, bool_and(fin_incluse=(debut+interval '6 months')::date-1) dates from public.avantages_fondateurs");
      expect(stats.rows[0]).toEqual({n:10,dates:true});
      await expect(db.query("select * from public.intention_souscription_reserver($1,repeat('a',64),60,120)",[orgs[0]])).rejects.toThrow(/période fondateur/);
    } finally {await db.query("rollback");await db.end();}
  });
});
