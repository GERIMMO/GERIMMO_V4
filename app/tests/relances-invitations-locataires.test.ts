/**
 * Relances automatiques des invitations de locataire à J+3 et J+10 (décision du dirigeant du 15/10/2026, point X16,
 * fiche REP-05 ; RM-16.6.1, RM-16.7.2, RM-16.4.3). Migration 20261014830000.
 *
 * Bout à bout sur la base de test : la passe (`envoyerRelancesInvitations`) appelle les VRAIES fonctions SQL, en
 * `service_role`, par un client minimal posé sur la connexion du test. Seul l'expéditeur est une doublure : aucun
 * e-mail ne part, aucun lien n'est fabriqué.
 *
 * Le jour de Paris est FIGÉ (la fonction `aujourdhui_paris()` est remplacée dans le point de reprise de chaque cas) ;
 * les instants d'envoi sont posés explicitement. Une transaction unique, annulée à la fin ; chaque cas dans son point
 * de reprise.
 *
 * Fichier rangé dans le groupe « en série » (vitest.config.ts) : il remplace `aujourdhui_paris()` et rejoue la
 * migration et son retour arrière (DDL sur `invitations_locataires`).
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { ArretSupervision, verifierAvantEffet } from "../src/lib/controle-effets";
import {
  envoyerRelancesInvitations,
  type ExpediteurRappelInvitation,
} from "../src/lib/relances-invitations";
import type { ResultatRappelInvitation } from "../src/lib/lien-mot-de-passe";

config({ path: ".env.local", quiet: true });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const MIGRATION = "supabase/migrations/20261014830000_relances_invitations_locataires.sql";
const RETOUR = "supabase/retours-arriere/20261014830000_relances_invitations_locataires.retour.sql";
/** 11 h à Paris : dans la plage des relances. */
const EN_JOURNEE = new Date("2026-11-20T10:00:00Z");
/** J+0 : le 2 novembre 2026, 9 h à Paris. */
const J0 = "2026-11-02T09:00:00+01:00";
const jour = (n: number) => {
  const d = new Date(Date.UTC(2026, 10, 2 + n));
  return d.toISOString().slice(0, 10);
};

