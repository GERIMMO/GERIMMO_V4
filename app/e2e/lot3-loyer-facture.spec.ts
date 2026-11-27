import { ouvrirSuiviLoyers } from "./aides";
import { baseApiFictive } from './local/base-api-fictive';
import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { connecterVers, sansSyntheseAlertes, debordementHorizontal } from "./aides";


async function ouvrirDemandes(page: Page) {
  await ouvrirSuiviLoyers(page);
}
for (const sci of [false,true]) test(`propriétaire : loyer confirmé et dépôt de facture conservé (${sci?'SCI':'nom propre'})`,async({page,browser},info)=>{
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
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-365)",[ORG,lot,bailleur]);
    const autreTitulaire=randomUUID(), autreLot=randomUUID(), autreBien=randomUUID();
    if (sci) await db.query("update persons set nom='SCI des Amandiers',prenom=null,qualite='SCI',siren='123456789' where id=$1",[bailleur]);
    await db.query("insert into persons(id,organization_id,nom,qualite) values($1,$2,$3,$4)",[autreTitulaire,ORG,sci?"Élise Morel":"SCI des Amandiers",sci?"Personne physique":"SCI"]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'Maison du Parc','maison','5 rue du Parc','75012','Paris')",[autreBien,ORG]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,'Maison du Parc','brouillon')",[autreLot,ORG,autreBien]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,current_date-365)",[ORG,autreLot,autreTitulaire]);
    await db.query("insert into ecritures(organization_id,lot_id,categorie,sens,montant,date_piece,date_imputation,libelle) values($1,$2,'travaux','depense',75,current_date,current_date,'Entretien de la maison du Parc')",[ORG,autreLot]);
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
    const {rows:[facture]}=await db.query('select f.id,f.document_id,f.payee_le from factures_fourniture f join contrats_fourniture c on c.id=f.contrat_id where c.bien_id=$1',[bien]);
    expect(facture.payee_le).toBeNull();
    await page.goto(`/espace/${ORG}/parc/${bien}#consommations`);
    const payer=page.getByRole('button',{name:'Indiquer le paiement',exact:true}).first();
    // La fiche du bien regroupe les commandes de la facture dans un détail natif.
    const parents=await page.locator('button').filter({hasText:'Indiquer le paiement'}).first().evaluate(el=>{
      const titres:string[]=[];let parent=el.parentElement;
      while(parent){if(parent.tagName==='DETAILS' && !parent.hasAttribute('open')) titres.unshift(parent.querySelector(':scope > summary')?.textContent?.trim()??'');parent=parent.parentElement;}
      return titres;
    });
    for (const titre of parents) await page.locator('summary').filter({hasText:titre}).first().click();
    await payer.click();
    const date=page.getByLabel('Payée le',{exact:true}).first();
    await date.fill('2026-10-31');
    await date.locator('xpath=ancestor::form').getByRole('button',{name:'Enregistrer',exact:true}).click();
    const journal = async () => (await db.query("select e.lot_id,p.document_id,e.organization_id,e.sens,e.montant from ecritures e join ecritures_factures_fourniture ef on ef.ecriture_id=e.id join paiements_factures_fourniture p on p.id=ef.paiement_id where p.facture_id=$1",[facture.id])).rows;
    await expect.poll(async()=>(await journal()).reduce((t,l)=>t+Number(l.montant),0)).toBe(180);
    expect((await journal()).every(l=>l.lot_id===lot && l.document_id===facture.document_id && l.organization_id===ORG && l.sens==='depense')).toBe(true);
    const justificatif=await page.request.get(`/espace/${ORG}/documents/${facture.document_id}/fichier`);
    expect(justificatif.status()).toBe(200);
    await page.goto(`/espace/${ORG}/loyers`);
    await page.getByRole("link", {name:"Bilan de l’année",exact:true}).click();
    const detail=page.locator("details").filter({has:page.locator("summary").filter({hasText:"Détail par propriétaire et SCI"})}).last();
    await detail.locator("summary").first().click();
    const compteDu=(nom:string)=>detail.locator("details").filter({has:page.locator("summary").filter({hasText:nom})});
    const principal=compteDu(sci?"SCI des Amandiers":"Exemple");
    const autre=compteDu(sci?"Élise Morel":"SCI des Amandiers");
    await principal.locator("summary").click();
    await expect(principal).toContainText("180,00");
    await expect(principal).not.toContainText("75,00");
    await autre.locator("summary").click();
    await expect(autre).toContainText("75,00");
    await expect(autre).not.toContainText("180,00");
    await page.screenshot({path:info.outputPath("finances-par-titulaire.png"),fullPage:true});
    if (sci) {
      // Le règlement de la facture (31 octobre) précède la détention établie.
      await db.query("update detentions set date_debut='2026-11-01' where lot_id=$1 and person_id=$2", [lot, bailleur]);
      await page.goto(`/espace/${ORG}/loyers?annee=2026&entite=${bailleur}`);
      await page.getByRole("link", {name:"Bilan de l’année",exact:true}).click();
      const operations = page.getByRole("region", { name: "Bilan de l’année" });
      const depenses = operations.getByText("Dépenses", { exact: true }).locator("..");
      await expect(depenses).toContainText("0,00");
      const aRattacher = operations.getByRole("region", { name: /opération.*à rattacher/ });
      await expect(aRattacher).toContainText("180,00");
      await aRattacher.locator("summary").click();
      await expect(aRattacher.getByRole("listitem").filter({ hasText: "180,00" })).toBeVisible();
      await expect(operations).not.toContainText("Entretien de la maison du Parc");
      expect(await debordementHorizontal(page)).toBe(0);
    }
  } finally {await db.end();}
});

