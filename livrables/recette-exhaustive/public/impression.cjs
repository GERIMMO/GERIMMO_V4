/* Cliquer le vrai bouton, constater l'appel à l'impression native puis enregistrer
   avec le moteur PDF de Chromium, sans imprimante ni courrier externe. */
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect:baseExpect}=app('@playwright/test'),expect=baseExpect.configure({timeout:40000});
const base='http://127.0.0.1:3483',d=path.join(__dirname,'preuves/impression');fs.mkdirSync(d,{recursive:true});
const bilans=[];
(async()=>{const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});
try{for(const viewport of [390,768,1440])for(const document of ['quittance','lettre']){const p=await b.newPage({viewport:{width:viewport,height:940},locale:'fr-FR'});const state={viewport,document};try{
 await p.addInitScript(()=>{window.nombreImpressions=0;const imprimer=window.print.bind(window);window.print=(...args)=>{window.nombreImpressions++;return imprimer(...args);};});
 const quittance=document==='quittance';const route=quittance?'/outils/quittance-de-loyer':'/outils/calcul-irl';state.route=route;
 await p.goto(base+route,{waitUntil:'domcontentloaded',timeout:90000});const date=p.locator(quittance?'#q-date':'#irl-date-lettre');
 await expect(date).not.toHaveValue('');
 const champs=quittance?{'q-bailleur':'Camille des Tilleuls','q-bailleur-adresse':'3 rue du Tilleul','q-locataire':'Alix des Lilas','q-logement':'7 rue du Tilleul','q-loyer':'900','q-charges':'70','q-recu':'970'}:{'irl-bailleur-nom':'Camille des Tilleuls','irl-bailleur-adresse':'3 rue du Tilleul','irl-locataire-nom':'Alix des Lilas','irl-logement':'7 rue du Tilleul 69003 Lyon','irl-date-effet':'2026-12-01'};
 for(const [id,v] of Object.entries(champs))await p.locator('#'+id).fill(v);
 const doc=p.locator('#'+document);await expect(doc).toContainText('Camille des Tilleuls');await expect(doc).toContainText('Alix des Lilas');
 await p.getByRole('button',{name:quittance?'Imprimer la quittance':'Imprimer la lettre',exact:true}).click();await expect.poll(()=>p.evaluate(()=>window.nombreImpressions)).toBe(1);
 const fichier=document+'-'+viewport+'.pdf';await p.pdf({path:path.join(d,fichier),format:'A4',printBackground:true,preferCSSPageSize:true});
 Object.assign(state,{statut:'produit',fichier,promesse:'Ouverture de l’impression locale',appelsNatifs:1});
 }catch(e){state.statut='bloqué';state.motif=e.message.replace(/\s+/g,' ').slice(0,300);}finally{await p.close();}
 bilans.push(state);fs.writeFileSync(path.join(d,'resultats.json'),JSON.stringify(bilans,null,1));
}}finally{await b.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
