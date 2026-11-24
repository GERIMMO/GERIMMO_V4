import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { pdfFictif } from "./pdf-fictif";

// DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D3 — dossier du bail et sortie.
//  Q46 : le bailleur dépose lui-même la notice d'information officielle ; sans elle, la signature électronique du bail
//        est bloquée (consigne claire, lien vers le dépôt) ; déposée, elle rejoint les annexes ; la voie papier n'est
//        pas bloquée, elle est rappelée.
//  Q28 : plusieurs diagnostics de performance énergétique pour le logement → avertissement neutre (la règle ne change pas).
//  Q49 : une retenue sans justificatif bloque le décompte, avec la ligne « À renseigner » et son lien ; un devis suffit.
// (Q38, la source des repères fiscaux, est tenue par reperes-fiscaux.spec.ts.)
//
// Dossiers FICTIFS créés ici dans la base du banc, sous des noms « ESSAI D3 » ; les fichiers déposés sont des PDF d'essai,
// pas des textes officiels. Ce banc tourne avec le service de signature FERMÉ : aucun envoi, aucun e-mail. Rien n'est
// supprimé à la fin (les pièces déposées restent rattachées à leur dossier fictif).

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json"), actionTimeout: 15_000 });

/** La base fictive du banc, et elle seule. */
function baseFictive(): Client | null {
  const cible = process.env.SUPALOCAL_DB;
  return cible && /^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible) ? new Client({ connectionString: cible }) : null;
}

