import { beforeEach, expect, it, vi } from 'vitest';
const banc=vi.hoisted(()=>({insert:vi.fn(),revalidate:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:banc.revalidate}));
vi.mock('@/lib/rapports-mensuels',()=>({remettreRapportMensuel:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>({verifierGerant:async()=>({user:{id:'test'},supabase:{from:()=>({insert:banc.insert})}})}));
import { ajouterEcriture } from '../src/app/actions/compta';
function saisie(){const f=new FormData();for(const [k,v] of Object.entries({categorie:'Taxe foncière',sens:'depense',montant:'1124',teom:'168',lot_id:'lot-test',date_piece:'2026-09-15',date_imputation:'2026-10-01'}))f.set(k,v);return f;}
beforeEach(()=>{vi.clearAllMocks();banc.insert.mockResolvedValue({error:null});});
it('envoie les deux parts dans une seule insertion avec même lot et dates',async()=>{
 expect((await ajouterEcriture('org-test',{},saisie())).succes).toBeDefined();
 expect(banc.insert).toHaveBeenCalledTimes(1);
 const lignes=banc.insert.mock.calls[0][0];
 expect(lignes).toHaveLength(2);
 expect(lignes.map((l:{montant:number})=>l.montant)).toEqual([956,168]);
 for(const ligne of lignes)expect(ligne).toMatchObject({organization_id:'org-test',lot_id:'lot-test',date_piece:'2026-09-15',date_imputation:'2026-10-01'});
});
it('refuse une ventilation invalide sans écriture',async()=>{const f=saisie();f.set('teom','1125');expect((await ajouterEcriture('org-test',{},f)).erreur).toBeDefined();expect(banc.insert).not.toHaveBeenCalled();});
it('ne présente aucun succès si la base refuse le lot ou le mois',async()=>{banc.insert.mockResolvedValue({error:{message:'Mois clôturé'}});const r=await ajouterEcriture('org-test',{},saisie());expect(r.erreur).toBeDefined();expect(r.succes).toBeUndefined();});
