import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { sansSyntheseAlertes, debordementHorizontal } from './aides';
const org='3c1d1e95-3570-400b-8012-44530be145b1';
async function login(p:Page,email:string){await sansSyntheseAlertes(p);await p.goto('/connexion');await p.locator('#email').fill(email);await p.locator('#mot-de-passe').fill('Gerimmo-Demo-2026');await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForURL(/\/(espaces|agence|locataire)(\/|$)/);}
test('invitation : envoi non configuré honnête, refus, expiration, acceptation et historique',async({browser},info)=>{
 const url=process.env.SUPALOCAL_DB;test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API fictive locale seulement');
 const db=new Client({connectionString:url});await db.connect();
 const target=randomUUID(),person=randomUUID(),email=`test-invitation-${target}@example.invalid`;
 const owner=await browser.newContext({...info.project.use});const tenant=await browser.newContext({...info.project.use});const p=await owner.newPage(),t=await tenant.newPage();
 try{
  await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt('Gerimmo-Demo-2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','')`,[target,email]);
  await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'TEST Invitation','Camille',$3)",[person,org,email]);
  await login(p,'proprietaire@gerimmo-demo.fr');await p.goto(`/agence/${org}/personnes/${person}#acces-locataire`);
  const card=p.locator('#acces-locataire');await card.getByRole('button',{name:'Inviter comme locataire',exact:true}).click();
  await expect(card.getByRole('alert')).toContainText('n’a pas été envoyé');
  await expect(card.getByText('En attente d’acceptation',{exact:true})).toBeVisible();
  expect((await db.query('select account_id from persons where id=$1',[person])).rows[0].account_id).toBeNull();
  expect((await db.query('select * from memberships where account_id=$1 and organization_id=$2',[target,org])).rows).toHaveLength(0);
  const latest=async()=>(await db.query("select id from invitations_locataires where person_id=$1 and etat='en_attente'",[person])).rows[0].id as string;
  let id=await latest();await p.screenshot({path:info.outputPath('invitation-proprietaire.png'),fullPage:true});
  await login(t,email);await expect(t.getByRole('heading',{name:'Vos invitations'})).toBeVisible();await t.getByRole('link').filter({hasText:'Invitation locataire à accepter ou refuser'}).click();
  await expect(t.getByRole('button',{name:'Accepter l’invitation',exact:true})).toBeVisible();expect(await debordementHorizontal(t)).toBeLessThanOrEqual(1);
  await t.screenshot({path:info.outputPath('invitation-locataire.png'),fullPage:true});
  await t.getByRole('button',{name:'Refuser',exact:true}).click();await expect(t.getByText('Refusée',{exact:true})).toBeVisible();
  await t.reload();await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  await p.reload();await card.getByRole('button',{name:'Envoyer une nouvelle invitation'}).click();await expect(card.getByRole('alert')).toContainText('n’a pas été envoyé');id=await latest();
  await db.query("update invitations_locataires set expire_le=now()-interval '1 second' where id=$1",[id]);
  await t.goto(`/invitations/${id}`);await expect(t.getByText('Expirée',{exact:true})).toBeVisible();await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  await p.reload();await expect(card.getByText('Expirée',{exact:true})).toBeVisible();await card.getByRole('button',{name:'Envoyer une nouvelle invitation'}).click();await expect(card.getByRole('alert')).toContainText('n’a pas été envoyé');id=await latest();
  await t.goto(`/invitations/${id}`);await t.getByRole('button',{name:'Accepter l’invitation',exact:true}).click();await t.waitForURL(`/locataire/${org}`);
  expect((await db.query('select account_id from persons where id=$1',[person])).rows[0].account_id).toBe(target);
  await p.reload();await expect(card.getByText(/Compte locataire actif/)).toBeVisible();await card.getByText('Historique des invitations',{exact:true}).click();await expect(card.locator('li')).toHaveCount(3);
  await p.screenshot({path:info.outputPath('invitation-acceptee-historique.png'),fullPage:true});
 }finally{
  await owner.close();await tenant.close();
  await db.query('begin');try{
   await db.query('delete from audit_log where account_id=$1 or (organization_id=$2 and (details->>\'person_id\'=$3 or details->>\'compte\'=$1::text or details->>\'invitation\' in(select id::text from invitations_locataires where person_id=$3::uuid)))',[target,org,person]);
   await db.query('delete from invitations_locataires where person_id=$1',[person]);await db.query('delete from persons where id=$1',[person]);await db.query('delete from memberships where account_id=$1',[target]);await db.query('delete from audit_log where account_id=$1 or details->>\'compte\'=$1::text',[target]);await db.query('delete from auth.users where id=$1',[target]);await db.query('commit');
  }catch(e){await db.query('rollback');throw e;}finally{await db.end();}
 }
});
