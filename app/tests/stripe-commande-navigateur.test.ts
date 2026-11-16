import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as attendre } from "node:timers/promises";
import { chromium, type Browser } from "playwright";
import { Client } from "pg";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect } from "vitest";
import { archiverConditionsPubliees } from "@/lib/conditions-versions-serveur";
import { CONDITIONS_VERSION } from "@/lib/editeur";

const mode = process.env.GERIMMO_RECETTE_COMMANDE;
const site = "http://127.0.0.1:3483";
const api = "http://127.0.0.1:54183";
const org = "3c1d1e95-3570-400b-8012-44530be145b1";
const courriel = "proprietaire@example.com";

function jwtDuBanc() {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const texte = enc({alg:"HS256",typ:"JWT"})+"."+enc({role:"service_role",exp:Math.floor(Date.now()/1000)+900});
  return texte+"."+createHmac("sha256","gerimmo-local-secret").update(texte).digest("base64url");
}

async function disponible(url: string, processus: ChildProcess) {
  for (let i=0; i<100; i++) {
    if (processus.exitCode !== null) throw Error("Un des deux services du banc a quitté.");
    if (await fetch(url,{signal:AbortSignal.timeout(1500)}).then(r=>r.ok,()=>false)) return;
    await attendre(300);
  }
  throw Error("Le service local de la recette n’a pas répondu.");
}

const editeur = {
  denomination: "Éditeur fictif de la recette", forme:"SAS", siege:"1 rue Exemple, 75000 Paris",
  rcs:"RCS Paris 000 000 000", siret:"00000000000000", directeurPublication:"Direction fictive",
  email:"editeur@example.com", telephone:"01 00 00 00 00", mediateurNom:"Médiateur de recette",
  mediateurAdresse:"2 rue Exemple, 75000 Paris", mediateurSite:"https://example.test/mediation",
};

