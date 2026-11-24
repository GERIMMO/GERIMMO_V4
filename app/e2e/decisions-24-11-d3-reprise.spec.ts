import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D3 — REPRISE après relecture.
//  B1 (Q49) : un même devis justifie deux retenues ; une pièce déjà rangée dans le dossier du bail (l'état des lieux de
//             sortie) en justifie une troisième, sans copie ; la pièce d'un autre bail est refusée ; les deux décomptes se
//             produisent alors.
//  M1 (Q49) : l'écran dit que le blocage n'arrête pas le délai de restitution.
//  M4 (Q46) : pour un bien hors habitation (parking), la notice n'est ni exigée ni dite obligatoire.
//  M7 (Q46) : après « Déposer une autre version », l'ancienne notice reste listée sur la fiche du bail.
//
// Dossiers FICTIFS créés ici dans la base du banc, sous des noms « ESSAI D3R » ; les fichiers déposés sont des PDF d'essai.
// Ce banc tourne avec le service de signature FERMÉ : aucun envoi, aucun e-mail. Rien n'est supprimé à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json"), actionTimeout: 15_000 });

/** La base fictive du banc, et elle seule. */
function baseFictive(): Client | null {
  const cible = process.env.SUPALOCAL_DB;
  return cible && /^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible) ? new Client({ connectionString: cible }) : null;
}

