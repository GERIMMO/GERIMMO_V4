import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LA RÉVISION ANNUELLE DU LOYER EST RAPPELÉE À SA DATE, ET L'INDICE SE CHERCHE CHEZ L'INSEE (audit palier 1 du
// 22/11/2026, P1-13).
//
// Le défaut : rien ne rappelait la révision annuelle, et l'indice se recopiait à la main depuis le site de l'Insee.
// Ici, dans le navigateur du propriétaire bailleur : un bail dont la date anniversaire vient de passer affiche le
// rappel ; le rappel mène au formulaire ; « Chercher l'indice publié par l'Insee » répond — par l'indice et sa source
// si l'Insee est joignable, sinon par une phrase claire, et la saisie à la main reste possible dans les deux cas ;
// la révision enregistrée efface le rappel.
//
// Décisions du dirigeant du 24/11/2026 (lot D2). Q23 : le rappel et le formulaire affichent la date limite (un an après la
// date de révision). Q43 : le loyer révisé s'applique au premier terme qui suit la demande — le terme du mois en cours,
// appelé après la révision, reste à l'ancien loyer ; l'écran et la lettre nomment ce premier terme.
//
// Le banc local ne joint pas l'Insee : ce parcours accepte donc les deux réponses, et ne contrôle AUCUNE valeur
// d'indice (les valeurs saisies ici sont fictives). Bail, logement et locataire fictifs, retirés à la fin.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10_000 });

test("révision annuelle : rappelée à la date anniversaire, indice cherché chez l'Insee ou saisi, rappel effacé une fois révisé", async ({ page }, info) => {
  test.setTimeout(150_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const bien = randomUUID(), lot = randomUUID(), personne = randomUUID(), bail = randomUUID();
  const nom = `ESSAI révision ${lot.slice(0, 8)}`;
  try {
    // ── Décor : un bail révisable entré il y a un an et cinq jours (700 € hors charges), repris en cours ce mois-ci
    // (pas d'état des lieux d'entrée à réclamer). Indice de référence fictif : 140, « T2 » d'il y a deux ans.
    const { rows: [d] } = await db.query(`select (public.aujourdhui_paris() - interval '1 year' - interval '5 days')::date::text debut,
        (public.aujourdhui_paris() - interval '5 days')::date::text anniversaire,
        ((public.aujourdhui_paris() - interval '1 year' - interval '5 days')::date + interval '2 years' - interval '1 day')::date::text limite,
        (date_trunc('month', public.aujourdhui_paris()) + interval '1 month')::date::text terme_suivant,
        date_trunc('month', public.aujourdhui_paris())::date::text mois, extract(year from public.aujourdhui_paris())::int annee`);
    await db.query("begin");
    await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,$3,'appartement','1 rue ESSAI révision','75001','Paris')", [bien, ORG, nom]);
    await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,$4,'loue')", [lot, ORG, bien, nom]);
    await db.query("insert into persons(id,organization_id,nom,prenom) values($1,$2,$3,'Locataire fictif')", [personne, ORG, nom]);
    await db.query(`insert into baux(id,organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal,revision_irl,irl_trimestre,irl_valeur,loyers_suivis_depuis)
      values($1,$2,$3,'nu','actif',700,50,$4,5,$5,true,$6,140,$7)`, [bail, ORG, lot, d.debut, personne, `T2 ${d.annee - 2}`, d.mois]);
    await db.query("commit");
    const fr = (iso: string) => iso.split("-").reverse().join("/");

    // ── La fiche du bail rappelle la révision, avec sa date anniversaire.
    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/baux/${bail}`);
    const rappel = page.locator('a[href$="#revision-loyer"]');
    await expect(rappel).toHaveCount(1);
    await expect(rappel).toContainText("Révision annuelle du loyer possible");
    // Décisions du 24/11 (Q23, Q43) : le rappel ne dit plus « Date anniversaire du … : demandée plus tard, la révision ne
    // prend effet qu'à la date de la demande » ; il donne la date limite et la règle du premier terme.
    await expect(rappel).toContainText(`Date de révision du ${fr(d.anniversaire)}, à demander au plus tard le ${fr(d.limite)}`);
    await expect(rappel).toContainText("le loyer révisé s’applique au premier terme qui suit la demande");
    // Selon ce que le bail a d'autre à faire, le rappel est dans les trois premières actions ou juste derrière (replié).
    // La liste arrive en flux : tant qu'elle n'est pas posée dans la page, le lien existe mais n'est pas encore
    // affiché. On attend donc qu'il soit visible, en dépliant « autres ensuite » seulement s'il s'y trouve.
    await expect(async () => {
      const replie = page.locator("details:not([open])").filter({ has: rappel }).locator("summary").first();
      if (!(await rappel.isVisible()) && (await replie.count()) > 0) await replie.click({ timeout: 2_000 });
      await expect(rappel).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);

    // ── Le rappel mène au formulaire de révision, quelle que soit la rubrique ouverte.
    await rappel.click();
    const revision = page.locator("#revision-loyer");
    await expect(revision).toBeVisible();
    await expect(revision.getByText("Révision annuelle du loyer (IRL)", { exact: true })).toBeVisible();
    // Q23 : la date limite est affichée ; Q43 : une demande faite aujourd'hui s'appliquerait au terme du mois prochain.
    // « terme de décembre 2026 », « terme d’avril 2027 » : le « de » s'élide devant une voyelle.
    const termeEnClair = (iso: string) => {
      const mois = new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
      return `terme ${/^[aeiouyéèêàâîôûh]/i.test(mois) ? "d’" : "de "}${mois}`;
    };
    await expect(revision.locator("[data-revision-limite]")).toHaveText(fr(d.limite));
    await expect(revision.locator("[data-revision-dates]")).toContainText(`s'appliquerait à partir du ${termeEnClair(d.terme_suivant)}`);
    await expect(revision).toContainText("passé ce délai, elle est refusée");

    // ── « Chercher l'indice » : l'Insee répond (indice reporté, source dite) ou non (phrase claire). Jamais de silence.
    await revision.getByRole("button", { name: "Chercher l’indice publié par l’Insee" }).click();
    const reponse = revision.locator("[data-indice-etat]");
    await expect(reponse).toBeVisible({ timeout: 20_000 });
    const etat = await reponse.getAttribute("data-indice-etat");
    expect(["propose", "indisponible"]).toContain(etat);
    if (etat === "propose") {
      await expect(revision.getByText("Source :")).toContainText("série n° 001515333 de l’Insee");
      await expect(revision.locator("#irl-nouv")).not.toHaveValue("");
      await expect(revision.locator("#irl-annee")).not.toHaveValue("");
    } else {
      await expect(reponse).toContainText("L’Insee ne répond pas pour le moment. Saisissez l’indice vous-même");
    }
    await expect(revision.getByRole("link", { name: /série (n° 001515333|officielle) de l’Insee/ })).toHaveAttribute("href", "https://www.insee.fr/fr/statistiques/serie/001515333");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await revision.screenshot({ path: info.outputPath("revision-indice.png") });

    // ── Reprise du lot D2 (24/11) : un indice postérieur de plus d'un an à l'indice de référence (ici « T2 » de cette
    // année contre « T2 » d'il y a deux ans) signale une révision annuelle non faite. Elle n'est pas rattrapée : le
    // formulaire demande alors l'indice du même trimestre de l'année précédente, et la base refuse sans lui.
    await revision.locator("#irl-nouv").fill("142");
    await revision.locator("#irl-trim").selectOption("2");
    await revision.locator("#irl-annee").fill(String(d.annee));
    await expect(revision.locator("[data-irl-precedent]")).toBeVisible();
    await expect(revision.locator("[data-irl-precedent] label")).toHaveText(`IRL du T2 ${d.annee - 1}`);
    await expect(revision.locator("[data-revision-annee-sautee]")).toContainText("Elle n'est pas rattrapée : le loyer se révise sur un an");
    await revision.locator("#irl-precedent").fill("");
    await revision.getByRole("button", { name: "Réviser le loyer" }).click();
    await expect(revision.getByText(`Indice du T2 ${d.annee - 1} obligatoire`)).toBeVisible();
    expect((await db.query("select count(*)::int n from revisions_loyer where bail_id=$1", [bail])).rows[0].n).toBe(0);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    await revision.screenshot({ path: info.outputPath("revision-annee-sautee.png") });

    // ── La saisie à la main reste possible (valeurs fictives) : avec l'indice de l'année qui suit la référence (un an
    // d'écart, cas normal), le champ de l'année précédente disparaît et la révision s'enregistre.
    await revision.locator("#irl-nouv").fill("142");
    await revision.locator("#irl-trim").selectOption("2");
    await revision.locator("#irl-annee").fill(String(d.annee - 1));
    await expect(revision.locator("[data-irl-precedent]")).toHaveCount(0);
    await expect(revision.locator("#irl-demande")).not.toHaveValue("");
    await revision.getByRole("button", { name: "Réviser le loyer" }).click();
    await expect(revision.getByText(/Loyer révisé à 710(?:[.,]00)? € HC\./)).toBeVisible();
    expect((await db.query("select loyer_hc::float8 loyer from baux where id=$1", [bail])).rows[0].loyer).toBe(710);
    expect((await db.query("select count(*)::int n from revisions_loyer where bail_id=$1", [bail])).rows[0].n).toBe(1);
    // Q43 : la révision porte son premier terme (le mois prochain), et l'écran le dit sur la ligne de la révision.
    expect((await db.query("select premier_terme::text t from revisions_loyer where bail_id=$1", [bail])).rows[0].t).toBe(d.terme_suivant);
    await expect(revision.locator("li").first()).toContainText(`loyer révisé appliqué à partir du ${termeEnClair(d.terme_suivant)}`);
    // Le terme du mois en cours, appelé APRÈS la révision, reste à l'ancien loyer (700 €) : sa période contient la demande.
    await db.query("select public.generer_appels_loyer_interne($1)", [bail]);
    expect((await db.query("select periode::text, loyer_hc::float8 loyer, montant_du::float8 du from appels_loyer where bail_id=$1 order by periode", [bail])).rows)
      .toEqual([{ periode: d.mois, loyer: 700, du: 750 }]);

    // ── Révisé : le rappel s'efface.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('a[href$="#revision-loyer"]')).toHaveCount(0);
  } finally {
    try {
      await db.query("rollback");
      await db.query("begin"); await db.query("select public.tache_systeme()");
      await db.query("delete from revisions_loyer where bail_id=$1", [bail]);
      await db.query("delete from appels_loyer where bail_id=$1", [bail]);
      await db.query("delete from baux where id=$1", [bail]);
      await db.query("delete from lots where id=$1", [lot]);
      await db.query("delete from biens where id=$1", [bien]);
      await db.query("delete from persons where id=$1", [personne]);
      await db.query("commit");
    } catch (e) { await db.query("rollback").catch(() => {}); console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
