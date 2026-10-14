import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {entrerDansEspace,sansSyntheseAlertes,debordementHorizontal} from './aides';

async function annulerDepart(page:Page, action:()=>Promise<unknown>){
 const dialogue=page.waitForEvent('dialog');const travail=action();const d=await dialogue;
 const message=d.message();await d.dismiss();expect(message).toContain('modifications');await travail.catch(()=>{});
}
async function dialogueAbsent(page:Page,action:()=>Promise<unknown>){
 const dialogues:string[]=[];const recevoir=async(d:import('@playwright/test').Dialog)=>{dialogues.push(d.type());await d.dismiss();};
 page.on('dialog',recevoir);try { await action(); } finally {page.off('dialog',recevoir);}expect(dialogues).toEqual([]);
}
for(const largeur of [390,1440])test(`profil : avertissement avant sortie, annulation et retour à la valeur initiale à ${largeur}px`,async({browser},info)=>{
 const context=await browser.newContext({storageState:'e2e/.auth/proprietaire.json',viewport:{width:largeur,height:950}});const page=await context.newPage();
 try{await sansSyntheseAlertes(page);const org=await entrerDansEspace(page,'agence');await page.goto(`/agence/${org}/profil`);
 const nom=page.locator('#pr-nom');await expect(nom).toBeVisible();const initial=await nom.inputValue();await nom.fill('TEST saisie à conserver');
 const lien=page.locator(`a[href="/agence/${org}/parc"]:visible`).first();
 if(!await lien.isVisible())await page.getByRole('button',{name:/menu/i}).first().click();
 await annulerDepart(page,()=>lien.click());await expect(nom).toHaveValue('TEST saisie à conserver');
 const dialogue=page.waitForEvent('dialog');const recharge=page.reload({timeout:1500});const d=await dialogue;expect(d.type()).toBe('beforeunload');await d.dismiss();await recharge.catch(()=>{});
 await expect(nom).toHaveValue('TEST saisie à conserver');expect(await debordementHorizontal(page)).toBe(0);await page.screenshot({path:info.outputPath('profil-saisie-conservee.png'),fullPage:true});
 await nom.fill(initial);await dialogueAbsent(page,()=>lien.click());await expect(page).toHaveURL(`/agence/${org}/parc`);
 }finally{await context.close();}
});

test('artisan : erreur de dépôt garde le fichier et empêche une sortie accidentelle',async({browser})=>{
 const context=await browser.newContext({storageState:'e2e/.auth/artisan.json'});const page=await context.newPage();
 try{await page.goto('/artisan/attestations');await page.getByRole('link',{name:'Déposer : Assurance décennale',exact:true}).click();
 const f=page.locator('form').filter({has:page.getByRole('button',{name:"Déposer l'attestation",exact:true})});
 await f.locator('[name="expire_le"]').fill('2030-01-01');await f.locator('[type="file"]').setInputFiles({name:'test-refuse.pdf',mimeType:'application/pdf',buffer:Buffer.from('FAUX PDF')});
 await f.getByRole('button',{name:"Déposer l'attestation",exact:true}).click();await expect(f.getByRole('alert')).toBeVisible();
 await expect(f.getByText('test-refuse.pdf',{exact:true})).toBeVisible();expect(await f.locator('[type="file"]').evaluate((e:HTMLInputElement)=>e.files?.length)).toBe(1);
 await annulerDepart(page,()=>page.getByRole('link',{name:'Annuler',exact:true}).click());await expect(f.locator('[name="expire_le"]')).toHaveValue('2030-01-01');
 }finally{await context.close();}
});

test('superadmin : texte préparé protégé sans programmer de publication',async({browser})=>{
 const context=await browser.newContext({storageState:'e2e/.auth/superadmin.json'});const page=await context.newPage();
 try{await sansSyntheseAlertes(page);await page.goto('/admin/marketing');await page.getByText('Noter une intention éditoriale', {exact:true}).click();const texte=page.locator('textarea[name="description"]');await expect(texte).toBeVisible();await texte.fill('TEST intention locale non publiée');
 const d=page.waitForEvent('dialog');const quitter=page.goto('/admin/brief',{timeout:1500});await(await d).dismiss();await quitter.catch(()=>{});await expect(texte).toHaveValue('TEST intention locale non publiée');
 }finally{await context.close();}
});

