import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const sim=vi.hoisted(()=>({data:null as unknown,rpc:vi.fn(),pdf:vi.fn(),fiche:true}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/app/artisan/acces',()=>({verifierArtisanMutation:async()=>({supabase:{rpc:sim.rpc},fiche:sim.fiche?{artisan_id:'a1'}:null})}));
vi.mock('@/lib/artisan-prive',()=>({activationModuleArtisan:()=>true,chargerActivitePrivee:async()=>({data:sim.data})}));
vi.mock('@/lib/documents/rendu',()=>({rendrePdf:sim.pdf}));
import { enregistrerActivitePrivee } from '@/app/artisan/clients/actions';
const ligne={libelle:'Joint conservé',quantite:2,prix_unitaire_ht_cents:5000,tva_bps:1000,montant_ht_cents:10000,montant_tva_cents:1000,montant_ttc_cents:11000};
const devis={id:'d1',chantier_id:'h1',version:1,statut:'brouillon',description:'Réparation conservée',lignes:[ligne],valide_jusqu_au:'2026-12-30',entreprise:{adresse:''},pdf_id:null};
function activite(){return {chantiers:[{id:'h1',revision:3,statut:'brouillon'}],devis:[{...devis}]};}
function form(){const f=new FormData();for(const [k,v] of Object.entries({action:'actualiser_devis',id:'h1',revision:'3',cle:randomUUID(),devis_id:'d1',description:'Texte falsifié',lignes:'[]',adresse:'Adresse falsifiée'}))f.set(k,v);return f;}
beforeEach(()=>{vi.clearAllMocks();sim.fiche=true;sim.data=activite();sim.rpc.mockImplementation(async(n:string)=>n==='artisan_exclusion_plateforme'?{data:null,error:null}:{data:'h1',error:null});});
it('crée une nouvelle version par la fonction métier avec les lignes relues, sans PDF ni coordonnées fournis par le navigateur',async()=>{
 const avant=structuredClone(sim.data);const f=form();f.set('fichier',new File(['fichier injecté'],'inutile.pdf',{type:'application/pdf'}));const r=await enregistrerActivitePrivee(f);expect(r.erreur).toBeUndefined();
 expect(sim.rpc).toHaveBeenCalledWith('artisan_externe_ecrire',expect.objectContaining({p_action:'devis',p_id:'h1',p_revision:3,p_donnees:{description:devis.description,valide_jusqu_au:devis.valide_jusqu_au,lignes:[ligne]}}));
 expect(sim.data).toEqual(avant);expect(sim.pdf).not.toHaveBeenCalled();
});
it.each(['valide','accepte','remplace'])('refuse de reprendre automatiquement une version %s',async(statut)=>{sim.data={...activite(),devis:[{...devis,statut,pdf_id:'archive'}]};expect((await enregistrerActivitePrivee(form())).erreur).toContain('a changé');expect(sim.rpc).toHaveBeenCalledTimes(1);});
it('refuse une révision concurrente',async()=>{sim.data={...activite(),chantiers:[{id:'h1',revision:4,statut:'brouillon'}]};expect((await enregistrerActivitePrivee(form())).erreur).toContain('a changé');expect(sim.rpc).toHaveBeenCalledTimes(1);});
it('refuse un ancien brouillon quand une version plus récente existe',async()=>{sim.data={...activite(),devis:[devis,{...devis,id:'d2',version:2}]};expect((await enregistrerActivitePrivee(form())).erreur).toContain('a changé');expect(sim.rpc).toHaveBeenCalledTimes(1);});
it('refuse un devis appartenant à un autre chantier',async()=>{sim.data={...activite(),devis:[{...devis,chantier_id:'autre'}]};expect((await enregistrerActivitePrivee(form())).erreur).toContain('a changé');expect(sim.rpc).toHaveBeenCalledTimes(1);});
it('refuse une lecture indisponible sans écrire',async()=>{sim.data=null;expect((await enregistrerActivitePrivee(form())).erreur).toContain('a changé');expect(sim.rpc).toHaveBeenCalledTimes(1);});
it('refuse la supervision et un artisan exclu avant de reprendre',async()=>{sim.fiche=false;expect((await enregistrerActivitePrivee(form())).erreur).toContain('compte artisan');expect(sim.rpc).not.toHaveBeenCalled();sim.fiche=true;sim.rpc.mockResolvedValue({data:'refuse'});expect((await enregistrerActivitePrivee(form())).erreur).toBeTruthy();expect(sim.rpc).toHaveBeenCalledTimes(1);});
