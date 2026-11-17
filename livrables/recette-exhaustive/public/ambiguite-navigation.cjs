/* Contrôler les quelques destinations interrompues pendant un changement de vue. */
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect:baseExpect}=app('@playwright/test'),expect=baseExpect.configure({timeout:45000});
const base='http://127.0.0.1:3483',preuves=[];
async function tester(p,largeur,route,nom,action){
 const resultat={largeur,route,commande:nom};
 try{await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:100000}); await p.locator('h1:visible').first().waitFor({timeout:40000});const detail=await action();Object.assign(resultat,{statut:'réussi',observe:detail});}
 catch(e){resultat.statut='échec';resultat.observe=String(e.message).replace(/\s+/g,' ').slice(0,500);resultat.url=p.url().replace(base,'');resultat.titre=await p.locator('h1:visible').first().textContent({timeout:2000}).catch(()=>'');}
 preuves.push(resultat);fs.writeFileSync(path.join(__dirname,'preuves','navigation-ciblee.json'),JSON.stringify(preuves,null,1));
}
(async()=>{const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});
try{for(const largeur of [390,768,1440]){const p=await b.newPage({viewport:{width:largeur,height:940},hasTouch:largeur!==1440,locale:'fr-FR'});const s=p.locator('details.public-menu-mobile summary');p.setDefaultTimeout(40000);
 if(largeur<1440){
  await tester(p,largeur,'/agences','Menu du site — Entrée puis Échap',async()=>{
   await expect.poll(()=>s.evaluate(e=>Object.keys(e.parentElement).some(k=>k.startsWith('__reactProps')))).toBe(true);
   await s.focus();await s.press('Enter');await expect.poll(()=>s.evaluate(e=>e.parentElement.open)).toBe(true);await s.press('Escape');await expect.poll(()=>s.evaluate(e=>e.parentElement.open===false&&e===document.activeElement)).toBe(true);return 'Ouverture, fermeture et retour du focus au sommaire'});
  await tester(p,largeur,'/agences','Les espaces Gerimmo — ancre depuis une autre page',async()=>{
   await s.click();await p.getByRole('link',{name:'Les espaces Gerimmo'}).click();
   await expect(p).toHaveURL(base+'/#espaces');const dest=p.locator('section#espaces');await expect(dest).toBeVisible();const titre=await dest.getByRole('heading').first().textContent();return 'Titre visible dans la section cible : '+titre});
 }
 await tester(p,largeur,'/artisan/inscription','Aller au contenu',async()=>{const a=p.getByRole('link',{name:'Aller au contenu'});await expect.poll(()=>a.evaluate(e=>Object.keys(e).some(k=>k.startsWith('__reactProps')))).toBe(true);await a.focus();await a.press('Enter');await expect.poll(()=>p.evaluate(()=>document.activeElement?.id==='contenu-espace'||document.activeElement?.tagName==='MAIN')).toBe(true);return 'Focus clavier constaté sur le contenu';});
 await tester(p,largeur,'/journal/guide-public-fictif-recette','Illustration de l’article',async()=>{const image=p.locator('main img').first();await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);return 'Image réellement décodée ('+await image.evaluate(e=>e.naturalWidth+' × '+e.naturalHeight)+')';});await p.close();
 }}finally{await b.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
