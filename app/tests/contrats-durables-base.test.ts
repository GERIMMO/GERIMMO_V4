import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

import { clientSurPg } from "./fixtures/supabase-sur-pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerAccuseResiliation, envoyerConfirmationSouscription } from "../src/lib/courriers-contrat-envoi";
const banc=vi.hoisted(()=>({service:null as SupabaseClient|null}));
vi.mock("../src/lib/supabase/service",()=>({clientDeService:()=>banc.service}));
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const empreinte = (texte:string)=>createHash("sha256").update(texte).digest("hex");
describe.skipIf(!url)("Confirmation et accusé sur PostgreSQL fictif",()=>{
  const db=new Client({connectionString:url});
  const email="titulaire@example.invalid";
  let org:string, acteur:string, sub:string;
  beforeAll(()=>db.connect());
  afterAll(()=>db.end());
  beforeEach(async()=>{
    await db.query("begin");
    await db.query("select public.tache_systeme()");
    acteur=(await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,now(),'{}','{}') returning id",[randomUUID()+email])).rows[0].id;
    org=(await db.query("insert into organizations(name,type,status,grille_tarifaire) values('SCI fictive','proprietaire_direct','active','2026-09-28') returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role,status) values($1,$2,'proprietaire_direct','active')",[acteur,org]);
    sub="sub_"+randomUUID().replaceAll("-","");
    await db.query("insert into abonnements(organization_id,stripe_customer_id,stripe_subscription_id,stripe_statut,souscrit_le,formule,unites_souscrites,montant_periode_cents,periode_fin,annulation_demandee) values($1,$2,$3,'active',now(),'solo',1,599,now()+interval '1 month',true)",[org,'cus_'+sub,sub]);
    await db.query("insert into acceptations_cgu(account_id,version,document,source) values($1,'v1','conditions_clients','inscription')",[acteur]);
  });
  afterEach(async()=>{await db.query("rollback");vi.unstubAllGlobals();vi.unstubAllEnvs();});
  it("de l’action métier jusqu’à la boîte fictive et au journal, une seule fois par épisode",async()=>{
    vi.stubEnv("GERIMMO_MODE","simulation");vi.stubEnv("COURRIELS_CHIFFREMENT_CLE","ab".repeat(32));vi.stubEnv("RESEND_API_KEY","fictive");
    const boite=vi.fn(async()=>Response.json({id:"msg_"+randomUUID()}));vi.stubGlobal("fetch",boite);
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    // PostgREST conserve la précision des dates SQL. Le pilote pg transforme normalement les dates en Date JS.
    const service=clientSurPg(db,{transactionnel:true});
    banc.service={...service,rpc:async(n:string,args:Record<string,unknown>)=>n==="abonnement_courrier_contexte"
      ? {data:(await db.query("select to_jsonb(a) ligne from abonnement_courrier_contexte($1) a",[org])).rows.map(r=>r.ligne),error:null}
      : service.rpc(n,args)} as unknown as SupabaseClient;
    const fin=new Date(Date.now()+3600000);
    await db.query("update abonnements set periode_fin=$1 where organization_id=$2",[fin,org]);
    const confirmer=()=>envoyerConfirmationSouscription(banc.service!,{orgId:org,subscription:sub,premierPrelevementLe:null});
    const resilier=()=>envoyerAccuseResiliation(banc.service!,{orgId:org,subscription:sub,periodeFin:fin,notifieeLe:new Date(),chemin:"webhook"});
    for(const envoyer of [confirmer,resilier]){
      expect(await envoyer()).toMatchObject({envoye:true});
      expect((await envoyer()).envoye).toBe(false);
    }
    expect(boite).toHaveBeenCalledTimes(2);
    expect((await db.query("select count(*)::int n from courriels_durables where organization_id=$1 and finalisation_etat='terminee'",[org])).rows[0].n).toBe(2);
  });
  for(const type of ["confirmation_abonnement","accuse_resiliation"]){
    it(type+" : contrôle du destinataire, finalisation après acceptation puis rejeu",async()=>{
      const a=(await db.query("select * from abonnement_courrier_contexte($1)",[org])).rows[0];
      // PostgreSQL garde les microsecondes. Lire la représentation qui arrive de PostgREST.
      const brut=(await db.query("select to_jsonb(a) a from abonnement_courrier_contexte($1) a",[org])).rows[0].a;
      const contexte={type,id:sub,destinataire:empreinte(a.destinataire),organisation:a.organisation,formule:a.formule,
        ...(type==="confirmation_abonnement"?{version:a.cgu_version,acceptee:brut.cgu_acceptee_le,souscrit:brut.souscrit_le,montant:599,document:true,periodicite:a.periodicite,unites:1}:{chemin:"webhook",fin:brut.periode_fin,rang:0})};
      const empreintePour=async(c:object)=>(await db.query("select empreinte_metier_courriel($1,$2) e",[org,c])).rows[0].e;
      expect(await empreintePour({...contexte,destinataire:empreinte("autre@example.invalid")})).toBeNull();
      expect(await empreintePour(contexte)).toMatch(/^[a-f0-9]{64}$/);
      const id=empreinte(sub);
      await db.query("select conserver_courriel($1,$2,$3,'charge-fictive',now()+interval '1 hour')",[id,org,empreinte("test")]);
      expect((await db.query("select attacher_contexte_courriel($1,$2,$3) ok",[id,org,contexte])).rows[0].ok).toBe(true);
      await db.query("savepoint droits");
      await db.query("update memberships set status='inactive' where account_id=$1",[acteur]);
      expect((await db.query("select verifier_contexte_courriel($1) ok",[id])).rows[0].ok).toBe(false);
      await db.query("rollback to savepoint droits");
      await db.query("update courriels_durables set etat='accepte',fournisseur_id='msg_fictif' where id=$1",[id]);
      for(let i=0;i<2;i++) expect((await db.query("select finaliser_courriel_metier($1) ok",[id])).rows[0].ok).toBe(true);
      expect((await db.query("select count(*)::int n from courriels_evenements where courrier_id=$1 and etat='finalisation_terminee'",[id])).rows[0].n).toBe(1);
    });
  }
});
