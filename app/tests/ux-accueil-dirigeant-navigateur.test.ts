import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const root=resolve(__dirname,".."),out=process.env.GERIMMO_UX8_CAPTURES;
describe("Accueil dirigeant — navigateur isolé",()=>{
 let browser:Browser,script:string;
 const css=readFileSync(resolve(root,"src/app/admin/brief/aujourdhui.module.css"),"utf8");
 const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aujourd’hui — test isolé</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#18314c;font:14px system-ui}:root{--encre:#18314c;--texte-secondaire:#5d6f81;--filet:#dce3eb;--filet-leger:#edf0f3;--font-interface:system-ui}main{max-width:1160px;margin:auto;padding:24px 18px}h1{font:36px Georgia;margin:12px 0 24px}h2,h3,p{margin:0}a{color:inherit;text-decoration:none}button{font:inherit;border:0;cursor:pointer}ol{list-style:none;margin:0;padding:0}.banc-note{font-size:11px;color:#735f3c}${css}</style></head><body><div id="racine"></div><script src="/banc.js"></script></body></html>`;
 beforeAll(async()=>{
  const bundle=await rolldown({input:resolve(root,"tests/fixtures/navigateur/banc-accueil-dirigeant.tsx"),platform:"browser",plugins:[{name:"lecture-isolee",resolveId(id){if(id==="next/link")return "\0lien";if(id.endsWith(".module.css"))return "\0css";},load(id){if(id==="\0lien")return 'import React from "react";export default function Link(p){return React.createElement("a",p)}';if(id==="\0css")return 'export default new Proxy({},{get:(_,k)=>k})';}}],resolve:{alias:{"@":resolve(root,"src")}},transform:{jsx:"react-jsx",define:{"process.env.NODE_ENV":JSON.stringify("development")}},logLevel:"silent"});
  try{script=(await bundle.generate({format:"iife"})).output[0].code;}finally{await bundle.close();}
  browser=await chromium.launch();if(out)mkdirSync(out,{recursive:true});
 },30000);
 afterAll(async()=>{await browser?.close();});
 it.each(["calme","erreur","alertes"])("%s : compteurs, message et commandes à 390 et 1440 px",async etat=>{
  for(const width of [390,1440]){const c:BrowserContext=await browser.newContext({viewport:{width,height:1000}}),p:Page=await c.newPage();const erreurs:string[]=[];p.on("pageerror",e=>erreurs.push(e.message));
   try{await p.route("**/*",r=>r.request().url().startsWith("http://localhost/")?r.fulfill({contentType:r.request().url().endsWith("banc.js")?"text/javascript":"text/html",body:r.request().url().endsWith("banc.js")?script:html}):r.abort());await p.goto(`http://localhost/?etat=${etat}`);await p.locator('[data-indicateur="clients"]').waitFor();
    expect(await p.locator('[data-indicateur]').count()).toBe(6);
    if(etat==="calme"){expect(await p.locator('[data-indicateur] strong').allTextContents()).toEqual(["2","1","1","0","0","0"]);expect(await p.getByText("Aucune décision en attente.",{exact:false}).isVisible()).toBe(true);expect(await p.locator('li').count()).toBe(0);}
    if(etat==="erreur"){expect(await p.locator('[data-indicateur] strong').allTextContents()).toEqual(Array(6).fill("À vérifier"));expect(await p.getByText("L’état du service reste à vérifier").isVisible()).toBe(true);expect(await p.getByText("Impossible de confirmer l’absence de demandes.").isVisible()).toBe(true);}
    if(etat==="alertes"){await p.getByRole("button",{name:"Ouvrir les alertes"}).click();expect(await p.getByRole("status").innerText()).toBe("Fenêtre d’alertes demandée");}
    expect(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);expect(erreurs).toEqual([]);
    if(out)await p.screenshot({path:resolve(out,`apres-${etat}-${width}.png`),fullPage:true});
   }finally{await c.close();}}
 });
});
