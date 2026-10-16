import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { Client, type ClientConfig } from "pg";
import { lireComptes, verifierCible } from "./cible";
import { cliquer, espaceDe, expect, test } from "./outils";

// RECETTE — LES QUATRE P1 « MONTANT FAUX » (Q3/Q5), sur le compte éphémère du propriétaire direct.
//
// Décisions du dirigeant du 14/10/2026 (page « Décisions groupées », fiches du registre des anomalies) :
//  · D04, VER-TS-02 : « 840,00 » tapé dans un navigateur dont la langue n'est pas le français devenait 84 000 €. Attendu :
//    840,00 € enregistrés et affichés. Le navigateur de ce test est réglé en anglais (en-US), comme celui de la fiche.
//  · D05 (A), PR178-B-06 : après une réponse perdue, le second clic encaissait une seconde fois. Attendu : la même clé
//    d'envoi, un seul encaissement, et l'écran dit « déjà enregistré ».
//  · D37 (B), CHF-01 : la ligne 250 (intérêts d'emprunt) du récapitulatif 2044 partait d'un champ à 0. Attendu : l'écran
//    du récapitulatif porte en ligne 250 le montant qualifié, et le champ du « Récapitulatif annuel · location nue » est
//    prérempli avec ce montant (le PDF le reprend). Le PDF n'est PAS généré ici : il serait rangé dans Documents, donc
//    déposé dans le stockage de fichiers, que le nettoyage ne garantit pas d'effacer (purger.sql, « FICHIERS »).
//  · D38 (A), CHF-02 : une régularisation de l'exercice en cours était acceptée sans alerte. Attendu : avertissement
//    « exercice non terminé : comparaison non homogène » et confirmation explicite exigée ; sans elle, le serveur refuse,
//    avant tout dépôt de justificatif. Le chemin confirmé n'est PAS joué : il enregistrerait une régularisation qui ne se
//    modifie plus et déposerait son justificatif dans le stockage de fichiers.
//
// CE QUE LE TEST CRÉE, ET COMMENT C'EST RETIRÉ. Dans le parc éphémère du propriétaire (« Parc de Paul Recette-<suffixe> »),
// et seulement là : un bien et son lot, une fiche de locataire SANS adresse e-mail (aucun avis ni quittance ne peut partir),
// un bail actif, un appel de loyer de 840,00 € et une dépense « intérêts d'emprunt » de 2 345,67 €, posés en base par la
// connexion de la recette ; puis, par les écrans, deux encaissements, la confirmation de l'exercice fiscal du lot et la
// qualification de la dépense en ligne 250. Tout porte sur l'organisation du suffixe : `purger.sql` le retire (toute table
// qui porte `organization_id`). Aucun fichier n'est déposé, aucun e-mail ne part, aucun paiement n'est demandé.
//
// OÙ IL TOURNE. Seulement avec une connexion à la base de la recette (variables PG*) : le chantier « Recette de production
// avec nettoyage » la fournit ; le chantier manuel « Recette de production » ne la fournit pas et saute ce test. Sur le banc
// local (RECETTE_URL en localhost), la base doit être une base jetable gerimmo_ci_… de ce poste.
//
// L'ORDRE. Ce test active un bail dans le parc : le parcours de démarrage du propriétaire se referme alors, et le test
// « se connecte et voit le parcours de démarrage » (proprietaire.spec.ts) échouerait après lui. La configuration le range
// dans son propre projet, déclaré en dernier (étiquette @montants) : il passe après tous les autres.

const MONTANTS = { tag: "@montants" };

