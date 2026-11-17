const path = require('node:path');
const fs = require('node:fs');
const app = require('node:module').createRequire(path.resolve(__dirname,'../../../app/package.json'));
const { chromium, expect } = app('@playwright/test');
const base = new URL(process.env.RECETTE_URL || 'http://127.0.0.1:3483');
if(base.hostname!=='127.0.0.1') throw Error('Banc isolé requis');
const corrige=process.argv[2]==='apres';
const etape=corrige?'apres':'avant';
const sortie=path.join(__dirname,'preuves','quittance');
fs.mkdirSync(sortie,{recursive:true});
(async()=>{
 const b=await chromium.launch({args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--disable-background-networking']}); const pages=[];
 try {
  for(const width of [390,768,1440]){
   const p=await b.newPage({viewport:{width,height:900},locale:'fr-FR'});
   await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   p.setDefaultNavigationTimeout(180000);await p.goto(new URL('/outils/quittance-de-loyer',base).href,{waitUntil:'domcontentloaded'});
   await expect(p.locator('#q-date')).not.toHaveValue('');
   for(const [name,loyer,charges,recu] of [['illisible','abc','0','0'],['sans_paiement','850','120','0'],['negatif','-850','120','0'],['trop_percu','850','120','1200'],['partiel','850','120','500'],['solde','850','120','970']]){
    await p.locator('#q-loyer').fill(loyer);await p.locator('#q-charges').fill(charges);await p.locator('#q-recu').fill(recu);
    const doc=p.locator('#quittance');const lecture=async()=>({document:await doc.count()?await doc.innerText():'',impression:await p.getByRole('button',{name:/Imprimer (la quittance|le reçu)/}).count()});
    const observe=await lecture();
    const result={width,scenario:name,loyer,charges,recu,observe,attendu:['illisible','sans_paiement','negatif'].includes(name)?'Aucun document, aucune impression':name==='trop_percu'?'970 € affectés au terme, 230 € non affectés':name==='partiel'?'Reçu de paiement partiel, reste 470 €':'Quittance du terme de 970 €'};
    if(['illisible','sans_paiement','negatif'].includes(name)){result.reussi=!observe.document&&!observe.impression;}
    else if(name==='trop_percu'){result.reussi=/230,00\s*€/.test(observe.document)&&/970,00\s*€/.test(observe.document);}
    else if(name==='partiel'){result.reussi=/470,00\s*€/.test(observe.document)&&/ne vaut pas quittance/.test(observe.document);}
    else {result.reussi=/Quittance de loyer/.test(observe.document)&&/970,00\s*€/.test(observe.document);}
    result.capture=etape+'-'+width+'-'+name+'.jpg';
    const cible=await doc.count()?doc:p.locator('[aria-labelledby="q-resultat"]');
    await cible.screenshot({path:path.join(sortie,result.capture),type:'jpeg',quality:68});
    pages.push(result);
   }
   await p.close();
  }
 } finally {await b.close();fs.writeFileSync(path.join(sortie,etape+'.json'),JSON.stringify(pages,null,1));}
 console.log(etape,pages.length,'cas',pages.filter(a=>a.reussi).length,'réussis');
 if(corrige&&pages.some(a=>!a.reussi))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
