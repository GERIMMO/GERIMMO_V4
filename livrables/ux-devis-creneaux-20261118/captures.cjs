const fs=require('fs'),path=require('path');
const app=path.resolve(__dirname,'../../app');
if(!process.env.GERIMMO_SESSION_FICTIVE) throw new Error('Une session fictive locale est requise.');
const {chromium}=require(app+'/node_modules/@playwright/test');
const phase=process.argv[2]||'avant';
const routes={devis:'/artisan/devis/35c64080-537d-48c2-b6ed-37b6fec53402',creneaux:'/artisan/missions/e84ee8d9-8252-4054-ae65-501a7a3e7452/creneaux'};
(async()=>{
 const b=await chromium.launch();try{
 for(const width of [390,1440])for(const [nom,url] of Object.entries(routes)){
  const c=await b.newContext({locale:'fr-FR',baseURL:'http://localhost:3100',storageState:process.env.GERIMMO_SESSION_FICTIVE,viewport:{width,height:1000}});
  await c.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)&&r.request().method()==='GET'?r.continue():r.abort()});
  const p=await c.newPage();await p.goto(url,{waitUntil:'networkidle'});
  if(nom==='devis'){await p.getByLabel('Ligne 1 : prestation',{exact:true}).fill('Remplacement du joint');await p.getByLabel('Ligne 1 : prix unitaire HT',{exact:true}).fill('65');}
  await p.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await p.screenshot({path:path.join(__dirname,phase+'-'+nom+'-'+width+'.png'),fullPage:true});
  fs.writeFileSync(path.join(__dirname,phase+'-'+nom+'-'+width+'.txt'),await p.locator('main').innerText());
  console.log(phase,nom,width);await c.close();
 }
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exit(1)});