/** La connexion à la base de la recette : la production (mêmes garde-fous que inscription-recuperation.spec.ts), ou une base jetable locale. */
function configurationBase(suffixe: string): ClientConfig {
  const cible = new URL(verifierCible(process.env.RECETTE_URL));
  if (cible.hostname === "www.gerimmo.app") {
    if (process.env.PGHOST !== "aws-0-eu-west-3.pooler.supabase.com" || process.env.PGUSER !== "postgres.rddlxunppddzpsaatdaz"
      || process.env.PGDATABASE !== "postgres" || !process.env.PGPASSWORD || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(suffixe)) {
      throw new Error("Cible de recette refusée.");
    }
    // Autorité officielle Supabase, avec contrôle de la chaîne ET du nom d'hôte.
    return { ssl: { ca: readFileSync(join(__dirname, "supabase-ca.crt"), "utf8"), rejectUnauthorized: true } };
  }
  if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST ?? "") || !/^gerimmo_ci_[a-z_]+$/.test(process.env.PGDATABASE ?? "")) {
    throw new Error("Sur le banc, la recette n'écrit que dans une base jetable locale gerimmo_ci_….");
  }
  return {};
}

type Dossier = { org: string; bien: string; lot: string; bail: string; annee: number; nomLot: string; categorie: string };

