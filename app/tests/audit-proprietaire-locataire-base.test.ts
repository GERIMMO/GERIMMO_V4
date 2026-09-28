/**
 * Audit PROPRIÉTAIRE ET LOCATAIRE du 27/09 — les corrections en base.
 *
 *  1. Un créneau passé ne se retient plus (mes_creneaux_locataire,
 *     choisir_creneau, mon_suivi_intervention).
 *  2. La quittance délivrée au locataire a ses données conformes
 *     (quittance_document) — et personne d'autre ne les lit.
 *  3. Retirer un bien : archivage, sortie du comptage de l'abonnement,
 *     refus tant qu'un bail court (Archivage plutôt que suppression,
 *     Grille tarifaire).
 *  4. Le parcours de démarrage mène au premier loyer encaissé.
 *
 * Transaction annulée à la fin. Nécessite SUPABASE_DB_URL (sinon ignoré).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("audit propriétaire et locataire (27/09) — base", () => {
  let db: Client;
  let org = "", orgPd = "", orgAutre = "";
  let gerant = "", cptLoc = "", cptPd = "", etranger = "";
  let lot = "", bail = "", bien = "", personne = "";
  let intervention = "";

  const agir = async (compte: string) => {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
  };
  const enTantQuePostgres = () => db.query("reset role");
  const refus = async (sql: string, params: unknown[] = []): Promise<string> => {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      return (e as Error).message;
    }
  };

  async function nouveauCompte(prefixe: string): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status, address_line1, postal_code, city, email_contact, siret)
       values ('Audit27 — Agence','active','3 place de la Mairie','75004','Paris','contact@a27.test','12345678900011'),
              ('Audit27 — Autre','active', null, null, null, null, null)
       returning id, name`
    );
    org = orgs.find((o) => o.name.endsWith("Agence")).id;
    orgAutre = orgs.find((o) => o.name.endsWith("Autre")).id;
    const { rows: [pd] } = await db.query(
      // Grille historique : ce fichier vérifie le retrait d'un bien avec le
      // décompte d'avant le 28/09/2026 (premier bien offert). La nouvelle
      // grille a ses tests dans tarification-2026.test.ts.
      `insert into public.organizations (name, status, type, address_line1, postal_code, city, email_contact, grille_tarifaire)
       values ('Parc de Claire','active','proprietaire_direct','1 rue Haute','69007','Lyon','claire@pd.test','historique')
       returning id`
    );
    orgPd = pd.id;

    gerant = await nouveauCompte("gerant");
    cptLoc = await nouveauCompte("loc");
    cptPd = await nouveauCompte("pd");
    etranger = await nouveauCompte("etranger");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
        ($1,$2,'admin_agence'),($3,$2,'locataire'),($4,$5,'proprietaire_direct'),($6,$7,'admin_agence')`,
      [gerant, org, cptLoc, cptPd, orgPd, etranger, orgAutre]
    );

    const { rows: [b] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','18 rue des Acacias','75012','Paris') returning id`,
      [org]
    );
    bien = b.id;
    const { rows: [l] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Appartement 2','loue') returning id`,
      [bien, org]
    );
    lot = l.id;
    const { rows: [proprio] } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1,'Dupont','Jean') returning id`,
      [org]
    );
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut)
       values ($1,$2,$3,100,current_date - 400)`,
      [lot, org, proprio.id]
    );
    const { rows: [p] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom) values ($1,$2,'Martin','Léa') returning id`,
      [org, cptLoc]
    );
    personne = p.id;
    const { rows: [ba] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 650, 50) returning id`,
      [org, lot, personne]
    );
    bail = ba.id;
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  // ── 1. Créneaux passés ─────────────────────────────────────────────────────
  describe("un créneau passé ne se retient plus", () => {
    let creneauPasse = "", creneauFutur = "";

    beforeAll(async () => {
      await enTantQuePostgres();
      const { rows: [inc] } = await db.query(
        `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id,
           canal, categorie, description, etat, imputation, imputation_justification)
         values ($1,'INC-A27',$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite','qualifie',
           'proprietaire','Joint usé par le temps')
         returning id`,
        [org, lot, bail, personne]
      );
      const { rows: [art] } = await db.query(
        `insert into public.artisans (raison_sociale, siret, telephone) values ('Plomberie A27','98765432100017','0600000000') returning id`
      );
      const { rows: [iv] } = await db.query(
        `insert into public.incident_interventions (organization_id, incident_id, artisan_id, nature_travaux, statut)
         values ($1,$2,$3,'entretien_courant','acceptee') returning id`,
        [org, inc.id, art.id]
      );
      intervention = iv.id;
      const { rows } = await db.query(
        `insert into public.intervention_creneaux (organization_id, intervention_id, propose_par, debut, fin)
         values ($1,$2,'artisan', now() - interval '1 day', now() - interval '1 day' + interval '4 hours'),
                ($1,$2,'artisan', now() + interval '3 days', now() + interval '3 days' + interval '4 hours')
         returning id, debut`,
        [org, intervention]
      );
      const tries = [...rows].sort((a, b) => +new Date(a.debut) - +new Date(b.debut));
      creneauPasse = tries[0].id;
      creneauFutur = tries[1].id;
    });

    it("la liste du locataire ne montre que le créneau à venir", async () => {
      await agir(cptLoc);
      const { rows } = await db.query(`select creneau_id from public.mes_creneaux_locataire($1)`, [org]);
      expect(rows.map((r) => r.creneau_id)).toEqual([creneauFutur]);
    });

    it("retenir un créneau passé est refusé, avec le geste à faire", async () => {
      await agir(cptLoc);
      expect(await refus(`select public.choisir_creneau($1,$2)`, [org, creneauPasse])).toMatch(
        /Ce créneau est passé : proposez vos disponibilités/
      );
    });

    it("le suivi ne compte pas le créneau passé, et garde l'étape « à choisir »", async () => {
      await agir(cptLoc);
      const { rows } = await db.query(
        `select etape, creneaux_a_choisir from public.mon_suivi_intervention($1) where intervention_id = $2`,
        [org, intervention]
      );
      expect(rows[0]).toMatchObject({ etape: "creneau_a_choisir", creneaux_a_choisir: 1 });
      // Tous passés : l'étape reste « à choisir » (proposer ses disponibilités), à 0.
      await enTantQuePostgres();
      await db.query(
        `update public.intervention_creneaux set debut = now() - interval '2 hours', fin = now() - interval '1 hour' where id = $1`,
        [creneauFutur]
      );
      await agir(cptLoc);
      const { rows: apres } = await db.query(
        `select etape, creneaux_a_choisir from public.mon_suivi_intervention($1) where intervention_id = $2`,
        [org, intervention]
      );
      expect(apres[0]).toMatchObject({ etape: "creneau_a_choisir", creneaux_a_choisir: 0 });
      await enTantQuePostgres();
      await db.query(
        `update public.intervention_creneaux set debut = now() + interval '3 days', fin = now() + interval '3 days 4 hours' where id = $1`,
        [creneauFutur]
      );
    });

    it("un créneau à venir se retient toujours", async () => {
      await agir(cptLoc);
      expect(await refus(`select public.choisir_creneau($1,$2)`, [org, creneauFutur])).toBe("");
    });
  });

  // ── 2. La quittance conforme ─────────────────────────────────────────────
  describe("quittance_document", () => {
    let quittance = "";

    beforeAll(async () => {
      await enTantQuePostgres();
      const { rows: [appel] } = await db.query(
        `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
         values ($1,$2,'2026-09-01',650,50,700,'2026-09-05') returning id`,
        [org, bail]
      );
      const { rows: [q] } = await db.query(
        `insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant, date_emission)
         values ($1,$2,$3,true,700,'2026-09-05') returning id`,
        [org, bail, appel.id]
      );
      quittance = q.id;
      await db.query(
        `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
         values ($1,$2,700,'2026-09-04','virement')`,
        [org, bail]
      );
    });

    it("le locataire du bail lit l'émetteur, son adresse, le bailleur, la période et le règlement", async () => {
      await agir(cptLoc);
      const { rows: [{ d }] } = await db.query(`select public.quittance_document($1) as d`, [quittance]);
      expect(d.organisation).toMatchObject({
        type: "agence",
        nom: "Audit27 — Agence",
        adresse: "3 place de la Mairie",
        ville: "Paris",
        email: "contact@a27.test",
        siret: "12345678900011",
      });
      expect(d.bailleurs).toEqual([{ nom: "Dupont", prenom: "Jean" }]);
      expect(d.locataires).toEqual([{ nom: "Martin", prenom: "Léa" }]);
      expect(d.periode).toBe("2026-09-01");
      expect(Number(d.loyer_hc)).toBe(650);
      expect(Number(d.charges)).toBe(50);
      expect(d.vue_gestionnaire).toBe(false);
    });

    it("le gérant la lit aussi, et sait qu'il est gérant", async () => {
      await agir(gerant);
      const { rows: [{ d }] } = await db.query(`select public.quittance_document($1) as d`, [quittance]);
      expect(d.vue_gestionnaire).toBe(true);
    });

    it("un compte étranger ne lit rien", async () => {
      await agir(etranger);
      const { rows: [{ d }] } = await db.query(`select public.quittance_document($1) as d`, [quittance]);
      expect(d).toBeNull();
    });

    it("anon n'a pas le droit d'appeler la fonction", async () => {
      await db.query("reset role");
      await db.query("set local role anon");
      expect(await refus(`select public.quittance_document($1)`, [quittance])).toMatch(/permission denied/);
    });
  });

  // ── 2 bis. Mes paiements et l'attestation ───────────────────────────────
  describe("échéancier et attestation du locataire", () => {
    it("l'échéancier rend le loyer et les charges APPELÉS du terme, et le prorata", async () => {
      await agir(cptLoc);
      const { rows } = await db.query(
        `select periode, loyer_hc, charges, prorata from public.mon_echeancier_locataire($1) where periode = '2026-09-01'`,
        [org]
      );
      expect(rows[0]).toMatchObject({ prorata: false });
      expect(Number(rows[0].loyer_hc)).toBe(650);
      expect(Number(rows[0].charges)).toBe(50);
    });

    it("l'attestation connaît son émetteur : nom, adresse, bailleurs", async () => {
      await agir(cptLoc);
      const { rows: [{ e }] } = await db.query(`select public.attestation_emetteur_locataire($1) as e`, [org]);
      expect(e).toMatchObject({
        type: "agence",
        nom: "Audit27 — Agence",
        adresse: "3 place de la Mairie",
        ville: "Paris",
        bailleurs: [{ nom: "Dupont", prenom: "Jean" }],
      });
    });

    it("un compte étranger n'y lit rien", async () => {
      await agir(etranger);
      const { rows: [{ e }] } = await db.query(`select public.attestation_emetteur_locataire($1) as e`, [org]);
      expect(e).toBeNull();
    });
  });

  // ── 3. Retirer un bien ───────────────────────────────────────────────────
  describe("retirer un bien", () => {
    let bienLibre = "", lotLibre = "";

    beforeAll(async () => {
      await enTantQuePostgres();
      const { rows } = await db.query(
        `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
         values ($1,'Premier','appartement','1 rue A','69007','Lyon'),
                ($1,'Studio du Rhône','appartement','2 rue B','69007','Lyon')
         returning id, nom`,
        [orgPd]
      );
      bienLibre = rows.find((r) => r.nom === "Studio du Rhône").id;
      const { rows: [l] } = await db.query(
        `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot unique','brouillon') returning id`,
        [bienLibre, orgPd]
      );
      lotLibre = l.id;
    });

    const quantite = async () => {
      await enTantQuePostgres();
      const { rows: [{ n }] } = await db.query(`select public.abonnement_quantite_cible($1) as n`, [orgPd]);
      return n as number;
    };

    it("deux biens chez un propriétaire direct : un seul est facturé (le premier est offert)", async () => {
      expect(await quantite()).toBe(1);
    });

    it("retiré, le bien n'est plus compté, ses lots libres sont archivés, le geste est journalisé", async () => {
      await agir(cptPd);
      await db.query(`select public.retirer_bien($1,$2)`, [orgPd, bienLibre]);
      expect(await quantite()).toBe(0);
      const { rows: [l] } = await db.query(`select etat from public.lots where id=$1`, [lotLibre]);
      expect(l.etat).toBe("archive");
      const { rows: [b] } = await db.query(`select archived_at, archived_by from public.biens where id=$1`, [bienLibre]);
      expect(b.archived_at).not.toBeNull();
      expect(b.archived_by).toBe(cptPd);
      const { rows: journal } = await db.query(
        `select action from public.audit_log where organization_id=$1 and details->>'bien_id'=$2`,
        [orgPd, bienLibre]
      );
      expect(journal.map((j) => j.action)).toContain("bien_retire");
      await agir(cptPd);
      const { rows: [etat] } = await db.query(`select unites_total from public.etat_abonnement($1)`, [orgPd]);
      expect(etat.unites_total).toBe(1);
    });

    it("rétabli, il est de nouveau compté", async () => {
      await agir(cptPd);
      await db.query(`select public.retablir_bien($1,$2)`, [orgPd, bienLibre]);
      expect(await quantite()).toBe(1);
    });

    it("un bien qui porte un bail en cours ne se retire pas, même en posant archived_at à la main", async () => {
      await agir(gerant);
      expect(await refus(`select public.retirer_bien($1,$2)`, [org, bien])).toMatch(/bail en cours/);
      expect(
        await refus(`update public.biens set archived_at = now() where id = $1`, [bien])
      ).toMatch(/bail en cours/);
    });

    it("réservé au responsable du compte", async () => {
      await agir(etranger);
      expect(await refus(`select public.retirer_bien($1,$2)`, [orgPd, bienLibre])).toMatch(/réservé/);
    });
  });

  // ── 4. Le parcours de démarrage ──────────────────────────────────────────
  describe("parcours de démarrage : la sixième étape", () => {
    it("le premier loyer encaissé se coche quand une quittance existe", async () => {
      await agir(gerant);
      const { rows } = await db.query(
        `select etape, faite, detail from public.parcours_demarrage($1)`,
        [org]
      );
      const loyer = rows.find((r) => r.etape === "loyer");
      expect(rows.map((r) => r.etape).at(-1)).toBe("loyer");
      // La quittance du bloc 2 existe : l'étape est faite.
      expect(loyer).toMatchObject({ faite: true, detail: "Loyer encaissé, quittance émise." });
    });

    it("sans quittance, l'étape dit le geste à faire", async () => {
      await agir(cptPd);
      const { rows } = await db.query(
        `select etape, faite, detail from public.parcours_demarrage($1)`,
        [orgPd]
      );
      const loyer = rows.find((r) => r.etape === "loyer");
      expect(loyer.faite).toBe(false);
      // Pas de bail en cours : rien à déclarer encore.
      expect(loyer.detail).toBeNull();
      // Deux biens au parc (dont un retiré puis rétabli) : l'étape « bien » les compte.
      expect(rows.find((r) => r.etape === "bien").faite).toBe(true);
    });
  });
});
