import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D3 — SECONDE REPRISE après relecture.
//  Points 1 et 4 (Q49) : la pièce rangée au logement d'un autre bail, ou chez un autre locataire, ne justifie pas la
//             retenue ; le refus dit l'issue pour une pièce commune.
//  Point 3 (Q49) : une retenue dont la pièce a été purgée est de nouveau « à justifier », et sa pièce se remplace.
//  Point 2 (Q49) : l'agent limité à son portefeuille, bloqué par la pièce d'un collègue, lit à qui s'adresser.
//  Point 5 (Q46) : pour un parking, ni la notice ni son résumé ne sont demandés.
//
// Dossiers FICTIFS créés ici dans la base du banc, sous des noms « ESSAI D3R2 » ; les fichiers déposés sont des PDF
// d'essai. Ce banc tourne avec le service de signature FERMÉ : aucun envoi, aucun e-mail. Rien n'est supprimé à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";         // l'espace du propriétaire du jeu d'essai
const AGENCE = "c14c3187-1258-4e58-8822-368c6007e3fa";      // l'agence du jeu d'essai (administrateur et agent)
const empreinte = (octets: Buffer) => createHash("sha256").update(octets).digest("hex");

/** La base fictive du banc, et elle seule. */
function baseFictive(): Client | null {
  const cible = process.env.SUPALOCAL_DB;
  return cible && /^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible) ? new Client({ connectionString: cible }) : null;
}

/** Captures pour la relecture (390 et 1440 px), rangées avec les résultats du parcours. Revient à 390 px. */
async function capturer(page: Page, info: TestInfo, nom: string, zone: Locator) {
  for (const largeur of [390, 1440]) {
    await page.setViewportSize({ width: largeur, height: 900 });
    await zone.scrollIntoViewIfNeeded();
    expect(await debordementHorizontal(page), `${nom} : débordement à ${largeur} px`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${nom}-${largeur}.png`), fullPage: true, timeout: 60_000 });
    await zone.screenshot({ path: info.outputPath(`${nom}-${largeur}-zone.png`), timeout: 60_000 });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

/** Un logement, son bail terminé et sa restitution finalisée, dans l'espace donné. */
async function bailTermine(db: Client, org: string, nom: string, x: { bien: string; lot: string; locataire: string; bail: string; restitution: string }) {
  await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue ESSAI D3R2','75001','Paris')", [x.bien, org, nom]);
  await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible')", [x.lot, org, x.bien, nom]);
  // Le bailleur du logement (les décomptes le nomment, avec son adresse).
  const { rows: [{ id: bailleur }] } = await db.query("insert into persons(organization_id,nom,prenom,qualite,email,telephone,address_line1,postal_code,city) values($1,$2,'Bailleur fictif','Personne physique',$3,'0600000001','2 rue ESSAI D3R2','75001','Paris') returning id", [org, nom, `bailleur-d3r2-${x.bien.slice(0, 8)}@example.invalid`]);
  await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,public.aujourdhui_paris() - 400)", [org, x.lot, bailleur]);
  await db.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')", [x.locataire, org, nom]);
  await db.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,date_fin,date_sortie_reelle,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
    values($1,$2,$3,'nu','termine',public.aujourdhui_paris() - 400,public.aujourdhui_paris() - 10,public.aujourdhui_paris() - 10,600,40,0,5,$4,'provision','echoir')`, [x.bail, org, x.lot, x.locataire]);
  await db.query("insert into restitutions(id,organization_id,bail_id,date_remise_cles,delai_mois,depot,impayes,statut,solde,date_emission) values($1,$2,$3,public.aujourdhui_paris() - 10,2,0,0,'finalise',-300,public.aujourdhui_paris())", [x.restitution, org, x.bail]);
}
const dossierNeuf = () => ({ bien: randomUUID(), lot: randomUUID(), locataire: randomUUID(), bail: randomUUID(), restitution: randomUUID() });
/** Une fiche déjà rangée dans Documents (sans fichier au stockage, comme les jeux d'essai), avec ses liens de dossier. */
async function ranger(db: Client, org: string, type: string, titre: string, octets: Buffer, liens: [string, string][], par: string | null = null) {
  const { rows: [{ id }] } = await db.query(
    `insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,deposited_by)
     values($1::uuid,$2::document_type,$3,$1::uuid::text || '/essai-d3r2-' || gen_random_uuid() || '.pdf','application/pdf',$4,$5,$6) returning id`, [org, type, titre, octets.length, empreinte(octets), par]);
  await db.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'organisation',$2)", [id, org]);
  for (const [entite, cible] of liens) await db.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,$3::entite_liee,$4)", [id, org, entite, cible]);
  return id as string;
}
/** Joint un fichier à la première retenue encore à justifier. */
async function joindre(carte: Locator, octets: Buffer, nom: string) {
  await carte.locator('input[type="file"][name="justificatif"]').first().setInputFiles({ name: nom, mimeType: "application/pdf", buffer: octets });
  await carte.getByRole("button", { name: "Joindre le devis / la facture" }).first().click();
}

