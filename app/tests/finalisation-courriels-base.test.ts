import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientSurPg } from './fixtures/supabase-sur-pg';
import { conserverCourriel,reprendreCourriels,identiteCourriel,type ChargeCourriel } from '../src/lib/reprise-courriels';
import { envoyerCourrielDurable } from '../src/lib/courriels-durables';
import { reprendreFinalisationsCourriels } from '../src/lib/finalisation-courriels';
const url=process.env.SUPABASE_DB_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/gerimmo_ci_priorites1')throw new Error('Base fictive isolée obligatoire');
const db=new Client({connectionString:url});const service=clientSurPg(db,{transactionnel:false}) as unknown as SupabaseClient;
const id=async(s:string,p:unknown[]=[]) =>(await db.query(s,p)).rows[0].id as string;
let org:string,bail:string,personne:string,document:string,quittance:string,lot:string;
async function etat(e:string){await db.query("begin");await db.query("update baux set etat=$2::bail_etat where id=$1",[bail,e]);await db.query("update lots set etat=$2::lot_etat where id=$1",[lot,e==='actif'?'loue':'disponible']);await db.query("commit");}
beforeAll(async()=>{
 await db.connect();vi.stubEnv('GERIMMO_PILOTE_LIMITE','false');vi.stubEnv('COURRIELS_CHIFFREMENT_CLE','ab'.repeat(32));
 await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
 org=await id("insert into organizations(name,status,type,quittances_envoi_auto) values('Finalisation fictive','active','agence',true) returning id");
 personne=await id("insert into persons(organization_id,nom,email) values($1,'Locataire fictif','finalisation@example.invalid') returning id",[org]);
 const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Test finalisation','maison','1 rue fictive','69001','Lyon') returning id",[org]);
 lot=await id("insert into lots(organization_id,bien_id,nom,etat,surface_m2,pieces,meuble) values($1,$2,'Lot test','disponible',25,1,true) returning id",[org,bien]);
 document=await id("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Fictif',$1::uuid::text||'/test.pdf','application/pdf',123,repeat('f',64)) returning id",[org]);
 bail=await id("insert into baux(organization_id,lot_id,type,locataire_principal,date_debut,loyer_hc,charges,depot_garantie,charges_mode) values($1,$2,'meuble',$3,'2026-01-01',500,50,500,'provision') returning id",[org,lot,personne]);
 await etat("actif");
 await db.query("update baux set document_signe=$2 where id=$1",[bail,document]);
 const appel=await id("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,'2026-11-01','2026-11-05',500,50,550) returning id",[org,bail]);
 quittance=await id("insert into quittances(organization_id,bail_id,appel_id,montant,est_quittance) values($1,$2,$3,550,true) returning id",[org,bail,appel]);
 await db.query("insert into consentements_documents_locataire(organization_id,person_id,quittances_electroniques,adresse_email) values($1,$2,true,'finalisation@example.invalid')",[org,personne]);
});
afterAll(async()=>{await db.end();vi.unstubAllEnvs();});
const message=(q=false):ChargeCourriel=>({to:'finalisation@example.invalid',subject:'Fictif',html:'<p>Test sans réseau</p>',cleIdempotence:randomUUID(),organisationId:org,contexteMetier:q?{type:'quittance',id:quittance,montant:550,est_quittance:true}:{type:'bail_signe',id:bail,document}});
const ligne=async(p:ChargeCourriel)=>(await db.query('select * from courriels_durables where id=$1',[identiteCourriel(p).id])).rows[0];
const envoyer=async(p:ChargeCourriel,transport=async()=>({id:randomUUID()}))=>{const k=identiteCourriel(p);return envoyerCourrielDurable(service,{cle:k.key,contenu:k.contenu,destinataire:p.to,organisation:org},transport);};
it('bloque un bail redevenu brouillon avant émission différée',async()=>{
 const p=message();await conserverCourriel(service,p);await etat("brouillon");
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();expect((await ligne(p)).finalisation_etat).toBe('a_verifier');
 await etat("actif");
});
it('bloque un changement de destinataire autorisé',async()=>{
 const p=message();await conserverCourriel(service,p);await db.query("update persons set email='autre@example.invalid' where id=$1",[personne]);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();
 await db.query("update persons set email='finalisation@example.invalid' where id=$1",[personne]);
});
it('bloque le retrait de consentement à la quittance',async()=>{
 const p=message(true);await conserverCourriel(service,p);
 await db.query('update consentements_documents_locataire set quittances_electroniques=false where person_id=$1',[personne]);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();expect((await ligne(p)).motif).toMatch(/consentement/);
 await db.query('update consentements_documents_locataire set quittances_electroniques=true where person_id=$1',[personne]);
});
it('bloque un montant devenu périmé',async()=>{
 const p=message(true);await conserverCourriel(service,p);await db.query('update quittances set montant=100 where id=$1',[quittance]);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();
 await db.query('update quittances set montant=550 where id=$1',[quittance]);
});
it('reprend une acceptation interrompue avant finalisation, sans transport',async()=>{
 const p=message();await conserverCourriel(service,p);const k=identiteCourriel(p),token=randomUUID();
 await db.query('select prendre_courriel($1,$2,$3,$4)',[k.id,org,(await ligne(p)).empreinte,token]);
 await db.query("select finir_courriel($1,$2,'accepte',$3)",[k.id,token,randomUUID()]);
 expect((await ligne(p)).finalisation_etat).toBe('en_attente');
 const autre=new Client({connectionString:url});await autre.connect();
 try{
  await autre.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  const service2=clientSurPg(autre,{transactionnel:false}) as unknown as SupabaseClient;
  await Promise.all([reprendreFinalisationsCourriels(service),reprendreFinalisationsCourriels(service2)]);
 }finally{await autre.end();}
 expect((await ligne(p)).finalisation_etat).toBe('terminee');
 const date=(await db.query('select signe_envoye_le from baux where id=$1',[bail])).rows[0].signe_envoye_le;
 for(let i=0;i<3;i++)await db.query('select finaliser_courriel_metier($1)',[k.id]);
 expect((await db.query('select signe_envoye_le from baux where id=$1',[bail])).rows[0].signe_envoye_le).toEqual(date);
 expect((await db.query("select count(*)::int as n from courriels_evenements where courrier_id=$1 and etat='finalisation_terminee'",[k.id])).rows[0].n).toBe(1);
});
it('réponse perdue : conserve l’incertitude et ne finalise ni ne renvoie',async()=>{
 const p=message();await conserverCourriel(service,p);let n=0;
 await envoyer(p,async()=>{n++;throw new Error('réponse perdue');});
 await reprendreCourriels(service,async()=>{n++;return {id:randomUUID()};},async()=>{});
 await reprendreFinalisationsCourriels(service);expect(n).toBe(1);expect((await ligne(p)).etat).toBe('inconnu');expect((await ligne(p)).finalisation_etat).toBe('en_attente');
});
it('expire après plusieurs heures, sans émission',async()=>{
 const p=message();await conserverCourriel(service,p);await db.query("update courriels_durables set expire_le=now()-interval '4 hours' where id=$1",[identiteCourriel(p).id]);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();expect((await ligne(p)).etat).toBe('echec');
});
it('ne peut rattacher un document d’une autre organisation',async()=>{
 const p=message();p.organisationId=await id("insert into organizations(name,status,type) values('Autre organisation fictive','active','agence') returning id");await expect(conserverCourriel(service,p)).rejects.toThrow();
});
it('refuse une reprise ancienne sans descripteur métier',async()=>{
 const p=message();delete p.contexteMetier;await conserverCourriel(service,p);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();expect((await ligne(p)).finalisation_etat).toBe('a_verifier');
});
it('finalise une quittance acceptée et ne refait pas son envoi',async()=>{
 const p=message(true);await conserverCourriel(service,p);const send=vi.fn(async()=>({id:randomUUID()}));
 await envoyer(p,send);await envoyer(p,send);expect(send).toHaveBeenCalledTimes(1);expect((await ligne(p)).finalisation_etat).toBe('terminee');
 expect((await db.query('select email_envoye_at from quittances where id=$1',[quittance])).rows[0].email_envoye_at).toBeTruthy();
});
it('les RPC de validation et finalisation restent interdites aux utilisateurs',async()=>{
 await db.query('set role authenticated');
 try{await expect(db.query("select finaliser_courriel_metier('x')")).rejects.toThrow(/permission/);await expect(db.query("select verifier_contexte_courriel('x')")).rejects.toThrow(/permission/);}
 finally{await db.query('reset role');}
});

