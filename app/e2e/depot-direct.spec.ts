import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {connecterVers,debordementHorizontal,sansSyntheseAlertes} from './aides';
import {CONDITIONS_VERSION} from '../src/lib/editeur';

import {pdfFictif} from './pdf-fictif';

for(const largeur of [390,1440])test(`document de 6 Mo : transfert privé puis enregistrement à ${largeur}px`,async({browser},info)=>{
 test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''),'API fictive locale requise');
 const base=process.env.SUPALOCAL_DB;
 test.skip(!base||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(base),'Base API fictive locale requise');
 // Le transit est borné à 20 fichiers ou 100 Mo par heure et PAR COMPTE (support_interne.borner_depots_temporaires).
 // Le compte de démonstration proprietaire@example.com dépose aussi dans d’autres parcours, et la CI enchaîne
 // Chromium puis WebKit sur la même base dans l’heure : avec lui, ce parcours dépendait de ce que les autres
 // avaient déjà déposé (refus « Vous avez envoyé beaucoup de fichiers… » sur WebKit, CI du 25/11).
 // Il a donc son propre compte et son propre espace fictifs ; la limite elle-même reste vérifiée par
 // tests/depot-direct-base.test.ts (20 dépôts acceptés, le suivant refusé).
 const db=new Client({connectionString:base});await db.connect();
 const org=randomUUID(),compte=randomUUID(),personne=randomUUID();
 const email=`depot-direct-${org}@example.invalid`,motDePasse=randomUUID(),nom=`ESSAI dépôt direct ${org.slice(0,8)}`;
 try{
  await db.query('begin');
  await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
   values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"prenom":"Propriétaire","nom":"Essai dépôt direct"}',now(),now(),'','','','','')`,[compte,email,motDePasse]);
  await db.query("insert into acceptations_cgu(account_id,version,source,document) values($1,$2,'inscription','conditions_clients')",[compte,CONDITIONS_VERSION]);
  await db.query("insert into organizations(id,name,type,status,address_line1,postal_code,city,email_contact) values($1,$2,'proprietaire_direct','active','1 rue des Essais','75001','Paris',$3)",[org,nom,email]);
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[compte,org]);
  await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email,qualite,address_line1,postal_code,city) values($1,$2,$3,'Essai dépôt direct','Propriétaire',$4,'Personne physique','1 rue des Essais','75001','Paris')",[personne,org,compte,email]);
  await db.query('commit');
 }catch(e){await db.query('rollback');await db.end();throw e;}
 await db.end();
 const contexte=await browser.newContext({viewport:{width:largeur,height:900}});
  const page=await contexte.newPage();
  try {
  await sansSyntheseAlertes(page);
  await connecterVers(page,email,motDePasse,`/espace/${org}/documents?sel=depot`);
  const titre=`ESSAI transfert ${largeur} ${randomUUID()}`;
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Déposer le document',exact:true})});
  await expect(form.getByLabel('Type de document',{exact:true})).toHaveValue('');
  expect(await form.getByLabel('Type de document',{exact:true}).evaluate((el:HTMLSelectElement)=>el.validity.valueMissing)).toBe(true);
  await form.getByLabel('Type de document',{exact:true}).selectOption({label:'Justificatif'});
  await form.locator('input[type=file]').setInputFiles({name:'essai-fictif-six-mo.pdf',mimeType:'application/pdf',buffer:pdfFictif(6*1024*1024)});
  await form.locator('summary').filter({hasText:'Renommer ou lier à une personne'}).click();
  await expect(form.getByLabel('Nom du document',{exact:true})).not.toHaveValue('');
  await form.getByLabel('Nom du document',{exact:true}).fill(titre);
  let transferts=0;page.on('request',r=>{if(r.method()==='PUT'&&r.url().includes('/object/upload/sign/'))transferts++;});
  if(largeur===390){
   await page.route('**/storage/v1/object/upload/sign/**',route=>route.abort('failed'));
   await form.getByRole('button',{name:'Déposer le document',exact:true}).click();
   await expect(form.getByRole('alert')).toContainText('interrompu');
   await expect(form.getByLabel('Nom du document',{exact:true})).toHaveValue(titre);
   expect(await form.locator('input[type=file]').evaluate((el:HTMLInputElement)=>el.files?.[0]?.size)).toBeGreaterThan(6*1024*1024);
   await page.unroute('**/storage/v1/object/upload/sign/**');
  }
  await form.getByRole('button',{name:'Déposer le document',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Document déposé.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Consulter le document',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'← Retour aux documents',exact:true}).click();
  await expect(page.getByRole('link').filter({hasText:titre})).toHaveCount(1);
  expect(transferts).toBe(largeur===390?2:1);
  expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({path:info.outputPath(`depot-confirme-${largeur}.png`),fullPage:true});
  if(largeur===1440){
   await page.getByRole('link').filter({hasText:titre}).click();
   await expect(page).toHaveURL(url=>/^[0-9a-f-]{36}$/.test(url.searchParams.get('sel')??''));
   const documentId=new URL(page.url()).searchParams.get('sel');expect(documentId).toBeTruthy();
   const reponse=await contexte.request.get(`/espace/${org}/documents/${documentId}/fichier`);
   expect(reponse.headers()['x-frame-options']).toBe('SAMEORIGIN');
   expect(reponse.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
   expect(reponse.headers()['content-security-policy']).not.toContain("frame-ancestors 'none'");
   const apercu=page.getByRole('region',{name:`Aperçu : ${titre}`,exact:true});
   await expect(apercu.locator('canvas')).toBeVisible();
   await expect(apercu.getByRole('button',{name:'Agrandir',exact:true})).toBeVisible();
   await expect(apercu.getByRole('button',{name:'Télécharger',exact:true})).toBeVisible();
   expect(contexte.pages()).toHaveLength(1);
  }
  // Les pièces restent dans cet espace fictif propre au parcours ; aucun document du parc de démonstration n’est touché.
 }finally{await contexte.close();}
});