test("B1 et M1 : un devis pour deux retenues, l'état des lieux déjà rangé pour une troisième ; les deux décomptes se produisent", async ({ page }) => {
  test.setTimeout(300_000);
  const db = baseFictive();
  test.skip(!db, "Base API fictive locale requise");
  await db!.connect();
  const bien = randomUUID(), lot = randomUUID(), bailleur = randomUUID(), personne = randomUUID(), bail = randomUUID(), autreBail = randomUUID(), restitution = randomUUID(), marque = bien.slice(0, 8);
  const devis = pdfFictif(), edlSortie = pdfFictif(), pieceAutreBail = pdfFictif();
  const empreinte = (octets: Buffer) => createHash("sha256").update(octets).digest("hex");
  try {
    const { rows: [d] } = await db!.query("select (public.aujourdhui_paris() - 400)::text debut, (public.aujourdhui_paris() - 10)::text fin, public.aujourdhui_paris()::text jour");
    await db!.query("begin");
    await db!.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue ESSAI D3R','75001','Paris')", [bien, ORG, `ESSAI D3R retenues ${marque}`]);
    await db!.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible')", [lot, ORG, bien, `ESSAI D3R lot ${marque}`]);
    await db!.query("insert into persons(id,organization_id,nom,prenom,qualite,email,telephone,address_line1,postal_code,city) values($1,$2,$3,'Bailleur fictif','Personne physique',$4,'0600000001','2 rue ESSAI D3R','75001','Paris')", [bailleur, ORG, `ESSAI D3R ${marque}`, `bailleur-d3r-${marque}@example.invalid`]);
    await db!.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,$4)", [ORG, lot, bailleur, d.debut]);
    await db!.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')", [personne, ORG, `ESSAI D3R ${marque}`]);
    // Deux baux terminés sur ce logement : celui de la restitution, et un plus ancien (pour la pièce « d'un autre bail »).
    for (const [id, debut, fin] of [[bail, d.debut, d.fin], [autreBail, "2020-01-01", "2021-01-01"]]) {
      await db!.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,date_fin,date_sortie_reelle,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
        values($1,$2,$3,'nu','termine',$4,$5,$5,600,40,0,5,$6,'provision','echoir')`, [id, ORG, lot, debut, fin, personne]);
    }
    // Restitution finalisée, trois retenues sans justificatif.
    await db!.query("insert into restitutions(id,organization_id,bail_id,date_remise_cles,delai_mois,depot,impayes,statut,solde,date_emission) values($1,$2,$3,$4,2,0,0,'finalise',-450,$5)", [restitution, ORG, bail, d.fin, d.jour]);
    for (const libelle of ["Peinture du séjour", "Peinture de la chambre", "Plan de travail"]) {
      await db!.query("insert into retenues(organization_id,restitution_id,libelle,cout,montant_retenu,sans_justificatif) values($1,$2,$3,150,150,true)", [ORG, restitution, `${libelle}, essai ${marque}`]);
    }
    // Deux pièces DÉJÀ rangées dans Documents (fiches seules, sans fichier au stockage, comme les jeux d'essai) : l'état
    // des lieux de sortie de ce bail, et une pièce du dossier de l'autre bail.
    const ranger = async (octets: Buffer, titre: string, bailLie: string) => {
      const { rows: [{ id }] } = await db!.query(
        `insert into documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
         values($1::uuid,'etat_des_lieux',$2,$1::uuid::text || '/essai-d3r-' || gen_random_uuid() || '.pdf','application/pdf',$3,$4) returning id`, [ORG, titre, octets.length, empreinte(octets)]);
      await db!.query("insert into document_liens(document_id,organization_id,entite,entite_id) values($1,$2,'organisation',$2),($1,$2,'bail',$3)", [id, ORG, bailLie]);
      return id as string;
    };
    const idEdl = await ranger(edlSortie, `État des lieux de sortie, essai ${marque}`, bail);
    await ranger(pieceAutreBail, `État des lieux d'un autre bail, essai ${marque}`, autreBail);
    await db!.query("commit");
    const retenues = async () => (await db!.query("select libelle, justificatif_document piece, sans_justificatif sans from retenues where restitution_id = $1 order by libelle", [restitution])).rows;
    const nombreDeDocuments = async () => (await db!.query("select count(*)::int n from documents where organization_id = $1", [ORG])).rows[0].n as number;

    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/baux/${bail}#restitution`);
    const carte = page.locator("#restitution");
    await expect(carte).toBeVisible({ timeout: 60_000 });
    const sansPiece = carte.getByText("Sans justificatif", { exact: true });
    await expect(sansPiece).toHaveCount(3);

    // ── M1 : l'écran dit ce que le blocage ne fait pas, et qu'une même pièce se réutilise.
    const regle = carte.locator("[data-retenues-sans-justificatif]");
    await expect(regle.locator("[data-delai-court-toujours]")).toHaveText(/Ce blocage n'arrête pas le délai de restitution du dépôt : il continue de courir depuis la remise des clés\./);
    await expect(regle.locator("[data-meme-piece]")).toHaveText(/Une même pièce peut justifier plusieurs retenues : choisissez de nouveau le même fichier, il est rattaché sans copie/);
    await expect(carte.locator("[data-decompte-finalise-sans-piece]")).toContainText("il ne peut plus être généré de nouveau tant que la pièce manque");
    expect(await debordementHorizontal(page), "débordement à 390 px").toBeLessThanOrEqual(1);

    /** Joint un fichier à la première retenue encore sans justificatif. */
    const joindre = async (octets: Buffer, nom: string) => {
      await carte.locator('input[type="file"][name="justificatif"]').first().setInputFiles({ name: nom, mimeType: "application/pdf", buffer: octets });
      await carte.getByRole("button", { name: "Joindre le devis / la facture" }).first().click();
    };

    // ── B1 (1) : le même devis pour deux retenues. Déposé pour la première, rattaché sans copie à la seconde.
    const avant = await nombreDeDocuments();
    await joindre(devis, "devis-essai.pdf");
    await expect(sansPiece).toHaveCount(2, { timeout: 60_000 });
    await joindre(devis, "devis-essai.pdf");
    await expect(sansPiece).toHaveCount(1, { timeout: 60_000 });
    expect(await nombreDeDocuments(), "un seul document pour les deux retenues").toBe(avant + 1);

    // ── B1 (2) : la pièce du dossier d'un AUTRE bail est refusée, et l'écran le dit.
    await joindre(pieceAutreBail, "autre-bail.pdf");
    // Seconde reprise du lot D3 : le message nomme aussi « un autre logement » et dit l'issue pour une pièce commune.
    await expect(carte.getByText("Cette pièce est rangée dans le dossier d'un autre bail ou d'un autre logement : elle ne peut pas justifier cette retenue. Déposez le justificatif propre à ce bail, ou rangez-la aussi dans le dossier de ce bail")).toBeVisible({ timeout: 60_000 });
    await expect(sansPiece).toHaveCount(1);

    // ── B1 (3) : l'état des lieux de sortie déjà rangé dans le dossier de ce bail justifie la troisième, sans copie.
    await joindre(edlSortie, "etat-des-lieux-sortie.pdf");
    await expect(sansPiece).toHaveCount(0, { timeout: 60_000 });
    await expect(regle).toHaveCount(0);
    expect(await nombreDeDocuments(), "aucune copie").toBe(avant + 1);
    const lignes = await retenues();
    expect(lignes.every((l) => l.piece && l.sans === false)).toBe(true);
    expect(new Set(lignes.map((l) => l.piece)).size, "deux pièces pour trois retenues").toBe(2);
    expect(lignes.filter((l) => l.piece === idEdl)).toHaveLength(1);

    // ── Les deux décomptes se produisent.
    await carte.getByRole("button", { name: "Générer le décompte PDF" }).click();
    await expect(carte.getByRole("link", { name: "Ouvrir le PDF" })).toBeVisible({ timeout: 120_000 });
    await expect(carte).not.toContainText("À renseigner avant de générer le PDF");
    await page.goto(`/espace/${ORG}/documents/catalogue?modele=decompte_retenues&bail=${bail}`);
    await page.locator('select[name="cible"]').selectOption(bail);
    await page.getByRole("button", { name: "Générer le PDF" }).click();
    await expect(page.getByRole("link", { name: "Ouvrir le PDF" })).toBeVisible({ timeout: 120_000 });
    for (const largeur of [390, 1440]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      expect(await debordementHorizontal(page), `débordement à ${largeur} px`).toBeLessThanOrEqual(1);
    }
  } finally {
    await db!.query("rollback").catch(() => undefined);
    await db!.end();
  }
});

test("M4 et M7 : parking sans notice exigée ; les anciennes versions de la notice restent listées sur la fiche du bail", async ({ page }) => {
  test.setTimeout(300_000);
  const db = baseFictive();
  test.skip(!db, "Base API fictive locale requise");
  await db!.connect();
  const marque = randomUUID().slice(0, 8), bailleur = randomUUID(), locataire = randomUUID();
  const dossier = { logement: { bien: randomUUID(), lot: randomUUID(), bail: randomUUID(), type: "appartement" }, parking: { bien: randomUUID(), lot: randomUUID(), bail: randomUUID(), type: "parking" } };
  try {
    await db!.query("begin");
    await db!.query("insert into persons(id,organization_id,nom,prenom,qualite,email,telephone) values($1,$2,$3,'Bailleur fictif','Personne physique',$4,'0600000001')", [bailleur, ORG, `ESSAI D3R ${marque}`, `bailleur-d3r-${marque}@example.invalid`]);
    await db!.query("insert into persons(id,organization_id,nom,prenom,email,telephone) values($1,$2,$3,'Locataire fictif',$4,'0600000002')", [locataire, ORG, `ESSAI D3R ${marque}`, `locataire-d3r-${marque}@example.invalid`]);
    for (const [nom, x] of Object.entries(dossier)) {
      await db!.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city,copropriete,zone_tendue) values($1,$2,$3,$4::bien_type,'1 rue ESSAI D3R','69003','Lyon',false,false)", [x.bien, ORG, `ESSAI D3R ${nom} ${marque}`, x.type]);
      await db!.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'disponible',40)", [x.lot, ORG, x.bien, `ESSAI D3R ${nom} ${marque}`]);
      await db!.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,public.aujourdhui_paris() - 400)", [ORG, x.lot, bailleur]);
      await db!.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
        values($1,$2,$3,'nu','brouillon',public.aujourdhui_paris() + 20,600,40,600,5,$4,'provision','echoir')`, [x.bail, ORG, x.lot, locataire]);
    }
    await db!.query("commit");
    await sansSyntheseAlertes(page);
    const carte = page.locator("#notice-deposee");
    const signature = page.locator("#signature");

    // ── M4 : parking. Ni « obligatoire », ni blocage de la signature électronique, ni rappel pour la voie papier.
    await page.goto(`/espace/${ORG}/baux/${dossier.parking.bail}#notice-deposee`);
    await expect(carte).toBeVisible({ timeout: 60_000 });
    await expect(carte).toContainText("Non demandée");
    await expect(carte).toContainText("Bien déclaré hors habitation · Non demandée par Gerimmo");
    await expect(carte.locator("[data-notice-effet]")).toHaveText("Ce bien n’est pas déclaré comme un logement (appartement, maison, immeuble) : Gerimmo ne bloque pas la signature électronique sans la notice. Si vous la déposez, elle sera jointe au dossier.");
    await expect(carte).not.toContainText("Obligatoire");
    await expect(carte.getByRole("button", { name: "Déposer la notice" })).toBeVisible(); // le dépôt reste possible
    await page.goto(`/espace/${ORG}/baux/${dossier.parking.bail}#signature`);
    await expect(signature).toBeVisible({ timeout: 60_000 });
    // Les autres consignes de la signature sont chargées (le diagnostic ERP) : la notice n'en fait pas partie.
    // Seconde reprise du lot D3 (point 5) : ce test figeait « le résumé reste demandé » pour un parking. Hors habitation,
    // le résumé de la notice n'est plus exigé non plus ; on attend donc une autre consigne pour savoir l'écran chargé.
    await expect(signature.getByText("Joignez le diagnostic ERP", { exact: false })).toBeVisible({ timeout: 60_000 });
    await expect(signature.getByText("Générez le résumé de la notice d’information", { exact: false })).toHaveCount(0);
    await expect(signature.getByText("Déposez la notice d’information officielle", { exact: false })).toHaveCount(0);
    await expect(signature.locator("[data-rappel-notice-papier]")).toHaveCount(0);

    // ── Témoin : pour un appartement, rien ne change (blocage et rappel).
    await page.goto(`/espace/${ORG}/baux/${dossier.logement.bail}#signature`);
    await expect(signature.locator("[data-rappel-notice-papier]")).toBeVisible({ timeout: 60_000 });
    await expect(signature.getByRole("link", { name: /Déposez la notice d’information officielle à l’étape Documents/ })).toBeVisible({ timeout: 60_000 });

    // ── M7 : deux dépôts successifs ; l'ancienne version reste listée, avec un lien vers son fichier.
    await page.goto(`/espace/${ORG}/baux/${dossier.logement.bail}#notice-deposee`);
    await expect(carte).toContainText("Obligatoire · Annexée au bail", { timeout: 60_000 });
    await expect(carte.locator("[data-anciennes-notices]")).toHaveCount(0);
    await carte.locator("#depot-notice-information").setInputFiles({ name: "notice-v1.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await carte.getByRole("button", { name: "Déposer la notice" }).click();
    await expect(carte.getByRole("button", { name: "Déposer une autre version" })).toBeVisible({ timeout: 60_000 });
    await expect(carte.locator("[data-anciennes-notices]")).toHaveCount(0);
    await carte.locator("#depot-notice-information").setInputFiles({ name: "notice-v2.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await carte.getByRole("button", { name: "Déposer une autre version" }).click();
    const anciennes = carte.locator("[data-anciennes-notices]");
    await expect(anciennes.locator("summary")).toHaveText("Anciennes versions (1)", { timeout: 60_000 });
    await anciennes.locator("summary").click();
    const notices = (await db!.query("select d.id from document_liens l join documents d on d.id = l.document_id where l.entite = 'bail' and l.entite_id = $1 and d.type = 'notice_information' order by d.created_at", [dossier.logement.bail])).rows;
    expect(notices).toHaveLength(2);
    await expect(anciennes.getByRole("link", { name: /^Notice déposée le / })).toHaveAttribute("href", `/espace/${ORG}/documents/${notices[0].id}/fichier`);
    for (const largeur of [390, 1440]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      expect(await debordementHorizontal(page), `débordement à ${largeur} px`).toBeLessThanOrEqual(1);
    }
  } finally {
    await db!.query("rollback").catch(() => undefined);
    await db!.end();
  }
});