// Contrats du garde-fou dans le vrai moteur navigateur, sans route de test dans le produit.
const gardeCompile=ts.transpileModule(readFileSync('src/lib/protection-saisie.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function banc(page:Page){
 await page.route('**/agence/test-protection',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<form data-saisie-confirmee id="a"><input name="nom" value="initial"><input name="cache" type="hidden" value="secret"><input name="document" type="file"><textarea name="texte">premier</textarea><fieldset id="inactif"><input name="autre" value="ancien"></fieldset><button type="reset">Annuler</button></form><form data-saisie-confirmee id="b"><input name="nom" value="second"></form><form method="get"><input name="q"></form><form data-saisie-confirmee data-saisie-libre id="c"><input name="libre"></form><a id="suite" href="/agence/suite">Sortir</a><a href="#a">Étape</a><a target="_blank" href="/agence/suite">Nouvel onglet</a>`}));
 await page.goto('/agence/test-protection');await page.addScriptTag({content:`var exports={};${gardeCompile};window.garde=exports;exports.installerProtectionSaisie();`});
}
const compte=()=> (window as unknown as {garde:{saisiesModifiees:()=>HTMLFormElement[]}}).garde.saisiesModifiees().length;
test('confirmation partielle, deuxième formulaire et modifications pendant la réponse',async({page})=>{
 await banc(page);await page.locator('#a [name="nom"]').fill('envoyé');await page.locator('#a [name="autre"]').fill('autre étape modifiée');
 await page.evaluate(()=>{document.querySelector<HTMLFieldSetElement>('#inactif')!.disabled=true;const w=window as unknown as {envoi:FormData};const f=document.querySelector<HTMLFormElement>('#a')!;f.addEventListener('submit',e=>e.preventDefault(),{once:true});f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));w.envoi=new FormData(f);});
 await page.locator('#a [name="nom"]').fill('nouveau');await page.locator('#b input').fill('second modifié');
 await page.evaluate(()=>{const w=window as unknown as {envoi:FormData;garde:{confirmerSoumission:(d:FormData)=>void}};w.garde.confirmerSoumission(w.envoi);});
 expect(await page.evaluate(compte)).toBe(2);await page.locator('#a [name="nom"]').fill('envoyé');expect(await page.evaluate(compte)).toBe(2);
 await page.evaluate(()=>{document.querySelector<HTMLFieldSetElement>('#inactif')!.disabled=false;});await page.locator('#a [name="autre"]').fill('ancien');expect(await page.evaluate(compte)).toBe(1);
});
test('un reset automatique après erreur conserve texte et vrais octets du fichier',async({page})=>{
 await banc(page);await page.locator('#a [name="texte"]').fill('mon texte');await page.locator('#a [type="file"]').setInputFiles({name:'preuve.txt',mimeType:'text/plain',buffer:Buffer.from('octets conservés')});
 await page.locator('#a').evaluate((f:HTMLFormElement)=>f.reset());await expect(page.locator('#a textarea')).toHaveValue('mon texte');
 expect(await page.locator('#a [type="file"]').evaluate(async(e:HTMLInputElement)=>e.files![0].text())).toBe('octets conservés');
 await page.evaluate(()=>{const f=document.querySelector<HTMLFormElement>('#a')!;const w=window as unknown as {garde:{confirmerSoumission:(d:FormData)=>void}};f.addEventListener('submit',e=>e.preventDefault(),{once:true});f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));w.garde.confirmerSoumission(new FormData(f));f.reset();});
 await expect(page.locator('#a textarea')).toHaveValue('premier');expect(await page.evaluate(compte)).toBe(0);
});
test('recherche et champs techniques ne déclenchent pas de faux avertissement',async({page})=>{
 await banc(page);await page.locator('[name="q"]').fill('recherche');await page.locator('#c [name="libre"]').fill('code à usage unique');await page.locator('#a [name="nom"]').focus();await page.locator('[name="cache"]').evaluate((i:HTMLInputElement)=>{i.value='autre';i.dispatchEvent(new Event('change',{bubbles:true}));});expect(await page.evaluate(compte)).toBe(0);
 await page.locator('#a [name="nom"]').fill('modifié');await dialogueAbsent(page,()=>page.getByRole('link',{name:'Étape',exact:true}).click());expect(await page.evaluate(compte)).toBe(1);
});
test('un fichier choisi sans focus est suivi et une saisie abandonnée demande confirmation',async({page})=>{
 await banc(page);await page.locator('#a [type="file"]').setInputFiles({name:'preuve.txt',mimeType:'text/plain',buffer:Buffer.from('preuve')});expect(await page.evaluate(compte)).toBe(1);
 await annulerDepart(page,()=>page.locator('#suite').click());expect(await page.evaluate(compte)).toBe(1);
 const d=page.waitForEvent('dialog');const r=page.getByRole('button',{name:'Annuler',exact:true}).click();await(await d).accept();await r;expect(await page.evaluate(compte)).toBe(0);
});

test('artisan : seule la confirmation réelle permet de quitter sans avertissement',async({browser})=>{
 test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??''),'API fictive locale requise');
 const context=await browser.newContext({storageState:'e2e/.auth/artisan.json'});const page=await context.newPage();let original:string|undefined;
 const editer=async()=>{await page.goto('/artisan/entreprise');await page.getByRole('button',{name:'Modifier',exact:true}).click();await expect(page.locator('[name="codes_postaux"]')).toBeVisible();};
 try{await editer();const champ=page.locator('[name="codes_postaux"]');original=await champ.inputValue();await champ.fill(original.includes('75001')?'69001':'75001');
 const form=page.locator('form').filter({has:champ});await form.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(form.getByRole('status')).toBeVisible();
 await dialogueAbsent(page,()=>page.goto('/artisan/facturation',{timeout:1500}));await expect(page).toHaveURL('/artisan/facturation');
 }finally{
  if(original!==undefined){page.on('dialog',d=>d.accept());await editer();const champ=page.locator('[name="codes_postaux"]');await champ.fill(original);const form=page.locator('form').filter({has:champ});await form.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(form.getByRole('status')).toBeVisible();}
  await context.close();
 }
});

test('artisan : réponse réseau perdue garde le formulaire et son texte',async({browser})=>{
 const context=await browser.newContext({storageState:'e2e/.auth/artisan.json'});const page=await context.newPage();
 try{await page.goto('/artisan/entreprise');await page.getByRole('button',{name:'Modifier',exact:true}).click();const champ=page.locator('[name="codes_postaux"]');await champ.fill('75001');
 await page.route('**/artisan/entreprise',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());
 const f=page.locator('form').filter({has:champ});await f.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(f.getByRole('alert')).toContainText('confirmation n’a pas pu être reçue');await expect(champ).toHaveValue('75001');
 }finally{await context.close();}
});
