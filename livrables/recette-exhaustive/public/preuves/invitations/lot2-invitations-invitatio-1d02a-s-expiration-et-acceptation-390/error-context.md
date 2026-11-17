# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lot2-invitations.spec.ts >> invitation locale : acceptation fournisseur fictif, refus, expiration et acceptation
- Location: ../../../../Users/easycash/Documents/Gerimmo V3/work/premiers-clients-payants/app/e2e/lot2-invitations.spec.ts:7:5

# Error details

```
TimeoutError: page.goto: Timeout 20000ms exceeded.
Call log:
  - navigating to "http://localhost:3483/connexion", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect, type Page } from '@playwright/test';
  2  | import { Client } from 'pg';
  3  | import { randomUUID } from 'node:crypto';
  4  | import { sansSyntheseAlertes, debordementHorizontal } from './aides';
  5  | const org='3c1d1e95-3570-400b-8012-44530be145b1';
> 6  | async function login(p:Page,email:string){await sansSyntheseAlertes(p);await p.goto('/connexion');await p.locator('#email').fill(email);await p.locator('#mot-de-passe').fill('Gerimmo-Demo-2026');await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForURL(/\/(espaces|espace|agence|locataire)(\/|$)/);}
     |                                                                                ^ TimeoutError: page.goto: Timeout 20000ms exceeded.
  7  | test('invitation locale : acceptation fournisseur fictif, refus, expiration et acceptation',async({browser},info)=>{
  8  |  const url=process.env.SUPALOCAL_DB;test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url),'Base API fictive locale seulement');
  9  |  const db=new Client({connectionString:url});await db.connect();
  10 |  const target=randomUUID(),person=randomUUID(),email=`test-invitation-${target}@example.invalid`;
  11 |  const owner=await browser.newContext({...info.project.use});const tenant=await browser.newContext({...info.project.use});owner.setDefaultTimeout(15000);owner.setDefaultNavigationTimeout(20000);tenant.setDefaultTimeout(15000);tenant.setDefaultNavigationTimeout(20000);let p=await owner.newPage();let t=await tenant.newPage();
  12 |  try{
  13 |   await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current) values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt('Gerimmo-Demo-2026',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','')`,[target,email]);
  14 |   await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'TEST Invitation','Camille',$3)",[person,org,email]);
  15 |   await login(p,'proprietaire@example.com');await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);
  16 |   let card=p.locator('#acces-locataire');await card.getByRole('button',{name:'Inviter comme locataire',exact:true}).click();
  17 |   await expect.poll(async()=>(await db.query("select envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0]?.envoye_le).toBeTruthy();
  18 |   await expect(card.getByText('En attente d’acceptation',{exact:true})).toBeVisible();
  19 |   expect((await db.query('select account_id from persons where id=$1',[person])).rows[0].account_id).toBeNull();
  20 |   expect((await db.query('select * from memberships where account_id=$1 and organization_id=$2',[target,org])).rows).toHaveLength(0);
  21 |   const latest=async()=>(await db.query("select id from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0].id as string;
  22 |   let id=await latest();await p.screenshot({path:info.outputPath('invitation-proprietaire.png'),fullPage:true});
  23 |   console.log('ETAPE connexion locataire');await login(t,email);await expect(t.getByRole('heading',{name:'Vos invitations'})).toBeVisible();await t.getByRole('link').filter({hasText:'Invitation locataire à accepter ou refuser'}).click();
  24 |   await expect(t.getByRole('button',{name:'Accepter l’invitation',exact:true})).toBeVisible();expect(await debordementHorizontal(t)).toBeLessThanOrEqual(1);
  25 |   await t.screenshot({path:info.outputPath('invitation-locataire.png'),fullPage:true});
  26 |   await t.getByRole('button',{name:'Refuser',exact:true}).click();await expect.poll(async()=>(await db.query('select etat from invitations_locataires where id=$1',[id])).rows[0].etat).toBe('refusee');await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  27 |   console.log('ETAPE refus confirmé');t=await tenant.newPage();await t.goto(`/invitations/${id}`);await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  28 |   console.log('ETAPE relecture propriétaire');p=await owner.newPage();await sansSyntheseAlertes(p);await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);card=p.locator("#acces-locataire");await card.getByRole('button',{name:'Envoyer une nouvelle invitation'}).click();await expect.poll(async()=>(await db.query("select envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0]?.envoye_le).toBeTruthy();id=await latest();
  29 |   await db.query("update invitations_locataires set expire_le=now()-interval '1 second' where id=$1",[id]);
  30 |   await t.goto(`/invitations/${id}`);await expect(t.getByText('Expirée',{exact:true})).toBeVisible();await expect(t.getByRole('button',{name:'Accepter l’invitation'})).toHaveCount(0);
  31 |   console.log('ETAPE relecture propriétaire');p=await owner.newPage();await sansSyntheseAlertes(p);await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);card=p.locator("#acces-locataire");await expect(card.getByText('Expirée',{exact:true})).toBeVisible();await card.getByRole('button',{name:'Envoyer une nouvelle invitation'}).click();await expect.poll(async()=>(await db.query("select envoye_le from invitations_locataires where person_id=$1 and etat='en_attente' and expire_le>now()",[person])).rows[0]?.envoye_le).toBeTruthy();id=await latest();
  32 |   await t.goto(`/invitations/${id}`);await t.getByRole('button',{name:'Accepter l’invitation',exact:true}).click();await t.waitForURL(`/locataire/${org}`);
  33 |   expect((await db.query('select account_id from persons where id=$1',[person])).rows[0].account_id).toBe(target);
  34 |   console.log('ETAPE relecture propriétaire');p=await owner.newPage();await sansSyntheseAlertes(p);await p.goto(`/espace/${org}/personnes/${person}#acces-locataire`);card=p.locator("#acces-locataire");await expect(card.getByText(/Compte locataire actif/)).toBeVisible();await card.getByText('Historique des invitations',{exact:true}).click();await expect(card.locator('li')).toHaveCount(3);
  35 |   await p.screenshot({path:info.outputPath('invitation-acceptee-historique.png'),fullPage:true});
  36 |  }finally{
  37 |   await owner.close();await tenant.close();
  38 |   await db.end();
  39 |  }
  40 | });
  41 | 
```