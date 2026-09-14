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
      expect((await c.rpc('is_super_admin')).data).toBe(false);
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
});
