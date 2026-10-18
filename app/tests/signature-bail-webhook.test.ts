import {createHmac} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({service:vi.fn(),insert:vi.fn(),traiter:vi.fn(),config:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:m.service}));
vi.mock('@/lib/signature-worker',()=>({traiterEvenementSignature:m.traiter}));
vi.mock('@/lib/signature-bail',()=>({configurationSuiviSignatureBail:m.config}));
import {POST} from '@/app/api/youtrust/webhook/route';
const event={event_id:'11111111-1111-4111-8111-111111111111',event_name:'signer.done',data:{signature_request:{id:'22222222-2222-4222-8222-222222222222'},signer:{email:'ne-pas-enregistrer@example.test'}}};
function req(value:unknown=event,signature?:string){const body=typeof value==='string'?value:JSON.stringify(value);return new Request('https://example.test/api/youtrust/webhook',{method:'POST',body,headers:{'x-yousign-signature-256':signature??'sha256='+createHmac('sha256','secret-fictif').update(body).digest('hex')}});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('YOUTRUST_WEBHOOK_SECRET','secret-fictif');vi.stubEnv('YOUTRUST_API_KEY','');m.config.mockReturnValue(null);m.insert.mockResolvedValue({error:null});m.service.mockReturnValue({from:()=>({insert:m.insert})});m.traiter.mockResolvedValue({ok:true});});
afterEach(()=>vi.unstubAllEnvs());
describe('Réception sécurisée des événements de signature',()=>{
 it('refuse une fausse signature sans toucher la base',async()=>{expect((await POST(req(event,'sha256=faux'))).status).toBe(400);expect(m.service).not.toHaveBeenCalled();});
 it.each(['{','null'])('refuse un corps invalide %s',async body=>{expect((await POST(req(body))).status).toBe(400);expect(m.service).not.toHaveBeenCalled();});
 it('refuse les identifiants non conformes',async()=>{expect((await POST(req({...event,event_id:'invalide'}))).status).toBe(400);expect(m.service).not.toHaveBeenCalled();});
 it('borne la taille réelle du corps sans se fier aux en-têtes',async()=>{expect((await POST(req('x'.repeat(1_048_577)))).status).toBe(413);expect(m.service).not.toHaveBeenCalled();});
 it('stocke uniquement les références de suivi, jamais le contenu du webhook',async()=>{expect((await POST(req())).status).toBe(202);expect(m.insert).toHaveBeenCalledWith({event_id:event.event_id,event_name:event.event_name,request_id:event.data.signature_request.id,payload:{event_id:event.event_id,event_name:event.event_name,request_id:event.data.signature_request.id}});expect(m.traiter).not.toHaveBeenCalled();});
 it('ignore les événements hors périmètre',async()=>{expect((await POST(req({...event,event_name:'contact.updated'}))).status).toBe(200);expect(m.service).not.toHaveBeenCalled();});
 it('accepte une répétition sans seconde insertion et reprend le suivi idempotent',async()=>{m.insert.mockResolvedValue({error:{code:'23505'}});m.config.mockReturnValue({prestataire:"youtrust",environnement:'sandbox'});expect((await POST(req())).status).toBe(202);expect(m.traiter).toHaveBeenCalledOnce();});
 it('conserve en file une interruption de supervision pour reprise ultérieure',async()=>{m.config.mockReturnValue({prestataire:"youtrust",environnement:'production'});m.traiter.mockRejectedValue(new Error('Arrêt demandé'));expect((await POST(req())).status).toBe(202);expect(m.insert).toHaveBeenCalledOnce();});
 it('signale une impossibilité de mise en file au prestataire',async()=>{m.insert.mockResolvedValue({error:{code:'XX001'}});expect((await POST(req())).status).toBe(500);expect(m.traiter).not.toHaveBeenCalled();});
});
