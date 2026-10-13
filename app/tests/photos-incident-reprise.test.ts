import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { joindrePhotosAvecReprise } from '../src/lib/photos-incident-reprise';
const fichier=new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1])],'photo.jpg',{type:'image/jpeg'});
function banc() {
 const rpc=vi.fn(async(nom:string)=>({data:nom==='preparer_photo_incident'?{id:'depot',storage_path:'org/incidents-reprise/moi/unique.jpg',etat:'en_attente'}:{document_id:'doc'},error:null}));
 const upload=vi.fn().mockResolvedValue({error:null}),remove=vi.fn().mockResolvedValue({error:null,data:[{}]});
 const chaine={eq:vi.fn(),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(resolve)};chaine.eq.mockReturnValue(chaine);
 const db={rpc,from:()=>({select:()=>chaine}),storage:{from:()=>({upload,remove})}} as unknown as SupabaseClient;
 return {db,rpc,upload,remove};
}
describe('LOC002 : reprise ciblée des photos',()=>{
 it('un rattachement déjà confirmé ne redépose ni ne supprime la photo',async()=>{const b=banc();b.rpc.mockResolvedValue({data:{etat:'rattache',document_id:'doc'},error:null} as never);expect(await joindrePhotosAvecReprise(b.db,'org','incident',[fichier])).toBeUndefined();expect(b.upload).not.toHaveBeenCalled();expect(b.remove).not.toHaveBeenCalled();});
 it('une réponse perdue de rattachement ne supprime jamais le fichier',async()=>{const b=banc();b.rpc.mockResolvedValueOnce({data:{id:'depot',storage_path:'propre',etat:'en_attente'},error:null} as never).mockRejectedValueOnce(new Error('réseau'));expect(await joindrePhotosAvecReprise(b.db,'org','incident',[fichier])).toMatch(/résultat indisponible/);expect(b.remove).not.toHaveBeenCalled();});
 it('un upload à réponse perdue se résout par la finalisation',async()=>{const b=banc();b.upload.mockRejectedValueOnce(new Error('réseau'));expect(await joindrePhotosAvecReprise(b.db,'org','incident',[fichier])).toBeUndefined();expect(b.rpc).toHaveBeenCalledWith('finaliser_photo_incident',{p_depot:'depot'});expect(b.remove).not.toHaveBeenCalled();});
 it('un refus confirmé nettoie uniquement le chemin réservé',async()=>{const b=banc();b.rpc.mockResolvedValueOnce({data:{id:'depot',storage_path:'org/propre.jpg',etat:'en_attente'},error:null} as never).mockResolvedValueOnce({data:{erreur:'Photo déjà classée',nettoyage:true},error:null} as never);expect(await joindrePhotosAvecReprise(b.db,'org','incident',[fichier])).toMatch(/Photo déjà classée/);expect(b.remove).toHaveBeenCalledExactlyOnceWith(['org/propre.jpg']);});
 it('un refus de retrait reste explicitement signalé',async()=>{const b=banc();b.rpc.mockResolvedValueOnce({data:{id:'depot',storage_path:'org/propre.jpg',etat:'en_attente'},error:null} as never).mockResolvedValueOnce({data:{erreur:'Refus',nettoyage:true},error:null} as never);b.remove.mockResolvedValue({error:{message:'stockage indisponible'}});expect(await joindrePhotosAvecReprise(b.db,'org','incident',[fichier])).toMatch(/reste à nettoyer/);});
});
