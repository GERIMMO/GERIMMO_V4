/**
 * D46-B, relecture du 15/10/2026 — le passage fréquent des urgences du relais : deux passages qui se chevauchent.
 *
 * pg_cron appelle la route toutes les 10 minutes ; un passage lent (service d'e-mail qui tarde), un lancement à la main
 * ou deux instances du serveur peuvent se chevaucher. L'urgence doit être CONSTATÉE une fois (une seule alerte : la base
 * dédoublonne sur le plan et la clé) et ENVOYÉE une fois (une seule prise de la file : verrou consultatif) : un e-mail par
 * adresse, jamais deux.
 *
 * Les deux passages sont le vrai code du serveur (`passerUrgencesRelais`), chacun sur sa propre connexion à la base, sous
 * le rôle du traitement : chaque appel est validé (commit), comme le ferait le client de service. Le service d'e-mail est
 * le faux fournisseur (tests/fixtures/faux-fournisseur-email.ts), ralenti pour que les passages se chevauchent : aucun
 * envoi réel, des adresses d'exemple seulement.
 *
 * Deux sessions ne se voient qu'après un commit : la fixture (deux comptes, un plan ACTIF dont le responsable n'est pas
 * habilité) est VALIDÉE, puis supprimée. Ce fichier tourne donc en série (vitest.config.ts, FICHIERS_EN_SERIE).
 * Nécessite SUPABASE_DB_URL (base locale jetable).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { fauxFournisseurEmail } from "./fixtures/faux-fournisseur-email";
import { passerUrgencesRelais, type ClientUrgences } from "../src/lib/relais-urgences-envoi";
import { lireAdressesRelais } from "../src/lib/relais-alerte";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const ADRESSES = lireAdressesRelais("relais@example.com, second@example.org");
const SITE = "https://gerimmo.test";

let a: Client;
let b: Client;
let temoin: Client;
const fixture = { comptes: [] as string[], plan: "", debut: "", passageAvant: null as string | null };

/** Le client de service, sur une connexion : chaque appel est une transaction validée, sous le rôle du traitement. */
function clientDeService(c: Client): ClientUrgences {
  return {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const noms = Object.keys(args);
      try {
        await c.query("begin");
        await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        await c.query("set local role service_role");
        const { rows: [{ r }] } = await c.query(
          `select public.${fn}(${noms.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`,
          noms.map((n) => args[n])
        );
        await c.query("commit");
        return { data: r, error: null };
      } catch (err) {
        await c.query("rollback").catch(() => undefined);
        return { data: null, error: { message: (err as Error).message } };
      }
    },
  };
}

