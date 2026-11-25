import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LA SUPERVISION EXAMINE ET RETIRE UNE ÉVALUATION CONTESTÉE (audit palier 1 du 22/11/2026, P1-07).
//
// Le défaut : l'artisan lisait « une évaluation retirée est exclue du calcul », mais aucun écran ne retirait rien, et
// la fonction de base était refusée par le garde de traversée. Ici, le superviseur ouvre la contestation d'un artisan
// fictif, examine ses évaluations (accès enregistré), en retire une avec son motif ; l'évaluation est retirée en base,
// l'organisation reçoit son alerte, l'artisan a sa ligne de suivi.
//
// Tout le décor vit dans une organisation fictive créée pour ce parcours, puis supprimée : aucun autre parcours ne la voit.

test.use({ storageState: "e2e/.auth/superadmin.json", actionTimeout: 10_000 });

test("contestation d'un artisan : le superviseur examine les évaluations et en retire une, motif tracé", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const [org, compte, artisan, bien, lot, incident, mission, evalGerant, evalLocataire, retour] = Array.from({ length: 10 }, () => randomUUID());
  const marque = retour.slice(0, 8);
  const numero = `TEST-EVAL-${marque}`;
  const titre = `TEST contestation ${marque}`;
  const systeme = async (travail: () => Promise<void>) => {
    await db.query("begin");
    try { await db.query("select public.tache_systeme()"); await travail(); await db.query("commit"); }
    catch (e) { await db.query("rollback").catch(() => {}); throw e; }
  };
  try {
    await systeme(async () => {
      await db.query("insert into organizations(id,name,type,status) values($1,$2,'proprietaire_direct','active')", [org, `TEST espace des évaluations ${marque}`]);
      await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
          confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
        values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now(),'','','','','')`, [compte, `artisan.test.${marque}@test.local`]);
      await db.query(`insert into artisans(id,raison_sociale,siret,telephone,statut_plateforme,siret_etat,visibilite,account_id)
        values($1,$2,lpad((floor(random()*99999999999999))::text,14,'0'),'0600000000','valide','verifie','privee',$3)`, [artisan, `TEST Artisan ${marque}`, compte]);
      await db.query("insert into biens(id,organization_id,nom,type,address_line1,postal_code,city) values($1,$2,'TEST bien','appartement','1 rue Test','69001','Lyon')", [bien, org]);
      await db.query("insert into lots(id,organization_id,bien_id,nom,etat) values($1,$2,$3,'TEST lot','brouillon')", [lot, org, bien]);
      await db.query(`insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification,clos_le,cloture_motif)
        values($1,$2,$3,$4,'agence','plomberie_canalisation','TEST fuite fictive','clos','proprietaire','TEST fictif',now(),'resolu')`, [incident, org, lot, numero]);
      // « Terminée » exigerait un compte rendu complet (RM-7.5.1) ; l'état de la mission ne change rien à l'examen.
      await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,$4,'entretien_courant','acceptee')", [mission, org, incident, artisan]);
      await db.query(`insert into artisan_evaluations(id,organization_id,intervention_id,artisan_id,source,note_globale,note_qualite,note_delai,note_prix,commentaire)
        values($1,$2,$3,$4,'gerant',1,1,1,2,'TEST commentaire privé du gestionnaire')`, [evalGerant, org, mission, artisan]);
      await db.query(`insert into artisan_evaluations(id,organization_id,intervention_id,artisan_id,source,note_globale,commentaire)
        values($1,$2,$3,$4,'locataire',5,null)`, [evalLocataire, org, mission, artisan]);
      await db.query(`insert into retours_utilisateurs(id,auteur_id,cle_envoi,artisan_id,nature,titre,description,ecran,groupe_id)
        values($1,$2,gen_random_uuid(),$3,'contestation',$4,'TEST : cette note ne correspond pas à mon intervention.','/artisan/note',$1)`, [retour, compte, artisan, titre]);
    });
    const evaluation = async (id: string) => (await db.query("select retiree_le is not null retiree, retrait_motif from artisan_evaluations where id=$1", [id])).rows[0];
    const consultations = async () => (await db.query("select count(*)::int n from audit_log where action='consultation_evaluations_contestation' and details->>'retour_id'=$1", [retour])).rows[0].n as number;

    await sansSyntheseAlertes(page);
    await page.goto("/admin/retours?nature=contestation");
    const carte = page.locator(`#retour-${retour}`);
    await expect(carte).toContainText(titre);
    // Tant que le superviseur n'a pas ouvert le détail, aucun accès n'est enregistré.
    expect(await consultations()).toBe(0);
    await carte.getByRole("link", { name: /Examiner les évaluations de cet artisan/ }).click();

    // ── Le détail, commentaires compris, derrière la contestation.
    await expect(page.getByRole("heading", { level: 1, name: "Évaluations contestées" })).toBeVisible();
    await expect(page.locator("main")).toContainText(`TEST Artisan ${marque}`);
    await expect(page.locator("main")).toContainText(titre);
    const lignes = page.locator("[data-evaluation]");
    await expect(lignes).toHaveCount(2);
    const duGerant = lignes.filter({ hasText: "Gestionnaire" });
    await expect(duGerant).toContainText("1/5");
    await expect(duGerant).toContainText("Qualité 1/5 · Délai 1/5 · Prix 2/5");
    await expect(duGerant).toContainText("Commentaire : « TEST commentaire privé du gestionnaire »");
    await expect(duGerant).toContainText(`dossier ${numero}`);
    await expect(duGerant).toHaveAttribute("data-evaluation", "comptee");
    await expect(page.locator("main")).toContainText("Cette consultation est enregistrée au journal");
    expect(await consultations()).toBe(1);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);

    // ── Le retrait : motif et confirmation obligatoires.
    await duGerant.locator("summary").click();
    const bouton = duGerant.getByRole("button", { name: "Retirer l’évaluation", exact: true });
    await bouton.click();
    expect((await evaluation(evalGerant)).retiree).toBe(false);
    await duGerant.getByLabel("Motif du retrait", { exact: true }).fill("TEST : note déposée sur le mauvais dossier.");
    await bouton.click();
    expect((await evaluation(evalGerant)).retiree).toBe(false);
    await duGerant.getByRole("checkbox").check();
    await bouton.click();

    const retiree = page.locator('[data-evaluation="retiree"]');
    await expect(retiree).toHaveCount(1);
    await expect(retiree).toContainText("Motif : « TEST : note déposée sur le mauvais dossier. »");
    await expect(retiree.getByText("Retirée", { exact: true })).toBeVisible();
    await expect(page.locator("main")).toContainText("1 comptée dans sa moyenne, 1 retirée");
    await page.screenshot({ path: info.outputPath("evaluation-retiree.png"), fullPage: true });

    // ── En base : UNE évaluation retirée, l'organisation alertée (sans le motif), l'artisan informé dans son suivi.
    expect(await evaluation(evalGerant)).toEqual({ retiree: true, retrait_motif: "TEST : note déposée sur le mauvais dossier." });
    expect((await evaluation(evalLocataire)).retiree).toBe(false);
    const alertes = (await db.query("select criticite::text c, titre, details from alerts where organization_id=$1 and type='evaluation_retiree'", [org])).rows;
    expect(alertes).toHaveLength(1);
    expect(alertes[0].c).toBe("informative");
    expect(alertes[0].titre).toBe(`Évaluation d'artisan retirée — ${numero}`);
    expect(JSON.stringify(alertes[0].details)).not.toContain("mauvais dossier");
    const suivi = (await db.query("select message from retours_historique where retour_id=$1 and evenement='evaluation_retiree'", [retour])).rows;
    expect(suivi).toHaveLength(1);
    expect(suivi[0].message).toContain("une évaluation a été retirée");

    // ── Au téléphone : l'écran reste lisible, sans défilement horizontal.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('[data-evaluation="retiree"]')).toHaveCount(1);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  } finally {
    try {
      await systeme(async () => {
        await db.query("delete from alerts where organization_id=$1", [org]);
        await db.query("delete from retours_historique where retour_id=$1", [retour]);
        await db.query("delete from retours_utilisateurs where id=$1", [retour]);
        await db.query("delete from artisan_evaluations where organization_id=$1", [org]);
        await db.query("delete from incident_interventions where organization_id=$1", [org]);
        await db.query("delete from incident_evenements where organization_id=$1", [org]);
        await db.query("delete from incidents where organization_id=$1", [org]);
        await db.query("delete from lots where organization_id=$1", [org]);
        await db.query("delete from biens where organization_id=$1", [org]);
        await db.query("delete from audit_log where organization_id=$1 or details->>'retour_id'=$2", [org, retour]);
        await db.query("delete from artisans where id=$1", [artisan]);
        await db.query("delete from organizations where id=$1", [org]);
        await db.query("delete from auth.users where id=$1", [compte]);
      });
    } catch (e) { console.warn("Nettoyage du décor incomplet :", (e as Error).message); }
    await db.end();
  }
});
