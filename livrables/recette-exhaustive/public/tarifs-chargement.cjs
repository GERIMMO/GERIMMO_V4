// Rejoue une saisie du simulateur pendant le téléchargement du JavaScript puis après sa disponibilité.
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const {chromium,expect}=createRequire(path.resolve(__dirname,'../../../app/package.json'))('@playwright/test');
const site=new URL(process.env.RECETTE_URL||'http://127.0.0.1:3483');
if(!['localhost','127.0.0.1'].includes(site.hostname)||site.protocol!=='http:')throw Error('Banc local requis');
async function main(){
 const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]']});
 const resultats=[];
 try{for(const largeur of [390,768,1440]){
  const p=await b.newPage({viewport:{width:largeur,height:844}});const ctx=p.context();let liberer;
  p.on('pageerror',err=>console.error('Javascript du simulateur :',err.message.slice(0,200)));
  const attente=new Promise(r=>liberer=r);
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(!['localhost','127.0.0.1'].includes(u.hostname))return route.abort();
   if(req.resourceType()==='script')await attente;
   return route.continue();
  });
  try{
   const navigation=p.goto(new URL('/tarifs',site).href,{waitUntil:'commit'});
   await navigation;const curseur=p.getByRole('slider'),montant=p.locator('.offre-prix'),label=p.locator('.offre-nom strong');
   await curseur.waitFor({timeout:60000});
   const avant=await curseur.isEnabled();const mensuel=p.getByRole('button',{name:'Mensuel',exact:true}),annuel=p.getByRole('button',{name:'Annuel',exact:true});
   if(avant){await curseur.press('Home');await curseur.press('ArrowRight');await curseur.press('ArrowRight');}
   const premier={actif:avant,valeur:await curseur.inputValue(),unitesAffichees:await label.innerText(),prix:await montant.innerText(),boutonsInactifs:!(await mensuel.isEnabled())&&!(await annuel.isEnabled())};
   liberer();await p.waitForLoadState('load',{timeout:90000});await expect(curseur).toBeEnabled({timeout:45000});
   await curseur.press('Home');await curseur.press('ArrowRight');await curseur.press('ArrowRight');
   await expect(label).toHaveText('3');await expect(montant).toContainText('9,97');
   await annuel.click();await expect(montant).toContainText('99,70');
   resultats.push({largeur,pendantChargement:premier,apresChargement:{unites:await label.innerText(),prix:await montant.innerText()}});
  }finally{liberer();await ctx.close();}
 }}finally{await b.close();}
 const phase=process.argv[2];
 if(!['avant','apres'].includes(phase))throw Error('Préciser avant ou apres');
 fs.writeFileSync(path.join(__dirname,'preuves','tarifs-chargement-'+phase+'.json'),JSON.stringify(resultats,null,2)+'\n');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
