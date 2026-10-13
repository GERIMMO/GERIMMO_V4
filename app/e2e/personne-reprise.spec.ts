import {test,expect,type Page} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {entrerDansEspace,sansSyntheseAlertes,debordementHorizontal} from './aides';
test.use({storageState:'e2e/.auth/proprietaire.json',actionTimeout:10000});
async function conserve(page:Page){await expect(page.getByRole('status').filter({hasText:'Saisie et fichiers conservés'})).toBeVisible();}
for(const largeur of [390,1440])test(`fiche personne et justificatif : fermeture et création à ${largeur}px`,async({page},info)=>{
 test.setTimeout(90000);const url=process.env.SUPALOCAL_DB,api=process.env.NEXT_PUBLIC_SUPABASE_URL;
 test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url)||!api||!/^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/.test(api),'Base/API fictives locales requises');
 const db=new Client({connectionString:url});await db.connect();const email=`reprise-${randomUUID()}@example.invalid`;const preuve:Record<string,unknown>={largeur,email};
 try{
  await page.setViewportSize({width:largeur,height:1000});await sansSyntheseAlertes(page);const org=await entrerDansEspace(page,'agence');const href=`/agence/${org}/personnes#creer-fiche`;await page.goto(href);
  await page.getByRole('button',{name:'Locataire Occupe un logement',exact:true}).click();
  for(const [n,v] of Object.entries({nom:'TEST Reprise',prenom:'Camille',date_naissance:'1990-01-15',commune_naissance:'Paris'}))await page.locator(`#p-${n}`).fill(v);
  await page.getByRole('button',{name:'Suivant',exact:true}).click();
  for(const [n,v] of Object.entries({email,telephone:'0600000000',address_line1:'10 rue TEST',postal_code:'75001',city:'Paris'}))await page.locator(`#p-${n}`).fill(v);
  await page.getByRole('button',{name:'Suivant',exact:true}).click();await page.getByRole('button',{name:'Pièce d’identité',exact:true}).click();
  const contenu=Buffer.from('%PDF-1.7\n% JUSTIFICATIF FICTIF '+randomUUID()+'\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
  await page.locator('input[type="file"]').setInputFiles({name:'justificatif-fictif.pdf',mimeType:'application/pdf',buffer:contenu});await conserve(page);
  await page.getByRole('button',{name:'Suivant',exact:true}).click();await conserve(page);
  const contexte=page.context();await page.close();page=await contexte.newPage();await page.setViewportSize({width:largeur,height:1000});await sansSyntheseAlertes(page);await page.goto(href);
  await expect(page.getByRole('heading',{name:'Reprendre votre saisie',exact:true})).toBeVisible();expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({path:info.outputPath('fiche-a-reprendre.png'),fullPage:true});await page.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();
  await expect(page.locator('#p-nom')).toHaveValue('TEST Reprise');await expect(page.locator('#p-email')).toHaveValue(email);await expect(page.getByText('justificatif-fictif.pdf',{exact:true}).filter({visible:true})).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);await page.screenshot({path:info.outputPath('fiche-reprise.png'),fullPage:true});
  await page.getByRole('button',{name:'Créer la fiche',exact:true}).click();await expect(page.getByRole('heading',{name:'La fiche est créée',exact:true})).toBeVisible();
  const personnes=(await db.query('select id from persons where email=$1',[email])).rows;expect(personnes).toHaveLength(1);const docs=(await db.query("select d.id,d.storage_path,d.taille_octets from documents d join document_liens l on l.document_id=d.id where l.entite='personne' and l.entite_id=$1",[personnes[0].id])).rows;expect(docs).toHaveLength(1);expect(Number(docs[0].taille_octets)).toBe(contenu.length);
  preuve.personneUnique=true;preuve.documentConserve=true;
  await page.screenshot({path:info.outputPath('fiche-confirmee.png'),fullPage:true});
  await page.reload();await expect(page.getByRole('heading',{name:'Reprendre votre saisie',exact:true})).toHaveCount(0);
 }finally{
  const personnes=(await db.query('select id from persons where email=$1',[email])).rows;
  const storage=createClient(api!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});

  for(const p of personnes){const docs=(await db.query("select d.id,d.storage_path from documents d join document_liens l on l.document_id=d.id where l.entite='personne' and l.entite_id=$1",[p.id])).rows;for(const d of docs){await db.query('delete from document_liens where document_id=$1',[d.id]);await db.query('delete from documents where id=$1',[d.id]);const retrait=await storage.storage.from('documents').remove([d.storage_path]);expect(retrait.error).toBeNull();expect((await db.query("select count(*)::int n from storage.objects where bucket_id='documents' and name=$1",[d.storage_path])).rows[0].n).toBe(0);}await db.query('delete from persons where id=$1',[p.id]);}
  preuve.cleanup=(await db.query('select id from persons where email=$1',[email])).rowCount===0;writeFileSync(info.outputPath('personne-preuve.json'),JSON.stringify(preuve,null,2));await db.end();
 }
});