describe.skipIf(!DB_URL)("D46-B — passage fréquent des urgences : deux passages qui se chevauchent", () => {
  beforeAll(async () => {
    a = new Client({ connectionString: DB_URL });
    b = new Client({ connectionString: DB_URL });
    temoin = new Client({ connectionString: DB_URL });
    await Promise.all([a.connect(), b.connect(), temoin.connect()]);
    fixture.debut = (await temoin.query<{ t: string }>("select now()::text t")).rows[0].t;
    fixture.passageAvant = (await temoin.query<{ d: string | null }>("select dernier_passage_le::text d from public.declencheur_relais_urgences")).rows[0]?.d ?? null;
    // Fixture validée : deux comptes ; un plan ACTIF dont le responsable n'a pas d'habilitation de superviseur : le
    // prochain passage du relais pose l'urgence « responsable_non_habilite ».
    for (let i = 0; i < 2; i++) {
      const { rows: [u] } = await temoin.query<{ id: string }>(
        `insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
         values(gen_random_uuid(),'authenticated','authenticated','chevauchement-'||gen_random_uuid()||'@example.invalid','x',now(),'{}','{}') returning id`
      );
      fixture.comptes.push(u.id);
    }
    const { rows: [p] } = await temoin.query<{ id: string }>(
      `insert into public.supervision_vacances(titre,debut,fin,responsable,delai_minutes,etat,cree_par)
       values('Vacances TEST chevauchement', now()-interval '1 hour', now()+interval '1 day', $1, 60, 'actif', $2) returning id`,
      [fixture.comptes[0], fixture.comptes[1]]
    );
    fixture.plan = p.id;
  });

  afterAll(async () => {
    try {
      const alertes = (await temoin.query<{ id: string }>("select id from public.supervision_alertes_internes where plan_id = $1", [fixture.plan])).rows.map((r) => r.id);
      await temoin.query("delete from public.relais_urgences where alerte_id = any($1::uuid[])", [alertes]);
      await temoin.query("delete from public.relais_urgences_envois where commence_le >= $1::timestamptz", [fixture.debut]);
      await temoin.query("delete from public.supervision_operations where objet = any($1::uuid[]) or objet = $2", [alertes, fixture.plan]);
      await temoin.query("delete from public.supervision_alertes_internes where id = any($1::uuid[])", [alertes]);
      if (fixture.plan) await temoin.query("delete from public.supervision_vacances where id = $1", [fixture.plan]);
      await temoin.query("delete from auth.users where id = any($1::uuid[])", [fixture.comptes]);
      await temoin.query("update public.declencheur_relais_urgences set dernier_passage_le = $1::timestamptz where singleton", [fixture.passageAvant]);
    } finally {
      await Promise.all([a?.end(), b?.end(), temoin?.end()]);
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("deux passages simultanés : l'urgence est constatée une fois et envoyée une fois, un e-mail par adresse ; un troisième passage n'envoie rien", async () => {
    vi.stubEnv("RESEND_API_KEY", "cle-de-test");
    const fournisseur = fauxFournisseurEmail();
    // Un service lent : le premier passage est encore en train d'envoyer quand le second lit la file.
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      await new Promise((ok) => setTimeout(ok, 300));
      return fournisseur.fetch(url, init);
    });

    const [r1, r2] = await Promise.all([
      passerUrgencesRelais({ db: clientDeService(a), adresses: ADRESSES, site: SITE }),
      passerUrgencesRelais({ db: clientDeService(b), adresses: ADRESSES, site: SITE }),
    ]);
    expect(r1.constat).toBe("fait");
    expect(r2.constat).toBe("fait");
    // Un seul des deux a pris l'urgence ; l'autre n'a rien trouvé à envoyer.
    const envois = [...r1.envoi.envois, ...r2.envoi.envois];
    expect(envois).toEqual([{ urgences: 1, destinataires: 2, envoyes: 2, reprise: false, statut: "envoye" }]);

    // Constatée une fois : une seule alerte, une seule ligne de file, envoyée, avec la nature de sa clé.
    const { rows: alertes } = await temoin.query("select cle, statut from public.supervision_alertes_internes where plan_id = $1", [fixture.plan]);
    expect(alertes).toEqual([{ cle: "responsable_non_habilite", statut: "non_acheminee" }]);
    const { rows: file } = await temoin.query(
      "select u.nature, u.statut from public.relais_urgences u join public.supervision_alertes_internes a on a.id = u.alerte_id where a.plan_id = $1", [fixture.plan]
    );
    expect(file).toEqual([{ nature: "responsable_non_habilite", statut: "envoyee" }]);
    // Envoyée une fois : un message accepté par adresse, jamais deux.
    expect(fournisseur.acceptes.map((m) => m.to[0]).sort()).toEqual(["relais@example.com", "second@example.org"]);
    expect(fournisseur.acceptes.every((m) => m.subject === "Gerimmo — urgence du relais")).toBe(true);
    // Les deux passages sont consignés (la sentinelle de 5 h les lit).
    const { rows: [{ recu }] } = await temoin.query("select dernier_passage_le > now() - interval '1 minute' recu from public.declencheur_relais_urgences");
    expect(recu).toBe(true);

    // Un troisième passage : rien de nouveau à constater, file vide, aucun appel au service d'e-mail.
    const appelsAvant = fournisseur.appels.length;
    const r3 = await passerUrgencesRelais({ db: clientDeService(a), adresses: ADRESSES, site: SITE });
    expect(r3).toEqual({ constat: "fait", envoi: { arret: "rien", envois: [] } });
    expect(fournisseur.appels.length).toBe(appelsAvant);
  });
});