test.describe("propriétaire", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json"), actionTimeout: 15_000 });

  test("points 1, 3 et 4 : pièce d'un autre dossier refusée avec son issue ; pièce purgée à remplacer ; les décomptes se produisent ensuite", async ({ page }, info) => {
    test.setTimeout(300_000);
    const db = baseFictive();
    test.skip(!db, "Base API fictive locale requise");
    await db!.connect();
    const A = dossierNeuf(), B = dossierNeuf(), marque = A.bien.slice(0, 8);
    const devis = pdfFictif(), constatLogementB = pdfFictif(), identiteB = pdfFictif(), ancienDevis = pdfFictif();
    try {
      await db!.query("begin");
      await bailTermine(db!, ORG, `ESSAI D3R2 bail A ${marque}`, A);
      await bailTermine(db!, ORG, `ESSAI D3R2 bail B ${marque}`, B);
      // Deux pièces du dossier d'un autre : un constat rangé au logement B, la pièce d'identité du locataire B.
      await ranger(db!, ORG, "etat_des_lieux", `Constat du logement B, essai ${marque}`, constatLogementB, [["lot", B.lot]]);
      await ranger(db!, ORG, "piece_identite", `Pièce d'identité du locataire B, essai ${marque}`, identiteB, [["personne", B.locataire]]);
      // Deux retenues du bail A : la première sans pièce ; la seconde avec une pièce, purgée ensuite (on pose ici le
      // résultat d'une purge : la fiche reste, le fichier n'existe plus ; aucune règle de conservation n'est jouée).
      const pieceAncienne = await ranger(db!, ORG, "devis", `Ancien devis, essai ${marque}`, ancienDevis, []);
      await db!.query("insert into retenues(organization_id,restitution_id,libelle,cout,montant_retenu,sans_justificatif,created_at) values($1,$2,$3,150,150,true,now() - interval '2 minutes')", [ORG, A.restitution, `Peinture du séjour, essai ${marque}`]);
      await db!.query("insert into retenues(organization_id,restitution_id,libelle,cout,montant_retenu,sans_justificatif,justificatif_document,created_at) values($1,$2,$3,150,150,false,$4,now() - interval '1 minute')", [ORG, A.restitution, `Plan de travail, essai ${marque}`, pieceAncienne]);
      await db!.query("commit");
      await db!.query("set session_replication_role = replica");
      await db!.query("update documents set purged_at = now(), storage_path = null where id = $1", [pieceAncienne]);
      await db!.query("set session_replication_role = origin");
      const retenues = async () => (await db!.query("select justificatif_document piece from retenues where restitution_id = $1 order by created_at", [A.restitution])).rows.map((l) => l.piece as string | null);
      const nombreDeDocuments = async () => (await db!.query("select count(*)::int n from documents where organization_id = $1", [ORG])).rows[0].n as number;

      await sansSyntheseAlertes(page);
      await page.goto(`/espace/${ORG}/baux/${A.bail}#restitution`);
      const carte = page.locator("#restitution");
      await expect(carte).toBeVisible({ timeout: 60_000 });

      // ── Point 3 : la retenue à pièce purgée est de nouveau à justifier, et l'écran dit pourquoi.
      await expect(carte.getByText("Sans justificatif", { exact: true })).toHaveCount(1);
      const purgee = carte.locator("[data-piece-purgee]");
      await expect(purgee).toHaveText("Justificatif supprimé (règle de conservation) : joignez-en un autre");
      await expect(carte.locator("[data-retenues-sans-justificatif]")).toBeVisible();
      await expect(carte.locator("[data-decompte-finalise-sans-piece]")).toBeVisible();
      await carte.getByRole("button", { name: "Générer le décompte PDF" }).click();
      await expect(carte.getByText(`justificatif de la retenue « Plan de travail, essai ${marque} » (un devis suffit)`)).toBeVisible({ timeout: 120_000 });
      await capturer(page, info, "point3-piece-purgee-retenue-a-justifier", carte);

      // ── Points 1 et 4 : la pièce rangée au logement B est refusée ; le refus dit l'issue pour une pièce commune.
      const avant = await nombreDeDocuments();
      await joindre(carte, constatLogementB, "constat-logement-b.pdf");
      const refus = carte.getByText(/Cette pièce est rangée dans le dossier d'un autre bail ou d'un autre logement : elle ne peut pas justifier cette retenue\. Déposez le justificatif propre à ce bail, ou rangez-la aussi dans le dossier de ce bail/);
      await expect(refus).toBeVisible({ timeout: 60_000 });
      await capturer(page, info, "point1-piece-d-un-autre-logement-refusee", carte);
      // ── Point 1 : la pièce d'identité d'un autre locataire est refusée.
      await joindre(carte, identiteB, "identite-locataire-b.pdf");
      await expect(carte.getByText(/Cette pièce est rangée dans le dossier d'une personne qui n'est pas partie à ce bail : elle ne peut pas justifier cette retenue\. Déposez le justificatif propre à ce bail/)).toBeVisible({ timeout: 60_000 });
      await capturer(page, info, "point1-piece-d-un-autre-locataire-refusee", carte);
      expect(await retenues()).toEqual([null, pieceAncienne]);
      expect(await nombreDeDocuments(), "aucun document créé par les deux refus").toBe(avant);

      // ── Cas légitime : un devis de l'espace pour les deux retenues ; il remplace la pièce purgée, sans copie.
      await joindre(carte, devis, "devis-essai.pdf");
      await expect(carte.getByText("Sans justificatif", { exact: true })).toHaveCount(0, { timeout: 60_000 });
      await joindre(carte, devis, "devis-essai.pdf");
      await expect(purgee).toHaveCount(0, { timeout: 60_000 });
      await expect(carte.locator("[data-retenues-sans-justificatif]")).toHaveCount(0);
      const pieces = await retenues();
      expect(pieces[0]).toBeTruthy();
      expect(pieces[1]).toBe(pieces[0]);
      expect(await nombreDeDocuments(), "un seul document pour les deux retenues").toBe(avant + 1);

      // ── Les deux décomptes se produisent.
      await carte.getByRole("button", { name: "Générer le décompte PDF" }).click();
      await expect(carte.getByRole("link", { name: "Ouvrir le PDF" })).toBeVisible({ timeout: 120_000 });
      await capturer(page, info, "point3-piece-remplacee-decompte-genere", carte);
      await page.goto(`/espace/${ORG}/documents/catalogue?modele=decompte_retenues&bail=${A.bail}`);
      await page.locator('select[name="cible"]').selectOption(A.bail);
      await page.getByRole("button", { name: "Générer le PDF" }).click();
      await expect(page.getByRole("link", { name: "Ouvrir le PDF" })).toBeVisible({ timeout: 120_000 });
    } finally {
      await db!.query("rollback").catch(() => undefined);
      await db!.end();
    }
  });

  test("point 5 : parking, ni la notice ni son résumé ne sont demandés ; appartement, rien ne change", async ({ page }, info) => {
    test.setTimeout(300_000);
    const db = baseFictive();
    test.skip(!db, "Base API fictive locale requise");
    await db!.connect();
    const marque = randomUUID().slice(0, 8), bailleur = randomUUID(), locataire = randomUUID();
    const dossier = { logement: { bien: randomUUID(), lot: randomUUID(), bail: randomUUID(), type: "appartement" }, parking: { bien: randomUUID(), lot: randomUUID(), bail: randomUUID(), type: "parking" } };
    try {
      await db!.query("begin");
      await db!.query("insert into persons(id,organization_id,nom,prenom,qualite,email,telephone) values($1,$2,$3,'Bailleur fictif','Personne physique',$4,'0600000001')", [bailleur, ORG, `ESSAI D3R2 ${marque}`, `bailleur-d3r2-${marque}@example.invalid`]);
      await db!.query("insert into persons(id,organization_id,nom,prenom,email,telephone) values($1,$2,$3,'Locataire fictif',$4,'0600000002')", [locataire, ORG, `ESSAI D3R2 ${marque}`, `locataire-d3r2-${marque}@example.invalid`]);
      for (const [nom, x] of Object.entries(dossier)) {
        await db!.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city,copropriete,zone_tendue) values($1,$2,$3,$4::bien_type,'1 rue ESSAI D3R2','69003','Lyon',false,false)", [x.bien, ORG, `ESSAI D3R2 ${nom} ${marque}`, x.type]);
        await db!.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'disponible',40)", [x.lot, ORG, x.bien, `ESSAI D3R2 ${nom} ${marque}`]);
        await db!.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,public.aujourdhui_paris() - 400)", [ORG, x.lot, bailleur]);
        await db!.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
          values($1,$2,$3,'nu','brouillon',public.aujourdhui_paris() + 20,600,40,600,5,$4,'provision','echoir')`, [x.bail, ORG, x.lot, locataire]);
      }
      await db!.query("commit");
      await sansSyntheseAlertes(page);
      const resume = page.locator("article", { hasText: "Résumé de la notice (document d’information)" });
      const signature = page.locator("#signature");
      const GENERER = "Générez le résumé de la notice d’information";

      // ── Parking : la carte du résumé dit « Non demandé », sans renvoyer à une notice à déposer.
      await page.goto(`/espace/${ORG}/baux/${dossier.parking.bail}#notice-deposee`);
      await expect(resume).toBeVisible({ timeout: 60_000 });
      await expect(resume).toContainText("Non demandé");
      await expect(resume.locator("[data-notice-resume]")).toHaveText("Gerimmo en prépare un résumé, pas le texte officiel. Ce bien n’est pas déclaré comme un logement (appartement, maison, immeuble) : Gerimmo ne demande pas ce résumé pour la signature électronique. Si vous le générez, il accompagnera le dossier comme document d’information.");
      await expect(resume).not.toContainText("ne remplace pas la notice");
      await expect(resume.getByRole("button", { name: "Générer le résumé" })).toBeVisible(); // il peut toujours être généré
      await capturer(page, info, "point5-parking-resume-non-demande", resume);
      // ── Parking : la signature électronique ne demande ni le résumé ni la notice (les autres consignes sont là).
      await page.goto(`/espace/${ORG}/baux/${dossier.parking.bail}#signature`);
      await expect(signature).toBeVisible({ timeout: 60_000 });
      await expect(signature.getByText("Joignez le diagnostic ERP", { exact: false })).toBeVisible({ timeout: 60_000 });
      await expect(signature.getByText(GENERER, { exact: false })).toHaveCount(0);
      await expect(signature.getByText("Il ne remplace pas la notice officielle", { exact: false })).toHaveCount(0);
      await expect(signature.getByText("Déposez la notice d’information officielle", { exact: false })).toHaveCount(0);
      await capturer(page, info, "point5-parking-signature-sans-resume-exige", signature);

      // ── Témoin : pour un appartement, le résumé et la notice restent demandés.
      await page.goto(`/espace/${ORG}/baux/${dossier.logement.bail}#notice-deposee`);
      await expect(resume).toContainText("Résumé à générer", { timeout: 60_000 });
      await expect(resume.locator("[data-notice-resume]")).toContainText("Ce résumé ne remplace pas la notice d’information officielle, à déposer dans la carte « Notice d’information officielle »");
      await page.goto(`/espace/${ORG}/baux/${dossier.logement.bail}#signature`);
      await expect(signature.getByText(GENERER, { exact: false })).toBeVisible({ timeout: 60_000 });
      await expect(signature.getByRole("link", { name: /Déposez la notice d’information officielle à l’étape Documents/ })).toBeVisible({ timeout: 60_000 });
    } finally {
      await db!.query("rollback").catch(() => undefined);
      await db!.end();
    }
  });
});

