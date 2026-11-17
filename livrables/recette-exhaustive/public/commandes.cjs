/* Actions réelles sur les cinq outils et le calculateur tarifaire. Les services externes restent inaccessibles. */
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect}=app('@playwright/test');
const origin=new URL(process.env.RECETTE_URL||'http://127.0.0.1:3483');
if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Banc local requis');
const largeur=Number(process.argv[2])||390;
const sortie=path.join(__dirname,'preuves');
const lignes=[];
const bref=s=>String(s).replace(/\s+/g,' ').slice(0,180);
const agents=['/outils/simulateur-lmnp','/outils/comparateur-gli-visale','/outils/rentabilite-locative','/outils/quittance-de-loyer','/outils/calcul-irl','/tarifs'];
async function explorer(page,route){
 await page.goto(new URL(route,origin).href,{waitUntil:'domcontentloaded'});
 if(route.includes('quittance'))await expect(page.locator('#q-date')).not.toHaveValue('');
 if(route.includes('calcul-irl')){
  await expect(page.getByTestId('irl-serie-indisponible').or(page.getByRole('button',{name:'Saisir les indices moi-même'})).first()).toBeVisible();
  if(await page.getByRole('button',{name:'Saisir les indices moi-même'}).isVisible())await page.getByRole('button',{name:'Saisir les indices moi-même'}).click();
  for(const [id,v] of [['irl-loyer','850'],['irl-indice-ref','146,68'],['irl-indice-nouv','148,37']])await page.locator('#'+id).fill(v);
  await page.locator('#irl-annee-ref').selectOption('2025');await page.locator('#irl-annee-nouv').selectOption('2026');
  for(const nom of ['irl-trim-ref','irl-trim-nouv'])await page.locator('input[name="'+nom+'"]').nth(1).check();
 }
 const unique=new Set();
 const info=locator=>locator.evaluate(e=>({id:e.id,champ:e.name||'',type:e.type||'',choix:e.value||'',tag:e.tagName.toLowerCase(),nom:(e.labels?.[0]?.innerText||e.innerText||e.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim()}));
 const resultat=()=>page.locator('section.outil-resultat, #lettre, #quittance, #lmnp-reporte, .offre-publique [aria-live], [data-testid="lmnp-reporte"]').allTextContents().then(a=>a.join('\n').replace(/\s+/g,' ').trim());
 async function action(el,detail,nom,operation){
  if(unique.has(nom))return;unique.add(nom);
  const ligne={route,largeur,role:'public',commande:detail.nom,domId:detail.id,champ:detail.champ,valeurChoix:detail.type==='radio'?detail.choix:'',type:detail.type,scenario:nom,effectue:false};
  try{const r=await operation();Object.assign(ligne,r,{effectue:true});}
  catch(e){Object.assign(ligne,{statut:'échec',observe:bref(e.message)});}
  lignes.push(ligne);return ligne;
 }
 if(route==='/tarifs'){
  const input=page.getByRole('slider'),zone=page.locator('.offre-prix');
  for(const [nombre,mois,an] of [[3,'9,97','99,70'],[8,'19,90','199,00'],[21,'20,89','208,90']]){
   for(const [periode,prix] of [['Mensuel',mois],['Annuel',an]]){
    const selecteur=page.getByRole('button',{name:periode,exact:true});
    await action(input,await info(input),'Barème à '+nombre+' biens en '+periode,async()=>{
     await input.focus();await input.press('Home');for(let i=1;i<nombre;i++)await input.press('ArrowRight');
     await selecteur.click();await expect(zone).toContainText(prix);await expect(selecteur).toHaveAttribute('aria-pressed','true');
     return {statut:'réussi',attendu:prix,observe:bref(await zone.innerText())};
    });
    await action(selecteur,await info(selecteur),'Période tarifaire '+periode,async()=>{
     await page.getByRole('button',{name:periode==='Mensuel'?'Annuel':'Mensuel',exact:true}).click();
     await selecteur.click();await expect(zone).toContainText(prix);return {statut:'réussi',attendu:prix,observe:bref(await zone.innerText())};
    });
   }
  }
  return;
 }
 // Forcer les états conditionnels (achat sans crédit, crédit connu, âge, indices manuels) afin d'inclure leurs champs.
 const accessibles=new Map();
 async function collecter(){
  for(const el of await page.locator('main input:not([type=hidden]), main select').all()){
   if(!await el.isVisible())continue;
   const d=await info(el);
   const key=d.id?'#'+d.id:'input[name="'+d.champ+'"][value="'+d.choix+'"]';
   if(!d.id&&!d.champ)continue;
   accessibles.set(key,d);
  }
 }
 await collecter();
 for(let passe=0;passe<3;passe++){
  for(const [key,d] of [...accessibles]){
   const el=page.locator(key);
   if(!await el.isVisible())continue;
   const nom='Modifier '+key;
   if(unique.has(nom))continue;
   await action(el,d,nom,async()=>{
    let avant=await resultat();
    let valeur,verif='',apres;
    if(d.type==='radio'||d.type==='checkbox'){
     if(d.type==='checkbox')await el.setChecked(!await el.isChecked());
     else{
      if(await el.isChecked()){
       const autres=await page.locator('input[type=radio][name="'+d.champ+'"]').all();
       const aut=await Promise.all(autres.map(async a=>!await a.isChecked()?a:null));
       if(aut.filter(Boolean)[0])await aut.filter(Boolean)[0].check();
       avant=await resultat();
      }
      await el.check();
     }
     valeur=await el.isChecked();verif='option sélectionnée '+valeur;
    }else if(d.tag==='select'){
     const val=await el.inputValue(),opt=await el.locator('option').evaluateAll(a=>a.map(o=>o.value));
     const choix=d.id==='cmp-situation'?'autre':d.id?.includes('annee')?String(Number(val)+1):opt.find(x=>x!==val);
     await el.selectOption(opt.includes(choix)?choix:opt.find(x=>x!==val));
     verif='option '+await el.inputValue();
    }else{
     const old=await el.inputValue();
     if(d.type==='month')valeur='2027-02';
     else if(d.type==='date')valeur=d.id.includes('effet')?'2027-04-01':'2026-11-25';
     else if(d.id==='irl-logement')valeur='12 rue du Tilleul, Lyon';
     else if(/(?:nom|bailleur|locataire|logement|adresse)/.test(d.id))valeur='Exemple Tilleul';
     else valeur=String(Number((old||'100').replace(/\s/g,'').replace(',','.'))+(/duree|duree-|taux|indice|terrain|vacance/.test(d.id)?1:23));
     await el.fill(valeur);await expect(el).toHaveValue(valeur);verif='saisie '+valeur;
    }
    await collecter();apres=await resultat();
    const diff=avant!==apres;
    const motsAvant=avant.split(' '),motsApres=apres.split(' ');let pos=0;while(pos<motsApres.length&&motsAvant[pos]===motsApres[pos])pos++;
    const extrait=motsApres.slice(Math.max(0,pos-4),pos+16).join(' ');
    return {statut:diff?'réussi':'attendu',attendu:'Sélection puis vérification de son effet sur le résultat ou le document',observe:diff?verif+' → '+bref(extrait):verif+' ; aucun changement du texte du résultat pour cette combinaison',effetVerifie:diff};
   });
  }
  await collecter();
 }
}
(async()=>{
 const navigateur=await chromium.launch({args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--disable-background-networking']});
 try{for(const route of agents){
  const page=await navigateur.newPage({viewport:{width:largeur,height:largeur===1440?960:844},hasTouch:largeur<1440,locale:'fr-FR'});
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/]|localhost[:/])/,r=>r.abort());
  page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(90000);
  try{await explorer(page,route);}catch(e){lignes.push({route,largeur,statut:'bloqué',observe:bref(e.message)});}
  finally{await page.close();fs.mkdirSync(sortie,{recursive:true});fs.writeFileSync(path.join(sortie,'commandes-'+largeur+'.json'),JSON.stringify(lignes,null,1));}
 }}finally{await navigateur.close();}
})();
