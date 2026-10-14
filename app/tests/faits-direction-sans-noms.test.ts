/**
 * D13 (fiche SUP-05) et D48 (fiche IA-11), décisions du dirigeant du 14/10/2026.
 *
 * D13 : les « faits de direction » ne copient plus de noms de locataires. Une alerte y figure par son identifiant, un libellé
 * générique (le type d'alerte) et un lien, jamais par son titre, qui contient parfois un nom. Préparer ou lire les faits laisse une
 * trace par organisation citée. Les instantanés déjà enregistrés (format 1) s'effacent dans une étape séparée, irréversible,
 * qui exige une sauvegarde.
 *
 * D48 : une règle de conservation de six mois par registre d'exécution, appliquée par `appliquer_retention`.
 *
 * Tout est joué dans une transaction annulée à la fin, sur une base locale jetable déjà migrée.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const migration = (nom: string) => readFileSync(`supabase/migrations/${nom}`, "utf8");
const MIGRATION_RETENTION = "20261014231000_retention_registres_execution.sql";
const MIGRATION_EFFACEMENT = "20261014232000_effacement_instantanes_faits_direction.sql";

const NOM = "Marie Durand";
const TITRE_ALERTE = `État des lieux d'entrée — Lot 1 · ${NOM}`;

describe.skipIf(!url)("D13 / D48 — faits de direction sans noms, conservation des registres", () => {
  let db: Client, sa: string, autre: string, org: string, alerte: string;

  const admin = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const as = async (id: string, aal = "aal2") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal })]);
    await db.query("set local role authenticated");
  };
  const failed = async (sql: string, args: unknown[] = []) => {
    await db.query("savepoint refuse");
    try { await db.query(sql, args); return ""; }
    catch (e) { await db.query("rollback to savepoint refuse"); return (e as Error).message; }
    finally { await db.query("release savepoint refuse"); }
  };
  const compte = async () => (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','test-d13-'||gen_random_uuid()||'@example.invalid','x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
  const preparer = async () => (await db.query("select public.preparer_faits_direction() d")).rows[0].d;
  const lire = async () => (await db.query("select public.lire_faits_direction(current_date) d")).rows[0].d;
  const traces = async (action: string) => (await db.query("select organization_id, details from public.audit_log where account_id=$1 and action=$2 order by created_at", [sa, action])).rows;
  const nombre = async (sql: string, args: unknown[] = []) => Number((await db.query(sql, args)).rows[0].n);

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    sa = await compte(); autre = await compte();
    org = (await db.query("insert into public.organizations(name,status) values('TEST D13','active') returning id")).rows[0].id;
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,null,'super_admin'),($2,$3,'proprietaire_direct')", [sa, autre, org]);
    alerte = (await db.query("insert into public.alerts(organization_id,type,criticite,titre,echeance) values($1,'edl_entree','normale',$2,current_date+2) returning id", [org, TITRE_ALERTE])).rows[0].id;
  });
  beforeEach(async () => { await admin(); await db.query("savepoint scenario"); });
  afterEach(async () => { await db.query("rollback to savepoint scenario"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("D13 — aucune copie de nom", () => {
    it("une alerte devient un identifiant, un libellé générique et un lien : ni le titre, ni le nom, ni le lot", async () => {
      await as(sa); const s = await preparer();
      const fait = s.sources.echeances.donnees.faits.find((f: { id: string }) => f.id === alerte);
      expect(fait).toBeTruthy();
      expect(fait.titre).toBe("Alerte · État des lieux d’entrée à faire");
      expect(fait.href).toBe(`/agence/${org}/alertes`);
      expect(fait.date).toBe((await db.query("select (current_date + 2)::text as d")).rows[0].d);
      const brut = JSON.stringify(s);
      expect(brut).not.toContain("Marie");
      expect(brut).not.toContain("Durand");
      expect(brut).not.toContain("Lot 1");
      expect(brut).not.toContain(TITRE_ALERTE);
    });

    it("un type d'alerte inconnu, ou libre, ne donne qu'un libellé neutre : la valeur brute n'est jamais recopiée", async () => {
      await admin();
      await db.query("insert into public.alerts(organization_id,type,criticite,titre,echeance) values($1,'type_libre_Jean_Martin','normale','Titre libre Jean Martin',current_date+1)", [org]);
      await as(sa); const s = await preparer();
      const brut = JSON.stringify(s);
      expect(brut).not.toContain("Jean");
      expect(brut).not.toContain("Martin");
      expect(s.sources.echeances.donnees.faits.some((f: { titre: string }) => f.titre === "Alerte · Alerte à traiter")).toBe(true);
    });

    it("les chiffres de la source et les autres sources sont inchangés", async () => {
      await as(sa); const s = await preparer();
      expect(s.indisponibles).toEqual([]);
      expect(s.sources.echeances.donnees.mesures.alertes_prochains_7_jours).toBeGreaterThanOrEqual(1);
      expect(Object.keys(s.sources).sort()).toEqual(["echeances", "incidents", "interventions", "loyers", "service"]);
      expect(s.version_regles).toBe(2);
      expect(s.auteur_reel).toBe(sa);
    });

    it("le dernier état connu ne reprend jamais un instantané ancien (format 1, avec des noms)", async () => {
      await admin();
      await db.query("delete from public.brief_direction_snapshots");
      const ancien = { statut: "disponible", observe_le: new Date().toISOString(), donnees: { mesures: { alertes_en_retard: 0, alertes_prochains_7_jours: 1, alertes_critiques: 0 }, faits: [{ titre: TITRE_ALERTE, date: null, href: "/x" }] } };
      await db.query("insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(current_date,now()-interval '1 hour',$1,jsonb_build_object('echeances',$2::jsonb),1)", [sa, JSON.stringify(ancien)]);
      await db.query("alter table public.alerts rename column echeance to echeance_indisponible_test");
      await as(sa); const s = await preparer();
      expect(s.indisponibles).toContain("echeances");
      expect(s.sources.echeances).toMatchObject({ statut: "indisponible", donnees: null, observe_le: null });
      expect(JSON.stringify(s)).not.toContain("Marie");
    });

    it("le dernier état connu d'un instantané récent (format 2) reste repris, sans nom", async () => {
      await admin(); await db.query("delete from public.brief_direction_snapshots");
      await as(sa); const initial = await preparer(); await admin();
      await db.query("alter table public.alerts rename column echeance to echeance_indisponible_test");
      await as(sa); const apres = await preparer();
      expect(apres.indisponibles).toContain("echeances");
      expect(apres.sources.echeances.statut).toBe("indisponible");
      expect(apres.sources.echeances.donnees).toEqual(initial.sources.echeances.donnees);
      expect(JSON.stringify(apres)).not.toContain("Durand");
    });
  });

  describe("D13 — consultation tracée", () => {
    it("préparer laisse une ligne par préparation et une par organisation citée, dans la même transaction", async () => {
      await as(sa); const s = await preparer(); await admin();
      const preparation = await traces("preparation_faits_direction");
      expect(preparation).toHaveLength(1);
      expect(preparation[0].organization_id).toBeNull();
      expect(preparation[0].details).toMatchObject({ snapshot: s.id });
      const consultations = (await traces("consultation_faits_direction")).filter((t) => t.organization_id === org);
      expect(consultations).toHaveLength(1);
      expect(consultations[0].details).toMatchObject({ snapshot: s.id, origine: "preparation" });
      expect(JSON.stringify(preparation) + JSON.stringify(consultations)).not.toContain("Durand");
    });

    it("lire l'écran trace chaque organisation citée, une seule fois par minute pour une même lecture", async () => {
      await as(sa); const s = await preparer(); await admin();
      await db.query("delete from public.audit_log where account_id=$1", [sa]);
      await as(sa); const lu = await lire(); expect(lu.id).toBe(s.id);
      await lire(); await admin();
      const lignes = (await traces("consultation_faits_direction")).filter((t) => t.organization_id === org);
      expect(lignes).toHaveLength(1);
      expect(lignes[0].details).toMatchObject({ snapshot: s.id, jour: lu.jour });
    });

    it("lire un jour sans instantané ne trace rien et ne renvoie rien", async () => {
      await admin(); await db.query("delete from public.brief_direction_snapshots");
      await as(sa); expect((await db.query("select public.lire_faits_direction(current_date) d")).rows[0].d).toBeNull(); await admin();
      expect(await traces("consultation_faits_direction")).toHaveLength(0);
    });

    it("un compte ordinaire ou sans double vérification ne lit ni ne prépare, et ne laisse aucune trace", async () => {
      await as(sa); await preparer(); await admin();
      await db.query("delete from public.audit_log where account_id in ($1,$2)", [sa, autre]);
      await as(autre); expect(await failed("select public.lire_faits_direction(current_date)")).toMatch(/vérification/);
      await as(sa, "aal1"); expect(await failed("select public.lire_faits_direction(current_date)")).toMatch(/vérification/);
      expect(await failed("select public.preparer_faits_direction()")).toMatch(/vérification/);
      await admin();
      expect(await nombre("select count(*) n from public.audit_log where account_id in ($1,$2) and action like '%faits_direction'", [sa, autre])).toBe(0);
    });

    it("l'accès anonyme aux fonctions reste fermé", async () => {
      const { rows } = await db.query(`select has_function_privilege('anon','public.lire_faits_direction(date)','EXECUTE') l,
        has_function_privilege('anon','public.preparer_faits_direction()','EXECUTE') p, has_function_privilege('anon','public.collecter_source_direction(text)','EXECUTE') c`);
      expect(rows[0]).toEqual({ l: false, p: false, c: false });
    });
  });

  describe("D13 — effacement des instantanés existants (étape séparée, irréversible)", () => {
    const poserAncien = async () => (await db.query("insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(current_date,now()-interval '2 hours',$1,jsonb_build_object('echeances',jsonb_build_object('statut','disponible','donnees',jsonb_build_object('mesures','{}'::jsonb,'faits',jsonb_build_array(jsonb_build_object('titre',$2::text))))),1) returning id", [sa, TITRE_ALERTE])).rows[0].id;

    it("refuse d'effacer sans la confirmation d'une sauvegarde, et ne touche à rien", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      const ancien = await poserAncien();
      const message = await failed(migration(MIGRATION_EFFACEMENT));
      expect(message).toMatch(/sauvegarde/i);
      expect(message).toMatch(/IRRÉVERSIBLE/);
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [ancien])).toBe(1);
    });

    it("avec la confirmation : efface les instantanés du format 1, garde ceux du format 2, laisse une ligne d'audit", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      await db.query("delete from public.audit_log where action='effacement_instantanes_faits_direction'");
      const ancien = await poserAncien(); const ancien2 = await poserAncien();
      await as(sa); const recent = (await preparer()).id; await admin();
      await db.query("select set_config('gerimmo.sauvegarde_confirmee','oui',true)");
      await db.query(migration(MIGRATION_EFFACEMENT));
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=any($1::uuid[])", [[ancien, ancien2]])).toBe(0);
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [recent])).toBe(1);
      const { rows } = await db.query("select details from public.audit_log where action='effacement_instantanes_faits_direction'");
      expect(rows).toHaveLength(1);
      expect(rows[0].details).toMatchObject({ nombre: 2, decision: "D13", fiche: "SUP-05" });
      expect(JSON.stringify(rows)).not.toContain("Durand");
    });

    it("sans instantané ancien, l'étape passe sans confirmation et se rejoue sans effet", async () => {
      await db.query("delete from public.brief_direction_snapshots");
      await as(sa); const recent = (await preparer()).id; await admin();
      await db.query(migration(MIGRATION_EFFACEMENT));
      await db.query(migration(MIGRATION_EFFACEMENT));
      expect(await nombre("select count(*) n from public.brief_direction_snapshots where id=$1", [recent])).toBe(1);
    });
  });

  describe("D48 — une règle de six mois par registre, appliquée par appliquer_retention", () => {
    const REGISTRES = ["agent_passages", "supervision_operations", "points_du_matin", "decisions_du_matin", "brief_direction_snapshots"];
    let ancien: Record<string, string>, recent: Record<string, string>;

    async function poserRegistres() {
      ancien = {}; recent = {};
      const mission = (await db.query("select cle from public.agent_missions limit 1")).rows[0].cle;
      for (const [cible, age] of [[ancien, "7 months"], [recent, "5 months"]] as const) {
        cible.agent_passages = (await db.query("insert into public.agent_passages(mission,debut,etat) values($1,now()-$2::interval,'reussi') returning id", [mission, age])).rows[0].id;
        cible.supervision_operations = (await db.query("insert into public.supervision_operations(action,auteur,cree_le) values('consigne_executee',$1,now()-$2::interval) returning id", [sa, age])).rows[0].id;
        cible.brief_direction_snapshots = (await db.query("insert into public.brief_direction_snapshots(jour,genere_le,auteur_reel,sources,version_regles) values(current_date,now()-$2::interval,$1,'{}',2) returning id", [sa, age])).rows[0].id;
        const point = (await db.query("insert into public.points_du_matin(jour,equipe,genere_le) values(current_date,'test_d48_'||substr(gen_random_uuid()::text,1,8),now()-$1::interval) returning id", [age])).rows[0].id;
        cible.points_du_matin = point;
        cible.decisions_du_matin = (await db.query("insert into public.decisions_du_matin(point_id,cle,titre,pourquoi,source,cree_le) values($1,'test-d48','Décision de test','Pour le test','retour',now()-$2::interval) returning id", [point, age])).rows[0].id;
      }
    }
    const existe = async (table: string, id: string) => (await nombre(`select count(*) n from public.${table} where id=$1`, [id])) === 1;

    it("cinq règles actives de six mois, par suppression, une par registre", async () => {
      const { rows } = await db.query("select data_type, duree_mois, sort::text sort, actif, declencheur, libelle, finalite from public.retention_rules where data_type = any($1::text[]) order by data_type", [REGISTRES.map((r) => `journal:${r}`)]);
      expect(rows.map((r) => r.data_type)).toEqual(REGISTRES.map((r) => `journal:${r}`).sort());
      for (const r of rows) {
        expect(r).toMatchObject({ duree_mois: 6, sort: "suppression", actif: true });
        expect(r.libelle.length).toBeGreaterThan(5);
        expect(r.finalite.length).toBeGreaterThan(10);
        expect(r.declencheur.length).toBeGreaterThan(3);
      }
    });

    it("appliquer_retention supprime ce qui a plus de six mois dans chaque registre et garde le reste, compte à l'appui", async () => {
      await poserRegistres();
      await as(sa);
      const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b;
      await admin();
      for (const r of REGISTRES) {
        expect(await existe(r, ancien[r]), `${r} : ligne de 7 mois`).toBe(false);
        expect(await existe(r, recent[r]), `${r} : ligne de 5 mois`).toBe(true);
        expect(bilan.journaux[r], `bilan ${r}`).toBeGreaterThanOrEqual(1);
      }
    });

    it("une règle désactivée n'efface rien dans son registre, les autres continuent", async () => {
      await poserRegistres();
      await db.query("update public.retention_rules set actif=false where data_type='journal:agent_passages'");
      await as(sa); const bilan = (await db.query("select public.appliquer_retention() b")).rows[0].b; await admin();
      expect(await existe("agent_passages", ancien.agent_passages)).toBe(true);
      expect(bilan.journaux.agent_passages).toBeUndefined();
      expect(await existe("supervision_operations", ancien.supervision_operations)).toBe(false);
    });

    it("un point n'emporte pas une décision encore dans sa durée : il attend que ses décisions partent", async () => {
      await poserRegistres();
      await db.query("update public.decisions_du_matin set cree_le=now()-interval '1 day' where id=$1", [ancien.decisions_du_matin]);
      await as(sa); await db.query("select public.appliquer_retention()"); await admin();
      expect(await existe("decisions_du_matin", ancien.decisions_du_matin)).toBe(true);
      expect(await existe("points_du_matin", ancien.points_du_matin)).toBe(true);
    });

    it("la règle des décisions désactivée garde aussi leur point, même ancien", async () => {
      await poserRegistres();
      await db.query("update public.retention_rules set actif=false where data_type='journal:decisions_du_matin'");
      await as(sa); await db.query("select public.appliquer_retention()"); await admin();
      expect(await existe("decisions_du_matin", ancien.decisions_du_matin)).toBe(true);
      expect(await existe("points_du_matin", ancien.points_du_matin)).toBe(true);
    });

    it("réservée à la supervision (ou au traitement planifié), fermée à anon, rejouable sans effet", async () => {
      await as(autre); expect(await failed("select public.purger_registres_execution()")).toMatch(/réservée/);
      await admin();
      expect((await db.query("select has_function_privilege('anon','public.purger_registres_execution()','EXECUTE') ok")).rows[0].ok).toBe(false);
      const avant = (await db.query("select md5(pg_get_functiondef('public.appliquer_retention()'::regprocedure)) m")).rows[0].m;
      await db.query(migration(MIGRATION_RETENTION));
      expect((await db.query("select md5(pg_get_functiondef('public.appliquer_retention()'::regprocedure)) m")).rows[0].m).toBe(avant);
      expect(await nombre("select count(*) n from public.retention_rules where data_type like 'journal:%' and data_type = any($1::text[])", [REGISTRES.map((r) => `journal:${r}`)])).toBe(5);
    });

    it("appliquer_retention garde ses appels antérieurs et appelle la purge des registres une seule fois", async () => {
      const { rows: [{ f }] } = await db.query("select pg_get_functiondef('public.appliquer_retention()'::regprocedure) f");
      expect(f.match(/purger_registres_execution/g)).toHaveLength(1);
      expect(f).toContain("purger_signalements_support");
      expect(f).toContain("debut_conservation_document");
      expect(f).toContain("journal:tech_log");
    });
  });
});