test("une échéance de 640 € après cession apparaît uniquement chez le titulaire à la date du loyer", async ({page}) => {
  const url=process.env.SUPALOCAL_DB;
  baseApiFictive(url);
  const db=new Client({connectionString:url});
  await db.connect();
  const [org,compte,part,sci,bien,lot,loc,bail,appel]=Array.from({length:9},()=>randomUUID());
  const pass=randomUUID(), mail="mutation-"+compte+"@example.invalid";
  try {
    await db.query('begin');
    await db.query("insert into organizations(id,name,type,status,essai_fin,address_line1,postal_code,city) values($1,'Parc des Ormes','proprietaire_direct','essai',current_date+14,'2 rue des Ormes','69000','Lyon')",[org]);
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{}','{}')",[compte,mail,pass]);
    await db.query("insert into memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')",[org,compte]);
    await db.query("insert into persons(id,organization_id,nom,prenom,qualite) values($1,$4,'Martin','André','Personne physique'),($2,$4,'SCI Les Ormes',null,'SCI'),($3,$4,'Lefèvre','Alice','Personne physique')",[part,sci,loc,org]);
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'Résidence des Ormes','appartement','2 rue des Ormes','69000','Lyon')",[bien,org]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,'Appartement sur cour','loue')",[lot,org,bien]);
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut,date_fin) values($1,$2,$3,100,'2026-01-01','2026-06-30'),($1,$2,$4,100,'2026-07-01',null)",[org,lot,part,sci]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif','2026-10-01',600,40,5)",[bail,org,lot,loc]);
    await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$2,$3,'2026-11-01','2026-11-05',600,40,640)",[appel,org,bail]);
    await db.query('commit');

    const destination="/espace/"+org+"/loyers";
    await connecterVers(page,mail,pass,destination);
    async function ouvrir(titulaire:string) {
      await page.goto(destination+"?annee=2026&mois=11&entite="+titulaire);
      const section=page.locator("#loyers");
      await expect(section.getByRole("heading",{name:"Loyers et charges"})).toBeVisible();
      return section;
    }
    const ancienne=await ouvrir(part);
    await expect(ancienne.locator("dl")).toContainText(/Attendu\s*0,00/);
    await expect(ancienne.locator("summary").filter({hasText:/^Voir les? loyers? de/})).toHaveCount(0);
    const actuelle=await ouvrir(sci);
    await expect(actuelle.locator('dl[aria-label="Montants des échéances"]').first()).toContainText(/Attendu\s*640,00/);
    await expect(actuelle.locator('dl[aria-label="Montants des échéances"]').first()).toContainText(/Reste dû\s*640,00/);
    expect((await db.query("select count(*)::int n from encaissements where bail_id=$1",[bail])).rows[0].n).toBe(0);
  } finally { await db.end(); }
});
