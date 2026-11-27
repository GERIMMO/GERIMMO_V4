const {chromium}=require(require.resolve("playwright", {paths:[process.cwd()]}));
const {writeFile}=require('node:fs/promises');
const path=require('node:path');
const folder=__dirname;
const site='https://www.gerimmo.app';
const configurations=[
 {format:'ordinateur',width:1440,height:1000},
 {format:'intermediaire',width:768,height:1024},
 {format:'mobile-390',width:390,height:844},
];
const prix={1:['5,99','59,90'],7:['17,93','179,30'],8:['19,90','199,00'],20:['19,90','199,00'],21:['20,89','208,90'],100:['99,10','991,00']};
async function main(){
 const browser=await chromium.launch({headless:true,args:['--disable-background-networking']});
 const compte={horodatage:new Date().toISOString(),navigateur:'Chromium '+browser.version(),controles:[]};
 try {
  for(const {format,width,height} of configurations){
   const context=await browser.newContext({viewport:{width,height},locale:'fr-FR',timezoneId:'Europe/Paris',isMobile:format==='mobile-390',hasTouch:format==='mobile-390',serviceWorkers:'block'});
   const blocages=[];
   await context.route('**/*',r=>{
    const u=new URL(r.request().url());
    if(!['GET','HEAD'].includes(r.request().method()) || !['gerimmo.app','www.gerimmo.app'].includes(u.hostname)){
      blocages.push([u.hostname,r.request().method()]);return r.abort();
    }
    return r.continue();
   });
   const page=await context.newPage();
   page.setDefaultTimeout(10000);
   const result={format,width,height,prix:[],blocages};
   try{
    await page.goto(site+'/tarifs',{waitUntil:'domcontentloaded'});
    const simulateur=page.getByRole('region',{name:'Simuler mon abonnement'});
    const curseur=simulateur.getByRole('slider');
    await page.waitForFunction(()=>document.querySelector('input[type=range]')?.disabled===false);
    const mensuel=simulateur.getByRole('button',{name:'Mensuel',exact:true});
    const annuel=simulateur.getByRole('button',{name:'Annuel',exact:true});
    let actuel=1;
    for(const biens of [1,7,8,20,21,100]){
     if (biens===100) await curseur.press('End');
     else while(actuel<biens){await curseur.press('ArrowRight');actuel++;}
     await mensuel.click();
     const m=await simulateur.locator('.offre-prix').innerText();
     await annuel.click();
     const a=await simulateur.locator('.offre-prix').innerText();
     result.prix.push({biensAttendus:biens,biens:Number(await curseur.inputValue()),mensuel:m,annuel:a,conformeAuTarifAnnonce:m.startsWith(prix[biens][0])&&a.startsWith(prix[biens][1])});
     if(biens===21)await simulateur.screenshot({path:path.join(folder,'simulateur-21-'+format+'.jpg'),type:'jpeg',quality:85,animations:'disabled'});
    }
    const link=simulateur.getByRole('link',{name:'Commencer mon essai gratuit',exact:true});
    await link.click();
    await page.waitForURL(/\/inscription(?:\?|$)/);
    result.lienInscription={url:page.url(),titre:await page.getByRole('heading',{level:1}).innerText()};
    result.largeurDoc=await page.evaluate(()=>document.documentElement.scrollWidth);
   }catch(e){result.erreur=e.message.slice(0,400);}
   result.blocages=[...new Set(blocages.map(x=>x.join(' ')))];
   compte.controles.push(result);
   await context.close();
  }
 } finally {
  await browser.close();
  await writeFile(path.join(folder,'interactions-tarifs.json'),JSON.stringify(compte,null,2)+'\n');
  console.log(JSON.stringify(compte,null,2));
 }
}
main().catch(e=>{console.error(e.name,e.message);process.exitCode=1});
