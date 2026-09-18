/**
 * Tests d'intégration — la reprise de portefeuille comptable (18/09).
 *
 * `reprises_portefeuille` et `reprise_soldes` existaient depuis le 03/09 avec
 * leur RLS activée et AUCUNE politique : des coquilles fermées à double tour,
 * qu'aucune ligne de code n'avait jamais touchées. Une agence qui bascule en
 * cours d'exercice ressaisissait ses soldes à la main.
 *
 * Ce que ces tests gardent, dans l'ordre de ce qui coûte le plus cher :
 *  — on ne bascule PAS un compte qui ne tombe pas juste (écart zéro) ;
 *  — on ne compte JAMAIS un dépôt deux fois ;
 *  — une dette de locataire n'est pas inventée en écriture ;
 *  — le contrôle n'écrit rien, et dit exactement ce que la bascule fera.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let db: Client;
let org: string;
let admin: string;
let agent: string;
let bail: string;
let mandant: string;

type Resultat = {
  ligne: number;
  statut: "ok" | "alerte" | "erreur";
  message: string;
  type: string;
  montant: string;
  tresorerie: boolean;
  bail_id: string | null;
  person_id: string | null;
};

const id = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ id: string }>(sql, args)).rows[0].id;

const compte = async (prefixe: string) =>
  id(
    `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
       raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,
       email_change,email_change_token_new,email_change_token_current)
     values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
       $1||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`,
    [prefixe]
  );

async function simuler(accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal: "aal2" }) : "",
  ]);
  await db.query(`set local role ${role}`);
}

/**
 * Joue une requête dont on ATTEND le refus, sans emporter la transaction.
 *
 * Une erreur SQL abandonne la transaction entière : tout ce qui suit échoue
 * avec « current transaction is aborted », et le test suivant croit à un autre
 * défaut. Le point de sauvegarde rend la transaction au test.
 */
async function refus(sql: string, args: unknown[] = []): Promise<string> {
  await db.query("savepoint essai");
  try {
    await db.query(sql, args);
    await db.query("release savepoint essai");
    throw new Error("PAS_DE_REFUS");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.query("rollback to savepoint essai");
    if (message === "PAS_DE_REFUS") throw new Error(`Attendu un refus, la requête est passée : ${sql}`);
    return message;
  }
}

async function ouvrir(tresorerie: number): Promise<string> {
  await simuler(admin);
  const {
    rows: [{ ouvrir_reprise }],
  } = await db.query<{ ouvrir_reprise: string }>(
    `select public.ouvrir_reprise($1, current_date, $2, 'fichier')`,
    [org, tresorerie]
  );
  return ouvrir_reprise;
}

async function passer(
  reprise: string,
  lignes: Record<string, string>[],
  controleSeulement = true
): Promise<Resultat[]> {
  await simuler(admin);
  const { rows } = await db.query<Resultat>(
    `select * from public.reprendre_soldes($1,$2,$3::jsonb,$4)`,
    [org, reprise, JSON.stringify(lignes), controleSeulement]
  );
  return rows;
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});
afterEach(async () => {
  await db.query("rollback");
});

beforeEach(async () => {
  await db.query("begin");
  await db.query("reset role");
  org = await id(
    "insert into public.organizations(name,status,type) values('Reprise','active','agence') returning id"
  );
  admin = await compte("admin");
  agent = await compte("agent");
  await db.query(
    `insert into public.memberships(account_id,organization_id,role)
     values($1,$2,'admin_agence'),($3,$2,'agent')`,
    [admin, org, agent]
  );
  mandant = await id(
    `insert into public.persons(organization_id,nom,prenom,email)
     values($1,'Moreau','Alain','alain.moreau@exemple.fr') returning id`,
    [org]
  );
  const locataire = await id(
    `insert into public.persons(organization_id,nom,prenom,email)
     values($1,'Nguyen','Linh','linh.nguyen@exemple.fr') returning id`,
    [org]
  );
  const bien = await id(
    `insert into public.biens(organization_id,nom,type,address_line1,postal_code,city)
     values($1,'Les Acacias','appartement','4 rue des Acacias','69003','Lyon') returning id`,
    [org]
  );
  const lot = await id(
    "insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'A1','loue') returning id",
    [org, bien]
  );
  bail = await id(
    `insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges,depot_garantie)
     values($1,$2,$3,'actif',current_date-400,700,50,700) returning id`,
    [org, lot, locataire]
  );
});

