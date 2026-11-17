/* Rejouer le circuit de lot2-invitations.spec.ts avec attente du contenu et contrôle
   du même lien sous une autre session. La fixture crée uniquement les deux personnes
   dans la base fictive ; invitation, refus, renvoi et acceptation passent par les portails. */
const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const app=createRequire(path.resolve(__dirname,'../../../app/package.json'));
const {chromium,expect:baseExpect}=app('@playwright/test'),{Client}=app('pg'),expect=baseExpect.configure({timeout:60000});
const base='http://localhost:3483',url=new URL(process.env.SUPALOCAL_DB),org='3c1d1e95-3570-400b-8012-44530be145b1';
if(url.hostname!=='127.0.0.1'||url.port!=='56817'||!/^\/gerimmo_ci_\w+_api$/.test(url.pathname))throw Error('Base isolée attendue');
const dest=path.join(__dirname,'preuves'),secret='Gerimmo-Demo-2026';
async function run(b,db,largeur){
 const options={viewport:{width:largeur,height:largeur===1440?960:844},locale:'fr-FR',hasTouch:largeur!==1440};
 const o=await b.newContext(options),t=await b.newContext(options),p=await o.newPage(),v=await t.newPage();
 for(const c of [o,t]){c.setDefaultNavigationTimeout(120000);c.setDefaultTimeout(40000);await c.addInitScript(()=>{try{sessionStorage.setItem('gerimmo-synthese-alertes-vue','1')}catch{}});}
 const target=randomUUID(),person=randomUUID(),email='invitation-public-'+target+'@example.invalid',etapes=[],res={largeur,etapes,statut:'bloqué'};
 const note=(action,attendu)=>etapes.push({action,observe:attendu});const q=async(s,params)=>(await db.query(s,params)).rows;
 const go=(page,path)=>new URL(page.url()).pathname===new URL(base+path).pathname ? page.reload({waitUntil:'domcontentloaded'}) : page.goto(base+path,{waitUntil:'domcontentloaded'});
 const connect=async(page,email,destination)=>{
  const auth=[];page.on('response',reponse=>{const u=new URL(reponse.url());if(u.port==='54183'&&u.pathname==='/auth/v1/token')auth.push(reponse.status());});
  await go(page,'/connexion');await page.getByLabel('Adresse e-mail',{exact:true}).fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(secret);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  try{await expect.poll(()=>new URL(page.url()).pathname,{timeout:60000}).not.toBe('/connexion');}
  catch(e){const message=await page.locator('form [role=alert],main [role=alert]').allTextContents().catch(()=>[]);throw Error('Connexion fictive refusée : '+JSON.stringify(message)+' ; réponses du serveur Auth : '+auth.join(','));}
  await go(page,destination);await expect.poll(()=>new URL(page.url()).pathname).toBe(destination.split('#')[0]);};
 const fiche='/espace/'+org+'/personnes/'+person,c=p.locator('#acces-locataire');
 const invite=async(bouton)=>{await go(p,fiche+'#acces-locataire');await c.getByRole('button',{name:bouton,exact:true}).click();let id;await expect.poll(async()=>{let r=await q("select id,envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person]);id=r[0]?.id;return Boolean(id&&r[0].envoye_le);}).toBe(true);return id;};
 try{
  await q("insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}',now(),now(),'','','','','')",[target,email,secret]);
  await q("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'des Lilas','Alix',$3)",[person,org,email]);
  await connect(p,'proprietaire@example.com',fiche);const premier=await invite('Inviter comme locataire');
  const destinations=async()=>{const mess=await(await fetch('http://127.0.0.1:55520/messages')).json();return mess.filter(m=>m.to.includes(email)).length;};
  await expect.poll(destinations).toBeGreaterThan(0);note('Inviter comme locataire','Courrier arrivé à la seule adresse fictive correspondante, invitation en attente');
  const droits=async()=>(await q('select account_id from persons where id=$1',[person]))[0]?.account_id;
  await expect.poll(droits).toBe(null);const premiereUrl='/invitations/'+premier;
  await go(p,premiereUrl);await expect(p.getByText(/Invitation introuvable pour ce compte/)).toBeVisible();await expect(p.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);note('Contrôler la confidentialité','Le propriétaire qui connaît le lien ne peut pas le consulter comme destinataire');
  await connect(v,email,'/espaces');const invitation=v.getByRole('link').filter({hasText:'Invitation locataire à accepter ou refuser'});await invitation.click();await expect(v).toHaveURL(base+premiereUrl);
  await expect(v.getByRole('button',{name:'Accepter l’invitation'})).toBeVisible();res.modele='/invitations/[invitationId]';res.titre=await v.locator('h1:visible').first().innerText();note('Consulter la demande reçue',res.titre);
  await v.getByRole('button',{name:'Refuser',exact:true}).click();await expect.poll(async()=>(await q('select etat from invitations_locataires where id=$1',[premier]))[0]?.etat).toBe('refusee');await go(v,premiereUrl);await expect(v.getByText('Refusée',{exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);await expect.poll(droits).toBe(null);note('Refuser puis rouvrir le même lien','Refus persistant, aucun bouton d’acceptation et aucun droit accordé');
  const perime=await invite('Envoyer une nouvelle invitation');await q("update invitations_locataires set expire_le=now()-interval '1 second' where id=$1 and person_id=$2",[perime,person]);await go(v,'/invitations/'+perime);await expect(v.getByText('Expirée',{exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);note('Ouvrir une invitation échue','Échéance simulée en base fictive, refus d’acceptation à l’écran');
  const actif=await invite('Envoyer une nouvelle invitation');await go(v,'/invitations/'+actif);await v.getByRole('button',{name:'Accepter l’invitation',exact:true}).click();await expect(v).toHaveURL(base+'/locataire/'+org);await expect.poll(droits).toBe(target);note('Accepter et consulter son portail','Espace locataire ouvert et rattachement du compte constaté en base');
  await go(v,'/invitations/'+actif);await expect(v.getByText('Acceptée',{exact:true})).toBeVisible();await expect(v.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  const memberships=await q('select count(*) as n from memberships where account_id=$1 and organization_id=$2',[target,org]);if(+memberships[0].n!==1)throw Error('Nombre de droits accordés inattendu : '+memberships[0].n);
  await go(p,fiche+'#acces-locataire');await expect(c.getByText(/Compte locataire actif/)).toBeVisible();await c.getByText('Historique des invitations',{exact:true}).click();await expect(c.locator('li')).toHaveCount(3);note('Rouvrir le lien accepté et consulter son historique','Aucune seconde acceptation, un seul droit et trois invitations dans l’historique du propriétaire');
  res.statut='réussi';
 }catch(e){res.erreur=e.message.replace(/https?:\/\/\S+/g,'[lien de recette]').replace(/\u001b\[[0-9;]+m/g,'').slice(0,600);res.fiche=await c.innerText({timeout:3000}).then(s=>s.replace(/[\w.+-]+@[\w.-]+/g,'[adresse fictive]').slice(0,600)).catch(()=>'');res.chemin=new URL(v.url()).pathname.replace(/[0-9a-f-]{36}/g,'[dossier]');}
 finally{await Promise.all([o.close(),t.close()]);fs.writeFileSync(path.join(dest,'invitation-'+largeur+'.json'),JSON.stringify(res,null,1));}
}
(async()=>{const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});const db=new Client({connectionString:url.href});await db.connect();try{for(const w of process.argv.slice(2).map(Number))await run(b,db,w);}finally{await db.end();await b.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
