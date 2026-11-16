import { Client } from "pg";
import { createHash,randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { lierCommandeFictive } from "./fixtures/preuve-commande";
import { clientSurPg } from "./fixtures/supabase-sur-pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerRelancesDues } from "../src/lib/relances-paiement";
import { envoyerAccuseRetractation,envoyerReceptionRetractation, notifierResiliationImpaye } from "../src/lib/courriers-contrat-envoi";
import { factureImpayee } from "../src/lib/impaye-preuve-stripe";
import Stripe from "stripe";
import { executerEvenementStripe } from "../src/lib/stripe-file";

const banc = vi.hoisted(()=>({service:null as SupabaseClient|null, stripe:null as Stripe|null}));
vi.mock("../src/lib/supabase/service",()=>({clientDeService:()=>banc.service}));
vi.mock("../src/lib/stripe",()=>({configurationStripe:()=>({pret:true,config:{}}),clientStripe:()=>banc.stripe}));
const url=process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const h=(v:string)=>createHash("sha256").update(v).digest("hex");

describe.skipIf(!url)("Incidents contractuels — vrais droits, preuves et finalisation PostgreSQL",()=>{
 const db=new Client({connectionString:url});
 const paiement = {status:"past_due",facture:"open",solde:599};
 let org:string,acteur:string,sub:string,to:string,episode:string,jour:string;
 const boite=vi.fn(async(_url:URL|string, init:RequestInit)=>Response.json({id:"msg_"+h(String(init.body)).slice(0,20)}));
 const montant = 599;
 beforeAll(()=>db.connect());afterAll(()=>db.end());
 beforeEach(async()=>{
  await db.query("begin");await db.query("select tache_systeme(),set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  to=randomUUID()+"@example.invalid";sub="sub_"+randomUUID().replaceAll("-","");
  acteur=(await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,now(),'{}','{}') returning id",[to])).rows[0].id;
  org=(await db.query("insert into organizations(name,type,status,grille_tarifaire,email_contact) values('SCI fictive','proprietaire_direct','active','2026-09-28','ancienne-adresse@example.invalid') returning id")).rows[0].id;
  await db.query("insert into memberships(account_id,organization_id,role,status) values($1,$2,'proprietaire_direct','active')",[acteur,org]);
  await db.query("insert into abonnements(organization_id,stripe_customer_id,stripe_subscription_id,stripe_statut,souscrit_le,formule,unites_souscrites,montant_periode_cents,montant_mensuel_cents,premiere_facture_payee,paiement_en_defaut_depuis) values($1,$2,$3,'past_due',now(),'solo',1,599,599,true,aujourdhui_paris()-16)",[org,'cus_'+sub,sub]);
  await db.query("insert into acceptations_cgu(account_id,version,document,source) values($1,'2026-11-15','conditions_clients','inscription')",[acteur]);
  await lierCommandeFictive(db,org,acteur,sub,"2026-11-15");
  ({episode,jour}=(await db.query("select (aujourdhui_paris()-16)::text as episode,aujourdhui_paris()::text as jour")).rows[0]);
  const service=clientSurPg(db,{transactionnel:true});
  banc.service={...service,rpc:async(n:string,args:Record<string,unknown>)=>{
   if(n==="abonnement_courrier_contexte" || n==="abonnements_a_relancer"){
    const fonction=n==="abonnements_a_relancer"?"abonnements_a_relancer(200)":"abonnement_courrier_contexte($1,true)";
    return {data:(await db.query(`select to_jsonb(a) x from ${fonction} a where organization_id=$1`,[org])).rows.map(r=>r.x),error:null};
   }
   if(n==="abonnement_contexte_evenement") return {data:(await db.query("select to_jsonb(c) x from abonnement_contexte_evenement($1) c",[args.p_customer])).rows.map(r=>r.x),error:null};
   if(n==="echeance_mise_en_demeure") return {data:(await db.query("select echeance_mise_en_demeure($1,$2,$3)::text jour",[args.p_org,args.p_subscription,args.p_episode])).rows[0].jour,error:null};
   return service.rpc(n,args);
  }} as unknown as SupabaseClient;
  Object.assign(paiement,{status:"past_due",facture:"open",solde:599});
  banc.stripe={subscriptions:{retrieve:async()=>({id:sub,customer:"cus_"+sub,status:paiement.status,latest_invoice:{id:"in_123",customer:"cus_"+sub,parent:{subscription_details:{subscription:sub}},status:paiement.facture,currency:"eur",amount_remaining:paiement.solde}})}} as unknown as Stripe;
  vi.stubEnv("GERIMMO_MODE","simulation");vi.stubEnv("GERIMMO_RELAIS_EMAILS","");vi.stubEnv("COURRIELS_CHIFFREMENT_CLE","cd".repeat(32));vi.stubEnv("RESEND_API_KEY","fictive");
  boite.mockClear();vi.stubGlobal("fetch",boite);
 });
 afterEach(async()=>{await db.query("rollback");vi.unstubAllGlobals();vi.unstubAllEnvs();});
 const etat=async()=> (await db.query("select org_ecriture_ouverte($1) ouverte,relances_paiement palier from abonnements where organization_id=$1",[org])).rows[0];
 const attente=()=>envoyerRelancesDues(banc.service!,{org,stripe:banc.stripe!});
 it("facture due → destinataire signataire → réception → lecture seule → régularisation",async()=>{
  expect(await etat()).toMatchObject({ouverte:true,palier:0});
  expect((await attente()).envoyees).toBe(0);
  expect(boite).toHaveBeenCalledTimes(1);
  const corps=JSON.parse(String(boite.mock.calls[0][1].body));
  expect(corps.to).toEqual([to]);expect(corps.html).toMatch(/mise en demeure|article 15.4/i);
  const m=(await db.query("select * from courriels_durables where organization_id=$1",[org])).rows[0];
  expect(m.etat).toBe("accepte");expect(await etat()).toMatchObject({ouverte:true,palier:0});
  await attente();expect(boite).toHaveBeenCalledTimes(1);
  await db.query("select rapprocher_courriel($1,$2,'livre')",[m.id,m.fournisseur_id]);
  for(let i=0;i<2;i++)expect((await db.query("select finaliser_courriel_metier($1) ok",[m.id])).rows[0].ok).toBe(true);
  expect(await etat()).toMatchObject({ouverte:false,palier:1});
  expect((await db.query("select count(*)::int n from audit_log where organization_id=$1 and action='relance_paiement_envoyee'",[org])).rows[0].n).toBe(1);
  await db.query("select abonnement_appliquer($1,$2,'active',1,now()+interval '1 month',false)",["cus_"+sub,sub]);
  expect(await etat()).toMatchObject({ouverte:true,palier:0});
 });
 it("invoice.paid signé suffit pour réconcilier un défaut ; une facture ancienne, un refus et un rejeu ne créent aucun droit",async()=>{
  const customer="cus_"+sub;
  const facture={id:"in_123",customer,parent:{subscription_details:{subscription:sub}},currency:"eur",status:"paid",amount_paid:599,amount_remaining:0};
  const verification=new Stripe("sk_test_fictif"); // construction de signatures locale, aucun appel réseau
  const payee=(id:string,object:typeof facture)=>{
    const payload=JSON.stringify({id,type:"invoice.paid",data:{object}});
    const secret="whsec_fictif";
    const signature=verification.webhooks.generateTestHeaderString({payload,secret});
    return verification.webhooks.constructEvent(payload,signature,secret);
  };
  let statut="past_due";
  const stripe={subscriptions:{retrieve:async()=>({id:sub,customer,status:statut,latest_invoice:facture})},
    invoices:{retrieve:async()=>facture}} as unknown as Stripe;
  const ancien=payee("evt_ancien_"+sub,{...facture,id:"in_anterieure"});
  expect((await executerEvenementStripe(banc.service!,stripe,ancien)).etat).toBe("traite");
  expect((await db.query("select paiement_en_defaut_depuis from abonnements where organization_id=$1",[org])).rows[0].paiement_en_defaut_depuis).toBeTruthy();
  const evenement=payee("evt_regul_"+sub,facture);
  await expect(executerEvenementStripe(banc.service!,stripe,evenement)).rejects.toThrow();
  expect((await db.query("select traite_le from abonnement_evenements where stripe_event_id=$1",[evenement.id])).rows[0].traite_le).toBeNull();
  // Même événement signé et même facture après le retard de propagation de Stripe.
  await db.query("update abonnement_evenements set reprendre_apres=clock_timestamp()-interval '1 second' where stripe_event_id=$1",[evenement.id]);
  statut="active";
  expect((await executerEvenementStripe(banc.service!,stripe,evenement,false)).etat).toBe("traite");
  expect(await executerEvenementStripe(banc.service!,stripe,evenement)).toMatchObject({deja_traite:evenement.id});
  const a=(await db.query("select stripe_statut,paiement_en_defaut_depuis,relances_paiement from abonnements where organization_id=$1",[org])).rows[0];
  expect(a).toEqual({stripe_statut:"active",paiement_en_defaut_depuis:null,relances_paiement:0});
  const log=await db.query("select details from audit_log where organization_id=$1 and action='paiement_regularise'",[org]);
  expect(log.rows).toHaveLength(1);
  const recu=await db.query("select details from audit_log where organization_id=$1 and action='regularisation_facture_confirmee'",[org]);
  expect(recu.rows[0].details).toMatchObject({evenement:evenement.id,facture:facture.id,montant_cents:599});
  // Une lecture d'échec commencée avant la régularisation et terminée après ne rétablit jamais l'impayé réglé.
  const retard="evt_retard_"+sub,jeton=randomUUID();
  await db.query("select stripe_evenement_prendre($1,'customer.subscription.updated',$2,$3)",[retard,{objet:sub,client:customer},jeton]);
  await db.query("savepoint ancien_statut");
  await expect(db.query("select stripe_evenement_appliquer($1,$2,'abonnement_appliquer',$3)",[retard,jeton,
    {p_customer:customer,p_subscription:sub,p_statut:"past_due",p_facture_en_defaut:facture.id,p_quantite:1,p_annulation:false}])).rejects.toThrow("antérieur au règlement");
  await db.query("rollback to savepoint ancien_statut");

 });
 it("une facture régularisée chez Stripe avant le webhook empêche toute relance",async()=>{
  paiement.facture="paid";paiement.solde=0;expect((await attente()).echecs.length).toBe(1);expect(boite).not.toHaveBeenCalled();
  await expect(factureImpayee(sub,montant,banc.stripe!)).rejects.toThrow();
 });
 it("la révocation et une autre organisation refusent le contexte du même courrier",async()=>{
  await attente();
  const m=(await db.query("select contexte_metier from courriels_durables where organization_id=$1",[org])).rows[0].contexte_metier;
  const verifier=async(o:string,c:unknown)=>(await db.query("select empreinte_metier_courriel($1,$2) e",[o,c])).rows[0].e;
  expect(await verifier(org,m)).toBeTruthy();expect(await verifier(randomUUID(),m)).toBeNull();
  await db.query("update memberships set status='inactive' where organization_id=$1 and account_id=$2",[org,acteur]);
  expect(await verifier(org,m)).toBeNull();
 });
 it("rétractation reçue, exécutée avec montant exact et accusée une seule fois",async()=>{
  const declaration="Je déclare ma rétractation de cet abonnement de démonstration.";
  const declaree=new Date();
  const cle="retractation-"+randomUUID();
  const row=(await db.query("insert into retractations_abonnement(organization_id,subscription_id,nature,cle,texte_declaration,declaree_le,declaree_par,canal,adresse_accuse) values($1,$2,'abonnement',$3,$4,$5,$6,'en_ligne',$7) returning id",[org,sub,cle,declaration,declaree,acteur,to])).rows[0];
  const p={organisationId:org,retractationId:row.id,cle,declaration,declareeLe:declaree,destinataire:to,nature:"abonnement" as const,organisation:"SCI fictive"};
  expect((await envoyerReceptionRetractation(banc.service!,{...p,destinataire:"tiers@example.invalid"})).envoye).toBe(false);
  expect((await envoyerReceptionRetractation(banc.service!,p)).envoye).toBe(true);
  await db.query("update retractations_abonnement set executee_le=now(),montant_rembourse_cents=599 where id=$1",[row.id]);
  const r={...p,essaiFin:null,montantRembourseCents:599,mensualiteCents:null,passageEffectue:false};
  expect((await envoyerAccuseRetractation(banc.service!,r)).envoye).toBe(true);
  expect((await envoyerAccuseRetractation(banc.service!,r)).envoye).toBe(true);
  expect((await db.query("select accuse_envoye_le from retractations_abonnement where id=$1",[row.id])).rows[0].accuse_envoye_le).toBeTruthy();
  expect(boite).toHaveBeenCalledTimes(2);
 });
 it("résiliation prouvée : une seule facture annulée, courrier du bon contrat, reprise après interruption du fournisseur",async()=>{
  // Le courrier a été effectivement livré et marqué par le même circuit que dans le premier scénario.
  await db.query("update abonnements set paiement_en_defaut_depuis=aujourdhui_paris()-45 where organization_id=$1",[org]);
  const episodeLong=(await db.query("select paiement_en_defaut_depuis::text jour from abonnements where organization_id=$1",[org])).rows[0].jour;
  await attente();
  const m=(await db.query("select id,fournisseur_id from courriels_durables where organization_id=$1",[org])).rows[0];
  await db.query("select rapprocher_courriel($1,$2,'livre')",[m.id,m.fournisseur_id]);
  expect((await db.query("select finaliser_courriel_metier($1) ok",[m.id])).rows[0].ok).toBe(true);
  // L’horloge de l’exercice place la preuve il y a 31 jours, uniquement dans cette transaction locale.
  await db.query("update audit_log set details=jsonb_set(details,'{envoyee_le}',to_jsonb(now()-interval '31 days')) where organization_id=$1 and action='relance_paiement_envoyee'",[org]);
  await db.query("update courriels_durables set contexte_metier=jsonb_set(contexte_metier,'{resiliable}',to_jsonb(aujourdhui_paris()-1)) where id=$1",[m.id]);
  const fin=Math.floor(Date.now()/1000)-60;
  await db.query("select abonnement_appliquer($1,$2,'canceled',1,now(),false)",["cus_"+sub,sub]);
  const p={orgId:org,subscription:sub,enDefautDepuis:episodeLong,resilieLe:new Date(fin*1000),destinataire:to,organisation:"SCI fictive"};
  const f={id:"in_123",currency:"eur",status:"open",amount_remaining:montant,customer:"cus_"+sub,parent:{subscription_details:{subscription:sub}}};
  const annuler=vi.fn(async()=>{
    f.status="void"; // Opération enregistrée chez Stripe, puis réponse perdue.
    throw new Error("Réponse interrompue");
  });
  const stripe={subscriptions:{retrieve:async()=>({id:sub,status:"canceled",ended_at:fin,customer:"cus_"+sub,cancellation_details:{reason:"payment_failed"}})},
    invoices:{retrieve:async()=>f,list:async()=>({data:f.status==="open"?[f]:[],has_more:false}),voidInvoice:annuler}} as unknown as Stripe;
  await expect(notifierResiliationImpaye(banc.service!,stripe,p)).rejects.toThrow("interrompue");
  expect(await notifierResiliationImpaye(banc.service!,stripe,p)).toMatchObject({envoye:true,factures:"annulees"});
  expect(annuler).toHaveBeenCalledTimes(1);expect(boite).toHaveBeenCalledTimes(2);
  const journal=await db.query("select details from audit_log where organization_id=$1 and action='abonnement_resiliation_impaye_notifiee'",[org]);
  expect(journal.rows).toHaveLength(1);expect(journal.rows[0].details.factures_annulees).toEqual(["in_123"]);
 });
 it("aucune annulation de facture ni courrier de clôture sans trente jours de notification prouvée",async()=>{
  const annul=vi.fn();
  expect((await notifierResiliationImpaye(banc.service!,{invoices:{voidInvoice:annul}} as never,{orgId:org,subscription:sub,resilieLe:new Date(),destinataire:to,organisation:"SCI fictive",enDefautDepuis:episode})).verification).toBe(true);
  expect(annul).not.toHaveBeenCalled();expect(boite).not.toHaveBeenCalled();expect(jour).toMatch(/^\d{4}/);
 });
});
