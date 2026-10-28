/**
 * Audit final (28/10/2026) — migration 20261028100300_import_controle_complet_et_trimestre_irl_annee.sql.
 *
 * BAIL-05 : la passe de contrôle de `importer_parc` rejoue les règles de la table (plafond du dépôt, montants
 * négatifs, jour d'échéance, surface) : ce qu'elle annonce « prêt » passe à l'import, et chaque motif est dit en
 * français. BAIL-02 : les trimestres IRL enregistrés sans année (« T3 ») reçoivent l'année déduite de la date d'entrée.
 *
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (sinon ignoré).
 */
import { readFileSync } from "node:fs";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "20261028100300_import_controle_complet_et_trimestre_irl_annee";

describe("import contrôlé et trimestre IRL daté (fichiers)", () => {
  it("la migration repart des dernières définitions, ferme les fonctions à anon et figure une fois au manifeste avec son retour", () => {
    const sql = readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8");
    expect(sql).toContain("create or replace function public.importer_parc(");
    expect(sql).toContain("create or replace function public.controler_plafond_depot_garantie()");
    expect(sql).toContain("create or replace function public.montant_en_euros(p numeric)");
    // Le garde-fou du 27/09 (bail engagé : le loyer ne rouvre pas le dépôt) est conservé tel quel.
    expect(sql).toContain("and old.etat is distinct from 'brouillon'::public.bail_etat");
    expect(sql).toContain("where irl_trimestre ~ '^T[1-4]$'");
    expect(sql.match(/set search_path (?:to|=) ''/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql.trim().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${MIGRATION}.sql`)).toHaveLength(1);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${MIGRATION}.sql",`);
    const retour = readFileSync(`supabase/retours-arriere/${MIGRATION}.retour.sql`, "utf8");
    expect(retour).toContain("drop function if exists public.montant_en_euros(numeric);");
    expect(retour).toContain("(soit % €) pour un bail %");
    expect(retour).not.toContain("v_motifs");
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`${MIGRATION}.retour.sql`);
  });
});

const LIGNE = {
  bien: "AF Import", type: "appartement", adresse: "1 rue A", code_postal: "69001", ville: "Lyon",
  lot: "A1", surface: "40", pieces: "2", proprietaire_nom: "Moreau", proprietaire_prenom: "Claire",
  locataire_nom: "Bernard", locataire_prenom: "Lucas", loyer_hc: "700", charges: "50", depot_garantie: "700",
  date_debut: "2026-11-01", jour_echeance: "1",
};

