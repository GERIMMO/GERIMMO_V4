import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sansSyntheseAlertes } from "./aides";

/**
 * G-01 et G-02 (recette du 11/11/2026). En production :
 * - G-02 : l'étape « Documents » de tout bail ne chargeait aucune pièce (requête refusée par PostgREST : PGRST200) ;
 * - G-01 : la carte « Bail signé » (dépôt d'un bail signé sur papier, qui active la location) n'était plus affichée
 *   dans le parcours d'un brouillon : aucune location ne pouvait démarrer sans signature électronique.
 * Ce parcours crée un bail fictif, vérifie que le dépôt reste REFUSÉ tant que la base bloque la mise en location
 * (DPE et ERP absents), puis l'active une fois les diagnostics présents. Aucun contrôle serveur n'est contourné :
 * seules les données du dossier (lot, bail, diagnostics) sont posées en base fictive.
 * Pour la preuve contre un vrai PostgREST : lancer l'application avec NEXT_PUBLIC_SUPABASE_URL vers un relais qui envoie
 * /rest/v1 à PostgREST 14.5 (version de production) et le reste à l'émulateur.
 */
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
// Contenu propre à chaque passage : la GED refuse, à raison, un fichier identique à une pièce déjà enregistrée.
const PDF = Buffer.from(`%PDF-1.4\n% essai ${randomUUID()}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

const NOM = "Bail papier — essai local";

/**
 * Supprime les seules données fictives posées par ce parcours (bail, bail signé en GED, diagnostics, détentions, lot,
 * bien copié). Une seule transaction par dossier : la base refuse, à la validation, un lot « loué » sans bail.
 */
async function nettoyer(db: Client, dossiers: { bail: string | null; lot: string | null; bien: string | null }[]) {
  for (const { bail, lot, bien } of dossiers) {
    try {
      await db.query("begin");
      const diagnostics = (await db.query("select document_id from public.diagnostics where (lot_id=$1 or bien_id=$2) and organization_id=$3", [lot || null, bien || null, ORG])).rows;
      const signe: string | null = bail ? (await db.query("select document_signe from public.baux where id=$1", [bail])).rows[0]?.document_signe ?? null : null;
      if (bail) for (const sql of [
        "delete from public.appels_loyer where bail_id=$1", "delete from public.alerts where details->>'bail_id'=$1::text",
        "update public.baux set document_signe=null where id=$1", "delete from public.baux where id=$1",
      ]) await db.query(sql, [bail]);
      if (signe) for (const sql of ["delete from public.document_liens where document_id=$1", "delete from public.acces_pieces_log where document_id=$1", "delete from public.documents where id=$1"])
        await db.query(sql, [signe]);
      if (lot) for (const sql of ["delete from public.diagnostics where lot_id=$1", "delete from public.detentions where lot_id=$1", "delete from public.lots where id=$1"]) await db.query(sql, [lot]);
      if (bien) {
        await db.query("delete from public.diagnostics where bien_id=$1", [bien]);
        await db.query("delete from public.biens where id=$1 and nom=$2", [bien, NOM]);
      }
      for (const {document_id} of diagnostics) {
        await db.query("delete from public.documents where id=$1 and organization_id=$2", [document_id, ORG]);
      }
      await db.query("commit");
    } catch (e) {
      await db.query("rollback").catch(() => {});
      throw e;
    }
  }
}

async function ouvrirEtape(page: Page, url: string, numero: string) {
  await page.goto(url);
  await page.getByRole("button", { name: new RegExp(`^Étape ${numero} `) }).click();
}

test("G-01/G-02 : bail signé sur papier — refusé tant que la base bloque, puis la location s'active", async ({ page }) => {
  test.setTimeout(180_000);
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, "Base API locale fictive obligatoire.");
  const url = new URL(cible!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  let lot = "", bail = "", bien = "";
  // La synthèse des alertes s'ouvre à l'arrivée si d'autres parcours ont laissé des alertes : à poser AVANT la navigation.
  await sansSyntheseAlertes(page);
  try {
    // Rejouable : un passage interrompu (délai dépassé) a pu laisser son dossier fictif.
    await nettoyer(db, (await db.query("select b.id bail, l.id lot, l.bien_id bien from public.lots l left join public.baux b on b.lot_id = l.id where l.organization_id=$1 and l.nom=$2", [ORG, NOM])).rows);
    const source = (await db.query("select id, bien_id from public.lots where organization_id=$1 and nom='Appartement T2 — 12 rue des Lilas'", [ORG])).rows[0];
    // Un bien à lot unique (copie fictive du bien de démonstration) : un second lot dans le même immeuble exigerait,
    // à raison, de revalider la clé de répartition des charges avant toute mise en location.
    bien = (await db.query(`insert into public.biens select (jsonb_populate_record(null::public.biens, to_jsonb(b) || jsonb_build_object('id', gen_random_uuid()::text, 'nom', $2::text))).* from public.biens b where b.id=$1 returning id`, [source.bien_id, NOM])).rows[0].id;
    lot = (await db.query(`insert into public.lots select (jsonb_populate_record(null::public.lots, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid()::text, 'bien_id', $2::text, 'nom', $3::text, 'etat', 'brouillon'))).* from public.lots l where l.id=$1 returning id`, [source.id, bien, NOM])).rows[0].id;
    await db.query("insert into public.detentions(organization_id, lot_id, person_id, quote_part, date_debut) select organization_id, $2, person_id, quote_part, date_debut from public.detentions where lot_id=$1 and date_fin is null", [source.id, lot]);
    const locataire = (await db.query("select id from public.persons where organization_id=$1 and email='locataire.pd@example.com'", [ORG])).rows[0].id;
    bail = (await db.query("insert into public.baux(organization_id, lot_id, etat, type, date_debut, loyer_hc, charges, depot_garantie, locataire_principal) values ($1,$2,'brouillon','nu',current_date+7,700,50,700,$3) returning id", [ORG, lot, locataire])).rows[0].id;
    const adresse = `/espace/${ORG}/baux/${bail}`;

    // G-02 : l'étape Documents charge ses pièces (plus aucun « Indisponible ») et l'ajout d'une attestation est possible.
    const reponsesEnErreur: string[] = [];
    page.on("response", r => { if (r.status() >= 400 && /\/rest\/v1\//.test(r.url())) reponsesEnErreur.push(`${r.status()} ${r.url()}`); });
    await ouvrirEtape(page, adresse, "05");
    await expect(page.getByRole("heading", { name: "Documents", level: 2 }).first()).toBeVisible();
    await expect(page.getByText("Assurance du locataire").first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Indisponible");
    await expect(page.getByRole("button", { name: /Ajouter l’attestation/ }).first()).toBeEnabled();

    // G-01 : la carte de dépôt est présente au Récapitulatif ; la base refuse tant que DPE et ERP manquent.
    await ouvrirEtape(page, adresse, "07");
    const depot = page.locator("#bail-signe");
    await expect(depot.getByText("Bail signé", { exact: true })).toBeVisible();
    await expect(depot.getByRole("link", {name: "Ouvrir la fiche du logement"})).toHaveAttribute("href", `/espace/${ORG}/parc/${bien}/lots/${lot}`);
    await expect(depot.locator("#depot-bail-signe")).toHaveCount(0);
    await expect(db.query("update public.lots set etat='disponible' where id=$1", [lot])).rejects.toThrow(/DPE absent ou expiré/);
    // Un bien ne peut devenir disponible qu’avec les diagnostics valides.
    for (const [type, niveau] of [["dpe", "lot"], ["erp", "bien"]] as const) {
      const doc = (await db.query("insert into public.documents(organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte) values ($1,'diagnostic',$2,$3,'application/pdf',123,encode(sha256(gen_random_uuid()::text::bytea),'hex')) returning id", [ORG, `${type.toUpperCase()} fictif — essai`, `essai/${type}-${bail}.pdf`])).rows[0].id;
      await db.query("insert into public.diagnostics(organization_id, lot_id, bien_id, type, date_realisation, date_expiration, document_id, classe_dpe) values ($1,$2,$3,$4,current_date - 10, current_date + 150, $5, $6)",
        [ORG, niveau === "lot" ? lot : null, niveau === "bien" ? bien : null, type, doc, type === "dpe" ? "C" : null]);
    }
    await db.query("update public.lots set etat='disponible' where id=$1", [lot]);
    // Simuler leur expiration entre la mise en disponibilité et la signature du bail.
    await db.query("update public.diagnostics set date_expiration=current_date-1 where organization_id=$1 and (lot_id=$2 or bien_id=$3)", [ORG, lot, bien]);
    await ouvrirEtape(page, adresse, "07");
    await depot.locator("#depot-bail-signe").setInputFiles({ name: "bail-signe-fictif.pdf", mimeType: "application/pdf", buffer: PDF });
    await depot.getByRole("button", { name: "Déposer le bail signé" }).click();
    await expect(depot.getByText("Mise en location bloquée — à corriger :")).toBeVisible({ timeout: 30_000 });
    await expect(depot).toContainText("DPE absent ou expiré");
    await expect(depot).toContainText("ERP absent ou expiré");
    expect((await db.query("select etat, document_signe from public.baux where id=$1", [bail])).rows[0]).toEqual({ etat: "brouillon", document_signe: null });

    // Renouveler les deux diagnostics fictifs du dossier avant le nouvel essai.
    await db.query("update public.diagnostics set date_expiration=current_date+150 where organization_id=$1 and (lot_id=$2 or bien_id=$3)", [ORG, lot, bien]);
    await ouvrirEtape(page, adresse, "07");
    await depot.locator("#depot-bail-signe").setInputFiles({ name: "bail-signe-fictif.pdf", mimeType: "application/pdf", buffer: PDF });
    await depot.getByRole("button", { name: "Déposer le bail signé" }).click();
    await expect.poll(async () => (await db.query("select etat from public.baux where id=$1", [bail])).rows[0]?.etat,
      { timeout: 30_000 }).toBe("actif");
    const apres = (await db.query("select b.etat, b.document_signe is not null as signe, l.etat as lot from public.baux b join public.lots l on l.id = b.lot_id where b.id=$1", [bail])).rows[0];
    expect(apres).toEqual({ etat: "actif", signe: true, lot: "loue" });
    // Vérifier le document issu du vrai dépôt avec les droits du locataire du bail.
    const signe = (await db.query("select document_signe from public.baux where id=$1", [bail])).rows[0].document_signe;
    try {
      await db.query("begin");
      const { rows: [occupant] } = await db.query("select account_id from public.persons where id=$1", [locataire]);
      await db.query("select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',$1::text)::text,true)", [occupant.account_id]);
      await db.query("set local role authenticated");
      const meta = await db.query("select storage_path from public.mon_document_locataire($1,$2)", [ORG, signe]);
      expect(meta.rows).toHaveLength(1);
    } finally { await db.query("rollback"); }
    await page.reload();
    await expect(page.getByText("Actif", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Brouillon", { exact: true })).toHaveCount(0);
    expect(reponsesEnErreur).toEqual([]);
  } finally {
    await nettoyer(db, [{ bail, lot, bien }]);
    await db.end();
  }
});