it('bloque une personne archivée avant la reprise',async()=>{
 const p=message();await conserverCourriel(service,p);await db.query('update persons set archived_at=now() where id=$1',[personne]);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();expect((await ligne(p)).finalisation_etat).toBe('a_verifier');
 await db.query('update persons set archived_at=null where id=$1',[personne]);
});
it('isole une finalisation acceptée devenue périmée au lieu de marquer le nouveau document',async()=>{
 const p=message();await conserverCourriel(service,p);const k=identiteCourriel(p),token=randomUUID();
 await db.query('select prendre_courriel($1,$2,$3,$4)',[k.id,org,(await ligne(p)).empreinte,token]);
 await db.query("select finir_courriel($1,$2,'accepte',$3)",[k.id,token,randomUUID()]);
 await db.query("update documents set empreinte=repeat('a',64) where id=$1",[document]);
 await reprendreFinalisationsCourriels(service);expect((await ligne(p)).etat).toBe('accepte');expect((await ligne(p)).finalisation_etat).toBe('a_verifier');
 await db.query("update documents set empreinte=repeat('f',64) where id=$1",[document]);
});

it('reprend une panne SQL de finalisation après acceptation sans réémettre',async()=>{
 const p=message();await conserverCourriel(service,p);const k=identiteCourriel(p);let n=0;
 const panne={rpc:async(nom:string,args:Record<string,unknown>)=>nom==='finaliser_courriel_metier'?{data:null,error:{message:'panne simulée'}}:service.rpc(nom,args)} as unknown as SupabaseClient;
 const r=await envoyerCourrielDurable(panne,{cle:k.key,contenu:k.contenu,destinataire:p.to,organisation:org},async()=>{n++;return {id:randomUUID()};});
 expect(r.finalisationEnAttente).toBe(true);expect((await ligne(p)).etat).toBe('accepte');
 await reprendreFinalisationsCourriels(service);await envoyer(p,async()=>{n++;return {id:randomUUID()};});
 expect(n).toBe(1);expect((await ligne(p)).finalisation_etat).toBe('terminee');
});
it('retire l’autorisation différée si les droits de l’émetteur sont retirés',async()=>{
 const acteur=await id(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
 values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',gen_random_uuid()||'@example.invalid','x',now(),'{}','{}',now(),now(),'','','','','') returning id`);
 await db.query("insert into accounts(id,email) values($1,$1::uuid::text||'@example.invalid') on conflict do nothing",[acteur]);
 await db.query("insert into memberships(account_id,organization_id,role,status) values($1,$2,'admin_agence','active')",[acteur,org]);
 const p=message();p.contexteMetier={...p.contexteMetier!,acteur};await conserverCourriel(service,p);
 await db.query("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[acteur,org]);
 const send=vi.fn();await reprendreCourriels(service,send,async()=>{});expect(send).not.toHaveBeenCalled();expect((await ligne(p)).finalisation_etat).toBe('a_verifier');
});
