import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({envoi:vi.fn(),controle:vi.fn()}));
vi.mock('@/lib/email',()=>({envoyerEmail:m.envoi}));
vi.mock('@/lib/controle-effets',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/controle-effets')>(),verifierAvantEffet:m.controle}));
import { envoyerRelancesReportsRdv } from '@/lib/relances-reports-rdv';
import { ArretSupervision } from '@/lib/controle-effets';
const ligne={demande_id:'d1',reservation_id:'reservation-1',intervention_id:'i1',organization_id:'o1',adresse:'artisan@example.invalid',expire_le:'2099-10-18T10:00:00Z',rdv_debut:'2099-10-20T08:00:00Z',rdv_fin:null};
function client(){let reserve=false; const rpc=vi.fn(async(nom:string)=>{if(nom==='reports_rdv_a_relancer')return{data:[ligne],error:null};if(nom==='reserver_relance_report_rdv'){if(reserve)return{data:null,error:null};reserve=true;return{data:ligne,error:null};}if(nom==='liberer_relance_report_rdv'){reserve=false;return{data:true,error:null};}return{data:null,error:null};});return{db:{rpc} as unknown as SupabaseClient,rpc};}
beforeEach(()=>{vi.resetAllMocks();m.envoi.mockResolvedValue({id:'envoi'});m.controle.mockResolvedValue(undefined);});
describe('D22 — relance unique du report avant échéance',()=>{
 it('deux passes ne lancent qu’un envoi grâce à la réservation durable',async()=>{const{db,rpc}=client();await envoyerRelancesReportsRdv(db);await envoyerRelancesReportsRdv(db);expect(m.envoi).toHaveBeenCalledTimes(1);expect(m.envoi.mock.calls[0][0]).toMatchObject({to:'artisan@example.invalid',cleIdempotence:'rdv-report:relance:d1'});expect(rpc).toHaveBeenCalledWith('noter_relance_report_rdv',{p_demande:'d1',p_envoyee:true});});
 it('arrêt rappels : aucune réservation ni envoi',async()=>{const{db,rpc}=client();m.controle.mockRejectedValue(new ArretSupervision());await expect(envoyerRelancesReportsRdv(db)).rejects.toBeInstanceOf(ArretSupervision);expect(rpc).not.toHaveBeenCalledWith('reserver_relance_report_rdv',expect.anything());expect(m.envoi).not.toHaveBeenCalled();});
 it('une réponse perdue du prestataire ne relance pas le lendemain',async()=>{const{db}=client();m.envoi.mockResolvedValue({erreur:'Non confirmé',incertain:true});const r=await envoyerRelancesReportsRdv(db);await envoyerRelancesReportsRdv(db);expect(r.incertaines).toBe(1);expect(m.envoi).toHaveBeenCalledTimes(1);});
 it('refus/expiration pendant la lecture : réservation refusée, aucun envoi',async()=>{const{db,rpc}=client();rpc.mockImplementation(async(nom)=>({data:nom==='reports_rdv_a_relancer'?[ligne]:null,error:null}));await envoyerRelancesReportsRdv(db);expect(m.envoi).not.toHaveBeenCalled();});
 it('vérifie encore l’arrêt au moment exact de l’envoi',async()=>{const{db}=client();await envoyerRelancesReportsRdv(db);const p=m.envoi.mock.calls[0][0];m.controle.mockRejectedValue(new ArretSupervision());await expect(p.avantEnvoi()).rejects.toBeInstanceOf(ArretSupervision);});
 it('un arrêt avant le fournisseur libère uniquement sa réservation et permet une prochaine passe',async()=>{
  const {db,rpc}=client();
  m.controle.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ArretSupervision());
  m.envoi.mockImplementationOnce(async(p)=>{await p.avantEnvoi();return{id:'impossible'};});
  await expect(envoyerRelancesReportsRdv(db)).rejects.toBeInstanceOf(ArretSupervision);
  expect(rpc).toHaveBeenCalledWith('liberer_relance_report_rdv',{p_demande:'d1',p_reservation:'reservation-1'});
  expect(rpc).not.toHaveBeenCalledWith('noter_relance_report_rdv',expect.anything());
  expect((await envoyerRelancesReportsRdv(db)).envoyees).toBe(1);
 });
 it('une garde lente ne réserve rien après l’échéance de la mission',async()=>{
  const {db,rpc}=client();let temps=0;
  m.controle.mockResolvedValueOnce(undefined).mockImplementationOnce(async()=>{temps=101;});
  expect(await envoyerRelancesReportsRdv(db,{echeanceMs:100,horloge:()=>temps})).toMatchObject({envoyees:0,restantes:1});
  expect(rpc).not.toHaveBeenCalledWith('reserver_relance_report_rdv',expect.anything());
 });
 it('une échéance franchie pendant la préparation rend la réservation sans noter un échec d’envoi',async()=>{
  const {db,rpc}=client();let temps=0;
  m.envoi.mockImplementationOnce(async(p)=>{temps=101;try{await p.avantEnvoi();}catch{return{erreur:'Préparation interrompue'};}return{id:'impossible'};});
  expect(await envoyerRelancesReportsRdv(db,{echeanceMs:100,horloge:()=>temps})).toMatchObject({envoyees:0,echecs:0,restantes:1});
  expect(rpc).toHaveBeenCalledWith('liberer_relance_report_rdv',{p_demande:'d1',p_reservation:'reservation-1'});
  expect(rpc).not.toHaveBeenCalledWith('noter_relance_report_rdv',expect.anything());
 });
 it('ne libère jamais une tentative incertaine, même après un contrôle réussi',async()=>{
  const {db,rpc}=client();m.envoi.mockImplementationOnce(async(p)=>{await p.avantEnvoi();return{erreur:'Réponse perdue',incertain:true};});
  expect((await envoyerRelancesReportsRdv(db)).incertaines).toBe(1);
  expect(rpc).not.toHaveBeenCalledWith('liberer_relance_report_rdv',expect.anything());
  await envoyerRelancesReportsRdv(db);expect(m.envoi).toHaveBeenCalledTimes(1);
 });
 it('attend toutes les restitutions concurrentes avant de propager l’arrêt',async()=>{
  let demarrer!:()=>void,terminer!:()=>void;
  const liberationCommencee=new Promise<void>(r=>{demarrer=r;});
  const liberationRetardee=new Promise<void>(r=>{terminer=r;});
  const rpc=vi.fn(async(nom:string,p?:{p_demande:string})=>{
    if(nom==='reports_rdv_a_relancer')return{data:[{demande_id:'d1'},{demande_id:'d2'}],error:null};
    if(nom==='reserver_relance_report_rdv')return{data:{...ligne,demande_id:p?.p_demande},error:null};
    if(nom==='liberer_relance_report_rdv'&&p?.p_demande==='d2'){demarrer();await liberationRetardee;}
    return{data:true,error:null};
  });
  let gardes=0;m.controle.mockImplementation(async()=>{if(++gardes>3)throw new ArretSupervision();});
  m.envoi.mockImplementation(async(p)=>{await p.avantEnvoi();return{id:'impossible'};});
  let finie=false;
  const passe=envoyerRelancesReportsRdv({rpc} as unknown as SupabaseClient).then(()=>{finie=true;return null;},e=>{finie=true;return e;});
  await liberationCommencee;await Promise.resolve();
  expect(finie).toBe(false);
  terminer();expect(await passe).toBeInstanceOf(ArretSupervision);
 });
});
