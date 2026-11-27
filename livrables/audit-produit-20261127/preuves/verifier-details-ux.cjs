'use strict';
const path=require('node:path');
const {chromium,expect}=require(path.resolve('node_modules/@playwright/test'));
const assert=require('node:assert/strict');
const site=new URL(process.env.E2E_BASE_URL);assert.equal(site.origin,'http://localhost:3247');
const org='3c1d1e95-3570-400b-8012-44530be145b1';
const agence='c14c3187-1258-4e58-8822-368c6007e3fa';
const sortie=path.resolve(process.argv[2]);
(async()=>{
const browser=await chromium.launch({args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
for (const width of [390,1440]) for (const role of ['public','proprietaire','locataire','admin','agent']) {
 const ctx=await browser.newContext({baseURL:site.origin,locale:'fr-FR',viewport:{width,height:width<800?844:1000},isMobile:width<800,hasTouch:width<800,storageState:role==='public'?undefined:`e2e/.auth/${role}.json`});
 const page=await ctx.newPage(); page.setDefaultTimeout(9000);
 await ctx.route('**/*',r=>{let u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)?r.continue():r.abort()});
 await ctx.addInitScript(()=>sessionStorage.setItem('gerimmo-synthese-alertes-vue','1'));
 let result={width,role};
 try {
 if(role==='public'){
   await page.goto('/inscription');const bouton=page.getByRole('button',{name:'Ouvrir mon espace',exact:true});
   await expect(bouton).toBeVisible();
   result.boutonY=Math.round((await bouton.boundingBox()).y);result.boutonBas=Math.round((await bouton.boundingBox()).y+(await bouton.boundingBox()).height);
   result.champs=await page.locator('form input:not([type=hidden]),form select').evaluateAll(a=>a.filter(e=>e.getClientRects().length).map(e=>e.getAttribute('name')));
   await page.goto('/');await expect(page.locator('h1 em')).toBeVisible();
   result.couleurs=await page.locator('.public-hero-texte').evaluate(e=>['h1 em','.public-chapo','.public-note'].map(s=>{const el=e.querySelector(s);if(!el)return null;let p=el,list=[];while(p){const style=getComputedStyle(p);if(style.backgroundColor!=='rgba(0, 0, 0, 0)'||style.backgroundImage!=='none')list.push({fond:style.backgroundColor,image:style.backgroundImage!=='none'});p=p.parentElement;}const style=getComputedStyle(el);return {s,texte:style.color,taille:style.fontSize,calques:list};}));
 }
 if(role==='proprietaire'){
   await page.goto(`/espace/${org}/loyers`);const sel=page.getByRole('combobox',{name:'Patrimoine',exact:true});
   await expect(sel).toBeVisible();
   result.filtre=await sel.evaluate(el=>{const style=getComputedStyle(el), canvas=document.createElement('canvas').getContext('2d');canvas.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const libelle=el.selectedOptions[0].text;return {libelle,largeur:Math.round(el.clientWidth),texte:Math.round(canvas.measureText(libelle).width),padding:parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),sci:[...el.options].filter(o=>/SCI/.test(o.text)).length};});
   const sci=sel.locator('option').filter({hasText:/SCI/}).first();
   if(await sci.count()){
    await sel.selectOption(await sci.getAttribute('value'));
    await page.getByRole('button',{name:'Afficher',exact:true}).click();
    await page.waitForURL(u=>u.searchParams.has('entite'));
    await expect(page.getByText(/Loyers attribuables à/)).toBeVisible();
    result.perimetre=true;
    await page.screenshot({path:path.join(sortie,`finance-sci-${width}.jpg`),type:'jpeg'});
   }
 }
 if(role==='locataire'){
   await page.goto(`/locataire/${agence}/demandes`);
   const demande=page.getByRole('heading',{name:'Mes demandes',exact:true});await expect(demande).toBeVisible();
   const coord=page.getByRole('link',{name:/Choisir mon créneau/}).first();
   if(await coord.count()){
     await coord.click(); await expect(page.getByText(/Choisissez votre rendez-vous/).first()).toBeVisible();
     result.rdv={chemin:new URL(page.url()).pathname.replace(agence,'[orgId]'),ancre:new URL(page.url()).hash!==''};
   }
 }
 if(role==='admin'||role==='agent'){
   await page.goto(`/agence/${agence}`); await expect(page.getByRole('heading',{name:/Bonjour/}).first()).toBeVisible();
   result.texteAlerte=await page.getByText(/Les relances locatives et les avis d’échéance par courriel restent suspendus/).count();
   result.activer=await page.getByRole('link',{name:'Activer',exact:true}).count()+await page.getByRole('button',{name:'Activer',exact:true}).count();
   await page.goto(`/agence/${agence}/administration`);await page.waitForTimeout(350);result.adminRoute=new URL(page.url()).pathname.replace(agence,'[orgId]');
   result.accesConfiguration=await page.getByRole('heading',{name:/Administration|Autorisations/}).count();
 }
 }catch(e){result.erreur=String(e).split('\n').slice(0,3).join(' ').slice(0,300);}
 console.log(JSON.stringify(result)); await ctx.close();
}
await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
