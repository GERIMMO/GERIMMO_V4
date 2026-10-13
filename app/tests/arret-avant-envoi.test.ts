import { afterEach, expect, it, vi } from 'vitest';
import { envoyerEmail } from '../src/lib/email';
import { envoyerSurFacebook } from '../src/lib/facebook';
import { ArretSupervision } from '../src/lib/controle-effets';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('un arrêt empêche l’appel au service d’e-mail',async()=>{
  vi.stubEnv('RESEND_API_KEY','cle-fictive-sans-service');
  const reseau=vi.fn();vi.stubGlobal('fetch',reseau);
  await expect(envoyerEmail({to:'test@example.invalid',subject:'TEST',html:'TEST',avantEnvoi:async()=>{throw new ArretSupervision();}})).rejects.toBeInstanceOf(ArretSupervision);
  expect(reseau).not.toHaveBeenCalled();
});
it('un arrêt après lecture du jeton Facebook interdit encore la publication',async()=>{
  vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('META_FACEBOOK_PAGE_ID','page-fictive');vi.stubEnv('META_FACEBOOK_PAGE_ACCESS_TOKEN','jeton-fictif');
  const reseau=vi.fn(async()=>new Response(JSON.stringify({data:[]})));vi.stubGlobal('fetch',reseau);
  await expect(envoyerSurFacebook({titre:'TEST',slug:'test',chapo:null,facebookTexte:null,facebookImageUrl:null},async()=>{throw new ArretSupervision();})).rejects.toBeInstanceOf(ArretSupervision);
  expect(reseau).toHaveBeenCalledTimes(1);
  expect(reseau.mock.calls[0]).not.toEqual(expect.arrayContaining([expect.objectContaining({method:'POST'})]));
});
