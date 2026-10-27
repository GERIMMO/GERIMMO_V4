import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";
import AxeBuilder from "@axe-core/playwright";

const ORG="3c1d1e95-3570-400b-8012-44530be145b1";
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
  test.skip(!url||!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/gerimmo_ci_[a-z_]+_api$/.test(url),"Base API locale fictive requise");
  const db=new Client({connectionString:url});await db.connect();
  const [bien,lot,personne,bail,appel,futur]=Array.from({length:6},()=>randomUUID());
  const nom=`TEST Réception ${largeur} ${lot.slice(0,6)}`;
  try{
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue de recette','75001','Paris')",[bien,ORG,nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')",[lot,ORG,bien,nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom,email) values($1,$2,'Fictif','Camille','locataire@example.invalid')",[personne,ORG]);
    await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-40,750,50,5)",[bail,ORG,lot,personne]);
    await db.query("insert into appels_loyer(id,organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) values($1,$3,$4,date_trunc('month',public.aujourdhui_paris()),public.aujourdhui_paris()+1,750,50,800),($2,$3,$4,date_trunc('month',public.aujourdhui_paris())+interval '1 month',public.aujourdhui_paris()+30,750,50,800)",[appel,futur,ORG,bail]);
    await db.query("commit");
    await page.setViewportSize({width:largeur,height:950});await sansSyntheseAlertes(page);
    await page.goto("/connexion");await page.locator("#email").fill("proprietaire@example.com");await page.locator("#mot-de-passe").fill(process.env.E2E_MOT_DE_PASSE??"Gerimmo-Demo-2026");
    await page.getByRole("button",{name:"Se connecter",exact:true}).click();await page.waitForURL(/\/espace\//);
    const bloc=page.getByRole("region",{name:"Avez-vous reçu vos loyers ?"});
    await ouvrirDemandes(page, true);
    await expect(bloc).toHaveCount(0);
    // Le jour prévu est arrivé : la même échéance entre dans le tableau de bord.
    await db.query("update appels_loyer set date_echeance=public.aujourdhui_paris() where id=$1",[appel]);await page.reload();
    await expect(bloc).toHaveCount(0);
    await ouvrirDemandes(page);
    await expect(bloc).toBeVisible();await expect(bloc).toContainText(nom);await expect(bloc).toContainText("800,00");
    expect(await debordementHorizontal(page)).toBe(0);
    const violations=(await new AxeBuilder({page}).include('[aria-labelledby="reception-loyers-titre"]').analyze()).violations;
    expect(violations).toEqual([]);
    await page.screenshot({path:info.outputPath(`reception-${largeur}.png`),fullPage:true});
    await bloc.getByRole("button",{name:"Pas encore reçu",exact:true}).click();await bloc.getByRole("button",{name:"Confirmer : pas encore reçu",exact:true}).click();
    await expect(bloc.getByText(/Pas encore reçu · signalé le/)).toBeVisible();
    await page.reload();await ouvrirDemandes(page);await expect(bloc.getByText(/Pas encore reçu · signalé le/)).toBeVisible();
    expect((await db.query("select * from encaissements where bail_id=$1",[bail])).rowCount).toBe(0);
    await bloc.getByRole("button",{name:"Reçu en partie",exact:true}).click();
    await bloc.getByLabel("Montant reçu (€)",{exact:true}).fill("200");
    await fenetreDemandes(page).getByRole("button",{name:"Fermer",exact:true}).click();
    await expect(demandes(page)).toBeFocused();
    await ouvrirDemandes(page);
    await expect(bloc.getByLabel("Montant reçu (€)",{exact:true})).toHaveValue("200");
    await bloc.getByRole("button",{name:"Confirmer la réception",exact:true}).click();
    await expect(bloc).toContainText("600,00");await expect(bloc).toContainText("200,00");
    await bloc.getByText("Gérer la relance et le recommandé",{exact:true}).click();
    await expect(bloc).toContainText("Les relances seront disponibles dès demain");
    await expect(bloc.getByRole("button",{name:"Envoyer la relance par e-mail",exact:true})).toHaveCount(0);
    // Le paiement est maintenant en retard : les gestes de relance deviennent disponibles.
    await db.query("update appels_loyer set date_echeance=public.aujourdhui_paris()-1 where id=$1",[appel]);await page.reload();
    await ouvrirDemandes(page);
    await bloc.getByText("Gérer la relance et le recommandé",{exact:true}).click();
    await expect(bloc.getByRole("button",{name:"Envoyer la relance par e-mail",exact:true})).toBeVisible();
    await bloc.getByText("Préparer le recommandé",{exact:true}).click();
    await expect(bloc.getByLabel("Délai de règlement (jours)",{exact:true})).toHaveValue("15");
    await bloc.getByLabel("Délai de règlement (jours)",{exact:true}).fill("0");
    await expect(bloc.getByRole("button",{name:"Générer le recommandé en PDF",exact:true})).toHaveCount(0);
    await bloc.getByLabel("Délai de règlement (jours)",{exact:true}).fill("15");
    await expect(bloc.getByRole("button",{name:"Générer le recommandé en PDF",exact:true})).toBeVisible();
    await expect(bloc.getByRole("link",{name:"Suivre les relances et l’envoi",exact:true})).toHaveAttribute("href",`/espace/${ORG}/baux/${bail}#relances`);
    await bloc.getByRole("button",{name:"J’ai reçu le reste",exact:true}).click();await bloc.getByRole("button",{name:"Confirmer la réception",exact:true}).click();
    await expect(bloc).toHaveCount(0);await page.reload();await ouvrirDemandes(page, true);await expect(bloc).toHaveCount(0);
    expect((await db.query("select sum(montant)::float montant from encaissements where bail_id=$1",[bail])).rows[0].montant).toBe(800);
    expect((await db.query("select est_quittance from quittances where appel_id=$1",[appel])).rows[0].est_quittance).toBe(true);
  }finally{
    await db.query("rollback");
    try {
      await db.query("begin");
      await db.query("delete from commandes_encaissement_reste where bail_id=$1",[bail]);
      await db.query("delete from fiscal_encaissements_composantes where organization_id=$1 and ecriture_id in (select id from ecritures where bail_id=$2)",[ORG,bail]);
      await db.query("delete from ecritures where bail_id=$1",[bail]);await db.query("delete from encaissements where bail_id=$1",[bail]);
      await db.query("delete from quittances where bail_id=$1",[bail]);await db.query("delete from appels_loyer where bail_id=$1",[bail]);
      await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2",[ORG,bail]);
      await db.query("delete from baux where id=$1",[bail]);await db.query("delete from lots where id=$1",[lot]);await db.query("delete from biens where id=$1",[bien]);await db.query("delete from persons where id=$1",[personne]);
      await db.query("delete from audit_log where organization_id=$1 and (details->>'bail_id'=$2 or details->>'lot_id'=$3 or details->>'bien_id'=$4)",[ORG,bail,lot,bien]);
      await db.query("commit");
    } catch(e) { await db.query("rollback"); throw e; } finally { await db.end(); }
  }
});