test("Q46 et Q28 : notice à déposer, signature électronique bloquée sans elle puis débloquée ; avertissement « plusieurs DPE »", async ({ page }, info) => {
  test.setTimeout(240_000);
  const db = baseFictive();
  test.skip(!db, "Base API fictive locale requise");
  await db!.connect();
  const bien = randomUUID(), lot = randomUUID(), bailleur = randomUUID(), locataire = randomUUID(), bail = randomUUID(), marque = bien.slice(0, 8);
  try {
    await db!.query("begin");
    await db!.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city,copropriete,zone_tendue) values($1,$2,$3,'appartement','1 rue ESSAI D3','69003','Lyon',false,false)", [bien, ORG, `ESSAI D3 notice ${marque}`]);
    await db!.query("insert into lots(id,organization_id,bien_id,nom,etat,surface_m2) values($1,$2,$3,$4,'disponible',40)", [lot, ORG, bien, `ESSAI D3 lot ${marque}`]);
    await db!.query("insert into persons(id,organization_id,nom,prenom,qualite,email,telephone) values($1,$2,$3,'Bailleur fictif','Personne physique',$4,'0600000001')", [bailleur, ORG, `ESSAI D3 ${marque}`, `bailleur-d3-${marque}@example.invalid`]);
    await db!.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,public.aujourdhui_paris() - 400)", [ORG, lot, bailleur]);
    await db!.query("insert into persons(id,organization_id,nom,prenom,email,telephone) values($1,$2,$3,'Locataire fictif',$4,'0600000002')", [locataire, ORG, `ESSAI D3 ${marque}`, `locataire-d3-${marque}@example.invalid`]);
    await db!.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
      values($1,$2,$3,'nu','brouillon',public.aujourdhui_paris() + 20,600,40,600,5,$4,'provision','echoir')`, [bail, ORG, lot, locataire]);
    // Le DPE le plus récent d'abord (classe D), puis un plus ancien saisi après coup (classe E) : il archive le premier.
    await db!.query("insert into diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,classe_dpe) values($1,$2,'dpe',date '2026-10-01',date '2036-10-01','D')", [ORG, lot]);
    await db!.query("insert into diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,classe_dpe) values($1,$2,'dpe',date '2023-06-15',date '2033-06-15','E')", [ORG, lot]);
    await db!.query("commit");
    const notices = async () => (await db!.query(
      "select d.titre, d.mime_type from document_liens l join documents d on d.id = l.document_id where l.entite = 'bail' and l.entite_id = $1 and d.type = 'notice_information' and d.purged_at is null", [bail])).rows;

    await sansSyntheseAlertes(page);
    // ── 1. Étape Documents : la carte du dépôt, « À déposer », et ce que Gerimmo ne fait pas.
    await page.goto(`/espace/${ORG}/baux/${bail}#notice-deposee`);
    const carte = page.locator("#notice-deposee");
    await expect(carte).toBeVisible({ timeout: 60_000 });
    await expect(carte.getByRole("heading", { name: "Notice d’information officielle" })).toBeVisible();
    await expect(carte).toContainText("À déposer");
    await expect(carte.locator("[data-notice-officielle]")).toContainText("Gerimmo ne fournit pas ce texte et ne vérifie pas le fichier déposé");
    // Textes officiels, lot T2 (R06-A1) : l'écran dit quelle version déposer (recueil : annexe en vigueur depuis le 18/10/2026).
    await expect(carte.locator("[data-notice-version]")).toContainText("Version à déposer pour un contrat conclu ou renouvelé depuis le 18 octobre 2026 : l’annexe de l’arrêté du 29 mai 2015 dans sa rédaction issue de l’arrêté du 9 octobre 2026.");
    await expect(carte.locator("[data-notice-effet]")).toHaveText("Sans elle, l’envoi du bail en signature électronique est bloqué. Pour une signature sur papier, annexez-la vous-même au contrat.");
    // Le résumé de Gerimmo garde sa carte, sous son nom de résumé.
    await expect(page.getByRole("heading", { name: "Résumé de la notice (document d’information)" })).toBeVisible();

    // ── 2. Q28 : deux DPE pour ce logement, le plus ancien saisi en dernier → avertissement, sans rien changer.
    const dpe = page.locator("#completer-dpe [data-avertissement-dpe]");
    await expect(dpe).toBeVisible();
    await expect(dpe).toContainText("Gerimmo retient aujourd’hui le diagnostic établi le 15/06/2023 (classe E) : c’est le dernier enregistré pour ce logement. Sa classe est celle que le contrat imprime.");
    await expect(dpe).toContainText("Le plus récent par sa date d’établissement est le diagnostic établi le 01/10/2026 (classe D), remplacé depuis dans Gerimmo.");
    await expect(dpe).toContainText("La règle qui dit lequel décide sera fixée après lecture du texte officiel.");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);

    // ── 3. Signature : la voie papier n'est pas bloquée (rappel) ; la voie électronique l'est, avec un lien vers le dépôt.
    await page.goto(`/espace/${ORG}/baux/${bail}#signature`);
    const signature = page.locator("#signature");
    await expect(signature).toBeVisible({ timeout: 60_000 });
    const rappel = signature.locator("[data-rappel-notice-papier]");
    await expect(rappel).toContainText("Signature sur papier : annexez vous-même au contrat la notice d’information officielle, en entier.");
    await expect(rappel.getByRole("link", { name: "Voir la notice de ce bail" })).toHaveAttribute("href", "#notice-deposee");
    const consigne = signature.getByRole("link", { name: /Déposez la notice d’information officielle à l’étape Documents : l’envoi en signature électronique est bloqué sans elle\./ });
    await expect(consigne).toBeVisible({ timeout: 60_000 });
    await expect(consigne).toHaveAttribute("href", "#notice-deposee");
    await expect(signature.getByRole("button", { name: "Préparer le PDF et son circuit" })).toBeDisabled();
    await signature.screenshot({ path: info.outputPath("d3-signature-bloquee.png") });

    // ── 4. Le lien mène au dépôt ; le PDF déposé est rangé sous le type dédié, lié au bail.
    await consigne.click();
    await expect(carte).toBeVisible();
    const champ = carte.locator("#depot-notice-information");
    await champ.setInputFiles({ name: "notice-essai.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await carte.getByRole("button", { name: "Déposer la notice" }).click();
    await expect(carte.locator("[data-notice-effet]")).toHaveText("Elle sera jointe au dossier de signature électronique, comme annexe du contrat. Pour une signature sur papier, annexez-la vous-même au contrat.", { timeout: 60_000 });
    await expect(carte).toContainText("Déposée");
    await expect(carte.getByRole("button", { name: "Déposer une autre version" })).toBeVisible();
    expect(await notices()).toEqual([{ titre: "Notice d'information (déposée par le bailleur)", mime_type: "application/pdf" }]);
    await carte.screenshot({ path: info.outputPath("d3-notice-deposee.png") });

    // ── 5. Signature : la consigne a disparu ; la notice figure parmi les annexes jointes au contrat.
    await page.goto(`/espace/${ORG}/baux/${bail}#signature`);
    await expect(signature.getByText("Annexes jointes au contrat", { exact: false })).toBeVisible({ timeout: 60_000 });
    await expect(signature.getByRole("link", { name: "Notice d'information (déposée par le bailleur)" })).toBeVisible();
    await expect(signature.getByText("Déposez la notice d’information officielle", { exact: false })).toHaveCount(0);
    for (const largeur of [390, 1440]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      expect(await debordementHorizontal(page), `débordement à ${largeur} px`).toBeLessThanOrEqual(1);
    }
  } finally {
    await db!.query("rollback").catch(() => undefined);
    await db!.end();
  }
});

