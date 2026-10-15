/**
 * Décision X13 du 14/10/2026 (fiche FIN-13) : « Encaisser » date le règlement du jour de Paris.
 *
 *  · « Encaisser » (encaisser_reste_atomique) n'envoyait aucune date : la base posait CURRENT_DATE, le jour du fuseau de la session
 *    (UTC chez Supabase). Entre minuit et 2 h à Paris, le règlement et la pièce comptable portaient la veille, donc l'année
 *    précédente le 1er janvier.
 *
 * PÉRIMÈTRE. La décision ne demande que cela. Le lot avait aussi fait lire « échu » au jour de Paris dans l'état d'un appel de loyer, la
 * fiche du lot et les contrats de colocation (élargissement constaté le 15/10) : ce choix change le moment où un loyer passe « impayé », que
 * lisent aussi l'écran du locataire, les alertes de loyer impayé et les relances ; il n'a pas été ratifié par le dirigeant, et il laissait
 * les alertes et les relances sur le jour de la session. Il est retiré du lot (constat de relecture du 15/10) : le dernier bloc de ce fichier
 * verrouille que ces fonctions n'ont pas bougé.
 *
 * `now()` ne se simule pas : on fait varier le fuseau de la SESSION, dont dépend `current_date` (méthode de artisan-dates-paris.test.ts,
 * ARC-10). Un fuseau très en retard (UTC-12) ou très en avance (UTC+14) sur Paris donne, à toute heure de la journée, au moins un cas
 * où le jour de la session n'est pas celui de Paris, exactement comme UTC entre 22 h et minuit (« 23 h 30 UTC » : le jour UTC est la
 * veille du jour de Paris). Toutes les dates attendues se calculent depuis le jour de Paris : le test ne dépend pas de l'heure à
 * laquelle il tourne. Transaction annulée à la fin de chaque cas.
 *
 * Limite connue de cette méthode : elle ne voit pas un fuseau FIGÉ dans la définition (« now() at time zone 'UTC' » donne le jour de
 * Paris sauf de 22 h à 24 h UTC). Le dernier bloc compare donc aussi le texte des définitions à l'expression attendue.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

// UTC : le fuseau supposé de la production ; UTC-12 et UTC+14 : les deux extrêmes ; Paris : rien ne diverge.
const FUSEAUX = ["UTC", "Etc/GMT+12", "Etc/GMT-14", "Europe/Paris"];

describe("« 23 h 30 UTC » : le jour de Paris est déjà le lendemain (l'expression que les fonctions utilisent)", () => {
  // Pur calcul de fuseau, sans base : le jour UTC et le jour de Paris diffèrent entre 22 h/23 h UTC et minuit.
  const jourDeParis = (instantUtc: string) =>
    new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instantUtc));
  it.each([
    ["été, 23 h 30 UTC", "2026-10-14T23:30:00Z", "2026-10-15"],
    ["été, 22 h 00 UTC (minuit à Paris)", "2026-10-14T22:00:00Z", "2026-10-15"],
    ["été, 21 h 59 UTC (23 h 59 à Paris)", "2026-10-14T21:59:00Z", "2026-10-14"],
    ["hiver, 23 h 30 UTC (0 h 30 à Paris) : le 1er janvier à Paris, le 31 décembre en UTC", "2026-12-31T23:30:00Z", "2027-01-01"],
    ["hiver, 22 h 59 UTC (23 h 59 à Paris)", "2026-12-31T22:59:00Z", "2026-12-31"],
  ])("%s", async (_nom, instant, attendu) => {
    expect(jourDeParis(instant)).toBe(attendu);
  });
});

describe.skipIf(!url)("Le jour de Paris, quel que soit le fuseau de la session (FIN-13)", () => {
  let db: Client;
  let org: string;
  let utilisateur: string;
  let bail: string;

  /** Le jour de Paris, décalé de `decalage` jours, au format AAAA-MM-JJ. */
  async function jourParis(decalage = 0) {
    const { rows } = await db.query("select ((now() at time zone 'Europe/Paris')::date + $1::int)::text as j", [decalage]);
    return rows[0].j as string;
  }
  async function fuseau(nom: string) {
    await db.query("select set_config('timezone', $1, true)", [nom]);
  }
  async function identite(id: string | null) {
    await db.query("reset role");
    if (id === null) return;
    await db.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', 'aal2')::text, true)", [id]);
    await db.query("set local role authenticated");
  }
  /** Joue le geste puis l'annule, qu'il réussisse ou non : chaque cas repart du même état. */
  async function sansTrace<T>(geste: () => Promise<T>): Promise<T> {
    await db.query("savepoint essai");
    try {
      return await geste();
    } finally {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
    }
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
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
    org = (await db.query("insert into public.organizations(name,type,status) values ('TEST jour de Paris','proprietaire_direct','active') returning id")).rows[0].id;
    utilisateur = randomUUID();
    await db.query("insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values ($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')", [utilisateur, `${utilisateur}@test.local`]);
    await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [utilisateur, org]);
    const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST jour de Paris','appartement','1 rue de Test','75001','Paris') returning id", [org])).rows[0].id;
    const lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST jour de Paris','loue') returning id", [org, bien])).rows[0].id;
    const loc = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Locataire') returning id", [org])).rows[0].id;
    bail = (await db.query("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',450,50,'2026-01-01',5,$3) returning id", [org, lot, loc])).rows[0].id;
  });

  /** Trois termes de 500 € non réglés : échu hier, échu aujourd'hui, à échoir demain (jours de Paris). */
  async function troisTermes() {
    const dates = [await jourParis(-1), await jourParis(0), await jourParis(1)];
    const appels: string[] = [];
    for (const [i, echeance] of dates.entries()) {
      const { rows } = await db.query(
        `insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du)
         values ($1,$2,(date_trunc('month', (now() at time zone 'Europe/Paris')::date) + ($3::int || ' month')::interval)::date,$4::date,450,50,500) returning id`,
        [org, bail, i - 2, echeance]
      );
      appels.push(rows[0].id);
    }
    return { appels, echeances: dates };
  }

  describe("« Encaisser » date le règlement et la pièce comptable du jour de Paris", () => {
    const encaisser = (appel: string, commande = randomUUID()) =>
      db.query("select public.encaisser_reste_atomique($1,$2,$3,$4,$5,$6) as resultat", [org, bail, appel, commande, 500, 0]);

    it.each(FUSEAUX)("fuseau de la session %s : date_paiement, date de la pièce et date d'imputation sont le jour de Paris", async (nom) => {
      const { appels } = await troisTermes();
      const paris = await jourParis(0);
      await sansTrace(async () => {
        await fuseau(nom);
        await identite(utilisateur);
        const { rows } = await encaisser(appels[0]);
        expect(rows[0].resultat).toMatchObject({ statut: "enregistre", montant: 500, rejoue: false });
        await identite(null);
        const paiement = (await db.query("select date_paiement::text as jour, mode, note from public.encaissements where bail_id = $1", [bail])).rows;
        expect(paiement).toEqual([{ jour: paris, mode: "virement", note: "Encaissé depuis le quittancement" }]);
        const pieces = (await db.query("select categorie, date_piece::text as piece, date_imputation::text as imputation from public.ecritures where bail_id = $1 order by categorie", [bail])).rows;
        expect(pieces.length).toBeGreaterThan(0);
        for (const piece of pieces) expect(piece, nom).toMatchObject({ piece: paris, imputation: paris });
      });
    });

    it.each(FUSEAUX)("fuseau %s : le terme encaissé passe à « payé »", async (nom) => {
      const { appels } = await troisTermes();
      await sansTrace(async () => {
        await fuseau(nom);
        await identite(utilisateur);
        await encaisser(appels[0]);
        await identite(null);
        const { rows } = await db.query("select statut from public.etat_loyers_bail_brut($1) order by date_echeance", [bail]);
        expect(rows.map((r) => r.statut)).toEqual(["paye", "attendu", "attendu"]);
      });
    });

    it("le règlement n'est jamais daté du futur : le contrôle de l'application (jour de Paris) l'accepte toujours", async () => {
      const { appels } = await troisTermes();
      for (const nom of FUSEAUX) {
        await sansTrace(async () => {
          await fuseau(nom);
          await identite(utilisateur);
          await encaisser(appels[0]);
          await identite(null);
          const { rows } = await db.query("select (date_paiement <= (now() at time zone 'Europe/Paris')::date) as ok from public.encaissements where bail_id = $1", [bail]);
          expect(rows, nom).toEqual([{ ok: true }]);
        });
      }
    });
  });

  describe("plus aucun jour de session dans « Encaisser »", () => {
    it.each(["public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)"])("%s : le jour de Paris, écrit en toutes lettres", async (signature) => {
      const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
      const def: string = rows[0].def;
      expect(def).not.toMatch(/current_date/i);
      // Un fuseau figé (« UTC ») ou un jour de session déguisé (« now()::date ») donne le jour de Paris sauf dans la fenêtre de 22 h à 24 h UTC :
      // les cas ci-dessus, qui ne font varier que le fuseau de la SESSION, ne le voient pas. On exige donc l'expression elle-même.
      expect(def).toContain("(now() at time zone 'Europe/Paris')::date");
      expect(def).not.toMatch(/at time zone 'UTC'/i);
      expect(def).not.toMatch(/now\(\)::date/i);
      expect(def).toContain("Décision X13 du 15/10 (FIN-13)");
    });

    it("les droits ne bougent pas : « Encaisser » n'est pas ouverte à anon, ouverte aux comptes connectés", async () => {
      const droit = async (role: string, signature: string) =>
        (await db.query("select has_function_privilege($1, $2::text::regprocedure, 'execute') as ok", [role, signature])).rows[0].ok;
      const signature = "public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)";
      expect(await droit("anon", signature)).toBe(false);
      expect(await droit("authenticated", signature)).toBe(true);
    });
  });

  // Périmètre : la décision X13 ne demande que la date de « Encaisser ». L'élargissement à l'état des loyers, à la fiche du lot et aux contrats de
  // colocation (puis aux alertes et relances) attend la ratification du dirigeant : tant qu'elle n'est pas écrite, ces fonctions ne portent
  // pas la marque du correctif.
  describe("périmètre de la décision X13 : l'échéance d'un loyer se lit toujours comme avant", () => {
    it.each([
      "public.etat_loyers_bail_brut(uuid)",
      "public.fiche_lot(uuid)",
      "public.contrats_du_lot(uuid)",
      "public.suivre_impayes_bail(uuid)",
      "public.relances_loyer_dues(integer)",
    ])("%s ne porte pas la marque de la décision X13", async (signature) => {
      const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
      expect(rows[0].def).not.toContain("Décision X13 du 15/10 (FIN-13)");
      expect(rows[0].def).toMatch(/current_date/i);
    });

    it("les colonnes de l'état du bail sont celles d'avant", async () => {
      const { rows } = await db.query("select pg_get_function_result('public.etat_loyers_bail_brut(uuid)'::regprocedure) as r");
      expect(rows[0].r).toBe("TABLE(appel_id uuid, periode date, date_echeance date, montant_du numeric, cumul_du numeric, montant_couvert numeric, statut text)");
    });
  });
});
