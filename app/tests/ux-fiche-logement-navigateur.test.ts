import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const root=resolve(__dirname,"..");
const chrome=[process.env.GERIMMO_CHROME,chromium.executablePath()].find(p=>p&&existsSync(p));
describe.skipIf(!chrome)("Fiche logement : cinq onglets sans perte de fonctions",()=>{
 let browser:Browser,context:BrowserContext,page:Page,script:string;
 const css=readFileSync(resolve(root,"src/components/onglets-dossier.module.css"),"utf8")+readFileSync(resolve(root,"src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/fiche-lot.module.css"),"utf8");
 const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dossier fictif</title><style>*{box-sizing:border-box}body{margin:0;color:#17364e;background:#f6f8fb;font:16px system-ui}main{padding:16px;max-width:960px;margin:auto}button,input{font:inherit;min-height:44px}a{display:inline-flex;align-items:center;min-height:44px;color:#17364e}h1{font-size:24px}label{display:block}input{display:block;max-width:100%}[hidden]{display:none!important}summary{min-height:44px;cursor:pointer}button{cursor:pointer}section{min-width:0}${css}</style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>`;
 beforeAll(async()=>{
  const bundle=await rolldown({input:resolve(root,"tests/fixtures/navigateur/banc-fiche-logement.tsx"),platform:"browser",plugins:[{name:"cadre-next",resolveId(id){if(id==="next/navigation")return "\0navigation";if(id.endsWith(".module.css"))return "\0css"},load(id){if(id==="\0navigation")return 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);';if(id==="\0css")return 'export default new Proxy({},{get:(_,k)=>k})';}}],resolve:{alias:{"@":resolve(root,"src")}},transform:{jsx:"react-jsx",define:{"process.env.NODE_ENV":JSON.stringify("development")}},logLevel:"silent"});
  try{script=(await bundle.generate({format:"iife"})).output[0].code}finally{await bundle.close()}
  browser=await chromium.launch({executablePath:chrome,args:["--no-sandbox"]});
 },120000);
 beforeEach(async()=>{context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();await page.route("http://localhost/**",r=>r.fulfill({contentType:r.request().url().endsWith("banc.js")?"text/javascript":"text/html",body:r.request().url().endsWith("banc.js")?script:html}))});
 afterEach(async()=>{await context.close()});afterAll(async()=>{await browser?.close()});
 it.each([390,1440])("%i px : cinq onglets visibles, un panneau à la fois, sans défilement horizontal",async width=>{
  await page.setViewportSize({width,height:1000});await page.goto("http://localhost/");
  for(const nom of ["Résumé","Location","Argent","Documents","Caractéristiques"]){
   await page.getByRole("tab",{name:nom,exact:true}).click();
   expect(await page.getByRole("tabpanel").count()).toBe(1);
   expect(await page.locator('[role="tabpanel"]').count()).toBe(5);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
   const rect=await page.getByRole("tab",{name:nom,exact:true}).boundingBox();expect(rect!.height).toBeGreaterThanOrEqual(44);expect(rect!.x+rect!.width).toBeLessThanOrEqual(width);
  }
 });
 it("les ancres ouvrent le bon onglet et les saisies survivent au changement",async()=>{
  await page.goto("http://localhost/#note");await page.getByLabel("Note du logement").fill("Pompe à chaleur");
  await page.getByRole("tab",{name:"Résumé",exact:true}).click();await page.getByRole("link",{name:"Compléter le logement"}).click();
  expect(await page.getByLabel("Note du logement").inputValue()).toBe("Pompe à chaleur");
  await page.getByRole("link",{name:"Voir le diagnostic"}).click();await page.getByRole("link",{name:"DPE original"}).waitFor();
  await page.reload();await page.getByRole("link",{name:"DPE original"}).waitFor();
 });
 it("un champ invalide révèle son onglet et ses détails sans enregistrer",async()=>{
  await page.goto("http://localhost/#note");await page.getByLabel("Note du logement").fill("");
  await page.getByText("Modifier le logement",{exact:true}).click();await page.getByRole("tab",{name:"Résumé",exact:true}).click();
  await page.getByRole("button",{name:"Enregistrer",exact:true}).click();
  expect(await page.getByLabel("Note du logement").isVisible()).toBe(true);
  expect(await page.getByLabel("Note du logement").evaluate(e=>e===document.activeElement)).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {envois?:number}).envois)).toBeUndefined();
 });
 it("le clavier atteint les cinq onglets et garde la sélection à l'actualisation",async()=>{
  await page.goto("http://localhost/");await page.getByRole("tab",{name:"Résumé",exact:true}).focus();await page.keyboard.press("ArrowRight");
  expect(await page.getByRole("tab",{name:"Location",exact:true}).getAttribute("aria-selected")).toBe("true");
  await page.keyboard.press("End");await page.reload();
  await expect.poll(()=>page.getByRole("tab",{name:"Caractéristiques",exact:true}).getAttribute("aria-selected")).toBe("true");
  await page.getByRole("tab",{name:"Caractéristiques",exact:true}).focus();await page.keyboard.press("Home");
  expect(await page.getByRole("tab",{name:"Résumé",exact:true}).getAttribute("aria-selected")).toBe("true");
 });
});
