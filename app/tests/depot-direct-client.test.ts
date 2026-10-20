import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({reserver:vi.fn(),upload:vi.fn()}));
vi.mock('@/app/actions/depot-direct',()=>({preparerDepotDirect:m.reserver}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:m.upload})}})}));
import {preparerDepotsDirects} from '@/lib/depot-direct-client';
import {MARQUEUR_DEPOT,PREFIXE_DEPOT} from '@/lib/depot-direct-commun';
const id='22222222-2222-4222-8222-222222222222';
const fichier=()=>new File(['%PDF-1.7 essai %%EOF'],'Document.pdf',{type:'application/pdf'});
function form(file:File){const f=new FormData();f.set('fichier',file);f.set(MARQUEUR_DEPOT,JSON.stringify({id:'champ',nom:'fichier'}));f.set('titre','Conservé');return f;}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('document',{getElementById:()=>null});vi.stubGlobal('HTMLInputElement',class{});m.reserver.mockResolvedValue({id,chemin:'compte/'+id,jeton:'essai'});m.upload.mockResolvedValue({error:null});});afterEach(()=>vi.unstubAllGlobals());
describe('Transfert avant la soumission du formulaire',()=>{
 it('envoie les octets au stockage et seulement une référence à l’action',async()=>{const file=fichier(),f=form(file);await preparerDepotsDirects(f);expect(f.get('fichier')).toBe(PREFIXE_DEPOT+id);expect(f.get('titre')).toBe('Conservé');expect(f.has(MARQUEUR_DEPOT)).toBe(false);expect(m.upload.mock.calls[0][2]).toBeInstanceOf(Blob);});
 it('réutilise un transfert confirmé si le formulaire métier a été refusé',async()=>{const file=fichier();await preparerDepotsDirects(form(file));await preparerDepotsDirects(form(file));expect(m.reserver).toHaveBeenCalledTimes(1);expect(m.upload).toHaveBeenCalledTimes(1);});
 it('une panne conserve le File et les champs sans lancer l’action métier',async()=>{m.upload.mockResolvedValue({error:{message:'panne'}});const file=fichier(),f=form(file);await expect(preparerDepotsDirects(f)).rejects.toThrow('interrompu');expect(f.get('fichier')).toBe(file);expect(f.get('titre')).toBe('Conservé');});
 it('refuse plus de 10 Mo avant toute réservation',async()=>{const f=form(new File([new Uint8Array(10485761)],'Gros.pdf'));await expect(preparerDepotsDirects(f)).rejects.toThrow('10 Mo');expect(m.reserver).not.toHaveBeenCalled();});
 it('refuse un faux PDF avant toute réservation',async()=>{await expect(preparerDepotsDirects(form(new File(['executable'],'faux.pdf')))).rejects.toThrow('PDF complet');expect(m.reserver).not.toHaveBeenCalled();});
 it('laisse les formulaires non activés inchangés',async()=>{const f=new FormData(),file=fichier();f.set('fichier',file);await preparerDepotsDirects(f);expect(f.get('fichier')).toBe(file);expect(m.upload).not.toHaveBeenCalled();});
});
