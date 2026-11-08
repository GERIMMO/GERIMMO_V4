import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { connecterVers, sansSyntheseAlertes, debordementHorizontal } from "./aides";
import AxeBuilder from "@axe-core/playwright";

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
for(const largeur of [390,1440]) test(`réception du loyer à ${largeur}px : échéance, pas reçu, partiel puis solde`,async({page},info)=>{
  test.setTimeout(180000);
  const url=process.env.SUPALOCAL_DB;
  const demoIsolee = process.env.E2E_BASE_URL === "http://localhost:3568" && url === "postgresql://postgres@127.0.0.1:55449/gerimmo_ci_investisseur_mois";
  test.skip(!demoIsolee && (!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url)),"Base API locale fictive requise");
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
    await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$3,$4,date_trunc('month',public.aujourdhui_paris()),public.aujourdhui_paris()+1,750,50,800),($2,$3,$4,date_trunc('month',public.aujourdhui_paris())+interval '1 month',public.aujourdhui_paris()+30,750,50,800)",[appel,futur,ORG,bail]);
    await db.query("commit");
    await page.setViewportSize({width:largeur,height:950});await sansSyntheseAlertes(page);
    await connecterVers(page,email,motDePasse,`/espace/${ORG}`);
    const bloc=page.getByRole("region",{name:"Avez-vous reçu vos loyers ?"});
    const ligne=bloc.locator("li").filter({has:page.getByRole("link",{name:nom,exact:true})});
    await ouvrirDemandes(page, true);
    await expect(ligne).toHaveCount(0);
    // Le jour prévu est arrivé : la même échéance entre dans le tableau de bord.
    await db.query("update appels_loyer set date_echeance=public.aujourdhui_paris() where id=$1",[appel]);await page.reload();
    await expect(ligne).toHaveCount(0);
    await expect(demandes(page)).toContainText("Échéance du loyer");
    await ouvrirDemandes(page);
    await expect(bloc).toBeVisible();await expect(ligne).toBeVisible();await expect(ligne).toContainText(nom);await expect(ligne).toContainText("800,00");
    expect(await debordementHorizontal(page)).toBe(0);
    const violations=(await new AxeBuilder({page}).include('[aria-labelledby="reception-loyers-titre"]').analyze()).violations;
    expect(violations).toEqual([]);
    await page.screenshot({path:info.outputPath(`reception-${largeur}.png`),fullPage:true});
    await expect(ligne.getByText("Gérer la première relance",{exact:true})).toHaveCount(0);
    await expect(bloc.getByText(/La première relance sera disponible au délai prévu/)).toBeVisible();
    await expect(ligne.getByRole("button",{name:"Envoyer la première relance par e-mail",exact:true})).toHaveCount(0);
    await ligne.getByRole("button",{name:"Pas encore reçu",exact:true}).click();await ligne.getByRole("button",{name:"Confirmer : pas encore reçu",exact:true}).click();
    await expect(ligne.getByText(/Pas encore reçu · signalé le/)).toBeVisible();
    await expect(ligne).toHaveAttribute("data-reception","non_recu");
    const carteLoyer=page.getByRole("region",{name:"Votre patrimoine en bref"}).getByRole("button",{name:/loyer[s]? à confirmer/});
    const vieillir=async(jours:number)=>{
      await db.query("update appels_loyer set date_echeance=date_echeance-$2::int where id=$1",[appel,jours]);
      await db.query("update receptions_loyers_signalees set signale_le=signale_le-($2::int * interval '1 day') where appel_id=$1",[appel,jours]);
      await db.query("update relances set date_envoi=date_envoi-$2::int where bail_id=$1",[bail,jours]);
      await page.reload();
    };
    await page.reload(); await expect(carteLoyer).toHaveCount(0);
    await vieillir(4); await expect(carteLoyer).toHaveCount(0);
    await vieillir(1); await expect(carteLoyer).toContainText("Première relance"); await ouvrirDemandes(page);
    await ligne.getByText("Gérer la première relance",{exact:true}).click();
    await expect(ligne.getByRole("button",{name:"Envoyer la première relance par e-mail",exact:true})).toBeVisible();
    await expect(ligne.getByText("Préparer le recommandé",{exact:true})).toHaveCount(0);
    await expect(ligne.getByRole("link",{name:"Suivre les relances dans le bail",exact:true})).toHaveAttribute("href",`/espace/${ORG}/baux/${bail}#relances`);

    for(const [niveau,suivant] of [["relance_1","Deuxième relance"],["relance_2","Recommandé"]] as const){
      await ligne.getByRole("button",{name:"Pas encore reçu",exact:true}).click();
      await ligne.getByRole("button",{name:"Confirmer : pas encore reçu",exact:true}).click();
      await expect(ligne).toContainText("Confirmation enregistrée");
      await page.reload();await expect(carteLoyer).toHaveCount(0);
      // Expédition fictive consignée, indépendante de la réponse du propriétaire : aucun courrier réel.
      await db.query("insert into relances(organization_id,bail_id,niveau,date_envoi) values($1,$2,$3,public.aujourdhui_paris())",[ORG,bail,niveau]);
      await vieillir(9); await expect(carteLoyer).toHaveCount(0);
      await vieillir(1); await expect(carteLoyer).toContainText(suivant);
      await carteLoyer.screenshot({path:info.outputPath(`palier-${niveau}-${largeur}.png`)});
      await ouvrirDemandes(page); await expect(ligne).toContainText(suivant);
      if (niveau === "relance_1") {
        await expect(ligne.getByText("Préparer le recommandé",{exact:true})).toHaveCount(0);
        await ligne.getByText("Gérer la deuxième relance",{exact:true}).click();
        await expect(ligne.getByRole("button",{name:"Envoyer la deuxième relance par e-mail"})).toBeVisible();
      }
    }

    await ligne.locator("summary").filter({hasText:"Délai de règlement"}).click();
    await expect(ligne.getByLabel("Délai de règlement (jours)",{exact:true})).toHaveValue("15");
    await ligne.getByLabel("Délai de règlement (jours)",{exact:true}).fill("0");
    await expect(ligne.getByRole("button",{name:"Générer le recommandé en PDF",exact:true})).toHaveCount(0);
    await ligne.getByLabel("Délai de règlement (jours)",{exact:true}).fill("15");
    await expect(ligne.getByRole("button",{name:"Générer le recommandé en PDF",exact:true})).toBeVisible();

    expect((await db.query("select * from encaissements where bail_id=$1",[bail])).rowCount).toBe(0);
    await ligne.getByRole("button",{name:"Reçu en partie",exact:true}).click();
    await ligne.getByLabel("Montant reçu (€)",{exact:true}).fill("200");
    await expect(ligne.getByRole("status").filter({hasText:"Restera à recevoir après confirmation"})).toContainText("600,00");
    await fenetreDemandes(page).getByRole("button",{name:"Fermer",exact:true}).click();
    await expect(demandes(page)).toBeFocused();
    await ouvrirDemandes(page);
    await expect(ligne.getByLabel("Montant reçu (€)",{exact:true})).toHaveValue("200");
    await ligne.getByRole("button",{name:"Confirmer et envoyer le reçu",exact:true}).click();
    await expect(ligne).toHaveAttribute("data-reception","partiel");
    await expect(ligne.getByRole("link",{name:"Reçu partiel créé"})).toBeVisible();
    await expect(ligne).toContainText("Informations à compléter avant la mise à disposition.");
    await expect(ligne).toContainText("Paiement inscrit dans vos comptes.");
    await expect(ligne).toContainText("600,00");await expect(ligne).toContainText("200,00");
    await db.query("update organizations set email_contact=$2 where id=$1",[ORG,email]);
    await ligne.getByRole("button",{name:"J’ai reçu le reste",exact:true}).click();await ligne.getByRole("button",{name:"Confirmer et envoyer la quittance",exact:true}).click();
    await expect(ligne).toHaveAttribute("data-reception","regle");
    await expect(ligne.getByText("Réglé",{exact:true})).toBeVisible();
    await expect(ligne).toContainText("Paiement inscrit dans vos comptes.");
    await expect(ligne.getByRole("link",{name:"Quittance créée"})).toBeVisible();
    await expect(ligne).toContainText("Disponible dans votre espace et celui du locataire.");
    await expect(ligne).toContainText("Le locataire n’a pas accepté les quittances électroniques.");
    await expect(ligne.getByText(/Quittance envoyée au locataire le/)).toHaveCount(0);
    await expect(ligne.getByRole("button")).toHaveCount(0);
    await expect(bloc.getByText("Tout est réglé")).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    const fin = fenetreDemandes(page);
    await fin.screenshot({path:info.outputPath(`loyer-regle-${largeur}.png`)});
    await fin.getByRole("button",{name:"Fermer",exact:true}).click();
    await ouvrirDemandes(page, true);await expect(ligne).toHaveCount(0);
    await page.reload();await ouvrirDemandes(page, true);await expect(ligne).toHaveCount(0);
    expect((await db.query("select sum(montant)::float montant from encaissements where bail_id=$1",[bail])).rows[0].montant).toBe(800);
    expect((await db.query("select est_quittance,email_envoye_at from quittances where appel_id=$1",[appel])).rows[0]).toEqual({est_quittance:true,email_envoye_at:null});

    // Un autre gestionnaire a soldé le terme pendant que le formulaire était ouvert.
    // Simuler uniquement la trace de son envoi sur cette quittance fictive, sans fournisseur externe.
    await db.query("update appels_loyer set date_echeance=public.aujourdhui_paris() where id=$1",[futur]);
    await page.reload(); await ouvrirDemandes(page);
    await ligne.getByRole("button",{name:"J’ai reçu le loyer",exact:true}).click();
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:compte,role:"authenticated",aal:"aal2"})]);
    await db.query("select public.declarer_reception_loyer($1,$2,'recu',800,public.aujourdhui_paris(),'virement',$3,800)",[ORG,futur,randomUUID()]);
    await db.query("select * from public.emettre_quittances($1)",[bail]);
    const trace = await db.query("update quittances set email_envoye_at=now() where appel_id=$1 and bail_id=$2 and organization_id=$3 and est_quittance returning email_envoye_at",[futur,bail,ORG]);
    await db.query("commit");
    expect(trace.rowCount).toBe(1);
    await ligne.getByRole("button",{name:"Confirmer et envoyer la quittance",exact:true}).click();
    await expect(ligne).toHaveAttribute("data-reception","regle");
    const statutEnvoi=ligne.getByText(/Quittance envoyée au locataire le/);
    await expect(statutEnvoi).toBeVisible();
    const dateEnvoi = trace.rows[0].email_envoye_at as Date;
    await expect(statutEnvoi).toContainText(dateEnvoi.toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"}));
    expect(Date.parse((await statutEnvoi.locator("time").getAttribute("datetime"))!)).toBe(dateEnvoi.getTime());
    await fenetreDemandes(page).screenshot({path:info.outputPath(`quittance-envoyee-${largeur}.png`)});
    expect((await db.query("select sum(montant)::float montant from encaissements where bail_id=$1",[bail])).rows[0].montant).toBe(1600);
  }finally{
    await db.query("rollback");
    try {
      await db.query("begin");
      await db.query("delete from relances where organization_id=$1 and bail_id=$2",[ORG,bail]);
      await db.query("delete from commandes_encaissement_reste where bail_id=$1",[bail]);
      await db.query("delete from fiscal_encaissements_composantes where organization_id=$1 and ecriture_id in (select id from ecritures where bail_id=$2)",[ORG,bail]);
      await db.query("delete from ecritures where bail_id=$1",[bail]);await db.query("delete from encaissements where bail_id=$1",[bail]);
      await db.query("delete from quittances where bail_id=$1",[bail]);await db.query("delete from appels_loyer where bail_id=$1",[bail]);
      await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2",[ORG,bail]);
      await db.query("delete from detentions where lot_id=$1",[lot]);await db.query("delete from baux where id=$1",[bail]);await db.query("delete from lots where id=$1",[lot]);await db.query("delete from biens where id=$1",[bien]);await db.query("delete from persons where id=$1",[personne]);
      await db.query("delete from memberships where organization_id=$1",[ORG]);
      await db.query("delete from persons where id=$1",[bailleur]);
      await db.query("delete from audit_log where organization_id=$1 or account_id=$2",[ORG,compte]);
      await db.query("delete from organizations where id=$1",[ORG]);
      await db.query("delete from auth.users where id=$1",[compte]);
      await db.query("commit");
    } catch(e) { await db.query("rollback"); throw e; } finally { await db.end(); }
  }
});
