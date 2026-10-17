// Les cinq identités peuvent être réutilisées ; leurs secrets restent propres au runner.
// Aucun secret dans workflow_dispatch, les arguments psql, les logs ou les artefacts.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
const suffixe = process.env.RECETTE_SUFFIXE;
const fixes = process.env.RECETTE_COMPTES_FIXES === '1';
const SUFFIXE_FIXE = 'r20261017000000-1';
const cibleUrl = new URL(process.env.RECETTE_URL ?? 'http://cible-absente.invalid');
const local = ['127.0.0.1','localhost'].includes(process.env.PGHOST ?? '')
  && /^gerimmo_ci_[a-z_]+$/.test(process.env.PGDATABASE ?? '')
  && cibleUrl.protocol === 'http:' && ['127.0.0.1','localhost'].includes(cibleUrl.hostname)
  && cibleUrl.pathname === '/' && !cibleUrl.search && !cibleUrl.hash && !cibleUrl.username && !cibleUrl.password;
const production = process.env.PGHOST === 'aws-0-eu-west-3.pooler.supabase.com'
  && process.env.PGUSER === 'postgres.rddlxunppddzpsaatdaz' && process.env.PGDATABASE === 'postgres'
  && process.env.PGPASSWORD && process.env.RECETTE_URL === 'https://www.gerimmo.app'
  && process.env.GITHUB_WORKFLOW === 'Recette de production avec nettoyage' && process.env.GITHUB_REF === 'refs/heads/main';
if (!['preparer', 'purger'].includes(action) || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(suffixe ?? '') || !(local || production)
  || (fixes !== (suffixe === SUFFIXE_FIXE)) || (process.env.RECETTE_COMPTES_FIXES && !fixes)) {
  throw new Error('La recette exige sa cible connue, le chantier autonome sur main et un suffixe propre au passage.');
}
const quote = v => "'" + v.replaceAll("'", "''") + "'";
const db = new Client({connectionTimeoutMillis:20_000,...(production ? { ssl:{ca:fs.readFileSync(path.join(app,'e2e/recette-production/supabase-ca.crt'),'utf8'),rejectUnauthorized:true} } : {})});
const roles=['admin','proprietaire','locataire','artisan','superadmin'];
const emailsFixes=roles.map(role=>`delivered+recette-${role}-${SUFFIXE_FIXE}@resend.dev`);
let supervisionRetiree=false;

function executerSql(fichier, cibleSuffixe, motDePasse) {
  const input=`\\set suffixe ${quote(cibleSuffixe)}\n\\set reutilisables ${fixes?'1':'0'}\n${motDePasse?`\\set mot_de_passe ${quote(motDePasse)}\n`:''}\\i ${quote(path.join(app,'e2e/recette-production',fichier))}\n`;
  const r=spawnSync(process.env.RECETTE_PSQL ?? 'psql',['-X','-q','-A','-t','-F','=','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',maxBuffer:1024*1024,timeout:120_000});
  if(r.status!==0) throw new Error('Opération SQL interrompue.');
  return new Map(r.stdout.trim().split('\n').filter(Boolean).map(l=>l.split('=')));
}

async function verifierIdentitesFixes() {
  const r=await db.query("select id,email,raw_app_meta_data->>'gerimmo_recette' as marque from auth.users where lower(email) ~ $1",[`^delivered\\+[a-z0-9-]+-${SUFFIXE_FIXE}@resend\\.dev$`]);
  if(r.rows.length && (r.rows.length!==5 || r.rows.some(u=>!emailsFixes.includes(u.email)||u.marque!=='permanente-v1'))) throw new Error('Identités fixes non reconnues.');
  return r.rows.map(u=>u.id).sort();
}

async function retirerSupervision() {
  const email=`delivered+recette-superadmin-${suffixe}@resend.dev`;
  // Retrait du rôle avant tout nettoyage ; l'identité persistante est conservée.
  await db.query("delete from public.memberships where role='super_admin' and account_id in(select id from auth.users where email=$1)",[email]);
  supervisionRetiree=true;
  await db.query("update auth.users set banned_until='infinity'::timestamptz where email=$1",[email]);
  await db.query('delete from auth.sessions where user_id in(select id from auth.users where email=$1)',[email]);
  await db.query('select cron.unschedule(jobid) from cron.job where jobname=$1',[`recette-expiration-${suffixe}`]);
}

