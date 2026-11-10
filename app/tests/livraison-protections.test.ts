import {it,expect,vi,afterEach} from 'vitest';
import {paiementsInterdits} from '../src/lib/verrou-pilote';
import {piloteLimite,circuitAdmisPilote} from '../src/lib/perimetre-pilote';
const commercial={GERIMMO_MODE:'commercial',VERCEL:'1',VERCEL_ENV:'production',NEXT_PUBLIC_SITE_URL:'https://www.gerimmo.app'};
afterEach(()=>vi.unstubAllEnvs());
it('commercial : paiements autorisés, courriers non qualifiés toujours interdits',()=>{expect(paiementsInterdits(commercial)).toBe(false);for(const flag of ['false','true','']){vi.stubEnv('GERIMMO_PILOTE_LIMITE',flag);expect(piloteLimite()).toBe(true);expect(circuitAdmisPilote({to:'fictif@example.invalid',subject:'Relance collective',html:'x'})).toBe(false);}});
it.each(['GERIMMO_MODE','VERCEL','VERCEL_ENV','NEXT_PUBLIC_SITE_URL'])('une condition commerciale manquante bloque : %s',k=>expect(paiementsInterdits({...commercial,[k]:undefined})).toBe(true));
it.each([{GERIMMO_PILOTE_LIMITE:'true'},{GERIMMO_PAIEMENTS_DESACTIVES:'1'},{GERIMMO_PREPRODUCTION_VALIDEE:'1'}])('conflit explicite interdit : %j',env=>expect(paiementsInterdits({...commercial,...env})).toBe(true));
it('un simple ancien drapeau false ne réactive pas les paiements',()=>expect(paiementsInterdits({GERIMMO_PILOTE_LIMITE:'false'})).toBe(true));
it('simulation : aucune clé live ni exécution hébergée',()=>{const e={GERIMMO_MODE:'simulation',NODE_ENV:'test'};expect(paiementsInterdits(e)).toBe(false);expect(paiementsInterdits({...e,STRIPE_SECRET_KEY:'sk_live_fictif'})).toBe(true);expect(paiementsInterdits({...e,VERCEL:'1'})).toBe(true);});
it('le vrai transport reste suspendu en commercial sans émission ni faux succès',async()=>{
 for(const [k,v] of Object.entries(commercial))vi.stubEnv(k,v);
 vi.stubEnv('RESEND_API_KEY','fictif');
 const {envoyerEmailTransport}=await import('../src/lib/email');
 const r=await envoyerEmailTransport({to:'fictif@example.invalid',subject:'Courrier non qualifié',html:'x'});
 expect(r).toMatchObject({interventionRequise:true});expect(r).not.toHaveProperty('id');
});
