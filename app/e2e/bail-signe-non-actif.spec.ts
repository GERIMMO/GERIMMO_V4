import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
for (const persona of ["proprietaire", "superadmin"]) {
  test.describe(persona, () => {
    test.use({ storageState: path.join(__dirname, ".auth", `${persona}.json`) });
    test("bail signé et documents lisibles sans activation", async ({ page }, info) => {
      test.setTimeout(120_000);
      const cible = process.env.SUPALOCAL_DB;
      test.skip(!cible, "Base API locale fictive obligatoire.");
      const url = new URL(cible!);
      if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
      const db = new Client({ connectionString: cible }); await db.connect();
      const lot = randomUUID(), bail = randomUUID(), original = randomUUID(), signe = randomUUID(), circuit = randomUUID(), dpe = randomUUID(), sansDate = randomUUID();
      const docs = [original, signe, dpe, sansDate];
      const edl = randomUUID();
      const suivi = randomUUID(), alerteSignature = randomUUID(), alerteCritique = randomUUID();
      try {
        const source = (await db.query("select id,bien_id from public.lots where organization_id=$1 and nom='Appartement T2 — 12 rue des Lilas'", [ORG])).rows[0];
        expect(source).toBeTruthy();
        await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots,to_jsonb(l)||jsonb_build_object('id',$1::text,'nom','Bail signé — essai local','etat','disponible'))).* from public.lots l where id=$2`, [lot, source.id]);
        const owner = (await db.query("select account_id from public.memberships where organization_id=$1 and role='proprietaire_direct' and status='active' limit 1", [ORG])).rows[0].account_id;
        await db.query("insert into public.baux(id,organization_id,lot_id,etat,type,date_debut,loyer_hc,charges) values($1,$2,$3,'brouillon','nu',current_date+7,750,50)", [bail, ORG, lot]);
        await db.query("insert into public.etats_des_lieux(id,organization_id,bail_id,type,personnes_presentes) values($1,$2,$3,'entree','Présents — essai consultation')", [edl, ORG, bail]);
        await db.query("insert into public.edl_lignes(organization_id,edl_id,piece,libelle,etat,commentaire) values($1,$2,'Cuisine','Mur','usage','Rayure témoin')", [ORG, edl]);
        for (const [id, titre, type, expiration] of [
          [original, "Bail nu (généré, à faire signer) — à signer en ligne", "bail", null],
          [signe, "Bail nu (généré, à faire signer) — à signer en ligne — signé", "bail", null],
          [dpe, "Diagnostic expiré — essai", "diagnostic", "2020-01-01"],
          [sansDate, "Pièce à vérifier — essai", "autre", null],
        ]) {
          await db.query("insert into public.documents(id,organization_id,type,titre,storage_path,mime_type,expire_le,taille_octets,empreinte) values($1::uuid,$2,$3,$4,$5,'application/pdf',$6,123,repeat(replace($1::uuid::text,'-',''),2))", [id, ORG, type, titre, `${ORG}/essai/${id}.pdf`, expiration]);
          await db.query("insert into public.document_liens(organization_id,document_id,entite,entite_id) values($1,$2,'bail',$3)", [ORG, id, bail]);
        }
        await db.query("insert into public.diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,document_id,classe_dpe) values($1,$2,'dpe','2019-01-01','2020-01-01',$3,'B')", [ORG, lot, dpe]);
        await db.query(`insert into public.bail_signature_circuits(id,organization_id,bail_id,document_id,document_signe,created_by,environnement,empreinte,pdf_hash,signataires,etat,prestataire)
          values($1,$2,$3,$4,$5,$6,'production',repeat('b',64),repeat('a',64),$7,'termine','zoho')`,
          [circuit, ORG, bail, original, signe, owner, JSON.stringify(["Locataire", "Propriétaire"].map((qualite, i) => ({ personId: randomUUID(), qualite, prenom: "Essai", nom: qualite, email: `essai${i}@example.test`, telephone: "+33600000001", statut: "signed" })))]);
        if (persona === "superadmin") {
          await db.query("insert into public.orchestration_cases(id,organization_id,dossier_type,dossier_id,etape,prochaine_action,mode,priorite) values($1,$2,'bail',$3,'brouillon','Compléter le bail et réunir les signatures','humaine','urgente')", [suivi, ORG, bail]);
          await db.query("insert into public.alerts(id,organization_id,type,titre,criticite,assigned_all) values($1,$3,'signature_retournee','Signature client — contrôle des rôles','normale',true),($2,$3,'manuelle','Alerte critique — contrôle des rôles','critique',true)", [alerteSignature, alerteCritique, ORG]);
          // Aucun contournement de la synthèse : tester la vraie première arrivée.
          await page.goto("/admin/brief");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await page.getByRole("button", { name: /Alertes critiques des clients/ }).click();
          const synthese = page.getByRole("dialog");
          await expect(synthese).toContainText("Alerte critique — contrôle des rôles");
          await expect(synthese).not.toContainText("Signature client — contrôle des rôles");
          await expect(synthese).not.toContainText("Traiter");
          await expect(synthese).toContainText("Suivi en lecture seule");
          await synthese.getByRole("button", { name: "Fermer", exact: true }).last().click();
          await page.goto("/admin/autonomie?vue=dossiers&equipe=bail");
          const dossier = page.locator('#dossiers a').filter({ hasText: "Bail signé · location non activée" });
          await expect(dossier.first()).toBeVisible();
        } else await sansSyntheseAlertes(page);
        const fiche = `/espace/${ORG}/parc/${source.bien_id}/lots/${lot}`;
        await page.goto(fiche);
        if (persona === "superadmin") {
          await expect(page.getByText("Consultation superadmin · lecture seule", { exact: true })).toBeVisible();
          await expect(page.locator('[role="dialog"]')).toHaveCount(0);
        }
        const contrats = page.locator("#contrats-lot");
        await expect(contrats).toContainText("Bail signé");
        await expect(contrats.getByText("La location attend votre activation.", { exact: true })).toBeVisible();
        await expect(contrats.getByRole("link", { name: "Consulter et activer", exact: true })).toHaveAttribute("href", `/espace/${ORG}/baux/${bail}#etape-bail-7`);
        await expect(page.getByRole("tablist")).toHaveCount(0);
        const documents = page.locator("details#documents-lot");
        await expect(documents).not.toHaveAttribute("open", "");
        expect(await debordementHorizontal(page)).toBe(0);
        await page.screenshot({ path: info.outputPath(`resume-${persona}.png`), fullPage: true });
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await expect(page.getByRole("heading", { name: "Le logement", exact: true })).toBeVisible();
        if (persona === "superadmin") {
          await expect(page.getByRole("link", { name: "Modifier le lot", exact: true })).toHaveCount(0);
          await expect(page.locator("#caracteristiques").getByRole("button", { name: "Modifier", exact: true })).toHaveCount(0);
          await expect(page.getByRole("main").locator("form")).toHaveCount(0);
          await expect(page.getByText("Gérer le statut du lot", {exact:true})).toHaveCount(0);
        } else await expect(page.getByRole("link", { name: "Modifier le lot", exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath(`logement-${persona}.png`), fullPage: true });
        await documents.locator(":scope > summary").click();
        await expect(documents).toHaveAttribute("open", "");
        await expect(page.getByText("Expiré · à renouveler", { exact: true })).toBeVisible();
        if (persona === "superadmin") {
          await expect(page.getByRole("button", {name:"Renouveler",exact:true})).toHaveCount(0);
          await expect(page.getByText("Détails et modifications", {exact:true})).toHaveCount(0);
        } else await expect(page.getByRole("button", {name:"Renouveler",exact:true}).first()).toBeVisible();
        await expect(contrats).toContainText("Bail signé");
        await expect(page.getByRole("button", { name: "Supprimer le brouillon", exact: true })).toHaveCount(0);
        await page.goto(`/espace/${ORG}/baux/${bail}#etape-bail-7`);
        // Le rendu progressif garde brièvement le squelette <main> dans le DOM,
        // masqué aux lecteurs d'écran. Lire le vrai repère accessible, pas ce squelette.
        await expect(page.getByRole("main")).toContainText("Le bail est signé. La location n’est pas encore activée.");
        await expect(page.locator("#signature")).toContainText(persona === "superadmin"
          ? "Bail signé · location non activée"
          : "Le contrat signé est disponible. La location reste à activer.");
        await expect(page.getByRole("button", { name: "Générer le PDF du bail", exact: true })).toHaveCount(0);
        if (persona === "superadmin") {
          await expect(page.getByRole("main")).not.toContainText("Connectez-vous à votre espace propriétaire");
          await expect(page.getByRole("main").locator("form")).toHaveCount(0);
          for (const nom of ["Contrat", "Documents", "Suivi"]) {
            await page.getByRole("tab", {name:nom,exact:true}).click();
            await expect(page.getByRole("main").locator("input,textarea,select")).toHaveCount(0);
          }
          expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
          await page.screenshot({path:info.outputPath("bail-superadmin-consultation.png"),fullPage:true});
        }
        if (persona === "superadmin") {
          await page.goto(`/espace/${ORG}/baux/${bail}/edl/${edl}`);
          await expect(page.getByRole("main")).toContainText("En cours de saisie");
          await expect(page.getByRole("main")).toContainText("Présents — essai consultation");
          await expect(page.getByRole("main")).toContainText("Rayure témoin");
          await expect(page.getByRole("main").locator("form,input,textarea,select")).toHaveCount(0);
          await expect(page.getByRole("button", {name:"Générer le PDF",exact:true})).toHaveCount(0);
          expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
          expect(await debordementHorizontal(page)).toBe(0);
        }
        // Le PDF fictif n'est pas chargé : ce test vérifie les états et la navigation.
        await page.goto(`/espace/${ORG}/documents`);
        const archive = page.getByRole("link").filter({ hasText: "Bail nu — signé" }).first();
        await expect(archive).toContainText("Signé");
        await expect(archive).not.toContainText("à faire signer");
        await expect(page.getByRole("link").filter({ hasText: "Diagnostic expiré — essai" }).first()).toContainText("Expiré");
        await expect(page.getByRole("link").filter({ hasText: "Pièce à vérifier — essai" }).first()).toContainText("À vérifier");
        expect(await debordementHorizontal(page)).toBe(0);
        if (persona === "superadmin") {
          await page.goto(`/espace/${ORG}/parc/${source.bien_id}`);
          await expect(page.getByRole("main").locator("form")).toHaveCount(0);
          await expect(page.getByRole("button", {name:"Modifier le bien",exact:true})).toHaveCount(0);
          await page.goto(`/espace/${ORG}/reseau?bien=${source.bien_id}&metier=plomberie`);
          await expect(page.getByRole("main")).toContainText("Consultation superadmin");
          for (const name of ["Confirmer la commune", "Confirmer les communes évidentes", "Signaler mon intérêt"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
          await page.goto(`/espace/${ORG}/profil?retour=nouveau-lot`);
          await expect(page.getByRole("heading", { name: "Profil du propriétaire", exact: true })).toBeVisible();
          await expect(page.getByRole("main").locator("form")).toHaveCount(0);
          await expect(page.getByRole("link", { name: /Reprendre la création du lot/ })).toHaveCount(0);
        }
        if (persona === "proprietaire") {
          await page.goto("/admin/clients");
          await expect(page).toHaveURL(new RegExp(`/espace/${ORG}(?:[?#]|$)`));
          await expect(page.getByRole("link", { name: "Ouvrir une organisation", exact: true })).toHaveCount(0);
        }
        const apres = (await db.query("select b.etat,b.document_signe,l.etat as lot_etat from public.baux b join public.lots l on l.id=b.lot_id where b.id=$1", [bail])).rows[0];
        expect(apres).toEqual({ etat: "brouillon", document_signe: null, lot_etat: "disponible" });
      } finally {
        await db.query("delete from public.alerts where id=any($1::uuid[])", [[alerteSignature, alerteCritique]]);
        await db.query("delete from public.orchestration_cases where id=$1", [suivi]);
        await db.query("delete from public.bail_signature_circuits where id=$1", [circuit]);
        await db.query("delete from public.diagnostics where lot_id=$1", [lot]);
        await db.query("delete from public.document_liens where document_id=any($1::uuid[])", [docs]);
        await db.query("delete from public.acces_pieces_log where document_id=any($1::uuid[])", [docs]);
        await db.query("delete from public.documents where id=any($1::uuid[])", [docs]);
        await db.query("delete from public.baux where id=$1", [bail]);
        await db.query("delete from public.lots where id=$1", [lot]);
        await db.end();
      }
    });
  });
}
