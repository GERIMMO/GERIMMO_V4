import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
test('inscription et récupération avec boîte fictive locale',async({page,context},info)=>{
 await context.setExtraHTTPHeaders({"x-forwarded-for":`2001:db8::${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}`});
 const email=`pilote-${randomUUID()}@example.invalid`,password='Gerimmo-Test-Long-2026';
 await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return ['localhost','127.0.0.1'].includes(host)?route.continue():route.abort();});
 await page.goto('/inscription');
 await page.getByLabel('Prénom',{exact:false}).fill('Camille');await page.getByLabel('Nom',{exact:true}).fill('Pilote Fictif');
 await page.getByLabel('Adresse e-mail').fill(email);await page.getByLabel('Adresse postale',{exact:false}).fill('3 rue du Test');
 await page.getByLabel('Code postal',{exact:false}).fill('69003');await page.getByLabel('Ville',{exact:false}).fill('Lyon');
 await page.getByRole('button',{name:'Ouvrir mon espace',exact:true}).click();await expect(page.getByText(/Vérifiez votre boîte mail/)).toBeVisible();
 async function dernierLien(){
  const mails=await (await page.request.get('http://127.0.0.1:55520/messages')).json();
  const m=mails.filter((x:{to:string[]})=>x.to.includes(email)).at(-1);expect(m).toBeTruthy();
  const link=m.html.match(/href="([^"]*\/auth\/confirm[^\"]*)"/)[1].replaceAll('&amp;','&');
  return link as string;
 }
 await page.goto(await dernierLien());await page.getByRole('button',{name:/Confirmer mon adresse|Choisir mon mot de passe/}).click();await expect(page).toHaveURL(/nouveau-mot-de-passe/);
 await page.getByLabel('Nouveau mot de passe',{exact:true}).fill(password);await page.getByLabel('Confirmation',{exact:true}).fill(password);
 if(await page.getByRole('checkbox',{name:/accepte les conditions/}).count())await page.getByRole('checkbox',{name:/accepte les conditions/}).check();
 await page.getByRole('button',{name:/Changer le mot de passe|Créer mon mot de passe|Valider/}).click();await expect(page).toHaveURL(/\/espace\/[a-f0-9-]{36}/);
 await page.screenshot({path:info.outputPath('proprietaire-inscrit.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
 await context.clearCookies();await page.goto('/mot-de-passe-oublie');await page.getByLabel('Adresse e-mail').fill(email);await page.getByRole('button',{name:'Envoyer le lien',exact:true}).click();await expect(page.getByText(/Si un compte existe/)).toBeVisible();
 await page.goto(await dernierLien());await page.getByRole('button',{name:'Choisir mon mot de passe',exact:true}).click();await expect(page).toHaveURL(/nouveau-mot-de-passe/);
 await page.getByLabel('Nouveau mot de passe',{exact:true}).fill(password+'-suite');await page.getByLabel('Confirmation',{exact:true}).fill(password+'-suite');await page.getByRole('button',{name:'Changer le mot de passe',exact:true}).click();await expect(page).toHaveURL(/connexion/);
 await page.getByLabel('Adresse e-mail',{exact:true}).fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(password+'-suite');await page.getByRole('button',{name:'Se connecter',exact:true}).click();await expect(page).toHaveURL(/\/espace\/[a-f0-9-]{36}/);
});