describe.skipIf(!DB_URL)("le contrôle dit ce que la bascule fera", () => {
  it("n'écrit rien, et rend une ligne par ligne du fichier", async () => {
    const reprise = await ouvrir(1400);
    const lignes = await passer(reprise, [
      { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr", detenteur: "agence" },
      { type: "fonds_mandant", montant: "700", proprietaire_email: "alain.moreau@exemple.fr" },
    ]);
    expect(lignes.length).toBe(2);
    expect(lignes.every((l) => l.statut === "ok")).toBe(true);
    // Rien d'écrit : ni soldes, ni dépôt, ni mouvement.
    await db.query("reset role");
    for (const t of ["reprise_soldes", "depot_encaissements", "mouvements_mandants"]) {
      const {
        rows: [{ n }],
      } = await db.query<{ n: string }>(`select count(*) as n from public.${t}`);
      expect(Number(n)).toBe(0);
    }
  });

  it("retrouve le bail par l'email du locataire, ou par le nom du lot", async () => {
    const reprise = await ouvrir(700);
    const parEmail = await passer(reprise, [
      { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr", detenteur: "agence" },
    ]);
    expect(parEmail[0].bail_id).toBe(bail);
    const parLot = await passer(reprise, [
      { type: "depot_garantie", montant: "700", bien: "Les Acacias", lot: "A1", detenteur: "agence" },
    ]);
    expect(parLot[0].bail_id).toBe(bail);
  });

  it("lit les montants du tableur français : virgule et espace des milliers", async () => {
    const reprise = await ouvrir(1234.56);
    const lignes = await passer(reprise, [
      { type: "fonds_mandant", montant: "1 234,56", proprietaire_email: "alain.moreau@exemple.fr" },
    ]);
    expect(lignes[0].statut).toBe("ok");
    expect(Number(lignes[0].montant)).toBeCloseTo(1234.56, 2);
  });
});

describe.skipIf(!DB_URL)("ce qui bloque, et pourquoi", () => {
  it("refuse un dépôt sans détenteur : personne ne saurait qui le rend", async () => {
    const reprise = await ouvrir(700);
    const [ligne] = await passer(reprise, [
      { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr" },
    ]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toMatch(/détenteur/i);
  });

  it("refuse de compter deux fois un dépôt déjà encaissé dans Gerimmo", async () => {
    await db.query("reset role");
    await db.query(
      `insert into public.depot_encaissements(organization_id,bail_id,montant,date_encaissement)
       values($1,$2,700,current_date-300)`,
      [org, bail]
    );
    const reprise = await ouvrir(700);
    const [ligne] = await passer(reprise, [
      { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr", detenteur: "agence" },
    ]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toMatch(/deux fois/i);
  });

  it("refuse une ligne qu'aucun bail ni aucun propriétaire ne porte", async () => {
    const reprise = await ouvrir(100);
    const lignes = await passer(reprise, [
      { type: "depot_garantie", montant: "100", locataire_email: "inconnu@exemple.fr", detenteur: "agence" },
      { type: "fonds_mandant", montant: "100", proprietaire_email: "inconnu@exemple.fr" },
    ]);
    expect(lignes.every((l) => l.statut === "erreur")).toBe(true);
  });

  it("refuse un type inconnu plutôt que de le ranger au hasard", async () => {
    const reprise = await ouvrir(0);
    const [ligne] = await passer(reprise, [{ type: "caisse_noire", montant: "100" }]);
    expect(ligne.statut).toBe("erreur");
    expect(ligne.message).toMatch(/type inconnu/i);
  });

  it("ne bascule pas tant qu'une ligne est en erreur", async () => {
    const reprise = await ouvrir(700);
    await simuler(admin);
    expect(
      await refus(`select * from public.reprendre_soldes($1,$2,$3::jsonb,false)`, [
        org,
        reprise,
        JSON.stringify([
          { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr" },
        ]),
      ])
    ).toMatch(/erreur/i);
  });
});

describe.skipIf(!DB_URL)("l'écart zéro", () => {
  it("refuse la bascule quand le détail ne fait pas le total annoncé", async () => {
    // L'agence annonce 1 400 €, le détail en fait 700 : il manque 700 € à
    // quelqu'un, et on ne bascule pas là-dessus.
    const reprise = await ouvrir(1400);
    const lignes = [
      { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr", detenteur: "agence" },
    ];
    expect((await passer(reprise, lignes))[0].statut).toBe("ok");
    await simuler(admin);
    expect(
      await refus(`select * from public.reprendre_soldes($1,$2,$3::jsonb,false)`, [
        org,
        reprise,
        JSON.stringify(lignes),
      ])
    ).toMatch(/ecart/i);
  });

  it("le dépôt détenu par le propriétaire ne compte pas dans la trésorerie", async () => {
    // L'agence ne l'a pas : le faire entrer dans le total fabriquerait un
    // écart le jour du rapprochement bancaire.
    const reprise = await ouvrir(0);
    const [ligne] = await passer(reprise, [
      { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr", detenteur: "proprietaire" },
    ]);
    expect(ligne.tresorerie).toBe(false);
    expect(ligne.statut).toBe("alerte");
  });

  it("la dette d'un locataire ne compte pas non plus : ce n'est pas de l'argent détenu", async () => {
    const reprise = await ouvrir(0);
    const [ligne] = await passer(reprise, [
      { type: "solde_locataire", montant: "-450", locataire_email: "linh.nguyen@exemple.fr" },
    ]);
    expect(ligne.tresorerie).toBe(false);
    expect(ligne.statut).toBe("alerte");
    expect(ligne.message).toMatch(/relance/i);
  });
});

describe.skipIf(!DB_URL)("la bascule, quand tout tombe juste", () => {
  const fichierJuste: Record<string, string>[] = [
    { type: "depot_garantie", montant: "700", locataire_email: "linh.nguyen@exemple.fr", detenteur: "agence" },
    { type: "solde_locataire", montant: "120", locataire_email: "linh.nguyen@exemple.fr" },
    { type: "fonds_mandant", montant: "2500", proprietaire_email: "alain.moreau@exemple.fr" },
  ];

  it("range chaque euro là où le produit le cherchera", async () => {
    const reprise = await ouvrir(3320);
    await passer(reprise, fichierJuste);
    const lignes = await passer(reprise, fichierJuste, false);
    expect(lignes.every((l) => l.statut !== "erreur")).toBe(true);

    await db.query("reset role");
    // Le dépôt rejoint les dépôts encaissés : c'est là que la restitution et
    // le solde de tout compte iront le chercher.
    const {
      rows: [depot],
    } = await db.query<{ montant: string; moyen: string }>(
      `select montant, moyen from public.depot_encaissements where bail_id=$1`,
      [bail]
    );
    expect(Number(depot.montant)).toBe(700);
    expect(depot.moyen).toMatch(/reprise/i);
    // L'avance devient un encaissement : le prochain appel s'imputera dessus.
    const {
      rows: [enc],
    } = await db.query<{ montant: string }>(
      `select montant from public.encaissements where bail_id=$1`,
      [bail]
    );
    expect(Number(enc.montant)).toBe(120);
    // Les fonds mandants entrent au compte mandant, ventilés par propriétaire.
    const {
      rows: [mvt],
    } = await db.query<{ montant: string; appartient_a: string; mandant_person_id: string }>(
      `select montant, appartient_a, mandant_person_id from public.mouvements_mandants where organization_id=$1`,
      [org]
    );
    expect(Number(mvt.montant)).toBe(2500);
    expect(mvt.appartient_a).toBe("proprietaire");
    expect(mvt.mandant_person_id).toBe(mandant);
  });

  it("garde la balance entière, y compris ce qu'elle n'applique pas", async () => {
    const avecDette: Record<string, string>[] = [
      ...fichierJuste,
      { type: "solde_locataire", montant: "-450", locataire_email: "linh.nguyen@exemple.fr" },
    ];
    const reprise = await ouvrir(3320);
    await passer(reprise, avecDette);
    await passer(reprise, avecDette, false);

    await db.query("reset role");
    const { rows } = await db.query<{ type: string; montant: string; anomalie: string | null }>(
      `select type, montant, anomalie from public.reprise_soldes where reprise_id=$1 order by montant`,
      [reprise]
    );
    expect(rows.length).toBe(4);
    const dette = rows.find((r) => Number(r.montant) === -450)!;
    // Elle est dans la balance, avec son motif — mais pas au compte.
    expect(dette.anomalie).toMatch(/relance/i);
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      `select count(*) as n from public.encaissements where bail_id=$1 and montant<0`,
      [bail]
    );
    expect(Number(n)).toBe(0);
  });

  it("une reprise basculée ne se rejoue pas", async () => {
    const reprise = await ouvrir(3320);
    await passer(reprise, fichierJuste);
    await passer(reprise, fichierJuste, false);
    await simuler(admin);
    const args = [org, reprise, JSON.stringify(fichierJuste)];
    expect(await refus(`select * from public.reprendre_soldes($1,$2,$3::jsonb,false)`, args)).toMatch(
      /deja basculee/i
    );
    expect(await refus(`select * from public.reprendre_soldes($1,$2,$3::jsonb,true)`, args)).toMatch(
      /deja basculee/i
    );
  });

  it("deux reprises ouvertes en même temps : refusé", async () => {
    await ouvrir(100);
    await simuler(admin);
    expect(
      await refus(`select public.ouvrir_reprise($1, current_date, 100, 'fichier')`, [org])
    ).toMatch(/deja en cours/i);
  });

  it("une reprise abandonnée libère la place", async () => {
    const reprise = await ouvrir(100);
    await simuler(admin);
    await db.query(`select public.abandonner_reprise($1,$2)`, [org, reprise]);
    await expect(ouvrir(100)).resolves.toBeTruthy();
  });
});

describe.skipIf(!DB_URL)("qui a le droit", () => {
  it("l'agent lit la balance mais ne la crée pas : elle engage le portefeuille", async () => {
    const reprise = await ouvrir(700);
    await simuler(agent);
    expect(
      await refus(`select public.ouvrir_reprise($1, current_date, 100, 'fichier')`, [org])
    ).toMatch(/responsable/i);
    const { rows } = await db.query(`select id from public.reprises_portefeuille where id=$1`, [
      reprise,
    ]);
    expect(rows.length).toBe(1);
  });

  it("une autre agence ne voit rien de cette balance", async () => {
    const reprise = await ouvrir(700);
    await db.query("reset role");
    const autreOrg = await id(
      "insert into public.organizations(name,status,type) values('Voisine','active','agence') returning id"
    );
    const voisin = await compte("voisin");
    await db.query(
      `insert into public.memberships(account_id,organization_id,role) values($1,$2,'admin_agence')`,
      [voisin, autreOrg]
    );
    await simuler(voisin);
    const { rows } = await db.query(`select id from public.reprises_portefeuille where id=$1`, [
      reprise,
    ]);
    expect(rows.length).toBe(0);
    expect(
      await refus(`select * from public.reprendre_soldes($1,$2,'[]'::jsonb,true)`, [org, reprise])
    ).toMatch(/responsable/i);
  });

  it("une organisation suspendue ne bascule plus rien", async () => {
    const sa = await compte("sa");
    await db.query("reset role");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,null,'super_admin')`,
      [sa]
    );
    await simuler(sa);
    await db.query(
      `update public.organizations set status='suspendue'::public.organization_status where id=$1`,
      [org]
    );
    await simuler(admin);
    expect(
      await refus(`select public.ouvrir_reprise($1, current_date, 100, 'fichier')`, [org])
    ).toMatch(/lecture seule/i);
  });
});