test('fiche personne : une autre fenêtre ne remplace pas la copie et le stockage refusé est expliqué',async({page})=>{
 await sansSyntheseAlertes(page);const org=await entrerDansEspace(page,'agence');const href=`/agence/${org}/personnes#creer-fiche`;await page.goto(href);
 await page.getByRole('button',{name:'Locataire Occupe un logement',exact:true}).click();await page.locator('#p-nom').fill('Copie A');await conserve(page);
 const autre=await page.context().newPage();await sansSyntheseAlertes(autre);await autre.goto(href);await autre.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();await autre.locator('#p-nom').fill('Copie B récente');await conserve(autre);
 await page.locator('#p-nom').fill('Copie A encore en mémoire');await expect(page.getByRole('alert').filter({hasText:'Une autre copie a été modifiée'})).toBeVisible();await expect(page.locator('#p-nom')).toHaveValue('Copie A encore en mémoire');
 await autre.reload();await autre.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();await expect(autre.locator('#p-nom')).toHaveValue('Copie B récente');await autre.close();
 await page.addInitScript(()=>{Object.defineProperty(IDBFactory.prototype,'open',{value:()=>{throw new DOMException('Test stockage refusé','SecurityError');}});});
 await page.reload();await expect(page.getByRole('alert').filter({hasText:'La copie sur cet appareil est indisponible'})).toBeVisible();await page.getByRole('button',{name:'Locataire Occupe un logement',exact:true}).click();await page.locator('#p-nom').fill('Saisie sans stockage');await expect(page.getByRole('alert').filter({hasText:'Impossible de conserver la copie'})).toBeVisible();await expect(page.locator('#p-nom')).toHaveValue('Saisie sans stockage');
});

test('fiche personne : réponse de création perdue puis reprise sans nouvelle création',async({page},info)=>{
 test.setTimeout(90000);const url=process.env.SUPALOCAL_DB;test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base fictive locale requise');
 const db=new Client({connectionString:url});await db.connect();const email=`reprise-perdue-${randomUUID()}@example.invalid`;
 try{
  await sansSyntheseAlertes(page);const org=await entrerDansEspace(page,'agence');const href=`/agence/${org}/personnes#creer-fiche`;await page.goto(href);await page.getByRole('button',{name:'Locataire Occupe un logement',exact:true}).click();
  for(const [n,v] of Object.entries({nom:'TEST Perdue',prenom:'Camille',date_naissance:'1990-01-15',commune_naissance:'Paris'}))await page.locator(`#p-${n}`).fill(v);await page.getByRole('button',{name:'Suivant',exact:true}).click();
  for(const [n,v] of Object.entries({email,address_line1:'10 rue TEST',postal_code:'75001',city:'Paris'}))await page.locator(`#p-${n}`).fill(v);await page.getByRole('button',{name:'Suivant',exact:true}).click();await page.getByRole('button',{name:'Suivant',exact:true}).click();
  let perdue=false;await page.route(`**/agence/${org}/personnes`,async route=>{if(route.request().method()==='POST'&&route.request().headers()['next-action']&&!perdue){perdue=true;const r=await route.fetch();expect(r.ok()).toBe(true);await route.abort('failed');}else await route.continue();});
  await page.getByRole('button',{name:'Créer la fiche',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Un enregistrement a été interrompu'})).toBeVisible();await conserve(page);
  const contexte=page.context();await page.close();page=await contexte.newPage();await sansSyntheseAlertes(page);await page.goto(href);await page.getByRole('button',{name:'Reprendre ma saisie',exact:true}).click();await expect(page.getByRole('button',{name:'Créer la fiche',exact:true})).toBeDisabled();await expect(page.locator('#p-email')).toHaveValue(email);
  expect((await db.query('select id from persons where email=$1',[email])).rows).toHaveLength(1);await page.screenshot({path:info.outputPath('creation-non-confirmee.png'),fullPage:true});
 }finally{await db.query('delete from persons where email=$1',[email]);await db.end();}
});
