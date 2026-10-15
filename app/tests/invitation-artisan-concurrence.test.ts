/**
 * Invitation d'un artisan par un propriétaire direct (décision du 15/10/2026) : l'acceptation est sûre en concurrence.
 *
 *  - deux acceptations SIMULTANÉES de la même invitation (double clic, deux onglets) : la seconde attend la première,
 *    puis répond « acceptée » sans rien refaire — une seule ligne au carnet, une seule trace ;
 *  - une acceptation pendant que le propriétaire ANNULE : elles se succèdent ; l'annulation passée d'abord, l'artisan
 *    reçoit « n'est plus valable » et rien n'est rattaché.
 * L'entrelacement est forcé (la seconde session est vue en attente de verrou avant que la première ne valide).
 * Deux sessions ne se voient qu'après un commit : la fixture est VALIDÉE (base locale jetable), puis retirée en fin de
 * fichier. Fichier en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supprimerOrganisationDeTest } from "./fixtures/nettoyer-organisation";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Invitation d'artisan — acceptation sûre en concurrence", () => {
  let admin: Client;
  let org = "", proprietaire = "";
  const comptes: string[] = [];
  const artisans: string[] = [];

  async function agir(c: Client, compte: string) {
    await c.query("reset role");
    await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text, false)", [compte]);
    await c.query("set role authenticated");
  }
  async function nouveauCompte(email: string): Promise<string> {
    const { rows } = await admin.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
         raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','') returning id`,
      [email]
    );
    comptes.push(rows[0].id);
    return rows[0].id as string;
  }
  /** Un artisan inscrit et une invitation en attente pour son adresse, validés en base. */
  async function invitationEnAttente(): Promise<{ invitation: string; compte: string; artisan: string }> {
    const email = `concurrence-${Math.random().toString(36).slice(2, 10)}@test.local`;
    const compte = await nouveauCompte(email);
    const { rows: [a] } = await admin.query(
      "insert into public.artisans(account_id, raison_sociale, siret, telephone) values($1,'Artisan concurrence',$2,'0600000000') returning id",
      [compte, `6${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 9000 + 1000)}`]
    );
    artisans.push(a.id);
    const c = new Client({ connectionString: DB_URL });
    await c.connect();
    try {
      await agir(c, proprietaire);
      const { rows: [r] } = await c.query("select public.preparer_invitation_artisan($1,$2) r", [org, email]);
      return { invitation: r.r.id, compte, artisan: a.id };
    } finally {
      await c.end();
    }
  }
  async function attendreVerrou(pid: number) {
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query("select wait_event_type from pg_stat_activity where pid=$1", [pid]);
      if (rows[0]?.wait_event_type === "Lock") return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("La seconde session n'a jamais attendu de verrou");
  }
  async function pid(c: Client): Promise<number> {
    return (await c.query("select pg_backend_pid() p")).rows[0].p;
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    const { rows: [o] } = await admin.query("insert into public.organizations(name,type,status) values('Parc concurrence invitation','proprietaire_direct','active') returning id");
    org = o.id;
    proprietaire = await nouveauCompte(`proprio-concurrence-${Math.random().toString(36).slice(2, 10)}@test.local`);
    await admin.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [proprietaire, org]);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.query("reset role");
    if (artisans.length) {
      await admin.query("begin");
      await admin.query("set local session_replication_role = replica");
      await admin.query("delete from public.invitations_artisans where organization_id=$1", [org]);
      await admin.query("delete from public.artisan_agences where artisan_id = any($1::uuid[])", [artisans]);
      await admin.query("delete from public.artisans where id = any($1::uuid[])", [artisans]);
      await admin.query("commit");
    }
    await supprimerOrganisationDeTest(admin, org, comptes);
    await admin.end();
  });

  it("deux acceptations simultanées : la seconde attend, puis répond « acceptée » sans doubler le carnet ni la trace", async () => {
    const { invitation, compte, artisan } = await invitationEnAttente();
    const a = new Client({ connectionString: DB_URL });
    const b = new Client({ connectionString: DB_URL });
    await a.connect();
    await b.connect();
    try {
      await agir(a, compte);
      await agir(b, compte);
      await a.query("begin");
      expect((await a.query("select public.repondre_invitation_artisan($1,true) r", [invitation])).rows[0].r).toEqual({ etat: "acceptee" });
      const pidB = await pid(b);
      const seconde = b.query("select public.repondre_invitation_artisan($1,true) r", [invitation]);
      await attendreVerrou(pidB);
      await a.query("commit");
      expect((await seconde).rows[0].r).toEqual({ etat: "acceptee" });
    } finally {
      await a.end();
      await b.end();
    }
    const { rows: relations } = await admin.query("select statut from public.artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisan]);
    expect(relations).toEqual([{ statut: "actif" }]);
    const { rows: traces } = await admin.query(
      "select count(*)::int n from public.audit_log where organization_id=$1 and action='invitation_artisan_acceptee' and details->>'invitation'=$2", [org, invitation]);
    expect(traces[0].n).toBe(1);
  });

  it("acceptation pendant une annulation : elles se succèdent, l'annulation l'emporte et rien n'est rattaché", async () => {
    const { invitation, compte, artisan } = await invitationEnAttente();
    const p = new Client({ connectionString: DB_URL });
    const a = new Client({ connectionString: DB_URL });
    await p.connect();
    await a.connect();
    try {
      await agir(p, proprietaire);
      await agir(a, compte);
      await p.query("begin");
      await p.query("select public.annuler_invitation_artisan($1)", [invitation]);
      const pidA = await pid(a);
      const acceptation = a.query("select public.repondre_invitation_artisan($1,true) r", [invitation]);
      await attendreVerrou(pidA);
      await p.query("commit");
      expect((await acceptation).rows[0].r).toMatchObject({ etat: "annulee", erreur: expect.stringMatching(/plus valable/) });
    } finally {
      await p.end();
      await a.end();
    }
    expect((await admin.query("select etat, artisan_id from public.invitations_artisans where id=$1", [invitation])).rows[0]).toEqual({ etat: "annulee", artisan_id: null });
    expect((await admin.query("select count(*)::int n from public.artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisan])).rows[0].n).toBe(0);
  });
});
