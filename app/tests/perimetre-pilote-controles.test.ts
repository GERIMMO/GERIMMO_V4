import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),config:vi.fn(),generate:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>({rpc:m.rpc,auth:{admin:{generateLink:m.generate}}})}));
vi.mock('@/lib/stripe',()=>({configurationStripe:m.config,clientStripe:vi.fn(),crediterClientStripe:vi.fn(),lireErreurStripe:vi.fn(),synchroniserQuantite:vi.fn()}));
beforeEach(()=>{vi.stubEnv('GERIMMO_PILOTE_LIMITE','true');vi.stubEnv('CRON_SECRET','secret-test');m.rpc.mockReset().mockResolvedValue({data:true,error:null});m.config.mockReset();m.generate.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it('arrête la tâche abonnements avant configuration Stripe et conserve un bilan explicite',async()=>{
 const {traiterAbonnements}=await import('../src/lib/missions-planifiees/abonnements');
 const r=await traiterAbonnements(new Request('http://localhost/test',{headers:{authorization:'Bearer secret-test'}}));
 expect(r.status).toBe(409);expect(await r.json()).toMatchObject({suspendue:true});expect(m.config).not.toHaveBeenCalled();
 expect(m.rpc.mock.calls.some(([n,p])=>n==='log_tech'&&JSON.stringify(p).includes('pilote_limite'))).toBe(true);
});
it('la suspension ne contourne pas le contrôle du secret du planificateur',async()=>{
 const {traiterAbonnements}=await import('../src/lib/missions-planifiees/abonnements');
 const r=await traiterAbonnements(new Request('http://localhost/test'));expect(r.status).toBe(401);expect(m.config).not.toHaveBeenCalled();
});
it('maintient la suspension des invitations agents hors périmètre',async()=>{
 const {envoyerLienMotDePasse}=await import('../src/lib/lien-mot-de-passe');
 const r=await envoyerLienMotDePasse({email:'fictif@example.invalid',motif:'invitation_agent'});expect(r.erreur).toMatch(/suspendu/);expect(m.generate).not.toHaveBeenCalled();
});
it('ne crée pas un compte si le service de lien est non configuré',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','');
 const {inscrireEtEnvoyerConfirmation}=await import('../src/lib/lien-mot-de-passe');
 const r=await inscrireEtEnvoyerConfirmation({email:'fictif@example.invalid',metadonnees:{},next:'/espaces'});expect(r).toHaveProperty('erreur');expect(m.generate).not.toHaveBeenCalled();
});