test.describe("agent limité à son portefeuille", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "agent.json"), actionTimeout: 15_000 });

  test("point 2 : la pièce déposée par un collègue ne se rattache pas, et l'écran dit à qui s'adresser", async ({ page }, info) => {
    test.setTimeout(300_000);
    const db = baseFictive();
    test.skip(!db, "Base API fictive locale requise");
    await db!.connect();
    const A = dossierNeuf(), marque = A.bien.slice(0, 8), mandant = randomUUID(), mandat = randomUUID();
    const devisDuCollegue = pdfFictif();
    try {
      const compte = async (email: string) => (await db!.query("select id from auth.users where email = $1", [email])).rows[0].id as string;
      const agent = await compte("agent.alpha@example.com"), admin = await compte("admin.alpha@example.com");
      await db!.query("begin");
      await bailTermine(db!, AGENCE, `ESSAI D3R2 agent ${marque}`, A);
      // Le logement est dans le portefeuille de l'agent (mandat actif à son nom), écrit en administration comme les jeux d'essai.
      await db!.query("set local session_replication_role = replica");
      await db!.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Mandant fictif')", [mandant, AGENCE, `ESSAI D3R2 ${marque}`]);
      await db!.query("insert into mandats(id,organization_id,person_id,etat,date_debut,agent_account_id) values($1,$2,$3,'actif',public.aujourdhui_paris() - 400,$4)", [mandat, AGENCE, mandant, agent]);
      await db!.query("insert into mandat_lignes(organization_id,mandat_id,lot_id,date_debut) values($1,$2,$3,public.aujourdhui_paris() - 400)", [AGENCE, mandat, A.lot]);
      await db!.query("set local session_replication_role = origin");
      // Deux retenues ; la première est justifiée par un devis que l'ADMINISTRATEUR a déposé (rangé dans l'espace).
      const piece = await ranger(db!, AGENCE, "justificatif", `Devis/facture — Peinture du séjour, essai ${marque}`, devisDuCollegue, [], admin);
      await db!.query("insert into retenues(organization_id,restitution_id,libelle,cout,montant_retenu,sans_justificatif,justificatif_document,created_at) values($1,$2,$3,150,150,false,$4,now() - interval '1 minute')", [AGENCE, A.restitution, `Peinture du séjour, essai ${marque}`, piece]);
      await db!.query("insert into retenues(organization_id,restitution_id,libelle,cout,montant_retenu,sans_justificatif) values($1,$2,$3,150,150,true)", [AGENCE, A.restitution, `Peinture de la chambre, essai ${marque}`]);
      await db!.query("commit");
      const etat = async () => (await db!.query("select (select count(*)::int from documents where organization_id = $1) documents, (select count(*)::int from retenues where restitution_id = $2 and justificatif_document is not null) justifiees", [AGENCE, A.restitution])).rows[0];
      const avant = await etat();

      await sansSyntheseAlertes(page);
      await page.goto(`/agence/${AGENCE}/baux/${A.bail}#restitution`);
      const carte = page.locator("#restitution");
      await expect(carte).toBeVisible({ timeout: 60_000 });
      await expect(carte.getByText("Sans justificatif", { exact: true })).toHaveCount(1);
      // L'agent choisit le même fichier que son collègue, pour la seconde retenue du même devis.
      await joindre(carte, devisDuCollegue, "devis-du-collegue.pdf");
      await expect(carte.getByText("Cette pièce a été déposée par une autre personne de votre espace : demandez à un administrateur de la rattacher.")).toBeVisible({ timeout: 60_000 });
      await expect(carte).not.toContainText("Justificatif introuvable");
      await expect(carte).not.toContainText("strictement identique");
      await expect(carte.getByText("Sans justificatif", { exact: true })).toHaveCount(1);
      expect(await etat(), "rien n'est écrit : ni document, ni rattachement").toEqual(avant);
      await capturer(page, info, "point2-agent-piece-d-un-collegue", carte);
    } finally {
      await db!.query("rollback").catch(() => undefined);
      await db!.end();
    }
  });
});
