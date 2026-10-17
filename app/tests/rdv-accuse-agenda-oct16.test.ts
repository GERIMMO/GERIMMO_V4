import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),acces:vi.fn()}));
vi.mock('@/app/artisan/acces',()=>({verifierArtisanMutation:m.acces}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import { accuserAnnulationRdv } from '@/app/actions/rendez-vous-artisan';
import { AccuseAnnulation } from '@/app/artisan/missions/[interventionId]/accuse-annulation';
import { badgeDemandeRdv, type DemandeRdvArtisan } from '@/lib/rendez-vous-locataire';
const demande={demande_id:'d1',intervention_id:'i1',type:'report',statut:'en_attente',expire_le:'2099-10-18T08:00:00Z'} as DemandeRdvArtisan;
beforeEach(()=>{vi.resetAllMocks();m.acces.mockResolvedValue({supabase:{rpc:m.rpc},fiche:{artisan_id:'a1'}});m.rpc.mockResolvedValue({data:true,error:null});});
describe('D22 — accusé sans blocage et badge agenda',()=>{
 it('affiche le report en attente, avec rendez-vous maintenu',()=>expect(badgeDemandeRdv(demande,'planifiee')).toBe('Report demandé · rendez-vous maintenu'));
 it('l’annulation reste visible sans empêcher les créneaux',()=>{expect(badgeDemandeRdv({...demande,type:'annulation',statut:'acceptee'},'acceptee')).toBe('Rendez-vous annulé par le locataire');expect(badgeDemandeRdv({...demande,type:'annulation',statut:'acceptee'},'planifiee')).toBeNull();});
 it('le bouton prend acte seulement, sans formulaire de créneaux',()=>{const html=renderToStaticMarkup(createElement(AccuseAnnulation,{demandeId:'d1',interventionId:'i1',vueLe:null}));expect(html).toContain('J’en prends acte');expect(html).not.toContain('required');});
 it('un accusé existant se lit sans bouton',()=>{const html=renderToStaticMarkup(createElement(AccuseAnnulation,{demandeId:'d1',interventionId:'i1',vueLe:'2026-10-16T10:00:00Z'}));expect(html).toContain('Vous avez pris acte');expect(html).not.toContain('<button');});
 it('écrit uniquement l’accusé, même au rejeu',async()=>{m.rpc.mockResolvedValue({data:false,error:null});expect(await accuserAnnulationRdv('d1','i1',{})).toMatchObject({succes:expect.stringContaining('pris acte')});expect(m.rpc).toHaveBeenCalledExactlyOnceWith('accuser_annulation_rdv',{p_demande:'d1'});});
 it('le diagnostic ou un autre artisan ne peut pas accuser',async()=>{m.acces.mockResolvedValue({fiche:null,erreur:'Lecture seule'});expect(await accuserAnnulationRdv('d1','i1',{})).toEqual({erreur:'Lecture seule'});expect(m.rpc).not.toHaveBeenCalled();});
});
