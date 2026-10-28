import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { rolldown } from "rolldown";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHAMPS_EDITEUR } from "../src/lib/identite-editeur";

const root = resolve(__dirname, "..");
const chrome = [process.env.GERIMMO_CHROME, chromium.executablePath()].find(p => p && existsSync(p));
describe.skipIf(!chrome)("Console simplifiée : saisies, liens et clavier", () => {
  let browser: Browser, context: BrowserContext, page: Page, script: string;
  const erreurs: string[] = [];
  const css = readFileSync(resolve(root, "src/components/console-section.module.css"), "utf8").replaceAll(/:global\(([^)]+)\)/g, "$1");
  const prestige = readFileSync(resolve(root, "src/app/prestige.css"), "utf8");
  // Audit final (UX-16) : les couleurs de marque (--or, --marque, --encre…) ne sont plus redéclarées par prestige.css,
  // seulement sur le :root de globals.css — la page réelle charge les deux feuilles ; le banc reprend ce bloc de jetons.
  const jetons = /:root \{\n  \/\* -{10}[\s\S]*?\n\}/.exec(readFileSync(resolve(root, "src/app/globals.css"), "utf8"))?.[0] ?? "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paramètres — aperçu fictif</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:#1b3049;font:15px system-ui}main{max-width:1040px;margin:auto;padding:24px}h1{font:32px Georgia;margin:8px 0 26px}h2{margin:0}button,input,textarea{font:inherit}a{color:#174c8a}.champ{display:block;width:100%;padding:10px;border:1px solid #b5c4d4;border-radius:7px;background:white;color:#1b3049;margin-top:5px}label{display:block}.grid{display:grid}.gap-4{gap:16px}.btn-or,.btn-secondaire{display:inline-block;border:1px solid #244969;border-radius:8px;min-height:44px;padding:12px;background:#244969;color:white;cursor:pointer}.my-4{margin:16px 0}.mt-3{margin-top:12px}.text-muted-foreground{color:#536576}.titre-ecran{display:flex;gap:12px;align-items:baseline}.titre-ecran-icone{color:#645384}.err{color:#992e20}:root{--encre:#1b3049;--texte-secondaire:#536576;--filet:#dce3eb;--carte:#fff}@media(min-width:640px){.sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}${css}
    ${jetons}${prestige}</style></head><body class="gerimmo-prestige"><div id="racine"></div><script charset="utf-8" src="/banc.js"></script></body></html>`;
  beforeAll(async () => {
    const bundle = await rolldown({input:resolve(root,"tests/fixtures/navigateur/banc-console-simple.tsx"),platform:"browser",
      plugins:[{name:"actions-isolees",resolveId(id){
        if(id==="@/app/actions/identite-editeur")return "\0action";
        if(id==="@/lib/use-action-state-protegee")return "\0hook";
        if(id.endsWith(".module.css"))return "\0style";
      },load(id){
        if(id==="\0action")return 'export async function enregistrerIdentite(previous,form){window.__form=Object.fromEntries(form);return {erreur:"Le réglage a changé. Relisez-le avant de recommencer."}}';
        if(id==="\0hook")return 'export {useActionState as useActionStateProtegee} from "react";';
        if(id==="\0style")return 'export default new Proxy({},{get:(_,k)=>k})';
      }}],resolve:{alias:{"@":resolve(root,"src")}},transform:{jsx:"react-jsx",define:{"process.env.NODE_ENV":JSON.stringify("development")}},logLevel:"silent"});
    try{script=(await bundle.generate({format:"iife"})).output[0].code}finally{await bundle.close()}
    if(process.env.GERIMMO_APERCU_CONSOLE){const out=resolve(root,"tmp/console-preview");mkdirSync(out,{recursive:true});writeFileSync(resolve(out,"index.html"),html);writeFileSync(resolve(out,"banc.js"),script)}
    browser=await chromium.launch({executablePath:chrome,args:["--no-sandbox"]});
  },120_000);
  beforeEach(async()=>{erreurs.length=0;context=await browser.newContext({viewport:{width:390,height:844},locale:"fr-FR"});page=await context.newPage();page.on("pageerror",e=>erreurs.push(e.message));await page.route("http://localhost/**",r=>r.fulfill({contentType:r.request().url().endsWith("banc.js")?"text/javascript":"text/html",body:r.request().url().endsWith("banc.js")?script:html}))});
  afterEach(async()=>{await context.close();expect(erreurs).toEqual([])});afterAll(async()=>{await browser?.close()});
  it("les liens profonds ouvrent tous les parents, à l'arrivée puis au clic",async()=>{
    await page.goto("http://localhost/#preuve");await page.getByText("Archive fictive relue").waitFor();
    expect(await page.locator("details[open]").count()).toBe(2);
    await page.getByText("Historique",{exact:true}).click();expect(await page.getByText("Archive fictive relue").isVisible()).toBe(false);
    await page.getByRole("link",{name:"Ouvrir une preuve"}).click();
    // Le lien peut cibler le même fragment après repli : il doit rouvrir aussi.
    await page.getByText("Archive fictive relue").waitFor({state:"visible",timeout:3000});
  });
  it("une erreur native révèle le champ replié et ne soumet rien",async()=>{
    await page.goto("http://localhost/");await page.getByRole("button",{name:"Enregistrer le réglage"}).click();
    expect(await page.getByLabel("Raison du changement").isVisible()).toBe(true);
    expect(await page.getByLabel("Raison du changement").evaluate(e=>e===document.activeElement)).toBe(true);
    expect(await page.evaluate(()=>(window as unknown as {__envois?:number}).__envois)).toBeUndefined();
  });
  it("une navigation interne qui conserve les rubriques révèle le journal ciblé",async()=>{
    await page.goto("http://localhost/");
    await page.getByRole("button",{name:"Afficher la page suivante du journal"}).click();
    await expect.poll(()=>page.getByText("Page du journal : 2",{exact:true}).isVisible()).toBe(true);
    expect(await page.locator("details[open]").count()).toBe(2);
  });
  it("replier puis enregistrer conserve tous les champs, la révision et les valeurs après refus",async()=>{
    await page.goto("http://localhost/?vue=identite");await page.getByLabel("E-mail de contact").fill("nouveau@example.invalid");
    await page.getByText("Contact et entreprise",{exact:true}).click();
    await page.getByRole("button",{name:"Enregistrer les modifications"}).click();await page.getByRole("alert").waitFor();
    const f=await page.evaluate(()=>(window as unknown as {__form:Record<string,string>}).__form);
    expect(f.email).toBe("nouveau@example.invalid");expect(f.revision).toBe("12");expect(f.coordonneesSupabase).toBe("Prestataire fictif conservé");
    expect(Object.keys(f).sort()).toEqual([...Object.keys(CHAMPS_EDITEUR),"revision"].sort());
    await page.getByText("Contact et entreprise",{exact:true}).click();expect(await page.getByLabel("E-mail de contact").inputValue()).toBe("nouveau@example.invalid");
  });
  it("les rubriques fonctionnent au clavier, sans débordement ni violation axe sur mobile et ordinateur",async()=>{
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:900});await page.goto("http://localhost/?vue=identite");
      const resume=page.locator("summary").filter({hasText:"Médiateur de la consommation"});await resume.focus();await page.keyboard.press("Enter");
      expect(await page.locator('[name="mediateurNom"]').isVisible()).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      if(process.env.GERIMMO_APERCU_CONSOLE)await page.screenshot({path:resolve(root,`tmp/console-preview/parametres-${width}.png`),fullPage:true});
    }
  });
  it("la charte réelle garde les titres compacts et place les statuts sous le texte sur mobile",async()=>{
    await page.goto("http://localhost/");
    const titre=page.getByRole("heading",{name:"Historique",exact:true});
    expect(await titre.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(18);
    const description=await page.getByText("Retrouver les événements.",{exact:true}).boundingBox();
    const statut=await page.getByText("Vérification des archives à terminer",{exact:true}).boundingBox();
    expect(description).not.toBeNull();expect(statut).not.toBeNull();
    expect(statut!.y).toBeGreaterThanOrEqual(description!.y+description!.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  });
});
