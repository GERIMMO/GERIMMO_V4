import { baseApiFictive } from './local/base-api-fictive';
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { connecterVers, sansSyntheseAlertes, debordementHorizontal } from "./aides";


const demandes = (page: Page) => page.getByRole("region", { name: "Votre patrimoine en bref" })
  .getByRole("button", { name: /^(?:\d+ actions? prioritaires?|\d+ loyers? à confirmer|À vérifier) / });
const fenetreDemandes = (page: Page) => page.getByRole("dialog", { name: /^(?:À traiter en priorité|Loyers à confirmer|À vérifier)$/ });
async function ouvrirDemandes(page: Page, facultatif = false) {
  // L'absence d'un rappel doit être contrôlée dans la fenêtre si d'autres demandes
  // existent, pas simplement dans une fenêtre encore fermée après le rechargement.
  await expect(page.getByRole("region", { name: "Votre patrimoine en bref" })).toBeVisible();
  const bouton = demandes(page);
  if (facultatif && await bouton.count() === 0) return;
  await bouton.click();
  await expect(fenetreDemandes(page)).toBeVisible();
}
test('propriétaire : loyer confirmé et dépôt de facture conservé',async({page,browser},info)=>{
 const largeur=info.project.use.viewport?.width??1440;
 const url=process.env.SUPALOCAL_DB;baseApiFictive(url);
  const db=new Client({connectionString:url});await db.connect();
  const [ORG,bien,lot,personne,bailleur,bail,appel,futur]=Array.from({length:8},()=>randomUUID());
  const compte = randomUUID();
  const email = `confirmation-${compte}@example.invalid`;
  const motDePasse = randomUUID();
  const nom=`TEST Réception ${largeur} ${lot.slice(0,6)}`;
  try{
    await db.query("begin");
    // Un patrimoine fictif complet permet de confirmer sa dernière échéance sans toucher aux loyers de démonstration.
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,$2,'proprietaire_direct','essai',current_date+14,'2 rue de recette','75001','Paris')",[ORG,nom]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')",[compte,email,motDePasse]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')",[ORG,compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,address_line1,postal_code,city) values($1,$2,'Exemple','Jo','2 rue de recette','75001','Paris')",[bailleur,ORG]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')",[bien,ORG,nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')",[lot,ORG,bien,nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'Fictif','Camille','locataire@example.invalid')",[personne,ORG]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part) values($1,$2,$3,100)",[ORG,lot,bailleur]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-40,750,50,5)",[bail,ORG,lot,personne]);
    await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$3,$4,date_trunc('month',public.aujourdhui_paris()),public.aujourdhui_paris(),750,50,800),($2,$3,$4,date_trunc('month',public.aujourdhui_paris())+interval '1 month',public.aujourdhui_paris()+30,750,50,800)",[appel,futur,ORG,bail]);
    await db.query("commit");

    await db.query("update organizations set email_contact=$2 where id=$1",[ORG,email]);
    await sansSyntheseAlertes(page);await connecterVers(page,email,motDePasse,`/espace/${ORG}`);await ouvrirDemandes(page);
    const ligne=page.getByRole("region",{name:"Avez-vous reçu vos loyers ?"}).locator("li").filter({has:page.getByRole("link",{name:nom,exact:true})});
    await ligne.getByRole("button",{name:"J’ai reçu le loyer",exact:true}).click();await ligne.getByRole("button",{name:"Confirmer et envoyer la quittance",exact:true}).click();
    await expect(ligne).toHaveAttribute("data-reception","regle");await expect(ligne).toContainText("Paiement inscrit dans vos comptes.");
    expect((await db.query("select sum(montant)::float montant from encaissements where bail_id=$1",[bail])).rows[0].montant).toBe(800);
    await page.screenshot({path:info.outputPath('loyer-confirme.png'),fullPage:true});
    await page.goto(`/espace/${ORG}/parc/${bien}?decompte=nouvelle&lot=${lot}`);
    const pdfPage=await browser.newPage();await pdfPage.setContent('<h1>FACTURE FICTIVE — recette Lot 3</h1><p>Eau — 180 euros — octobre 2026 — aucun paiement réel.</p>');const pdf=await pdfPage.pdf();await pdfPage.close();
    await page.screenshot({path:info.outputPath('avant-depot.png'),fullPage:true});
    await page.locator('input[name="document"]').setInputFiles({name:'facture-fictive-lot3.pdf',mimeType:'application/pdf',buffer:pdf});
    await page.getByLabel('Fournisseur',{exact:true}).fill('Eau Fictive');await page.getByRole('combobox',{name:/^Nature/}).selectOption('eau');await page.getByLabel('Montant total',{exact:true}).fill('180');
    await page.getByLabel('Début de la période',{exact:true}).fill('2026-10-01');await page.getByLabel('Fin de la période',{exact:true}).fill('2026-10-31');
    await page.getByRole('button',{name:'Enregistrer pour plus tard',exact:true}).click();
    await expect.poll(async()=>Number((await db.query('select count(*) n from factures_fourniture f join contrats_fourniture c on c.id=f.contrat_id where c.bien_id=$1',[bien])).rows[0].n)).toBe(1);
    await expect(page).not.toHaveURL(/decompte=nouvelle/);expect(await debordementHorizontal(page)).toBe(0);await page.screenshot({path:info.outputPath('facture-deposee.png'),fullPage:true});
  } finally {await db.end();}
});
