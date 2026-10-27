import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
import {resoudreDepotsFormulaire,limiteFichierDepose,reserverDepotDirect} from '@/lib/depot-direct';
import {PREFIXE_DEPOT} from '@/lib/depot-direct-commun';
const id='22222222-2222-4222-8222-222222222222',compte='33333333-3333-4333-8333-333333333333';
function base(modif:Record<string,unknown>={},source?:Uint8Array){
 const octets=source??new TextEncoder().encode('%PDF-1.7\nfictif\n%%EOF');
 const d={id,compte_id:compte,nom:'Essai.pdf',mime:'application/pdf',taille:octets.length,empreinte:createHash('sha256').update(octets).digest('hex'),chemin:`${compte}/${id}`,expire_le:new Date(Date.now()+3600000).toISOString(),...modif};
 const download=vi.fn(async()=>({data:new Blob([new Uint8Array(octets)])}));
 const signed=vi.fn(async()=>({data:{path:d.chemin,token:'fictif'}}));
 // gt/order/limit/maybeSingle : recherche d’une réservation à reprendre (DOC-13), aucune ici.
 const insert=vi.fn(()=>q);const q={select:()=>q,eq:()=>q,gt:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:null}),insert,single:async()=>({data:d})};
 const auth=vi.fn(async()=>({data:{user:{id:compte}},error:null}));
 const db={auth:{getUser:auth},from:vi.fn(()=>q),storage:{from:vi.fn(()=>({download,createSignedUploadUrl:signed}))}};
 return {db:db as unknown as SupabaseClient,d,auth,download,signed,insert};
}
function form(){const f=new FormData();f.set('fichier',PREFIXE_DEPOT+id);f.set('titre','À conserver');return f;}
describe('Réception des fichiers directs',()=>{
 it('contrôle puis reconstitue le fichier sans perdre les autres champs',async()=>{const b=base(),f=form();expect(await resoudreDepotsFormulaire(b.db,f)).toBeNull();expect(f.get('fichier')).toBeInstanceOf(File);expect((f.get('fichier') as File).name).toBe('Essai.pdf');expect(limiteFichierDepose(f.get('fichier') as File)).toBe(10485760);expect(f.get('titre')).toBe('À conserver');});
 it('autorise réellement un PDF de 6 Mo via transit',async()=>{const data=new Uint8Array(6*1024*1024);data.set(new TextEncoder().encode('%PDF-'));data.set(new TextEncoder().encode('%%EOF'),data.length-5);const b=base({},data),f=form();expect(await resoudreDepotsFormulaire(b.db,f)).toBeNull();expect((f.get('fichier') as File).size).toBe(data.length);});
 it.each([{compte_id:'autre'},{chemin:'autre/fichier'},{expire_le:'invalide'},{expire_le:'2020-01-01'},{taille:20*1024*1024}])('refuse avant téléchargement %j',async modif=>{const b=base(modif),f=form();expect(await resoudreDepotsFormulaire(b.db,f)).toMatch(/expiré|accessible/);expect(b.download).not.toHaveBeenCalled();expect(f.get('fichier')).toBe(PREFIXE_DEPOT+id);});
 it.each([{empreinte:'b'.repeat(64)},{mime:'image/png'},{taille:50}])('refuse le contenu modifié %j',async modif=>{const b=base(modif),f=form();expect(await resoudreDepotsFormulaire(b.db,f)).not.toBeNull();expect(f.get('fichier')).toBe(PREFIXE_DEPOT+id);});
 it('refuse un PDF tronqué même avec une empreinte exacte',async()=>{const b=base({},new TextEncoder().encode('%PDF-1.7 coupé')),f=form();expect(await resoudreDepotsFormulaire(b.db,f)).toContain('contenu');});
 it('refuse une référence mal formée',async()=>{const b=base(),f=form();f.set('fichier',PREFIXE_DEPOT+'../../ailleurs');expect(await resoudreDepotsFormulaire(b.db,f)).toContain('Référence');expect(b.download).not.toHaveBeenCalled();});
 it('garde la limite de transport pour un fichier classique',async()=>{const b=base(),f=new FormData(),file=new File(['test'],'test.pdf');f.set('fichier',file);expect(await resoudreDepotsFormulaire(b.db,f)).toBeNull();expect(limiteFichierDepose(f.get('fichier') as File)).toBe(4194304);expect(b.auth).not.toHaveBeenCalled();});
 it('borne le nombre avant tout accès',async()=>{const b=base(),f=form();for(let n=0;n<10;n++)f.append('autres',PREFIXE_DEPOT+id);expect(await resoudreDepotsFormulaire(b.db,f)).toContain('dix');expect(b.auth).not.toHaveBeenCalled();});
 it('ne transmet pas les colonnes injectées dans la description',async()=>{const b=base();const description={nom:'Essai.pdf',mime:'application/pdf',taille:100,empreinte:'a'.repeat(64),compte_id:'autre',expire_le:'2099-01-01'};expect(await reserverDepotDirect(b.db,description)).toMatchObject({id});expect(b.insert).toHaveBeenCalledWith({nom:description.nom,mime:description.mime,taille:100,empreinte:description.empreinte});expect(b.signed).toHaveBeenCalledWith(`${compte}/${id}`,{upsert:false});});
});
