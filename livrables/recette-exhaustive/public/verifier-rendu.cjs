// Pour les pages différées : attendre le contenu visible et deux mesures stables avant la capture.
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect}=app('@playwright/test');
const url='http://127.0.0.1:3483';
const dir=path.join(__dirname,'preuves');
const largeur=Number(process.argv[2])||390;
async function main(){
 const visuel=JSON.parse(fs.readFileSync(path.join(dir,'public-'+largeur+'-visuel.json'),'utf8'));
 const cible=process.argv[3];
 const rendu=path.join(dir,'rendu-'+largeur+'.json');
 const mesure=cible&&fs.existsSync(rendu)?JSON.parse(fs.readFileSync(rendu,'utf8')).filter(r=>r.route!==cible):[];
 const browser=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});
 const ctx=await browser.newContext({viewport:{width:largeur,height:largeur===1440?960:844},hasTouch:largeur<1440,locale:'fr-FR',serviceWorkers:'block'}),p=await ctx.newPage();
 p.setDefaultNavigationTimeout(60000);
 try{for(const initial of visuel.pages.filter(r=>!cible||r.route===cible)){
  const route=initial.route,chemin=initial.chemin,etat={route,chemin,largeur};
  try{
   await p.goto(new URL(chemin,url).href,{waitUntil:'domcontentloaded'});
   if(route==='/nouveau-mot-de-passe')await p.waitForURL('**/connexion**');
   await p.locator('h1:visible').first().waitFor({timeout:14000});
   await expect.poll(()=>p.locator('main:visible').first().innerText().then(s=>s.length),{timeout:15000}).toBeGreaterThan(45);
   if(route==='/connexion'||route==='/inscription'||route==='/nouveau-mot-de-passe')await p.locator('form input:visible').first().waitFor();
   await p.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))]));
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const rendu=await p.evaluate(()=>({debordement:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),titre:[...document.querySelectorAll('h1')].find(h=>h.getBoundingClientRect().height>0)?.innerText,extrait:(document.querySelector('main')?.innerText||'').replace(/\s+/g,' ').slice(0,160),largeurPage:document.documentElement.clientWidth}));
   Object.assign(etat,rendu,{capture:initial.capture??'captures/'+largeur+'--'+route.split('/').at(-1)+'.jpg',urlFinale:new URL(p.url()).pathname,statut:'rendu'});
   await p.screenshot({path:path.join(dir,etat.capture),type:'jpeg',quality:68,animations:'disabled',timeout:20000});
   if(rendu.debordement)etat.elements=await p.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.tagName+' '+e.className));
  }catch(e){etat.statut='incomplet';etat.motif=e.message.replace(/\s+/g,' ').slice(0,160);}
  mesure.push(etat);
  fs.writeFileSync(rendu,JSON.stringify(mesure,null,1));
 }}finally{await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
