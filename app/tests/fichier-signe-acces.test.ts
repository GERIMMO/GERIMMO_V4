import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const b=vi.hoisted(()=>({autorise:true,lectureErreur:false,traceErreur:false,doc:null as null|{document_id:string;storage_path:string|null;titre:string;mime_type:string;purged_at:string|null;type?:string},signer:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>{
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:b.doc,error:b.lectureErreur?{}:null})};
 const db={from:()=>q,rpc:b.rpc};
 const verifier=async()=>({supabase:db,user:b.autorise?{id:'acteur'}:null});
 return {verifierGerant:verifier,verifierLocataire:verifier};
});
const signature=vi.hoisted(()=>({lire:vi.fn()}));
vi.mock('@/lib/lecture-presentation-signatures',()=>({lirePresentationSignatures:signature.lire}));
vi.mock('@/lib/fichier-signe',()=>({servirFichierSigne:b.signer}));
import { GET as proprietaire } from '@/app/agence/[orgId]/documents/[documentId]/fichier/route';
import { GET as locataire } from '@/app/locataire/[orgId]/documents/[documentId]/fichier/route';
beforeEach(()=>{
 vi.clearAllMocks();signature.lire.mockResolvedValue({circuits:[],erreur:false});b.autorise=true;b.lectureErreur=false;b.traceErreur=false;
 b.doc={document_id:'document',storage_path:'organisation/piece.pdf',titre:'Document',mime_type:'application/pdf',purged_at:null};
 b.rpc.mockImplementation(async(nom:string)=>nom==='mon_document_locataire'?{data:b.doc?[b.doc]:[],error:b.lectureErreur?{}:null}:{error:b.traceErreur?{}:null});
 b.signer.mockResolvedValue(new Response('lecture autorisée'));
});
for(const [nom,route] of [['propriétaire',proprietaire],['locataire',locataire]] as const)describe(`Droit avant lien signé : ${nom}`,()=>{
 const appeler=()=>route(new NextRequest('https://gerimmo.example.invalid/document?mode=telechargement'),{params:Promise.resolve({orgId:'organisation',documentId:'document'})});
 it('refuse sans session et ne génère aucun lien',async()=>{b.autorise=false;expect((await appeler()).status).toBe(403);expect(b.signer).not.toHaveBeenCalled();expect(b.rpc).not.toHaveBeenCalled();});
 it('refuse une lecture métier indisponible',async()=>{b.lectureErreur=true;expect((await appeler()).status).toBe(503);expect(b.signer).not.toHaveBeenCalled();});
 it('refuse une pièce absente ou non accessible',async()=>{b.doc=null;expect((await appeler()).status).toBe(404);expect(b.signer).not.toHaveBeenCalled();});
 it('ne réouvre pas une pièce purgée',async()=>{b.doc!.purged_at='2026-10-20';expect((await appeler()).status).toBe(410);expect(b.signer).not.toHaveBeenCalled();});
 it('refuse si le journal ne confirme pas la trace',async()=>{b.traceErreur=true;expect((await appeler()).status).toBe(500);expect(b.signer).not.toHaveBeenCalled();});
 it('journalise le téléchargement avant de signer le lien',async()=>{expect((await appeler()).status).toBe(200);expect(b.rpc).toHaveBeenCalledWith('log_document_access',{doc:'document',acces:'telechargement'});expect(b.signer).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({path:'organisation/piece.pdf',mode:'telechargement'}));expect(b.rpc.mock.invocationCallOrder.at(-1)).toBeLessThan(b.signer.mock.invocationCallOrder[0]);});
});

for(const termine of [true,false])it(`le lecteur distingue une archive confirmée (${termine}) du titre historique`,async()=>{
 b.doc!.type='bail';b.doc!.titre='Bail nu (généré, à faire signer) — à signer en ligne — signé';
 signature.lire.mockResolvedValue({erreur:false,circuits:[{etat:termine?'termine':'en_cours',document_signe:'document',document_id:'original'}]});
 await proprietaire(new NextRequest('https://gerimmo.example.invalid/document'),{params:Promise.resolve({orgId:'organisation',documentId:'document'})});
 expect(b.signer).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({titre:b.doc!.titre,libelle:termine?'Bail signé':undefined}));
});
it('n’annonce pas un bail signé quand la lecture du suivi échoue',async()=>{
 b.doc!.type='bail';signature.lire.mockResolvedValue({erreur:true,circuits:[]});
 await proprietaire(new NextRequest('https://gerimmo.example.invalid/document'),{params:Promise.resolve({orgId:'organisation',documentId:'document'})});
 expect(b.signer).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({libelle:undefined}));
});
