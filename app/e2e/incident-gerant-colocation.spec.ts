import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";

// Audit de la PR #264, FL-01 : en colocation à baux individuels, le gérant qui déclare un incident choisit la chambre
// concernée (sinon aucun colocataire ne le voit). Relecture du 27/10 : une colocation préparée chambre par chambre n'a
// que ses chambres enregistrées, et la liste des pièces ne proposait plus que ces chambres et « Parties communes ».
// Le lot fictif (clone d'un lot du propriétaire, deux chambres, deux baux en cours) est créé puis retiré par l'essai
// (base locale seulement). Rien n'est envoyé : la base est couverte par tests/incident-gerant-colocation-base.test.ts.
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: "e2e/.auth/proprietaire.json", actionTimeout: 10000 });

for (const largeur of [390, 1440]) {
  test(`incident en colocation : la chambre est demandée, la cuisine reste proposée (${largeur}px)`, async ({ page }, info) => {
    const url = process.env.SUPALOCAL_DB;
    test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base fictive locale requise");
    const db = new Client({ connectionString: url });
    await db.connect();
    const lot = randomUUID();
    const marque = `coloc-${randomUUID()}`;
    try {
      const { rows: [source] } = await db.query<{ id: string }>(
        "select id from public.lots where organization_id = $1 and nom = 'Appartement T2 — 12 rue des Lilas'", [ORG]);
      expect(source).toBeTruthy();
      await db.query(
        `insert into public.lots select (jsonb_populate_record(null::public.lots, to_jsonb(l) || jsonb_build_object(
           'id', $1::text, 'nom', 'Colocation — essai local', 'etat', 'disponible', 'meuble', true,
           'colocation_loyer_reference', 1000))).* from public.lots l where id = $2`, [lot, source.id]);
      // Les chambres seules, sans pièce enregistrée : ce que laisse « Configurer une colocation ».
      await db.query(
        `insert into public.lot_chambres (organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
         values ($1, $2, 'Chambre A', 12, 30, 'Meublée', 'Cuisine'), ($1, $2, 'Chambre B', 11, 28, 'Meublée', 'Cuisine')`, [ORG, lot]);
      await db.query(
        `insert into public.persons (organization_id, nom, prenom, email)
         values ($1, 'TEST Coloc', 'Alice', 'alice-' || $2 || '@example.invalid'), ($1, 'TEST Coloc', 'Benoît', 'benoit-' || $2 || '@example.invalid')`,
        [ORG, marque]);
      await db.query(
        `insert into public.baux (organization_id, lot_id, type, etat, locataire_principal, chambre_id, date_debut, loyer_hc, charges, depot_garantie, jour_echeance)
         select $1, $2, 'colocation', 'brouillon', p.id, c.id, date '2026-01-01', 400, 50, 800, 5
         from public.lot_chambres c
         join public.persons p on p.email = case c.nom when 'Chambre A' then 'alice-' else 'benoit-' end || $3 || '@example.invalid'
         where c.lot_id = $2`, [ORG, lot, marque]);
      // Le lot suit ses baux (contrôle à la validation) : activés et « loué » dans la même transaction.
      await db.query("begin");
      await db.query("update public.baux set etat = 'actif' where lot_id = $1", [lot]);
      await db.query("update public.lots set etat = 'loue' where id = $1", [lot]);
      await db.query("commit");

      await page.setViewportSize({ width: largeur, height: 1000 });
      await sansSyntheseAlertes(page);
      await page.goto(`/espace/${ORG}/incidents/nouveau?lot=${lot}`);

      // Deux baux en cours : la chambre est demandée, avec les espaces partagés pour « aucune chambre ».
      const chambre = page.getByLabel("Chambre concernée", { exact: true });
      await expect(chambre).toHaveAttribute("required", "");
      await expect(chambre.locator("option")).toHaveText([
        "Choisissez la chambre…", "Chambre A — TEST Coloc Alice", "Chambre B — TEST Coloc Benoît", "Espaces partagés ou tout le logement",
      ]);
      // Sans pièce enregistrée, la liste générique reste ; les chambres nommées remplacent « Chambre ».
      await expect(page.getByLabel("Pièce concernée — Facultatif").locator("option")).toHaveText([
        "—", "Cuisine", "Salle d'eau", "Séjour", "Chambre A", "Chambre B", "Entrée ou couloir", "Parties communes",
      ]);

      // Sans chambre choisie, le navigateur bloque l'envoi.
      await page.getByLabel("Catégorie", { exact: true }).selectOption({ index: 1 });
      await page.getByLabel("Description", { exact: true }).fill("Essai local : la porte de la chambre ne ferme plus");
      await page.getByLabel("Pièce concernée — Facultatif").selectOption("Cuisine");
      await page.getByRole("button", { name: "Déclarer l'incident" }).click();
      await expect(page).toHaveURL(/\/incidents\/nouveau/);
      expect(await chambre.evaluate((e) => (e as HTMLSelectElement).validity.valueMissing)).toBe(true);
      expect(await debordementHorizontal(page)).toBe(0);
      await page.screenshot({ path: info.outputPath("incident-colocation.png"), fullPage: true });
    } finally {
      await db.query("rollback").catch(() => {});
      await db.query("begin");
      await db.query("delete from public.baux where lot_id = $1", [lot]);
      await db.query("delete from public.lot_chambres where lot_id = $1", [lot]);
      await db.query("delete from public.persons where email in ('alice-' || $1 || '@example.invalid', 'benoit-' || $1 || '@example.invalid')", [marque]);
      await db.query("delete from public.lots where id = $1", [lot]);
      await db.query("commit");
      await db.end();
    }
  });
}
