import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
const root=resolve(__dirname,"..");
const chrome=[process.env.GERIMMO_CHROME,chromium.executablePath()].find(p=>p&&existsSync(p));
describe.skipIf(!chrome)("Dossiers mobiles : une rubrique à la fois",()=>{
 let browser:Browser,context:BrowserContext,page:Page,script:string;
 const css=readFileSync(resolve(root,"src/components/onglets-dossier.module.css"),"utf8");
 const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dossier fictif</title><style>*{box-sizing:border-box}body{margin:0;color:#17364e;background:#f6f8fb;font:16px system-ui}main{padding:16px;max-width:960px;margin:auto}button,input{font:inherit;min-height:44px}a{display:inline-flex;align-items:center;min-height:44px;color:#17364e}h1{font-size:24px}label{display:block}input{display:block;max-width:100%}[hidden]{display:none!important}summary{min-height:44px;cursor:pointer}button{cursor:pointer}section{min-width:0}${css}</style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>`;
 beforeAll(async()=>{
  const bundle=await rolldown({input:resolve(root,"tests/fixtures/navigateur/banc-dossiers-mobiles.tsx"),platform:"browser",plugins:[{name:"cadre-next",resolveId(id){if(id==="next/navigation")return "\0navigation";if(id.endsWith(".module.css"))return "\0css"},load(id){if(id==="\0navigation")return 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);';if(id==="\0css")return 'export default new Proxy({},{get:(_,k)=>k})';}}],resolve:{alias:{"@":resolve(root,"src")}},transform:{jsx:"react-jsx",define:{"process.env.NODE_ENV":JSON.stringify("development")}},logLevel:"silent"});
  try{script=(await bundle.generate({format:"iife"})).output[0].code}finally{await bundle.close()}
  browser=await chromium.launch({executablePath:chrome,args:["--no-sandbox"]});
 },120000);
 beforeEach(async()=>{context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();await page.route("http://localhost/**",r=>r.fulfill({contentType:r.request().url().endsWith("banc.js")?"text/javascript":"text/html",body:r.request().url().endsWith("banc.js")?script:html}))});
 afterEach(async()=>{await context.close()});afterAll(async()=>{await browser?.close()});
 it("les onglets ne masquent pas les liens profonds et les saisies survivent aux changements",async()=>{
  await page.goto("http://localhost/#note");await page.getByLabel("Note du logement").fill("Pompe à chaleur");
  await page.getByRole("tab",{name:"Résumé",exact:true}).click();
  expect(await page.getByLabel("Note du logement").isVisible()).toBe(false);
  await page.getByRole("link",{name:"Compléter le logement"}).click();
  expect(await page.getByLabel("Note du logement").inputValue()).toBe("Pompe à chaleur");
  await page.getByRole("button",{name:"Caractéristiques"}).click();
  await page.getByRole("link",{name:"Compléter le logement"}).click();
  await expect.poll(()=>page.getByLabel("Note du logement").isVisible()).toBe(true);
 });
 it("un lien vers un document ouvre son onglet et les détails parents, même après repli",async()=>{
  await page.goto("http://localhost/#preuve");await page.getByRole("link",{name:"Rapport original"}).waitFor();
  await page.getByText("Rapports",{exact:true}).click();await page.getByRole("link",{name:"Voir la preuve"}).click();
  await expect.poll(()=>page.getByRole("link",{name:"Rapport original"}).isVisible()).toBe(true);
 });
 it("le clavier parcourt les onglets avec flèches et Home/End",async()=>{
  await page.goto("http://localhost/");await page.getByRole("tab",{name:"Résumé",exact:true}).focus();await page.keyboard.press("ArrowRight");
  expect(await page.getByRole("tab",{name:"Logement",exact:true}).getAttribute("aria-selected")).toBe("true");
  await page.keyboard.press("End");expect(await page.getByRole("tab",{name:"Contrats",exact:true}).getAttribute("aria-selected")).toBe("true");
  await page.keyboard.press("Home");expect(await page.getByRole("tab",{name:"Résumé",exact:true}).getAttribute("aria-selected")).toBe("true");
 });
 it("une erreur de validation révèle le champ replié sans envoyer le formulaire",async()=>{
  await page.goto("http://localhost/#note");await page.getByLabel("Note du logement").fill("");
  await page.getByRole("button",{name:"Caractéristiques"}).click();await page.getByRole("tab",{name:"Résumé",exact:true}).click();
  await page.getByRole("button",{name:"Enregistrer le logement"}).click();
  expect(await page.getByLabel("Note du logement").isVisible()).toBe(true);
  expect(await page.getByLabel("Note du logement").evaluate(e=>e===document.activeElement)).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {__envois?:number}).__envois)).toBeUndefined();
 });
 it("chaque rubrique reste accessible sans débordement à 320, 390 et 1440 px",async()=>{
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:844});await page.goto("http://localhost/");
   for(const nom of ["Résumé","Logement","Documents","Contrats"]){
    await page.getByRole("tab",{name:nom,exact:true}).click();
    expect(await page.getByRole("tabpanel").count()).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
   }
  }
 },45000);
});
