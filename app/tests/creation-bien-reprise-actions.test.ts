import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),verifier:vi.fn(),redirect:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>({verifierGerant:m.verifier}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:m.redirect}));
vi.mock('@/lib/ged-depot',()=>({deposerFichierGed:vi.fn()}));
import {creerBien} from '@/app/actions/parc';
const cle='48d3f344-e341-4b50-977a-cc06c07eebfa';
function saisie(){const f=new FormData();for(const [k,v] of Object.entries({creation_id:cle,nom:'TEST Reprise',type:'appartement',address_line1:'1 rue TEST',postal_code:'75001',city:'Paris',annee_construction:'1990',parties_communes:'Hall',acces_tic:'Fibre',surface_m2:'42.25',pieces:'2',lots:JSON.stringify([{nom:'TEST Lot',surface:'42.25',pieces:'2'}])}))f.set(k,v);return f;}
beforeEach(()=>{vi.resetAllMocks();m.verifier.mockResolvedValue({supabase:{rpc:m.rpc,from:m.from},user:{id:'user-test'},role:'admin_agence'});m.redirect.mockImplementation((url)=>{throw Error('REDIRECT:'+url);});});
it('un refus apres insertion conserve toutes les saisies et la cle, sans ecriture complementaire separee',async()=>{
 m.rpc.mockResolvedValue({data:null,error:{message:'Panne TEST apres insertion'}});const f=saisie();const retour=await creerBien('org-test',{},f);
 expect(retour.erreur).toContain('même demande');expect(retour.valeurs).toEqual(Object.fromEntries(f));expect(m.from).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledOnce();expect(m.rpc.mock.calls[0][0]).toBe('creer_bien_complet');
});
it.each(['erreur','exception'])('confirmation perdue (%s) : reprise du meme identifiant de demande',async(mode)=>{
 const biens=new Map<string,string>();let appel=0;
 m.rpc.mockImplementation(async(_nom,args)=>{if(!biens.has(args.p_creation))biens.set(args.p_creation,'bien-unique');if(++appel===1){if(mode==='exception')throw Error('reponse perdue');return{data:null,error:{message:'reponse perdue'}};}return{data:{bien_id:biens.get(args.p_creation),lot_unique_id:'lot-unique',saisie_differente:false},error:null};});
 const retour=await creerBien('org-test',{},saisie());expect(retour.valeurs?.creation_id).toBe(cle);await expect(creerBien('org-test',retour,saisie())).rejects.toThrow('REDIRECT:/agence/org-test/parc/bien-unique/lots/lot-unique');expect(biens.size).toBe(1);expect(m.rpc.mock.calls.map(c=>c[1].p_creation)).toEqual([cle,cle]);
});
it('saisie modifiee apres creation deja confirmee : garder les nouvelles valeurs et proposer le dossier existant',async()=>{
 m.rpc.mockResolvedValue({data:{bien_id:'bien-unique',lot_unique_id:'lot-unique',saisie_differente:true},error:null});const f=saisie();f.set('nom','Nom corrige');const retour=await creerBien('org-test',{},f);expect(retour.valeurs?.nom).toBe('Nom corrige');expect(retour.repriseHref).toBe('/agence/org-test/parc/bien-unique/lots/lot-unique');expect(m.redirect).not.toHaveBeenCalled();
});
it.each([null,'[null]','[42]','[{"surface":"Infinity","pieces":"2"}]','[{"surface":"42","pieces":"1.5"}]'])('refuse liste ou nombres invalides avant la mutation : %s',async(lots)=>{
 const f=saisie();f.set('lots',lots??'null');expect((await creerBien('org-test',{},f)).erreur).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
});
it('aucun acces ne devient une mutation et la saisie reste disponible',async()=>{m.verifier.mockResolvedValue({user:null});const r=await creerBien('org-test',{},saisie());expect(r.erreur).toBe('Accès refusé.');expect(r.valeurs?.nom).toBe('TEST Reprise');expect(m.rpc).not.toHaveBeenCalled();});
it('cle manquante ne cree rien',async()=>{const f=saisie();f.delete('creation_id');expect((await creerBien('org-test',{},f)).erreur).toContain('référence');expect(m.rpc).not.toHaveBeenCalled();});
