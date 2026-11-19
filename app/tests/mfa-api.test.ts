// Recette locale : SDK Supabase réel, Auth émulé et vraies politiques SQL.
// Ne prétend pas certifier le service Auth hébergé ou la lecture d'un vrai QR.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { totp } from '../e2e/local/mfa-local.mjs';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, base=process.env.SUPALOCAL_DB;
const local=!!url && !!base && ['localhost','127.0.0.1'].includes(new URL(url).hostname) && ['localhost','127.0.0.1'].includes(new URL(base).hostname);
describe.skipIf(!local)('MFA — parcours SDK et protection des données', () => {
  it('enrôle, refuse le mauvais code, élève la session et redemande un code à la reconnexion', async () => {
    const db=new Client({connectionString:base}); await db.connect();
    const id=randomUUID(), email=`mfa-${id}@test.local`, password=randomUUID();
    const c=createClient(url!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    try {
      await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,extensions.crypt($3,extensions.gen_salt('bf')),now())",[id,email,password]);
      await db.query("insert into public.memberships(account_id,role,status) values($1,'super_admin','active')",[id]);
      expect((await c.auth.signInWithPassword({email,password})).error).toBeNull();
      expect((await c.rpc('is_super_admin')).data).toBe(false);
      expect((await c.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal1');
      const enrollment=await c.auth.mfa.enroll({factorType:'totp',friendlyName:'Application recette'});
      expect(enrollment.error).toBeNull(); const f=enrollment.data!;
      expect((await c.auth.mfa.listFactors()).data?.totp).toHaveLength(0);
      const mauvais=String((Number(totp(f.totp.secret))+12345)%1000000).padStart(6,'0');
      expect((await c.auth.mfa.challengeAndVerify({factorId:f.id,code:mauvais})).error).not.toBeNull();
      expect((await c.rpc('is_super_admin')).data).toBe(false);
      expect((await c.auth.mfa.challengeAndVerify({factorId:f.id,code:totp(f.totp.secret)})).error).toBeNull();
      expect((await c.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2');
      expect((await c.rpc('is_super_admin')).data).toBe(true);
      expect((await c.auth.mfa.listFactors()).data?.totp).toHaveLength(1);
      expect((await c.auth.refreshSession()).error).toBeNull();
      expect((await c.rpc('is_super_admin')).data).toBe(true);
      await c.auth.signOut();
      expect((await c.auth.signInWithPassword({email,password})).error).toBeNull();
      expect((await c.rpc('is_super_admin')).error?.code).toBe('PT428');
      expect((await c.auth.mfa.unenroll({factorId:f.id})).error).not.toBeNull();
      expect((await c.auth.mfa.challengeAndVerify({factorId:f.id,code:totp(f.totp.secret)})).error).toBeNull();
      expect((await c.rpc('is_super_admin')).data).toBe(true);
      expect((await c.auth.mfa.unenroll({factorId:f.id})).error).toBeNull();
    } finally {
      await c.auth.signOut();
      await db.query('delete from public.memberships where account_id=$1',[id]);
      await db.query('delete from auth.users where id=$1',[id]); await db.end();
    }
  });

  it('protège l’API et les fichiers du propriétaire après reconnexion, jusqu’au bon code', async () => {
    const db = new Client({connectionString:base});
    await db.connect();
    const compte = randomUUID(), org = randomUUID();
    const email = `mfa-${compte}@test.local`, password = randomUUID();
    const chemin = `${org}/${randomUUID()}.pdf`;
    const c = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {auth:{persistSession:false,autoRefreshToken:false}});
    try {
      await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,extensions.crypt($3,extensions.gen_salt('bf')),now())", [compte,email,password]);
      await db.query("insert into public.organizations(id,name,status) values($1,'MFA propriétaire fictif','active')", [org]);
      await db.query("insert into public.memberships(account_id,organization_id,role,status) values($1,$2,'proprietaire_direct','active')", [compte,org]);
      await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [chemin]);
      await db.query("insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values($1,'justificatif','Fichier fictif',$2,'application/pdf',1000,$3)", [org,chemin,randomUUID()]);

      expect((await c.auth.signInWithPassword({email,password})).error).toBeNull();
      expect((await c.from('organizations').select('id').eq('id',org)).data).toEqual([{ id: org }]);
      const enrollement = await c.auth.mfa.enroll({factorType:'totp',friendlyName:'Clé fictive'});
      expect(enrollement.error).toBeNull();
      const facteur = enrollement.data!;
      expect((await c.from('organizations').select('id').eq('id',org)).error).toBeNull();
      const valider = (code: string) => c.auth.mfa.challengeAndVerify({factorId:facteur.id,code});
      expect((await valider(totp(facteur.totp.secret))).error).toBeNull();
      expect((await c.auth.signOut()).error).toBeNull();
      expect((await c.auth.signInWithPassword({email,password})).error).toBeNull();
      expect((await c.auth.mfa.getAuthenticatorAssuranceLevel()).data).toMatchObject({currentLevel:'aal1',nextLevel:'aal2'});
      expect((await c.from('organizations').select('id').eq('id',org)).error?.code).toBe('PT428');
      expect((await c.from('documents').update({titre:'Non autorisé'}).eq('organization_id',org)).error?.code).toBe('PT428');
      expect((await c.storage.from('documents').createSignedUrl(chemin,60)).error).not.toBeNull();
      const fauxCode = String((Number(totp(facteur.totp.secret)) + 12345) % 1_000_000).padStart(6, '0');
      expect((await valider(fauxCode)).error).not.toBeNull();
      expect((await c.rpc('ma_session_active')).error?.code).toBe('PT428');
      expect((await valider(totp(facteur.totp.secret))).error).toBeNull();
      expect((await c.from('organizations').select('id').eq('id',org)).data).toEqual([{ id: org }]);
      expect((await c.from('documents').select('titre').eq('organization_id',org)).data).toEqual([{titre:'Fichier fictif'}]);
      expect((await c.storage.from('documents').createSignedUrl(chemin,60)).error).toBeNull();
      expect((await c.rpc('is_super_admin')).data).toBe(false);
      expect((await c.auth.mfa.unenroll({factorId:facteur.id})).error).toBeNull();
    } finally {
      await c.auth.signOut();
      await db.query('delete from public.documents where organization_id=$1',[org]);
      await db.query("delete from storage.objects where bucket_id='documents' and name=$1",[chemin]);
      await db.query('delete from public.memberships where account_id=$1',[compte]);
      await db.query('delete from public.audit_log where organization_id=$1 or account_id=$2',[org,compte]);
      await db.query('delete from public.organizations where id=$1',[org]);
      await db.query('delete from auth.users where id=$1',[compte]);
      await db.end();
    }
  });
});
