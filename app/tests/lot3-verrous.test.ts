import {it,expect,vi,afterEach} from 'vitest';
import {paiementsInterdits} from '../src/lib/verrou-pilote';
import {adresseIpFiable} from '../src/lib/ip-fiable';
import {clientStripe,configurationStripe} from '../src/lib/stripe';
import {lireRecommandeAr24} from '../src/lib/ar24';
import {lireDemandeZoho} from '../src/lib/zoho-sign';
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>{throw Error('La base ne doit pas être appelée');}}));
import {POST as stripe} from '../src/app/api/stripe/webhook/route';
import {POST as signature} from '../src/app/api/zoho-sign/webhook/route';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each([{}, {GERIMMO_PILOTE_LIMITE:'true'},{GERIMMO_PILOTE_LIMITE:'false',GERIMMO_PAIEMENTS_DESACTIVES:'1'},{GERIMMO_PILOTE_LIMITE:'false',GERIMMO_PREPRODUCTION_VALIDEE:'1'}])('verrou serveur fermé : %j',env=>{expect(paiementsInterdits(env)).toBe(true);});
it('mode hors pilote explicite inchangé',()=>expect(paiementsInterdits({GERIMMO_PILOTE_LIMITE:'false'})).toBe(false));
it('même avec une configuration Stripe complète, aucune création de client',()=>{
 vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fictif');expect(configurationStripe()).toMatchObject({pret:false});expect(()=>clientStripe({cle:'sk_test_fictif',secretWebhook:'fictif',prix:{}})).toThrow('suspendue');
});
it.each([stripe,signature])('webhook financier ou signature : rejet avant tout accès base',async post=>{
 vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');expect((await post(new Request('http://localhost/api/test',{method:'POST',body:'{}'}))).status).toBe(403);
});
it('les deux transports payants sont bloqués avant tout appel réseau',async()=>{
 vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(lireRecommandeAr24({baseUrl:'https://sandbox.ar24.fr/api',token:'fictif',clePrivee:'fictif'},1,'fictif',fetch)).rejects.toThrow('suspendue');
 await expect(lireDemandeZoho({prestataire:'zoho',environnement:'sandbox',clientId:'fictif',clientSecret:'fictif',refreshToken:'fictif'},'1234567890123456789')).rejects.toThrow('suspendue');expect(fetch).not.toHaveBeenCalled();
});
it.each(['x-forwarded-for','x-real-ip','x-vercel-forwarded-for'])('hors Vercel, le navigateur ne choisit pas son quota via %s',header=>expect(adresseIpFiable(new Headers({[header]:'1.2.3.4'}),{})).toBe('0.0.0.0'));
it('sous Vercel, seule l’adresse réécrite est retenue',()=>expect(adresseIpFiable(new Headers({'x-forwarded-for':'1.2.3.4','x-vercel-forwarded-for':'192.0.2.1'}),{VERCEL:'1'})).toBe('192.0.2.1'));
it.each(['1.2.3.4, 5.6.7.8','arbitraire',''])('une adresse de frontière invalide reste dans le quota partagé',ip=>expect(adresseIpFiable(new Headers({'x-vercel-forwarded-for':ip}),{VERCEL:'1'})).toBe('0.0.0.0'));
it('les variantes IPv6 partagent le même quota',()=>{
 const env={VERCEL:'1'};
 expect(adresseIpFiable(new Headers({'x-vercel-forwarded-for':'2001:db8:0:0:0:0:0:1'}),env)).toBe(adresseIpFiable(new Headers({'x-vercel-forwarded-for':'2001:db8::1'}),env));
});
