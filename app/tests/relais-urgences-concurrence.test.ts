/**
 * D46-B, suite (décision du 15/10/2026, « envoi immédiat pour les urgences ») — la concurrence, en base.
 *
 * Deux passages qui vident la file en même temps (deux missions, une mission et la console, deux instances de la même
 * route) ne doivent JAMAIS prendre les mêmes urgences : sinon le même e-mail partirait deux fois, sous deux clés d'envoi
 * différentes. `prendre_urgences_relais` passe sous un verrou consultatif : le second appel attend la fin du premier,
 * puis trouve les urgences déjà prises.
 *
 * Deux sessions ne se voient qu'après un commit : la fixture (deux comptes, un plan terminé, deux alertes) est VALIDÉE,
 * puis supprimée à la fin. Ce fichier tourne donc en série (vitest.config.ts, FICHIERS_EN_SERIE).
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

let a: Client;
let b: Client;
const fixture = { comptes: [] as string[], plan: "", alertes: [] as string[], envois: [] as string[] };

async function enService(c: Client) {
  await c.query("begin");
  await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await c.query("set local role service_role");
}
type Prise = { pris: boolean; motif?: string; envoi?: string; urgences?: unknown[] };

describe.skipIf(!DB_URL)("D46-B — e-mail immédiat des urgences : deux passages simultanés", () => {
  beforeAll(async () => {
    a = new Client({ connectionString: DB_URL });
    b = new Client({ connectionString: DB_URL });
    await a.connect();
    await b.connect();
    // Fixture validée : deux comptes, un plan TERMINÉ (aucun traitement ne s'en sert), deux alertes posées directement.
    for (let i = 0; i < 2; i++) {
      const { rows: [u] } = await a.query<{ id: string }>(
        `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
         values(gen_random_uuid(),'authenticated','authenticated','concurrence-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
      );
      fixture.comptes.push(u.id);
    }
    const { rows: [p] } = await a.query<{ id: string }>(
      `insert into public.supervision_vacances(titre,debut,fin,responsable,delai_minutes,etat,cree_par)
       values('Vacances TEST concurrence', now()-interval '2 days', now()-interval '1 day', $1, 60, 'termine', $2) returning id`,
      [fixture.comptes[0], fixture.comptes[1]]
    );
    fixture.plan = p.id;
    for (const cle of ["concurrence-1", "concurrence-2"]) {
      const { rows: [al] } = await a.query<{ id: string }>(
        `insert into public.supervision_alertes_internes(plan_id,cle,titre,destinataire,echeance) values($1,$2,'Urgence fictive',$3,now()+interval '1 hour') returning id`,
        [fixture.plan, cle, fixture.comptes[0]]
      );
      fixture.alertes.push(al.id);
    }
  });

  afterAll(async () => {
    try {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      await a.query("delete from public.relais_urgences where alerte_id = any($1::uuid[])", [fixture.alertes]);
      await a.query("delete from public.relais_urgences_envois where id = any($1::uuid[])", [fixture.envois]);
      await a.query("delete from public.supervision_alertes_internes where id = any($1::uuid[])", [fixture.alertes]);
      if (fixture.plan) await a.query("delete from public.supervision_vacances where id = $1", [fixture.plan]);
      await a.query("delete from auth.users where id = any($1::uuid[])", [fixture.comptes]);
    } finally {
      await a?.end();
      await b?.end();
    }
  });

  it("les deux alertes validées sont en file, « à envoyer »", async () => {
    const { rows } = await a.query("select statut from public.relais_urgences where alerte_id = any($1::uuid[])", [fixture.alertes]);
    expect(rows).toEqual([{ statut: "a_envoyer" }, { statut: "a_envoyer" }]);
  });

  it("deux prises simultanées : la seconde attend la première, puis ne trouve rien ; un seul envoi, avec les deux urgences", async () => {
    await enService(a);
    const { rows: [{ r: premiere }] } = await a.query<{ r: Prise }>("select public.prendre_urgences_relais(6) as r");
    expect(premiere).toMatchObject({ pris: true });
    expect(premiere.urgences).toHaveLength(2);
    fixture.envois.push(premiere.envoi!);

    await enService(b);
    let finie = false;
    const seconde = b.query<{ r: Prise }>("select public.prendre_urgences_relais(6) as r").then((res) => { finie = true; return res.rows[0].r; });
    // Tant que la première n'a pas validé, la seconde attend (verrou consultatif).
    await new Promise((ok) => setTimeout(ok, 300));
    expect(finie).toBe(false);
    await a.query("commit");
    const r2 = await seconde;
    await b.query("commit");
    expect(r2).toEqual({ pris: false, motif: "rien", en_attente: 0 });

    const { rows: envois } = await a.query("select id, urgences from public.relais_urgences_envois where id = any($1::uuid[])", [fixture.envois]);
    expect(envois).toEqual([{ id: premiere.envoi, urgences: 2 }]);
    const { rows: file } = await a.query("select statut, envoi_id from public.relais_urgences where alerte_id = any($1::uuid[])", [fixture.alertes]);
    expect(file).toEqual([{ statut: "en_envoi", envoi_id: premiere.envoi }, { statut: "en_envoi", envoi_id: premiere.envoi }]);
  });

  it("deux fins simultanées du même envoi : une seule l'écrit", async () => {
    await enService(a);
    await enService(b);
    const premiere = await a.query<{ r: { termine: boolean } }>("select public.terminer_urgences_relais($1,2,2) as r", [fixture.envois[0]]);
    const seconde = b.query<{ r: { termine: boolean } }>("select public.terminer_urgences_relais($1,2,2) as r", [fixture.envois[0]]);
    await a.query("commit");
    const r2 = (await seconde).rows[0].r;
    await b.query("commit");
    expect(premiere.rows[0].r).toMatchObject({ termine: true });
    expect(r2).toEqual({ termine: false });
    const { rows } = await a.query("select statut from public.relais_urgences where alerte_id = any($1::uuid[])", [fixture.alertes]);
    expect(rows).toEqual([{ statut: "envoyee" }, { statut: "envoyee" }]);
  });
});
