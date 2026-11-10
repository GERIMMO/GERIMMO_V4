import {createHmac} from 'node:crypto';
import {it,expect,vi,afterEach} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn().mockResolvedValue({data:true,error:null}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>({rpc})}));
import { POST } from '../src/app/api/resend/suivi/route';
const secret=Buffer.from('cle locale de recette sans valeur externe').toString('base64');
function requete(type='email.delivered',valide=true){
 const payload=JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:'email-fictif',tags:{gerimmo_message:'a'.repeat(64)}}});
 const id='evt_fictif',timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',Buffer.from(secret,'base64')).update(`${id}.${timestamp}.${payload}`).digest('base64');
 return new Request('http://localhost/api/resend/suivi',{method:'POST',body:payload,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${valide?signature:'incorrect'}`}});
}
afterEach(()=>{vi.unstubAllEnvs();rpc.mockClear();});
it('refuse un webhook non configuré',async()=>{vi.stubEnv('RESEND_WEBHOOK_SUIVI_SECRET','');expect((await POST(requete())).status).toBe(503);expect(rpc).not.toHaveBeenCalled();});
it('refuse une signature forgée',async()=>{vi.stubEnv('RESEND_WEBHOOK_SUIVI_SECRET','whsec_'+secret);expect((await POST(requete('email.delivered',false))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
it.each([['email.sent','accepte'],['email.delivered','livre'],['email.bounced','echec']])('traduit la preuve signée %s sans inventer de livraison',async(type,etat)=>{vi.stubEnv('RESEND_WEBHOOK_SUIVI_SECRET','whsec_'+secret);expect((await POST(requete(type))).status).toBe(204);expect(rpc).toHaveBeenCalledWith('rapprocher_courriel',{p_id:'a'.repeat(64),p_fournisseur:'email-fictif',p_etat:etat});});
