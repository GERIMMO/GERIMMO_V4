// Présentation uniquement : deux dépenses illustratives dans les dossiers de la démonstration.
import { chromium, expect } from "@playwright/test";
import { Client } from "pg";
const cible = new URL(process.env.SUPALOCAL_DB ?? "");
const site = new URL(process.env.E2E_BASE_URL ?? "");
if (cible.hostname !== "127.0.0.1" || cible.pathname !== "/gerimmo_ci_demo_vente_api" || site.origin !== "http://localhost:3610")
  throw new Error("Base et site de démonstration locaux obligatoires.");
const db = new Client({connectionString:cible.href});
await db.connect();
const navigateur = await chromium.launch();
try {
  const ctx = await navigateur.newContext({baseURL:site.origin,storageState:"e2e/.auth/proprietaire.json"});
  await ctx.route("**/*",route=>["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await ctx.addInitScript(()=>sessionStorage.setItem("gerimmo-synthese-alertes-vue","1"));
  const page = await ctx.newPage();
  const jour = new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Paris"});
  const {rows} = await db.query(`select b.organization_id,b.id bien,l.id lot,p.qualite,p.nom from biens b join lots l on l.bien_id=b.id
    join detentions d on d.lot_id=l.id join persons p on p.id=d.person_id
    where p.nom in ('SCI des Amandiers','Élise Morel') and exists (select from baux x join persons occupant on occupant.id=x.locataire_principal
      where x.lot_id=l.id and occupant.email in ('jeanne.martin@example.invalid','sam.riviere@example.invalid'))`);
  if (rows.length!==2 || new Set(rows.map(x=>x.organization_id)).size!==1) throw new Error("Les deux dossiers de présentation sont nécessaires.");
  for(const dossier of rows) {
    const sci=dossier.qualite==="SCI";
    const montant=sci?180:75;
    const fournisseur=sci?"Les Eaux du Parc":"Eau de la Vallée";
    const factures=async()=>(await db.query("select f.id,f.payee_le,f.document_id from factures_fourniture f join contrats_fourniture c on c.id=f.contrat_id where c.bien_id=$1 and f.total_cents=$2",[dossier.bien,montant*100])).rows;
    const base=`/espace/${dossier.organization_id}/parc/${dossier.bien}`;
    if (!(await factures()).length) {
      const papier=await navigateur.newPage();
      await papier.setContent(`<html lang="fr"><meta charset="utf-8"><style>@page{size:A4;margin:25mm}body{font:15px/1.6 system-ui;color:#18333b}h1{margin-top:65px;font:38px Georgia}header{border-bottom:2px solid #ad8c5b;padding-bottom:16px}table{border-collapse:collapse;width:100%;margin:35px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}footer{font-size:12px}</style><header>${fournisseur}</header><h1>Facture de fourniture d’eau</h1><p>Client : ${dossier.nom}<br>Date : ${jour}<br>Référence : EA-${jour}-${montant}</p><table><tr><th>Prestation</th><th>Montant TTC</th></tr><tr><td>Fourniture d’eau du logement</td><td>${montant},00 €</td></tr></table><footer>Dossier de démonstration · aucune somme à verser.</footer></html>`);
      const pdf=await papier.pdf({preferCSSPageSize:true});await papier.close();
      await page.goto(base+"?decompte=nouvelle&lot="+dossier.lot);
      await page.locator("input[name=document]").setInputFiles({name:"Facture-eau-"+jour+".pdf",mimeType:"application/pdf",buffer:pdf});
      await page.getByLabel("Fournisseur",{exact:true}).fill(fournisseur);
      await page.getByRole("combobox",{name:/^Nature/}).selectOption("eau");
      await page.getByLabel("Montant total",{exact:true}).fill(String(montant));
      await page.getByLabel("Début de la période",{exact:true}).fill(jour.slice(0,7)+"-01");
      await page.getByLabel("Fin de la période",{exact:true}).fill(jour);
      await page.getByRole("button",{name:"Enregistrer pour plus tard",exact:true}).click();
      await page.waitForURL(url=>!url.searchParams.has("decompte"));
    }
    const [facture]=await factures();
    if(!facture?.document_id)throw new Error("Justificatif manquant");
    if(!facture.payee_le) {
      await page.goto(base+"#consommations");
      const paiement=page.getByRole("button",{name:"Indiquer le paiement",exact:true}).first();
      const titres=await page.locator("button").filter({hasText:"Indiquer le paiement"}).first().evaluate(el=>{
        const liste=[]; for(let p=el.parentElement;p;p=p.parentElement) if(p.tagName==="DETAILS"&&!p.open) liste.unshift(p.querySelector(":scope > summary").textContent.trim());return liste;
      });
      for(const t of titres)await page.locator("summary").filter({hasText:t}).first().click();
      await paiement.click();
      const date=page.getByLabel("Payée le",{exact:true}).first();await date.fill(jour);
      await date.locator("xpath=ancestor::form").getByRole("button",{name:"Enregistrer",exact:true}).click();
      await expect.poll(async () => (await factures())[0]?.payee_le).toBeTruthy();
    }
    const {rows:[journal]}=await db.query(`select sum(e.montant)::numeric total, bool_and(e.lot_id=$2 and e.organization_id=$3 and p.document_id=$4) conforme
      from paiements_factures_fourniture p join ecritures_factures_fourniture ef on ef.paiement_id=p.id join ecritures e on e.id=ef.ecriture_id where p.facture_id=$1`,[facture.id,dossier.lot,dossier.organization_id,facture.document_id]);
    if(Number(journal.total)!==montant||!journal.conforme)throw new Error("La dépense ne se rapproche pas de son justificatif.");
    console.log(dossier.nom, montant, "euros rapprochés du justificatif.");
  }
} finally { await navigateur.close();await db.end(); }
