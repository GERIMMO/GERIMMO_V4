/**
 * Décision D18 du 14/10/2026 (devis révisable), relecture du 15/10 : deux décisions SIMULTANÉES sur deux devis du même
 * dossier. « Retenir le devis A » écrit aussi sur le devis B (il passe « non retenu ») ; « demander une révision » ou
 * « refuser » le devis B verrouillaient devis → demande → dossier. Les deux ordres se croisaient : la base tuait l'une
 * des deux sessions (« deadlock detected », 40P01) et l'utilisateur recevait une erreur technique.
 *
 * Correction (20261014602000) : les trois décisions verrouillent le DOSSIER en premier ; elles se succèdent, aucune
 * n'échoue. L'entrelacement est forcé, sans dépendre du hasard : une troisième session tient la demande du devis B, la
 * révision (ou le refus) attend sur elle après ses premiers verrous, « retenir » démarre et attend à son tour, puis la
 * troisième session lâche la demande.
 *
 * Deux sessions ne se voient qu'après un commit : la fixture est VALIDÉE (base locale jetable), puis retirée en fin de
 * fichier. Fichier en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { verifierBaseDeTest } from "./garde-base";
import { supprimerOrganisationDeTest } from "./fixtures/nettoyer-organisation";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MOTIF = "Merci de détailler la main-d'œuvre et de revoir le prix du joint.";
const LIGNES = (centimes: number) =>
  `jsonb_build_array(jsonb_build_object('libelle','Travaux','quantite',1,'prix_unitaire_ht_cents',${centimes},'tva_bps',0))`;

describe.skipIf(!DB_URL)("Décisions simultanées sur deux devis du même dossier (D18, ordre des verrous)", () => {
  let admin: Client;
  let org = "", gerant = "", cptArtisan1 = "", cptArtisan2 = "", artisan1 = "", artisan2 = "", lot = "";
  const comptes: string[] = [];
  const artisans: string[] = [];

  async function agir(c: Client, compte: string) {
    await c.query("reset role");
    await c.query(
      `select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, false)`,
      [compte]
    );
    await c.query("set role authenticated");
  }

  async function nouveauCompte(prefixe: string): Promise<string> {
    const { rows } = await admin.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '','','','','')
       returning id`,
      [prefixe]
    );
    comptes.push(rows[0].id);
    return rows[0].id as string;
  }

  async function nouvelArtisan(compte: string, nom: string, siret: string): Promise<string> {
    const { rows: [a] } = await admin.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email, statut_plateforme, siret_etat, visibilite, account_id)
       values ($1,$2,'0611111111',$3,'valide','verifie','publique',$4) returning id`,
      [nom, siret, `${siret}-${randomUUID()}@test.local`, compte]
    );
    artisans.push(a.id);
    await admin.query(`insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)`, [org, a.id]);
    await admin.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [a.id]);
    await admin.query(`insert into public.artisan_zones values ($1,'75011')`, [a.id]);
    await admin.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type, taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,$3, current_date + 300)`,
      [a.id, `artisans/${a.id}/decennale.pdf`, `emp-dec-${randomUUID()}`]
    );
    return a.id as string;
  }

  /** Un dossier neuf, deux artisans consultés, deux devis déposés : tout est validé, visible de toutes les sessions. */
  async function dossierAvecDeuxDevis() {
    await admin.query("begin");
    await admin.query("reset role");
    const { rows: [inc] } = await admin.query(
      `insert into public.incidents (organization_id, numero, lot_id, canal, categorie, description, etat, imputation, imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2, 'espace_locataire', 'plomberie_canalisation',
               'Fuite sous évier', 'qualifie', 'proprietaire', 'Joint usé par le temps')
       returning id`,
      [org, lot]
    );
    await agir(admin, gerant);
    const { rows: [{ id: consultation }] } = await admin.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',false,30) as id`, [org, inc.id]);
    const { rows: [{ id: s1 }] } = await admin.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan1]);
    const { rows: [{ id: s2 }] } = await admin.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan2]);
    const deposer = async (compte: string, s: string, centimes: number) => {
      await agir(admin, compte);
      const { rows: [{ id }] } = await admin.query(
        `select public.deposer_devis_structure($1, ${LIGNES(centimes)}, 'Diagnostic', 'Remplacement du joint', 'Sous 7 jours', 'Une journée', null, null) as id`,
        [s]);
      return id as string;
    };
    const d1 = await deposer(cptArtisan1, s1, 48000);
    const d2 = await deposer(cptArtisan2, s2, 52000);
    await admin.query("reset role");
    await admin.query("commit");
    return { incident: inc.id as string, s1: s1 as string, s2: s2 as string, d1, d2 };
  }

  async function session(): Promise<{ c: Client; pid: number }> {
    const c = new Client({ connectionString: DB_URL });
    await c.connect();
    const { rows: [{ pid }] } = await c.query(`select pg_backend_pid() as pid`);
    return { c, pid };
  }

  /** Attend que la session `pid` soit bloquée sur un verrou (au plus cinq secondes). */
  async function attendVerrou(pid: number) {
    for (let i = 0; i < 100; i++) {
      const { rows: [r] } = await admin.query(`select wait_event_type from pg_stat_activity where pid = $1`, [pid]);
      if (r?.wait_event_type === "Lock") return;
      await new Promise((ok) => setTimeout(ok, 50));
    }
    throw new Error(`la session ${pid} n'attend pas de verrou`);
  }

  type Issue = { ok: true; valeur: unknown } | { ok: false; code?: string; message: string };
  const issue = (p: Promise<{ rows: Record<string, unknown>[] }>): Promise<Issue> =>
    p.then(
      (r) => ({ ok: true as const, valeur: Object.values(r.rows[0])[0] }),
      (e: { code?: string; message: string }) => ({ ok: false as const, code: e.code, message: e.message })
    );

  /**
   * L'entrelacement qui interbloquait : « décision » (révision ou refus) sur le devis B attend la demande B tenue par une
   * troisième session ; « retenir le devis A » démarre et attend ; la troisième session lâche ; chacun valide dès qu'il a fini.
   */
  async function croiser(decisionSurB: string, paramsB: unknown[], devisA: string, demandeB: string) {
    const tiers = await session();
    const a = await session();
    const b = await session();
    try {
      await tiers.c.query("begin");
      await tiers.c.query(`select 1 from public.incident_sollicitations where id = $1 for update`, [demandeB]);

      await a.c.query("begin");
      await agir(a.c, gerant);
      const pA = issue(a.c.query(decisionSurB, paramsB));
      await attendVerrou(a.pid);

      await b.c.query("begin");
      await agir(b.c, gerant);
      const pB = issue(b.c.query(`select public.retenir_devis($1,$2) as r`, [org, devisA]));
      await attendVerrou(b.pid);

      await tiers.c.query("rollback");
      const rA = await pA;
      await a.c.query(rA.ok ? "commit" : "rollback");
      const rB = await pB;
      await b.c.query(rB.ok ? "commit" : "rollback");
      return { rA, rB };
    } finally {
      await Promise.all([tiers.c.end(), a.c.end(), b.c.end()]);
    }
  }

  beforeAll(async () => {
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    await admin.query("begin");
    const { rows: [o] } = await admin.query(
      `insert into public.organizations (name, status, essai_fin) values ('Concurrence des devis — Agence','essai', current_date + 30) returning id`);
    org = o.id;
    gerant = await nouveauCompte("gerant");
    cptArtisan1 = await nouveauCompte("artisan1");
    cptArtisan2 = await nouveauCompte("artisan2");
    await admin.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`, [gerant, org]);
    const { rows: [bien] } = await admin.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`, [org]);
    const { rows: [l] } = await admin.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot 1','disponible') returning id`, [bien.id, org]);
    lot = l.id;
    // SIRET tirés au hasard : les fichiers parallèles créent leurs propres artisans aux SIRET fixes.
    const siret = () => String(Math.floor(1e13 + Math.random() * 9e13));
    artisan1 = await nouvelArtisan(cptArtisan1, "Plomberie Concurrence 1", siret());
    artisan2 = await nouvelArtisan(cptArtisan2, "Plomberie Concurrence 2", siret());
    await admin.query("commit");
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.query("reset role");
    if (artisans.length) {
      await admin.query("begin");
      await admin.query("set local session_replication_role = replica");
      const { rows } = await admin.query<{ table_name: string }>(
        `select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
          where c.table_schema = 'public' and c.column_name = 'artisan_id' and t.table_type = 'BASE TABLE'`);
      for (const { table_name } of rows) await admin.query(`delete from public."${table_name}" where artisan_id = any($1::uuid[])`, [artisans]);
      await admin.query(`delete from public.artisans where id = any($1::uuid[])`, [artisans]);
      await admin.query("commit");
    }
    await supprimerOrganisationDeTest(admin, org, comptes);
    await admin.end();
  });

  it("« demander une révision » du devis B et « retenir » le devis A en même temps : aucune n'échoue, elles se succèdent", async () => {
    const d = await dossierAvecDeuxDevis();
    const { rA, rB } = await croiser(
      `select public.demander_revision_devis($1,$2,$3,$4) as r`, [org, d.d2, MOTIF, randomUUID()], d.d1, d.s2);
    expect(rA, JSON.stringify(rA)).toEqual({ ok: true, valeur: true });
    expect(rB.ok, JSON.stringify(rB)).toBe(true);
    const { rows: etats } = await admin.query(
      `select id, statut::text from public.incident_devis where id = any($1::uuid[])`, [[d.d1, d.d2]]);
    expect(Object.fromEntries(etats.map((e) => [e.id, e.statut]))).toEqual({ [d.d1]: "retenu", [d.d2]: "revise" });
    const { rows: [s2] } = await admin.query(`select statut::text from public.incident_sollicitations where id = $1`, [d.s2]);
    expect(s2.statut).toBe("non_retenue");
  });

  it("« refuser » le devis B et « retenir » le devis A en même temps : aucune n'échoue, elles se succèdent", async () => {
    const d = await dossierAvecDeuxDevis();
    const { rA, rB } = await croiser(
      `select public.refuser_devis($1,$2,$3,$4) as r`, [org, d.d2, MOTIF, randomUUID()], d.d1, d.s2);
    expect(rA, JSON.stringify(rA)).toEqual({ ok: true, valeur: true });
    expect(rB.ok, JSON.stringify(rB)).toBe(true);
    const { rows: etats } = await admin.query(
      `select id, statut::text from public.incident_devis where id = any($1::uuid[])`, [[d.d1, d.d2]]);
    expect(Object.fromEntries(etats.map((e) => [e.id, e.statut]))).toEqual({ [d.d1]: "retenu", [d.d2]: "refuse" });
  });
});
