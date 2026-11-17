const {createRequire}=require('node:module'),path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{tmpdir}=require('node:os');
const app=createRequire(path.resolve(__dirname,'../../../../app/package.json')),{chromium,expect:baseExpect}=app('@playwright/test'),expect=baseExpect.configure({timeout:30000}),{Client}=app('pg');
const base='http://127.0.0.1:59412',url=new URL(process.env.SUPALOCAL_DB);
if(url.hostname!=='127.0.0.1'||url.port!=='56817'||!/^\/gerimmo_ci_\w+_api$/.test(url.pathname))throw Error('Base locale obligatoire');
const width=Number(process.argv[2]),dir=path.resolve(__dirname,'../preuves/commerce');if(![390,768,1440].includes(width))throw Error('Largeur requise');fs.mkdirSync(dir,{recursive:true});
const complement=process.argv[3]==='suivi';
const ledger=path.join(tmpdir(),'gerimmo-342-transport-contractuel-fictif.json'),scenarios=[];
const ag=(page,p)=>page.url()===base+p?page.reload({waitUntil:'domcontentloaded'}):page.goto(base+p,{waitUntil:'domcontentloaded'});
const propre=s=>String(s).replace(/[\w.+-]+@[\w.-]+/g,'[adresse fictive]').replace(/[a-f0-9-]{36}/gi,'[dossier]').replace(/\u001b\[[0-9;]+m/g,'').replace(/\s+/g,' ').slice(0,550);
(async()=>{const db=new Client({connectionString:url.href});await db.connect();const q=async(s,params)=>{try{return (await db.query(s,params)).rows;}catch(e){throw Error((s.match(/(?:into|update|from) ([a-z_.]+)/i)?.[1]||'requête')+' : '+e.message+' '+(e.where||'').slice(0,300));}};
 const b=await chromium.launch({args:['--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1;[::1]','--disable-background-networking']});
 const vp={viewport:{width,height:width===1440?960:844},locale:'fr-FR',hasTouch:width!==1440};const owner=await b.newContext(vp),admin=await b.newContext({...vp,storageState:'/private/tmp/gerimmo-342-parcours-1711/sessions/superadmin.json'});const p=await owner.newPage(),a=await admin.newPage();
 for(const c of [owner,admin]){await c.addInitScript(()=>{try{sessionStorage.setItem('gerimmo-synthese-alertes-vue','1')}catch{}});c.setDefaultTimeout(16000);c.setDefaultNavigationTimeout(75000);}
 let org,account,key,email,nom,secret,baseOrg,ab,fiche;
 const transport=()=>fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')).filter(x=>x.organisation===org):[];
 const etape=async(id,acteur,route,action)=>{const cas={id,acteur,route:propre(route),largeur:width};const page=acteur==='superadministrateur'?a:p;try{cas.observe=await action();cas.statut='réussi';}catch(e){cas.statut='à vérifier';cas.erreur=propre(e.message);cas.chemin=propre(new URL(page.url()).pathname);cas.messages=(await page.locator('main [role=alert], form [role=alert], main [role=status]').allTextContents().catch(()=>[])).map(propre);cas.titre=propre(await page.locator('h1:visible').first().innerText({timeout:1500}).catch(()=>''));}scenarios.push(cas);fs.writeFileSync(path.join(dir,(complement?'suivi-':'recette-')+width+'.json'),JSON.stringify(scenarios,null,1));};
 const etat=async()=>{const r=await q('select stripe_statut,annulation_demandee,periode_fin,resiliation_accusee_pour from abonnements where organization_id=$1',[org]);return r[0]||{}};
 const creerProfil=async(statut,jours)=>{
  org=randomUUID();account=randomUUID();key='loc'+org.replaceAll('-','');email='commerce-'+org+'@example.invalid';nom='Parc des Ormes '+org.slice(0,6);secret='Recette-Commerce-'+org;
  baseOrg='/espace/'+org;ab=baseOrg+'/abonnement';fiche='/admin/organisations/'+org;
  await q('begin');
  await q("insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{\"provider\":\"email\",\"providers\":[\"email\"]}','{}',now(),now(),'','','','','')",[account,email,secret]);
  await q("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city,email_contact,grille_tarifaire) values($1,$2,'proprietaire_direct',$4,current_date+$5::int,'12 rue des Ormes','69003','Lyon',$3,$6)",[org,nom,email,statut,jours,statut==='essai'&&jours<0?'historique':'2026-09-28']);
  await q("insert into memberships(account_id,organization_id,role)values($1,$2,'proprietaire_direct')",[account,org]);
  if(jours>0)await q("insert into persons(organization_id,account_id,nom,prenom,email,qualite) values($1,$2,'des Ormes','Camille',$3,'Personne physique')",[org,account,email]);
  if(statut==='essai'&&jours<0){
   // Le parc historique sans bien conserve son accès jusqu'à sa migration normale.
   // La RPC officielle bascule ce seul dossier fictif vers la grille moderne.
   await q('select public.abonnement_basculer_grille($1)',[org]);
   const [o]=await q('select grille_tarifaire,public.org_ecriture_ouverte(id) as ecriture from organizations where id=$1',[org]);
   if(o.ecriture||o.grille_tarifaire!=='2026-09-28')throw Error('Le dossier modernisé ne représente pas un essai réellement expiré');
  }
  await q('commit');
  await owner.clearCookies();await ag(p,'/connexion');await p.getByLabel('Adresse e-mail',{exact:true}).fill(email);await p.getByLabel('Mot de passe',{exact:true}).fill(secret);
  await p.getByRole('button',{name:'Se connecter',exact:true}).click();await expect(p).toHaveURL(new RegExp('/espace/'+org));
 };
 try{
  if(!complement){
  await creerProfil('essai',60);
  await etape('01','propriétaire',ab,async()=>{await ag(p,ab);await expect(p.getByRole('heading',{name:'Mon abonnement',exact:true})).toBeVisible();await expect(p.locator('main')).toContainText(/essai/i);if((await etat()).stripe_statut)throw Error('Abonnement créé depuis une lecture de l’essai');return 'Essai visible au propriétaire, aucune souscription en base.';});
  await etape('02','propriétaire',ab+'/resiliation',async()=>{await ag(p,ab+'/resiliation');await expect(p.getByText(/Aucun abonnement n.est en cours/)).toBeVisible();await expect(p.getByRole('button',{name:'Notifier la résiliation'})).toHaveCount(0);return 'La page explique que rien n’est à résilier et aucun prélèvement n’est créé.';});
  await creerProfil('essai',-1);
  await etape('03','propriétaire',ab,async()=>{await ag(p,ab);const texte=await p.locator('main').innerText();await expect(p.locator('main')).toContainText(/lecture seule|essai.*termin|essai.*expir/i);if((await etat()).stripe_statut)throw Error('Conversion automatique fictive');return 'Essai expiré en lecture seule, aucune souscription enregistrée.';});
  }
  await creerProfil('active',-1);
  const start=Math.floor(Date.now()/1000)-86400,end=start+30*86400;
  const conf=await fetch('http://127.0.0.1:56682/fictif',{method:'POST',body:JSON.stringify({org,key,start,end})});if(!conf.ok)throw Error('Simulateur local non initialisé');
  await q("insert into abonnements(organization_id,stripe_customer_id,stripe_subscription_id,stripe_statut,quantite,periode_fin,periode_debut,souscrit_le,periodicite,formule,unites_souscrites,montant_mensuel_cents,montant_periode_cents) values($1,$2,$3,'active',1,to_timestamp($5),to_timestamp($4),to_timestamp($4),'mensuel','gerimmo',1,599,599) on conflict(organization_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,stripe_statut='active',periode_fin=excluded.periode_fin,periode_debut=excluded.periode_debut,souscrit_le=excluded.souscrit_le,formule='gerimmo',unites_souscrites=1,montant_mensuel_cents=599,montant_periode_cents=599",[org,'cus_'+key,'sub_'+key,start,end]);
  if(complement){
   await etape('10','propriétaire',baseOrg+'/faq',async()=>{
    await ag(p,'/assistance?ecran=/espace/'+org+'/abonnement');
    await p.getByText('Faire une réclamation',{exact:true}).click();
    await p.getByLabel('Espace concerné').selectOption(org);
    const titre='Examen de ma facture '+org.slice(0,8),reponse='Nous vérifions le paiement d’origine avant toute décision financière.';
    await p.getByLabel('Sujet',{exact:true}).fill(titre);
    await p.getByLabel('Votre message').fill('Pouvez-vous examiner cette facture fictive pour un avoir ou un remboursement sans exécuter de paiement ?');
    await p.getByRole('button',{name:'Envoyer ma demande'}).click();
    await expect(p.getByText('Votre demande est enregistrée.')).toBeVisible();
    await p.getByRole('link',{name:'Consulter ma demande'}).click();
    const [demande]=await q('select id,etat from retours_utilisateurs where organization_id=$1 and auteur_id=$2 and titre=$3',[org,account,titre]);
    if(!demande||demande.etat!=='nouveau')throw Error('Demande absente du dossier autorisé');
    await ag(a,fiche);const section=a.locator('summary').filter({hasText:'Traiter une demande de remboursement ou d’avoir'});await section.click();
    await section.locator('..').getByRole('link',{name:'dossier de support'}).click();
    await expect(a.locator('select[name=org]')).toHaveValue(org);
    const d=a.locator('#retour-'+demande.id);await expect(d.getByRole('heading',{name:titre})).toBeVisible();
    const action=d.getByLabel('Décision');if(!await action.isVisible())await d.locator('summary').filter({hasText:'Répondre et décider'}).click();
    await action.selectOption('en_examen');await d.getByLabel('Réponse visible dans le suivi').fill(reponse);await d.getByRole('button',{name:'Enregistrer la décision'}).click();
    await expect.poll(async()=>(await q('select etat from retours_utilisateurs where id=$1',[demande.id]))[0].etat).toBe('en_examen');
    await p.reload();await expect(p.locator('#demande-'+demande.id)).toContainText(reponse);
    const [trace]=await q('select count(*)::int n from retours_historique where retour_id=$1 and message=$2',[demande.id,reponse]);if(trace.n!==1)throw Error('Réponse sans trace unique');
    if(transport().some(t=>t.methode==='POST'||t.methode==='DELETE'))throw Error('Opération financière sans décision');
    return 'Demande d’examen d’un avoir/remboursement transmise depuis le propriétaire, retrouvée dans la supervision filtrée, prise en examen, réponse relue par le titulaire après rechargement et trace unique ; aucune écriture chez le prestataire.';
   });
   const acces=async()=>(await q('select public.org_ecriture_ouverte($1) as acces',[org]))[0].acces;
   await etape('11','propriétaire',ab,async()=>{
    await q("update abonnements set stripe_statut='past_due',paiement_en_defaut_depuis=public.aujourdhui_paris()-16,relances_paiement=0 where organization_id=$1",[org]);
    await ag(p,ab);await expect(p.getByText("Le dernier prélèvement n'est pas passé.")).toBeVisible();if(!await acces())throw Error('Restriction avant relance');
    await ag(a,fiche);await expect(a.getByText(/En défaut depuis/)).toBeVisible();
    return 'Défaut simulé de 16 jours sans relance : alerte visible au payeur et au superviseur, droits de saisie conservés.';
   });
   await etape('12','propriétaire',ab,async()=>{
    // État initial représentatif d’une relance déjà consignée : ce scénario ne prouve pas sa délivrabilité.
    await q("update abonnements set relances_paiement=1,derniere_relance_le=public.aujourdhui_paris()-7 where organization_id=$1",[org]);
    await ag(p,ab);await expect(p.getByText('Votre compte est en lecture seule, faute de règlement.')).toBeVisible();if(await acces())throw Error('Restriction 16 jours avec relance absente');
    await q("update abonnements set stripe_statut='active',paiement_en_defaut_depuis=null,relances_paiement=0,derniere_relance_le=null where organization_id=$1",[org]);
    await ag(p,ab);await expect(p.getByText('Votre compte est en lecture seule, faute de règlement.')).toHaveCount(0);
    if(!await acces())throw Error('Un règlement confirmé fictif ne rouvre pas les droits');
    return 'Droits en lecture seule et message concordants après délai et relance déjà consignée ; le retour à un état payé fictif rétablit les droits. La livraison de la relance et le webhook ne sont pas simulés par ce contrôle.';
   });
   await etape('13','propriétaire',ab,async()=>{
    await q("update abonnements set stripe_statut='canceled',paiement_en_defaut_depuis=public.aujourdhui_paris()-45,relances_paiement=2 where organization_id=$1",[org]);
    await q("update organizations set status='suspendue' where id=$1",[org]);
    await ag(p,ab);await expect(p.getByText('Votre abonnement a été résilié faute de règlement.')).toBeVisible();
    const main=p.locator('main:visible').first(),texte=(await main.innerText()).replace(/\s+/g,' ');
    if(/Souscrivez de nouveau ci-dessous/.test(texte)&&/actuellement fermées|pas encore ouvert|temporairement fermées|indisponibles/i.test(texte))throw Error('Instruction contradictoire : « Souscrivez de nouveau ci-dessous » alors que le formulaire de vente indique la fermeture ou l’indisponibilité.');
    if(/Souscrivez de nouveau ci-dessous/.test(texte))throw Error('Invitation de souscrire malgré le verrou local de nouvelles ventes ; messages visibles : '+texte.slice(-150));
    return 'La résiliation pour défaut n’annonce aucune reprise de commande indisponible. La facture seule détermine le montant restant.';
   });
   return;
  }
  await etape('04','propriétaire',ab,async()=>{await ag(p,ab);await expect(p.getByRole('heading',{name:'Mon abonnement',exact:true})).toBeVisible();await expect(p.locator('main')).toContainText('5,99');await expect(p.getByRole('link',{name:/Résilier votre contrat|Résilier mon abonnement|Résilier mon contrat/i}).first()).toBeVisible();return 'Contrat mensuel fictif actif à 5,99 € et lien de résiliation disponible.';});
  await etape('05','superadministrateur',fiche,async()=>{await ag(a,fiche);await expect(a.getByRole('heading',{name:nom,exact:true})).toBeVisible();await a.getByRole('link',{name:'Consulter les dernières factures'}).click();const liste=a.getByRole('region',{name:'Dernières factures de l’abonnement'});await expect(liste).toContainText('RECETTE-'+key.slice(-6));await expect(liste).toContainText(/5,99/);await expect(liste).toContainText(/Restant dû\s*:\s*0,00/);const n=await q("select count(*)::int n from audit_log where organization_id=$1 and action='consultation_factures_abonnement'",[org]);if(n[0].n!==1)throw Error('Lecture du superadministrateur sans trace unique');return 'Facture fictive du bon contrat ouverte, 5,99 € affectés, 0 € restant ; lectures du fournisseur simulé '+transport().filter(x=>x.operation==='/v1/invoices').length+' ; traces constatées '+n[0].n;});
  await etape('06','superadministrateur',fiche,async()=>{await ag(a,fiche);const s=a.locator('summary').filter({hasText:'Traiter une demande de remboursement ou d’avoir'});await s.click();const panneau=s.locator('..');await expect(panneau).toContainText('Émettre un avoir');await expect(panneau).toContainText('paiement d’origine');await panneau.getByRole('link',{name:'dossier de support'}).click();await expect(a).toHaveURL(new RegExp('/admin/retours\\?org='+org));return 'La procédure distingue l’avoir, le remboursement, la rétractation et les doublons. Le support s’ouvre sur cette organisation ; l’émission exceptionnelle reste chez Stripe.';});
  await etape('07','propriétaire',ab+'/resiliation',async()=>{await ag(p,ab+'/resiliation');const submit=p.getByRole('button',{name:'Notifier la résiliation'});const champ=p.getByLabel(/Adresse électronique de l.accusé/);await champ.fill('adresse-invalide');await submit.click();if(!await champ.evaluate(el=>!el.validity.valid))throw Error('Adresse invalide acceptée');if((await etat()).annulation_demandee)throw Error('État modifié avec une adresse invalide');await p.getByLabel('Nom et prénom').fill('Camille des Ormes');await champ.fill(email);await submit.click();await expect.poll(async()=>(await etat()).annulation_demandee).toBe(true);await expect(p).toHaveURL(/resiliation=programmee/);const e=await etat();const mails=await(await fetch('http://127.0.0.1:55520/messages')).json();const recus=mails.filter(m=>m.to.includes(email)&&/résiliation/i.test(m.subject||''));if(recus.length!==1||!e.resiliation_accusee_pour)throw Error('Accusé de résiliation marqué : '+Boolean(e.resiliation_accusee_pour)+' ; courriels reçus : '+recus.length);return 'Adresse erronée bloquée ; résiliation volontaire reçue par le Stripe simulé, annulation en fin de période confirmée et écran rechargé. Marque d’accusé présente : '+Boolean(e.resiliation_accusee_pour)+'.';});
  await etape('08','propriétaire',ab+'/retractation',async()=>{await ag(p,ab+'/retractation');const actif=p.getByRole('button',{name:'Confirmer la rétractation'});await expect(actif).toBeVisible();await p.getByLabel('Nom et prénom').fill('Camille des Ormes');await p.getByLabel(/Adresse électronique de l.accusé/).fill(email);await actif.click();let d;await expect.poll(async()=>{d=(await q('select declaree_le,executee_le,montant_rembourse_cents,accuse_envoye_le from retractations_abonnement where organization_id=$1',[org]))[0];return Boolean(d?.executee_le&&d?.accuse_envoye_le);}).toBe(true);if(Number(d.montant_rembourse_cents)!==599)throw Error('Montant simulé incorrect');
   const recue=async()=>(await(await fetch('http://127.0.0.1:55520/messages')).json()).filter(m=>m.to.includes(email)&&/rétractation/i.test(m.subject||''));
   await expect.poll(async()=>(await recue()).length).toBe(1);await ag(p,ab+'/retractation');await expect(p.getByText(/Votre rétractation est enregistrée depuis/)).toBeVisible();
   const reprise=p.getByRole('button',{name:'Confirmer la rétractation'});const copieDemandee=await reprise.isVisible();if(copieDemandee){await p.getByLabel('Nom et prénom').fill('Camille des Ormes');await p.getByLabel(/Adresse électronique de l.accusé/).fill(email);await reprise.click();await expect(p.locator('main:visible').first()).toContainText(/rétractation|abonnement/);await expect.poll(async()=>(await q('select count(*)::int n from retractations_abonnement where organization_id=$1 and executee_le is not null',[org]))[0].n).toBe(1);}
   const gestes=transport().filter(x=>x.operation==='/v1/refunds'&&x.methode==='POST');if(gestes.length!==1)throw Error('Nombre de restitutions simulées : '+gestes.length);await expect.poll(async()=>(await recue()).length).toBe(copieDemandee?2:1);return 'Déclaration dans le délai, fin simulée du contrat ; un seul remboursement fictif de 599 centimes, la reprise volontaire après rechargement conserve la même déclaration. Accusé initial marqué et reçu une fois. Copie expressément redemandée par le titulaire : '+copieDemandee+'.';});
  await etape('09','propriétaire',fiche,async()=>{await ag(p,fiche+'?factures=1#historique-factures');await expect.poll(()=>new URL(p.url()).pathname.startsWith('/admin/')).toBe(false);await expect(p.getByRole('region',{name:'Dernières factures de l’abonnement'})).toHaveCount(0);return 'La session du propriétaire est écartée du détail de supervision.';});
 }finally{await b.close();await db.end();}
})().catch(e=>{console.error(propre(e.message));process.exitCode=1});
