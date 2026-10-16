/**
 * D48 (fiche IA-11, « chaque nouveau registre naît avec sa règle »), constat du tour final de vérification du 16/10/2026 :
 * les quatre registres créés le 15/10 sont déclarés au catalogue `retention_rules` et purgés par `appliquer_retention`
 * (migration 20261014850000, sur le modèle de 20261014231000).
 *
 *   relais_alertes_envois    passages de l'alerte e-mail du relais (D46-B)   âge : jour du passage (jour de Paris)
 *   relais_urgences          file des urgences du relais                     âge : traitement de l'urgence
 *   relais_urgences_envois   e-mails immédiats des urgences                  âge : début de l'envoi
 *   ia_appels_jour           compteur des appels payants à l'IA (X19)        âge : jour des appels (jour de Paris)
 *
 * Six mois partout : pour les trois registres du relais, la durée déjà codée dans leurs propres fonctions (elles ne changent
 * pas) ; pour le compteur des appels à l'IA, celle des autres registres d'exécution (D48, D13).
 *
 * Ce fichier rejoue la migration, son retour arrière et celui de 20261014231000 (qui réécrivent `appliquer_retention`, comme
 * faits-direction-sans-noms.test.ts) : il tourne dans le groupe « serie » de vitest.config.ts. Chaque essai est joué dans une
 * transaction annulée à la fin, sur une base locale jetable déjà migrée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const VERSION = "20261014850000";
const FICHIER = `${VERSION}_retention_registres_relais_ia`;
const migration = () => readFileSync(`supabase/migrations/${FICHIER}.sql`, "utf8");
const retour = () => readFileSync(`supabase/retours-arriere/${FICHIER}.retour.sql`, "utf8");
const RETOUR_231000 = "supabase/retours-arriere/20261014231000_retention_registres_execution.retour.sql";

const REGISTRES = ["relais_alertes_envois", "relais_urgences", "relais_urgences_envois", "ia_appels_jour"] as const;
type Registre = (typeof REGISTRES)[number];
/** La colonne qui identifie une ligne de chaque registre. */
const CLE: Record<Registre, string> = {
  relais_alertes_envois: "jour",
  relais_urgences: "alerte_id",
  relais_urgences_envois: "id",
  ia_appels_jour: "jour",
};
/** Le bloc que la migration pose dans `appliquer_retention`, juste avant la purge des signalements du support. */
const BLOC = `-- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).
  v_journaux := v_journaux || public.purger_registres_relais_ia();

  `;
const ANCRE = "v_journaux := v_journaux || jsonb_build_object('signalements_support',public.purger_signalements_support());";
const BLOC_231000 = /\n\n  -- D48 \/ D13[^\n]*\n  v_journaux := v_journaux \|\| public\.purger_registres_execution\(\);/;

/** Le script de retour gère sa propre transaction et refuse de se jouer dans un lot : on lui retire cette enveloppe seule. */
const sansEnveloppe = (script: string) =>
  script
    .replace(/do \$retour_arriere\$\s*begin\s*if statement_timestamp\(\) <> transaction_timestamp\(\)[\s\S]*?end \$retour_arriere\$;/, "")
    .replace(/^begin;$/m, "")
    .replace(/^commit;$/m, "");

