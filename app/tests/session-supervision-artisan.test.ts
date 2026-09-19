/**
 * Tests d'intégration — entrer dans la session d'un artisan (19/09).
 *
 * Demande du porteur du projet : « je veux pas une simple vue, je souhaite
 * entrer dans sa session comme si j'étais l'artisan ». La bascule passe par
 * `mon_artisan_id()`, la pièce maîtresse sur laquelle s'appuient les
 * cinquante-quatre points du portail — lectures, écritures, stockage.
 *
 * CE QUE CES TESTS GARDENT. Que l'identité s'emprunte VRAIMENT (les écritures
 * suivent, pas seulement les lectures) ; et qu'elle ne s'emprunte QUE par la
 * porte prévue — supervision vérifiée à chaque lecture, session unique, bornée
 * dans le temps, impossible à forger, et inscrite au journal d'audit.
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
let superviseur: string;
let gerant: string;
let compteArtisan: string;
let artisan: string;
let autreArtisan: string;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-ssa-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(accountId: string | null, aal: "aal1" | "aal2" = "aal2") {
  await db.query("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    accountId ? JSON.stringify({ sub: accountId, role: "authenticated", aal }) : "",
  ]);
  await db.query("set local role authenticated");
}

async function creerArtisan(nom: string, compte: string | null): Promise<string> {
  await db.query("reset role");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.artisans (account_id, raison_sociale, siret, telephone, email, statut_plateforme)
     values ($1, $2, lpad((random()*10^13)::bigint::text, 14, '0'), '0600000000',
             'banc-'||gen_random_uuid()||'@test.local', 'valide')
     returning id`,
    [compte, nom]
  );
  return id;
}

/** Un appel dont on attend le refus, isolé dans un savepoint. */
async function refus(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint refus");
  try {
    await db.query(sql, params);
    await db.query("release savepoint refus");
    return "";
  } catch (e) {
    await db.query("rollback to savepoint refus");
    return (e as Error).message;
  }
}