test.describe("P1 « montant faux » (Q3/Q5) : D04, D05, D37, D38", MONTANTS, () => {
  test.describe.configure({ mode: "serial" });
  // VER-TS-02 : la fiche a été constatée avec un navigateur en anglais.
  test.use({ persona: "proprietaire", locale: "en-US" });

  let db: Client;
  let d: Dossier;

  test.beforeAll(async () => {
    test.skip(!process.env.PGHOST, "Les fixtures et les contrôles en base demandent la connexion du chantier « Recette de production avec nettoyage ».");
    const comptes = lireComptes();
    db = new Client(configurationBase(comptes.suffixe));
    await db.connect();
    // Le parc éphémère, et lui seul : celui que preparer-comptes.sql a ouvert pour ce suffixe, au propriétaire de ce passage.
    const { rows: [parc] } = await db.query<{ id: string; compte: string }>(
      `select o.id, m.account_id as compte
         from public.organizations o
         join public.memberships m on m.organization_id = o.id and m.role = 'proprietaire_direct'
         join public.accounts a on a.id = m.account_id
        where o.id = $1 and o.type = 'proprietaire_direct' and o.name = 'Parc de Paul Recette-' || $2 and lower(a.email) = $3`,
      [comptes.orgProprietaire, comptes.suffixe, comptes.emails.proprietaire]
    );
    if (!parc) throw new Error("Le parc éphémère de ce passage est introuvable : rien n'est créé.");
    const essai = `${comptes.suffixe} ${test.info().retry}-${Date.now().toString(36).slice(-5)}`;
    await db.query("begin");
    try {
      const { rows: [{ annee }] } = await db.query<{ annee: number }>("select extract(year from public.aujourdhui_paris())::int as annee");
      const nomLot = `Lot montants ${essai}`;
      const { rows: [{ id: bien }] } = await db.query<{ id: string }>(
        `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, annee_construction, parties_communes, acces_tic, created_by)
         values ($1, $2, 'appartement', '3 rue des Montants', '69002', 'Lyon', 1998, 'Hall d''entrée', 'Fibre optique', $3) returning id`,
        [parc.id, `Montants recette ${essai}`, parc.compte]
      );
      const { rows: [{ id: lot }] } = await db.query<{ id: string }>(
        `insert into public.lots (bien_id, organization_id, nom, surface_m2, pieces, etat, created_by)
         values ($1, $2, $3, 30, 1, 'loue', $4) returning id`,
        [bien, parc.id, nomLot, parc.compte]
      );
      // Sans adresse e-mail : ni avis d'échéance, ni quittance, ni relance ne peut partir vers qui que ce soit.
      const { rows: [{ id: locataire }] } = await db.query<{ id: string }>(
        `insert into public.persons (organization_id, nom, prenom, qualite) values ($1, $2, 'Locataire fictif', 'Personne physique') returning id`,
        [parc.id, `Recette-${essai}`]
      );
      // Bail nu à provisions, commencé le 1er janvier : l'exercice en cours est couvert (D38).
      const { rows: [{ id: bail }] } = await db.query<{ id: string }>(
        `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance, locataire_principal)
         values ($1, $2, 'nu', 'actif', 780, 60, make_date($3, 1, 1), 5, $4) returning id`,
        [parc.id, lot, annee, locataire]
      );
      // Un terme de 840,00 € échu la veille (jour de Paris) : 840,00 € encaissés le soldent, sans demande de confirmation.
      await db.query(
        `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance, loyer_hc, charges, montant_du)
         values ($1, $2, date_trunc('month', public.aujourdhui_paris())::date, public.aujourdhui_paris() - 1, 780, 60, 840)`,
        [parc.id, bail]
      );
      // La pièce de CHF-01 : 2 345,67 € d'intérêts d'emprunt, à qualifier en ligne 250 par l'écran.
      const categorie = `Intérêts d'emprunt ${essai}`;
      await db.query(
        `insert into public.ecritures (organization_id, lot_id, categorie, sens, montant, date_piece)
         values ($1, $2, $3, 'depense', 2345.67, public.aujourdhui_paris())`,
        [parc.id, lot, categorie]
      );
      await db.query("commit");
      d = { org: parc.id, bien, lot, bail, annee, nomLot, categorie };
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  });

  test.afterAll(async () => {
    // Rien n'est retiré ici : le nettoyage du chantier (purger.sql) retire toute l'organisation du suffixe.
    await db?.end();
  });

  const encaissements = async () =>
    (await db.query<{ montant: string; cle_envoi: string | null }>(
      // Au centime près : « 840.00 » si la base porte exactement 840, sinon sa valeur brute (une fraction de centime se verrait).
      `select case when montant = round(montant, 2) then to_char(montant, 'FM999999990.00') else montant::text end as montant,
              cle_envoi::text as cle_envoi
         from public.encaissements where bail_id = $1 order by created_at`, [d.bail]
    )).rows;
  const carteLoyers = (page: Page) => page.locator("#loyers");
  const montantSaisi = (page: Page) => page.locator("#enc-montant");
  const boutonEncaisser = (page: Page) => carteLoyers(page).getByRole("button", { name: "Encaisser", exact: true });

  test("D04 : « 840,00 » tapé avec la virgule est enregistré et affiché 840,00 €", async ({ page }) => {
    await page.goto(`${espaceDe("proprietaire")}/baux/${d.bail}`);
    await expect(carteLoyers(page)).toContainText("Loyers & paiements");
    await expect(montantSaisi(page)).toHaveAttribute("type", "text");
    // Saisie dès que le champ est là, comme au premier essai en échec du 16/10 : avant l'hydratation, le champ est déjà
    // saisissable et seul « Encaisser » est inerte (D30). Puis on attend l'activation d'« Encaisser » et on lit le champ
    // AVANT d'envoyer : une saisie perdue à l'hydratation ou dans le navigateur échoue ici, un refus du serveur plus bas.
    test.info().annotations.push({
      type: "D04",
      description: (await boutonEncaisser(page).isDisabled()) ? "saisie avant hydratation" : "saisie après hydratation",
    });
    await montantSaisi(page).pressSequentially("840,00");
    await expect(boutonEncaisser(page)).toBeEnabled();
    await expect(montantSaisi(page)).toHaveValue("840,00");
    await cliquer(boutonEncaisser(page));
    await expect(carteLoyers(page)).toContainText(/840,00\s€ encaissés/);
    // Aucune demande de confirmation : 840,00 € est le terme dû, pas un montant cent fois trop grand.
    await expect(carteLoyers(page).getByText("Vérifiez ce montant avant de l'enregistrer")).toHaveCount(0);
    expect((await encaissements()).map((e) => e.montant)).toEqual(["840.00"]);
    // Affiché après rechargement : la liste des encaissements et la tuile « Encaissé ».
    await page.reload();
    const liste = carteLoyers(page).locator("li").filter({ hasText: /^840,00\s€/ });
    await expect(liste).toHaveCount(1);
    await expect(carteLoyers(page).locator(".kpi").filter({ hasText: "Encaissé" })).toContainText(/840,00\s€/);
  });

  test("D05 : le même envoi rejoué après une réponse perdue n'encaisse qu'une fois", async ({ page }) => {
    await page.goto(`${espaceDe("proprietaire")}/baux/${d.bail}`);
    const cle = page.locator('input[name="cle_envoi"]');
    await expect(cle).toHaveValue(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const cleEnvoi = await cle.inputValue();
    // La réponse perdue : la requête de l'action part et le serveur la traite, mais le navigateur n'en reçoit rien.
    let perdue = false;
    let statutServeur = 0;
    await page.route(() => true, async (route) => {
      const requete = route.request();
      if (perdue || requete.method() !== "POST" || !requete.headers()["next-action"]) return route.fallback();
      perdue = true;
      statutServeur = (await route.fetch()).status();
      await route.abort("connectionreset");
    });
    await montantSaisi(page).pressSequentially("15,00");
    await expect(montantSaisi(page)).toHaveValue("15,00");
    await expect(boutonEncaisser(page)).toBeEnabled();
    await cliquer(boutonEncaisser(page));
    await expect(carteLoyers(page)).toContainText("La confirmation n’a pas pu être reçue");
    expect(perdue).toBe(true);
    expect(statutServeur).toBeLessThan(400);
    // Le serveur avait bien encaissé : c'est ce qui rend le second clic dangereux.
    expect((await encaissements()).filter((e) => e.montant === "15.00")).toHaveLength(1);
    await page.unrouteAll({ behavior: "wait" });
    // Le formulaire rejoue la même clé ; la saisie est restée à l'écran (sinon elle est retapée à l'identique).
    await expect(cle).toHaveValue(cleEnvoi);
    if ((await montantSaisi(page).inputValue()) !== "15,00") await montantSaisi(page).fill("15,00");
    await cliquer(boutonEncaisser(page));
    await expect(carteLoyers(page)).toContainText("est déjà enregistré : il n'a pas été enregistré une seconde fois");
    const lignes = await encaissements();
    expect(lignes.map((e) => e.montant)).toEqual(["840.00", "15.00"]);
    expect(lignes[1].cle_envoi).toBe(cleEnvoi);
    await page.reload();
    await expect(carteLoyers(page).locator("li").filter({ hasText: /^15,00\s€/ })).toHaveCount(1);
    await expect(carteLoyers(page).locator(".kpi").filter({ hasText: "Encaissé" })).toContainText(/855,00\s€/);
  });

  test("D37 : la ligne 250 vaut le montant qualifié, à l'écran et dans le champ du récapitulatif 2044", async ({ page }) => {
    await page.goto(`${espaceDe("proprietaire")}/comptabilite/fiscal?annee=${d.annee}&bien=${d.bien}`);
    // L'exercice du lot : location nue, 100 %, l'année entière (valeurs proposées), confirmé avec sa justification.
    const resumeExercice = page.locator("summary").filter({ hasText: `${d.nomLot} — exercice ${d.annee}` });
    const exercice = resumeExercice.locator("xpath=..");
    await resumeExercice.click();
    await exercice.locator('[name="justification"]').fill(`Recette ${d.annee} : location nue, droits 100 %`);
    await exercice.locator('[name="confirme"]').check();
    await cliquer(exercice.getByRole("button", { name: "Conserver l’exercice" }));
    await expect(resumeExercice).toContainText("confirmé v1");
    // La dépense : déductible, ligne 250.
    const resumePiece = page.locator("summary").filter({ hasText: d.categorie }).filter({ hasText: "2345.67 €" });
    const piece = resumePiece.locator("xpath=..");
    await resumePiece.click();
    await piece.locator('[name="nature"]').selectOption("deductible");
    await piece.locator('[name="rubrique"]').selectOption("250");
    await piece.locator('[name="justification"]').fill("Tableau d'amortissement de la recette : intérêts payés");
    await piece.locator('[name="confirme"]').check();
    await cliquer(piece.getByRole("button", { name: "Conserver cette qualification" }));
    await expect(resumePiece).toContainText("qualification v1");
    // L'écran du récapitulatif : la ligne 250 porte 2 345,67 €.
    await page.reload();
    const ligne250 = page.locator("li:visible, tr:visible").filter({ has: page.locator(".mono-discret", { hasText: /^250$/ }) });
    await expect(ligne250).toHaveCount(1);
    await expect(ligne250).toContainText(/2\s345,67\s€/);
    // Le « Récapitulatif annuel · location nue » : le champ de la ligne 250 est prérempli avec ce montant (modifiable).
    await page.goto(`${espaceDe("proprietaire")}/documents/catalogue?modele=recap_fiscal_nu`);
    await page.locator('select[name="cible"]').selectOption(d.lot);
    await page.locator('input[name="annee"]').fill(String(d.annee));
    await expect(page.getByRole("status").filter({ hasText: `Montant qualifié dans le livre pour ${d.annee} : 2345,67 €.` })).toBeVisible();
    await expect(page.locator('input[name="interets_emprunt"]')).toHaveValue("2345,67");
    await expect(page.getByText("Prérempli avec le montant déjà qualifié en ligne 250 dans votre livre (modifiable).")).toBeVisible();
    // Le PDF n'est pas généré (voir l'en-tête) : aucun clic sur « Générer le PDF ».
    await expect(page.getByRole("button", { name: "Générer le PDF" })).toBeEnabled();
  });

  test("D38 : une régularisation de l'exercice en cours est signalée et refusée sans confirmation explicite", async ({ page }) => {
    const documentsAvant = Number((await db.query("select count(*) as n from public.documents where organization_id = $1", [d.org])).rows[0].n);
    await page.goto(`${espaceDe("proprietaire")}/baux/${d.bail}`);
    const annee = page.locator("#reg-annee");
    await annee.fill(String(d.annee));
    await page.locator("#reg-reel").fill("640,00");
    await page.locator('input[name="justificatif"]').setInputFiles({ name: "decompte-recette.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% recette\n") });
    const formulaire = page.locator("form").filter({ has: annee });
    const avertissement = formulaire.getByRole("alert");
    await expect(avertissement).toContainText(`Exercice ${d.annee} non terminé : comparaison non homogène.`);
    const confirmation = formulaire.locator('input[name="confirmer_exercice_en_cours"]');
    await expect(confirmation).not.toBeChecked();
    await expect(confirmation).toHaveAttribute("required", "");
    await expect(avertissement).toContainText("Je confirme l’enregistrement de cette régularisation, qui ne pourra plus être modifiée.");
    // La case reste décochée et le contrôle du navigateur est levé : c'est le serveur qui doit refuser (requête directe).
    await formulaire.evaluate((f) => { (f as HTMLFormElement).noValidate = true; });
    await cliquer(formulaire.getByRole("button", { name: "Régulariser" }));
    await expect(formulaire).toContainText(`Exercice ${d.annee} non terminé : comparaison non homogène.`);
    await expect(formulaire).toContainText("Cochez la confirmation pour l’enregistrer malgré tout.");
    // Rien n'est enregistré : ni régularisation, ni justificatif rangé dans Documents.
    expect(Number((await db.query("select count(*) as n from public.regularisations_charges where bail_id = $1", [d.bail])).rows[0].n)).toBe(0);
    expect(Number((await db.query("select count(*) as n from public.documents where organization_id = $1", [d.org])).rows[0].n)).toBe(documentsAvant);
  });
});
