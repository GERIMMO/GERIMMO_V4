import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({controle:vi.fn(),email:vi.fn(),rpc:vi.fn(),fournisseur:vi.fn()}));
vi.mock('@/lib/controle-effets',async(original)=>({...await original<typeof import('@/lib/controle-effets')>(),verifierAvantEffet:m.controle}));
vi.mock('@/lib/email',()=>({envoyerEmail:m.email}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:()=>({rpc:m.rpc})}));
vi.mock('@/lib/tache',()=>({consignerTache:vi.fn()}));
vi.mock('@/lib/notifications',()=>({envoyerRappelsGestes:vi.fn(async()=>({envoyes:0}))}));
vi.mock('@/lib/relances-reports-rdv',()=>({envoyerRelancesReportsRdv:vi.fn(async()=>({envoyees:0}))}));
vi.mock('@/lib/relances-invitations',()=>({envoyerRelancesInvitations:vi.fn(async()=>({envoyees:0}))}));
import { traiterRappels } from '@/lib/missions-planifiees/rappels';
const rdv={intervention_id:'i',organization_id:'o',echeance:'veille',destinataire:'artisan',adresse:'artisan@example.invalid',prenom:null,emetteur:'TEST',artisan:'TEST',lot:'TEST',adresse_bien:'TEST',debut_prevu:'2099-10-20T08:00:00Z',fin_prevue:null,incident_numero:'TEST',categorie:'TEST'};
let temps:number;
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('CRON_SECRET','test');temps=0;vi.spyOn(Date,'now').mockImplementation(()=>temps);
 m.controle.mockResolvedValue(undefined);m.rpc.mockImplementation(async(nom)=>({data:nom==='rendez_vous_a_rappeler'?[rdv]:null,error:null}));
 m.email.mockImplementation(async(p)=>{try{await p.avantEnvoi();}catch{return{erreur:'Préparation interrompue'};}m.fournisseur();return{id:'test'};});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('rappels de rendez-vous — la garde et la marque consomment aussi le budget',()=>{
 it.each([2,3])('le contrôle lent numéro %i empêche tout appel fournisseur et toute trace d’envoi',async(n)=>{
  let nombre=0;m.controle.mockImplementation(async()=>{if(++nombre===n)temps=160_001;});
  const r=await traiterRappels(new Request('http://localhost/test',{headers:{authorization:'Bearer test'}}));
  expect(await r.json()).toMatchObject({rappeles:0,echecs:0});
  expect(m.fournisseur).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalledWith('marquer_rappel_envoye',expect.anything());
 });
});
