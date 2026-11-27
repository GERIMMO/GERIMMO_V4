'use strict';

// Diagnostic de présentation. Aucune soumission et aucun identifiant réel.
// Lancer depuis app/ avec E2E_BASE_URL et SUPALOCAL_DB d'un banc local fictif.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.resolve('node_modules/playwright'));
const { Client } = require(path.resolve('node_modules/pg'));
const base = new URL(process.env.E2E_BASE_URL);
const bdd = new URL(process.env.SUPALOCAL_DB);
assert(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname));
assert(bdd.hostname === '127.0.0.1' && /^\/gerimmo_ci_[a-z_]+_api$/.test(bdd.pathname));
const matrice = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dossier = path.resolve(process.argv[3]);
const archivesAutorisées = new Set(['source','motif']);
const largeur = [390, 1440];
const routeTypes = fs.readdirSync('src/app', {recursive:true}).filter(f => /(?:^|\/)page\.tsx$/.test(f)).map(f => '/' + f.replace(/\/?page\.tsx$/, ''));
const cheminCanonique = p => p.replace(/^\/espace\//,'/agence/');
const routes = [...routeTypes].sort((a,b)=>(a.match(/\[/g)||[]).length-(b.match(/\[/g)||[]).length).map(route => [route,new RegExp(`^${route.replaceAll(/\[[^/]+\]/g, '[^/]+')}$`)]);
function patron(u) { return routes.find(([,expression]) => expression.test(cheminCanonique(u)))?.[0]; }
function autorise(profil, chemin) {
  if (['/espaces','/compte','/compte/donnees','/assistance','/securite'].includes(chemin)) return profil !== 'public';
  if (profil === 'superadmin') return /^\/admin(?:\/|$)/.test(chemin);
  if (profil.startsWith('proprietaire')) return /^\/(espace\/|veille$|quittance\/)/.test(chemin);
  if (['agent','admin'].includes(profil)) return /^\/(agence\/|veille$|quittance\/)/.test(chemin);
  if (profil === 'locataire') return /^\/(locataire\/|attestation-loyer\/|quittance\/)/.test(chemin);
  if (profil === 'artisan') return /^\/artisan(\/|$)/.test(chemin) && !/\/invitation\//.test(chemin);
  return profil === 'public' && !/^\/(admin|agence|espace[s]?|artisan|locataire|quittance|attestation-loyer|securite|compte|relais|auth|invitations|signature)(\/|$)/.test(chemin);
}
const variantes = [...matrice];
function ajouter(persona, path, label, source = 'inventaire') {
  if (!variantes.some(v => v.persona === persona && v.path === path)) variantes.push({persona,path,label,source});
}
function priorite(path) {
  return !path.startsWith('/admin') || /^\/admin(?:$|\/(brief|clients|sante|parametres|autonomie|marketing|publications|retours))/.test(path);
}
async function enrichir() {
  const db = new Client({connectionString:bdd.href});
  await db.connect();
  try {
    await db.query('SET default_transaction_read_only TO on');
    const {rows} = await db.query(`select o.id,o.name from organizations o join memberships m on m.organization_id=o.id join auth.users u on u.id=m.account_id where u.email=$1 and m.status='active' and m.role='proprietaire_direct' order by o.id`,['proprietaire@example.com']);
    for (const [persona, famille] of [['admin','/agence/'],['agent','/agence/'],['proprietaire','/espace/'],['locataire','/locataire/']]) {
      const id = variantes.find(v=>v.persona===persona&&v.path.startsWith(famille))?.path.split('/')[2];
      if (!id) continue;
      for (const route of routeTypes) {
        const racine = famille === '/espace/' ? '/agence/' : famille;
        if (!route.startsWith(racine+'[orgId]') || route.replace('[orgId]','').includes('[')) continue;
        if (['admin','agent'].includes(persona) && /\/abonnement(\/|$)/.test(route)) continue;
        if (persona==='proprietaire' && /\/(administration|statistiques|mandats|reseau|import|reprise)$/.test(route)) continue;
        ajouter(persona,route.replace(racine+'[orgId]',famille+id));
      }
    }
    // Les variantes SCI appartiennent au propriétaire de recette. La détention
    // SCI peut être un patrimoine à l'intérieur de la même organisation.
    for (const org of rows) {
      if (!/sci/i.test(org.name)) continue;
      for (const suffixe of ['', '/parc','/profil','/loyers','/comptabilite','/incidents','/abonnement']) ajouter('proprietaire-sci',`/espace/${org.id}${suffixe}`,'Patrimoine SCI');
    }
    for (const route of routeTypes.filter(r=>!r.includes('['))) {
      if (route.startsWith('/admin') && autorise('superadmin',route)) ajouter('superadmin',route);
      if (route.startsWith('/artisan') && !route.includes('/inscription')) ajouter('artisan',route);
      if (autorise('public',route)) ajouter('public',route);
    }
    for (const profil of ['proprietaire','artisan','locataire','agent','admin','superadmin']) {
      for (const route of ['/compte','/compte/donnees','/assistance','/securite','/espaces']) ajouter(profil,route);
    }
  } finally { await db.end(); }
}
function initialiserMesures() {
  window.auditAnimations = [];
  window.auditDecalages = [];
  for (const evenement of ['animationstart','transitionrun']) document.addEventListener(evenement,e => {
    if (window.auditAnimations.length >= 100) return;
    const el = e.target;
    const style = getComputedStyle(el);
    window.auditAnimations.push({type:evenement,nom:e.animationName || e.propertyName,classe:el.className?.baseVal || String(el.className).slice(0,150),duree:evenement==='animationstart'?style.animationDuration:style.transitionDuration,boucle:style.animationIterationCount==='infinite',instant:Math.round(performance.now())});
  },true);
  try {
    new PerformanceObserver(liste => {
      for (const e of liste.getEntries()) if (!e.hadRecentInput) window.auditDecalages.push(e.value);
    }).observe({type:'layout-shift',buffered:true});
  } catch {}
}
function mesures() {
  const interne = (e) => e.closest('main,[role="main"]');
  const visible = e => { const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility==='visible'&&s.display!=='none'&&!e.closest('[aria-hidden="true"]'); };
  const nom = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim() || Array.from(e.labels||[], l=>l.textContent).join(' ') || e.innerText || e.getAttribute('alt') || e.title || e.querySelector('img')?.alt || (e.tagName==='INPUT'&&['submit','button'].includes(e.type)?e.value:'') || '').trim().replace(/\s+/g,' ').slice(0,110);
  const cibles = [...document.querySelectorAll('a[href],button,summary,[role="button"],[role="tab"],input:not([type="hidden"]),select,textarea')].filter(visible).filter(e=>!e.closest('[inert]'));
  const relevé = cibles.map(e=>{const r=e.getBoundingClientRect();return {nom:nom(e),tag:e.tagName.toLowerCase(),type:e.getAttribute('type')||e.getAttribute('role')||'',dansContenu:!!interne(e),visibleAuChargement:r.top>=0&&r.bottom<=innerHeight,largeur:Math.round(r.width),hauteur:Math.round(r.height),actif:!e.matches(':disabled,[aria-disabled=true]')};});
  const nomsActions = relevé.filter(t=>t.dansContenu&&t.nom&&t.visibleAuChargement&&t.actif).slice(0,20).map(x=>x.nom);
  const fine = relevé.filter(t=>t.actif&&t.nom&&(t.largeur<24||t.hauteur<24)&&['a','button','summary'].includes(t.tag));
  const sansNom = relevé.filter(t=>!t.nom);
  const ecrans = [...document.querySelectorAll('h1')].filter(visible).map(nom);
  const techniques = (document.querySelector('main')?.innerText || '').split('\n').map(t=>t.trim()).filter(s=>s.length&&s.length<125).filter(t=>/réessayer|impossible|bloqué|chargement|autorisé|introuvable|démonstration/.test(t.toLowerCase())).slice(0,12);
  return {h1:ecrans, titre:document.title, largeur:innerWidth, hauteur:innerHeight, defilement:document.documentElement.scrollHeight, debordement:Math.max(0,document.documentElement.scrollWidth-innerWidth), controles:relevé.length, controlesContenu:relevé.filter(x=>x.dansContenu).length, visiblesPremierEcran:nomsActions, petits: fine.length, exemplesPetits:fine.slice(0,10), sansNom:sansNom.slice(0,15), actifsBrowserAnim:document.getAnimations().filter(x=>x.playState==='running').map(x=>({nom:x.animationName||x.transitionProperty||'javascript',duree:x.effect?.getTiming().duration,boucles:x.effect?.getTiming().iterations===Infinity})).slice(0,25), animations:window.auditAnimations||[], decalage:Math.round((window.auditDecalages||[]).reduce((a,b)=>a+b,0)*1000)/1000, techniques};
}
async function balayer(browser, persona, taille, initiaux) {
  const context = await browser.newContext({baseURL:base.origin,viewport:{width:taille,height:taille<800?844:1000},isMobile:taille<800,hasTouch:taille<800,locale:'fr-FR',timezoneId:'Europe/Paris',storageState:persona==='public'?undefined:`e2e/.auth/${persona.split('-')[0]}.json`});
  await context.addInitScript(initialiserMesures);
  await context.addInitScript(()=>sessionStorage.setItem('gerimmo-synthese-alertes-vue','1'));
  await context.route('**/*',r=> { const origine=new URL(r.request().url()); return ['localhost','127.0.0.1'].includes(origine.hostname)||!['https:','http:'].includes(origine.protocol) ? r.continue() : r.abort(); });
  const rapport = path.join(dossier,`${persona}-${taille}.jsonl`);
  const vues = path.join(dossier,`${persona}-${taille}`);
  fs.mkdirSync(vues,{recursive:true}); fs.writeFileSync(rapport,'');
  const file = [...initiaux];
  const demandes = new Set(file.map(q=>q.path));
  let i=0;
  for (const item of file) {
    if (++i>initiaux.length+24) break;
    const page = await context.newPage();
    const decal = [];
    const consoleErreurs = new Set();
    page.on('pageerror',e=>decal.push(e.message.slice(0,200)));
    page.on('response',r=> {if(r.status()>=400&&r.request().resourceType()==='script') consoleErreurs.add(`${r.status()} script`);});
    const entree = {persona,format:taille,demande:item.path,source:item.source??'matrice existante', origine:item.origine, patron:patron(new URL(item.path,base).pathname),label:item.label};
    const capturer=async (donnees,nom) => {
      try { await page.screenshot({path:path.join(vues,nom),type:'jpeg',quality:67,animations:'allow',timeout:4000}); donnees.capture=`${persona}-${taille}/${nom}`; } catch {}
    };
    try {
      const response = await page.goto(item.path,{waitUntil:'load',timeout:18000});
      await page.locator('h1:visible').first().waitFor({state:'visible',timeout:2400}).catch(()=>{});
      await page.getByText('Chargement de la page…',{exact:true}).first().waitFor({state:'hidden',timeout:2400}).catch(()=>{});
      await page.waitForTimeout(450);
      entree.http=response?.status();
      entree.final=new URL(page.url()).pathname;
      entree.sessionPerdue=persona!=='public'&&/^\/(connexion|securite\/verification)/.test(entree.final);
      entree.patronFinal=patron(entree.final);
      Object.assign(entree,await page.evaluate(mesures));
      entree.erreursJS=decal;
      entree.erreursRessources=[...consoleErreurs];
      const slug = `${String(i).padStart(3,'0')}-${(entree.patron||entree.final).replace(/[^a-z\d]+/gi,'-').slice(0,92)}`;
      await capturer(entree,`${slug}.jpg`);
      fs.appendFileSync(rapport,JSON.stringify(entree)+'\n');
      if (entree.http===200&&!entree.sessionPerdue) {
        const directs = await page.getByRole('link').evaluateAll(a=>a.map(x=>x.getAttribute('href')).filter(Boolean));
        for (const href of directs) {
          const url = new URL(href,base);
          if (url.origin!==base.origin || !patron(url.pathname) || !autorise(persona,url.pathname)) continue;
          // Chaque type de détail est échantillonné. Éviter invitations, sorties de session, actions et exports.
          if (/auth|invitation|signature|export/.test(url.pathname) || url.searchParams.size&&!Array.from(url.searchParams.keys()).every(k=>archivesAutorisées.has(k))) continue;
          const lien=url.pathname;
          if (demandes.has(lien)||file.some(v=>patron(new URL(v.path,base).pathname)===patron(lien)&&v.source==='lien trouvé')) continue;
          demandes.add(lien); file.push({path:lien,label:'Lien de l’interface',source:'lien trouvé',origine:item.path});
        }
        const onglets = page.locator('[data-onglets-dossier] > [role="tablist"] > [role="tab"]');
        if (taille===390||taille===1440) for (let j = 0; j < Math.min(await onglets.count(),7); ++j) {
          const b=onglets.nth(j);
          if (await b.getAttribute('aria-selected')==='true') continue;
          const texte=await b.innerText();
          const tab = {persona,format:taille,demande:item.path,onglet:texte,patron:entree.patron,source:'onglet'};
          try {
            await b.click({timeout:1600});
            await page.waitForTimeout(120);
            Object.assign(tab,await page.evaluate(mesures));
            tab.selection=await b.getAttribute('aria-selected');
            await capturer(tab,`${slug}-onglet-${j}.jpg`);
          } catch(e){tab.erreur=String(e).split('\n')[0].slice(0,180);}
          fs.appendFileSync(rapport,JSON.stringify(tab)+'\n');
        }
      }
    } catch(e){fs.appendFileSync(rapport,JSON.stringify({...entree,erreur:String(e).split('\n')[0].slice(0,200)})+'\n');}
    finally {await page.close();}
  }
  console.log(`${persona} ${taille} px : ${i} adresses tentées`);
  await context.close();
}
(async()=> {
  await enrichir();
  fs.mkdirSync(dossier,{recursive:true});
  fs.writeFileSync(path.join(dossier,'routes-source.json'),JSON.stringify(routeTypes.sort(),null,2));
  const browser=await chromium.launch({args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
  try {
    console.log('Chromium',browser.version());
    const filtre=new Set(process.argv.slice(4));
    const ensembles = [...Map.groupBy(variantes,v=>v.persona)].filter(([role])=>filtre.size===0||filtre.has(role));
    const travaux = ensembles.flatMap(([role,vues])=>largeur.map(px=>[role,px,vues]));
    travaux.push(...ensembles.map(([role,vues])=>[role,768,vues.filter(e=>priorite(e.path)).slice(0,5)]));
    async function consommer(){while(travaux.length){const t=travaux.shift();if(t[2].length)await balayer(browser,...t);}}
    await Promise.all(Array.from({length:4},consommer));
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