// Le CI ordinaire n’a ni clé Stripe, ni accès au banc. Le mode « local » vérifie jusqu'au dernier
// bouton avant Stripe. Le workflow dédié impose « stripe-test » et doit aussi atteindre Checkout.
describe.skipIf(!mode)("Commande volontaire depuis l’espace Gerimmo",()=>{
  it("refuse une archive absente ou périmée, enregistre les deux accords et vérifie le choix mensuel et annuel",async()=>{
    if(mode!=="local" && mode!=="stripe-test") throw Error("Mode de recette inconnu.");
    const cle=process.env.GERIMMO_STRIPE_TEST_KEY;
    if(mode==="stripe-test" && !/^(sk|rk)_test_/.test(cle??"")) throw Error("La clé Stripe TEST est obligatoire.");
    const dbUrl=new URL(process.env.SUPABASE_DB_URL??"");
    if(!["postgres:","postgresql:"].includes(dbUrl.protocol)||dbUrl.hostname!=="127.0.0.1"||
      !["/gerimmo_ci_stripe","/gerimmo_ci_stripe_navigateur"].includes(dbUrl.pathname)) throw Error("Base de recette locale dédiée obligatoire.");
    dbUrl.pathname+="_api";
    const serviceKey=jwtDuBanc();
    const db=new Client({connectionString:dbUrl.href});
    const service=createClient(api,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const stripe=mode==="stripe-test"?new Stripe(cle!, {maxNetworkRetries:1,timeout:20000}):null;
    const environnement={NODE_ENV:"test" as const,PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR};
    const processus: ChildProcess[]=[];
    let browser:Browser|undefined;
    let customer:string|undefined;
    await db.connect();
    try {
      const avant=await db.query("select stripe_customer_id from public.abonnements where organization_id=$1", [org]);
      expect(avant.rows.some(r=>r.stripe_customer_id)).toBe(false);
      const initiales=await db.query("select 1 from public.intentions_souscription where organization_id=$1",[org]);
      expect(initiales.rowCount).toBe(0);
      // Ce libellé de siège distinct rend le contrôle de cohérence négatif même au rejeu sur
      // une archive identique encore présente. Aucun texte précédemment accepté n’est modifié.
      await db.query("update public.supervision_identite set valeurs=$1 where singleton",[{...editeur,siege:"Ancien siège fictif du scénario"}]);
      const emu=spawn(process.execPath,["e2e/local/serveur-supabase-local.mjs"],{env:{...environnement,SUPALOCAL_DB:dbUrl.href,
        SUPALOCAL_PORT:"54183",SUPALOCAL_STORAGE:await mkdtemp(join(tmpdir(),"gerimmo-commande-test-"))},stdio:"ignore"});
      processus.push(emu);
      await disponible(api+"/health",emu);
      const app=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3483"],{env:{
        ...environnement,NODE_ENV:"test",GERIMMO_MODE:"simulation",NEXT_TELEMETRY_DISABLED:"1",
        NEXT_PUBLIC_SITE_URL:site,NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"cle-locale",
        SUPABASE_SERVICE_ROLE_KEY:serviceKey,STRIPE_SECRET_KEY:stripe?cle:"sk_test_factice_locale_aucun_clic_stripe",
        STRIPE_WEBHOOK_SECRET:"whsec_simulation_locale",
      },stdio:"ignore"});
      processus.push(app);
      await disponible(site+"/connexion",app);
      browser=await chromium.launch();
      const page=await browser.newPage();
      await page.route("**/*",route=>{
        const u=new URL(route.request().url());
        if(u.origin===site||u.origin===api) return route.continue();
        // Seule la navigation initiale GET vers la page TEST créée est autorisée. Aucune saisie
        // de carte, ressource de suivi, soumission de formulaire, ni automatisation du défi 3DS.
        return stripe && route.request().method()==="GET" && route.request().isNavigationRequest() &&
          u.origin==="https://checkout.stripe.com" && /^\/c\/pay\/cs_test_[A-Za-z0-9]+$/.test(u.pathname) ? route.continue():route.abort();
      });
      await page.goto(site+"/connexion");
      await page.locator("#email").fill(courriel);
      await page.locator("#mot-de-passe").fill("Gerimmo-Demo-2026");
      await page.getByRole("button",{name:"Se connecter",exact:true}).click();
      await page.waitForURL(u=>u.origin===site && u.pathname!=="/connexion");
      const abonnement=site+"/espace/"+org+"/abonnement";
      await page.goto(abonnement);
      await page.getByText(/en attente de la vérification de la version archivée/i).first().waitFor();
      expect((await db.query("select 1 from public.intentions_souscription where organization_id=$1",[org])).rowCount).toBe(0);
      await db.query("update public.supervision_identite set valeurs=$1 where singleton",[editeur]);
      const archives=await archiverConditionsPubliees({service, site, adressesRelais:[], envoyer: async()=>{throw Error("Envoi externe interdit");}});
      const archive=archives.find(a=>a.document==="conditions_clients");
      expect(archive?.message).toBeDefined();
      expect(["archivee","deja_archivee"]).toContain(archive?.statut);
      const urlArchive=site+"/conditions/versions/conditions_clients/"+encodeURIComponent(CONDITIONS_VERSION);
      const archivePublique=await fetch(urlArchive);
      expect(archivePublique.ok).toBe(true);
      expect((await archivePublique.text()).includes(editeur.mediateurNom)).toBe(true);
      if(stripe){
        const client=await stripe.customers.create({name:"Recette fictive Gerimmo",metadata:{organization_id:org,banc:randomUUID()}});
        customer=client.id;
        expect(client.livemode).toBe(false);
        const {error}=await service.rpc("abonnement_client_pose",{p_org:org,p_customer:customer});
        expect(error?.code).toBeUndefined();
      }
      for (const periodicite of ["mensuel","annuel"] as const) {
        await page.goto(abonnement);
        await page.getByText(editeur.mediateurNom,{exact:false}).first().waitFor();
        const consentement=page.getByRole("checkbox",{name:/J’ai lu et j’accepte la version du/});
        if(await consentement.isVisible()){
          await consentement.check();
          await page.getByText(/des conditions générales est enregistrée/).waitFor();
        }
        if(periodicite==="annuel") await page.locator("label",{hasText:"2 mois offerts"}).first().click();
        const payer=page.getByRole("button",{name:/Continuer vers le paiement sécurisé/});
        expect(await payer.isEnabled()).toBe(false);
        const confirmation=page.getByLabel(/J'ai vérifié le montant de/);
        await confirmation.check();
        expect(await payer.isEnabled()).toBe(true);
        const cents=Number(await page.locator('[name="montant_attendu_cents"]').inputValue());
        expect(cents).toBeGreaterThan(0);
        const accepte=await db.query("select c.id from public.acceptations_cgu c join public.accounts a on a.id=c.account_id where a.email=$1 and c.document='conditions_clients' and c.version=$2",[courriel,CONDITIONS_VERSION]);
        expect(accepte.rows.length).toBeGreaterThan(0);
        if(!stripe || !customer) continue;
        const navigation=page.waitForResponse(r=>r.request().isNavigationRequest()&&new URL(r.url()).origin==="https://checkout.stripe.com",{timeout:45000});
        // Ne jamais inclure de lien Checkout dans un message d’échec ou un artefact.
        const [http]=await Promise.all([navigation,payer.click({noWaitAfter:true})]);
        expect(http.ok()).toBe(true);
        const commandes=await db.query(`select i.stripe_session_id, i.id, l.details from public.intentions_souscription i
          join public.audit_log l on l.organization_id=i.organization_id and l.details->>'commande'=i.id::text
          where i.organization_id=$1 and i.statut='en_cours' and l.action='abonnement_commande_confirmee'`,[org]);
        expect(commandes.rowCount).toBe(1);
        const commande=commandes.rows[0];
        const s=await stripe.checkout.sessions.retrieve(commande.stripe_session_id);
        expect(s.url!==null && new URL(http.url()).pathname===new URL(s.url).pathname).toBe(true);
        expect([s.livemode,s.mode,s.status,s.customer===customer,s.client_reference_id===org,
          s.metadata?.gerimmo_intention===commande.id]).toEqual([false,"subscription","open",true,true,true]);
        expect(commande.details.conditions_acceptees).toBe(CONDITIONS_VERSION);
        expect(accepte.rows.some(a=>a.id===commande.details.acceptation)).toBe(true);
        expect(Number(commande.details.montant_cents)).toBe(cents);
        expect(commande.details.periodicite).toBe(periodicite);
        const lignes=await stripe.checkout.sessions.listLineItems(s.id);
        expect(lignes.data.reduce((somme,l)=>somme+(l.quantity??0)*(l.price?.unit_amount??0),0)).toBe(cents);
        expect(lignes.data.every(l=>l.currency==="eur" && l.price?.recurring?.interval===(periodicite==="annuel"?"year":"month"))).toBe(true);
      }
    } finally {
      try {
        await browser?.close();
        if (stripe && customer) {
          const sessions=await stripe.checkout.sessions.list({customer,limit:10});
          for (const s of sessions.data) if(!s.livemode && s.status==="open") await stripe.checkout.sessions.expire(s.id);
          await stripe.customers.del(customer);
        }
      } finally {
        for (const proc of processus.reverse()) proc.kill("SIGTERM");
        await db.end();
      }
    }
  },180000);
});
