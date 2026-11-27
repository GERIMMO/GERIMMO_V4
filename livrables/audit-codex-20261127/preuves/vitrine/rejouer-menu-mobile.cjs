const { chromium } = require(require.resolve("playwright", {paths:[process.cwd()]}));
const { writeFile }=require('node:fs/promises');
const path=require('node:path');
const folder=__dirname;
(async () => {
  const browser = await chromium.launch({headless:true,args:['--disable-background-networking']});
  try {
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fr-FR',serviceWorkers:'block'});
    const blocages=[];
    await ctx.route('**/*',r=>{
      const u=new URL(r.request().url());
      const m=r.request().method();
      if(!['GET','HEAD'].includes(m) || !['gerimmo.app','www.gerimmo.app'].includes(u.hostname)) {
        blocages.push(u.hostname+' '+m);
        return r.abort();
      }
      return r.continue();
    });
    const page=await ctx.newPage();
    page.setDefaultTimeout(10000);
    await page.goto('https://www.gerimmo.app/',{waitUntil:'domcontentloaded',timeout:20000});
    const menu=page.locator('summary[aria-label="Menu du site"]');
    const nav=page.getByRole('navigation',{name:'Navigation mobile'});
    await menu.tap();
    await nav.waitFor({state:'visible'});
    await page.screenshot({path:path.join(folder,'menu-ouvert-mobile-390.jpg'),type:'jpeg',quality:85,animations:'disabled'});
    const links=await nav.getByRole('link').allTextContents();
    await menu.press('Escape');
    await nav.waitFor({state:'hidden'});
    const focusRendu=await menu.evaluate(e=>e===document.activeElement);
    await menu.tap();
    await nav.getByRole('link',{name:'Tarifs',exact:true}).tap();
    await page.waitForURL('**/tarifs');
    await nav.waitFor({state:'hidden'});
    const simulateur=page.getByRole('region',{name:'Simuler mon abonnement'});
    const slider=simulateur.getByRole('slider');
    await page.waitForFunction(()=>document.querySelector('input[type=range]')?.disabled===false);
    const geometrie=await slider.evaluate(e=>{
      const r=e.getBoundingClientRect();
      return {largeur:r.width,hauteur:r.height,min:e.min,max:e.max,nomSaisie:e.tagName,taillePasApproximative:r.width/(Number(e.max)-Number(e.min))};
    });
    const saisieNombre=await simulateur.getByRole('spinbutton').count();
    const result={horodatage:new Date().toISOString(),navigateur:'Chromium '+browser.version(),width:390,height:844,menuOuvertViaToucher:true,liensMenu:links,fermetureEchap:true,focusRendu,accesTarifsParMenu:page.url(),menuFermeApresNavigation:true,simulateur:{geometrie,saisieNombre},requetesBloquees:[...new Set(blocages)]};
    await writeFile(path.join(folder,'interactions-mobile-390.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(e=>{console.error(e.name,e.message);process.exitCode=1;});
