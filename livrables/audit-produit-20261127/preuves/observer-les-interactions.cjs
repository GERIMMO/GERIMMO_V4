'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require(path.resolve('node_modules/@playwright/test'));
const base = new URL(process.env.E2E_BASE_URL);
assert(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname));
const dossier = path.resolve(process.argv[2]);
const org = '3c1d1e95-3570-400b-8012-44530be145b1';
const agence = 'c14c3187-1258-4e58-8822-368c6007e3fa';
const temps = Date.now();
function preparer() {
  document.addEventListener('animationstart',e=>{
    const s=getComputedStyle(e.target);const r=e.target.getBoundingClientRect();
    if(r.width>0&&r.height>0) window.mouvements.push({nom:e.animationName,duree:s.animationDuration,delai:s.animationDelay,boucle:s.animationIterationCount==='infinite'});
  },true);
  window.mouvements=[];
  sessionStorage.setItem('gerimmo-synthese-alertes-vue','1');
}
async function commandesActives(page){return page.evaluate(()=>[...new Set(window.mouvements.map(x=>JSON.stringify(x)))].map(x=>JSON.parse(x)));}
async function retour(page, commande, volet) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  return {ferme:!await volet.isVisible(),focusRendu:await commande.evaluate(e=>document.activeElement===e)};
}
async function comparer(page, cible, commande, ouvrir, touche='Escape', preuve) {
  await expect(commande).toBeVisible();
  await commande.focus();
  await page.evaluate(()=>{window.mouvements=[];});
  const instant=Date.now();
  await ouvrir();
  await expect(cible).toBeVisible();
  const ouvertureMs=Date.now()-instant;
  const premierFocus = await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.trim().slice(0,45)||document.activeElement?.tagName);
  await page.waitForTimeout(500);
  const resultats={ouvertureMs,premierFocus,anim:await commandesActives(page)};
  if(preuve) await page.screenshot({path:path.join(dossier,`${preuve}-ouvert.jpg`),type:'jpeg'});
  if(touche==='Escape') Object.assign(resultats,await retour(page,commande,cible));
  if(preuve) await page.screenshot({path:path.join(dossier,`${preuve}-apres-echap.jpg`),type:'jpeg'});
  return resultats;
}
const exercices = [
  {id:'menu-vitrine',role:'public',url:'/tarifs',largeurs:[390], executer:async page=>{
    const action=page.locator('summary[aria-label="Menu du site"]');
    return comparer(page,page.getByRole('navigation',{name:'Navigation mobile'}),action,()=>page.keyboard.press('Enter'));
  }},
  ...[['proprietaire',`/espace/${org}`],['locataire',`/locataire/${agence}`],['artisan','/artisan'],['agent',`/agence/${agence}`],['admin',`/agence/${agence}`],['superadmin','/admin/brief']].map(([role,url])=>({id:'menu-compte',role,url,largeurs:[390,1440],executer:async page=>{
    const action=page.getByRole('button',{name:/Mon compte|Menu de (?:mon )?compte/}).first();
    return comparer(page,page.getByRole('menu').first(),action,()=>page.keyboard.press('Enter'));
  }})),
  {id:'apercu-bail',role:'locataire',url:`/locataire/${agence}/documents`,largeurs:[390,1440],executer:async page=>{
    await page.getByRole('tab',{name:'Mes fichiers',exact:true}).click();
    const action=page.getByRole('button',{name:/^Bail signé/});
    return comparer(page,page.getByRole('dialog',{name:'Bail signé',exact:true}),action,()=>page.keyboard.press('Enter'));
  }},
  {id:'navigation-supervision',role:'superadmin',url:'/admin/brief',largeurs:[390,768],executer:async (page,largeur,mvt)=>{
    const action=page.locator('button[aria-controls="menu-supervision"]');
    await expect(page.getByRole('heading',{name:'Aujourd’hui',exact:true})).toBeVisible();
    return comparer(page,page.locator('#menu-supervision'),action,()=>action.click(),'Escape',`supervision-menu-${largeur}-${mvt}`);
  }},
  {id:'afficher-details',role:'superadmin',url:'/admin/sante',largeurs:[390,1440],executer:async page=>{
    const action=page.locator('details > summary').filter({hasText:/Détails techniques/}).filter({visible:true}).first();
    const panel=action.locator('..').locator(':scope > :not(summary)').first();
    const res=await comparer(page,panel,action,()=>page.keyboard.press('Enter'),'natif');
    await action.focus(); await page.keyboard.press('Enter');
    res.ferme=!await panel.isVisible(); res.focusRendu=await action.evaluate(e=>e===document.activeElement);
    return res;
  }},
  {id:'agenda-artisan',role:'artisan',url:'/artisan/agenda',largeurs:[390,768,1440],executer:async page=>{
    const semaine=page.locator('.artisan-semaine');
    const compte=await semaine.locator('li').count();
    const styles=await semaine.locator('li').first().evaluate(e=>({transition:getComputedStyle(e).transitionDuration,hauteur:Math.round(e.getBoundingClientRect().height)}));
    return {compte,...styles};
  }},
  {id:'prix-public',role:'public',url:'/tarifs',largeurs:[390,1440],executer:async page=>{
    const slider=page.getByRole('slider');
    await expect(slider).toBeVisible();await slider.focus(); await page.keyboard.press('Home');
    const ancien=await slider.inputValue();await page.keyboard.press('ArrowRight');const suivant=await slider.inputValue();
    assert.equal(Number(suivant),Number(ancien)+1);
    return {ancien,suivant,styles:await slider.evaluate(e=>({hauteur:e.getBoundingClientRect().height,accent:getComputedStyle(e).accentColor}))};
  }},
];
(async()=> {
  const b=await chromium.launch({args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  const filtre=new Set(process.argv.slice(3));
  const entrees=exercices.filter(e=>filtre.size===0||filtre.has(e.id)).flatMap(t=>t.largeurs.flatMap(px=>['no-preference','reduce'].map(mvt=>({t,px,mvt}))));
  const fichier=path.join(dossier,filtre.size?`interactions-${[...filtre].join('-')}.jsonl`:'interactions.jsonl');fs.writeFileSync(fichier,'');
  async function executer(){while(entrees.length){const {t,px,mvt}=entrees.shift();const ctx=await b.newContext({baseURL:base.origin,viewport:{width:px,height:844},isMobile:px<800,hasTouch:px<800,locale:'fr-FR',reducedMotion:mvt,storageState:t.role==='public'?undefined:`e2e/.auth/${t.role}.json`});
    await ctx.route('**/*',r=>{ const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||!['https:','http:'].includes(u.protocol)?r.continue():r.abort(); });
    await ctx.addInitScript(preparer);
    const page=await ctx.newPage();const res={id:t.id,role:t.role,largeur:px,mouvement:mvt};
    try{page.setDefaultTimeout(6500);expect.configure({timeout:6000});await page.goto(t.url,{waitUntil:'load',timeout:13000});await page.locator('h1:visible').first().waitFor({state:'visible',timeout:4500}).catch(()=>{});await page.waitForTimeout(450);res.entree=await commandesActives(page);res.final=new URL(page.url()).pathname;Object.assign(res,await t.executer(page,px,mvt));}
    catch(e){res.erreur=String(e).split('\n').slice(0,5).join(' ').slice(0,460);}
    finally{fs.appendFileSync(fichier,JSON.stringify(res)+'\n');await ctx.close();}
  }}
  try{await Promise.all(Array.from({length:3},executer));}finally{await b.close();}
  console.log('Relevés clavier et mouvement terminés',Math.round((Date.now()-temps)/1000),'s');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
