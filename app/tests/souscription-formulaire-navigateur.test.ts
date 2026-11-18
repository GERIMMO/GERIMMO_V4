import { resolve } from "node:path";
import { chromium, expect as voir, type Browser } from "@playwright/test";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Complète abonnement.spec.ts (ventes fermées) et les tests serveur
// abonnement-souscription-et-hausse-stripe.test.ts. Aucun fournisseur réel.
// Pas de skip : la CI installe Chromium avant les tests.
describe("souscription TEST : vrai formulaire et clic vers le paiement simulé", () => {
  let browser: Browser;
  let script: string;
  beforeAll(async () => {
    const root = resolve(__dirname, "..");
    const bundle = await rolldown({
      input: resolve(root, "tests/fixtures/navigateur/banc-souscription.tsx"), platform: "browser",
      plugins: [{ name: "frontiere-serveur-fictive", resolveId(id) {
        if (id === "@/app/actions/abonnement") return "\0action";
        if (id === "@/app/actions/depot-direct") return "\0depot";
        if (id === "next/link") return "\0lien";
        if (id === "next/navigation") return "\0navigation";
        if (id.endsWith(".module.css")) return "\0css";
      }, load(id) {
        if (id === "\0action") return `
          export async function accepterConditionsGenerales(){
            const r=await fetch('/test/conditions',{method:'POST'}); return r.json();
          }
          export async function demarrerAbonnement(org,etat,form){
            const r=await fetch('/test/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({org,...Object.fromEntries(form)})});
            const data=await r.json(); location.assign(data.url); return {};
          }`;
        if (id === "\0depot") return 'export function preparerDepotDirect(){throw Error("Aucun dépôt dans ce scénario")}' ;
        if (id === "\0lien") return 'import React from "react";export default function Link({prefetch,...p}){return React.createElement("a",p)}';
        if (id === "\0navigation") return 'export const unstable_rethrow=e=>{throw e};';
        if (id === "\0css") return 'export default new Proxy({},{get:(_,k)=>k})';
      } }],
      resolve: { alias: { "@": resolve(root, "src") } },
      transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" } }, logLevel: "silent",
    });
    try { script = (await bundle.generate({ format: "iife" })).output[0].code; }
    finally { await bundle.close(); }
    browser = await chromium.launch({ executablePath: process.env.GERIMMO_CHROME || undefined });
  }, 120_000);
  afterAll(async () => { await browser?.close(); });

  for (const [periode, montant, cents] of [["Mensuel", "7,98", "798"], ["Annuel", "79,80", "7980"]]) {
    it(`${periode} : conditions, montant confirmé, un seul envoi et aucune alerte de sortie`, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR" });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(5_000);
        const demandes: unknown[] = [], dialogues: string[] = [], erreurs: string[] = [];
        let acceptations = 0;
        page.on("dialog", async d => { dialogues.push(d.type()); await d.dismiss(); });
        page.on("pageerror", e => erreurs.push(e.message));
        await page.route("**/*", async route => {
          const url = new URL(route.request().url());
          expect(url.hostname).toBe("localhost"); // Aucun accès extérieur, même accidentel.
          if (url.pathname === "/banc.js") return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: script });
          if (url.pathname === "/test/conditions") { acceptations++; return route.fulfill({ json: { succes: true } }); }
          if (url.pathname === "/test/checkout") {
            demandes.push(route.request().postDataJSON());
            return route.fulfill({ json: { url: "http://localhost/paiement-simule" } });
          }
          return route.fulfill({ contentType: "text/html; charset=utf-8", body: url.pathname === "/paiement-simule"
            ? "<h1>Paiement simulé</h1>" : '<div id="racine"></div><script src="/banc.js"></script>' });
        });
        await page.goto("http://localhost/espace/org-fictive/abonnement");
        await page.getByRole("radio", { name: new RegExp(`^${periode}`) }).check();
        const recap = page.getByRole("region", { name: "Récapitulatif avant paiement", exact: true });
        await voir(recap).toContainText(montant);
        await voir(recap).toContainText("Total à payer");
        if (periode === "Annuel") await voir(recap).toContainText("prélevés en une fois pour douze mois");
        const continuer = page.getByRole("button", { name: "Continuer vers le paiement sécurisé", exact: true });
        await voir(continuer).toBeDisabled();
        await page.getByRole("checkbox", { name: /J’ai lu et j’accepte/ }).check();
        await voir(page.getByRole("status")).toContainText("acceptation");
        await voir(continuer).toBeDisabled();
        await page.getByLabel(/J'ai vérifié le montant de/).check();
        await voir(continuer).toBeEnabled();
        await continuer.click();
        await voir(page.getByRole("heading", { name: "Paiement simulé" })).toBeVisible();
        expect(acceptations).toBe(1);
        expect(demandes).toEqual([expect.objectContaining({ org: "org-fictive", periodicite: periode.toLowerCase(), montant_attendu_cents: cents, confirmation: "oui" })]);
        expect(dialogues).toEqual([]);
        expect(erreurs).toEqual([]);
      } finally { await context.close(); }
    });
  }
});
