/**
 * Reprendre un parc existant (module 16.3, 11/09).
 *
 * Sans import, une agence qui arrive avec cinquante lots les saisit un par un —
 * six écrans, cinquante fois. Aucun essai de quatorze jours ne survit à ça.
 *
 * Ce qui est gardé ici : la lecture du tableur (séparateurs, guillemets,
 * en-têtes accentués), et le comportement de l'import — ce qu'il crée, ce
 * qu'il ne duplique pas, et ce qu'il refuse de faire (activer un bail).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { gabaritCsv, lireCsv } from "../src/lib/import-parc";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe("lire le tableur de l'agence", () => {
  it("accepte le point-virgule d'Excel comme la virgule des exports", () => {
    const parVirgule = lireCsv("bien,type,adresse,code_postal,ville,lot,proprietaire_nom\nA,maison,1 rue X,75011,Paris,L1,Durand");
    const parPointVirgule = lireCsv("bien;type;adresse;code_postal;ville;lot;proprietaire_nom\nA;maison;1 rue X;75011;Paris;L1;Durand");
    expect("lignes" in parVirgule && parVirgule.lignes[0].bien).toBe("A");
    expect("lignes" in parPointVirgule && parPointVirgule.lignes[0].bien).toBe("A");
  });

  it("reconnaît les en-têtes du gabarit, accents et casse compris", () => {
    // Personne ne retapera « quote_part » à l'identique : c'est le libellé
    // lisible qui est reconnu, sans accents ni casse.
    const r = lireCsv(
      "Nom du bien;Type;Adresse;Code postal;Ville;Nom du lot;Nom du propriétaire;SURFACE (M²)\n" +
        "Les Tilleuls;appartement;12 rue X;75011;Paris;A12;Durand;42"
    );
    expect("lignes" in r).toBe(true);
    if (!("lignes" in r)) return;
    expect(r.lignes[0].bien).toBe("Les Tilleuls");
    expect(r.lignes[0].surface).toBe("42");
    expect(r.manquantes).toEqual([]);
  });

  it("honore les guillemets : un point-virgule dans un nom ne coupe pas la ligne", () => {
    const r = lireCsv(
      'bien;type;adresse;code_postal;ville;lot;proprietaire_nom\n"Durand; et fils";maison;1 rue X;75011;Paris;L1;Durand'
    );
    expect("lignes" in r && r.lignes[0].bien).toBe("Durand; et fils");
  });

  it("dit quelles colonnes obligatoires manquent, et ignore celles qu'il ne connaît pas", () => {
    const r = lireCsv("bien;lot;numero_interne\nA;L1;42");
    expect("lignes" in r).toBe(true);
    if (!("lignes" in r)) return;
    expect(r.manquantes.length).toBeGreaterThan(0);
    expect(r.inconnues).toContain("numero_interne");
  });

  it("refuse un fichier dont l'en-tête n'a rien à voir", () => {
    const r = lireCsv("alpha;beta;gamma\n1;2;3");
    expect("erreur" in r).toBe(true);
  });

  it("le gabarit qu'on télécharge se relit lui-même", () => {
    // Le gabarit et le lecteur vivent dans le même fichier : s'ils divergent,
    // le client télécharge un modèle que l'import refuse.
    const r = lireCsv(gabaritCsv());
    expect("lignes" in r).toBe(true);
    if (!("lignes" in r)) return;
    expect(r.manquantes).toEqual([]);
    expect(r.inconnues).toEqual([]);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0].locataire_nom).toBe("Petit");
  });
});

let db: Client;
let org = "";
let gerant = "";

async function agir(accountId: string | null) {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated" }) : "",
  ]);
  if (accountId) await db.query("set local role authenticated");
}

async function importer(lignes: Record<string, string>[], bascule = false) {
  await agir(gerant);
  const { rows } = await db.query<{
    ligne: number;
    statut: string;
    message: string;
    lot_id: string | null;
    bail_id: string | null;
  }>(`select * from public.importer_parc($1, $2::jsonb, $3)`, [org, JSON.stringify(lignes), !bascule]);
  return rows;
}

const LIGNE = {
  bien: "Les Tilleuls",
  type: "appartement",
  adresse: "12 rue des Tilleuls",
  code_postal: "75011",
  ville: "Paris",
  lot: "A12",
  surface: "42",
  pieces: "2",
  proprietaire_nom: "Durand",
  proprietaire_prenom: "Paul",
  locataire_nom: "Petit",
  locataire_prenom: "Awa",
  locataire_email: "awa@exemple.fr",
  loyer_hc: "700",
  charges: "50",
  depot_garantie: "700",
  date_debut: "2026-01-01",
};

describe.skipIf(!DB_URL)("importer le parc", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("reset role");
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, essai_fin)
       values ('Import','essai', current_date + 14) returning id`
    );
    org = id;
    const {
      rows: [{ id: compte }],
    } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'imp-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  it("le contrôle n'écrit rien, et dit ligne par ligne ce qui passera", async () => {
    const r = await importer([LIGNE, { ...LIGNE, lot: "", bien: "" }]);
    expect(r[0].statut).toBe("ok");
    expect(r[1].statut).toBe("erreur");
    expect(r[1].message).toMatch(/nom du bien/);
    // Rien n'a été écrit : c'est tout l'objet de la première passe.
    await db.query("reset role");
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.biens where organization_id=$1`,
      [org]
    );
    expect(n).toBe("0");
  });

  it("crée le bien, le lot, la détention et le bail — en brouillon", async () => {
    const r = await importer([LIGNE], true);
    expect(r[0].statut).toBe("ok");
    expect(r[0].lot_id).toBeTruthy();
    expect(r[0].bail_id).toBeTruthy();

    await db.query("reset role");
    const {
      rows: [b],
    } = await db.query<{ etat: string; loyer_hc: string; jour_echeance: number }>(
      `select etat::text, loyer_hc::text, jour_echeance from public.baux where id=$1`,
      [r[0].bail_id]
    );
    // ACTIF serait un contournement de controler_mise_en_location : diagnostics,
    // état des lieux, mentions obligatoires. L'import ne les saute pas.
    expect(b.etat).toBe("brouillon");
    expect(b.loyer_hc).toBe("700.00");
    expect(b.jour_echeance).toBe(1);

    const {
      rows: [d],
    } = await db.query<{ quote_part: string }>(
      `select quote_part::text from public.detentions where lot_id=$1 and date_fin is null`,
      [r[0].lot_id]
    );
    expect(d.quote_part).toBe("100.00");
  });

  it("deux lots du même immeuble ne font qu'un bien, et un propriétaire qu'une fiche", async () => {
    const r = await importer(
      [
        { ...LIGNE, lot: "A12" },
        { ...LIGNE, lot: "A13", locataire_nom: "", locataire_email: "" },
      ],
      true
    );
    expect(r.every((x) => x.statut === "ok")).toBe(true);

    await db.query("reset role");
    const compte = async (sql: string) =>
      (await db.query<{ n: string }>(sql, [org])).rows[0].n;
    expect(await compte(`select count(*)::text as n from public.biens where organization_id=$1`)).toBe("1");
    expect(
      await compte(
        `select count(*)::text as n from public.lots where organization_id=$1`
      )
    ).toBe("2");
    // Le propriétaire est nommé deux fois : une seule fiche, sinon son relevé
    // de gestion serait coupé en deux.
    expect(
      await compte(
        `select count(*)::text as n from public.persons where organization_id=$1 and nom='Durand'`
      )
    ).toBe("1");
    // Le second lot n'a pas de locataire : pas de bail.
    expect(r[1].bail_id).toBeNull();
  });

  it("distingue deux biens homonymes, conserve leur adresse et réutilise chacun au rejeu", async () => {
    const lignes = [
      { ...LIGNE, lot: "Cour", adresse: "11 rue du Canal" },
      { ...LIGNE, lot: "Jardin", adresse: "84 rue du Quai" },
    ];
    const apercu = await importer(lignes);
    expect(apercu.map((r) => r.statut)).toEqual(["ok", "ok"]);
    expect(apercu[0].message).toContain("11 rue du Canal");
    expect(apercu[1].message).toContain("84 rue du Quai");
    const cree = await importer(lignes, true);
    const rejoue = await importer([{ ...lignes[1], adresse: "  84   RUE DU QUAI" }, lignes[0]], true);
    expect(rejoue.map((r) => r.lot_id)).toEqual([cree[1].lot_id, cree[0].lot_id]);
    await db.query("reset role");
    const liens = await db.query(
      `select l.nom, b.address_line1 from public.lots l join public.biens b on b.id=l.bien_id
       where l.organization_id=$1 and b.organization_id=$1 order by l.nom`, [org]
    );
    expect(liens.rows).toEqual([
      { nom: "Cour", address_line1: "11 rue du Canal" },
      { nom: "Jardin", address_line1: "84 rue du Quai" },
    ]);
  });

  it("refuse une adresse historique incomplète, y compris si elle devient ambiguë après le contrôle", async () => {
    const [avant] = await importer([LIGNE]);
    expect(avant.statut).toBe("ok");
    await db.query("reset role");
    await db.query(`insert into public.biens (organization_id,nom,type,address_line1,postal_code,city)
      values ($1,$2,'immeuble','',$3,$4)`, [org,LIGNE.bien,LIGNE.code_postal,LIGNE.ville]);
    for (const bascule of [false, true]) {
      const [ligne] = await importer([LIGNE], bascule);
      expect(ligne).toMatchObject({ statut: "erreur", lot_id: null, bail_id: null });
      expect(ligne.message).toMatch(/adresse.*incomplète/i);
    }
    await db.query("reset role");
    expect((await db.query("select count(*)::int n from public.lots where organization_id=$1", [org])).rows[0].n).toBe(0);
  });

  it("refuse deux fiches existantes indiscernables et un complément manquant dans le fichier", async () => {
    const confus = [LIGNE, { ...LIGNE, lot: "A13", adresse2: "Bâtiment A" }];
    for (const bascule of [false, true]) {
      const r = await importer(confus, bascule);
      expect(r.map((l) => l.statut)).toEqual(["erreur", "erreur"]);
      expect(r.every((l) => l.message.includes("complément"))).toBe(true);
    }
    await db.query("reset role");
    await db.query(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
      select $1,$2,'immeuble',$3,$4,$5 from generate_series(1,2)`, [org,LIGNE.bien,LIGNE.adresse,LIGNE.code_postal,LIGNE.ville]);
    const [r] = await importer([LIGNE], true);
    expect(r.statut).toBe("erreur");
    expect(r.message).toMatch(/plusieurs biens/i);
    expect(r.lot_id).toBeNull();
  });

  it("distingue le code postal, la ville et deux bâtiments explicitement identifiés", async () => {
    const adresses = [
      { ...LIGNE, ville: "Vernon", code_postal: "27200", adresse2: "Bâtiment A" },
      { ...LIGNE, ville: "Vernon", code_postal: "27200", adresse2: "Bâtiment B" },
      { ...LIGNE, ville: "Autreville", code_postal: "27200", adresse2: "Bâtiment A" },
      { ...LIGNE, ville: "Vernon", code_postal: "27210", adresse2: "Bâtiment A" },
    ];
    const cree = await importer(adresses, true);
    expect(cree.every((r) => r.statut === "ok")).toBe(true);
    expect(new Set(cree.map((r) => r.lot_id)).size).toBe(4);
    expect((await importer(adresses, true)).map((r) => r.lot_id)).toEqual(cree.map((r) => r.lot_id));
    const [ambigu] = await importer([{ ...adresses[0], adresse2: "" }], true);
    expect(ambigu.statut).toBe("erreur");
    expect(ambigu.message).toMatch(/complément/i);
    expect(ambigu.lot_id).toBeNull();
  });

  it("un homonyme d'une autre organisation ne révèle rien et ne reçoit pas le lot", async () => {
    const autre = (await db.query(`insert into public.organizations(name,status) values('Structure distincte','essai') returning id`)).rows[0].id;
    await db.query(`insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
      values($1,$2,'immeuble',$3,$4,$5)`, [autre,LIGNE.bien,LIGNE.adresse,LIGNE.code_postal,LIGNE.ville]);
    expect((await importer([LIGNE], true))[0].statut).toBe("ok");
    await db.query("reset role");
    const total = await db.query("select count(*)::int n from public.lots l join public.biens b on b.id=l.bien_id where b.organization_id=$1", [autre]);
    expect(total.rows[0].n).toBe(0);
    await agir(gerant);
    await expect(db.query("select * from public.importer_parc($1,$2,true)", [autre,JSON.stringify([LIGNE])])).rejects.toThrow(/responsable/);
  });

  it("rejouer le même fichier ne duplique rien", async () => {
    // On corrige une ligne, on réimporte le fichier entier : c'est le geste
    // naturel, il ne doit pas fabriquer un second parc.
    await importer([LIGNE], true);
    const r = await importer([LIGNE], true);
    expect(r[0].statut).toBe("ok");
    await db.query("reset role");
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.lots where organization_id=$1`,
      [org]
    );
    expect(n).toBe("1");
  });

  it("une ligne qui tombe n'emporte pas les autres, et dit pourquoi", async () => {
    const r = await importer(
      [LIGNE, { ...LIGNE, lot: "B1", quote_part: "150" }, { ...LIGNE, lot: "C1" }],
      true
    );
    expect(r[0].statut).toBe("ok");
    expect(r[1].statut).toBe("erreur");
    expect(r[1].message).toMatch(/Quote-part hors bornes/);
    expect(r[2].statut).toBe("ok");
  });

  it("un locataire nommé sans date d'entrée est refusé, pas deviné", async () => {
    const r = await importer([{ ...LIGNE, date_debut: "" }]);
    expect(r[0].statut).toBe("erreur");
    expect(r[0].message).toMatch(/date d'entrée manque/);
  });

  it("réservé au responsable : un agent ne fait pas basculer le parc", async () => {
    await db.query("reset role");
    const {
      rows: [{ id: agent }],
    } = await db.query<{ id: string }>(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'agt-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'agent')`,
      [agent, org]
    );
    await agir(agent);
    await db.query("savepoint e");
    await expect(
      db.query(`select * from public.importer_parc($1,'[]'::jsonb,true)`, [org])
    ).rejects.toThrow(/responsable/);
    await db.query("rollback to savepoint e");
  });
});
