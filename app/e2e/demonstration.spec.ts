import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {sansSyntheseAlertes} from './aides';
const matrice=JSON.parse(readFileSync(path.join(__dirname,'matrice-ecrans.json'),'utf8')) as {path:string;persona:string;label:string}[];
// Film de l'application réelle, comptes du seed fictif, aucun envoi ni mutation.
test('démonstration des trois espaces avec données fictives',async({browser,baseURL},info)=>{
 test.skip(process.env.E2E_DEMONSTRATION!=='1','Enregistrement demandé explicitement');test.setTimeout(180000);
 expect(baseURL).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
 const sortie=process.env.E2E_DEMO_DIR??info.outputPath('demonstration');mkdirSync(sortie,{recursive:true});
 const scenarios=[
  {persona:'proprietaire',titre:'Propriétaire · les locations au même endroit',labels:['Accueil du bailleur','Mes lots','Locataires et garants','Loyers du bailleur']},
  {persona:'locataire',titre:'Locataire · le logement et les demandes',labels:['Tableau de bord locataire','Mon logement','Signaler un incident','Mes documents']},
  {persona:'artisan',titre:'Artisan · devis, interventions et factures',labels:['Accueil artisan','Répondre à une demande','Mes factures','Fiche entreprise']},
 ];
 const preuves=[];
 for(const scenario of scenarios){
  const context=await browser.newContext({storageState:path.join(__dirname,'.auth',`${scenario.persona}.json`),viewport:{width:1440,height:900},isMobile:false,hasTouch:false,recordVideo:{dir:sortie,size:{width:1440,height:900}}});
  const page=await context.newPage();await sansSyntheseAlertes(page);const video=page.video();
  // Étiquette de tournage uniquement : aucune donnée ni fonction de l'app remplacée.
  for(const libelle of scenario.labels){
   let cible=matrice.find(e=>e.persona===scenario.persona&&e.label===libelle);
   if(!cible&&scenario.persona==='artisan'){const route=libelle==='Accueil artisan'?'/artisan':libelle==='Mes factures'?'/artisan/facturation':'/artisan/entreprise';cible=matrice.find(e=>e.persona==='artisan'&&e.path===route);}
   expect(cible,libelle).toBeTruthy();const reponse=await page.goto(cible!.path);expect(reponse?.status()).toBeLessThan(400);await expect(page.locator('h1').first()).toBeVisible();expect(page.url()).not.toContain('/connexion');
   await page.evaluate(titre=>{const bandeau=document.createElement('div');bandeau.textContent=titre+'  •  Démonstration — données fictives';Object.assign(bandeau.style,{position:'fixed',bottom:'18px',left:'50%',transform:'translateX(-50%)',background:'#16324f',color:'#f6e4b4',border:'1px solid #c8a96c',padding:'12px 24px',borderRadius:'12px',font:'600 15px system-ui',zIndex:'99999',whiteSpace:'nowrap',pointerEvents:'none'});document.body.append(bandeau);},scenario.titre);
   await page.waitForTimeout(4000);await page.screenshot({path:path.join(sortie,`${scenario.persona}-${scenario.labels.indexOf(libelle)+1}.png`)});preuves.push({persona:scenario.persona,libelle,chemin:cible!.path,titre:await page.locator('h1').first().innerText()});
  }
  await context.close();await video?.saveAs(path.join(sortie,`demonstration-${scenario.persona}.webm`));
 }
 writeFileSync(path.join(sortie,'preuves-demonstration.json'),JSON.stringify({date:new Date().toISOString(),baseURL,ecrans:preuves,envoiExterne:false,donneesFictives:true},null,2));
});
