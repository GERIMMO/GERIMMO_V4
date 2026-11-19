import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GROUPES_SUPERVISION, RUBRIQUES } from "../src/lib/rubriques-supervision";
const root=resolve(__dirname,".."),out=process.env.GERIMMO_UX8B_CAPTURES;
describe("Console dirigeant : navigation et suivi compréhensible",()=>{
 let browser:Browser,script:string;
 const css=readFileSync(resolve(root,"src/app/admin/console-direction.module.css"),"utf8");
 const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#18314c;font:14px system-ui}main,body>p{padding:16px}h1{font:30px Georgia}a{color:inherit}p{line-height:1.6}button,input{min-height:44px;max-width:100%}nav{padding:12px;background:#fff}summary{cursor:pointer}summary:focus-visible{outline:2px solid #bd9856}.admin-nav-lien{display:flex;gap:12px;padding:12px;text-decoration:none}.coquille-badge{margin-left:auto}dt{font-weight:bold}dd{overflow-wrap:anywhere}:root{--encre:#18314c;--texte-secondaire:#5d6f81;--filet:#dce3eb}@media(min-width:901px){nav.admin-nav{background:#18314c;color:#fff}}${css}</style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>`;
 beforeAll(async()=>{
  const bundle=await rolldown({input:resolve(root,"tests/fixtures/navigateur/banc-console-direction.tsx"),platform:"browser",plugins:[{name:"navigation-isolee",resolveId(id){if(id==="next/link")return "\0lien";if(id==="next/navigation")return "\0navigation";if(id.endsWith(".module.css"))return "\0css";},load(id){if(id==="\0lien")return 'import React from "react";export default function Link({prefetch,...p}){return React.createElement("a",p)}';if(id==="\0navigation")return 'export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}';if(id==="\0css")return 'export default new Proxy({},{get:(_,k)=>k})';}}],resolve:{alias:{"@":resolve(root,"src")}},transform:{jsx:"react-jsx",define:{"process.env.NODE_ENV":JSON.stringify("development")}},logLevel:"silent"});
  try{script=(await bundle.generate({format:"iife"})).output[0].code;}finally{await bundle.close();}
  browser=await chromium.launch();if(out)mkdirSync(out,{recursive:true});
 },30000);
 afterAll(async()=>{await browser?.close();});
 it.each(["normal","degrade","erreur"])("%s : compteurs, alertes, détails et filtres à 390 et 1440 px",async etat=>{
  for(const width of [390,1440]){const c=await browser.newContext({viewport:{width,height:1000}}),p=await c.newPage();p.setDefaultTimeout(5000);const erreurs:string[]=[];p.on("pageerror",e=>erreurs.push(e.message));
   try{await p.route("**/*",r=>r.request().url().startsWith("http://localhost/")?r.fulfill({contentType:r.request().url().endsWith("banc.js")?"text/javascript":"text/html",body:r.request().url().endsWith("banc.js")?script:html}):r.abort());await p.goto(`http://localhost/admin/brief?etat=${etat}`);await p.getByRole("heading",{name:"Santé et automatismes"}).waitFor();
    const nav=p.getByRole("navigation",{name:"Navigation de la supervision"});
    expect(await nav.locator("details").count()).toBe(5);
    for(const groupe of GROUPES_SUPERVISION){const d=nav.locator("details").filter({has:p.locator("summary").filter({hasText:groupe.libelle})});if(!await d.evaluate(e=>(e as HTMLDetailsElement).open))await d.locator("summary").click();for(const cle of groupe.cles){const r=RUBRIQUES.find(r=>r.cle===cle)!;expect(await d.locator(`a[href="${r.href}"]`).isVisible()).toBe(true);}}
    expect(await nav.locator('a[href^="/admin"]').count()).toBe(17);
    if(etat==="normal"){expect(await p.getByText("Aucun courriel bloqué dans les résultats consultés.",{exact:true}).isVisible()).toBe(true);}
    if(etat==="degrade"){
     expect(await p.getByText("2 courriels bloqués ou à vérifier dans les résultats consultés.",{exact:true}).isVisible()).toBe(true);
     await p.getByText("Courriels — 2 à suivre",{exact:true}).click();
     expect(await p.getByText("Ne pas renvoyer sans preuve du prestataire.",{exact:true}).isVisible()).toBe(true);
     expect(await p.getByText("courriel-fictif-1",{exact:true}).isVisible()).toBe(false);
     const detail=p.locator('#traitements-durables details').filter({has:p.getByText("courriel-fictif-1",{exact:true})}).last();await detail.locator('summary').focus();await p.keyboard.press('Enter');
     expect(await p.getByText("courriel-fictif-1",{exact:true}).isVisible()).toBe(true);expect(await p.getByText("Réponse du prestataire perdue",{exact:true}).isVisible()).toBe(true);
    }
    if(etat==="erreur"){expect(await p.getByRole("alert").count()).toBe(2);expect(await p.getByText("Aucun courriel bloqué dans les résultats consultés.",{exact:true}).count()).toBe(0);expect(await nav.getByText("À vérifier",{exact:true}).count()).toBeGreaterThan(0);}
    await p.getByRole("button",{name:/À vérifier/}).click();expect(await p.getByRole("heading",{name:"Abonnements",exact:true}).isVisible()).toBe(true);expect(await p.getByRole("heading",{name:"Quittances",exact:true}).count()).toBe(0);
    await p.getByRole("button",{name:/Indisponibles/}).click();expect(await p.getByRole("heading",{name:"Sauvegarde",exact:true}).isVisible()).toBe(true);
    await p.getByRole("searchbox").fill("introuvable");await p.getByRole("button",{name:"Effacer les filtres"}).click();expect(await p.getByRole("heading",{name:"Quittances",exact:true}).isVisible()).toBe(true);
    expect(await p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth))).toBe(0);expect(erreurs).toEqual([]);
    if(out)await p.screenshot({path:resolve(out,`etat-${etat}-${width}.png`),fullPage:true});
   }finally{await c.close();}}
 });
});