describe.skipIf(!DB_URL)("import contrôlé et trimestre IRL daté (base)", () => {
  let db: Client;
  let org = "", compte = "";

  const agir = async () => {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: compte, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  };
  const importer = async (lignes: Record<string, string>[], bascule = false) => {
    await agir();
    const { rows } = await db.query<{ ligne: number; statut: string; message: string; lot_id: string | null; bail_id: string | null }>(
      `select * from public.importer_parc($1, $2::jsonb, $3)`, [org, JSON.stringify(lignes), !bascule]);
    await db.query("reset role");
    return rows;
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => { await db?.end(); });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("reset role");
    const { rows: [o] } = await db.query(
      `insert into public.organizations (name, status, type, address_line1, postal_code, city, email_contact)
       values ('AF import','active','proprietaire_direct','1 rue Haute','69007','Lyon','af-import@test.local') returning id`);
    org = o.id;
    const { rows: [u] } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         'af-import-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
       returning id`);
    compte = u.id;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'proprietaire_direct')`, [compte, org]);
  });
  afterEach(async () => { await db.query("rollback"); });

  it("écrit les montants à la française", async () => {
    const { rows: [r] } = await db.query(`select public.montant_en_euros(700) a, public.montant_en_euros(1400.5) b, public.montant_en_euros(-0.5) c, public.montant_en_euros(1234567.891) d, public.montant_en_euros(null) e`);
    expect(r).toEqual({ a: "700,00 €", b: "1 400,50 €", c: "-0,50 €", d: "1 234 567,89 €", e: null });
  });

  it("le contrôle refuse ce que l'insertion refuserait, avec tous les motifs, et l'import rend les mêmes verdicts", async () => {
    const lignes = [
      LIGNE,
      { ...LIGNE, lot: "A2", depot_garantie: "1400" },
      { ...LIGNE, lot: "A3", loyer_hc: "-700", jour_echeance: "31", depot_garantie: "2000" },
      { ...LIGNE, lot: "A4", surface: "0", locataire_nom: "", locataire_prenom: "" },
      { ...LIGNE, lot: "A5", charges: "abc", pieces: "deux" },
    ];
    const controle = await importer(lignes);
    expect(controle.map((r) => r.statut)).toEqual(["ok", "erreur", "erreur", "erreur", "erreur"]);
    expect(controle[1].message).toBe("Dépôt de garantie trop élevé : maximum 1 mois de loyer hors charges (soit 700,00 €) pour un bail nu");
    expect(controle[2].message).toBe("Le loyer hors charges ne peut pas être négatif · Le jour d’échéance doit être compris entre 1 et 28");
    expect(controle[3].message).toBe("La surface doit être supérieure à zéro");
    expect(controle[4].message).toBe("Nombre de pièces illisible : « deux » (entier attendu) · Charges illisibles : « abc »");
    // Rien n'a été écrit par la passe de contrôle.
    expect((await db.query(`select count(*)::int n from public.biens where organization_id=$1`, [org])).rows[0].n).toBe(0);
    const reel = await importer(lignes, true);
    expect(reel.map((r) => r.statut)).toEqual(controle.map((r) => r.statut));
    expect(reel.slice(1).map((r) => r.message)).toEqual(controle.slice(1).map((r) => r.message));
    expect(reel[0].bail_id).toBeTruthy();
    const { rows: [b] } = await db.query(`select loyer_hc::text loyer, depot_garantie::text depot, jour_echeance jour from public.baux where id=$1`, [reel[0].bail_id]);
    expect(b).toEqual({ loyer: "700.00", depot: "700.00", jour: 1 });
  });

  it("le déclencheur du plafond écrit le montant en français et le régime du bail", async () => {
    const r = await importer([LIGNE], true);
    await expect(db.query(`update public.baux set depot_garantie = 1400 where id = $1`, [r[0].bail_id]))
      .rejects.toThrow("Dépôt de garantie trop élevé : maximum 1 mois de loyer hors charges (soit 700,00 €) pour un bail nu");
  });

  it("la reprise date les trimestres « T1 »…« T4 » d'après l'entrée, laisse le reste et se rejoue sans effet", async () => {
    const r = await importer([LIGNE, { ...LIGNE, lot: "B", locataire_nom: "Autre" }, { ...LIGNE, lot: "C", locataire_nom: "Troisième" }, { ...LIGNE, lot: "D", locataire_nom: "Quatrième" }], true);
    const [decembre, janvier, mai, sansDate] = r.map((x) => x.bail_id as string);
    await db.query(`update public.baux set irl_trimestre='T3', date_debut='2026-12-01' where id=$1`, [decembre]);
    await db.query(`update public.baux set irl_trimestre='T4', date_debut='2026-01-15' where id=$1`, [janvier]);
    await db.query(`update public.baux set irl_trimestre='2e trimestre 2025', date_debut='2026-05-10' where id=$1`, [mai]);
    await db.query(`update public.baux set irl_trimestre='T2', date_debut=null where id=$1`, [sansDate]);
    // Un bail dont le contrat est parti en signature garde « T1 » : l'activation recalcule son empreinte.
    const enSignature = (await importer([{ ...LIGNE, lot: "E", locataire_nom: "Cinquième" }], true))[0].bail_id as string;
    await db.query(`update public.baux set irl_trimestre='T1', date_debut='2026-12-01' where id=$1`, [enSignature]);
    const { rows: [doc] } = await db.query(`insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
      values ($1::uuid,'bail','Bail nu — E (à faire signer)',$1::text||'/e.pdf','application/pdf',10,repeat('c',64),$2) returning id`, [org, compte]);
    await db.query(`insert into public.bail_signature_circuits(organization_id,bail_id,document_id,created_by,prestataire,environnement,empreinte,pdf_hash,signataires,etat)
      values($1,$2,$3,$4,'zoho','production',repeat('b',64),repeat('a',64),'[{},{}]','en_cours')`, [org, enSignature, doc.id, compte]);
    const migration = readFileSync(`supabase/migrations/${MIGRATION}.sql`, "utf8");
    await db.query(migration);
    const lire = async () => (await db.query(`select id, irl_trimestre from public.baux where id = any($1::uuid[])`, [[decembre, janvier, mai, sansDate]])).rows
      .reduce((acc, x) => ({ ...acc, [x.id]: x.irl_trimestre }), {} as Record<string, string>);
    expect(await lire()).toEqual({ [decembre]: "T3 2026", [janvier]: "T4 2025", [mai]: "2e trimestre 2025", [sansDate]: "T2" });
    await db.query(migration);
    expect(await lire()).toEqual({ [decembre]: "T3 2026", [janvier]: "T4 2025", [mai]: "2e trimestre 2025", [sansDate]: "T2" });
    expect((await db.query(`select irl_trimestre from public.baux where id=$1`, [enSignature])).rows[0].irl_trimestre).toBe("T1");
  });
});