test("Q49 : une retenue sans justificatif bloque le décompte et dit où le joindre ; un devis le débloque", async ({ page }, info) => {
  test.setTimeout(240_000);
  const db = baseFictive();
  test.skip(!db, "Base API fictive locale requise");
  await db!.connect();
  const bien = randomUUID(), lot = randomUUID(), bailleur = randomUUID(), personne = randomUUID(), bail = randomUUID(), restitution = randomUUID(), marque = bien.slice(0, 8);
  const LIBELLE = `Remise en peinture du séjour, essai ${marque}`;
  try {
    const { rows: [d] } = await db!.query("select (public.aujourdhui_paris() - 400)::text debut, (public.aujourdhui_paris() - 10)::text fin, public.aujourdhui_paris()::text jour");
    await db!.query("begin");
    await db!.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue ESSAI D3','75001','Paris')", [bien, ORG, `ESSAI D3 retenue ${marque}`]);
    await db!.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'disponible')", [lot, ORG, bien, `ESSAI D3 lot ${marque}`]);
    // Un bailleur complet (le décompte porte son nom, son adresse et sa commune) : seul le justificatif doit manquer.
    await db!.query("insert into persons(id,organization_id,nom,prenom,qualite,email,telephone,address_line1,postal_code,city) values($1,$2,$3,'Bailleur fictif','Personne physique',$4,'0600000001','2 rue ESSAI D3','75001','Paris')", [bailleur, ORG, `ESSAI D3 ${marque}`, `bailleur-d3-${marque}@example.invalid`]);
    await db!.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,$4)", [ORG, lot, bailleur, d.debut]);
    await db!.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')", [personne, ORG, `ESSAI D3 ${marque}`]);
    await db!.query(`insert into baux(id,organization_id,lot_id,type,etat,date_debut,date_fin,date_sortie_reelle,loyer_hc,charges,depot_garantie,jour_echeance,locataire_principal,charges_mode,paiement_echeance)
      values($1,$2,$3,'nu','termine',$4,$5,$5,600,40,0,5,$6,'provision','echoir')`, [bail, ORG, lot, d.debut, d.fin, personne]);
    // Restitution finalisée, avec UNE retenue sans justificatif (un cas que l'écran laisse enregistrer).
    await db!.query("insert into restitutions(id,organization_id,bail_id,date_remise_cles,delai_mois,depot,impayes,statut,solde,date_emission) values($1,$2,$3,$4,2,0,0,'finalise',-150,$5)", [restitution, ORG, bail, d.fin, d.jour]);
    await db!.query("insert into retenues(organization_id,restitution_id,libelle,cout,montant_retenu,sans_justificatif) values($1,$2,$3,150,150,true)", [ORG, restitution, LIBELLE]);
    await db!.query("commit");

    await sansSyntheseAlertes(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/espace/${ORG}/baux/${bail}#restitution`);
    const carte = page.locator("#restitution");
    await expect(carte).toBeVisible({ timeout: 60_000 });

    // ── 1. L'écran dit la règle avant le geste.
    await expect(carte.locator("[data-retenues-sans-justificatif]")).toHaveText(/Chaque retenue demande un justificatif : un devis suffit, comme une facture, un état des lieux ou des photos\. Tant qu'une retenue n'a pas le sien, ni le décompte de restitution ni le décompte des retenues ne peuvent être générés\./);

    // ── 2. Le décompte est bloqué : une ligne « À renseigner » nomme la retenue et mène à la restitution du dépôt.
    await carte.getByRole("button", { name: "Générer le décompte PDF" }).click();
    await expect(carte).toContainText(`À renseigner avant de générer le PDF : justificatif de la retenue « ${LIBELLE} » (un devis suffit)`, { timeout: 90_000 });
    await expect(carte).toContainText("PDF non généré : 1 information est encore obligatoire.");
    await expect(carte.getByRole("link", { name: /renseigner \(restitution du dépôt de garantie\)/ })).toHaveAttribute("href", `/espace/${ORG}/baux/${bail}#restitution`);
    await expect(carte.getByRole("link", { name: "Ouvrir le PDF" })).toHaveCount(0);
    await expect(carte).not.toContainText("Non fourni");
    // Un libellé long ne fait pas défiler l'écran d'un téléphone de côté.
    expect(await debordementHorizontal(page), "débordement à 390 px").toBeLessThanOrEqual(1);
    await carte.screenshot({ path: info.outputPath("d3-decompte-bloque-390.png") });

    // ── 3. Un devis suffit : joint à la retenue (même après la finalisation), il débloque le décompte.
    await carte.locator('input[type="file"][name="justificatif"]').first().setInputFiles({ name: "devis-essai.pdf", mimeType: "application/pdf", buffer: pdfFictif() });
    await carte.getByRole("button", { name: "Joindre le devis / la facture" }).click();
    await expect(carte.getByText("Sans justificatif", { exact: true })).toHaveCount(0, { timeout: 60_000 });
    await expect(carte.locator("[data-retenues-sans-justificatif]")).toHaveCount(0);
    expect((await db!.query("select justificatif_document is not null piece, sans_justificatif from retenues where restitution_id = $1", [restitution])).rows).toEqual([{ piece: true, sans_justificatif: false }]);
    await carte.getByRole("button", { name: "Générer le décompte PDF" }).click();
    await expect(carte.getByRole("link", { name: "Ouvrir le PDF" })).toBeVisible({ timeout: 120_000 });
    await expect(carte).not.toContainText("À renseigner avant de générer le PDF");
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await debordementHorizontal(page), "débordement à 1440 px").toBeLessThanOrEqual(1);
    await carte.screenshot({ path: info.outputPath("d3-decompte-genere-1440.png") });
  } finally {
    await db!.query("rollback").catch(() => undefined);
    await db!.end();
  }
});