describe.skipIf(!url)("D48 — les registres du 15/10 ont leur règle de six mois, appliquée par appliquer_retention", () => {
  let db: Client, sa: string, autre: string;

  const admin = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const as = async (id: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  };
  const echoue = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refuse");
    try {
      await db.query(sql, args);
      return "";
    } catch (e) {
      return (e as Error).message;
    } finally {
      await db.query("rollback to savepoint refuse");
      await db.query("release savepoint refuse");
    }
  };
  const nombre = async (sql: string, args: unknown[] = []) => Number((await db.query(sql, args)).rows[0].n);
  const compte = async () =>
    (
      await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
        values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-d48-relais-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)
    ).rows[0].id as string;
  const definition = async () => (await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) f")).rows[0].f as string;
  const appliquer = async () => {
    await as(sa);
    const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b;
    await admin();
    return bilan as { journaux: Record<string, number> };
  };
  const existe = async (registre: Registre, cle: string) =>
    (await nombre(`select count(*) n from public.${registre} where ${CLE[registre]} = $1`, [cle])) === 1;

  /** Une urgence de la file du relais (alerte interne réelle, posée sur un plan de vacances), dans l'état voulu. */
  async function urgence(plan: string, age: string, statut: string, envoi: string | null): Promise<string> {
    const { rows: [{ id }] } = await db.query(
      `insert into public.supervision_alertes_internes(plan_id, cle, titre, destinataire, echeance, cree_le)
       values ($1, 'test-d48-'||gen_random_uuid(), 'Urgence de test D48', $2, now(), now() - $3::interval) returning id`,
      [plan, sa, age]
    );
    // Le déclencheur du relais la met en file ; on la pose nous-mêmes si un autre essai l'a retiré.
    await db.query("insert into public.relais_urgences(alerte_id, nature, posee_le) values ($1, 'signalement_manuel', now() - $2::interval) on conflict (alerte_id) do nothing", [id, age]);
    await db.query(
      "update public.relais_urgences set statut = $2, envoi_id = $3, traitee_le = case when $2 in ('a_envoyer','en_envoi') then null else now() - $4::interval end where alerte_id = $1",
      [id, statut, envoi, age]
    );
    return id;
  }
  async function envoi(age: string, statut = "envoye"): Promise<string> {
    return (
      await db.query(
        "insert into public.relais_urgences_envois(statut, urgences, commence_le, essaye_le, termine_le) values ($1, 1, now() - $2::interval, now() - $2::interval, now() - $2::interval) returning id",
        [statut, age]
      )
    ).rows[0].id;
  }
  async function plan(): Promise<string> {
    return (
      await db.query(
        "insert into public.supervision_vacances(titre, debut, fin, responsable, delai_minutes, cree_par) values ('Vacances D48', now() - interval '1 day', now() + interval '1 day', $1, 60, $1) returning id",
        [sa]
      )
    ).rows[0].id;
  }

  /** Une ligne de plus de six mois (6 mois et 10 jours) et une de moins (5 mois et 20 jours) dans chaque registre. */
  async function poserRegistres() {
    const p = await plan();
    const lignes = {} as Record<"ancien" | "recent", Record<Registre, string>>;
    for (const [quand, age] of [["ancien", "6 months 10 days"], ["recent", "5 months 20 days"]] as const) {
      const e = await envoi(age);
      const jour = (await db.query("select (public.aujourdhui_paris() - $1::interval)::date::text j", [age])).rows[0].j as string;
      await db.query("insert into public.relais_alertes_envois(jour, statut, termine_le) values ($1, 'envoye', now() - $2::interval)", [jour, age]);
      await db.query("insert into public.ia_appels_jour(jour, appels, refus) values ($1, 3, 1)", [jour]);
      lignes[quand] = {
        relais_alertes_envois: jour,
        relais_urgences: await urgence(p, age, "envoyee", e),
        relais_urgences_envois: e,
        ia_appels_jour: jour,
      };
    }
    return lignes;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    sa = await compte();
    autre = await compte();
    const org = (await db.query("insert into public.organizations(name,status) values('TEST D48 relais','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin'),($2,$3,'proprietaire_direct')", [sa, autre, org]);
  });
  beforeEach(async () => {
    await admin();
    await db.query("savepoint scenario");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint scenario");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  describe("le catalogue", () => {
    it("quatre règles actives de six mois, par suppression, une par registre, avec libellé, finalité et déclencheur", async () => {
      const { rows } = await db.query(
        "select data_type, duree_mois, sort::text sort, actif, declencheur, libelle, finalite from public.retention_rules where data_type = any($1::text[]) order by data_type",
        [REGISTRES.map((r) => `journal:${r}`)]
      );
      expect(rows.map((r) => r.data_type)).toEqual(REGISTRES.map((r) => `journal:${r}`).sort());
      for (const r of rows) {
        expect(r).toMatchObject({ duree_mois: 6, sort: "suppression", actif: true });
        expect(r.libelle.length).toBeGreaterThan(5);
        expect(r.finalite.length).toBeGreaterThan(10);
        expect(r.declencheur.length).toBeGreaterThan(3);
      }
    });

    it("la durée du catalogue est celle que les fonctions du relais codent déjà (six mois) ; ces fonctions ne sont pas modifiées", async () => {
      const def = async (s: string) => (await db.query("select pg_get_functiondef($1::regprocedure) f", [s])).rows[0].f as string;
      expect((await def("public.reserver_alerte_relais()")).match(/interval '6 months'/g)).toHaveLength(1);
      expect((await def("public.prendre_urgences_relais(integer)")).match(/interval '6 months'/g)).toHaveLength(2);
      for (const s of ["public.reserver_alerte_relais()", "public.prendre_urgences_relais(integer)", "public.reserver_appel_ia(text)"])
        expect(await def(s), s).not.toContain("retention_rules");
      const { rows } = await db.query("select distinct duree_mois from public.retention_rules where data_type like 'journal:relais%'");
      expect(rows).toEqual([{ duree_mois: 6 }]);
    });
  });

  describe("la purge", () => {
    it("appliquer_retention supprime ce qui a plus de six mois dans chaque registre et garde le reste, compte à l'appui", async () => {
      const { ancien, recent } = await poserRegistres();
      const bilan = await appliquer();
      for (const r of REGISTRES) {
        expect(await existe(r, ancien[r]), `${r} : ligne de plus de six mois`).toBe(false);
        expect(await existe(r, recent[r]), `${r} : ligne de moins de six mois`).toBe(true);
        expect(bilan.journaux[r], `bilan ${r}`).toBeGreaterThanOrEqual(1);
      }
    });

    it("une urgence encore à envoyer ou en cours d'envoi, un envoi en cours ou à reprendre, un envoi encore cité ne partent jamais, même anciens", async () => {
      const p = await plan();
      const vieux = "1 year";
      const enAttente = await urgence(p, vieux, "a_envoyer", null);
      const envoiEnCours = await envoi(vieux, "en_cours");
      const enEnvoi = await urgence(p, vieux, "en_envoi", envoiEnCours);
      const aReprendre = await envoi(vieux, "a_reprendre");
      // Un envoi ancien terminé, mais cité par une urgence récente : il reste tant qu'elle reste.
      const envoiCite = await envoi(vieux);
      const recente = await urgence(p, "1 day", "envoyee", envoiCite);
      await appliquer();
      for (const id of [enAttente, enEnvoi, recente]) expect(await existe("relais_urgences", id), id).toBe(true);
      for (const id of [envoiEnCours, aReprendre, envoiCite]) expect(await existe("relais_urgences_envois", id), id).toBe(true);
    });

    it.each(REGISTRES)("règle « %s » désactivée : ses lignes anciennes restent, celles des autres registres partent", async (registre) => {
      const { ancien, recent } = await poserRegistres();
      await db.query("update public.retention_rules set actif = false where data_type = $1", [`journal:${registre}`]);
      const bilan = await appliquer();
      // Une urgence gardée garde aussi son envoi (un envoi cité ne part pas).
      const gardes: Registre[] = registre === "relais_urgences" ? ["relais_urgences", "relais_urgences_envois"] : [registre];
      for (const r of REGISTRES) {
        expect(await existe(r, ancien[r]), `${r} (règle ${registre} désactivée)`).toBe(gardes.includes(r));
        expect(await existe(r, recent[r]), `${r} récent`).toBe(true);
      }
      expect(bilan.journaux[registre], `bilan ${registre}`).toBeUndefined();
    });

    it("une purge qui supprime laisse UNE ligne au journal technique, avec des nombres seulement ; une purge à vide n'en laisse aucune", async () => {
      await poserRegistres();
      await db.query("delete from public.tech_log where evenement = 'purge_registres_relais_ia'");
      await as(sa);
      const bilan = (await db.query("select public.purger_registres_relais_ia() b")).rows[0].b;
      await admin();
      const lignes = (await db.query("select details from public.tech_log where evenement = 'purge_registres_relais_ia'")).rows;
      expect(lignes).toHaveLength(1);
      expect(lignes[0].details).toEqual(bilan);
      for (const r of REGISTRES) expect(lignes[0].details[r], r).toBeGreaterThanOrEqual(1);
      expect(Object.values(lignes[0].details).every((v) => typeof v === "number")).toBe(true);
      await as(sa);
      const vide = (await db.query("select public.purger_registres_relais_ia() b")).rows[0].b;
      await admin();
      for (const r of REGISTRES) expect(vide[r], r).toBe(0);
      expect(await nombre("select count(*) n from public.tech_log where evenement = 'purge_registres_relais_ia'")).toBe(1);
    });

    it("réservée à la supervision (ou au traitement planifié), fermée à anon", async () => {
      await as(autre);
      expect(await echoue("select public.purger_registres_relais_ia()")).toMatch(/réservée à la supervision/);
      await admin();
      expect((await db.query("select has_function_privilege('anon','public.purger_registres_relais_ia()','EXECUTE') ok")).rows[0].ok).toBe(false);
      // Le traitement planifié (pg_cron, sans compte) la joue.
      expect(await echoue("select public.purger_registres_relais_ia()")).toBe("");
    });

    it("un registre absent (retour arrière de son lot joué seul) est sauté, sans faire échouer le nettoyage de la nuit", async () => {
      await db.query("drop table public.ia_appels_jour");
      const bilan = await appliquer();
      expect(bilan.journaux).not.toHaveProperty("ia_appels_jour");
      expect(bilan.journaux).toHaveProperty("relais_urgences");
    });

    it("appliquer_retention appelle cette purge une seule fois et garde ses autres appels", async () => {
      const f = await definition();
      expect(f.match(/purger_registres_relais_ia/g)).toHaveLength(1);
      expect(f.match(/purger_registres_execution/g)).toHaveLength(1);
      expect(f).toContain("purger_signalements_support");
      expect(f).toContain("journal:tech_log");
      expect(f).toContain("tache_planifiee_autorisee('retention-quotidienne')");
      // Posé juste AVANT la purge des signalements : le bloc de 20261014231000 reste le dernier, comme son retour l'attend.
      expect(f).toContain(BLOC + ANCRE);
      expect(f).toMatch(/purger_registres_execution\(\);\n  return jsonb_build_object\('journaux'/);
    });
  });

  describe("bascule de minuit : les registres datés au jour (passages du relais, compteur de l'IA) vieillissent au jour de Paris", () => {
    // La session est en UTC, comme chez Supabase. `aujourdhui_paris()` reçoit son propre corps où l'horloge est un instant fixe :
    // la conversion à Paris est celle de la base. Une purge qui lirait `current_date` prendrait le jour réel de la machine.
    async function figer(instant: string) {
      const corps = (await db.query("select prosrc c from pg_proc where oid = 'public.aujourdhui_paris()'::regprocedure")).rows[0].c as string;
      expect(corps).toMatch(/\bnow\(\)/i);
      await db.query(
        `create or replace function public.aujourdhui_paris() returns date language sql stable set search_path to '' as $f$ ${corps.replace(/\bnow\(\)/gi, `timestamptz '${instant}'`)} $f$`
      );
      await db.query("select set_config('TimeZone', 'UTC', true)");
    }
    async function poserJours() {
      for (const jour of ["2026-06-29", "2026-06-30", "2026-07-01"]) {
        await db.query("insert into public.relais_alertes_envois(jour, statut) values ($1, 'envoye')", [jour]);
        await db.query("insert into public.ia_appels_jour(jour, appels) values ($1, 2)", [jour]);
      }
    }
    const restants = async (registre: "relais_alertes_envois" | "ia_appels_jour") =>
      (await db.query(`select jour::text j from public.${registre} where jour between '2026-06-29' and '2026-07-01' order by 1`)).rows.map((r) => r.j);

    it("23 h 30 UTC le 31 décembre = 0 h 30 le 1er janvier à Paris : la limite est le 1er juillet (le 30 juin part)", async () => {
      await figer("2026-12-31 23:30:00+00");
      expect((await db.query("select current_date::text d, public.aujourdhui_paris()::text p")).rows[0]).toEqual({ d: expect.any(String), p: "2027-01-01" });
      await poserJours();
      await appliquer();
      expect(await restants("relais_alertes_envois")).toEqual(["2026-07-01"]);
      expect(await restants("ia_appels_jour")).toEqual(["2026-07-01"]);
    });

    it("une heure plus tôt (23 h 30 à Paris, encore le 31 décembre) : la limite est le 30 juin (le 30 juin reste)", async () => {
      await figer("2026-12-31 22:30:00+00");
      await poserJours();
      await appliquer();
      expect(await restants("relais_alertes_envois")).toEqual(["2026-06-30", "2026-07-01"]);
      expect(await restants("ia_appels_jour")).toEqual(["2026-06-30", "2026-07-01"]);
    });
  });

  describe("migration : rejeu, définition inattendue", () => {
    const empreinte = async () =>
      (
        await db.query(
          `select md5(pg_get_functiondef('public.appliquer_retention()'::regprocedure)) || ' ' ||
                  coalesce(md5(pg_get_functiondef(to_regprocedure('public.purger_registres_relais_ia()'))), 'absente') || ' ' ||
                  coalesce((select proacl::text from pg_proc where oid = to_regprocedure('public.purger_registres_relais_ia()')), '-') || ' ' ||
                  (select string_agg(data_type || ':' || duree_mois || ':' || actif || ':' || libelle, '|' order by data_type) from public.retention_rules) as e`
        )
      ).rows[0].e as string;

    it("rejouée deux fois sur une base déjà migrée, elle ne change rien ; une règle modifiée à la main n'est pas écrasée", async () => {
      await db.query("update public.retention_rules set duree_mois = 12, actif = false where data_type = 'journal:ia_appels_jour'");
      const avant = await empreinte();
      await db.query(migration());
      await db.query(migration());
      expect(await empreinte()).toBe(avant);
      expect((await db.query("select duree_mois, actif from public.retention_rules where data_type = 'journal:ia_appels_jour'")).rows[0]).toEqual({ duree_mois: 12, actif: false });
    });

    it("l'ancre absente : la migration s'arrête et ne réécrit rien", async () => {
      await db.query(sansEnveloppe(retour()));
      const def = await definition();
      await db.query(def.replace(ANCRE, "v_journaux := v_journaux || jsonb_build_object('signalements_support', public.purger_signalements_support());"));
      const sansAncre = await definition();
      const message = await echoue(migration());
      expect(message).toMatch(/figure 0 fois dans appliquer_retention au lieu d'une/);
      expect(message).toMatch(/rien n'est modifié/);
      expect(await definition()).toBe(sansAncre);
    });

    it("l'ancre répétée : la migration s'arrête et ne réécrit rien", async () => {
      await db.query(sansEnveloppe(retour()));
      const def = await definition();
      await db.query(def.replace(ANCRE, `${ANCRE}\n  ${ANCRE}`));
      const doublee = await definition();
      expect(await echoue(migration())).toMatch(/figure 2 fois dans appliquer_retention au lieu d'une/);
      expect(await definition()).toBe(doublee);
    });

    it("sur une autre mise en forme de la fonction (indentation différente), l'ancre d'une ligne suffit", async () => {
      await db.query(sansEnveloppe(retour()));
      const def = await definition();
      await db.query(def.replace(`  ${ANCRE}`, `      ${ANCRE}`));
      await db.query(migration());
      const apres = await definition();
      expect(apres.match(/purger_registres_relais_ia/g)).toHaveLength(1);
      expect(apres).toContain(`      ${BLOC}${ANCRE}`);
      await as(sa);
      await db.query("select public.appliquer_retention()");
      await admin();
    });
  });

  describe("retour arrière", () => {
    it("il refuse de se jouer dans un lot déjà ouvert (il valide sa propre transaction)", async () => {
      expect(await echoue(retour())).toMatch(/Retour arrière refusé/);
      expect(await nombre("select count(*) n from pg_proc where proname = 'purger_registres_relais_ia'")).toBe(1);
    });

    it("il retire exactement le bloc posé, la fonction de purge et les quatre règles ; le reste d'appliquer_retention est intact", async () => {
      const avant = await definition();
      await db.query(sansEnveloppe(retour()));
      const apres = await definition();
      expect(apres).toBe(avant.replace(BLOC, ""));
      expect(apres).not.toContain("purger_registres_relais_ia");
      expect(apres).toContain("purger_registres_execution");
      expect(await nombre("select count(*) n from pg_proc where proname = 'purger_registres_relais_ia'")).toBe(0);
      expect(await nombre("select count(*) n from public.retention_rules where data_type = any($1::text[])", [REGISTRES.map((r) => `journal:${r}`)])).toBe(0);
      // Les cinq règles de 20261014231000 restent.
      expect(await nombre("select count(*) n from public.retention_rules where data_type in ('journal:agent_passages','journal:brief_direction_snapshots')")).toBe(2);
      const bilan = await appliquer();
      expect(bilan.journaux).not.toHaveProperty("ia_appels_jour");
      expect(bilan.journaux).toHaveProperty("agent_passages");
    });

    it("rejoué, il ne fait rien ; aller, retour, aller : l'état migré est retrouvé à l'identique", async () => {
      const migre = await definition();
      const fonction = (await db.query("select md5(pg_get_functiondef('public.purger_registres_relais_ia()'::regprocedure)) m")).rows[0].m;
      await db.query(sansEnveloppe(retour()));
      const defait = await definition();
      await db.query(sansEnveloppe(retour()));
      expect(await definition()).toBe(defait);
      await db.query(migration());
      expect(await definition()).toBe(migre);
      expect((await db.query("select md5(pg_get_functiondef('public.purger_registres_relais_ia()'::regprocedure)) m")).rows[0].m).toBe(fonction);
      expect(await nombre("select count(*) n from public.retention_rules where data_type = any($1::text[])", [REGISTRES.map((r) => `journal:${r}`)])).toBe(4);
    });

    it("fonction réécrite depuis (la marque est là, le bloc n'y est plus exactement une fois) : il s'arrête, rien n'est supprimé", async () => {
      const def = await definition();
      await db.query(def.replace("compteur des appels à l'IA, six mois", "compteur des appels à l'IA (retouché), six mois"));
      const message = await echoue(sansEnveloppe(retour()));
      expect(message).toMatch(/figure 0 fois \(attendu : une\)/);
      expect(message).toMatch(/rien n'a été modifié/);
      expect(await nombre("select count(*) n from pg_proc where proname = 'purger_registres_relais_ia'")).toBe(1);
      expect(await nombre("select count(*) n from public.retention_rules where data_type = 'journal:ia_appels_jour'")).toBe(1);
    });

    it("il retire la ligne d'historique de sa migration (migrations.yml pourra la rejouer)", async () => {
      await db.query("create schema if not exists supabase_migrations");
      await db.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[])");
      await db.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2), ('20261014231000', 'x') on conflict do nothing", [VERSION, FICHIER]);
      await db.query(sansEnveloppe(retour()));
      const { rows } = await db.query("select version from supabase_migrations.schema_migrations where version in ($1, '20261014231000') order by 1", [VERSION]);
      expect(rows.map((r) => r.version)).toEqual(["20261014231000"]);
    });

    it("composable avec 20261014231000 : son retour ne retire que son bloc, celui-ci reste et marche ; dans l'autre ordre, de même", async () => {
      const origine = (await definition()).replace(BLOC, "").replace(BLOC_231000, "");
      // 231000 d'abord défaite : le bloc de 850000 reste, appliquer_retention purge encore les registres du relais.
      await db.query(sansEnveloppe(readFileSync(RETOUR_231000, "utf8")));
      expect(await definition()).toContain(BLOC + ANCRE);
      expect(await definition()).not.toContain("purger_registres_execution");
      const bilan = await appliquer();
      expect(bilan.journaux).toHaveProperty("relais_urgences");
      await db.query(sansEnveloppe(retour()));
      expect(await definition()).toBe(origine);
    });
  });

  describe("manifeste et procédure", () => {
    it("la migration est au manifeste une seule fois, dans la plage du lot, après 20261014231000 et les registres qu'elle déclare", () => {
      const lignes = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
      const nom = `${FICHIER}.sql`;
      expect(lignes.filter((l) => l === nom)).toHaveLength(1);
      for (const avant of [
        "20261014231000_retention_registres_execution.sql",
        "20261014730000_plafond_appels_ia.sql",
        "20261014810000_relais_alerte_quotidienne.sql",
        "20261014811000_relais_urgences_immediates.sql",
        "20261014812000_relais_urgences_passage_frequent.sql",
      ])
        expect(lignes.indexOf(nom), avant).toBeGreaterThan(lignes.indexOf(avant));
      expect(Number(VERSION)).toBeGreaterThanOrEqual(20261014850000);
      expect(Number(VERSION)).toBeLessThanOrEqual(20261014859999);
    });

    it("elle ferme les fonctions à anon ; son retour gère sa transaction, est déclaré au LISEZ-MOI et figure dans l'ordre complet des retours", () => {
      expect(migration().trimEnd().endsWith("select public.fermer_fonctions_a_anon();")).toBe(true);
      expect(retour()).toMatch(/^-- RETOUR ARRIÈRE de /);
      expect(retour()).toMatch(/\bcommit;\s*$/m);
      const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
      expect(lisezMoi).toContain(`${FICHIER}.retour.sql`);
      const chaine = lisezMoi.match(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/)?.[1] ?? "";
      expect(chaine).toContain("`850000`");
    });
  });
});
