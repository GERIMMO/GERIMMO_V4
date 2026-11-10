import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {connecterVers,sansSyntheseAlertes} from './aides';
const org='3c1d1e95-3570-400b-8012-44530be145b1';
test('locataire : documents et déclaration avec photo, puis suivi',async({page,context,browser},info)=>{
 const cible=process.env.SUPALOCAL_DB;
 if(!cible||!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]+\/gerimmo_ci_(?:lotdeux|lottrois)_api$/.test(cible))throw Error('Base fictive locale requise');
 let personne:string;
 const db=new Client({connectionString:cible});await db.connect();
 try {
  await db.query("begin");
  personne=(await db.query("select p.id from persons p join auth.users u on u.id=p.account_id where p.organization_id=$1 and u.email='locataire.pd@example.com'",[org])).rows[0].id;
  const bien=(await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'ESSAI LOT2 Locataire','appartement','3 rue Fictive','69003','Lyon') returning id",[org])).rows[0].id;
  const lot=(await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Logement fictif pilote','loue') returning id",[org,bien])).rows[0].id;
  await db.query("insert into baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-10,600,40)",[org,lot,personne]);
 await db.query("commit");
 }finally{await db.end();}
 await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await connecterVers(page,'locataire.pd@example.com','Gerimmo-Demo-2026',`/locataire/${org}`);
 await page.goto(`/locataire/${org}/documents`);await expect(page.getByRole('heading',{name:/Documents/i}).first()).toBeVisible();
 await page.screenshot({path:info.outputPath('documents-locataire.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
 await page.goto(`/locataire/${org}/incident`);await expect(page.locator('#photos')).toBeAttached();await page.waitForLoadState('networkidle');
 await page.locator('#categorie').selectOption('plomberie_joint');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=120;const ctx=c.getContext('2d')!;ctx.fillStyle='#d4e3ed';ctx.fillRect(0,0,200,120);ctx.fillStyle='#17324f';ctx.fillText('PHOTO FICTIVE '+Date.now(),10,50);return c.toDataURL('image/png').split(',')[1]});
 await page.locator('#photos').setInputFiles({name:'incident-fictif.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await expect(page.getByText('1 photo jointe',{exact:false})).toBeVisible();
 await page.locator('#piece').selectOption({index:1});await page.locator('textarea').first().fill('ESSAI LOT2 fuite fictive '+randomUUID());
 await page.getByRole('button',{name:'Envoyer le signalement',exact:true}).click();await expect(page.getByText(/^Signalement envoyé —/)).toBeVisible();
 await page.screenshot({path:info.outputPath('incident-declare.png'),fullPage:true});
 await page.getByRole('link',{name:'Voir mes demandes maintenant',exact:true}).click();await expect(page.locator('body')).toContainText('ESSAI LOT2');
 const message='Message fictif '+randomUUID(),reponse='Réponse fictive '+randomUUID();
 await page.goto(`/locataire/${org}/contact`);await page.locator('#msg-texte').fill(message);await page.getByRole('button',{name:'Envoyer le message',exact:true}).click();await expect(page.getByText(message,{exact:false})).toBeVisible();
 const owner=await browser.newContext({...info.project.use});
 try {
  await owner.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const p=await owner.newPage();await sansSyntheseAlertes(p);await connecterVers(p,'proprietaire@example.com','Gerimmo-Demo-2026',`/espace/${org}/messages?personne=${personne!}`);
  await expect(p.getByText(message,{exact:true}).last()).toBeVisible();await p.getByLabel('Votre message',{exact:true}).fill(reponse);await p.getByRole('button',{name:'Envoyer',exact:true}).click();await expect(p.getByText(reponse,{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText(reponse,{exact:false})).toBeVisible();await page.screenshot({path:info.outputPath('echange-locataire-proprietaire.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
 }finally{await owner.close();}
});
