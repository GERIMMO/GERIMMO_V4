import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import { clientSurPg } from './fixtures/supabase-sur-pg';
import { alerterSuperviseurDuPost } from '../src/lib/alerte-veto-marketing';
import { envoyerEmail } from '../src/lib/email';
import { traiterNotificationCapturee } from '../src/lib/notifications-transactionnelles';
import { conserverCourriel, identiteCourriel } from '../src/lib/reprise-courriels';
import { verifierContexteCourriel } from '../src/lib/finalisation-courriels';

const url=process.env.GERIMMO_ALERTES_TEST_DB ?? process.env.SUPABASE_DB_URL;
if(!url || new URL(url).hostname!=='127.0.0.1' || !new URL(url).pathname.startsWith('/gerimmo_ci_'))
 throw Error('Les alertes doivent être vérifiées sur PostgreSQL local de recette.');
const db=new Client({connectionString:url});
const q=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows;
const id=async(sql:string,args:unknown[]=[]) => (await q(sql,args))[0].id as string;
const partage=vi.hoisted(()=>({service:null as unknown}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>partage.service}));
vi.mock('@/lib/marque-organisation-serveur',()=>({chargerMarque:async()=>null}));
const service=clientSurPg(db,{transactionnel:true}) as unknown as SupabaseClient;
const boite:{to:string[];subject:string;html:string;attachments?:unknown[]}[]=[];
const serveur=createServer(async(req,res)=>{
 const morceaux:Buffer[]=[]; for await(const m of req) morceaux.push(m);
 const courrier=JSON.parse(Buffer.concat(morceaux).toString());
 if(!courrier.to?.every((to:string)=>to.endsWith('@example.invalid'))) {res.writeHead(400);res.end();return;}
 boite.push(courrier); res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:randomUUID()}));
});
beforeAll(async()=>{
 await db.connect();partage.service=service;
 await new Promise<void>(r=>serveur.listen(0,'127.0.0.1',r));
});
afterAll(async()=>{
 await db.end(); await new Promise<void>(r=>serveur.close(()=>r()));
});
async function sessionService(){
 await q('reset role');
 await q(`select set_config('request.jwt.claims','{"role":"service_role"}',true)`);
}
async function session(uid:string){
 await q('reset role');
 await q("select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',$1::text,'aal','aal2')::text,true)",[uid]);
 await q('set local role authenticated');
}
beforeEach(async()=>{
 await q('begin');await sessionService();boite.length=0;
 vi.stubEnv('RESEND_API_KEY','cle-fictive');vi.stubEnv('COURRIELS_CHIFFREMENT_CLE','71'.repeat(32));
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://localhost:3100');
 const loopback=globalThis.fetch, port=(serveur.address() as AddressInfo).port;
 vi.stubGlobal('fetch',(url:string,init:RequestInit)=>{
  if(url!=='https://api.resend.com/emails')throw Error('Seule la boîte fictive est autorisée');
  return loopback('http://127.0.0.1:'+port+'/emails',init);
 });
});
afterEach(async()=>{await q('rollback');vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function compte(){
 const email=randomUUID()+'@example.invalid';
 return {email,id:await id("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values(gen_random_uuid(),$1,'x',now()) returning id",[email])};
}
it('reçoit une seule alerte quotidienne, refuse le non-habilité puis la reprise après révocation',async()=>{
 const chef=await compte(),autre=await compte();
 await q("insert into memberships(account_id,role) values($1,'super_admin')",[chef.id]);
 vi.stubEnv('GERIMMO_RELAIS_EMAILS',[chef.email,autre.email].join(','));
 const jour=(await q("insert into relais_alertes_envois(jour) values(aujourdhui_paris()) on conflict(jour) do update set statut='en_cours' returning jour::text"))[0].jour;
 const p={to:chef.email,subject:'Suivi Gerimmo',html:'Consultez le relais.',contexteMetier:{type:'alerte_direction' as const,categorie:'quotidienne' as const,id:jour},cleIdempotence:'relais-'+jour};
 expect(await envoyerEmail(p)).toMatchObject({id:expect.any(String),finalisationEnAttente:false});
 expect(await envoyerEmail(p)).toMatchObject({id:expect.any(String),finalisationEnAttente:false});
 expect(await envoyerEmail({...p,to:autre.email})).toHaveProperty('erreur');
 expect(boite).toHaveLength(1);expect(boite[0].to).toEqual([chef.email]);
 const attente={...p,cleIdempotence:randomUUID()};
 await conserverCourriel(service,attente);
 await q("update memberships set status='inactive' where account_id=$1 and role='super_admin'",[chef.id]);
 expect(await verifierContexteCourriel(service,identiteCourriel(attente).id)).toHaveProperty('erreur');
 expect(await envoyerEmail(attente)).toHaveProperty('erreur');
 expect(boite).toHaveLength(1);
});
it('réserve l’urgence et l’avis de veto au responsable actuel et bloque un aperçu marketing périmé',async()=>{
 const chef=await compte();
 // Le superviseur permanent le plus ancien est celui choisi par le circuit marketing.
 await q("insert into memberships(account_id,role,created_at) values($1,'super_admin',date '1990-01-01')",[chef.id]);
 vi.stubEnv('GERIMMO_RELAIS_EMAILS',chef.email);
 const urgence=await id("insert into relais_urgences_envois(urgences,destinataires) values(1,1) returning id");
 const p={to:chef.email,subject:'Urgence',html:'Consultez la console.',cleIdempotence:'urgence-'+urgence,
   contexteMetier:{type:'alerte_direction' as const,categorie:'urgence' as const,id:urgence}};
 expect(await envoyerEmail(p)).toHaveProperty('id');await envoyerEmail(p);
 expect(await envoyerEmail({...p,cleIdempotence:randomUUID(),contexteMetier:{...p.contexteMetier,id:randomUUID()}})).toHaveProperty('erreur');
 await q('update marketing_reglages set actif=true,validation_obligatoire=true where singleton');
 const parution=new Date(Date.now()+3600000*6).toISOString();
 const slug=randomUUID();
 const article=await id(`insert into publications(titre,slug,chapo,corps,statut,facebook_texte,programmee_pour,periode)
 values('Article fictif',$1,'Aperçu fictif',repeat('Information fictive pour la recette. ',10),'programmee','Texte fictif',$2,'recette') returning id`,[slug,parution]);
 const post={id:article,titre:'Article fictif',chapo:'Aperçu fictif',slug,origine:'ia' as const,facebook_texte:'Texte fictif',facebook_image_url:null,programmee_pour:parution,validation_obligatoire:true,veille:false,rattrapage:false};
 expect(await alerterSuperviseurDuPost(service,post)).toMatchObject({envoye:true});await alerterSuperviseurDuPost(service,post);
 expect(boite.map(m=>m.to)).toEqual([[chef.email],[chef.email]]);
 expect(boite[1].html).toContain('/admin/marketing#veto');
 // Reprise du lot L4 : l'aperçu est le message envoyé à Facebook, lien de l'article compris.
 expect(boite[1].html).toContain(`/journal/${slug}#gerimmo-${article}`);
 // Rejouer la préparation périmée avec une nouvelle date ne permet aucun envoi.
 const differee={...post,programmee_pour:new Date(Date.parse(parution)+3600000).toISOString()};
 await q('update publications set programmee_pour=$2,facebook_texte=$3 where id=$1',[article,differee.programmee_pour,'Version corrigée']);
 expect(await alerterSuperviseurDuPost(service,differee)).toMatchObject({envoye:false});
 expect(boite).toHaveLength(2);
});
it('capture le report et son acceptation, puis dépose un avis unique chez chaque partie habilitée',async()=>{
 const loc=await compte(),pro=await compte();
 const org=await id("insert into organizations(name,type,status) values('SCI fictive','proprietaire_direct','essai') returning id");
 await q("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')",[loc.id,org]);
 const personne=await id("insert into persons(organization_id,account_id,nom,email) values($1,$2,'Occupant fictif',$3) returning id",[org,loc.id,loc.email]);
 const artisan=await id("insert into artisans(account_id,raison_sociale,siret,telephone,email,statut_plateforme,siret_etat) values($1,'Entreprise fictive',lpad((random()*10^13)::bigint::text,14,'0'),'0600000000',$2,'valide','verifie') returning id",[pro.id,pro.email]);
 const bien=await id("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Test','maison','Rue fictive','75001','Paris') returning id",[org]);
 const lot=await id("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot','loue') returning id",[org,bien]);
 const bail=await id("insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-30,500,50) returning id",[org,lot,personne]);
 const incident=await id("insert into incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,$5,'espace_locataire','plomberie_canalisation','Fuite fictive','qualifie','proprietaire','Test') returning id",[org,randomUUID(),lot,bail,personne]);
 const mission=await id("insert into incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id",[org,incident,artisan]);
 const origine=Date.UTC(new Date().getUTCFullYear()+1,0,1);
 const heure=(jours:number,h:number)=>new Date(origine+jours*86400000+h*3600000).toISOString();
 const dates=[10,11,12].map(j=>({debut:heure(j,9),fin:heure(j,11)}));
 const slot=await id("insert into intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin) values($1,$2,'artisan',1,$3,$4) returning id",[org,mission,heure(9,9),heure(9,11)]);
 await session(loc.id);await q('select choisir_creneau($1,$2)',[org,slot]);
 const demande=await id("select demander_report_rdv($1,$2,'empechement',null,$3,$4) id",[org,mission,JSON.stringify(dates),randomUUID()]);
 await sessionService();await q('set constraints capture_report_courriel immediate');
 const notification=(event:string)=>id('select id from notification_intentions where organization_id=$1 and objet=$2 and evenement=$3',[org,demande,event]);
 const initiale=await notification('rdv_report_demande');
 expect(await traiterNotificationCapturee(service,initiale)).toMatchObject({envoyee:true});
 await traiterNotificationCapturee(service,initiale);
 const nouveau=await id('select id from intervention_creneaux where demande_id=$1 order by debut limit 1',[demande]);
 await q('set constraints capture_report_courriel deferred');
 await session(pro.id);await q('select accepter_creneau_locataire($1)',[nouveau]);await sessionService();
 await q('set constraints capture_report_courriel immediate');
 const reponse=await notification('rdv_report_accepte');
 expect(await traiterNotificationCapturee(service,reponse)).toMatchObject({envoyee:true});await traiterNotificationCapturee(service,reponse);
 expect(boite.map(m=>m.to)).toEqual([[pro.email],[loc.email]]);
 expect(boite[0].html).toContain('/artisan/agenda');expect(boite[1].html).toContain('/locataire/'+org+'/demandes');
 const cleCourrier=(await q('select courriel_id from notification_intentions where id=$1',[reponse]))[0].courriel_id;
 await q("update memberships set status='inactive' where account_id=$1 and organization_id=$2",[loc.id,org]);
 expect(await verifierContexteCourriel(service,cleCourrier)).toHaveProperty('erreur');
 expect((await q('select revision from notification_intentions where objet=$1',[demande]))).toHaveLength(2);
 // Le demandeur du devis et le responsable du dossier sont deux membres différents.
 const demandeur=await compte(),responsable=await compte();
 await q("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct'),($1,$3,'admin_agence')",[org,demandeur.id,responsable.id]);
 await q('update incidents set responsable_account_id=$2 where id=$1',[incident,responsable.id]);
 const consultation=await id("insert into incident_consultations(organization_id,incident_id,metier,nature_travaux) values($1,$2,'plomberie','entretien_courant') returning id",[org,incident]);
 const demandeDevis=await id("insert into incident_sollicitations(organization_id,incident_id,consultation_id,artisan_id,created_by,statut) values($1,$2,$3,$4,$5,'devis_depose') returning id",[org,incident,consultation,artisan,demandeur.id]);
 const devis=await id("insert into incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au) values($1,$2,$3,$4,12000,'Devis fictif',current_date+14) returning id",[org,demandeDevis,incident,artisan]);
 const avis=await id("select id from notification_intentions where objet=$1 and evenement='devis_recu'",[devis]);
 expect(await traiterNotificationCapturee(service,avis)).toMatchObject({envoyee:true});await traiterNotificationCapturee(service,avis);
 expect(boite).toHaveLength(3);expect(boite[2].to).toEqual([demandeur.email]);
 expect(boite[2].html).toContain('/espace/'+org+'/incidents?sel='+incident);
 expect(boite[2].attachments??[]).toHaveLength(0);
});
