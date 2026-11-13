// Exercice jetable. L'appelant doit fournir un serveur PostgREST sur cette même base locale.
import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {Client} from 'pg';
const dbUrl = new URL(process.env.SUPABASE_DB_URL);
const api = new URL(process.env.POSTGREST_REEL_URL);
assert.equal(dbUrl.hostname,'127.0.0.1');
assert.match(dbUrl.pathname,/^\/gerimmo_ci_[a-z_]+$/);
assert.equal(api.hostname,'127.0.0.1');
assert.equal(api.protocol,'http:');
const db = new Client({connectionString:dbUrl.href});
const [org,other,account]=Array.from({length:3},()=>randomUUID());
const session=randomUUID();
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:account,session_id:session,role:'authenticated',exp:Math.floor(Date.now()/1000)+300});
const authorization = 'Bearer '+payload+'.'+createHmac('sha256',process.env.POSTGREST_REEL_JWT_SECRET).update(payload).digest('base64url');
async function read(path) {
  const result=await fetch(new URL(path,api),{headers:{authorization}});
  assert.equal(result.status,200,path);
  return result.json();
}
await db.connect();
try {
  await db.query('begin');
  await db.query("insert into organizations(id,name,status,iban) values($1,'Test portail','active','FR7612345678901234567890123'),($2,'Test voisin','active',null)",[org,other]);
  await db.query("insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,'{}','{}')",[account,account+'@example.invalid']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,account]);
  await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')",[account,org]);
  await db.query('commit');
  const base='/organizations?select=id&id=in.('+org+','+other+')';
  const portail='/organisations_portail?select=id,iban&id=in.('+org+','+other+')';
  assert.deepEqual(await read(base),[{id:org}]);
  for (const role of ['locataire','artisan']) {
    await db.query('update memberships set role=$1 where account_id=$2',[role,account]);
    assert.deepEqual(await read(base),[]);
    assert.deepEqual(await read(portail),[{id:org,iban:role==='locataire'?'FR7612345678901234567890123':null}]);
    const menu=await read('/rpc/mes_adhesions_navigation');
    assert.deepEqual(menu.map(m=>[m.role,m.organization.id]),[[role,org]]);
  }
  await db.query("update memberships set status='inactive' where account_id=$1",[account]);
  assert.deepEqual(await read(portail),[]);
  assert.deepEqual(await read('/rpc/mes_adhesions_navigation'),[]);
  await db.query('delete from auth.sessions where id=$1',[session]);
  assert.equal((await fetch(new URL('/rpc/mes_adhesions_navigation',api),{headers:{authorization}})).status,401);
  console.log('PostgREST : propriétaire, locataire, artisan, organisation voisine et révocation vérifiés.');
} finally {
  await db.query('rollback');
  try {
    await db.query('begin');
    await db.query('delete from memberships where account_id=$1',[account]);
    await db.query('delete from audit_log where organization_id=any($1) or account_id=$2',[[org,other],account]);
    await db.query('delete from organizations where id=any($1)',[[org,other]]);
    await db.query('delete from auth.users where id=$1',[account]);
    await db.query('commit');
  } finally { await db.end(); }
}
