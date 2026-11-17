/* Reprendre les clics interrompus, sur une page source fraîche. Sauvegarder séparément,
   avec le même identifiant DOM afin de rattacher la preuve à la première observation. */
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect:baseExpect}=app('@playwright/test'),expect=baseExpect.configure({timeout:30000});
const base='http://127.0.0.1:3483',dir=path.join(__dirname,'preuves'),width=Number(process.argv[2]);
if(![390,768,1440].includes(width))throw Error('Largeur de recette requise');
const precedente=JSON.parse(fs.readFileSync(path.join(dir,'public-'+width+'.json'),'utf8'));
const cible=path.join(dir,'public-'+width+'-liens-rejoues.json'),doc={largeur:width,sha:precedente.sha,pages:[],controles:[],accessibilite:[]};
if(fs.existsSync(cible))Object.assign(doc,JSON.parse(fs.readFileSync(cible,'utf8')));
const noter=c=>{doc.controles=doc.controles.filter(x=>x.id!==c.id);doc.controles.push(c);fs.writeFileSync(cible+'.tmp',JSON.stringify(doc,null,1));fs.renameSync(cible+'.tmp',cible);};
(async()=>{const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});
try{const ctx=await b.newContext({viewport:{width,height:width===1440?960:844},hasTouch:width!==1440,locale:'fr-FR'});
 for(const c of precedente.controles.filter(v=>v.statut==='échec'&&!doc.controles.some(x=>x.id===v.id&&x.statut==='réussi'))){
  const p=await ctx.newPage();p.setDefaultTimeout(16000);p.setDefaultNavigationTimeout(90000);let extra;const r={...c,scenario:'Rejouer le clic à partir de la source fraîche et vérifier la destination',preuve:path.basename(cible)};
  try{await p.goto(base+c.chemin,{waitUntil:'domcontentloaded'});await p.locator('h1:visible').first().waitFor({timeout:30000});
   if(c.balise==='summary'){const summary=p.locator(c.selecteur);await expect(summary).toBeVisible();await expect.poll(()=>summary.evaluate(e=>Object.keys(e.parentElement).some(k=>k.startsWith('__reactProps')))).toBe(true);
    await summary.focus();const open=await summary.evaluate(e=>e.parentElement.open);await summary.press('Enter');await expect.poll(()=>summary.evaluate(e=>e.parentElement.open)).toBe(!open);await summary.press(c.commande==='Menu du site'?'Escape':'Enter');await expect.poll(()=>summary.evaluate(e=>e.parentElement.open)).toBe(open);r.observe='Ouverture et retour à l’état initial au clavier';}
   else{if(c.balise!=='a')throw Error('Cette commande est couverte par le parcours de formulaire correspondant');
    const menu=p.locator('details.public-menu-mobile');if(c.etatInitial.startsWith('panneau ouvert')&&await menu.count()&&!await menu.evaluate(e=>e.open))await menu.locator('summary').click();
    const l=p.locator(c.selecteur);await expect(l).toHaveAttribute('href',c.href);await expect(l).toBeVisible();
    if(c.href==='#contenu-espace'){await expect.poll(()=>l.evaluate(e=>Object.keys(e).some(k=>k.startsWith('__reactProps')))).toBe(true);await l.focus();await l.press('Enter');await expect.poll(()=>p.evaluate(()=>document.activeElement?.id==='contenu-espace'||document.activeElement?.tagName==='MAIN')).toBe(true);r.observe='Le contenu reçoit effectivement le focus';}
    else{const dest=new URL(c.href,p.url());if(dest.origin!==base)throw Error('Prestataire externe hors du banc prévu');const blank=(await l.getAttribute('target'))==='_blank';let fin=p;
     if(blank){const autre=ctx.waitForEvent('page',{timeout:24000});await l.click();fin=await autre;extra=fin;}else await l.click();
     await expect.poll(()=>{const u=new URL(fin.url());if(dest.pathname==='/compte/donnees'&&u.pathname==='/connexion')return true;return u.pathname===dest.pathname&&u.hash===dest.hash;}).toBe(true);
     const attendu=new URL(fin.url());if(attendu.pathname==='/connexion'&&dest.pathname==='/compte/donnees'){if(attendu.searchParams.get('suite')!==dest.pathname)throw Error('Origine de reprise absente après protection');await expect(fin.getByLabel('Adresse e-mail',{exact:true})).toBeVisible();r.observe='Accès protégé par Connexion ; retour prévu vers la page du compte';}
     else{if(dest.hash)await expect(fin.locator('[id='+JSON.stringify(decodeURIComponent(dest.hash.slice(1)))+']').first()).toBeAttached();const h=fin.locator('h1:visible').first();await expect(h).toBeVisible();const titre=await h.innerText();if(/erreur inattendue|cette page est introuvable|application error/i.test(titre))throw Error('Destination en erreur : '+titre);r.observe=titre;r.destinationConfirmee=attendu.pathname+attendu.hash;}
    }
   }
   r.statut='réussi';r.effectue=true;
  }catch(e){r.statut='bloqué';r.effectue=false;r.observe=e.message.replace(/\u001b\[[0-9;]+m/g,'').replace(/\s+/g,' ').slice(0,330);}
  finally{if(extra)await extra.close().catch(()=>{});await p.close().catch(()=>{});noter(r);}
 }
}finally{await b.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
