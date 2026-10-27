import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
const mocks=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.client}));
beforeEach(()=>vi.clearAllMocks());
function session(roles=['super_admin'],niveau: string|null='aal1', erreur=false, niveauSuivant: string|null=niveau) {
  const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:roles.map(role=>({role})),error:null}).then(resolve)};
  const mfa={getAuthenticatorAssuranceLevel:vi.fn(async()=>({data:{currentLevel:niveau,nextLevel:niveauSuivant},error:erreur?{message:'indisponible'}:null}))};
  mocks.client.mockReturnValue({from:()=>q,rpc:async()=>({data:[{id:"session-fictive",cree_le:new Date().toISOString()}],error:null}),auth:{getUser:async()=>({data:{user:{id:'compte',last_sign_in_at:new Date().toISOString()}}}),mfa}});
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
  // Audit final du 27/10 (PUB-01) : « ne bloque pas les autres personas » valait pour un compte SANS facteur. Le
  // niveau est désormais lu pour tout compte connecté (lecture locale), et un second facteur activé depuis « Mon
  // compte » (nextLevel aal2) impose le sas à tout rôle — avant, le mot de passe seul ouvrait l'espace.
  it('ne bloque pas les autres personas sans second facteur',async()=>{
    session(['admin_agence','proprietaire'],'aal1',false,'aal1');
    expect((await proxy(new NextRequest('https://gerimmo.test/espaces'))).headers.get('location')).toBeNull();
    session(['locataire'],'aal1',false,null);
    expect((await proxy(new NextRequest('https://gerimmo.test/locataire/alpha'))).headers.get('location')).toBeNull();
  });
  it('impose le sas à un propriétaire qui a activé sa double authentification, destination gardée',async()=>{
    session(['proprietaire_direct'],'aal1',false,'aal2');
    const r=await proxy(new NextRequest('https://gerimmo.test/espace/alpha/documents?tri=date'));
    expect(r.status).toBe(307);
    const u=new URL(r.headers.get('location')!);expect(u.pathname).toBe('/securite');expect(u.searchParams.get('suite')).toBe('/espace/alpha/documents?tri=date');
    // Un POST (action serveur) suit en GET : 303, jamais rejoué sur /securite.
    session(['proprietaire_direct'],'aal1',false,'aal2');
    expect((await proxy(new NextRequest('https://gerimmo.test/compte',{method:'POST'}))).status).toBe(303);
  });
  it('laisse passer le même propriétaire une fois le code saisi (aal2), et les pages publiques avant',async()=>{
    session(['proprietaire_direct'],'aal2',false,'aal2');
    expect((await proxy(new NextRequest('https://gerimmo.test/espace/alpha/documents'))).headers.get('location')).toBeNull();
    const m=session(['proprietaire_direct'],'aal1',false,'aal2');
    for(const path of ['/securite','/tarifs','/journal/un-article']) expect((await proxy(new NextRequest('https://gerimmo.test'+path))).headers.get('location')).toBeNull();
    expect(m.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
  it('une erreur de lecture du niveau ne ferme pas l’espace d’un rôle hors supervision',async()=>{
    session(['locataire'],null,true,null);
    expect((await proxy(new NextRequest('https://gerimmo.test/locataire/alpha'))).headers.get('location')).toBeNull();
  });
});
