import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({acces:vi.fn(),service:vi.fn(),config:vi.fn(),assembler:vi.fn(),stop:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/ged-acces',()=>({verifierGerant:m.acces}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:m.service}));
vi.mock('@/lib/signature-bail',async importer=>({...await importer<typeof import('@/lib/signature-bail')>(),configurationSignatureBail:m.config}));
vi.mock('@/lib/signature-document',async importer=>({...await importer<typeof import('@/lib/signature-document')>(),assemblerSignatureDocument:m.assembler}));
vi.mock('@/lib/controle-effets',()=>({verifierAvantEffet:m.stop}));
import { envoyerSignatureBail } from '@/app/actions/signature-bail';
let compteur=0;
let circuit:Record<string,unknown>;
let misesAJour:Record<string,unknown>[];
let effacements:string[];
let filtres:unknown[][];
let retraitImpossible=false;
let abandon: ReturnType<typeof vi.fn<() => Promise<{data:boolean|null;error:{message:string}|null}>>>;
const octets='%PDF-fictif';
const mail=['personne','exemple.invalid'].join('@');
const demande=()=>envoyerSignatureBail('organisation','bail','circuit');
beforeEach(()=>{
 vi.clearAllMocks();misesAJour=[];effacements=[];filtres=[];retraitImpossible=false;
 circuit={id:'circuit',organization_id:'organisation',bail_id:'bail',modele:'bail',prestataire:'zoho',etat:'pret',environnement:'production',empreinte:'actuelle',pdf_hash:createHash('sha256').update(octets).digest('hex'),document_id:'document',expire_le:new Date(Date.now()+29*86400000).toISOString(),external_request_id:null,annexes:[],signataires:[{prenom:'Personne',nom:'Fictive',email:mail,telephone:'+33600000001'}]};
 m.config.mockReturnValue({prestataire:'zoho',environnement:'production',clientId:`local-${++compteur}`,clientSecret:'fictif',refreshToken:'fictif'});
 m.assembler.mockResolvedValue({manquants:[],empreinte:'actuelle',titreGed:'Document fictif'});
 abandon=vi.fn(async()=>retraitImpossible?{data:null,error:{message:'indisponible'}}:{data:true,error:null});
 // reserver_envoi_signature_bail rend la ligne réservée : ses signataires partent chez le prestataire (relecture du 24/10).
 const rpc=vi.fn(async(nom:string)=>nom==='abandonner_preparation_signature'?abandon():nom==='reserver_envoi_signature_bail'?{data:{...circuit,etat:'preparation'},error:null}:{data:true,error:null});
 const db={rpc,storage:{from:()=>({download:async()=>({data:new Blob([octets]),error:null})})},from:(table:string)=>{
  let update:Record<string,unknown>|undefined;
  const result=()=>({data:retraitImpossible&&update?.etat==='annule'?null:update?{id:'circuit'}:table==='bail_signature_circuits'?circuit:{storage_path:'org/fictif.pdf',mime_type:'application/pdf'},error:null});
  const q={select:()=>q,eq:(...args:unknown[])=>{filtres.push(args);return q;},is:(...args:unknown[])=>{filtres.push(args);return q;},in:()=>q,update:(value:Record<string,unknown>)=>{update=value;misesAJour.push(value);return q;},delete:()=>{effacements.push(table);return q;},single:async()=>result(),then:(resolve:(r:ReturnType<typeof result>)=>unknown)=>Promise.resolve(result()).then(resolve)};return q;
 }};
 m.service.mockReturnValue(db);m.acces.mockResolvedValue({supabase:db,user:{id:'proprietaire'}});
});
afterEach(()=>vi.unstubAllGlobals());
function api(requete:(url:string)=>Promise<Response>){const f=vi.fn(requete);vi.stubGlobal('fetch',f);return f;}
function liberee(){expect(abandon).toHaveBeenCalledTimes(1);expect(misesAJour).not.toContainEqual(expect.objectContaining({etat:'a_verifier'}));expect(effacements).toEqual([]);}
function incertaine(){expect(abandon).not.toHaveBeenCalled();expect(misesAJour).toContainEqual(expect.objectContaining({etat:'a_verifier'}));expect(effacements).toEqual([]);}
describe('Préparation de signature : frontière avant création distante',()=>{
 it('libère un refus de connexion OAuth sans créer de demande',async()=>{const f=api(async()=>Response.json({error:'invalid_grant'},{status:400}));expect((await demande()).erreur).toContain('réautorisée');expect(f).toHaveBeenCalledTimes(1);expect(String(f.mock.calls[0][0])).toContain('/oauth/');liberee();});
 it('libère une panne réseau pendant la seule connexion OAuth',async()=>{const f=api(async()=>{throw new Error('Connexion indisponible');});expect((await demande()).erreur).toContain('indisponible');expect(f).toHaveBeenCalledTimes(1);liberee();});
 it('libère un refus local de coordonnées sans appeler Zoho',async()=>{circuit.signataires=[{prenom:'Personne',nom:'Fictive',email:mail,telephone:'incomplet'}];const f=api(async()=>{throw new Error('inattendu');});expect((await demande()).erreur).toContain('téléphone');expect(f).not.toHaveBeenCalled();liberee();});
 it('libère une expiration invalide sans appeler Zoho',async()=>{circuit.expire_le=new Date(Date.now()+45*86400000).toISOString();const f=api(async()=>{throw new Error('inattendu');});expect((await demande()).erreur).toContain('renouvelée');expect(f).not.toHaveBeenCalled();liberee();});
 it.each(['coupure','refus','illisible'])('conserve la réservation après une création dont la réponse est %s',async mode=>{const f=api(async url=>{if(url.includes('/oauth/'))return Response.json({access_token:'fictif',expires_in:3600});if(mode==='coupure')throw new Error('Réponse perdue');return mode==='illisible'?new Response('incomplet'):Response.json({code:999,status:'failure'},{status:400});});expect((await demande()).erreur).toContain('ne créez pas une deuxième');expect(f).toHaveBeenCalledTimes(2);incertaine();});
 it('conserve la référence d’un brouillon créé mais incomplet',async()=>{const f=api(async url=>url.includes('/oauth/')?Response.json({access_token:'fictif',expires_in:3600}):Response.json({code:0,requests:{request_id:'12345',request_status:'draft',actions:[],document_ids:[]}}));expect((await demande()).erreur).toContain('ne créez pas une deuxième');expect(f).toHaveBeenCalledTimes(2);expect(misesAJour).toContainEqual({external_request_id:'12345'});incertaine();});
 it('signale une libération non confirmée sans contourner la transaction',async()=>{retraitImpossible=true;api(async()=>Response.json({error:'invalid_grant'},{status:400}));expect((await demande()).erreur).toContain('ne créez pas une deuxième');expect(effacements).toEqual([]);expect(misesAJour).toContainEqual(expect.objectContaining({etat:'a_verifier'}));});
});
