import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
const url=process.env.SUPABASE_DB_URL;verifierBaseDeTest(url);
describe.skipIf(!url)("commande AR24 durable, sans envoi externe",()=>{
 let db:Client,org:string,autre:string,compte:string,etranger:string,locataire:string,personne:string,bail:string,id:string,dette:unknown;
 async function user(){const x=randomUUID();await db.query("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())",[x,`${x}@test.local`]);return x;}
 async function agir(x:string,role="authenticated"){await db.query("reset role");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:x,role,aal:"aal2"})]);await db.query(`set local role ${role}`);}
 async function refus(fn:()=>Promise<unknown>){await db.query("savepoint refus");try{await fn();return "";}catch(e){await db.query("rollback to savepoint refus");return(e as Error).message;}}
 async function prepare(cible=bail,orgId=org,commande=id,remplace:string|null=null){return(await db.query("select preparer_recommande_ar24($1,$2,$3,'<p>Courrier de test</p>',$4,$5,15,'sandbox',$6) r",[commande,orgId,cible,"a".repeat(64),dette,remplace])).rows[0].r;}
 async function reserve(empreinte="a".repeat(64),tarif=100,email="test@example.test"){return(await db.query("select reserver_recommande_ar24($1,$2,$3,$4,$5) r",[org,id,empreinte,email,tarif])).rows[0].r;}
 async function suivi(statut="envoye",ar24:number|null=123,preuves:{type:string;url:string}[]=[]){return(await db.query("select enregistrer_suivi_ar24($1,$2,$3,$4,$5) r",[org,id,ar24,statut,JSON.stringify(preuves)])).rows[0].r;}
 beforeAll(async()=>{db=new Client({connectionString:url});await db.connect();});
 beforeEach(async()=>{
  await db.query("begin");await db.query("reset role");compte=await user();etranger=await user();locataire=await user();
  [org,autre]=(await db.query("insert into organizations(name,type,status,essai_fin) values('TEST AR24','proprietaire_direct','essai',public.aujourdhui_paris()+30),('TEST étranger','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows.map(r=>r.id);
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct'),($5,$2,'locataire')",[compte,org,etranger,autre,locataire]);
  const bien=(await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST Bien','appartement','1 rue Test','75001','Paris') returning id",[org])).rows[0].id;
  const lot=(await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Lot','loue') returning id",[org,bien])).rows[0].id;
  personne=(await db.query("insert into persons(organization_id,nom,prenom,email,account_id) values($1,'Test','Léa','test@example.test',$2) returning id",[org,locataire])).rows[0].id;
  bail=(await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,'nu','actif',public.aujourdhui_paris()-90,750,50,5) returning id",[org,lot,personne])).rows[0].id;
  await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,date_trunc('month',public.aujourdhui_paris())::date,public.aujourdhui_paris()-1,750,50,800)",[org,bail]);
  await db.query("insert into connexions_ar24(organization_id,environnement,expediteur_id,tarif_ttc_centimes,actif) values($1,'sandbox',42,100,true)",[org]);
  await agir(locataire);await db.query("select modifier_consentement_document($1,'recommandes',true,'test@example.test')",[org]);
  await agir(compte);dette=(await db.query("select dette_recommande_ar24($1) r",[bail])).rows[0].r;id=randomUUID();
 });
 afterEach(async()=>{await db.query("rollback");});afterAll(async()=>{await db?.end();});
 it("réserve une seule fois et fige le destinataire, le coût et le solde",async()=>{
  const p=await prepare();expect(p.destinataire).toEqual({email:"test@example.test",prenom:"Léa",nom:"Test"});expect(p.dette.total_centimes).toBe(80000);
  expect((await reserve()).reserve).toBe(true);expect((await reserve()).reserve).toBe(false);
  expect((await db.query("select recommande_ar24_poursuite_bloquee($1,public.aujourdhui_paris()-1) r",[bail])).rows[0].r).toBe(true);
  expect((await prepare(bail,org,randomUUID())).id).toBe(id);
  await db.query("reset role");expect((await db.query("select * from audit_log where organization_id=$1 and action='recommande_ar24_confirme'",[org])).rowCount).toBe(1);
 });
 it("refuse les comptes tiers et la falsification directe du statut fournisseur",async()=>{
  await prepare();expect(await refus(()=>suivi())).toContain("permission denied");
  expect(await refus(()=>db.query("update recommandes_ar24 set statut='envoye' where id=$1",[id]))).toContain("permission denied");
  await agir(etranger);expect((await db.query("select * from recommandes_ar24 where id=$1",[id])).rowCount).toBe(0);expect(await refus(()=>prepare())).toContain("Accès refusé");expect(await refus(()=>prepare(bail,autre))).toContain("Bail inaccessible");
  await agir(locataire);expect((await db.query("select * from recommandes_ar24 where id=$1",[id])).rowCount).toBe(0);expect(await refus(()=>reserve())).toContain("Accès refusé");
 });
 it("revalide l’accord, l’adresse et le tarif au dernier moment",async()=>{
  await prepare();expect(await refus(()=>reserve("b".repeat(64)))).toContain("Relisez");expect(await refus(()=>reserve(undefined,200))).toContain("Relisez");
  await agir(locataire);await db.query("select modifier_consentement_document($1,'recommandes',false,'test@example.test')",[org]);await agir(compte);expect(await refus(()=>reserve())).toContain("accord");
  await agir(locataire);await db.query("select modifier_consentement_document($1,'recommandes',true,'test@example.test')",[org]);await db.query("reset role");await db.query("update persons set email='autre@example.test' where id=$1",[personne]);await agir(compte);expect(await refus(()=>reserve())).toContain("destinataire");
 });
 it("un paiement après préparation arrête l’envoi et permet de refaire le document",async()=>{
  await prepare();await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,200,public.aujourdhui_paris(),'virement')",[org,bail]);
  expect(await refus(()=>reserve())).toContain("règlements ont changé");dette=(await db.query("select dette_recommande_ar24($1) r",[bail])).rows[0].r;expect((await prepare()).dette.total_centimes).toBe(60000);expect((await reserve()).reserve).toBe(true);
 });
 it("une issue inconnue bloque toute seconde commande même si le solde évolue",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");await suivi("a_verifier",null);await agir(compte);
  await db.query("insert into encaissements(organization_id,bail_id,montant,date_paiement,mode) values($1,$2,200,public.aujourdhui_paris(),'virement')",[org,bail]);dette=(await db.query("select dette_recommande_ar24($1) r",[bail])).rows[0].r;
  const r=await prepare(bail,org,randomUUID());expect(r.id).toBe(id);expect(r.statut).toBe("a_verifier");expect((await reserve()).reserve).toBe(false);
 });
 it("un brouillon AR24 n’est pas envoyé et une réception ne régresse pas",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");expect((await suivi("a_authentifier")).statut).toBe("a_authentifier");expect((await suivi("recu")).statut).toBe("recu");expect((await suivi("en_attente")).statut).toBe("recu");expect(await refus(()=>suivi("envoye",456))).toContain("référence inaccessible");
 });
 it("conserve les preuves précédentes quand le fournisseur renvoie seulement la nouvelle",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");
  const depot={type:"depot",url:"https://sandbox.ar24.fr/get/proof/depot"};
  const envoi={type:"envoi",url:"https://sandbox.ar24.fr/get/proof/envoi"};
  const reception={type:"reception",url:"https://sandbox.ar24.fr/get/proof/reception"};
  await suivi("en_attente",123,[depot]);await suivi("envoye",123,[envoi]);
  expect((await suivi("recu",123,[reception])).preuves).toEqual([depot,envoi,reception]);
  const receptionActualisee={...reception,url:"https://sandbox.ar24.fr/get/proof/reception-actualisee"};
  expect((await suivi("recu",123,[receptionActualisee])).preuves).toEqual([depot,envoi,receptionActualisee]);
 });
 it("l’absence de configuration ou de consentement ne prépare rien",async()=>{
  await db.query("reset role");await db.query("update connexions_ar24 set actif=false where organization_id=$1",[org]);await agir(compte);expect(await refus(()=>prepare())).toContain("configuré");
  await db.query("reset role");await db.query("update connexions_ar24 set actif=true where organization_id=$1",[org]);await agir(locataire);await db.query("select modifier_consentement_document($1,'recommandes',false,'test@example.test')",[org]);await agir(compte);expect(await refus(()=>prepare())).toContain("accepter");
 });
 it("ne permet une reprise explicite qu’après attestation de l’échec définitif",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");await suivi("echec");await agir(compte);
  expect(await refus(()=>db.query("select attester_echec_definitif_ar24($1,$2,'Confirmation AR24 TEST-123')",[org,id]))).toContain("permission denied");
  expect((await prepare(bail,org,randomUUID(),id)).id).toBe(id);
  await agir(compte,"service_role");await db.query("select attester_echec_definitif_ar24($1,$2,'Confirmation AR24 TEST-123')",[org,id]);await agir(compte);
  const precedent=id, nouveau=randomUUID();const reprise=await prepare(bail,org,nouveau,precedent);
  expect(reprise.id).toBe(nouveau);expect(reprise.remplace_id).toBe(precedent);expect(reprise.statut).toBe("prepare");expect(reprise.confirme_le).toBeNull();
  expect((await prepare(bail,org,randomUUID(),precedent)).id).toBe(nouveau);
  await db.query("reset role");await db.query("update recommandes_ar24 set actualise_le=now()-interval '1 hour' where id=$1",[nouveau]);await agir(compte);
  const actualisee=await prepare(bail,org,nouveau,precedent);expect(new Date(actualisee.actualise_le).getTime()).toBeGreaterThan(Date.now()-60000);
  id=nouveau;expect((await reserve()).reserve).toBe(true);expect((await reserve()).reserve).toBe(false);
  await agir(compte,"service_role");await suivi("echec",456);await db.query("select attester_echec_definitif_ar24($1,$2,'Confirmation AR24 TEST-456')",[org,id]);await agir(compte);
  const suivante=await prepare(bail,org,randomUUID(),nouveau);expect(suivante.remplace_id).toBe(nouveau);expect(suivante.id).not.toBe(nouveau);
 });
 it("une issue ambiguë ou une preuve d’envoi interdit l’attestation de reprise",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");await suivi("a_verifier",null);
  expect(await refus(()=>db.query("select attester_echec_definitif_ar24($1,$2,'Confirmation AR24 TEST-123')",[org,id]))).toContain("Aucune reprise");
  await suivi("echec",123,[{type:"envoi",url:"https://sandbox.ar24.fr/get/proof/ev-123"}]);
  expect(await refus(()=>db.query("select attester_echec_definitif_ar24($1,$2,'Confirmation AR24 TEST-123')",[org,id]))).toContain("Aucune reprise");
 });
 it("recontrôle l’ancien courrier juste avant d’envoyer la reprise",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");await suivi("echec");
  await db.query("select attester_echec_definitif_ar24($1,$2,'Confirmation AR24 TEST-123')",[org,id]);await agir(compte);
  const ancien=id;id=randomUUID();await prepare(bail,org,id,ancien);
  await db.query("reset role");await db.query("update recommandes_ar24 set statut='a_verifier' where id=$1",[ancien]);await agir(compte);
  expect(await refus(()=>reserve())).toContain("vérification du précédent courrier a changé");
 });
 it("le retour conservateur ferme les envois atomiquement, conserve les preuves et se rejoue",async()=>{
  await prepare();await reserve();await agir(compte,"service_role");await suivi("envoye",123,[{type:"envoi",url:"https://sandbox.ar24.fr/get/proof/ev-123"}]);
  await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");
  const retour=readFileSync("supabase/retours-arriere/20261028150004_recommandes_ar24_durables.retour.sql","utf8");
  const migration=readFileSync("supabase/migrations/20261028150004_recommandes_ar24_durables.sql","utf8");
  const avant=(await db.query("select to_jsonb(r) r from recommandes_ar24 r where id=$1",[id])).rows[0].r;
  expect(await refus(()=>db.query(retour+"select 1/0;"))).toContain("division by zero");
  expect((await db.query("select actif from connexions_ar24 where organization_id=$1",[org])).rows[0].actif).toBe(true);
  await db.query(retour);await db.query(retour);
  expect((await db.query("select actif from connexions_ar24 where organization_id=$1",[org])).rows[0].actif).toBe(false);
  expect((await db.query("select pg_get_functiondef('dette_recommande_ar24(uuid)'::regprocedure) definition")).rows[0].definition).not.toContain("aujourdhui_paris");
  expect(await refus(()=>db.query("select dette_recommande_ar24($1)",[bail]))).toContain("désactivés");
  await agir(compte);expect(await refus(()=>prepare())).toContain("permission denied");
  await db.query("reset role");await db.query("select set_config('request.jwt.claims','',true)");
  await db.query(migration);await db.query(migration);
  expect((await db.query("select to_jsonb(r) r from recommandes_ar24 r where id=$1",[id])).rows[0].r).toEqual(avant);
  expect((await db.query("select actif from connexions_ar24 where organization_id=$1",[org])).rows[0].actif).toBe(false);
  await agir(compte);expect((await db.query("select dette_recommande_ar24($1) r",[bail])).rows[0].r.total_centimes).toBe(80000);
 });

});