async function identite(): Promise<string | null> {
  const { rows } = await db.query<{ id: string | null }>("select public.mon_artisan_id() as id");
  return rows[0].id;
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
  const {
    rows: [org],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status, type) values ('Agence du banc','active','agence') returning id`
  );
  superviseur = await creerUtilisateur();
  gerant = await creerUtilisateur();
  compteArtisan = await creerUtilisateur();
  // La supervision n'appartient à aucune organisation : la contrainte
  // `memberships_super_admin_sans_org` l'exige, et c'est ce qui fait d'elle un
  // rôle de plateforme plutôt qu'un rôle de client.
  await db.query(
    `insert into public.memberships (account_id, organization_id, role)
     values ($1, null, 'super_admin'), ($2, $3, 'admin_agence')`,
    [superviseur, gerant, org.id]
  );
  artisan = await creerArtisan("Plomberie du banc", compteArtisan);
  autreArtisan = await creerArtisan("Électricité du banc", null);
});

describe("chez soi, rien ne change", () => {
  it("l'artisan reste lui-même, et la supervision n'emprunte rien sans le demander", async () => {
    await simuler(compteArtisan);
    expect(await identite()).toBe(artisan);

    await simuler(superviseur);
    expect(await identite()).toBeNull();
  });
});

describe("entrer dans la session d'un artisan", () => {
  it("fait emprunter son identité — et les ÉCRITURES suivent, pas seulement les lectures", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1, $2)", [artisan, "assistance au dépôt"]);
    expect(await identite()).toBe(artisan);

    // La fiche lue est la sienne.
    const { rows: fiche } = await db.query("select * from public.mon_artisan()");
    expect(fiche[0].raison_sociale).toBe("Plomberie du banc");

    // Et un geste d'ARTISAN passe : le dépôt d'une pièce, rattaché à LUI.
    const { rows: depot } = await db.query(
      `select public.deposer_ma_piece_artisan('decennale', 'artisans/' || $1 || '/decennale.pdf',
         'application/pdf', 1024, 'empreinte', current_date, current_date + 365) as id`,
      [artisan]
    );
    expect(depot[0].id).toBeTruthy();
    await db.query("reset role");
    const { rows: piece } = await db.query(
      "select artisan_id from public.artisan_pieces where id = $1",
      [depot[0].id]
    );
    expect(piece[0].artisan_id).toBe(artisan);
  });

  it("laisse une trace : l'ouverture et la fermeture sont au journal d'audit, au nom du superviseur", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    await db.query("select public.fermer_session_artisan()");

    await db.query("reset role");
    const { rows } = await db.query(
      `select action, account_id, details->>'artisan_id' as artisan
         from public.audit_log
        where action in ('ouverture_session_artisan','fermeture_session_artisan')
        order by created_at, action`
    );
    expect(rows.map((r) => r.action)).toEqual([
      "fermeture_session_artisan",
      "ouverture_session_artisan",
    ]);
    // Le superviseur reste l'auteur : aucun jeton n'est émis au nom de l'artisan.
    expect(rows.every((r) => r.account_id === superviseur)).toBe(true);
    expect(rows.every((r) => r.artisan === artisan)).toBe(true);
  });

  it("se referme, et rend son identité au superviseur", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    expect(await identite()).toBe(artisan);
    await db.query("select public.fermer_session_artisan()");
    expect(await identite()).toBeNull();
  });

  it("n'empile pas deux identités : ouvrir ailleurs referme la précédente", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    await db.query("select public.ouvrir_session_artisan($1)", [autreArtisan]);
    expect(await identite()).toBe(autreArtisan);

    await db.query("reset role");
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.supervision_sessions_artisan where account_id = $1 and fermee_le is null",
      [superviseur]
    );
    expect(rows[0].n).toBe(1);
  });

  it("expire toute seule : une traversée oubliée ne prête plus rien", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    await db.query("reset role");
    await db.query(
      "update public.supervision_sessions_artisan set expire_le = now() - interval '1 minute' where account_id = $1",
      [superviseur]
    );
    await simuler(superviseur);
    expect(await identite()).toBeNull();
  });
});

describe("la porte ne s'ouvre que pour la supervision", () => {
  it("refuse un gérant d'agence, et un artisan qui viserait un confrère", async () => {
    await simuler(gerant);
    expect(await refus("select public.ouvrir_session_artisan($1)", [artisan])).toMatch(
      /reserve a la supervision/i
    );
    await simuler(compteArtisan);
    expect(await refus("select public.ouvrir_session_artisan($1)", [autreArtisan])).toMatch(
      /reserve a la supervision/i
    );
    // Et leur identité n'a pas bougé.
    expect(await identite()).toBe(artisan);
  });

  it("refuse une session sans second facteur, et cesse d'en prêter une si la session retombe en AAL1", async () => {
    await simuler(superviseur, "aal1");
    expect(await refus("select public.ouvrir_session_artisan($1)", [artisan])).toMatch(
      /reserve a la supervision/i
    );

    // Ouverte en AAL2, puis relue en AAL1 : le droit se REVÉRIFIE à la lecture,
    // la ligne ouverte ne suffit pas.
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    expect(await identite()).toBe(artisan);
    await simuler(superviseur, "aal1");
    expect(await identite()).toBeNull();
  });

  it("ne se forge pas : la table n'est ouverte à l'écriture pour personne", async () => {
    await simuler(gerant);
    const message = await refus(
      `insert into public.supervision_sessions_artisan (account_id, artisan_id, expire_le)
       values ($1, $2, now() + interval '1 hour')`,
      [gerant, artisan]
    );
    expect(message).toMatch(/permission denied|droit|refus/i);
    expect(await identite()).toBeNull();
  });

  it("perdre la supervision coupe l'emprunt, même la ligne encore ouverte", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    await db.query("reset role");
    await db.query(
      "update public.memberships set status = 'inactive' where account_id = $1 and role = 'super_admin'",
      [superviseur]
    );
    await simuler(superviseur);
    expect(await identite()).toBeNull();
  });

  it("laisse toujours REFERMER, même sans supervision : on ne reste pas coincé dedans", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    await simuler(superviseur, "aal1");
    await db.query("select public.fermer_session_artisan()");
    await db.query("reset role");
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.supervision_sessions_artisan where account_id = $1 and fermee_le is null",
      [superviseur]
    );
    expect(rows[0].n).toBe(0);
  });

  it("dit au portail chez qui l'on est, et jusqu'à quand", async () => {
    await simuler(superviseur);
    await db.query("select public.ouvrir_session_artisan($1)", [artisan]);
    const { rows } = await db.query("select * from public.ma_session_artisan()");
    expect(rows).toHaveLength(1);
    expect(rows[0].artisan_id).toBe(artisan);
    expect(rows[0].raison_sociale).toBe("Plomberie du banc");
    expect(new Date(rows[0].expire_le).getTime()).toBeGreaterThan(Date.now());

    await db.query("select public.fermer_session_artisan()");
    const { rows: apres } = await db.query("select * from public.ma_session_artisan()");
    expect(apres).toHaveLength(0);
  });
});
