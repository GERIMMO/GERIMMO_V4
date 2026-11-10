import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {clientSurPg} from './fixtures/supabase-sur-pg';
import {empreinteCourriel} from '../src/lib/courriels-durables';
import {conserverCourriel,identiteCourriel,reprendreCourriels,type ChargeCourriel} from '../src/lib/reprise-courriels';
import {verifierContexteCourriel} from '../src/lib/finalisation-courriels';
const shared=vi.hoisted(()=>({service:null as unknown}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>shared.service}));
vi.mock('@/lib/marque-organisation-serveur',()=>({chargerMarque:async()=>null}));
import {envoyerEmail,envoyerEmailTransport} from '../src/lib/email';
const url=process.env.SUPABASE_DB_URL;
if(!url||new URL(url).hostname!=='127.0.0.1'||!['/gerimmo_ci_priorites1','/gerimmo_ci_sql','/gerimmo_ci_vun'].includes(new URL(url).pathname))throw Error('Base fictive locale obligatoire');
const db=new Client({connectionString:url});
const service=clientSurPg(db,{transactionnel:true}) as unknown as SupabaseClient;
let org:string,owner:string,tenant:string,person:string,inv:string,artisanInv:string,token:string,email:string;
const q=async(sql:string,p:unknown[]=[]) =>(await db.query(sql,p)).rows;
const id=async(sql:string,p:unknown[]=[]) =>(await q(sql,p))[0].id as string;
const hash=empreinteCourriel;
const transport=vi.fn();
beforeAll(async()=>{await db.connect();});
afterAll(async()=>{await db.end();});
beforeEach(async()=>{
 await db.query('begin');await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
 vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');vi.stubEnv('COURRIELS_CHIFFREMENT_CLE','cd'.repeat(32));vi.stubEnv('RESEND_API_KEY','fictif-sans-service');
 shared.service=service;transport.mockReset().mockResolvedValue(new Response(JSON.stringify({id:'fictif-'+randomUUID()}),{status:200}));vi.stubGlobal('fetch',transport);
 token=randomUUID();email=randomUUID()+'@example.invalid';
 owner=await id("insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,'fictif',now(),'{}','{}') returning id",[randomUUID()+'@example.invalid']);
 tenant=await id("insert into auth.users(id,email,encrypted_password,email_confirmed_at,recovery_token,recovery_sent_at,confirmation_token,confirmation_sent_at,raw_app_meta_data,raw_user_meta_data) values(gen_random_uuid(),$1,'fictif',now(),$2,now(),$2,now(),'{}','{}') returning id",[email,token]);
 org=await id("insert into organizations(name,type,status) values('SCI Lot2 fictive','proprietaire_direct','active') returning id");
 await q("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[owner,org]);
 person=await id("insert into persons(organization_id,nom,email) values($1,'Locataire fictif',$2) returning id",[org,email]);
 inv=await id("insert into invitations_locataires(organization_id,person_id,account_id,email,cree_par) values($1,$2,$3,$4,$5) returning id",[org,person,tenant,email,owner]);
 artisanInv=await id("insert into invitations_artisans(organization_id,email,cree_par) values($1,$2,$3) returning id",[org,email,owner]);
});
afterEach(async()=>{await db.query('rollback');vi.unstubAllEnvs();vi.unstubAllGlobals();});
function acces(invite=false):ChargeCourriel{return {to:email,subject:'Accès fictif',html:`<p>Jeton fictif ${token}</p>`,cleIdempotence:'acces-'+hash(token),...(invite?{organisationId:org}:{}),contexteMetier:{type:'acces',id:tenant,usage:'recovery',jeton_empreinte:hash(token),...(invite?{invitation:inv,acteur:owner}:{})}};}
const row=async(p:ChargeCourriel)=>(await q('select * from courriels_durables where id=$1',[identiteCourriel(p).id]))[0];
async function send(p:ChargeCourriel){return envoyerEmail({...p,...(p.organisationId?{organisation:{db:service,id:p.organisationId}}:{})});}
async function retry(){return reprendreCourriels(service,(p,ref)=>envoyerEmailTransport({...p,referenceInterne:ref,cleIdempotence:p.cleIdempotence,...(p.organisationId?{organisation:{db:service,id:p.organisationId}}:{})}),async()=>{});}
it('fabrique un contexte sans exposer le jeton dans les métadonnées',async()=>{
 const r=await service.rpc('contexte_acces_courriel',{p_email:hash(email),p_jeton:hash(token),p_usage:'recovery',p_org:null,p_invitation:null,p_acteur:null});
 expect(r.error).toBeNull();expect(r.data).toMatchObject({type:'acces',id:tenant});expect(JSON.stringify(r.data)).not.toContain(token);
});
it('conserve chiffré puis accepte et finalise un accès sans second transport',async()=>{
 const p=acces();await conserverCourriel(service,p);const m=await row(p);expect(m.charge_chiffree).not.toContain(token);expect(JSON.stringify(m.contexte_metier)).not.toContain(token);
 expect(await send(p)).toMatchObject({id:expect.any(String),finalisationEnAttente:false});await send(p);expect(transport).toHaveBeenCalledTimes(1);expect((await row(p)).charge_chiffree).toBeNull();
});
it.each(['recovery','signup'] as const)('bloque un jeton %s remplacé avant la reprise',async usage=>{
 const p=acces();if(p.contexteMetier?.type==='acces')p.contexteMetier.usage=usage;await conserverCourriel(service,p);
 await q(`update auth.users set ${usage==='signup'?'confirmation_token':'recovery_token'}=$2 where id=$1`,[tenant,randomUUID()]);await retry();expect(transport).not.toHaveBeenCalled();expect((await row(p)).finalisation_etat).toBe('a_verifier');
});
it.each(['expire','consomme','adresse','banni','mot_de_passe'])('bloque un accès devenu invalide : %s',async cas=>{
 const p=acces();await conserverCourriel(service,p);
 const sql:Record<string,string>={expire:"recovery_sent_at=now()-interval '2 hours'",consomme:"recovery_token=''",adresse:"email='autre@example.invalid'",banni:"banned_until=now()+interval '1 day'",mot_de_passe:"encrypted_password='nouveau'"};
 await q(`update auth.users set ${sql[cas]} where id=$1`,[tenant]);await retry();expect(transport).not.toHaveBeenCalled();
});
it.each(['annulee','expiree','acceptee','refusee'])('ne reprend pas une invitation locataire %s',async etat=>{
 const p=acces(true);await conserverCourriel(service,p);await q('update invitations_locataires set etat=$2 where id=$1',[inv,etat]);await retry();expect(transport).not.toHaveBeenCalled();
});
it('revérifie les droits de celui qui invite',async()=>{
 const p=acces(true);await conserverCourriel(service,p);await q("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[owner,org]);await retry();expect(transport).not.toHaveBeenCalled();
});
it('ne peut pas rattacher le message à une autre organisation',async()=>{
 const p=acces(true);p.organisationId=await id("insert into organizations(name,status) values('Autre fictive','active') returning id");
 await expect(conserverCourriel(service,p)).rejects.toThrow('Validation métier');expect(transport).not.toHaveBeenCalled();
});
it('finalise une invitation acceptée par le prestataire, même si le lien est déjà consommé, sans redonner accès',async()=>{
 const p=acces(true);await conserverCourriel(service,p);const k=identiteCourriel(p),lease=randomUUID();
 await q('select prendre_courriel($1,$2,$3,$4)',[k.id,org,hash(k.contenu),lease]);await q("select finir_courriel($1,$2,'accepte','provider-fictif')",[k.id,lease]);
 await q("update auth.users set recovery_token='' where id=$1",[tenant]);
 for(let n=0;n<3;n++)expect((await q('select finaliser_courriel_metier($1) ok',[k.id]))[0].ok).toBe(true);
 expect((await q('select envoye_le from invitations_locataires where id=$1',[inv]))[0].envoye_le).not.toBeNull();
 expect(await q('select * from memberships where account_id=$1 and organization_id=$2',[tenant,org])).toHaveLength(0);expect(transport).not.toHaveBeenCalled();
});
it('reprend un refus récupérable sans changer de jeton ni de destinataire',async()=>{
 const p=acces();transport.mockResolvedValueOnce(new Response('limite',{status:429}));await send(p);expect((await row(p)).etat).toBe('en_attente');
 await q("update courriels_durables set reprendre_apres=now() where id=$1",[identiteCourriel(p).id]);await retry();expect(transport).toHaveBeenCalledTimes(2);expect((await row(p)).etat).toBe('accepte');
});
it('réponse perdue : aucun renvoi après interruption ni après 24h',async()=>{
 const p=acces();transport.mockRejectedValueOnce(Error('réponse perdue'));expect(await send(p)).toMatchObject({incertain:true});
 await q("update courriels_durables set updated_at=now()-interval '25 hours' where id=$1",[identiteCourriel(p).id]);await retry();await send(p);expect(transport).toHaveBeenCalledTimes(1);expect((await row(p)).etat).toBe('inconnu');
});
it('invitation artisan : annulation interdit un envoi différé',async()=>{
 const p:ChargeCourriel={to:email,subject:'Invitation',html:'Invitation fictive',organisationId:org,contexteMetier:{type:'invitation_artisan',id:artisanInv,acteur:owner}};
 await conserverCourriel(service,p);await q("update invitations_artisans set etat='annulee' where id=$1",[artisanInv]);expect(await verifierContexteCourriel(service,identiteCourriel(p).id)).toHaveProperty('erreur');await retry();expect(transport).not.toHaveBeenCalled();
});
it('invitation artisan : preuve d’acceptation persistante, sans accorder de mission',async()=>{
 const p:ChargeCourriel={to:email,subject:'Invitation',html:'Invitation fictive',organisationId:org,contexteMetier:{type:'invitation_artisan',id:artisanInv,acteur:owner}};
 await send(p);await send(p);expect(transport).toHaveBeenCalledTimes(1);expect((await q('select etat,envoye_le from invitations_artisans where id=$1',[artisanInv]))[0]).toMatchObject({etat:'en_attente',envoye_le:expect.any(Date)});
});
it('notification locataire : les droits sont relus et les messages lus ne sont plus envoyés',async()=>{
 await q("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[tenant,org]);await q('update persons set account_id=$2 where id=$1',[person,tenant]);
 const msg=await id("insert into messages(organization_id,person_id,auteur,auteur_account_id,texte) values($1,$2,'gerant',$3,'Réponse fictive') returning id",[org,person,owner]);
 const p:ChargeCourriel={to:email,subject:'Réponse',html:'Connectez-vous',organisationId:org,contexteMetier:{type:'notification',id:msg,evenement:'reponse_gestionnaire',role:'locataire'}};
 await conserverCourriel(service,p);await q('update messages set lu_le=now() where id=$1',[msg]);await retry();expect(transport).not.toHaveBeenCalled();
});
it('notification propriétaire : incident modifié entre préparation et envoi',async()=>{
 const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Fictif','maison','1 test','69001','Lyon') returning id",[org]);
 const lot=await id("insert into lots(organization_id,bien_id,nom) values($1,$2,'Lot test') returning id",[org,bien]);
 const incident=await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description) values($1,$2,'LOT2-FICTIF','agence','plomberie_canalisation','Fuite fictive') returning id",[org,lot]);
 const ownerEmail=(await q('select email from accounts where id=$1',[owner]))[0].email;
 const p:ChargeCourriel={to:ownerEmail,subject:'Incident',html:'Fuite',organisationId:org,contexteMetier:{type:'notification',id:incident,evenement:'incident_urgent',role:'agence'}};
 await conserverCourriel(service,p);await q("update incidents set description='Résolu' where id=$1",[incident]);await retry();expect(transport).not.toHaveBeenCalled();
});
it('refuse la fabrique privilégiée à une session utilisateur',async()=>{
 await db.query('savepoint droits');await db.query('set local role authenticated');
 await expect(q("select contexte_acces_courriel('x','y','recovery',null,null,null)")).rejects.toThrow(/permission/);await db.query('rollback to savepoint droits');
});
it.each(['adresse','droits','banni'])('notification différée bloquée après changement du destinataire : %s',async cas=>{
 await q("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[tenant,org]);await q('update persons set account_id=$2 where id=$1',[person,tenant]);
 const msg=await id("insert into messages(organization_id,person_id,auteur,auteur_account_id,texte) values($1,$2,'gerant',$3,'Réponse fictive') returning id",[org,person,owner]);
 const p:ChargeCourriel={to:email,subject:'Réponse',html:'Connectez-vous',organisationId:org,contexteMetier:{type:'notification',id:msg,evenement:'reponse_gestionnaire',role:'locataire'}};
 await conserverCourriel(service,p);
 if(cas==='adresse')await q("update auth.users set email='remplace@example.invalid' where id=$1",[tenant]);
 if(cas==='banni')await q("update auth.users set banned_until=now()+interval '1 day' where id=$1",[tenant]);
 if(cas==='droits')await q("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[tenant,org]);
 await retry();expect(transport).not.toHaveBeenCalled();expect((await row(p)).finalisation_etat).toBe('a_verifier');
});
it('notification valide acceptée une seule fois et finalisée sans déclarer une livraison',async()=>{
 await q("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[tenant,org]);await q('update persons set account_id=$2 where id=$1',[person,tenant]);
 const msg=await id("insert into messages(organization_id,person_id,auteur,auteur_account_id,texte) values($1,$2,'gerant',$3,'Réponse fictive') returning id",[org,person,owner]);
 const p:ChargeCourriel={to:email,subject:'Réponse',html:'Connectez-vous',organisationId:org,contexteMetier:{type:'notification',id:msg,evenement:'reponse_gestionnaire',role:'locataire'}};
 await send(p);await send(p);expect(transport).toHaveBeenCalledTimes(1);expect(await row(p)).toMatchObject({etat:'accepte',finalisation_etat:'terminee'});
});
it('finalisation : une invitation dont le destinataire a changé reste à vérifier sans réémettre',async()=>{
 const p=acces(true);await conserverCourriel(service,p);const k=identiteCourriel(p),lease=randomUUID();
 await q('select prendre_courriel($1,$2,$3,$4)',[k.id,org,hash(k.contenu),lease]);await q("select finir_courriel($1,$2,'accepte','provider-fictif')",[k.id,lease]);
 await q("update invitations_locataires set email='nouveau@example.invalid' where id=$1",[inv]);
 expect((await q('select finaliser_courriel_metier($1) ok',[k.id]))[0].ok).toBe(false);
 expect(await row(p)).toMatchObject({etat:'accepte',finalisation_etat:'a_verifier'});await retry();expect(transport).not.toHaveBeenCalled();
});
it.each(['proposee','acceptee','refusee'])('notification de mission %s : destinataire autorisé et émission unique',async statut=>{
 const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Fictif','maison','1 test','69001','Lyon') returning id",[org]);
 const lot=await id("insert into lots(organization_id,bien_id,nom) values($1,$2,'Lot test') returning id",[org,bien]);
 const incident=await id("insert into incidents(organization_id,lot_id,numero,canal,categorie,description) values($1,$2,'LOT2-MISSION','agence','plomberie_canalisation','Fuite fictive') returning id",[org,lot]);
 const artisan=await id("insert into artisans(account_id,raison_sociale,siret,telephone,email,statut_plateforme,siret_etat) values($1,'Artisan fictif',lpad((random()*10^13)::bigint::text,14,'0'),'0600000000',$2,'valide','verifie') returning id",[tenant,email]);
 const mission=await id("insert into incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut,refus_motif) values($1,$2,$3,'entretien_courant',$4,'Indisponibilité fictive') returning id",[org,incident,artisan,statut]);
 const to=statut==='proposee'?email:(await q('select email from auth.users where id=$1',[owner]))[0].email;
 const p:ChargeCourriel={to,subject:'Mission fictive',html:'Connectez-vous',organisationId:org,contexteMetier:{type:'notification',id:mission,evenement:statut==='proposee'?'mission_confiee':statut==='acceptee'?'mission_acceptee':'mission_refusee',role:statut==='proposee'?'artisan':'agence'}};
 expect(await send(p)).toMatchObject({id:expect.any(String)});await send(p);expect(transport).toHaveBeenCalledTimes(1);
});
