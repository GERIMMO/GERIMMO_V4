import { lierCommandeFictive } from "./fixtures/preuve-commande";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

import { clientSurPg } from "./fixtures/supabase-sur-pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerAccuseResiliation, envoyerConfirmationSouscription } from "../src/lib/courriers-contrat-envoi";
import { reprendreCourriels } from "../src/lib/reprise-courriels";
import { exigerContexteCourriel } from "../src/lib/finalisation-courriels";
import { envoyerEmailTransport } from "../src/lib/email";
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
    await db.query("insert into acceptations_cgu(account_id,version,document,source,acceptee_le) values($1,'2026-10-01','conditions_clients','inscription','2026-10-01 12:00Z')",[acteur]);
  });
  afterEach(async()=>{await db.query("rollback");vi.unstubAllGlobals();vi.unstubAllEnvs();});

  async function preparer() {
    vi.stubEnv("GERIMMO_MODE","simulation");vi.stubEnv("COURRIELS_CHIFFREMENT_CLE","ab".repeat(32));vi.stubEnv("RESEND_API_KEY","fictive");
    await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
    const service=clientSurPg(db,{transactionnel:true});
    banc.service={...service,rpc:async(n:string,args:Record<string,unknown>)=>n==="abonnement_courrier_contexte"
      ? {data:(await db.query("select to_jsonb(a) ligne from abonnement_courrier_contexte($1) a",[args.p_org])).rows.map(r=>r.ligne),error:null}
      : service.rpc(n,args)} as unknown as SupabaseClient;
    const boite:{to:string[];html:string;subject:string}[]=[];
    let refus=false;
    vi.stubGlobal("fetch",async(url:string,opts:RequestInit)=>{
      if(url!=="https://api.resend.com/emails"||opts.method!=="POST") throw Error("Réseau interdit");
      if(refus){refus=false;return new Response("retry",{status:429})}
      boite.push(JSON.parse(String(opts.body)));
      return Response.json({id:"msg_"+randomUUID()});
    });
    const fin=new Date(Date.now()+86400000);
    await db.query("update abonnements set periode_fin=$1 where organization_id=$2",[fin,org]);
    const adr=(await db.query("select email from auth.users where id=$1",[acteur])).rows[0].email;
    return {boite,fin,adr,refuser:()=>{refus=true}};
  }
  it("boîte isolée : un exemplaire de chaque courrier, bon destinataire et montant",async()=>{
    const {boite,fin,adr}=await preparer();
    await lierCommandeFictive(db,org,acteur,sub,"2026-10-01");
    for(let i=0;i<2;i++){
      await envoyerConfirmationSouscription(banc.service!,{orgId:org,subscription:sub,premierPrelevementLe:null});
      await envoyerAccuseResiliation(banc.service!,{orgId:org,subscription:sub,periodeFin:fin,notifieeLe:new Date(),chemin:"webhook"});
    }
    expect(boite.map(m=>m.to)).toEqual([[adr],[adr]]);
    expect(boite[0].html).toContain("5,99");expect(boite[1].subject).toContain("résiliation");
  });
  it("confirmation différée : citer la version acceptée à la souscription",async()=>{
    const {boite}=await preparer();
    await db.query("update abonnements set souscrit_le='2026-11-10 12:00Z' where organization_id=$1",[org]);
    await db.query("insert into acceptations_cgu(account_id,version,document,source,acceptee_le) values($1,'2026-11-01','conditions_clients','inscription','2026-11-10 11:59Z'),($1,'2026-11-12','conditions_clients','compte','2026-11-13 12:00Z')",[acteur]);
    await lierCommandeFictive(db,org,acteur,sub,"2026-11-01");
    const r=await envoyerConfirmationSouscription(banc.service!,{orgId:org,subscription:sub,premierPrelevementLe:null});
    expect(r.envoye).toBe(true);
    expect(boite).toHaveLength(1);
    const contexte=(await db.query("select contexte_metier from courriels_durables where organization_id=$1",[org])).rows[0].contexte_metier;
    expect(contexte.version).toBe("2026-11-01");
  });
  it("les rôles des portails ne peuvent écrire ni associer les preuves de commande",async()=>{
    const droits=await db.query(`select role,
      has_table_privilege(role,'public.preuves_commandes_abonnement','insert,update,delete') as ecriture,
      has_function_privilege(role,'public.lier_preuve_commande(uuid,text,uuid,uuid)','execute') as liaison
      from unnest(array['anon','authenticated']) role`);
    for (const ligne of droits.rows) expect(ligne).toMatchObject({ecriture:false,liaison:false});
  });
  it("un identifiant Facebook conservé termine la campagne organique dans la même écriture",async()=>{
    const {rows:[article]}=await db.query("insert into publications(titre,slug,statut,periode) values('Campagne fictive',$1,'brouillon','audit') returning id",[randomUUID()]);
    await db.query("insert into marketing_campagnes(nom,publication_id,nature,canal,statut) values('Campagne fictive',$1,'organique','facebook','idee')",[article.id]);
    await db.query("update publications set facebook_post_id=$2,facebook_publie_le=now() where id=$1",[article.id,randomUUID()]);
    const {rows:[campagne]}=await db.query("select statut,fin_le from marketing_campagnes where publication_id=$1",[article.id]);
    expect(campagne.statut).toBe("terminee"); expect(campagne.fin_le).toBeTruthy();
  });
  it("retrouve un titre refusé au-delà des cent publications les plus récentes",async()=>{
    const titre="Ancien sujet "+randomUUID();
    await db.query("insert into publications(titre,slug,statut,periode,updated_at) values($1,$2,'refusee','audit',now()-interval '1 year')",[titre,randomUUID()]);
    await db.query("insert into publications(titre,slug,statut,periode) select 'Sujet suivant',gen_random_uuid()::text,'brouillon','audit' from generate_series(1,101)");
    const h=await db.query("select public.titres_editoriaux_utilises($1) as titre",[[titre,"Sujet inédit"]]);
    expect(h.rows).toEqual([{titre}]);
  });
  it("PostgreSQL refuse le même identifiant Meta pour un second article",async()=>{
    const post="fictif_"+randomUUID();
    const inserer=()=>db.query("insert into publications(titre,slug,statut,periode,facebook_post_id) values('Fictif',$1,'brouillon','audit',$2)",[randomUUID(),post]);
    await inserer();
    await expect(inserer()).rejects.toMatchObject({code:"23505",constraint:"publications_facebook_post_unique"});
  });
  it("contrat historique sans preuve de commande : vérification humaine",async()=>{
    const {boite}=await preparer();
    const resultat=await envoyerConfirmationSouscription(banc.service!,{orgId:org,subscription:sub,premierPrelevementLe:null});
    expect(resultat.envoye).toBe(false); expect(boite).toHaveLength(0);
    expect(resultat.motif).toContain("vérifier");
  });
  it("un accusé différé ne doit pas partir après réactivation par Stripe",async()=>{
    const {boite,fin,adr,refuser}=await preparer();
    const notification=new Date();
    await db.query("select abonnement_geste_consigner($1,$2,'abonnement_resiliation_notifiee',$3)",[org,acteur,{souscription:sub,chemin:"page",notifiee_le:notification.toISOString(),destinataire_empreinte:empreinte(adr)}]);
    refuser();
    const res=await envoyerAccuseResiliation(banc.service!,{orgId:org,subscription:sub,periodeFin:fin,notifieeLe:notification,chemin:"action",destinataire:adr});
    expect(res.envoye).toBe(false);expect(boite).toHaveLength(0);
    await db.query("select abonnement_appliquer($1,$2,'active',1,$3,false)",['cus_'+sub,sub,fin]);
    await db.query("select abonnement_resiliation_levee($1,$2)",[org,sub]);
    expect((await db.query("select annulation_demandee from abonnements where organization_id=$1",[org])).rows[0].annulation_demandee).toBe(false);
    await db.query("update courriels_durables set reprendre_apres=now()-interval '1 minute' where organization_id=$1",[org]);
    await reprendreCourriels(banc.service!,async(p,id)=>envoyerEmailTransport({...p,organisation:{db:banc.service!,id:org},referenceInterne:id,avantEnvoi:()=>exigerContexteCourriel(banc.service!,id)}),async()=>{});
    expect(boite.map(m=>m.subject)).toEqual([]);
    // Une nouvelle résiliation de la même échéance constitue une nouvelle demande.
    await db.query("select abonnement_appliquer($1,$2,'active',1,$3,true)",['cus_'+sub,sub,fin]);
    const nouvelAccuse=await envoyerAccuseResiliation(banc.service!,{orgId:org,subscription:sub,periodeFin:fin,notifieeLe:new Date(),chemin:"webhook"});
    expect(nouvelAccuse.envoye).toBe(true);
    expect(boite).toHaveLength(1);
  });
});
