/**
 * Décision X13 du 14/10/2026 (fiche FIN-13) et son élargissement constaté le 15/10 : « aujourd'hui » est le jour de Paris.
 *
 *  · « Encaisser » (encaisser_reste_atomique) n'envoyait aucune date : la base posait CURRENT_DATE, le jour du fuseau de la session
 *    (UTC chez Supabase). Entre minuit et 2 h à Paris, le règlement et la pièce comptable portaient la veille, donc l'année
 *    précédente le 1er janvier.
 *  · L'état d'un appel de loyer (etat_loyers_bail_brut) comparait date_echeance à CURRENT_DATE alors que l'application raisonne au
 *    jour de Paris : de 0 h à 2 h à Paris, un loyer échu la veille s'affichait « attendu » au lieu d'« impayé » (le test e2e
 *    encaissement-reste.spec.ts échouait de 22 h à 24 h UTC pour cette raison). Les deux fonctions qui additionnent l'impayé échu
 *    d'un lot (fiche_lot, contrats_du_lot) lisent la même comparaison : elles suivent, sans quoi la fiche et la liste divergeraient.
 *
 * `now()` ne se simule pas : on fait varier le fuseau de la SESSION, dont dépend `current_date` (méthode de artisan-dates-paris.test.ts,
 * ARC-10). Un fuseau très en retard (UTC-12) ou très en avance (UTC+14) sur Paris donne, à toute heure de la journée, au moins un cas
 * où le jour de la session n'est pas celui de Paris, exactement comme UTC entre 22 h et minuit (« 23 h 30 UTC » : le jour UTC est la
 * veille du jour de Paris). Toutes les dates attendues se calculent depuis le jour de Paris : le test ne dépend pas de l'heure à
 * laquelle il tourne. Transaction annulée à la fin de chaque cas.
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
  let lot: string;
  let bail: string;
  let chambre: string;

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
    lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat,surface_m2,colocation_loyer_reference) values($1,$2,'TEST jour de Paris','loue',60,1000) returning id", [org, bien])).rows[0].id;
    chambre = (await db.query("insert into public.lot_chambres(organization_id,lot_id,nom,surface_m2,volume_m3,description,espaces_partages) values($1,$2,'Jardin',12,30,'Chambre au calme','Cuisine') returning id", [org, lot])).rows[0].id;
    const loc = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Locataire') returning id", [org])).rows[0].id;
    // Un bail de colocation (une chambre) : le seul pour lequel contrats_du_lot rend une ligne.
    bail = (await db.query("insert into public.baux(organization_id,lot_id,chambre_id,type,etat,loyer_hc,charges,date_debut,jour_echeance,locataire_principal) values($1,$2,$3,'colocation','actif',450,50,'2026-01-01',5,$4) returning id", [org, lot, chambre, loc])).rows[0].id;
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

  describe("l'état d'un appel de loyer compare l'échéance au jour de Paris", () => {
    it.each(FUSEAUX)("fuseau de la session %s : échu hier = impayé, échéance aujourd'hui ou demain = attendu", async (nom) => {
      const { appels } = await troisTermes();
      await sansTrace(async () => {
        await fuseau(nom);
        const { rows } = await db.query("select appel_id, statut from public.etat_loyers_bail_brut($1) order by date_echeance", [bail]);
        expect(rows.map((r) => r.appel_id)).toEqual(appels);
        expect(rows.map((r) => r.statut)).toEqual(["impaye", "attendu", "attendu"]);
      });
    });

    it.each(FUSEAUX)("fuseau %s : un terme couvert reste payé, un terme partiel reste partiel (les autres statuts ne changent pas)", async (nom) => {
      await troisTermes();
      await db.query("reset role");
      await db.query("insert into public.encaissements(organization_id,bail_id,montant,date_paiement) values($1,$2,700,$3::date)", [org, bail, await jourParis(0)]);
      await sansTrace(async () => {
        await fuseau(nom);
        const { rows } = await db.query("select statut from public.etat_loyers_bail_brut($1) order by date_echeance", [bail]);
        expect(rows.map((r) => r.statut)).toEqual(["paye", "partiel", "attendu"]);
      });
    });

    it("la fonction publique etat_loyers_bail rend le même statut (elle s'appuie sur la fonction interne)", async () => {
      await troisTermes();
      for (const nom of FUSEAUX) {
        await sansTrace(async () => {
          await fuseau(nom);
          await identite(utilisateur);
          const { rows } = await db.query("select statut from public.etat_loyers_bail($1) order by date_echeance", [bail]);
          expect(rows.map((r) => r.statut), nom).toEqual(["impaye", "attendu", "attendu"]);
        });
      }
    });
  });

  describe("le montant échu d'un lot suit la même comparaison (fiche du lot, contrats de la colocation)", () => {
    it.each(FUSEAUX)("fuseau %s : fiche_lot compte le terme échu hier (500 €, 1 terme), pas celui du jour", async (nom) => {
      await troisTermes();
      await sansTrace(async () => {
        await fuseau(nom);
        await identite(utilisateur);
        const { rows } = await db.query("select impaye_echu::float as montant, termes_impayes as termes from public.fiche_lot($1)", [lot]);
        expect(rows).toEqual([{ montant: 500, termes: 1 }]);
      });
    });

    it.each(FUSEAUX)("fuseau %s : contrats_du_lot compte le terme échu hier (500 €, 1 terme), pas celui du jour", async (nom) => {
      await troisTermes();
      await sansTrace(async () => {
        await fuseau(nom);
        await identite(utilisateur);
        const { rows } = await db.query("select impaye_echu::float as montant, termes_impayes as termes from public.contrats_du_lot($1)", [lot]);
        expect(rows).toEqual([{ montant: 500, termes: 1 }]);
      });
    });

    it("fiche_lot, contrats_du_lot et l'état du bail disent la même chose, dans chaque fuseau", async () => {
      await troisTermes();
      for (const nom of FUSEAUX) {
        await sansTrace(async () => {
          await fuseau(nom);
          await identite(utilisateur);
          const fiche = (await db.query("select impaye_echu::float as m, termes_impayes as n from public.fiche_lot($1)", [lot])).rows[0];
          const contrats = (await db.query("select impaye_echu::float as m, termes_impayes as n from public.contrats_du_lot($1)", [lot])).rows[0];
          const etat = (await db.query("select coalesce(sum(montant_du - montant_couvert),0)::float as m, count(*)::int as n from public.etat_loyers_bail($1) where statut = 'impaye'", [bail])).rows[0];
          expect(fiche, nom).toEqual(etat);
          expect(contrats, nom).toEqual(etat);
        });
      }
    });
  });

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

    it.each(FUSEAUX)("fuseau %s : le terme encaissé passe à « payé » (l'état utilise la même date)", async (nom) => {
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

  describe("plus aucun jour de session dans les définitions concernées", () => {
    it.each([
      "public.etat_loyers_bail_brut(uuid)",
      "public.fiche_lot(uuid)",
      "public.contrats_du_lot(uuid)",
      "public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)",
    ])("%s", async (signature) => {
      const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
      expect(rows[0].def).not.toMatch(/current_date/i);
      expect(rows[0].def).toContain("Décision X13 du 15/10 (FIN-13)");
    });

    it("les droits ne bougent pas : la fonction interne reste fermée aux comptes, les trois autres ne sont pas ouvertes à anon", async () => {
      const droit = async (role: string, signature: string) =>
        (await db.query("select has_function_privilege($1, $2::text::regprocedure, 'execute') as ok", [role, signature])).rows[0].ok;
      expect(await droit("anon", "public.etat_loyers_bail_brut(uuid)")).toBe(false);
      expect(await droit("authenticated", "public.etat_loyers_bail_brut(uuid)")).toBe(false);
      expect(await droit("service_role", "public.etat_loyers_bail_brut(uuid)")).toBe(true);
      for (const signature of ["public.fiche_lot(uuid)", "public.contrats_du_lot(uuid)", "public.encaisser_reste_atomique(uuid,uuid,uuid,uuid,numeric,numeric)"]) {
        expect(await droit("anon", signature), signature).toBe(false);
        expect(await droit("authenticated", signature), signature).toBe(true);
      }
    });

    it("les colonnes de l'état du bail sont celles d'avant", async () => {
      const { rows } = await db.query("select pg_get_function_result('public.etat_loyers_bail_brut(uuid)'::regprocedure) as r");
      expect(rows[0].r).toBe("TABLE(appel_id uuid, periode date, date_echeance date, montant_du numeric, cumul_du numeric, montant_couvert numeric, statut text)");
    });
  });
});
