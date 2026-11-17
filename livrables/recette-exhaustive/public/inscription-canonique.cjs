/* Un seul hôte public pour le banc : la compilation Next locale produit ses redirections vers localhost.
   Le jeton, la destination et l'adresse de réception doivent venir tels quels du courrier fictif. */
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect:expectDeBase}=app('@playwright/test'),expect=expectDeBase.configure({timeout:120000}),{Client}=app('pg');
const base=new URL(process.env.E2E_BASE_URL||'http://localhost:3483');
if(!['localhost','127.0.0.1'].includes(base.hostname)||base.protocol!=='http:'||!['3483','3873'].includes(base.port))throw Error('Site isolé obligatoire');
base.hostname='localhost';
const boite=new URL(process.env.E2E_BOITE_FICTIVE_URL||'http://127.0.0.1:55520');
if(boite.hostname!=='127.0.0.1'||boite.protocol!=='http:'||boite.port!==(base.port==='3483'?'55520':'55573'))throw Error('Boîte du même banc fictif obligatoire');
const dbUrl=new URL(process.env.SUPALOCAL_DB);
if(dbUrl.hostname!=='127.0.0.1'||!/^\/gerimmo_ci_\w+_api$/.test(dbUrl.pathname))throw Error('Base fictive locale requise');
const fichier=path.join(__dirname,'preuves/inscription-canonique.json'),preuve=[];
async function jouer(b,db,width){
 const sante=await(await fetch(new URL('/api/sante',base))).json();
 if(!sante.ok||!sante.base)throw Error('Base du banc indisponible');
 let buildId=null;
 if(!sante.revision){
  if(base.port!=='3873')throw Error('Construction du banc inconnue');
  buildId=fs.readFileSync(path.resolve('.next/BUILD_ID'),'utf8').trim();
  if(!/^[A-Za-z0-9_-]{10,50}$/.test(buildId))throw Error('Identifiant Next invalide');
  const manifeste=await fetch(new URL('/_next/static/'+buildId+'/_buildManifest.js',base));
  const local=fs.readFileSync(path.resolve('.next/static',buildId,'_buildManifest.js'),'utf8');
  if(!manifeste.ok||local!==await manifeste.text())throw Error('La construction servie ne correspond pas au manifeste local');
 }
 const result={largeur:width,revisionServie:sante.revision??null,buildId,portDuBanc:base.port,role:'nouveau propriétaire',etapes:[],etat:'bloqué'};
 const p=await b.newPage({viewport:{width,height:width===1440?960:844},locale:'fr-FR',hasTouch:width!==1440});
 p.setDefaultTimeout(30000);p.setDefaultNavigationTimeout(180000);const c=p.context();
 const tag=randomUUID(),email='pilote-public-'+tag+'@example.invalid',mdp='Recette-Isolée-2026-'+tag;
 const note=(route,action,observe)=>result.etapes.push({route,action,observe,statut:'réussi'});
 const q=async(s,v)=> (await db.query(s,v)).rows;
 const aller=r=>p.goto(new URL(r,base).href,{waitUntil:'domcontentloaded'});
 const dejaUtilises=new Set();
 const messagerie=async(type)=>{
  const extraits=await (await p.request.get(new URL('/messages',boite).href)).json();
  for(const m of extraits.filter(m=>m.to.includes(email)).reverse()){
   const l=m.html.match(/href="([^"]*\/auth\/confirm[^"]*)"/); if(!l)continue;
   const u=new URL(l[1].replaceAll('&amp;','&')); if(!['127.0.0.1','localhost'].includes(u.hostname)||u.port!==base.port||u.protocol!=='http:')throw Error('Destination hors de la recette');
   if(dejaUtilises.has(u.href))continue;
   const mode=u.searchParams.get('type');
   if(type==='signup'?!['signup','recovery','email','invite'].includes(mode):mode!=='recovery')continue;
   dejaUtilises.add(u.href);
   // Seule la forme de l'adresse de boucle locale change, exactement comme le proxy devant la construction Next.
   // Aucune lecture de jeton dans la base et aucun contournement de la double vérification par cookie.
   await aller(u.pathname+u.search);
   note('/auth/confirm','Ouvrir le lien reçu pour '+type,'Message destiné à la seule boîte fictive du scénario, origine canonique locale');
   return;
  }
  throw Error('Courrier fictif correspondant introuvable : '+type);
 };
 try{
  await aller('/inscription');const soumettre=p.getByRole('button',{name:'Ouvrir mon espace',exact:true});await soumettre.click();await expect(p.locator('form input:invalid').first()).toBeVisible();note('/inscription','Envoyer le formulaire vide','Validation du navigateur : champ obligatoire manquant, formulaire conservé');
  await p.getByLabel('Prénom',{exact:false}).fill('Camille');await p.getByLabel('Nom',{exact:true}).fill('du Tilleul');
  await p.getByLabel('Adresse e-mail').fill(email);await p.getByLabel('Adresse postale',{exact:false}).fill('3 rue du Tilleul');
  await p.getByLabel('Code postal',{exact:false}).fill('69003');await p.getByLabel('Ville',{exact:false}).fill('Lyon');
  const tel=p.locator('input[type=tel]');if(await tel.count())await tel.fill('0600000000');
  await p.getByRole('button',{name:'Ouvrir mon espace',exact:true}).click();await expect(p.getByText(/Vérifiez votre boîte mail/)).toBeVisible();
  note('/inscription','Ouvrir mon espace','Données saisies et message invitant à vérifier la boîte fictive, aucune carte demandée');
  await messagerie('signup');
  await p.getByRole('button',{name:/Confirmer mon adresse|Choisir mon mot de passe/}).click();
  await expect(p).toHaveURL(/nouveau-mot-de-passe/);
  note('/auth/confirmer','Confirmer le lien de création','Formulaire de choix de mot de passe disponible');
  await p.getByLabel('Nouveau mot de passe',{exact:true}).fill(mdp);await p.getByLabel('Confirmation',{exact:true}).fill(mdp);
  const conditions=p.getByRole('checkbox',{name:/accepte les conditions/});
  if(await conditions.count())await conditions.check();
  await p.getByRole('button',{name:/Changer le mot de passe|Créer mon mot de passe|Valider/}).click();await expect(p).toHaveURL(/\/espace\/[a-f0-9-]{36}/);
  const org=p.url().match(/\/espace\/([a-f0-9-]{36})/)[1];
  const r=await q(`select o.essai_fin=(((o.created_at at time zone 'Europe/Paris')::date + interval '2 months')::date) as deux_mois,
  (a.stripe_customer_id is null and a.stripe_subscription_id is null) as sans_stripe
  from public.organizations o left join public.abonnements a on a.organization_id=o.id
  where o.id=$1`,[org]);
  if(!r[0]?.deux_mois||!r[0]?.sans_stripe)throw Error('Contrôle indépendant de la période gratuite ou de l’absence d’abonnement en échec');
  note('/nouveau-mot-de-passe','Choisir le mot de passe et accepter les conditions','Espace propriétaire ouvert ; deux mois calendaires vérifiés en base ; ni client ni abonnement Stripe au titre du scénario');
  await c.clearCookies();await aller('/mot-de-passe-oublie');await p.getByLabel('Adresse e-mail').fill(email);await p.getByRole('button',{name:'Envoyer le lien',exact:true}).click();await expect(p.getByText(/Si un compte existe/)).toBeVisible();
  note('/mot-de-passe-oublie','Envoyer le lien','Confirmation générique sans révéler l’existence du compte');
  await messagerie('recovery');await p.getByRole('button',{name:'Choisir mon mot de passe',exact:true}).click();await expect(p).toHaveURL(/nouveau-mot-de-passe/);
  await p.getByLabel('Nouveau mot de passe',{exact:true}).fill(mdp+'-suite');await p.getByLabel('Confirmation',{exact:true}).fill(mdp+'-suite');
  await p.getByRole('button',{name:'Changer le mot de passe',exact:true}).click();await expect(p).toHaveURL(/connexion/);
  note('/nouveau-mot-de-passe','Changer le mot de passe','Retour à la connexion après réinitialisation');
  await p.getByLabel('Adresse e-mail',{exact:true}).fill(email);await p.getByLabel('Mot de passe',{exact:true}).fill(mdp+'-suite');
  await p.getByRole('button',{name:'Se connecter',exact:true}).click();await expect(p).toHaveURL(new RegExp('/espace/'+org));
  await p.reload();await expect(p).toHaveURL(new RegExp('/espace/'+org));
  note('/connexion','Se connecter','Session conservée après rechargement et même espace que lors de la création');
  result.etat='réussi';
 }catch(e){result.chemin=new URL(p.url()).pathname.replace(/[a-f0-9-]{36}/gi,'[dossier]');result.titre=(await p.locator('h1:visible').first().textContent({timeout:2000}).catch(()=>''))?.slice(0,90);result.messages=(await p.locator('form [role=alert], main [role=status], main [role=alert]').allTextContents().catch(()=>[])).map(t=>t.replace(/[\w.+-]+@[\w.-]+/g,'[adresse fictive]').slice(0,300));result.raison=String(e.message).replace(/https?:\/\/\S+/g,'[adresse locale masquée]').replace(/\u001b\[[0-9;]+m/g,'').slice(0,500);}
 finally{await p.close();preuve.push(result);fs.writeFileSync(path.join(__dirname,'preuves','inscription-'+width+'.json'),JSON.stringify(result,null,1));if(!process.argv[2])fs.writeFileSync(fichier,JSON.stringify(preuve,null,1));}
}
(async()=>{const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});const db=new Client({connectionString:dbUrl.href});await db.connect();try{for(const w of (process.argv[2]?[Number(process.argv[2])]:[390,768,1440]))await jouer(b,db,w);}finally{await db.end();await b.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
