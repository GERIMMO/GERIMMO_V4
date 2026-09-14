import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
const mocks=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.client}));
beforeEach(()=>vi.clearAllMocks());
function session(roles=['super_admin'],niveau: string|null='aal1', erreur=false) {
  const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:roles.map(role=>({role})),error:null}).then(resolve)};
  const mfa={getAuthenticatorAssuranceLevel:vi.fn(async()=>({data:{currentLevel:niveau},error:erreur?{message:'indisponible'}:null}))};
  mocks.client.mockReturnValue({from:()=>q,auth:{getUser:async()=>({data:{user:{id:'compte',last_sign_in_at:new Date().toISOString()}}}),mfa}});
  return mfa;
}
describe('Accès web à la supervision',()=>{
  it('conserve la destination et les filtres pendant la vérification',async()=>{
    session();const r=await proxy(new NextRequest('https://gerimmo.test/admin/artisans?statut=en_attente'));
    const u=new URL(r.headers.get('location')!);expect(u.pathname).toBe('/securite');expect(u.searchParams.get('suite')).toBe('/admin/artisans?statut=en_attente');
  });
  it('impose aussi MFA au super administrateur qui ouvre une agence',async()=>{
    session(['super_admin','admin_agence']);const r=await proxy(new NextRequest('https://gerimmo.test/agence/alpha'));
    expect(new URL(r.headers.get('location')!).pathname).toBe('/securite');
  });
  it('refuse une erreur du fournisseur au lieu d’autoriser par défaut',async()=>{
    session(['super_admin'],'aal2',true);const r=await proxy(new NextRequest('https://gerimmo.test/admin'));
    expect(new URL(r.headers.get('location')!).pathname).toBe('/securite');
  });
  it('ouvre la supervision après MFA',async()=>{
    session(['super_admin'],'aal2');expect((await proxy(new NextRequest('https://gerimmo.test/admin'))).headers.get('location')).toBeNull();
  });
  it('laisse accessibles la configuration et les pages légales',async()=>{
    const m=session();
    for(const path of ['/securite','/confidentialite']) expect((await proxy(new NextRequest('https://gerimmo.test'+path))).headers.get('location')).toBeNull();
    expect(m.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
  it('ne bloque pas les autres personas',async()=>{
    const m=session(['admin_agence','proprietaire']);
    expect((await proxy(new NextRequest('https://gerimmo.test/espaces'))).headers.get('location')).toBeNull();
    expect(m.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
});
