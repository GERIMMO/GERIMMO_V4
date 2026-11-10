import {test,expect} from '@playwright/test';
import {Client} from 'pg';
import {randomUUID,createHmac} from 'node:crypto';
import {connecterVers,sansSyntheseAlertes} from './aides';
const api='http://127.0.0.1:54331';
function clePublique(){const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role:'anon',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return a+'.'+b+'.'+createHmac('sha256','gerimmo-local-secret').update(a+'.'+b).digest('base64url');}
for(const role of ['proprietaire_direct','locataire','artisan'] as const)test(`accès directs refusés : ${role} d’un autre patrimoine SCI`,async({page},info)=>{
 const url=process.env.SUPALOCAL_DB;if(!['postgresql://postgres@127.0.0.1:55449/gerimmo_ci_lottrois_api','postgresql://postgres@127.0.0.1:55449/gerimmo_ci_vun_api'].includes(url??''))throw Error('Base locale fictive requise');
 const db=new Client({connectionString:url});await db.connect();
 const id=randomUUID(),email=`controle-${id}@example.invalid`,password='Fictif-'+randomUUID();
 try{
  // Fixture autonome : ne dépend pas de l’ordre du scénario de dépôt de facture.
  const source=(await db.query("insert into organizations(name,type,status) values('Patrimoine source fictif','proprietaire_direct','essai') returning id")).rows[0].id;
  const doc=(await db.query("insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Document privé fictif',$2,'application/pdf',10,$3) returning id,organization_id,storage_path",[source,source+'/'+randomUUID()+'.pdf',randomUUID()])).rows[0];
  const org=(await db.query("insert into organizations(name,type,status) values('SCI séparée de recette','proprietaire_direct','essai') returning id")).rows[0].id;
  await db.query("insert into persons(organization_id,nom,qualite) values($1,'SCI fictive','SCI')",[org]);
  await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')",[id,email,password]);
  if(role!=='artisan')await db.query('insert into memberships(account_id,organization_id,role) values($1,$2,$3)',[id,org,role]);
  const connexion=await page.request.post(api+'/auth/v1/token?grant_type=password',{headers:{apikey:clePublique()},data:{email,password}});expect(connexion.ok()).toBe(true);const token=(await connexion.json()).access_token;
  const headers={apikey:clePublique(),Authorization:'Bearer '+token};
  const liste=await page.request.get(api+`/rest/v1/documents?select=id&id=eq.${doc.id}`,{headers});expect(liste.ok()).toBe(true);expect(await liste.json()).toEqual([]);
  const fichier=await page.request.post(api+`/storage/v1/object/sign/documents/${doc.storage_path}`,{headers,data:{expiresIn:60}});expect(fichier.status()).toBeGreaterThanOrEqual(400);
  const reprise=await page.request.post(api+'/rest/v1/rpc/prendre_notification',{headers,data:{p_id:randomUUID(),p_jeton:randomUUID()}});expect(reprise.status()).toBeGreaterThanOrEqual(400);
  await sansSyntheseAlertes(page);await connecterVers(page,email,password,'/espaces');
  const route=role==='locataire'?'locataire':'agence';const reponse=await page.request.get(`http://localhost:3579/${route}/${doc.organization_id}/documents/${doc.id}/fichier`);expect(reponse.status()).toBe(403);
  await page.goto(`/${route}/${doc.organization_id}/documents/${doc.id}/fichier`);await expect(page.getByText('Accès refusé',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('acces-refuse.png'),fullPage:true});
 }finally{await db.end();}
});
