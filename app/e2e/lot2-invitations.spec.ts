import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';
const org='3c1d1e95-3570-400b-8012-44530be145b1';
async function login(p:Page,email:string){await sansSyntheseAlertes(p);await p.goto('/connexion');await p.locator('#email').fill(email);await p.locator('#mot-de-passe').fill('Gerimmo-Demo-2026');await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForURL(/\/(espaces|espace|agence|locataire)(\/|$)/);}
async function captures(page: Page, nom: string, fichier: (nom: string) => string) {
 const formatInitial = page.viewportSize();
 for (const width of [390, 768, 1440]) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: fichier(`${nom}-${width}.png`), fullPage: true });
 }
 if (formatInitial) await page.setViewportSize(formatInitial);
}
test('invitation locale : refus, expiration, attente du bail, occupation et départ',async({browser},info)=>{
 const url=process.env.SUPALOCAL_DB;test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API fictive locale seulement');
 const db=new Client({connectionString:url});await db.connect();
 const target=randomUUID(),person=randomUUID(),email=`test-invitation-${target}@example.invalid`;
 const owner=await browser.newContext({...info.project.use});const tenant=await browser.newContext({...info.project.use});owner.setDefaultTimeout(15000);tenant.setDefaultTimeout(15000);let p=await owner.newPage();let t=await tenant.newPage();
 try{
  await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt('Gerimmo-Demo-2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','')`,[target,email]);
  await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'TEST Invitation','Camille',$3)",[person,org,email]);
  await login(p,'proprietaire@example.com');await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);
  let card=p.locator('#acces-locataire');await card.getByRole('button',{name:'Inviter comme locataire',exact:true}).click();
  await expect.poll(async()=>(await db.query("select envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0]?.envoye_le).toBeTruthy();
  await expect(card.getByText(/^En attente de Camille TEST Invitation depuis le /)).toBeVisible();
  await expect(card.getByRole('button',{name:'Renvoyer l’invitation'})).toBeVisible();
  expect((await db.query('select account_id from persons where id=$1',[person])).rows[0].account_id).toBeNull();
  expect((await db.query('select * from memberships where account_id=$1 and organization_id=$2',[target,org])).rows).toHaveLength(0);
  const latest=async()=>(await db.query("select id from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0].id as string;
  let id=await latest();
  await captures(p, 'invitation-proprietaire', (nom) => info.outputPath(nom));
  const boite = process.env.E2E_BOITE_FICTIVE ?? 'http://127.0.0.1:55520';
  const courriels = await (await p.request.get(`${boite}/messages`)).json() as {to:string[];html:string}[];
  expect(courriels.find((message) => message.to.includes(email))?.html).toContain(id);
  console.log('ETAPE connexion locataire');await login(t,email);await expect(t.getByRole('heading',{name:'Vos invitations'})).toBeVisible();await t.getByRole('link').filter({hasText:'Invitation locataire à accepter ou refuser'}).click();
  await expect(t.getByRole('button',{name:'Accepter l’invitation',exact:true})).toBeVisible();expect(await debordementHorizontal(t)).toBeLessThanOrEqual(1);
  await t.screenshot({path:info.outputPath('invitation-locataire.png'),fullPage:true});
  await t.getByRole('button',{name:'Refuser',exact:true}).click();await expect.poll(async()=>(await db.query('select etat from invitations_locataires where id=$1',[id])).rows[0].etat).toBe('refusee');await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  console.log('ETAPE refus confirmé');t=await tenant.newPage();await t.goto(`/invitations/${id}`);await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  console.log('ETAPE relecture propriétaire');p=await owner.newPage();await sansSyntheseAlertes(p);await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);card=p.locator("#acces-locataire");await card.getByRole('button',{name:'Envoyer une nouvelle invitation'}).click();await expect.poll(async()=>(await db.query("select envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0]?.envoye_le).toBeTruthy();id=await latest();
  await db.query("update invitations_locataires set expire_le=now()-interval '1 second' where id=$1",[id]);
  await t.goto(`/invitations/${id}`);await expect(t.getByText('Expirée',{exact:true})).toBeVisible();await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  console.log('ETAPE relecture propriétaire');p=await owner.newPage();await sansSyntheseAlertes(p);await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);card=p.locator("#acces-locataire");await expect(card.getByText('Expirée',{exact:true})).toBeVisible();await card.getByRole('button',{name:'Envoyer une nouvelle invitation'}).click();await expect.poll(async()=>(await db.query("select envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0]?.envoye_le).toBeTruthy();id=await latest();
  await t.goto(`/invitations/${id}`);await t.getByRole('button',{name:'Accepter l’invitation',exact:true}).click();await t.waitForURL(`/locataire/${org}`);
  await expect(t.getByRole('heading',{name:'Votre bail n’est pas encore actif',level:1})).toBeVisible();
  await expect(t.getByText(/Responsable de la prochaine étape/)).toBeVisible();
  expect((await db.query('select account_id from persons where id=$1',[person])).rows[0].account_id).toBe(target);
  console.log('ETAPE relecture propriétaire');p=await owner.newPage();await sansSyntheseAlertes(p);await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);card=p.locator("#acces-locataire");await expect(card.getByText(/Compte locataire actif/)).toBeVisible();await card.getByText('Historique des invitations',{exact:true}).click();await expect(card.locator('li')).toHaveCount(3);
  await p.screenshot({path:info.outputPath('invitation-acceptee-historique.png'),fullPage:true});
  await captures(t, 'attente-bail', (nom) => info.outputPath(nom));

  // Le bail, le terme et l'état des lieux sont des données fictives du même dossier.
  const bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'Immeuble Invitation','immeuble','12 rue fictive','45000','Orléans',false) returning id", [org])).rows[0].id;
  await db.query("begin");
  const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'Appartement fictif','loue') returning id", [org,bien])).rows[0].id;
  const bail = (await db.query("insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'nu','actif',current_date-90,600,40) returning id", [org,lot,person])).rows[0].id;
  await db.query("insert into appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,date_trunc('month',current_date),current_date,600,40,640) on conflict do nothing", [org,bail]);
  await db.query("commit");
  await t.reload();
  await expect(t.getByRole('heading',{name:'À faire en priorité'})).toHaveCount(1);
  await captures(t, 'accueil-actif', (nom) => info.outputPath(nom));
  await t.goto(`/locataire/${org}/contact`);
  await expect(t.getByRole('button',{name:'Envoyer le message'})).toBeVisible();
  await captures(t, 'contact-actif', (nom) => info.outputPath(nom));

  const gestionnaire = (await db.query("select account_id from memberships where organization_id=$1 and role='proprietaire_direct' and status='active' limit 1", [org])).rows[0].account_id;
  await db.query('begin');
  try {
   await db.query("update baux set etat='preavis', date_fin=current_date where id=$1", [bail]);
   const edl = (await db.query("insert into etats_des_lieux(organization_id,bail_id,type) values($1,$2,'sortie') returning id", [org,bail])).rows[0].id;
   await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:gestionnaire,role:'authenticated',aal:'aal2'})]);
   await db.query('set local role authenticated');
   await db.query("select generer_grille_edl($1)", [edl]);
   await db.query("update edl_lignes set etat='bon' where edl_id=$1", [edl]);
   await db.query("select signer_edl_avec_preuve($1,'pdf_signe',$2,'application/pdf',1000,gen_random_uuid()::text)", [edl,`${org}/edl-${edl}.pdf`]);
   await db.query("select terminer_bail($1)", [bail]);
   await db.query('reset role');
   const quittance = (await db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,partage_le) values($1,'quittance','Quittance fictive archivée',$2,'application/pdf',1000,gen_random_uuid()::text,now()) returning id", [org,`${org}/quittance-${bail}.pdf`])).rows[0].id;
   await db.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'personne',$3)", [quittance,org,person]);
   await db.query("insert into restitutions(organization_id,bail_id,date_remise_cles,delai_mois,depot,statut,solde,date_emission) values($1,$2,current_date,1,250,'finalise',250,current_date)", [org,bail]);
   await db.query('commit');
  } catch (erreur) {
   await db.query('rollback');
   throw erreur;
  }

  await t.goto(`/locataire/${org}`);
  await expect(t.getByRole('heading',{name:'Votre bail est terminé'})).toBeVisible();
  await expect(t.getByRole('heading',{name:'À faire en priorité'})).toHaveCount(0);
  await expect(t.getByRole('link',{name:/Voir le décompte/})).toBeVisible();
  await captures(t, 'accueil-apres-depart', (nom) => info.outputPath(nom));
  await t.getByRole('link',{name:'Mes états des lieux',exact:true}).click();
  await expect(t.getByText('État des lieux de sortie',{exact:true})).toBeVisible();
  await expect(t.getByText('Vous quittez le logement ?', {exact:true})).toHaveCount(0);
  await captures(t, 'logement-apres-depart', (nom) => info.outputPath(nom));
  await t.goto(`/locataire/${org}/documents`);
  await expect(t.getByRole('heading',{name:'Documents disponibles'})).toBeVisible();
  await expect(t.getByText('État des lieux signé par les parties',{exact:true})).toBeVisible();
  await expect(t.getByText('Quittance fictive archivée',{exact:true})).toBeVisible();
  await expect(t.getByRole('tab',{name:'À transmettre'})).toHaveCount(0);
  await captures(t, 'documents-apres-depart', (nom) => info.outputPath(nom));
  await t.goto(`/locataire/${org}/contact`);
  await expect(t.getByRole('button',{name:'Envoyer le message'})).toHaveCount(0);
 }finally{
  await owner.close();await tenant.close();
  await db.end();
 }
});
