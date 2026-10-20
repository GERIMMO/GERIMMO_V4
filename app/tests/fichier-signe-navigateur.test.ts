import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { servirFichierSigne } from "@/lib/fichier-signe";
afterEach(()=>vi.unstubAllEnvs());
describe.skipIf(process.env.GERIMMO_TEST_PDF!=="1")("Document volumineux dans le navigateur, stockage fictif",()=>{
 it("charge 6 Mo directement, garde l'URL du dossier et permet une reprise",async()=>{
  const fichier=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBe0AAAAASUVORK5CYII=','base64'),Buffer.alloc(6*1024*1024)]);
  let pdfOctets:Buffer=Buffer.alloc(0);
  let base='',premier=true,tailleReponse=0,lectures=0;
  const server=createServer(async(req,res)=>{
   if(['/document','/miniature','/pdf','/telechargement'].includes(req.url||'')){
    const db={storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:`${base}/${req.url==='/pdf'?'pdf-octets':'stockage'}?token=essai${req.url==='/telechargement'?'&download=1':''}`},error:null})})}} as unknown as SupabaseClient;
    const r=await servirFichierSigne(db,{path:'piece.png',mime:req.url==='/pdf'?'application/pdf':'image/png',titre:'Pièce fictive',retour:'depuis le dossier',apercuImage:req.url==='/miniature',mode:req.url==='/telechargement'?'telechargement':'consultation'});const texte=await r.text();tailleReponse=Buffer.byteLength(texte);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(texte);return;
   }
   if(req.url==='/liste'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<img alt=Miniature src=/miniature><a href=/telechargement>Télécharger</a>');return;}
   if(req.url?.startsWith('/pdf-octets')){res.writeHead(200,{'Content-Type':'application/pdf'});res.end(pdfOctets);return;}
   if(req.url?.startsWith('/stockage')){lectures++;if(premier){premier=false;res.writeHead(403);res.end('');return;}res.writeHead(200,{'Content-Type':'image/png','Content-Length':fichier.length,...(req.url.includes('download=1')?{'Content-Disposition':'attachment; filename=piece.png'}:{})});res.end(fichier);return;}
   res.writeHead(404);res.end('');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',base);
  const browser=await chromium.launch({headless:true,executablePath:process.env.GERIMMO_CHROME||undefined});
  try{
   const modele=await browser.newPage();await modele.setContent('<p style="break-after:page">Document fictif — page 1</p><p>Document fictif — page 2</p>');pdfOctets=await modele.pdf();await modele.close();
   const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(`${base}/document`);
   await page.getByRole('status').filter({hasText:'Appuyez sur Actualiser'}).waitFor();
   expect(await page.locator('body').innerText()).not.toContain('token=');
   await page.getByRole('button',{name:'Actualiser'}).click();
   await page.waitForFunction(()=>{const i=document.querySelector('#apercu img') as HTMLImageElement;return i?.complete&&i.naturalWidth===1;});
   expect(page.url()).toBe(`${base}/document`);expect(tailleReponse).toBeLessThan(10000);expect(lectures).toBe(2);
   const attendu=page.waitForEvent('download');await page.getByRole('link',{name:'Télécharger'}).click();const dl=await attendu;
   expect(dl.suggestedFilename()).toBe('Pièce fictive.png');const flux=await dl.createReadStream();let taille=0;for await(const octets of flux!)taille+=octets.length;expect(taille).toBe(fichier.length);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.goto(`${base}/liste`);await page.waitForFunction(()=>{const i=document.querySelector('img');return i?.complete&&i.naturalWidth===1;});
   const transfert=page.waitForEvent('download');await page.getByRole('link',{name:'Télécharger'}).click();const direct=await transfert;expect(direct.suggestedFilename()).toBe('piece.png');const directFlux=await direct.createReadStream();let directTaille=0;for await(const octets of directFlux!)directTaille+=octets.length;expect(directTaille).toBe(fichier.length);
   await page.goto(`${base}/pdf`);const ouvrir=page.getByRole('link',{name:'Ouvrir le PDF en plein écran'});await ouvrir.waitFor();
   expect(await ouvrir.getAttribute('href')).toMatch(/^blob:/);expect(await ouvrir.getAttribute('target')).toBe('_blank');expect(await page.locator('iframe').isVisible()).toBe(false);
   const pdfTelecharge=page.waitForEvent('download');await page.getByRole('link',{name:'Télécharger',exact:true}).click();const pdfFlux=await(await pdfTelecharge).createReadStream();let taillePdf=0;for await(const octets of pdfFlux!)taillePdf+=octets.length;expect(taillePdf).toBe(pdfOctets.length);
   await page.setViewportSize({width:1440,height:900});expect(await page.locator('iframe').isVisible()).toBe(true);

  } finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
 },30000);
});
