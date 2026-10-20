import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { servirFichierSigne } from "@/lib/fichier-signe";
afterEach(()=>vi.unstubAllEnvs());
function client(url="https://stockage.example.invalid/storage/v1/object/sign/documents/fichier?token=fictif") {
 vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://stockage.example.invalid");
 const createSignedUrl=vi.fn(async()=>({data:{signedUrl:url},error:null}));
 const db={storage:{from:vi.fn(()=>({createSignedUrl}))}} as unknown as SupabaseClient;
 return {db,createSignedUrl};
}
const options={path:"organisation/document.pdf",mime:"application/pdf",titre:"Document relu",retour:"depuis les documents"};
describe("Lecture directe de pièces privées",()=>{
 it.each(['documents','artisan-prive','devis-preparations'] as const)('utilise le compartiment autorisé %s',async(compartiment)=>{const {db}=client();expect((await servirFichierSigne(db,{...options,compartiment})).status).toBe(200);expect(db.storage.from).toHaveBeenCalledWith(compartiment);});
 it('refuse un compartiment non prévu avant de signer',async()=>{const {db,createSignedUrl}=client();expect((await servirFichierSigne(db,{...options,compartiment:'inconnu' as 'documents'})).status).toBe(502);expect(createSignedUrl).not.toHaveBeenCalled();});
 it('refuse une empreinte incorrecte avant de signer',async()=>{const {db,createSignedUrl}=client();expect((await servirFichierSigne(db,{...options,sha256:'incorrect'})).status).toBe(502);expect(createSignedUrl).not.toHaveBeenCalled();});
 it('vérifie les octets même pour un téléchargement demandé',async()=>{const {db}=client();const r=await servirFichierSigne(db,{...options,mode:'telechargement',sha256:'a'.repeat(64)});expect(r.status).toBe(200);expect(r.headers.get('Location')).toBeNull();expect(await r.text()).toContain("crypto.subtle.digest('SHA-256'");});
 it("ne renvoie que la visionneuse et signe pour une minute",async()=>{const {db,createSignedUrl}=client();const r=await servirFichierSigne(db,options);expect(r.status).toBe(200);expect(createSignedUrl).toHaveBeenCalledWith(options.path,60,undefined);const texte=await r.text();expect(Buffer.byteLength(texte)).toBeLessThan(10000);expect(texte).toContain('URL.createObjectURL');expect(texte).toContain("credentials:'omit'");expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');expect(r.headers.get('Content-Security-Policy')).toContain("script-src 'nonce-");expect(r.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline');});
 it("le téléchargement ne fait pas transiter le contenu par la fonction",async()=>{const {db,createSignedUrl}=client();const r=await servirFichierSigne(db,{...options,mode:'telechargement'});expect(r.status).toBe(303);expect(await r.text()).toBe('');expect(createSignedUrl).toHaveBeenCalledWith(options.path,60,{download:'Document relu.pdf'});});
 it("une vignette reçoit les pixels depuis Storage plutôt qu'une page HTML",async()=>{const {db,createSignedUrl}=client();const r=await servirFichierSigne(db,{...options,mime:'image/png',apercuImage:true});expect(r.status).toBe(303);expect(await r.text()).toBe('');expect(createSignedUrl).toHaveBeenCalledWith(options.path,60,undefined);});
 it.each(['text/html','image/svg+xml','__proto__','toString'])('force le téléchargement pour %s',async(mime)=>{const {db,createSignedUrl}=client();const r=await servirFichierSigne(db,{...options,mime});expect(r.status).toBe(303);expect(createSignedUrl).toHaveBeenCalledWith(options.path,60,{download:'Document relu.bin'});});
 it("échappe le titre et ne peut fermer le script par les données",async()=>{const {db}=client();const r=await servirFichierSigne(db,{...options,titre:'</script><script>alert(1)</script>'});const h=await r.text();expect(h).not.toContain('<script>alert(1)');expect(h).toContain('\\u003c');expect(h.match(/<script nonce=/g)).toHaveLength(1);});
 it.each(['javascript:alert(1)','https://autre.example.invalid/fichier','http://stockage.example.invalid/fichier','https://compte:secret'+'@'+'stockage.example.invalid/fichier'])('refuse une destination non prévue : %s',async(url)=>{const {db}=client(url);expect((await servirFichierSigne(db,options)).status).toBe(502);});
 it("un stockage indisponible donne une réponse compréhensible sans révéler son erreur",async()=>{const {db,createSignedUrl}=client();createSignedUrl.mockRejectedValue(Error('diagnostic confidentiel'));const r=await servirFichierSigne(db,options);expect(r.status).toBe(502);expect(await r.text()).not.toContain('confidentiel');});
});
