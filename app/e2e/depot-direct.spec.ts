import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {entrerDansEspace,debordementHorizontal,sansSyntheseAlertes} from './aides';

import {pdfFictif} from './pdf-fictif';

for(const largeur of [390,1440])test(`document de 6 Mo : transfert privé puis enregistrement à ${largeur}px`,async({browser},info)=>{
 test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''),'API fictive locale requise');
 const contexte=await browser.newContext({storageState:'e2e/.auth/proprietaire.json',viewport:{width:largeur,height:900}});
  const page=await contexte.newPage();
  try {
  await sansSyntheseAlertes(page);
  const org=await entrerDansEspace(page,'espace');await page.goto(`/espace/${org}/documents?sel=depot`);
  const titre=`ESSAI transfert ${largeur} ${randomUUID()}`;
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'Déposer',exact:true})});
  await form.getByLabel('Type de document',{exact:true}).selectOption({label:'Justificatif'});
  await form.getByLabel('Titre (facultatif)',{exact:true}).fill(titre);
  await form.locator('input[type=file]').setInputFiles({name:'essai-fictif-six-mo.pdf',mimeType:'application/pdf',buffer:pdfFictif(6*1024*1024)});
  let transferts=0;page.on('request',r=>{if(r.method()==='PUT'&&r.url().includes('/object/upload/sign/'))transferts++;});
  if(largeur===390){
   await page.route('**/storage/v1/object/upload/sign/**',route=>route.abort('failed'));
   await form.getByRole('button',{name:'Déposer',exact:true}).click();
   await expect(form.getByRole('alert')).toContainText('interrompu');
   await expect(form.getByLabel('Titre (facultatif)',{exact:true})).toHaveValue(titre);
   expect(await form.locator('input[type=file]').evaluate((el:HTMLInputElement)=>el.files?.[0]?.size)).toBeGreaterThan(6*1024*1024);
   await page.unroute('**/storage/v1/object/upload/sign/**');
  }
  await form.getByRole('button',{name:'Déposer',exact:true}).click();
  await expect(form.getByText('Document déposé.',{exact:true})).toBeVisible();
  if(largeur===390)await page.getByRole('link',{name:'← Tous les documents',exact:true}).click();
  await expect(page.getByRole('link').filter({hasText:titre})).toHaveCount(1);
  expect(transferts).toBe(largeur===390?2:1);
  expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({path:info.outputPath(`depot-confirme-${largeur}.png`),fullPage:true});
  if(largeur===1440){
   await page.getByRole('link').filter({hasText:titre}).click();
   const consultation=page.getByRole('link',{name:`Consulter ${titre}`,exact:true});
   await expect(consultation).toBeVisible();
   const adresse=await consultation.getAttribute('href');expect(adresse).toBeTruthy();
   const reponse=await contexte.request.get(adresse!);
   expect(reponse.headers()['x-frame-options']).toBe('SAMEORIGIN');
   expect(reponse.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
   expect(reponse.headers()['content-security-policy']).not.toContain("frame-ancestors 'none'");
   const apercu=page.frameLocator(`iframe[title="Aperçu — ${titre}"]`);
   await expect(apercu.getByRole('link',{name:'Ouvrir le PDF en plein écran'})).toBeVisible();
  }
 }finally{await contexte.close();}
});
