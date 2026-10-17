import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), acces: vi.fn(), download: vi.fn(), from: vi.fn(), pdf: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({data:{user:{id:'u'}}}) }, rpc:m.rpc }) }));
vi.mock('@/lib/supabase/service', () => ({ clientDeService: () => ({from:m.from,storage:{from:()=>({download:m.download})}}) }));
vi.mock('@/lib/parcours-devis-serveur', () => ({ chargerPreparationDevis:m.acces }));
vi.mock('@/lib/documents/rendu', () => ({rendrePdf:m.pdf}));
import { GET } from '@/app/api/devis/[sollicitationId]/pdf/route';
const octets=Buffer.from('%PDF-version-1');
const archive={id:'11111111-1111-4111-8111-111111111111',version:1,pdf_path:'org/version-1.pdf',pdf_sha:createHash('sha256').update(octets).digest('hex'),pdf_bucket:'documents',reference_id:'11111111-1111'};
const context={params:Promise.resolve({sollicitationId:'11111111-2222-4111-8111-111111111111'})};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:archive,error:null});m.download.mockResolvedValue({data:new Blob([octets]),error:null});m.acces.mockRejectedValue(new Error('Pas artisan'));m.from.mockImplementation(()=>{throw new Error('La préparation privée ne doit pas être lue');});});
describe('D18 — PDF immuable par version',()=>{
 it('lit les octets de la version demandée, sans lire la préparation suivante',async()=>{const r=await GET(new Request('http://localhost/pdf?version=1'),context);expect(r.status).toBe(200);expect(Buffer.from(await r.arrayBuffer())).toEqual(octets);expect(m.rpc).toHaveBeenCalledWith('lire_devis_pdf_version',{p_sollicitation:'11111111-2222-4111-8111-111111111111',p_version:1});expect(m.download).toHaveBeenCalledWith('org/version-1.pdf');expect(m.from).not.toHaveBeenCalled();expect(m.pdf).not.toHaveBeenCalled();});
 it('le gérant lit la dernière version envoyée, jamais la préparation privée',async()=>{expect((await GET(new Request('http://localhost/pdf'),context)).status).toBe(200);expect(m.from).not.toHaveBeenCalled();});
 it('un refus de droits sur une version ne se replie jamais sur le brouillon artisan',async()=>{m.rpc.mockResolvedValue({data:null,error:{message:'Accès refusé'}});expect((await GET(new Request('http://localhost/pdf?version=2'),context)).status).toBe(403);expect(m.acces).not.toHaveBeenCalled();expect(m.download).not.toHaveBeenCalled();});
 it.each(['0','-1','1.5','abc','99999999999999999'])('refuse le numéro de version %s avant lecture',async(v)=>{expect((await GET(new Request(`http://localhost/pdf?version=${v}`),context)).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();});
 it('ne reconstruit pas une archive dont les octets ont changé',async()=>{m.download.mockResolvedValue({data:new Blob(['autre']),error:null});expect((await GET(new Request('http://localhost/pdf?version=1'),context)).status).toBe(503);expect(m.pdf).not.toHaveBeenCalled();});
});
