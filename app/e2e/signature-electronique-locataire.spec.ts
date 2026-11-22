import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LE LOCATAIRE VOIT OÙ EN EST LA SIGNATURE ÉLECTRONIQUE QUI LE CONCERNE (audit palier 1 du 22/11/2026, P1-06).
//
// Le défaut : rien, dans l'espace du locataire, ne disait qu'une signature électronique était en cours. Ici, un
// locataire fictif, signataire d'un avenant, lit successivement « à signer », « vous avez signé », puis « signé » —
// sans jamais voir le nom, l'adresse ou le téléphone de l'autre signataire.
//
// Les circuits sont des fixtures explicites (ils naissent côté serveur, chez le prestataire) : aucun envoi n'est fait.
// Tout le décor est supprimé à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 10_000 });

test("signature électronique : le locataire lit « à signer », puis « vous avez signé », puis « signé »", async ({ page }, info) => {
  test.setTimeout(150_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const [bien, lot, personne, autre, bail, document] = Array.from({ length: 6 }, () => randomUUID());
  const marque = personne.slice(0, 8);
  const email = `recette-signature-${personne}@example.invalid`;
  let compte: string | undefined;
  const systeme = async (travail: () => Promise<void>) => {
    await db.query("begin");
    try { await db.query("select public.tache_systeme()"); await travail(); await db.query("commit"); }
    catch (e) { await db.query("rollback").catch(() => {}); throw e; }
  };
  /** Remplace le circuit du décor par un circuit dans l'état voulu (un seul circuit actif par document). */
  const circuit = (etat: string, monStatut: string, statutAutre: string) => systeme(async () => {
    await db.query("delete from bail_signature_circuits where organization_id=$1 and document_id=$2", [ORG, document]);
    const { rows: [createur] } = await db.query("select id from auth.users where email='proprietaire@example.com'");
    await db.query(`insert into bail_signature_circuits(organization_id,bail_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,
        signataires,etat,modele,cible_id,expire_le,envoye_le,essai)
      values($1,$2,$3,$4,'zoho','sandbox',repeat('b',64),repeat('c',64),$5,$6,'avenant',$2,now()+interval '10 days',now(),false)`,
      [ORG, bail, document, createur.id, JSON.stringify([
        { personId: personne, qualite: "Locataire", prenom: "Camille", nom: `Test ${marque}`, email, telephone: "+33600000001", statut: monStatut },
        { personId: autre, qualite: "Propriétaire", prenom: "Autre", nom: "SIGNATAIRE-SECRET", email: "autre-signataire@example.invalid", telephone: "+33699999999", statut: statutAutre },
      ]), etat]);
  });
  try {
    await systeme(async () => {
      compte = (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
          confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
        values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,extensions.crypt($2,extensions.gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','') returning id`,
        [email, MOT_DE_PASSE])).rows[0].id;
      await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')", [compte, ORG]);
      await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue TEST signature','75001','Paris')", [bien, ORG, `TEST signature ${marque}`]);
      await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, `TEST signature ${marque}`]);
      await db.query("insert into persons(id,organization_id,account_id,nom,prenom,email) values($1,$2,$3,$4,'Camille',$5)", [personne, ORG, compte, `Test ${marque}`, email]);
      await db.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,'SIGNATAIRE-SECRET','Autre')", [autre, ORG]);
      await db.query("insert into baux(id,organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,jour_echeance) values($1,$2,$3,$4,'nu','actif',public.aujourdhui_paris()-40,750,50,5)", [bail, ORG, lot, personne]);
      await db.query(`insert into documents(id,organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
        values($1,$2::uuid,'autre','TEST avenant fictif',$2::text||'/test/avenant-'||$3||'.pdf','application/pdf',10,$4)`, [document, ORG, marque, `test-avenant-${marque}`]);
    });

    await sansSyntheseAlertes(page);
    await connecterVers(page, email, MOT_DE_PASSE, `/locataire/${ORG}/documents`);
    await expect(page.getByRole("heading", { level: 1, name: "Mes documents" })).toBeVisible();
    const carte = page.locator("[data-signatures-electroniques]");
    // Sans signature en cours, la carte n'existe pas.
    await expect(carte).toHaveCount(0);

    // ── À signer.
    await circuit("en_cours", "notified", "initiated");
    await page.reload();
    await expect(carte).toBeVisible();
    await expect(carte.getByRole("heading", { name: "Signature électronique" })).toBeVisible();
    await expect(carte).toContainText("Avenant au bail");
    await expect(carte.getByText("à signer", { exact: true })).toBeVisible();
    await expect(carte).toContainText("À signer : l’invitation vous a été envoyée par e-mail. 0 signature reçue sur 2.");
    await expect(carte).toContainText("Rien n’est à déposer ici.");
    // Rien de l'autre signataire, nulle part dans la page.
    await expect(page.locator("body")).not.toContainText("SIGNATAIRE-SECRET");
    await expect(page.locator("body")).not.toContainText("autre-signataire@example.invalid");
    await expect(page.locator("body")).not.toContainText("+33699999999");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("signature-a-signer.png"), fullPage: true });

    // ── Le locataire a signé, l'autre pas encore.
    await circuit("en_cours", "signed", "notified");
    await page.reload();
    await expect(carte.getByText("vous avez signé", { exact: true })).toBeVisible();
    await expect(carte).toContainText("Vous avez signé. 1 signature reçue sur 2 : le document sera complet quand tous auront signé.");

    // ── Toutes les signatures sont réunies.
    await circuit("termine", "signed", "signed");
    await page.reload();
    await expect(carte.getByText("signé", { exact: true })).toBeVisible();
    await expect(carte).toContainText("Signé par tous les signataires le ");

    // ── Au téléphone : lisible, sans défilement horizontal.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(carte).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  } finally {
    try {
      await systeme(async () => {
        await db.query("delete from bail_signature_circuits where organization_id=$1 and document_id=$2", [ORG, document]);
        await db.query("delete from document_liens where document_id=$1", [document]);
        await db.query("delete from documents where id=$1", [document]);
        await db.query("delete from consentements_documents_locataire where person_id=$1", [personne]);
        await db.query("delete from automation_events where organization_id=$1 and dossier_id=$2", [ORG, bail]);
        await db.query("delete from baux where id=$1", [bail]);
        await db.query("delete from lots where id=$1", [lot]);
        await db.query("delete from biens where id=$1", [bien]);
        await db.query("delete from persons where id in ($1,$2)", [personne, autre]);
        if (compte) {
          await db.query("delete from memberships where account_id=$1 and organization_id=$2 and role='locataire'", [compte, ORG]);
          await db.query("delete from audit_log where account_id=$1 or (organization_id=$2 and (details->>'bail_id'=$3 or details->>'lot_id'=$4 or details->>'bien_id'=$5 or details->>'person_id'=$6))", [compte, ORG, bail, lot, bien, personne]);
          await db.query("delete from auth.users where id=$1 and email=$2", [compte, email]);
        }
      });
    } catch (e) { console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