async function nettoyer(cibleSuffixe) {
  const motif=`^delivered\\+[a-z0-9-]+-${cibleSuffixe}@resend\\.dev$`;
  const orgs=(await db.query('select id from public.organizations where name ~ $1',[`(^|[ -])${cibleSuffixe}(-[0-9]+)?$`])).rows.map(r=>r.id);
  const comptes=(await db.query('select id from auth.users where lower(email) ~ $1',[motif])).rows.map(r=>r.id);
  const artisans=(await db.query('select id from public.artisans where account_id=any($1::uuid[]) or lower(email) ~ $2',[comptes,motif])).rows.map(r=>r.id);
  // Refus avant le moindre retrait de fichier si une relation sort du groupe fictif.
  if ((await db.query(`select 1 from public.memberships where organization_id=any($1::uuid[]) and not(account_id=any($2::uuid[]))
    union all select 1 from public.memberships where account_id=any($2::uuid[]) and organization_id is not null and not(organization_id=any($1::uuid[]))`,[orgs,comptes])).rowCount) throw new Error('Périmètre de purge non isolé.');
  if((await db.query('select 1 from public.artisans where id=any($1::uuid[]) and account_id is not null and not(account_id=any($2::uuid[]))',[artisans,comptes])).rowCount) throw new Error('Artisan lié à un compte extérieur.');
  const liens=(await db.query(`select con.conrelid::regclass::text as tbl,quote_ident(att.attname) as col
    from pg_constraint con join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
    where con.contype='f' and con.confrelid='public.artisans'::regclass and array_length(con.conkey,1)=1
      and exists(select 1 from pg_attribute x where x.attrelid=con.conrelid and x.attname='organization_id' and not x.attisdropped)`)).rows;
  for(const lien of liens) if((await db.query(`select 1 from ${lien.tbl} where ${lien.col}=any($1::uuid[]) and organization_id is not null and not(organization_id=any($2::uuid[])) limit 1`,[artisans,orgs])).rowCount) throw new Error('Artisan lié à une organisation extérieure.');
  const fichiers=(await db.query(`select bucket_id,name from storage.objects where split_part(name,'/',1)=any($1::text[])
    or split_part(name,'/',1)=any($2::text[]) or (split_part(name,'/',1)='artisans' and split_part(name,'/',2)=any($2::text[]))`,[orgs,artisans])).rows;
  if (fichiers.length) {
    const url=production?'https://rddlxunppddzpsaatdaz.supabase.co':process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('API Storage absente pour le nettoyage.');
    const client=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    for (const bucket of new Set(fichiers.map(f=>f.bucket_id))) {
      const chemins=fichiers.filter(f=>f.bucket_id===bucket).map(f=>f.name);
      for(let i=0;i<chemins.length;i+=100) {
        const r=await client.storage.from(bucket).remove(chemins.slice(i,i+100));
        if(r.error) throw new Error('Nettoyage Storage non confirmé.');
      }
    }
  }
  const valeurs=executerSql('purger.sql',cibleSuffixe);
  const attendus=['organisations','comptes','fiches personnes','artisans','expiration supervision','biens'];
  if(attendus.some(n=>valeurs.get(n)!=='0')) throw new Error('Bilan de purge non nul ou incomplet.');
}

try {
  if(action==='preparer' && !process.env.GITHUB_ENV) throw new Error('Environnement du runner absent.');
  await db.connect();
  const identitesAvant=fixes?await verifierIdentitesFixes():[];
  if(action==='preparer') {
    if(fixes) {
      // Le groupe ne peut pas être repris pendant un contrôle encore ouvert.
      if((await db.query('select 1 from cron.job where jobname=$1',[`recette-expiration-${suffixe}`])).rowCount) throw new Error('Contrôle précédent encore ouvert.');
      await retirerSupervision();
      await nettoyer(`i${suffixe}`);
      await nettoyer(suffixe);
    }
    const motDePasse=`Recette-${randomBytes(24).toString('hex')}!`;
    console.log(`::add-mask::${motDePasse}`);
    const valeurs=executerSql('preparer-comptes.sql',suffixe,motDePasse);
    if(fixes) {
      const apres=await verifierIdentitesFixes();
      if(apres.length!==5 || (identitesAvant.length && JSON.stringify(apres)!==JSON.stringify(identitesAvant))) throw new Error('Les identités fixes ont changé.');
    }
    const noms={email_admin:'RECETTE_EMAIL_ADMIN',email_proprietaire:'RECETTE_EMAIL_PROPRIETAIRE',email_locataire:'RECETTE_EMAIL_LOCATAIRE',email_artisan:'RECETTE_EMAIL_ARTISAN',email_superadmin:'RECETTE_EMAIL_SUPERADMIN',org_agence:'RECETTE_ORG_AGENCE',org_proprietaire:'RECETTE_ORG_PROPRIETAIRE'};
    const lignes=Object.entries(noms).map(([cle,nom])=>{
      const valeur=valeurs.get(cle);
      if(!valeur || /[\r\n]/.test(valeur)) throw new Error('Préparation incomplète.');
      if(cle.startsWith('email_') && !new RegExp(`^delivered\\+recette-[a-z]+-${suffixe}@resend\\.dev$`).test(valeur)) throw new Error('Adresse de recette refusée.');
      if(cle.startsWith('org_') && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(valeur)) throw new Error('Organisation refusée.');
      return `${nom}=${valeur}`;
    });
    fs.appendFileSync(process.env.GITHUB_ENV,[...lignes,`RECETTE_MOT_DE_PASSE=${motDePasse}`,'RECETTE_AUTONOME=1',''].join('\n'));
    console.log(fixes?'Cinq comptes fixes prêts ; identités conservées, supervision limitée à 61 minutes.':'Cinq comptes de recette préparés ; supervision bornée à 61 minutes, deux espaces isolés.');
  } else {
    await retirerSupervision();
    await nettoyer(fixes?`i${suffixe}`:suffixe);
    if(fixes) {
      const apres=await verifierIdentitesFixes();
      if(apres.length!==5 || JSON.stringify(apres)!==JSON.stringify(identitesAvant)) throw new Error('Conservation des cinq identités non confirmée.');
      console.log('Clôture vérifiée : cinq comptes fixes conservés ; supervision retirée ; inscriptions ponctuelles nettoyées.');
    } else console.log('Purge vérifiée : organisations 0, comptes 0, artisans 0, supervision 0 ; fichiers retirés par API.');
  }
} catch {
  // Les messages SQL/Auth peuvent citer des comptes : ne jamais les publier.
  console.error(action==='preparer'?'Préparation interrompue ; clôture requise.':`Clôture non confirmée pour ${suffixe} ; ${supervisionRetiree?'privilège de recette retiré':'retrait du privilège non confirmé'}, reprise requise.`);
  process.exitCode=1;
} finally { await db.end().catch(()=>{}); }
