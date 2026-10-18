import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contexte } from './fixtures/contexte-document';
const m=vi.hoisted(()=>({contexte:vi.fn(),modele:vi.fn()}));
vi.mock('@/lib/documents/modeles/communs',async original=>({...await original<object>(),chargerContexteBail:m.contexte}));
vi.mock('@/lib/documents/modeles',()=>({MODELES:{cautionnement:{assembler:m.modele},avenant:{assembler:m.modele},edl:{assembler:m.modele}}}));
import { assemblerSignatureDocument } from '@/lib/signature-document';
const bail='11111111-1111-4111-8111-111111111111';
const garant='22222222-2222-4222-8222-222222222222';
let ctx=contexte();
const queries:{table:string;filters:unknown[][]}[]=[];
function db(options:{copie?:boolean;edlSigne?:boolean}={}){
 return {from(table:string){const q={table,filters:[] as unknown[][]};queries.push(q);
 const r={select:()=>r,eq:(...v:unknown[])=>{q.filters.push(v);return r;},is:()=>r,in:()=>r,order:()=>r,limit:()=>r,
 maybeSingle:async()=>({data:options.copie?{document_id:'pdf-bail',document_signe:null}:null,error:null}),
 single:async()=>({data:table==='etats_des_lieux'?{bail_id:bail,etat:options.edlSigne?'signe':'brouillon'}:{id:'pdf-bail',titre:'Bail fictif',storage_path:'org/bail.pdf',empreinte:'a'.repeat(64),mime_type:'application/pdf'},error:null})};return r;
 }} as unknown as SupabaseClient;
}
beforeEach(()=>{queries.length=0;ctx=contexte();ctx.organisation.type='proprietaire_direct';
const p={...ctx.locataires[0],email:'personne@example.test',telephone:'+33600000001',prenom:'Personne',qualite:'personne physique'};
ctx.locataires=[{...p,id:'locataire'}];ctx.bailleurs=[{...p,id:'proprietaire',quote_part:100}];ctx.garants=[{...p,id:garant,garant_de:'locataire'},{...p,id:'autre-garant',garant_de:'locataire'}];
m.contexte.mockResolvedValue(ctx);m.modele.mockReset().mockResolvedValue({document:{html:'<body>Document fictif</body>',reference:'TEST',manquants:[]},titreGed:'Fictif',liens:[]});});
describe('assemblage des documents à signer',()=>{
 it('ne fait signer que la caution choisie et les propriétaires, avec copie du bail',async()=>{
  const r=await assemblerSignatureDocument(db({copie:true}),'org',{code:'cautionnement',cibleId:bail,options:{garant}});
  expect(r.signataires.map(p=>p.personId)).toEqual([garant,'proprietaire']);
  expect(r.annexes).toHaveLength(1);expect(r.manquants).toEqual([]);
  expect(r.document.html).toContain('Mention personnelle de la caution');
  expect(queries.every(q=>q.filters.some(f=>f[0]==='organization_id'&&f[1]==='org'))).toBe(true);
 });
 it('bloque la caution quand la copie du bail manque',async()=>{
  const r=await assemblerSignatureDocument(db(),'org',{code:'cautionnement',cibleId:bail,options:{garant}});
  expect(r.manquants.join()).toContain('Préparez le PDF du bail');
 });
 it('refuse un garant non rattaché au bail avant d’assembler son acte',async()=>{
  await expect(assemblerSignatureDocument(db(),'org',{code:'cautionnement',cibleId:bail,options:{garant:'inconnu'}})).rejects.toThrow('rattaché');
  expect(m.modele).not.toHaveBeenCalled();
 });
 it('un avenant ne convoque pas automatiquement les garants du bail',async()=>{
  const r=await assemblerSignatureDocument(db(),'org',{code:'avenant',cibleId:bail,options:{objet:'ESSAI',modifications:'Fictives'}});
  expect(r.signataires.map(p=>p.qualite)).toEqual(['Locataire','Propriétaire']);
 });
 it('ne prépare pas une nouvelle signature pour un état des lieux déjà signé',async()=>{
  await expect(assemblerSignatureDocument(db({edlSigne:true}),'org',{code:'edl',cibleId:bail})).rejects.toThrow('déjà signé');
  expect(m.modele).not.toHaveBeenCalled();
 });
});
