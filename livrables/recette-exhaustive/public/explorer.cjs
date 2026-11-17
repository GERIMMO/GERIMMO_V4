/* Recette publique sur le banc fictif de la PR. Lancer avec node explorer.cjs [390|768|1440]. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const racine = path.resolve(__dirname, '../../..');
const app = createRequire(path.join(racine, 'app/package.json'));
const { chromium, expect } = app('@playwright/test');
const axe = app.resolve('axe-core/axe.min.js');
const base = new URL(process.env.RECETTE_URL || 'http://127.0.0.1:3483');
if (!['127.0.0.1','localhost'].includes(base.hostname) || base.protocol !== 'http:') throw Error('Banc fictif loopback requis');
const largeur = Number(process.argv[2] || 390);
if (![390,768,1440].includes(largeur)) throw Error('Largeur de recette inconnue');
const { routesDuCode } = require(path.join(racine,'app/e2e/perimetre-audit.mjs'));
const routes = routesDuCode(path.join(racine,'app/src/app'));
const segments='/|/agences|/auth/confirmer|/conditions|/confidentialite|/connexion|/inscription|/journal|/mentions-legales|/mot-de-passe-oublie|/nouveau-mot-de-passe|/outils|/tarifs|/artisan/inscription|/artisan/invitation/[invitationId]|/signature/caution/[jeton]'.split('|');
const echantillons = {'[slug]':'guide-public-fictif-recette','[document]':'conditions_clients','[version]':'2026-11-14','[invitationId]':'00000000-0000-4000-a000-000000000091','[jeton]':'0'.repeat(43)};
function echantillon(r) { return r.replace(/\[[^\]]+\]/g, k=>echantillons[k] || k); }
const chemins = routes.filter(r=>segments.includes(r)||['/conditions/','/journal/','/outils/'].some(s=>r.startsWith(s))).map(r=>({r,chemin:echantillon(r)}));
chemins.push({r:'not-found',chemin:'/adresse-de-recette-inconnue-soleil'});
const dossier=path.join(__dirname,'preuves'), captures=path.join(dossier,'captures');
fs.mkdirSync(captures,{recursive:true});
const rapport={sha:null,largeur,navigateur:'Chromium, fenêtre simulée',origine:base.origin,pages:[],controles:[],accessibilite:[]};
const mode=process.env.RECETTE_MODE || 'complet';
const fichier=path.join(dossier,'public-'+largeur+(mode==='complet'?'':'-'+mode)+'.json');
const persister=()=>{fs.writeFileSync(fichier+'.tmp',JSON.stringify(rapport,null,1));fs.renameSync(fichier+'.tmp',fichier);};
const id=(...s)=>crypto.createHash('sha256').update(s.join('|')).digest('hex').slice(0,14);
const bref=(s,max=160)=>String(s??'').replace(/\s+/g,' ').trim().slice(0,max);
const nettoyerUrl=u=>{const t=new URL(u,base);return t.pathname+t.hash};
const raison=e=>bref(String(e).replace(/\x1b\[[0-9;]+m/g,''),260);
async function lireCommandes(page) {
  return page.locator('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch]').evaluateAll(els=>{
    const css=e=>{const v=[];while(e&&e.nodeType===1&&e!==document.body){const t=e.tagName.toLowerCase();v.unshift(t+':nth-of-type('+(Array.from(e.parentElement?.children || []).filter(s=>s.tagName===e.tagName).indexOf(e)+1)+')');e=e.parentElement;}return 'body > '+v.join(' > ');};
    const propre=v=>(v||'').replace(/\s+/g,' ').trim().slice(0,200);
    return els.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[aria-hidden=true]')&&![...document.querySelectorAll('details:not([open])')].some(d=>d.contains(e)&&!d.querySelector(':scope > summary')?.contains(e))).map(e=>({tag:e.tagName.toLowerCase(),role:e.getAttribute('role')||'',type:e.type||'',nom:propre(e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.innerText||e.getAttribute('title')||e.getAttribute('name')),css:css(e),href:e.getAttribute('href')||'',domId:e.id,champ:e.name||'',valeurChoix:['checkbox','radio'].includes(e.type)?e.value:'',desactive:!!e.disabled,zone:e.closest('header')?'en-tête':e.closest('footer')?'pied':e.closest('form')?'formulaire':'contenu',taille:[Math.round(e.getBoundingClientRect().width),Math.round(e.getBoundingClientRect().height)],menu:!!e.closest('details.public-menu-mobile nav'),details: e.tagName==='SUMMARY'?css(e.parentElement):null}));
  });
}
async function analyser(page, r, chemin) {
  const vu=new Map(); const fond={route:r,chemin,role:'public',largeur};
  let origine;
  const retour=async()=>{
    await page.goBack({waitUntil:'commit',timeout:6000}).catch(()=>{});
    if(page.url()!==origine)await page.goto(new URL(chemin,base).href,{waitUntil:'domcontentloaded'});
    await page.locator('h1:visible').first().waitFor();
  };
  const enregistrer=(c,etat='initial')=>{
    // Position DOM + URL + libellé distinguent les liens réitérés à plusieurs endroits.
    const ident=id(r,c.css,c.href,c.nom,c.valeurChoix);
    if(!vu.has(ident)){const a={...fond,id:ident,commande:c.nom,balise:c.tag,type:c.type,domId:c.domId,champ:c.champ,valeurChoix:c.valeurChoix,selecteur:c.css,href:c.href,zone:c.zone,etatInitial:etat,taille:c.taille,statut:'non testé',effectue:false,scenario:'',attendu:'',observe:'',preuve:''};vu.set(ident,a);rapport.controles.push(a);}
    return vu.get(ident);
  };
  let reponse=await page.goto(new URL(chemin,base).href,{waitUntil:'domcontentloaded'});
  if(r==='/nouveau-mot-de-passe'){await page.waitForURL('**/connexion**',{timeout:15000});await page.locator('h1').first().waitFor();}
  await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,3500))]));
  const titre=await page.locator('h1:visible').first().textContent({timeout:20000}).catch(()=>'');
  origine=page.url();
  const mesure=await page.evaluate(()=>({debordement:Math.max(0,document.documentElement.scrollWidth-innerWidth),imagesVides:[...document.images].filter(i=>i.complete&&!i.naturalWidth&&i.loading!=='lazy').length}));
  const image='captures/'+largeur+'-'+(chemin.replace(/[^a-zA-Z0-9]+/g,'-').slice(0,96)||'accueil')+'.jpg';
  if(!fs.existsSync(path.join(dossier,image)))await page.screenshot({path:path.join(dossier,image),type:'jpeg',quality:64,animations:'disabled'});
  const pageInfo={...fond,titre:bref(titre),urlFinale:nettoyerUrl(page.url()),http:reponse?.status(),...mesure,capture:image};
  rapport.pages.push(pageInfo);
  await page.keyboard.press('Tab');
  pageInfo.focusClavier=await page.evaluate(()=>{const a=document.activeElement;return a?.tagName==='BODY'?null:(a?.getAttribute('aria-label')||a?.textContent||a?.getAttribute('name')||a?.tagName||'').trim().slice(0,80);});
  if(mode==='visuel'||mode==='complet'&&!fs.existsSync(path.join(dossier,'public-'+largeur+'-visuel.json'))){
    try{
      await page.addScriptTag({path:axe});
      const a=await page.evaluate(async()=>{const resultat=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return resultat.violations.map(v=>({regle:v.id,impact:v.impact,description:v.description,cibles:v.nodes.map(n=>n.target.join(' '))}));});
      rapport.accessibilite.push({...fond,violations:a,preuve:image});
    }catch(e){rapport.accessibilite.push({...fond,erreur:raison(e)});}
  }
  let controles=await lireCommandes(page);
  for(const c of controles)enregistrer(c);
  // Interroger les contenus des disclosures réellement ouverts au clavier et vérifier la fermeture.
  const liens=[...controles.filter(c=>c.tag==='a').map(c=>({c,ouvrir:''}))];
  for(const c of controles.filter(c=>c.tag==='summary')){
    const ligne=enregistrer(c);
    try{
      const sommaire=page.locator(c.css);
      if(c.nom==='Menu du site')await expect.poll(()=>sommaire.evaluate(e=>Object.keys(e.parentElement).some(k=>k.startsWith('__reactProps'))),{timeout:30000}).toBe(true);
      await sommaire.focus();
      const etaitOuvert=await page.locator(c.details).evaluate(e=>e.open);
      await sommaire.press('Enter');
      await expect.poll(()=>page.locator(c.details).evaluate(e=>e.open)).toBe(!etaitOuvert);
      if(!etaitOuvert){
        const nouvelles=await lireCommandes(page);
        for(const n of nouvelles.filter(n=>!controles.some(a=>a.css===n.css))){enregistrer(n,'panneau ouvert : '+c.nom);if(n.tag==='a')liens.push({c:n,ouvrir:c.css});}
      }
      await sommaire.press(c.nom==='Menu du site'?'Escape':'Enter');
      await expect.poll(()=>page.locator(c.details).evaluate(e=>e.open)).toBe(etaitOuvert);
      Object.assign(ligne,{statut:'réussi',effectue:true,scenario:'Ouvrir puis refermer au clavier',attendu:'État ouvert inversé puis restauré',observe:'Deux transitions vérifiées, focus sur le sommaire',preuve:image});
    }catch(e){Object.assign(ligne,{statut:'échec',observe:raison(e)});}
  }
  if(mode!=='visuel'){
    for(const {c,ouvrir} of liens){
      const ligne=enregistrer(c);const dest=new URL(c.href,origine);
      if(dest.origin!==base.origin){Object.assign(ligne,{statut:'bloqué',attendu:'Consulter la cible du prestataire ou ouvrir la messagerie',observe:'Destination externe exclue du banc isolé. Lien présent : '+dest.protocol+' '+dest.hostname,preuve:image});continue;}
      try{
        if(page.url()!==origine)await retour();
        if(ouvrir){const open=await page.locator(ouvrir).evaluate(e=>e.parentElement.open);if(!open)await page.locator(ouvrir).click();}
        const lien=page.locator(c.css);
        if(c.href==='#contenu-espace'){await expect.poll(()=>lien.evaluate(e=>Object.keys(e).some(k=>k.startsWith('__reactProps'))),{timeout:30000}).toBe(true);await lien.focus();await lien.press('Enter');await expect.poll(()=>page.evaluate(()=>document.activeElement?.id==='contenu-espace'||document.activeElement?.tagName==='MAIN')).toBe(true);Object.assign(ligne,{statut:'réussi',effectue:true,scenario:'Aller au contenu au clavier',attendu:'Le contenu principal reçoit le focus',observe:'Focus vérifié',preuve:image});continue;}
        const target=await lien.getAttribute('target');let arrivee=page;
        if(target==='_blank'){[arrivee]=await Promise.all([page.waitForEvent('popup',{timeout:10000}),lien.click()]);await arrivee.waitForLoadState('domcontentloaded');}
        else {await lien.click();}
        await expect.poll(()=>new URL(arrivee.url()).pathname+new URL(arrivee.url()).hash,{timeout:15000}).toBe(dest.pathname+dest.hash);
        if(dest.hash){await expect(arrivee.locator('[id='+JSON.stringify(decodeURIComponent(dest.hash.slice(1)))+']').first()).toBeAttached({timeout:30000});}
        const titreCible=await arrivee.locator('h1:visible').first().innerText({timeout:15000});
        if(/cette page est introuvable|application error|erreur inattendue/i.test(titreCible))throw Error('Écran cible en erreur : '+titreCible);
        Object.assign(ligne,{statut:'réussi',effectue:true,scenario:'Clic dans le lien et lecture de la destination',attendu:dest.pathname+dest.hash,observe:bref(titreCible),preuve:image});
        if(arrivee!==page)await arrivee.close();
      }catch(e){Object.assign(ligne,{statut:'échec',scenario:'Suivre le lien',attendu:dest.pathname+dest.hash,observe:raison(e)});}
    }
  }
  persister();
}
async function main(){
  const sante=await (await fetch(new URL('/api/sante',base))).json();
  if(!sante.ok||!sante.base||!/^([a-f0-9]{40})$/.test(sante.revision))throw Error('Santé ou révision du banc non vérifiée');
  rapport.sha=sante.revision;
  // L'interdiction des hôtes externes se fait au niveau réseau du navigateur pour
  // conserver son cache HTTP normal entre les visites publiques, comme en usage réel.
  const browser=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});
  const dejaVues=new Set();
  if(process.env.RECETTE_REPRENDRE==='1'&&fs.existsSync(fichier)){
    const archive=JSON.parse(fs.readFileSync(fichier,'utf8'));
    if(archive.sha!==rapport.sha||archive.largeur!==largeur)throw Error('Reprise sur une origine ou version différente');
    for(const p of archive.pages)if(p.titre&&!p.erreur)dejaVues.add(p.route);
    rapport.pages=archive.pages.filter(p=>dejaVues.has(p.route));
    rapport.controles=archive.controles.filter(a=>dejaVues.has(a.route));
    rapport.accessibilite=archive.accessibilite?.filter(a=>dejaVues.has(a.route))||[];
  }
  const appels=chemins.filter(c=>!dejaVues.has(c.r));
  const travailleurs=Array.from({length:1},async()=>{
    const context=await browser.newContext({ viewport:{width:largeur,height:largeur===1440?960:844},hasTouch:largeur<1440,locale:'fr-FR',reducedMotion:'reduce',serviceWorkers:'block'});
    try{for(const rep of appels){const {r,chemin}=rep;
      const page=await context.newPage();page.setDefaultTimeout(16000);page.setDefaultNavigationTimeout(75000);page.on('dialog',d=>d.dismiss());
      try{await analyser(page,r,chemin);}
      catch(e){rapport.pages.push({route:r,chemin,largeur,erreur:raison(e)});persister();}
      finally{await page.close();}
    }}finally{await context.close();}
  });
  await Promise.all(travailleurs);await browser.close();persister();
}
main().catch(e=>{console.error(raison(e));process.exitCode=1;});

