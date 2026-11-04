import {describe,it,expect} from 'vitest';
import {premiereEcheanceCharges,resteEcheancierCharges,type EcheancierCharges} from '@/lib/echeanciers-charges';
import {documentEcheancierCharges} from '@/lib/documents/echeancier-charges';
import {rendrePdf} from '@/lib/documents/rendu';
import {writeFileSync} from 'node:fs';
const plan:EcheancierCharges={id:'11111111-1111-4111-8111-111111111111',organization_id:'o',bail_id:'b',regularisation_id:'r',total_cents:10001,echeances:[{rang:1,date:'2026-12-05',du_cents:3333,recu_cents:1000,declare_le:null,recu_le:'2026-11-01'},{rang:2,date:'2027-01-05',du_cents:3333,recu_cents:0,declare_le:null,recu_le:null},{rang:3,date:'2027-02-05',du_cents:3335,recu_cents:0,declare_le:null,recu_le:null}],document_id:null,publie_le:null,accepte_le:null};
const contexte={locataire:'Camille Démonstration',logement:'Appartement des Arts',adresse:'12 rue des Arts, 69000 Lyon',emetteur:'Claire Moreau',annee:2025,charges:300.01,provisions:200};
describe('échéancier de charges',()=>{
 it.each(['2026-01-31','2026-02-28','2026-12-31'])('laisse plus d’un mois de préavis depuis %s',date=>{expect(Date.parse(premiereEcheanceCharges(date))-Date.parse(date)).toBeGreaterThanOrEqual(31*86400000)});
 it('déduit uniquement les réceptions, jamais les paiements signalés',()=>{expect(resteEcheancierCharges(plan)).toBe(9001);expect(resteEcheancierCharges({...plan,echeances:plan.echeances.map(e=>({...e,declare_le:'2026-11-01'}))})).toBe(9001)});
 it('inclut provisions, total, dates et accord dans le PDF',()=>{const d=documentEcheancierCharges(plan,contexte);expect(d.html).toContain('Provisions déjà appelées');expect(d.html).toContain('100,01');expect(d.html).toContain('33,35');expect(d.html).toContain('en attente de votre accord');expect(d.html).toContain('05/12/2026');expect(d.html).toContain('Claire Moreau')});
 it('échappe les informations personnelles',()=>{expect(documentEcheancierCharges(plan,{...contexte,locataire:'<script>TEST</script>'}).html).not.toContain('<script>')});
 it('produit un vrai PDF avec le moteur du site',async()=>{const octets=await rendrePdf(documentEcheancierCharges(plan,contexte));expect(Buffer.from(octets).subarray(0,5).toString()).toBe('%PDF-');if(process.env.GERIMMO_TEST_PDF)writeFileSync(process.env.GERIMMO_TEST_PDF,octets)},30000);
});