describe.skipIf(!DB_URL)("Relances des invitations de locataire (X16)", () => {
  let db: Client;
  let org = "", autreOrg = "", owner = "", autreOwner = "", person = "", invite = "";

  const admin = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', '', true)");
  };
  const en = async (id: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  };
  const enService = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    await db.query("set local role service_role");
  };
  const echec = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, args); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
    finally { await db.query("release savepoint refus"); }
  };

  /** Le client de service de la passe : chaque appel RPC exécute la vraie fonction, en `service_role`. */
  const appels: string[] = [];
  const service = {
    rpc: async (nom: string, args: Record<string, unknown> = {}) => {
      appels.push(nom);
      await admin();
      const { rows: [{ ensemble }] } = await db.query(
        "select coalesce(bool_or(proretset), false) as ensemble from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace",
        [nom]
      );
      const cles = Object.keys(args);
      await db.query("savepoint rpc");
      try {
        await enService();
        const r = await db.query(
          `select * from public.${nom}(${cles.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as resultat`,
          cles.map((k) => args[k])
        );
        await admin();
        await db.query("release savepoint rpc");
        return { data: ensemble ? r.rows : (r.rows[0]?.resultat ?? null), error: null };
      } catch (e) {
        await db.query("rollback to savepoint rpc");
        await db.query("release savepoint rpc");
        await admin();
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  } as unknown as SupabaseClient;

  /** La doublure de l'expéditeur : note chaque relance « envoyée », rend l'issue demandée. */
  let envois: { email: string; invitationId: string; expireLe: string }[] = [];
  let issue: ResultatRappelInvitation | (() => never) = { envoye: true };
  const expedier: ExpediteurRappelInvitation = async (p) => {
    await p.avantEnvoi?.();
    if (typeof issue === "function") issue();
    envois.push({ email: p.email, invitationId: p.invitationId, expireLe: p.expireLe });
    return issue as ResultatRappelInvitation;
  };
  const passe = (maintenant = EN_JOURNEE) =>
    envoyerRelancesInvitations(service, { maintenant, expedier, avantEffet: () => verifierAvantEffet(service, "rappels") });

  const figerJour = async (j: string) => {
    await admin();
    await db.query(
      `create or replace function public.aujourdhui_paris() returns date
       language sql stable set search_path to '' as $f$ select date '${j}' $f$`
    );
  };
  const relances = async (id = invite) => {
    await admin();
    return (await db.query("select rang, etat, jour::text as jour, envoyee_le is not null as envoyee from public.relances_invitations_locataires where invitation_id = $1 order by rang", [id])).rows;
  };
  const journal = async (action: string) => {
    await admin();
    return (await db.query("select account_id, details from public.audit_log where organization_id = $1 and action = $2 order by created_at", [org, action])).rows;
  };

  async function compte(prefixe = "relance"): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-'||$1||'-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  }
  async function organisation(gerant: string, nom: string): Promise<string> {
    const { rows: [o] } = await db.query("insert into organizations(name,type,status) values($1,'proprietaire_direct','active') returning id", [nom]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [gerant, o.id]);
    return o.id as string;
  }
  /** Une fiche, son invitation préparée par le gérant, et son premier envoi à l'instant donné. */
  async function invitation(o = org, gerant = owner, envoi: string | null = J0): Promise<{ person: string; invite: string }> {
    await admin();
    const { rows: [p] } = await db.query(
      "insert into persons(organization_id,nom,email) values($1,'TEST locataire','test-relance-'||gen_random_uuid()||'@example.invalid') returning id",
      [o]
    );
    await en(gerant);
    const { rows: [{ r }] } = await db.query("select public.preparer_invitation_locataire($1,$2) r", [o, p.id]);
    await admin();
    if (envoi) await db.query("update public.invitations_locataires set envoye_le = $2 where id = $1", [r.id, envoi]);
    return { person: p.id as string, invite: r.id as string };
  }

  beforeAll(async () => {
    if (!DB_URL || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):[0-9]{1,5}\/gerimmo_ci_[a-z_]+$/.test(DB_URL)) throw Error("Base locale dédiée requise");
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");
    const { rows: [{ present }] } = await db.query("select to_regclass('public.relances_invitations_locataires') is not null as present");
    if (!present) throw Error(`Migration absente de la base de test : ${MIGRATION}`);
  });
  beforeEach(async () => {
    await admin();
    await db.query("savepoint cas");
    owner = await compte("gerant");
    autreOwner = await compte("autre");
    org = await organisation(owner, "TEST relances");
    autreOrg = await organisation(autreOwner, "TEST relances bis");
    ({ person, invite } = await invitation());
    envois = [];
    issue = { envoye: true };
    appels.length = 0;
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("J+2 rien, J+3 une relance, rejeu sans double, J+4 à J+9 rien, J+10 la seconde, J+11 rien", async () => {
    await figerJour(jour(2));
    expect(await passe()).toMatchObject({ envoyees: 0 });
    expect(envois).toHaveLength(0);

    await figerJour(jour(3));
    expect(await passe()).toMatchObject({ envoyees: 1, echecs: 0, incertaines: 0 });
    expect(envois).toHaveLength(1);
    expect(envois[0].invitationId).toBe(invite);
    expect(await relances()).toEqual([{ rang: 1, etat: "envoyee", jour: jour(3), envoyee: true }]);

    // Rejeu le même jour (seconde passe, mission relancée) : rien de plus.
    expect(await passe()).toMatchObject({ envoyees: 0 });
    for (let n = 4; n <= 9; n++) {
      await figerJour(jour(n));
      expect(await passe(), `J+${n}`).toMatchObject({ envoyees: 0 });
    }
    expect(envois).toHaveLength(1);

    await figerJour(jour(10));
    expect(await passe()).toMatchObject({ envoyees: 1 });
    expect(await relances()).toEqual([
      { rang: 1, etat: "envoyee", jour: jour(3), envoyee: true },
      { rang: 2, etat: "envoyee", jour: jour(10), envoyee: true },
    ]);

    for (const n of [11, 12, 20, 29]) {
      await figerJour(jour(n));
      expect(await passe(), `J+${n}`).toMatchObject({ envoyees: 0 });
    }
    expect(envois).toHaveLength(2);

    // Journal d'audit : une ligne par relance, sans compte (le système), avec son rang.
    const lignes = await journal("invitation_locataire_relancee");
    expect(lignes.map((l) => l.details.rang)).toEqual([1, 2]);
    expect(lignes.every((l) => l.account_id === null && l.details.invitation === invite && l.details.person_id === person)).toBe(true);
  });

  it("le même lien : la relance vise la même invitation, sans en créer une nouvelle", async () => {
    await figerJour(jour(3));
    await passe();
    await admin();
    const { rows } = await db.query("select id, etat, expire_le from public.invitations_locataires where person_id = $1", [person]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(invite);
    expect(envois[0].expireLe).toEqual(rows[0].expire_le);
  });

  it.each([
    ["acceptée", async () => { await admin(); const { rows: [i] } = await db.query("select account_id from public.invitations_locataires where id=$1", [invite]); await en(i.account_id); await db.query("select public.repondre_invitation_locataire($1,true)", [invite]); }],
    ["refusée", async () => { await admin(); const { rows: [i] } = await db.query("select account_id from public.invitations_locataires where id=$1", [invite]); await en(i.account_id); await db.query("select public.repondre_invitation_locataire($1,false)", [invite]); }],
    ["annulée", async () => { await en(owner); await db.query("select public.annuler_invitation_locataire($1)", [invite]); }],
    ["expirée (calculée à l'instant, état encore « en attente »)", async () => { await admin(); await db.query("update public.invitations_locataires set expire_le = now() - interval '1 second' where id = $1", [invite]); }],
  ])("invitation %s : aucune relance", async (_cas, geste) => {
    await geste();
    for (const n of [3, 10]) {
      await figerJour(jour(n));
      expect(await passe()).toMatchObject({ envoyees: 0 });
    }
    expect(envois).toHaveLength(0);
    expect(await relances()).toEqual([]);
  });

  it("refusée après la première relance : la seconde ne part pas (RM-16.7.2)", async () => {
    await figerJour(jour(3));
    await passe();
    await admin();
    const { rows: [i] } = await db.query("select account_id from public.invitations_locataires where id=$1", [invite]);
    await en(i.account_id);
    await db.query("select public.repondre_invitation_locataire($1,false)", [invite]);
    await figerJour(jour(10));
    expect(await passe()).toMatchObject({ envoyees: 0 });
    expect(envois).toHaveLength(1);
  });

  it("renvoi manuel : J+0 ne bouge pas, mais aucune relance dans les trois jours qui suivent", async () => {
    await admin();
    // Renvoi à J+1 : la première relance attend J+4 (trois jours après le renvoi), pas J+3.
    await db.query("update public.invitations_locataires set envoye_le = '2026-11-03T15:00:00+01:00' where id = $1", [invite]);
    const { rows: [i] } = await db.query("select premier_envoi_le from public.invitations_locataires where id = $1", [invite]);
    expect(new Date(i.premier_envoi_le).toISOString()).toBe(new Date(J0).toISOString());
    await figerJour(jour(3));
    expect(await passe()).toMatchObject({ envoyees: 0 });
    await figerJour(jour(4));
    expect(await passe()).toMatchObject({ envoyees: 1 });
    // Renvoi à J+8 : la seconde attend J+11 au lieu de J+10.
    await admin();
    await db.query("update public.invitations_locataires set envoye_le = '2026-11-10T09:00:00+01:00' where id = $1", [invite]);
    await figerJour(jour(10));
    expect(await passe()).toMatchObject({ envoyees: 0 });
    await figerJour(jour(11));
    expect(await passe()).toMatchObject({ envoyees: 1 });
    expect((await relances()).map((r) => [r.rang, r.jour])).toEqual([[1, jour(4)], [2, jour(11)]]);
  });

  it("rattrapage : un rang 1 manqué n'est plus envoyé à J+10 ; la seconde part seule", async () => {
    await figerJour(jour(12));
    expect(await passe()).toMatchObject({ envoyees: 1 });
    expect((await relances()).map((r) => r.rang)).toEqual([2]);
    await figerJour(jour(13));
    expect(await passe()).toMatchObject({ envoyees: 0 });
  });

  it("bascule de minuit à Paris : envoyée à 00 h 30 (23 h 30 UTC la veille), J+0 est le jour de Paris", async () => {
    const { invite: tardive } = await invitation(org, owner, "2026-11-02T23:30:00Z"); // 3 novembre, 0 h 30 à Paris
    await figerJour("2026-11-05"); // J+3 compté en UTC, J+2 à Paris
    await passe();
    expect(envois.filter((e) => e.invitationId === tardive)).toHaveLength(0);
    await figerJour("2026-11-06");
    await passe();
    expect(envois.filter((e) => e.invitationId === tardive)).toHaveLength(1);
  });

  it.each(["global", "rappels"])("arrêt d'urgence « %s » actif : rien n'est réservé ni envoyé", async (cle) => {
    await admin();
    await db.query("insert into public.supervision_arrets(cle, arrete, motif, auteur) values ($1, true, 'Essai des relances', $2)", [cle, owner]);
    await figerJour(jour(3));
    await expect(passe()).rejects.toBeInstanceOf(ArretSupervision);
    expect(envois).toHaveLength(0);
    expect(await relances()).toEqual([]);
    // Même appelée directement, la base refuse la réservation.
    await enService();
    const { rows: [{ r }] } = await db.query("select public.reserver_relance_invitation_locataire($1, 1::smallint) r", [invite]);
    expect(r).toBe(false);
    expect(await relances()).toEqual([]);
  });

  it("arrêt d'urgence posé entre la réservation et l'envoi : réservation retirée, rien n'est parti", async () => {
    await figerJour(jour(3));
    issue = () => { throw new ArretSupervision(); };
    await expect(passe()).rejects.toBeInstanceOf(ArretSupervision);
    expect(await relances()).toEqual([]);
    issue = { envoye: true };
    expect(await passe()).toMatchObject({ envoyees: 1 });
  });

  it("limite par organisation (celle des invitations, 30 liens par heure, compteur partagé) : reportée, puis partie", async () => {
    const { invite: seconde } = await invitation();
    const { invite: ailleurs } = await invitation(autreOrg, autreOwner);
    await enService();
    // 29 invitations manuelles dans l'heure : une seule place reste pour l'organisation.
    for (let n = 0; n < 29; n++) await db.query("select public.autoriser_lien_mot_de_passe_cle($1, 30)", [`organisation:${org}`]);
    await figerJour(jour(3));
    const bilan = await passe();
    expect(bilan).toMatchObject({ envoyees: 2, limitees: 1 });
    const partis = envois.map((e) => e.invitationId);
    expect(partis).toContain(ailleurs);
    expect(partis.filter((id) => id === invite || id === seconde)).toHaveLength(1);
    const reportee = partis.includes(invite) ? seconde : invite;
    expect(await relances(reportee)).toEqual([]);
    // Une heure plus tard (compteur vidé), la relance reportée part.
    await admin();
    await db.query("delete from public.demandes_lien_mot_de_passe");
    expect(await passe()).toMatchObject({ envoyees: 1, limitees: 0 });
    expect(envois.map((e) => e.invitationId)).toContain(reportee);
  });

  it("le mandant n'est jamais relancé (RM-16.4.3), ni le propriétaire d'un lot ; un locataire voisin l'est", async () => {
    const { person: proprietaire, invite: invProprio } = await invitation();
    const { invite: invLocataire } = await invitation();
    await admin();
    // Un mandat, même résilié, suffit : la fiche est celle d'un mandant.
    await db.query("insert into public.mandats(organization_id, person_id, etat) values ($1, $2, 'resilie')", [org, person]);
    const { rows: [bien] } = await db.query(
      "insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST relance','appartement','1 rue de Test','75001','Paris') returning id",
      [org]
    );
    const { rows: [lot] } = await db.query("insert into public.lots(organization_id,bien_id,nom) values($1,$2,'TEST lot') returning id", [org, bien.id]);
    await db.query("insert into public.detentions(organization_id, lot_id, person_id, quote_part) values ($1, $2, $3, 100)", [org, lot.id, proprietaire]);
    await figerJour(jour(3));
    await passe();
    const partis = envois.map((e) => e.invitationId);
    expect(partis).not.toContain(invite);
    expect(partis).not.toContain(invProprio);
    expect(partis).toEqual([invLocataire]);
  });

  it("une invitation antérieure à la décision (relances_prevues faux) n'est jamais relancée", async () => {
    await admin();
    await db.query("update public.invitations_locataires set relances_prevues = false where id = $1", [invite]);
    await figerJour(jour(3));
    expect(await passe()).toMatchObject({ envoyees: 0 });
  });

  it("une invitation jamais partie (envoi non confirmé) n'est pas relancée", async () => {
    const { invite: jamais } = await invitation(org, owner, null);
    await figerJour(jour(30));
    await passe();
    expect(envois.map((e) => e.invitationId)).not.toContain(jamais);
  });

  it("organisation fermée à l'écriture (abonnement suspendu) : aucune relance", async () => {
    await admin();
    await db.query("select tache_systeme()");
    await db.query("update public.organizations set status = 'suspendue' where id = $1", [org]);
    await db.query("select set_config('gerimmo.systeme', '', true)");
    await figerJour(jour(3));
    expect(await passe()).toMatchObject({ envoyees: 0 });
  });

  it("échec certain : réservation retirée et tracée, reprise au passage suivant", async () => {
    await figerJour(jour(3));
    issue = { envoye: false, erreur: "Refus du service", incertain: false };
    expect(await passe()).toMatchObject({ envoyees: 0, echecs: 1 });
    expect(await relances()).toEqual([]);
    expect(await journal("invitation_locataire_relance_echec")).toHaveLength(1);
    await figerJour(jour(4));
    issue = { envoye: true };
    expect(await passe()).toMatchObject({ envoyees: 1 });
  });

  it("envoi incertain (délai dépassé) : jamais renvoyé, la seconde relance garde son jour", async () => {
    await figerJour(jour(3));
    issue = { envoye: false, erreur: "Délai", incertain: true };
    expect(await passe()).toMatchObject({ incertaines: 1 });
    expect(await relances()).toEqual([{ rang: 1, etat: "incertaine", jour: jour(3), envoyee: false }]);
    issue = { envoye: true };
    for (const n of [4, 5, 9]) {
      await figerJour(jour(n));
      expect(await passe()).toMatchObject({ envoyees: 0 });
    }
    await figerJour(jour(10));
    expect(await passe()).toMatchObject({ envoyees: 1 });
    expect(await journal("invitation_locataire_relance_incertaine")).toHaveLength(1);
  });

  it("hors de la journée à Paris : la passe ne lit rien", async () => {
    await figerJour(jour(3));
    expect(await passe(new Date("2026-11-05T05:30:00Z"))).toMatchObject({ hors_horaire: true, envoyees: 0 }); // 6 h 30 à Paris
    expect(await passe(new Date("2026-11-05T20:00:00Z"))).toMatchObject({ hors_horaire: true }); // 21 h à Paris
    expect(appels).toEqual([]);
  });

  it("réservation : une seule fois, jamais pour un autre rang que celui dû ; notation rejouable", async () => {
    await figerJour(jour(3));
    await enService();
    const reserver = async (rang: number) => (await db.query("select public.reserver_relance_invitation_locataire($1, $2::smallint) r", [invite, rang])).rows[0].r;
    expect(await reserver(2)).toBe(false);
    expect(await reserver(1)).toBe(true);
    expect(await reserver(1)).toBe(false);
    await db.query("select public.noter_relance_invitation_locataire($1, 1::smallint, 'envoyee')", [invite]);
    await db.query("select public.noter_relance_invitation_locataire($1, 1::smallint, 'envoyee')", [invite]);
    await db.query("select public.noter_relance_invitation_locataire($1, 1::smallint, 'echec')", [invite]);
    expect(await relances()).toEqual([{ rang: 1, etat: "envoyee", jour: jour(3), envoyee: true }]);
    expect(await journal("invitation_locataire_relancee")).toHaveLength(1);
  });

  it("droits : fonctions réservées au traitement ; relances lisibles par le gérant de la fiche, pas par une autre organisation", async () => {
    await figerJour(jour(3));
    await passe();
    for (const sql of [
      "select * from public.invitations_locataires_relances_dues(10)",
      "select public.reserver_relance_invitation_locataire('" + invite + "', 2::smallint)",
      "select public.noter_relance_invitation_locataire('" + invite + "', 1::smallint, 'echec')",
      "select public.relance_invitation_locataire_due('" + invite + "')",
    ]) {
      await en(owner);
      expect(await echec(sql), sql).toMatch(/permission denied|Accès réservé/);
    }
    await en(owner);
    expect((await db.query("select rang from public.relances_invitations_locataires")).rows).toEqual([{ rang: 1 }]);
    expect(await echec("insert into public.relances_invitations_locataires(invitation_id, rang, jour) values ($1, 2, current_date)", [invite])).toMatch(/permission denied/);
    await en(autreOwner);
    expect((await db.query("select rang from public.relances_invitations_locataires")).rows).toEqual([]);
    await db.query("reset role");
    await db.query("set local role anon");
    expect(await echec("select * from public.relances_invitations_locataires")).toMatch(/permission denied/);
    await admin();
  });

  it("le premier envoi est posé une fois et n'est jamais déplacé", async () => {
    await admin();
    const lire = async () => (await db.query("select premier_envoi_le, envoye_le from public.invitations_locataires where id = $1", [invite])).rows[0];
    expect(new Date((await lire()).premier_envoi_le).toISOString()).toBe(new Date(J0).toISOString());
    await en(owner);
    await db.query("select public.noter_envoi_invitation_locataire($1, true)", [invite]);
    await admin();
    const apres = await lire();
    expect(new Date(apres.premier_envoi_le).toISOString()).toBe(new Date(J0).toISOString());
    // Le renvoi a bien déplacé le dernier envoi (à l'instant de la transaction), pas le premier.
    const { rows: [{ maintenant }] } = await db.query("select now() as maintenant");
    expect(new Date(apres.envoye_le).toISOString()).toBe(new Date(maintenant).toISOString());
  });

  it("la migration se rejoue sans effet, son retour arrière la défait et se rejoue aussi", async () => {
    await admin();
    const empreinte = async () => (await db.query(`
      select string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''), ',' order by p.proname) as f,
             (select count(*) from pg_trigger where tgname = 'premier_envoi_invitation_locataire') as t,
             (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'invitations_locataires' and column_name = 'relances_prevues') as d
        from pg_proc p where p.pronamespace = 'public'::regnamespace
         and p.proname in ('relance_invitation_locataire_due','invitations_locataires_relances_dues','reserver_relance_invitation_locataire','noter_relance_invitation_locataire','poser_premier_envoi_invitation_locataire')`)).rows[0];
    const avant = await empreinte();
    const { rows: [{ prevues }] } = await db.query("select relances_prevues as prevues from public.invitations_locataires where id = $1", [invite]);
    await db.query(readFileSync(MIGRATION, "utf8"));
    expect(await empreinte()).toEqual(avant);
    expect((await db.query("select relances_prevues as prevues from public.invitations_locataires where id = $1", [invite])).rows[0].prevues).toBe(prevues);

    // Le retour arrière gère sa propre transaction : on en joue le corps, entre « begin; » et « commit; ».
    const retour = readFileSync(RETOUR, "utf8");
    const corps = retour.slice(retour.indexOf("\nbegin;") + "\nbegin;".length, retour.lastIndexOf("\ncommit;"));
    await db.query(corps);
    const { rows: [apres] } = await db.query(`
      select to_regclass('public.relances_invitations_locataires') as t,
             to_regprocedure('public.reserver_relance_invitation_locataire(uuid,smallint)') as f,
             (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'invitations_locataires' and column_name in ('premier_envoi_le','relances_prevues')) as c,
             (select count(*) from pg_trigger where tgname = 'premier_envoi_invitation_locataire') as d`);
    expect(apres).toEqual({ t: null, f: null, c: "0", d: "0" });
    await db.query(corps); // rejeu : rien à faire
    await db.query(readFileSync(MIGRATION, "utf8")); // marche avant
    expect((await empreinte()).f).toEqual(avant.f);
  });
});
