import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({acces:vi.fn(),rpc:vi.fn(),config:vi.fn(),lire:vi.fn(),annuler:vi.fn(),supprimer:vi.fn(),single:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>({verifierGerant:m.acces}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/youtrust',()=>({configurationYoutrust:m.config,lireDemandeYoutrust:m.lire,annulerDemandeYoutrust:m.annuler,supprimerBrouillonYoutrust:m.supprimer}));
import {annulerDemandeSignature} from '@/app/actions/signature';
beforeEach(()=>{
 vi.resetAllMocks();const q={select:()=>q,eq:()=>q,single:m.single};m.acces.mockResolvedValue({user:{id:'owner'},supabase:{rpc:m.rpc,from:()=>q}});
 m.rpc.mockResolvedValue({data:true,error:null});m.config.mockReturnValue({environnement:'production'});m.single.mockResolvedValue({data:{prestataire:'youtrust',external_request_id:'req',signee_le:null},error:null});
 m.lire.mockResolvedValue({id:'req',external_id:'demande',status:'ongoing'});
});
const local=()=>m.rpc.mock.calls.filter(c=>c[0]==='annuler_demande_signature');
describe('Annulation des anciennes invitations électroniques',()=>{
 it('conserve le suivi local si le prestataire ne confirme pas son arrêt',async()=>{expect((await annulerDemandeSignature('org','demande')).erreur).toContain('pas encore confirmé');expect(local()).toHaveLength(0);});
 it('conserve le suivi local en cas de coupure réseau',async()=>{m.annuler.mockRejectedValue(new Error('coupure'));expect((await annulerDemandeSignature('org','demande')).erreur).toContain('conservée');expect(local()).toHaveLength(0);});
 it('annule localement seulement après confirmation distante',async()=>{m.lire.mockResolvedValueOnce({id:'req',external_id:'demande',status:'ongoing'}).mockResolvedValueOnce({id:'req',external_id:'demande',status:'canceled'});expect((await annulerDemandeSignature('org','demande')).succes).toBeTruthy();expect(local()).toHaveLength(1);});
 it('refuse un rattachement distant incohérent',async()=>{m.lire.mockResolvedValue({id:'autre',external_id:'demande',status:'ongoing'});expect((await annulerDemandeSignature('org','demande')).erreur).toBeTruthy();expect(m.annuler).not.toHaveBeenCalled();expect(local()).toHaveLength(0);});
 it('n’annule jamais un contrat déjà signé',async()=>{m.lire.mockResolvedValue({id:'req',external_id:'demande',status:'done'});expect((await annulerDemandeSignature('org','demande')).erreur).toContain('déjà signé');expect(m.annuler).not.toHaveBeenCalled();expect(local()).toHaveLength(0);});
 it('le superviseur sans rôle de gestion ne peut annuler',async()=>{m.rpc.mockResolvedValue({data:false,error:null});expect((await annulerDemandeSignature('org','demande')).erreur).toBeTruthy();expect(m.lire).not.toHaveBeenCalled();expect(local()).toHaveLength(0);});
 it('supprime le brouillon distant sans demander de cancel sur un état incompatible',async()=>{m.lire.mockResolvedValue({id:'req',external_id:'demande',status:'draft'});expect((await annulerDemandeSignature('org','demande')).succes).toBeTruthy();expect(m.supprimer).toHaveBeenCalledWith({environnement:'production'},'req');expect(m.annuler).not.toHaveBeenCalled();});
});
