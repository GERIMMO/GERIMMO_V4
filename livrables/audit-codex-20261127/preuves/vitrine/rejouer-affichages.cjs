const { chromium } = require(require.resolve("playwright", {paths:[process.cwd()]}));
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const site = 'https://www.gerimmo.app';
const folder = __dirname;
const paths = [
  ['accueil','/'], ['tarifs','/tarifs'], ['inscription','/inscription'], ['agences','/agences'],
  ['mentions','/mentions-legales'], ['conditions','/conditions'], ['outils','/outils'], ['artisan','/artisan/inscription'],
];
const views = [
  { label:'ordinateur', viewport:{width:1440,height:1000}, deviceScaleFactor:1 },
  { label:'mobile-390', viewport:{width:390,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true },
];
async function main() {
  await mkdir(folder, {recursive:true});
  const browser = await chromium.launch({headless:true, args:['--disable-background-networking']});
  const results = {horodatage:new Date().toISOString(), navigateur:'Chromium '+browser.version(), controles:[]};
  try {
    for (const {label,...view} of views) {
      const context = await browser.newContext({...view, serviceWorkers:'block', locale:'fr-FR', timezoneId:'Europe/Paris'});
      const rejects = new Set();
      await context.route('**/*', route => {
        const u = new URL(route.request().url());
        const m = route.request().method();
        if (!['GET','HEAD'].includes(m) || !['www.gerimmo.app','gerimmo.app'].includes(u.hostname)) {
          rejects.add(u.hostname+' '+m);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      for (const [key,route] of paths) {
        try {
          const response = await page.goto(site+route, {waitUntil:'domcontentloaded',timeout:25000});
          await page.locator('h1').first().waitFor({state:'visible'});
          await page.evaluate(async()=>{ await document.fonts.ready; });
          const screen = await page.evaluate(()=>{
            const target = document.querySelector('main') || document.body;
            return {
              h1:[...target.querySelectorAll('h1')].map(h=>h.innerText),
              titres:[...target.querySelectorAll('h2,h3')].map(h=>h.innerText),
              texte:target.innerText,
              page:{largeur:innerWidth,hauteur:innerHeight,largeur_document:document.documentElement.scrollWidth},
              liens:[...document.querySelectorAll('a[href]')].filter(a=>a.getClientRects().length>0)
                .map(a=>({texte:a.innerText.trim()||a.getAttribute('aria-label')||'',href:a.getAttribute('href')})),
              boutons:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length>0)
                .map(b=>({texte:b.innerText.trim()||b.getAttribute('aria-label')||'',largeur:Math.round(b.getBoundingClientRect().width),hauteur:Math.round(b.getBoundingClientRect().height)})),
            };
          });
          const base = key+'-'+label;
          const photo = base+'.jpg';
          await page.screenshot({path:path.join(folder,photo),type:'jpeg',quality:84,fullPage:!['conditions','mentions'].includes(key),animations:'disabled',timeout:15000});
          await writeFile(path.join(folder,base+'.txt'), screen.texte+'\n');
          delete screen.texte;
          results.controles.push({route,format:label,http:response?.status(),url:page.url(),photo,...screen});
        } catch(e) {
          results.controles.push({route,format:label,erreur:e.message.slice(0,400)});
        }
      }
      results['requetes_bloquees_'+label]=[...rejects];
      await context.close();
    }
  } finally {
    await browser.close();
    await writeFile(path.join(folder,'mesures.json'), JSON.stringify(results,null,2)+'\n');
    const all=results.controles.map(({route,format,http,h1,page,erreur})=>({route,format,http,h1,page,erreur}));
    console.log(JSON.stringify({navigateur:results.navigateur,controles:all},null,2));
  }
}
main().catch(e=>{console.error(e.name,e.message);process.exitCode=1});
