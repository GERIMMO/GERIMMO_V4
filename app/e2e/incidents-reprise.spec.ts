import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {writeFileSync} from 'node:fs';
import {config} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {entrerDansEspace,sansSyntheseAlertes} from './aides';
config({path:'.env.local'});
test.use({storageState:path.join(__dirname,'.auth','locataire.json')});
async function nettoyerIncident(db:Client,api:string,incident:string){
   // Nettoyage de cette seule fixture : retirer ses métadonnées, puis API
   // Storage avec le compte propriétaire de l'objet et la RLS ciblée réelle.
   const pieces=(await db.query('select p.id,p.storage_path,p.account_id,p.document_id,a.email from depots_photos_incident p join accounts a on a.id=p.account_id where incident_id=$1',[incident])).rows;
   const storage=createClient(api,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
   if(pieces.length){const {error}=await storage.auth.signInWithPassword({email:pieces[0].email,password:process.env.E2E_MOT_DE_PASSE??'Gerimmo-Demo-2026'});if(error)throw error;}
   for(const p of pieces){
    // Avant nettoyage, une photo rattachée est protégée même contre son auteur.
    if(p.document_id){const refus=await storage.storage.from('documents').remove([p.storage_path]);expect(refus.data??[]).toHaveLength(0);}
    await db.query('begin');await db.query('delete from document_liens where document_id=$1',[p.document_id]);await db.query("update depots_photos_incident set etat='abandonne',document_id=null,erreur='Nettoyage fixture E2E' where id=$1",[p.id]);await db.query('delete from documents where id=$1',[p.document_id]);await db.query('commit');
    const retrait=await storage.storage.from('documents').remove([p.storage_path]);expect(retrait.error).toBeNull();
    // Un retrait idempotent peut retourner le nom déjà absent (émulateur).
    // La preuve est l'absence réelle de l'objet, pas la longueur de la réponse.
    expect((await db.query("select count(*)::int n from storage.objects where bucket_id='documents' and name=$1",[p.storage_path])).rows[0].n).toBe(0);
   }
   await db.query('begin');await db.query('delete from depots_photos_incident where incident_id=$1',[incident]);await db.query('delete from commandes_incidents_locataire where incident_id=$1',[incident]);await db.query('delete from incident_evenements where incident_id=$1',[incident]);await db.query("delete from alerts where details->>'incident_id'=$1",[incident]);await db.query('delete from incidents where id=$1',[incident]);await db.query("delete from audit_log where details->>'incident_id'=$1",[incident]);await db.query('commit');return {incidentSupprime:true,storageSupprimes:pieces.filter(p=>p.document_id).length,anciensDepotsAbsents:pieces.filter(p=>!p.document_id).length};
}
test('LOC003 : réponse perdue après création puis reprise sans double incident ni photo',async({page},info)=>{
 test.setTimeout(90_000);const url=process.env.SUPALOCAL_DB;
 test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API fictive locale requise');
 const api=process.env.NEXT_PUBLIC_SUPABASE_URL;test.skip(!api||!/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(api),'API fictive locale requise');
 const db=new Client({connectionString:url});await db.connect();const description='TEST LOC003 réponse perdue '+randomUUID();let incident:string|undefined;const preuve:Record<string,unknown>={description,status:'en cours'};
 try{
  await sansSyntheseAlertes(page);const org=await entrerDansEspace(page,'locataire');await page.goto(`/locataire/${org}/incident`);
  await expect(async()=>{await page.locator('#categorie').selectOption('plomberie_joint');await expect(page.getByText('Plutôt à votre charge',{exact:true}).filter({visible:true})).toBeVisible({timeout:1000});}).toPass();
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'),commentaire=Buffer.from(randomUUID()),taille=commentaire.length+2;
  await page.locator('#photos').setInputFiles({name:'test-reprise.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,254,taille>>8,taille&255]),commentaire,jpeg.subarray(2)])});
  await expect(page.getByText('1 photo jointe',{exact:false})).toBeVisible();await page.locator('#description').fill(description);await page.locator('#piece').selectOption('Cuisine');
  let perdue=false;
  await page.route('**/locataire/**/incident',async route=>{
   if(route.request().method()==='POST'&&route.request().headers()['next-action']&&!perdue){perdue=true;const rep=await route.fetch();expect(rep.ok()).toBe(true);await route.abort('failed');}else await route.continue();
  });
  await page.getByRole('button',{name:'Envoyer le signalement',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'La réponse n’est pas arrivée'})).toBeVisible();
  const avant=(await db.query('select id from incidents where organization_id=$1 and description=$2',[org,description])).rows;expect(avant).toHaveLength(1);incident=avant[0].id;
  expect((await db.query('select count(*)::int n from depots_photos_incident where incident_id=$1 and etat=\'rattache\'',[incident])).rows[0].n).toBe(1);
  await expect(page.getByRole('status').filter({hasText:'Saisie et fichiers conservés'})).toBeVisible();
  const contexte=page.context();await page.close();page=await contexte.newPage();await sansSyntheseAlertes(page);await page.goto(`/locataire/${org}/incident`);
  await page.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();
  await expect(page.locator('#description')).toHaveValue(description);await expect(page.locator('#description')).toBeDisabled();await expect(page.getByText('1 photo jointe',{exact:false})).toBeVisible();
  await page.screenshot({path:info.outputPath('incident-repris-apres-fermeture.png'),fullPage:true});
  await page.getByRole('button',{name:'Envoyer le signalement',exact:true}).click();await expect(page.getByText(/^Signalement envoyé —/)).toBeVisible();
  const apres=(await db.query('select id from incidents where organization_id=$1 and description=$2',[org,description])).rows;expect(apres).toEqual(avant);
  const comptes=(await db.query("select (select count(*) from commandes_incidents_locataire where incident_id=$1)::int commandes,(select count(*) from depots_photos_incident where incident_id=$1)::int depots,(select count(*) from document_liens where entite='incident' and entite_id=$1)::int liens",[incident])).rows[0];expect(comptes).toEqual({commandes:1,depots:1,liens:1});preuve.actual={incident,...comptes,reponsePerdue:perdue};preuve.status='exécuté avec succès';
  await page.screenshot({path:info.outputPath('reprise-confirmee.png'),fullPage:true});
 }finally{
  try {
  if(!incident)incident=(await db.query('select id from incidents where description=$1',[description])).rows[0]?.id;
  if(incident){
   preuve.cleanup=await nettoyerIncident(db,api!,incident);
  }
  } finally { preuve.finishedAt=new Date().toISOString();writeFileSync(info.outputPath('reprise-preuve.json'),JSON.stringify(preuve,null,2)+'\n');await db.end(); }
 }
});

test('LOC002 : photo refusée nettoyée puis reprise sur le même incident',async({page},info)=>{
 test.setTimeout(90_000);const url=process.env.SUPALOCAL_DB,api=process.env.NEXT_PUBLIC_SUPABASE_URL;
 test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url)||!api||!/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(api),'Base et API fictives locales requises');
 const db=new Client({connectionString:url});await db.connect();const description='TEST LOC002 reprise photo '+randomUUID();let incident:string|undefined,blocage:string|undefined;const preuve:Record<string,unknown>={description,status:'en cours'};
 try{
  await sansSyntheseAlertes(page);const org=await entrerDansEspace(page,'locataire');await page.goto(`/locataire/${org}/incident`);
  await expect(async()=>{await page.locator('#categorie').selectOption('plomberie_joint');await expect(page.getByText('Plutôt à votre charge',{exact:true}).filter({visible:true})).toBeVisible({timeout:1000});}).toPass();
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==','base64'),commentaire=Buffer.from(randomUUID()),taille=commentaire.length+2;
  await page.locator('#photos').setInputFiles({name:'test-refus.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,254,taille>>8,taille&255]),commentaire,jpeg.subarray(2)])});
  await expect(page.getByText('1 photo jointe',{exact:false})).toBeVisible();await page.locator('#description').fill(description);
  const empreinte=await page.locator('#photos').evaluate(async(input:HTMLInputElement)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await input.files![0].arrayBuffer()))).map(n=>n.toString(16).padStart(2,'0')).join(''));
  // Une empreinte occupée simule un vrai refus de lien GED, sans fichier privé.
  blocage=(await db.query("insert into documents(organization_id,type,titre,empreinte,storage_path,mime_type,taille_octets) values($1,'photo_incident','TEST blocage temporaire LOC002',$2,$3,'image/jpeg',12) returning id",[org,empreinte,org+'/test-blocage-'+randomUUID()+'.jpg'])).rows[0].id;
  await page.getByRole('button',{name:'Envoyer le signalement',exact:true}).click();await expect(page.getByRole('button',{name:'Réessayer les photos',exact:true})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'Photos à reprendre'})).toContainText('déjà été déposée');
  const incidents=(await db.query('select id from incidents where organization_id=$1 and description=$2',[org,description])).rows;expect(incidents).toHaveLength(1);incident=incidents[0].id;
  const ancien=(await db.query('select storage_path,etat from depots_photos_incident where incident_id=$1',[incident])).rows;expect(ancien).toHaveLength(1);expect(ancien[0].etat).toBe('abandonne');
  expect((await db.query("select count(*)::int n from storage.objects where bucket_id='documents' and name=$1",[ancien[0].storage_path])).rows[0].n).toBe(0);
  await db.query('delete from documents where id=$1',[blocage]);blocage=undefined;
  const contexte=page.context();await page.close();page=await contexte.newPage();await sansSyntheseAlertes(page);await page.goto(`/locataire/${org}/incident`);
  await page.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();
  await page.getByRole('button',{name:'Réessayer les photos',exact:true}).click();await expect(page.getByRole('link',{name:'Voir mes demandes maintenant',exact:true})).toBeVisible();
  expect((await db.query('select id from incidents where organization_id=$1 and description=$2',[org,description])).rows).toEqual(incidents);
  const bilan=(await db.query("select (select count(*) from commandes_incidents_locataire where incident_id=$1)::int commandes,(select count(*) from depots_photos_incident where incident_id=$1 and etat='rattache')::int photos,(select count(*) from document_liens where entite='incident' and entite_id=$1)::int liens",[incident])).rows[0];expect(bilan).toEqual({commandes:1,photos:1,liens:1});
  preuve.actual={incident,...bilan,depotRefuseRetire:true};preuve.status='exécuté avec succès';await page.screenshot({path:info.outputPath('photo-reprise-confirmee.png'),fullPage:true});
 }finally{
  try{if(blocage)await db.query('delete from documents where id=$1',[blocage]);if(!incident)incident=(await db.query('select id from incidents where description=$1',[description])).rows[0]?.id;if(incident)preuve.cleanup=await nettoyerIncident(db,api!,incident);}
  finally{preuve.finishedAt=new Date().toISOString();writeFileSync(info.outputPath('photo-reprise-preuve.json'),JSON.stringify(preuve,null,2)+'\n');await db.end();}
 }
});
