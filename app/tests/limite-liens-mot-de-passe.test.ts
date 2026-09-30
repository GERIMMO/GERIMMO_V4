/**
 * La limite des liens « mot de passe » demandés sans être connecté
 * (20260930130000_limite_liens_mot_de_passe.sql).
 *
 * L'API d'administration qui fabrique désormais ces liens n'a pas la limite
 * de fréquence de Supabase Auth : 3 envois par adresse et 20 par IP sur une
 * heure, tenus en base, et rien de tout cela n'est lisible ni appelable par
 * les rôles de l'application.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("autoriser_lien_mot_de_passe", () => {
  let db: Client;
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });
  afterAll(async () => {
    await db?.end();
  });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("set local role service_role");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  const autoriser = async (email: string, ip: string | null = null) =>
    (await db.query<{ ok: boolean }>("select public.autoriser_lien_mot_de_passe($1, $2) as ok", [email, ip])).rows[0].ok;

  it("3 demandes par adresse et par heure, casse et espaces confondus", async () => {
    expect(await autoriser("moi@exemple.fr", "198.51.100.1")).toBe(true);
    expect(await autoriser(" MOI@exemple.fr", "198.51.100.2")).toBe(true);
    expect(await autoriser("moi@exemple.fr ", "198.51.100.3")).toBe(true);
    expect(await autoriser("moi@exemple.fr", "198.51.100.4")).toBe(false);
    // Une autre adresse n'est pas pénalisée.
    expect(await autoriser("autre@exemple.fr", "198.51.100.4")).toBe(true);
  });

  it("20 demandes par IP et par heure, toutes adresses confondues", async () => {
    for (let i = 0; i < 20; i++) expect(await autoriser(`p${i}@exemple.fr`, "203.0.113.9")).toBe(true);
    expect(await autoriser("p20@exemple.fr", "203.0.113.9")).toBe(false);
    expect(await autoriser("p20@exemple.fr", "203.0.113.10")).toBe(true);
  });

  it("une demande de plus d'une heure ne compte plus ; l'adresse n'est jamais conservée en clair", async () => {
    for (let i = 0; i < 3; i++) await autoriser("vieux@exemple.fr");
    expect(await autoriser("vieux@exemple.fr")).toBe(false);
    await db.query("reset role");
    await db.query("update public.demandes_lien_mot_de_passe set cree_le = now() - interval '61 minutes'");
    const { rows } = await db.query("select empreinte_email from public.demandes_lien_mot_de_passe");
    expect(rows.every((r) => !String(r.empreinte_email).includes("@"))).toBe(true);
    await db.query("set local role service_role");
    expect(await autoriser("vieux@exemple.fr")).toBe(true);
  });

  it("refuse une adresse vide", async () => {
    expect(await autoriser("  ")).toBe(false);
  });

  // La variante par clé (20260930140000_limite_invitations.sql, audit 30/09 M4) :
  // les invitations d'une organisation, 30 par heure.
  const autoriserCle = async (cle: string, max = 30) =>
    (await db.query<{ ok: boolean }>("select public.autoriser_lien_mot_de_passe_cle($1, $2) as ok", [cle, max])).rows[0].ok;

  it("par clé : p_max demandes par heure, une clé n'en pénalise pas une autre", async () => {
    for (let i = 0; i < 3; i++) expect(await autoriserCle("organisation:org-a", 3)).toBe(true);
    expect(await autoriserCle("organisation:org-a", 3)).toBe(false);
    expect(await autoriserCle("organisation:org-b", 3)).toBe(true);
    // Le défaut de p_max est 30.
    for (let i = 0; i < 30; i++) expect(await autoriserCle("organisation:org-c")).toBe(true);
    expect(await autoriserCle("organisation:org-c")).toBe(false);
  });

  it("par clé : une clé ne se confond jamais avec une adresse, et l'ancienneté libère", async () => {
    // « moi@exemple.fr » utilisée comme clé ne touche pas au compteur de l'adresse.
    for (let i = 0; i < 3; i++) expect(await autoriserCle("moi@exemple.fr", 3)).toBe(true);
    expect(await autoriser("moi@exemple.fr")).toBe(true);
    await db.query("reset role");
    await db.query("update public.demandes_lien_mot_de_passe set cree_le = now() - interval '61 minutes'");
    const { rows } = await db.query("select empreinte_email, ip from public.demandes_lien_mot_de_passe");
    expect(rows.every((r) => !String(r.empreinte_email).includes("@") && !String(r.empreinte_email).includes("org"))).toBe(true);
    await db.query("set local role service_role");
    expect(await autoriserCle("moi@exemple.fr", 3)).toBe(true);
  });

  it("par clé : refuse une clé vide ou un maximum absurde", async () => {
    expect(await autoriserCle("  ")).toBe(false);
    expect(await autoriserCle("organisation:x", 0)).toBe(false);
  });

  it("par clé : réservée au service", async () => {
    await db.query("reset role");
    const { rows } = await db.query(`
      select has_function_privilege('anon', 'public.autoriser_lien_mot_de_passe_cle(text,integer)', 'EXECUTE') as anon_fn,
             has_function_privilege('authenticated', 'public.autoriser_lien_mot_de_passe_cle(text,integer)', 'EXECUTE') as auth_fn,
             has_function_privilege('service_role', 'public.autoriser_lien_mot_de_passe_cle(text,integer)', 'EXECUTE') as service_fn`);
    expect(rows[0]).toEqual({ anon_fn: false, auth_fn: false, service_fn: true });
  });

  it("n'est ouverte qu'au service : ni anon ni authenticated n'appellent la fonction ni ne lisent la table", async () => {
    await db.query("reset role");
    const { rows } = await db.query(`
      select has_function_privilege('anon', 'public.autoriser_lien_mot_de_passe(text,text)', 'EXECUTE') as anon_fn,
             has_function_privilege('authenticated', 'public.autoriser_lien_mot_de_passe(text,text)', 'EXECUTE') as auth_fn,
             has_function_privilege('service_role', 'public.autoriser_lien_mot_de_passe(text,text)', 'EXECUTE') as service_fn,
             has_table_privilege('anon', 'public.demandes_lien_mot_de_passe', 'SELECT,INSERT,UPDATE,DELETE') as anon_table,
             has_table_privilege('authenticated', 'public.demandes_lien_mot_de_passe', 'SELECT,INSERT,UPDATE,DELETE') as auth_table,
             (select relrowsecurity from pg_class where oid = 'public.demandes_lien_mot_de_passe'::regclass) as rls`);
    expect(rows[0]).toEqual({ anon_fn: false, auth_fn: false, service_fn: true, anon_table: false, auth_table: false, rls: true });
  });
});
