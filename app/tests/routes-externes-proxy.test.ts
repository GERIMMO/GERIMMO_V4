import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
const mocks=vi.hoisted(()=>({client:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.client}));
beforeEach(()=>{vi.clearAllMocks();mocks.client.mockReturnValue({auth:{getUser:async()=>({data:{user:null}})}});});
describe('Entrées serveur indépendantes de la connexion utilisateur',()=>{
  it.each(['/api/stripe/webhook','/api/cron/quittances','/api/cron/abonnements','/api/sante'])('laisse %s vérifier sa signature ou son secret',async path=>{
    const r=await proxy(new NextRequest('https://gerimmo.test'+path,{method:'POST',body:'{}'}));
    expect(r.headers.get('location')).toBeNull();expect(r.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(['/api/stripe/webhook/intrus','/api/stripe/autre','/api/cron/intrus','/admin','/agence/alpha'])('ne crée aucune exemption élargie sur %s',async path=>{
    const r=await proxy(new NextRequest('https://gerimmo.test'+path));
    expect(new URL(r.headers.get('location')!).pathname).toBe('/connexion');
  });
});
