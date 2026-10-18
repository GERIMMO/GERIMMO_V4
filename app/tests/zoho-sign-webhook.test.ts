import {createHmac} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({service:vi.fn(),config:vi.fn(),sync:vi.fn(),eq:vi.fn(),update:vi.fn(),read:vi.fn(),after:vi.fn(),tasks:[] as (()=>Promise<void>)[]}));
vi.mock('next/server',()=>({after:m.after}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:m.service}));
vi.mock('@/lib/signature-bail',()=>({configurationSuiviSignatureBail:m.config}));
vi.mock('@/lib/signature-bail-worker',()=>({synchroniserCircuitSignatureBail:m.sync}));
import {POST} from '@/app/api/zoho-sign/webhook/route';
const event={notifications:{operation_type:'RequestCompleted',performed_by_email:'prive@example.test'},requests:{request_id:'11000000000001'}};
function req(value:unknown=event,signature?:string){const body=typeof value==='string'?value:JSON.stringify(value);return new Request('https://example.test/api/zoho-sign/webhook',{method:'POST',body,headers:{'x-zs-webhook-signature':signature??createHmac('sha256','secret-fictif').update(body).digest('base64')}});}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('ZOHO_SIGN_WEBHOOK_SECRET','secret-fictif');m.config.mockReturnValue({prestataire:'zoho',environnement:'sandbox'});
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 m.tasks=[]; m.after.mockImplementation((task:()=>Promise<void>)=>m.tasks.push(task));
 const q={select:()=>q,eq:m.eq,update:m.update,in:()=>Promise.resolve({error:null}),maybeSingle:m.read};m.eq.mockReturnValue(q);m.update.mockReturnValue(q);
 m.service.mockReturnValue({from:()=>q});m.read.mockResolvedValue({data:{id:'circuit',etat:'en_cours'},error:null});m.sync.mockResolvedValue(undefined);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('Retour Zoho Sign sécurisé',()=>{
 it('distingue les refus sans divulguer le secret ni le contenu reçu',async()=>{
  const sansSignature=req();sansSignature.headers.delete('x-zs-webhook-signature');
  expect((await POST(sansSignature)).status).toBe(400);
  expect((await POST(req(event,'signature-privee'))).status).toBe(400);
  expect((await POST(req('{'))).status).toBe(400);
  expect((await POST(req({...event,requests:{request_id:'identite-privee'}}))).status).toBe(400);
  expect(vi.mocked(console.warn).mock.calls).toEqual([
   ['[zoho-webhook]','signature_absente'],['[zoho-webhook]','signature_invalide'],
   ['[zoho-webhook]','corps_invalide'],['[zoho-webhook]','reference_invalide'],
  ]);
  expect(m.service).not.toHaveBeenCalled();expect(m.sync).not.toHaveBeenCalled();
 });
 it('refuse une fausse signature avant toute lecture de données',async()=>{expect((await POST(req(event,'faux'))).status).toBe(400);expect(m.service).not.toHaveBeenCalled();});
 it.each(['{','null'])('refuse le corps invalide %s',async body=>{expect((await POST(req(body))).status).toBe(400);expect(m.service).not.toHaveBeenCalled();});
 it('borne le corps réel même sans Content-Length',async()=>{expect((await POST(req('a'.repeat(1_048_577)))).status).toBe(413);expect(m.service).not.toHaveBeenCalled();});
 it('ne croit pas le statut du webhook : relit le dossier auprès du prestataire',async()=>{
  expect((await POST(req())).status).toBe(200);expect(m.sync).not.toHaveBeenCalled();expect(m.tasks).toHaveLength(1);
  await m.tasks[0](); expect(m.sync).toHaveBeenCalledWith(m.service(),m.config(),'circuit');
  expect(m.eq).toHaveBeenCalledWith('prestataire','zoho');expect(m.eq).toHaveBeenCalledWith('environnement','sandbox');expect(m.update).not.toHaveBeenCalled();
 });
 it('ignore une demande qui ne concerne pas Gerimmo',async()=>{m.read.mockResolvedValue({data:null,error:null});expect((await POST(req())).status).toBe(200);expect(m.sync).not.toHaveBeenCalled();});
 it('une réception dupliquée après archivage ne crée pas de nouvelle copie',async()=>{m.read.mockResolvedValue({data:{id:'circuit',etat:'termine'},error:null});expect((await POST(req())).status).toBe(200);expect(m.sync).not.toHaveBeenCalled();});
 it('accuse réception avant un téléchargement bloqué',async()=>{m.sync.mockImplementation(()=>new Promise(()=>{}));expect((await POST(req())).status).toBe(200);expect(m.sync).not.toHaveBeenCalled();expect(m.tasks).toHaveLength(1);});
 it('une interruption après réception reste reprenable sans divulguer de données',async()=>{m.sync.mockRejectedValue(new Error('secret-a-ne-pas-afficher'));const r=await POST(req());expect(r.status).toBe(200);await m.tasks[0]();expect(JSON.stringify(await r.json())).not.toContain('secret-a');expect(m.update).toHaveBeenCalledWith({erreur:'Le suivi Zoho Sign doit être repris.'});});
 it('la connexion désactivée ne traite aucun dossier',async()=>{m.config.mockReturnValue(null);expect((await POST(req())).status).toBe(503);expect(m.sync).not.toHaveBeenCalled();});
});
