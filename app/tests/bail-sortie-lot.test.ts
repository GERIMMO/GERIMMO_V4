/**
 * Lot « bail-sortie » — décisions D01, D34 et D35 du 14/10/2026, en base.
 *
 *   D01 (PROP-14)       : le premier terme d'un bail qui commence en cours de mois
 *                         n'est jamais exigible avant l'entrée (nouveaux appels).
 *   D34 (SOR-03/SOR-04) : date de sortie réelle à la clôture, confirmation d'une
 *                         clôture avant la fin du préavis, refus d'activer un bail
 *                         qui entre avant la sortie du précédent.
 *   D35 (SOR-02)        : remise des clés jamais datée d'après aujourd'hui, et
 *                         correction possible tant que la restitution est en cours.
 *
 * Transaction annulée à la fin de chaque test. Nécessite SUPABASE_DB_URL (base
 * locale jetable) ; sans elle, les tests se sautent.
 */
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Lot bail-sortie — D01, D34, D35 en base", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let bien: string;
  let locataire: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
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
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Lot bail-sortie','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'sortie-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [b],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city, zone_tendue)
       values ($1,'Bien sortie','appartement'::public.bien_type,'1 rue A','75012','Paris', false) returning id`,
      [org]
    );
    bien = b.id;
    const {
      rows: [p],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, email)
       values ($1,'Martin','Claire','claire.martin@exemple.fr') returning id`,
      [org]
    );
    locataire = p.id;
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  async function lot(etat = "loue"): Promise<string> {
    await db.query("reset role");
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot '||gen_random_uuid(),$3::public.lot_etat) returning id`,
      [org, bien, etat]
    );
    return l.id;
  }

  async function bail(champs: Record<string, unknown>): Promise<string> {
    await db.query("reset role");
    const l = (champs.lot_id as string | undefined) ?? (await lot());
    const donnees: Record<string, unknown> = {
      organization_id: org,
      lot_id: l,
      locataire_principal: locataire,
      type: "nu",
      etat: "actif",
      loyer_hc: 650,
      charges: 50,
      jour_echeance: 1,
      ...champs,
    };
    const cols = Object.keys(donnees);
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      Object.values(donnees)
    );
    await couvrirParMandat(db, b.id);
    return b.id;
  }

  async function echec(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint e");
    await expect(db.query(sql, params)).rejects.toThrow(motif);
    await db.query("rollback to savepoint e");
  }

  /** Rejoue une requête qui doit échouer et rend l'erreur (code SQLSTATE compris). */
  async function erreurDe(sql: string, params: unknown[] = []) {
    await db.query("savepoint erreur_de");
    const resultat = await db.query(sql, params).then(
      () => null,
      (e) => e as Error & { code?: string }
    );
    await db.query("rollback to savepoint erreur_de");
    expect(resultat, "la requête aurait dû être refusée").not.toBeNull();
    return resultat as Error & { code?: string };
  }

  /** Date relative au jour de la base (le test ne dépend pas de la date d'exécution). */
  async function jour(expression: string): Promise<string> {
    const {
      rows: [r],
    } = await db.query(`select to_char(${expression}, 'YYYY-MM-DD') as d`);
    return r.d;
  }

  const MOIS_PRECEDENT = "(date_trunc('month', current_date) - interval '1 month')::date";
  const MOIS_COURANT = "date_trunc('month', current_date)::date";

  async function appels(b: string) {
    await db.query("reset role");
    const { rows } = await db.query(
      `select to_char(periode,'YYYY-MM-DD') as periode, to_char(date_echeance,'YYYY-MM-DD') as echeance,
              prorata, montant_du::text as du
         from public.appels_loyer where bail_id = $1 order by periode`,
      [b]
    );
    return rows as { periode: string; echeance: string; prorata: boolean; du: string }[];
  }

  // ------------------------------------------------------------------------
  // D01 (PROP-14) — option A : échéance = la plus tardive de l'échéance calculée
  // et de la date d'entrée, pour les NOUVEAUX appels seulement.
  // ------------------------------------------------------------------------
  describe("D01 — premier terme d'un bail qui entre en cours de mois", () => {
    it("entrée le 16 du mois dernier, échéance le 1er : le premier terme est exigible à l'entrée, pas avant", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const [premier, ...suite] = await appels(b);
      expect(premier.periode).toBe(await jour(MOIS_PRECEDENT));
      expect(premier.prorata).toBe(true);
      // Jusqu'ici l'échéance était le 1er du mois, quinze jours avant l'entrée
      expect(premier.echeance).toBe(entree);
      // Les termes suivants gardent leur échéance habituelle (le 1er)
      expect(suite.map((a) => a.echeance)).toEqual([await jour(MOIS_COURANT)]);
    });

    it("entrée le 1er du mois : rien ne change (échéance au jour d'échéance du bail)", async () => {
      const entree = await jour(MOIS_PRECEDENT);
      const b = await bail({ date_debut: entree, jour_echeance: 5 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const lignes = await appels(b);
      expect(lignes[0]).toMatchObject({ periode: entree, echeance: await jour(`${MOIS_PRECEDENT} + 4`), prorata: false });
      expect(lignes[1].echeance).toBe(await jour(`${MOIS_COURANT} + 4`));
    });

    it("entrée le 3, échéance le 5 : l'échéance calculée est la plus tardive, elle reste", async () => {
      const b = await bail({ date_debut: await jour(`${MOIS_PRECEDENT} + 2`), jour_echeance: 5 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      expect((await appels(b))[0].echeance).toBe(await jour(`${MOIS_PRECEDENT} + 4`));
    });

    it("entrée le dernier jour du mois courant : l'appel du mois est dû ce jour-là, jamais le 1er", async () => {
      const entree = await jour(`(${MOIS_COURANT} + interval '1 month - 1 day')::date`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const lignes = await appels(b);
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toMatchObject({ periode: await jour(MOIS_COURANT), echeance: entree, prorata: true });
    });

    it("bail qui commence le mois prochain : aucun appel n'est créé, donc rien d'exigible", async () => {
      const b = await bail({ date_debut: await jour(`(${MOIS_COURANT} + interval '1 month')::date + 9`), jour_echeance: 1 });
      await enGerant();
      const { rows } = await db.query(`select public.generer_appels_loyer($1) as n`, [b]);
      expect(rows[0].n).toBe(0);
      expect(await appels(b)).toEqual([]);
    });

    it("terme échu : l'échéance reste le jour du mois suivant (déjà après l'entrée)", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 5, paiement_echeance: "echu" });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      expect((await appels(b))[0].echeance).toBe(await jour(`${MOIS_COURANT} + 4`));
    });

    it("le prorata et le montant dû ne changent pas : seule l'échéance bouge", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      await enGerant();
      await db.query(`select public.generer_appels_loyer($1)`, [b]);
      const {
        rows: [attendu],
      } = await db.query(
        `select round(650 * (extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::int - 15)
                      / extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::numeric, 2)
              + round(50 * (extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::int - 15)
                      / extract(day from (${MOIS_PRECEDENT} + interval '1 month - 1 day'))::numeric, 2) as du`
      );
      expect((await appels(b))[0].du).toBe(Number(attendu.du).toFixed(2));
    });

    it("aucun appel existant n'est modifié, et un second passage ne crée rien", async () => {
      const entree = await jour(`${MOIS_PRECEDENT} + 15`);
      const b = await bail({ date_debut: entree, jour_echeance: 1 });
      // Un appel déjà généré avant la décision, avec l'ancienne échéance (le 1er)
      await db.query(
        `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance, prorata)
         values ($1,$2,${MOIS_PRECEDENT},300,20,320,${MOIS_PRECEDENT},true)`,
        [org, b]
      );
      await enGerant();
      const { rows } = await db.query(`select public.generer_appels_loyer($1) as n`, [b]);
      expect(rows[0].n).toBe(1); // seul le mois courant manquait
      const lignes = await appels(b);
      expect(lignes[0].echeance).toBe(await jour(MOIS_PRECEDENT));
      expect(Number(lignes[0].du)).toBe(320);
      const { rows: encore } = await db.query(`select public.generer_appels_loyer($1) as n`, [b]);
      expect(encore[0].n).toBe(0);
      expect((await appels(b))[0].echeance).toBe(await jour(MOIS_PRECEDENT));
    });

    it("les droits ne changent pas : la fonction interne reste fermée aux comptes, seule son enveloppe contrôlée est ouverte", async () => {
      const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.generer_appels_loyer_interne(uuid)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.generer_appels_loyer_interne(uuid)', 'execute') as comptes,
                has_function_privilege('service_role', 'public.generer_appels_loyer_interne(uuid)', 'execute') as service,
                has_function_privilege('authenticated', 'public.generer_appels_loyer(uuid)', 'execute') as enveloppe`
      );
      expect(rows[0]).toEqual({ anon: false, comptes: false, service: true, enveloppe: true });
    });
  });

  // ------------------------------------------------------------------------
  // D34 (SOR-03, SOR-04) — option B : date de sortie réelle remplie à la clôture
  // (confirmation si elle précède la date d'effet du préavis) ; refus d'activer
  // un bail qui entre avant la sortie réelle du précédent (à défaut : date_fin).
  // ------------------------------------------------------------------------
  describe("D34 — date de sortie réelle et bail suivant", () => {
    // Un lot prêt à louer : détention 100 %, diagnostics valides, disponible —
    // pour qu'aucun autre blocage ne masque ce que ces tests mesurent.
    async function lotLouable(): Promise<string> {
      await enGerant();
      const {
        rows: [{ id: leBien }],
      } = await db.query(
        `select public.creer_bien_avec_lot($1,'9 rue de la Sortie','appartement'::public.bien_type,
           '9 rue de la Sortie', null, '75011','Paris',1985,false,42,2) as id`,
        [org]
      );
      await db.query("reset role");
      await db.query(`select set_config('request.jwt.claims','',true)`);
      const {
        rows: [{ id: leLot }],
      } = await db.query(`select id from public.lots where bien_id = $1`, [leBien]);
      const {
        rows: [{ id: proprietaire }],
      } = await db.query(`insert into public.persons (organization_id, nom) values ($1,'Bailleur') returning id`, [org]);
      await db.query(
        `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
        [leLot, org, proprietaire]
      );
      await db.query(
        `insert into public.diagnostics (organization_id, lot_id, type, date_realisation, date_expiration)
         values ($1,$2,'dpe',current_date,current_date+365)`,
        [org, leLot]
      );
      await db.query(
        `insert into public.diagnostics (organization_id, bien_id, type, date_realisation, date_expiration)
         values ($1,$2,'erp',current_date,current_date+180)`,
        [org, leBien]
      );
      await db.query(`update public.lots set etat='disponible' where id=$1`, [leLot]);
      await couvrirParMandat(db, leLot);
      return leLot;
    }

    async function brouillon(leLot: string, debut: string, chambre: string | null = null): Promise<string> {
      await db.query("reset role");
      const {
        rows: [{ id: document }],
      } = await db.query(
        `insert into public.documents (organization_id, type, titre, storage_path, mime_type, taille_octets, empreinte, deposited_by)
         values ($1,'bail','Bail signé', $1::uuid::text||'/'||gen_random_uuid()||'.pdf','application/pdf',1000,'e-'||gen_random_uuid(),$2)
         returning id`,
        [org, gerant]
      );
      const {
        rows: [{ id }],
      } = await db.query(
        `insert into public.baux (organization_id, lot_id, locataire_principal, document_signe,
                                  loyer_hc, charges, jour_echeance, date_debut, type, chambre_id)
         values ($1,$2,$3,$4,450,50,5,$5,$6::public.bail_type,$7) returning id`,
        [org, leLot, locataire, document, debut, chambre ? "colocation" : "nu", chambre]
      );
      return id;
    }

    /** Un bail actif depuis longtemps, congé enregistré (préavis), état des lieux de sortie signé. */
    async function bailEnPreavis(presentation: string): Promise<{ lot: string; bail: string }> {
      const leLot = await lotLouable();
      await db.query("reset role");
      const {
        rows: [{ id }],
      } = await db.query(
        `insert into public.baux (organization_id, lot_id, locataire_principal, etat, loyer_hc, charges, jour_echeance, date_debut)
         values ($1,$2,$3,'actif',650,50,1,current_date - 400) returning id`,
        [org, leLot, locataire]
      );
      await db.query(`update public.lots set etat='loue' where id=$1`, [leLot]);
      await enGerant();
      await db.query(
        `select public.enregistrer_conge($1,'locataire'::public.conge_par, ${presentation}, 3::smallint)`,
        [id]
      );
      await db.query("reset role");
      await db.query(
        `insert into public.etats_des_lieux (organization_id, bail_id, type, etat, date_edl)
         values ($1,$2,'sortie','signe', current_date)`,
        [org, id]
      );
      await enGerant();
      return { lot: leLot, bail: id };
    }

    async function etatDuBail(b: string) {
      await db.query("reset role");
      const {
        rows: [r],
      } = await db.query(
        `select etat::text, to_char(date_fin,'YYYY-MM-DD') as date_fin,
                to_char(date_sortie_reelle,'YYYY-MM-DD') as sortie
           from public.baux where id = $1`,
        [b]
      );
      return r as { etat: string; date_fin: string; sortie: string | null };
    }

    const AUJOURDHUI_PARIS = "(now() at time zone 'Europe/Paris')::date";

    it("clôture avant la fin du préavis, sans confirmation : refusée, rien n'est écrit", async () => {
      const { bail: b } = await bailEnPreavis("current_date");
      const avant = await etatDuBail(b);
      expect(avant.etat).toBe("preavis");
      const erreur = await erreurDe(`select public.terminer_bail($1)`, [b]);
      expect(erreur.code).toBe("GRC01");
      expect(erreur.message).toMatch(/avant la fin du préavis/);
      // La date d'effet est dite, en clair, au format français
      expect(erreur.message).toContain(avant.date_fin.split("-").reverse().join("/"));
      expect(await etatDuBail(b)).toEqual({ ...avant, sortie: null });
    });

    it("clôture anticipée confirmée : la sortie réelle est enregistrée, la date de fin du bail ne bouge pas", async () => {
      const { lot: l, bail: b } = await bailEnPreavis("current_date");
      const avant = await etatDuBail(b);
      const sortie = await jour(`${AUJOURDHUI_PARIS} - 3`);
      await db.query(`select public.terminer_bail($1, $2::date, true)`, [b, sortie]);
      const apres = await etatDuBail(b);
      expect(apres).toEqual({ etat: "termine", date_fin: avant.date_fin, sortie });
      const { rows } = await db.query(`select etat::text from public.lots where id = $1`, [l]);
      expect(rows[0].etat).toBe("disponible");
    });

    it("sans date, la sortie réelle est le jour de Paris", async () => {
      const { bail: b } = await bailEnPreavis("current_date");
      await db.query(`select public.terminer_bail($1, null, true)`, [b]);
      expect((await etatDuBail(b)).sortie).toBe(await jour(AUJOURDHUI_PARIS));
    });

    it("préavis échu : aucune confirmation à donner, la date par défaut est aujourd'hui", async () => {
      const { bail: b } = await bailEnPreavis("(current_date - interval '4 months')::date");
      const avant = await etatDuBail(b);
      expect(avant.date_fin < (await jour(AUJOURDHUI_PARIS))).toBe(true);
      await db.query(`select public.terminer_bail($1)`, [b]);
      expect(await etatDuBail(b)).toEqual({ etat: "termine", date_fin: avant.date_fin, sortie: await jour(AUJOURDHUI_PARIS) });
    });

    it("une sortie réelle datée d'après la date d'effet du préavis se déclare sans confirmation", async () => {
      const { bail: b } = await bailEnPreavis("(current_date - interval '4 months')::date");
      const avant = await etatDuBail(b);
      await db.query(`select public.terminer_bail($1, $2::date, false)`, [b, avant.date_fin]);
      expect((await etatDuBail(b)).sortie).toBe(avant.date_fin);
    });

    it("la sortie réelle ne peut être ni dans le futur ni avant l'entrée dans les lieux", async () => {
      const { bail: b } = await bailEnPreavis("(current_date - interval '4 months')::date");
      await echec(/postérieure à aujourd'hui/, `select public.terminer_bail($1, ${AUJOURDHUI_PARIS} + 1, true)`, [b]);
      await echec(/précéder l'entrée/, `select public.terminer_bail($1, current_date - 1000, true)`, [b]);
      expect((await etatDuBail(b)).etat).toBe("preavis");
    });

    it("un bail clôturé avant même son entrée peut l'être : le locataire n'a jamais occupé le logement", async () => {
      const { bail: b } = await bailEnPreavis("(current_date - interval '4 months')::date");
      await db.query("reset role");
      // Bail signé pour une entrée dans un mois, congé enregistré avant l'entrée
      await db.query(`update public.baux set date_debut = current_date + 30 where id = $1`, [b]);
      await enGerant();
      await db.query(`select public.terminer_bail($1, null, true)`, [b]);
      expect((await etatDuBail(b)).sortie).toBe(await jour(AUJOURDHUI_PARIS));
    });

    it("seul un bail en préavis avec état des lieux de sortie signé se clôture, comme avant", async () => {
      const { bail: b } = await bailEnPreavis("(current_date - interval '4 months')::date");
      await db.query("reset role");
      await db.query(`delete from public.etats_des_lieux where bail_id = $1`, [b]);
      await enGerant();
      await echec(/sans état des lieux de sortie signé/, `select public.terminer_bail($1, null, true)`, [b]);
    });

    it("bail suivant : une entrée AVANT la sortie réelle du précédent est refusée (SOR-03)", async () => {
      const { lot: l, bail: a } = await bailEnPreavis("current_date");
      const sortie = await jour(`${AUJOURDHUI_PARIS} - 2`);
      await db.query(`select public.terminer_bail($1, $2::date, true)`, [a, sortie]);
      const trop_tot = await brouillon(l, await jour(`${AUJOURDHUI_PARIS} - 40`));
      await enGerant();
      const erreur = await erreurDe(`select public.activer_bail($1)`, [trop_tot]);
      expect(erreur.message).toMatch(/bail précédent/);
      expect(erreur.message).toContain(sortie.split("-").reverse().join("/"));
      expect(erreur.message).toMatch(/sortie réelle/);
    });

    it("bail suivant : une entrée le jour de la sortie réelle, ou après, s'active", async () => {
      const { lot: l, bail: a } = await bailEnPreavis("current_date");
      const sortie = await jour(`${AUJOURDHUI_PARIS} - 2`);
      await db.query(`select public.terminer_bail($1, $2::date, true)`, [a, sortie]);
      const le_jour = await brouillon(l, sortie);
      await enGerant();
      await db.query(`select public.controler_mise_en_location($1)`, [le_jour]);
      await db.query(`select public.activer_bail($1)`, [le_jour]);
      expect((await etatDuBail(le_jour)).etat).toBe("actif");
    });

    it("bail suivant : sans sortie réelle enregistrée (bail clôturé avant cette règle), la date de fin fait foi", async () => {
      const l = await lotLouable();
      await db.query("reset role");
      await db.query(
        `insert into public.baux (organization_id, lot_id, locataire_principal, etat, loyer_hc, charges, jour_echeance, date_debut, date_fin)
         values ($1,$2,$3,'termine',650,50,1,current_date - 400, current_date + 30)`,
        [org, l, locataire]
      );
      const avant_fin = await brouillon(l, await jour("current_date + 10"));
      await enGerant();
      const erreur = await erreurDe(`select public.activer_bail($1)`, [avant_fin]);
      expect(erreur.message).toMatch(/bail précédent/);
      expect(erreur.message).toMatch(/date de fin prévue/);
      await db.query("reset role");
      await db.query(`update public.baux set date_debut = current_date + 30 where id = $1`, [avant_fin]);
      await enGerant();
      await db.query(`select public.activer_bail($1)`, [avant_fin]);
      expect((await etatDuBail(avant_fin)).etat).toBe("actif");
    });

    it("bail suivant : un bail précédent sans aucune date de fin ni sortie ne bloque rien", async () => {
      const l = await lotLouable();
      await db.query("reset role");
      await db.query(
        `insert into public.baux (organization_id, lot_id, locataire_principal, etat, loyer_hc, charges, jour_echeance, date_debut)
         values ($1,$2,$3,'termine',650,50,1,current_date - 400)`,
        [org, l, locataire]
      );
      const b = await brouillon(l, await jour("current_date - 30"));
      await enGerant();
      await db.query(`select public.activer_bail($1)`, [b]);
      expect((await etatDuBail(b)).etat).toBe("actif");
    });

    it("bail suivant : la sortie réelle prime sur la date de fin théorique du préavis (départ amiable, DEC2-01)", async () => {
      const { lot: l, bail: a } = await bailEnPreavis("current_date");
      const avant = await etatDuBail(a);
      expect(avant.date_fin > (await jour(AUJOURDHUI_PARIS))).toBe(true);
      await db.query(`select public.terminer_bail($1, null, true)`, [a]);
      // Le bail suivant entre aujourd'hui, bien avant la date de fin théorique du précédent
      const suivant = await brouillon(l, await jour(AUJOURDHUI_PARIS));
      await enGerant();
      await db.query(`select public.activer_bail($1)`, [suivant]);
      expect((await etatDuBail(suivant)).etat).toBe("actif");
    });

    it("colocation : seule la chambre du bail précédent est concernée", async () => {
      const l = await lotLouable();
      await db.query("reset role");
      await db.query("update public.lots set colocation_loyer_reference = 1000 where id = $1", [l]);
      const { rows: chambres } = await db.query(
        `insert into public.lot_chambres (organization_id, lot_id, nom, surface_m2, volume_m3, description, espaces_partages)
         values ($1,$2,'Jardin',12,30,'Chambre au calme','Cuisine, séjour'),
                ($1,$2,'Cour',10,25,'Chambre sur cour','Cuisine, séjour') returning id`,
        [org, l]
      );
      await db.query(
        `insert into public.baux (organization_id, lot_id, locataire_principal, etat, type, chambre_id, loyer_hc, charges, jour_echeance, date_debut, date_sortie_reelle, date_fin)
         values ($1,$2,$3,'termine','colocation',$4,450,50,1,current_date - 400, current_date + 20, current_date + 20)`,
        [org, l, locataire, chambres[0].id]
      );
      const memeChambre = await brouillon(l, await jour("current_date + 5"), chambres[0].id);
      const autreChambre = await brouillon(l, await jour("current_date + 5"), chambres[1].id);
      await enGerant();
      const erreur = await erreurDe(`select public.controler_mise_en_location($1)`, [memeChambre]);
      expect(erreur.message).toMatch(/bail précédent/);
      await db.query(`select public.controler_mise_en_location($1)`, [autreChambre]);
    });
  });

  // ------------------------------------------------------------------------
  // D35 (1) (SOR-02) — option A : une remise des clés n'est jamais datée d'après
  // aujourd'hui, et la correction reste ouverte tant que la restitution est « en
  // cours ». Le délai légal et les montants arrêtés ne changent pas.
  // ------------------------------------------------------------------------
  describe("D35 (1) — remise des clés : jamais dans le futur, corrigeable tant que la restitution est en cours", () => {
    const AUJOURDHUI_PARIS = "(now() at time zone 'Europe/Paris')::date";

    async function bailEnPreavis(): Promise<string> {
      return bail({ etat: "preavis", date_debut: await jour("current_date - 400"), date_fin: await jour("current_date + 60") });
    }

    async function restitution(b: string) {
      await db.query("reset role");
      const {
        rows: [r],
      } = await db.query(
        `select id, to_char(date_remise_cles,'YYYY-MM-DD') as remise, delai_mois, depot::text as depot,
                impayes::text as impayes, trop_percu::text as trop_percu, statut, montants_arretes_le::text as arrete
           from public.restitutions where bail_id = $1`,
        [b]
      );
      return r as {
        id: string; remise: string; delai_mois: number; depot: string; impayes: string;
        trop_percu: string; statut: string; arrete: string;
      };
    }

    it("une remise des clés datée de demain est refusée, avec un message clair", async () => {
      const b = await bailEnPreavis();
      await enGerant();
      const demain = await jour(`${AUJOURDHUI_PARIS} + 1`);
      const erreur = await erreurDe(`select public.demarrer_restitution($1, $2::date, false)`, [b, demain]);
      expect(erreur.message).toMatch(/remise des clés ne peut pas être datée après aujourd'hui/);
      expect(erreur.message).toContain(await jour(AUJOURDHUI_PARIS).then((d) => d.split("-").reverse().join("/")));
      expect(await restitution(b)).toBeUndefined();
    });

    it("la date d'aujourd'hui (Paris) et une date passée sont acceptées", async () => {
      const b = await bailEnPreavis();
      const c = await bailEnPreavis();
      await enGerant();
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS}, false)`, [b]);
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 20, true)`, [c]);
      expect((await restitution(b)).remise).toBe(await jour(AUJOURDHUI_PARIS));
      expect((await restitution(c)).delai_mois).toBe(1);
    });

    it("tant que la restitution est en cours, un nouvel envoi corrige la date et le délai, sans créer de seconde restitution", async () => {
      const b = await bailEnPreavis();
      await enGerant();
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 5, false)`, [b]);
      const avant = await restitution(b);
      expect(avant).toMatchObject({ statut: "en_cours", delai_mois: 2 });
      // Correction : la bonne date est plus ancienne, la sortie était conforme
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 12, true)`, [b]);
      const apres = await restitution(b);
      expect(apres.id).toBe(avant.id);
      expect(apres.remise).toBe(await jour(`${AUJOURDHUI_PARIS} - 12`));
      expect(apres.delai_mois).toBe(1);
      await db.query("reset role");
      const { rows } = await db.query(`select count(*)::int as n from public.restitutions where bail_id = $1`, [b]);
      expect(rows[0].n).toBe(1);
    });

    it("une correction de la date ne réarrête aucun montant : dépôt, impayés et date d'arrêté restent ceux du démarrage", async () => {
      const b = await bailEnPreavis();
      await enGerant();
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 5, false)`, [b]);
      const avant = await restitution(b);
      // Entre-temps la réalité bouge : un impayé de 700 €
      await db.query("reset role");
      await db.query(
        `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
         values ($1,$2,date_trunc('month', current_date - 40)::date,650,50,700,current_date - 40)`,
        [org, b]
      );
      const {
        rows: [reel],
      } = await db.query(`select impayes::text from public.montants_reels_bail($1)`, [b]);
      expect(Number(reel.impayes)).toBeGreaterThan(0);

      await enGerant();
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 8, false)`, [b]);
      const apres = await restitution(b);
      expect(apres.remise).toBe(await jour(`${AUJOURDHUI_PARIS} - 8`));
      expect({ depot: apres.depot, impayes: apres.impayes, trop_percu: apres.trop_percu, arrete: apres.arrete }).toEqual({
        depot: avant.depot, impayes: avant.impayes, trop_percu: avant.trop_percu, arrete: avant.arrete,
      });
    });

    it("la correction reste refusée une fois le décompte finalisé", async () => {
      const b = await bailEnPreavis();
      await enGerant();
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 5, false)`, [b]);
      const r = await restitution(b);
      await enGerant();
      await db.query(`select public.finaliser_decompte($1)`, [r.id]);
      await echec(/Restitution déjà finalisée/, `select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 6, false)`, [b]);
    });

    it("une correction vers une date future est refusée comme le premier envoi, la restitution reste intacte", async () => {
      const b = await bailEnPreavis();
      await enGerant();
      await db.query(`select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} - 5, false)`, [b]);
      const avant = await restitution(b);
      await echec(/ne peut pas être datée après aujourd'hui/, `select public.demarrer_restitution($1, ${AUJOURDHUI_PARIS} + 30, false)`, [b]);
      expect(await restitution(b)).toEqual(avant);
    });
  });
});
