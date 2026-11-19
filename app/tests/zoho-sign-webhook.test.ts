import {createHmac} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({service:vi.fn(),config:vi.fn(),sync:vi.fn(),eq:vi.fn(),update:vi.fn(),read:vi.fn(),rpc:vi.fn(),after:vi.fn(),tasks:[] as (()=>Promise<void>)[]}));
vi.mock('next/server',()=>({after:m.after}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:m.service}));
vi.mock('@/lib/signature-bail',()=>({configurationSuiviSignatureBail:m.config}));
vi.mock('@/lib/signature-bail-worker',()=>({synchroniserCircuitSignatureBail:m.sync}));
import {POST} from '@/app/api/zoho-sign/webhook/route';
import {cleLivraisonWebhookZoho} from '@/lib/zoho-sign';
const event={notifications:{operation_type:'RequestCompleted',performed_by_email:'prive@example.test'},requests:{request_id:'11000000000001'}};
function req(value:unknown=event,signature?:string){const body=typeof value==='string'?value:JSON.stringify(value);return new Request('https://example.test/api/zoho-sign/webhook',{method:'POST',body,headers:{'x-zs-webhook-signature':signature??createHmac('sha256','secret-fictif').update(body).digest('base64')}});}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('ZOHO_SIGN_WEBHOOK_SECRET','secret-fictif');m.config.mockReturnValue({prestataire:'zoho',environnement:'sandbox'});
 vi.spyOn(console,'warn').mockImplementation(()=>{});
 m.tasks=[]; m.after.mockImplementation((task:()=>Promise<void>)=>m.tasks.push(task));
 const q={select:()=>q,eq:m.eq,update:m.update,in:()=>Promise.resolve({error:null}),maybeSingle:m.read};m.eq.mockReturnValue(q);m.update.mockReturnValue(q);
 m.service.mockReturnValue({from:()=>q,rpc:m.rpc});m.read.mockResolvedValue({data:{id:'circuit',etat:'en_cours'},error:null});m.sync.mockResolvedValue(undefined);
 // La limite à clé de la base (`autoriser_lien_mot_de_passe_cle`), simulée : au plus `p_max` acceptations par clé.
 const vues=new Map<string,number>();
 m.rpc.mockImplementation(async(nom:string,{p_cle,p_max}:{p_cle:string;p_max:number})=>{
  if(nom!=='autoriser_lien_mot_de_passe_cle')return {data:null,error:{message:'inconnue'}};
  const n=vues.get(p_cle)??0;if(n>=p_max)return {data:false,error:null};vues.set(p_cle,n+1);return {data:true,error:null};
 });
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

// TEC-4 (19/11/2026) : la signature prouve l'origine du corps, pas sa fraîcheur. Une livraison interceptée se rejouait à
// volonté, et chaque répétition relançait la relecture du dossier chez Zoho. La même livraison (demande, opération,
// empreinte du corps) n'est plus traitée qu'une fois par heure ; une livraison distincte du même dossier l'est toujours.
describe('Retour Zoho Sign : une livraison rejouée ne relance rien',()=>{
 const autreInstant=(n:number)=>({...event,notifications:{...event.notifications,performed_at:1_700_000_000_000+n}});
 it('la même livraison, rejouée : le même accusé, aucune nouvelle relecture',async()=>{
  const premiere=await POST(req());expect(premiere.status).toBe(200);expect(m.tasks).toHaveLength(1);
  for(let i=0;i<3;i++){
   const rejouee=await POST(req());
   expect(rejouee.status).toBe(200);expect(await rejouee.json()).toEqual(await premiere.clone().json());
  }
  expect(m.tasks).toHaveLength(1);
  expect(vi.mocked(console.warn).mock.calls).toEqual([['[zoho-webhook]','livraison_repetee'],['[zoho-webhook]','livraison_repetee'],['[zoho-webhook]','livraison_repetee']]);
 });
 it('la garde est la limite à clé existante, au plus une fois, sur une clé sans contenu du corps',async()=>{
  const corps=JSON.stringify(event);
  await POST(req());
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith('autoriser_lien_mot_de_passe_cle',{p_cle:cleLivraisonWebhookZoho('11000000000001','RequestCompleted',corps),p_max:1});
  const cle=m.rpc.mock.calls[0][1].p_cle as string;
  expect(cle).toMatch(/^zoho-webhook:11000000000001:RequestCompleted:[0-9a-f]{64}$/);
  expect(cle).not.toContain('prive@example.test');
 });
 it('des livraisons distinctes du même dossier (autre opération, autre instant) sont toutes suivies',async()=>{
  for(const valeur of [event,autreInstant(1),autreInstant(2),{...event,notifications:{...event.notifications,operation_type:'RequestViewed'}}])
   expect((await POST(req(valeur))).status).toBe(200);
  expect(m.tasks).toHaveLength(4);
  expect(new Set(m.rpc.mock.calls.map(([,p])=>p.p_cle)).size).toBe(4);
 });
 it('une même livraison pour une autre demande Gerimmo est une autre clé',async()=>{
  expect(cleLivraisonWebhookZoho('11000000000001','RequestCompleted','{}')).not.toBe(cleLivraisonWebhookZoho('11000000000002','RequestCompleted','{}'));
  expect(cleLivraisonWebhookZoho('11000000000001','RequestCompleted','{}')).not.toBe(cleLivraisonWebhookZoho('11000000000001','RequestCompleted','{ }'));
 });
 it('la garde injoignable : 503, rien n\'est relu (Zoho renverra la livraison)',async()=>{
  m.rpc.mockResolvedValue({data:null,error:{message:'indisponible'}});
  const r=await POST(req());expect(r.status).toBe(503);expect(await r.json()).toEqual({erreur:'Suivi indisponible.'});
  expect(m.tasks).toHaveLength(0);
 });
 it('ni une signature refusée, ni une demande étrangère, ni un dossier clos ne consomment de clé',async()=>{
  await POST(req(event,'faux'));
  m.read.mockResolvedValueOnce({data:null,error:null});await POST(req());
  m.read.mockResolvedValueOnce({data:{id:'circuit',etat:'termine'},error:null});await POST(req());
  expect(m.rpc).not.toHaveBeenCalled();
  // Le dossier suivi ensuite reçoit bien sa première livraison.
  expect((await POST(req())).status).toBe(200);expect(m.tasks).toHaveLength(1);
 });
});
