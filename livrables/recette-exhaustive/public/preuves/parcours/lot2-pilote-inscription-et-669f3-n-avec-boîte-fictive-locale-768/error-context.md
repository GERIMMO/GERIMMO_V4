# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lot2-pilote.spec.ts >> inscription et récupération avec boîte fictive locale
- Location: ../../../../Users/easycash/Documents/Gerimmo V3/work/premiers-clients-payants/app/e2e/lot2-pilote.spec.ts:3:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /Confirmer mon adresse|Choisir mon mot de passe/ })

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - main [ref=f1e2]:
    - generic [ref=f1e4]:
      - link "Gerimmo — accueil" [ref=f1e6] [cursor=pointer]:
        - /url: /
        - img "Gerimmo — L’immobilier en confiance" [ref=f1e8]
      - heading "Votre mot de passe" [level=1] [ref=f1e9]
      - paragraph [ref=f1e10]: "Votre lien est prêt. Cliquez sur le bouton pour choisir votre mot de passe : il sera demandé à chaque connexion."
      - generic [ref=f1e13]:
        - alert [ref=f1e14]: Cette page a besoin d’un cookie de sécurité qui manque. Rouvrez le lien pour continuer ; si le message revient, autorisez les cookies pour ce site.
        - button "Rouvrir le lien" [ref=f1e15] [cursor=pointer]
  - alert [ref=f1e16]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {randomUUID} from 'node:crypto';
  3  | test('inscription et récupération avec boîte fictive locale',async({page,context},info)=>{
  4  |  await context.setExtraHTTPHeaders({"x-forwarded-for":`2001:db8::${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}`});
  5  |  const email=`pilote-${randomUUID()}@example.invalid`,password='Gerimmo-Test-Long-2026';
  6  |  await context.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return ['localhost','127.0.0.1'].includes(host)?route.continue():route.abort();});
  7  |  await page.goto('/inscription');
  8  |  await page.getByLabel('Prénom',{exact:false}).fill('Camille');await page.getByLabel('Nom',{exact:true}).fill('Pilote Fictif');
  9  |  await page.getByLabel('Adresse e-mail').fill(email);await page.getByLabel('Adresse postale',{exact:false}).fill('3 rue du Test');
  10 |  await page.getByLabel('Code postal',{exact:false}).fill('69003');await page.getByLabel('Ville',{exact:false}).fill('Lyon');
  11 |  await page.getByRole('button',{name:'Ouvrir mon espace',exact:true}).click();await expect(page.getByText(/Vérifiez votre boîte mail/)).toBeVisible();
  12 |  async function dernierLien(){
  13 |   const mails=await (await page.request.get('http://127.0.0.1:55520/messages')).json();
  14 |   const m=mails.filter((x:{to:string[]})=>x.to.includes(email)).at(-1);expect(m).toBeTruthy();
  15 |   const link=m.html.match(/href="([^"]*\/auth\/confirm[^\"]*)"/)[1].replaceAll('&amp;','&');
  16 |   return link as string;
  17 |  }
> 18 |  await page.goto(await dernierLien());await page.getByRole('button',{name:/Confirmer mon adresse|Choisir mon mot de passe/}).click();await expect(page).toHaveURL(/nouveau-mot-de-passe/);
     |                                                                                                                              ^ Error: locator.click: Test timeout of 120000ms exceeded.
  19 |  await page.getByLabel('Nouveau mot de passe',{exact:true}).fill(password);await page.getByLabel('Confirmation',{exact:true}).fill(password);
  20 |  if(await page.getByRole('checkbox',{name:/accepte les conditions/}).count())await page.getByRole('checkbox',{name:/accepte les conditions/}).check();
  21 |  await page.getByRole('button',{name:/Changer le mot de passe|Créer mon mot de passe|Valider/}).click();await expect(page).toHaveURL(/\/espace\/[a-f0-9-]{36}/);
  22 |  await page.screenshot({path:info.outputPath('proprietaire-inscrit.png'),fullPage:true});
  23 |  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  24 |  await context.clearCookies();await page.goto('/mot-de-passe-oublie');await page.getByLabel('Adresse e-mail').fill(email);await page.getByRole('button',{name:'Envoyer le lien',exact:true}).click();await expect(page.getByText(/Si un compte existe/)).toBeVisible();
  25 |  await page.goto(await dernierLien());await page.getByRole('button',{name:'Choisir mon mot de passe',exact:true}).click();await expect(page).toHaveURL(/nouveau-mot-de-passe/);
  26 |  await page.getByLabel('Nouveau mot de passe',{exact:true}).fill(password+'-suite');await page.getByLabel('Confirmation',{exact:true}).fill(password+'-suite');await page.getByRole('button',{name:'Changer le mot de passe',exact:true}).click();await expect(page).toHaveURL(/connexion/);
  27 |  await page.getByLabel('Adresse e-mail',{exact:true}).fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(password+'-suite');await page.getByRole('button',{name:'Se connecter',exact:true}).click();await expect(page).toHaveURL(/\/espace\/[a-f0-9-]{36}/);
  28 | });
  29 | 
```