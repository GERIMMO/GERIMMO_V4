/**
 * La fenêtre du lot (12/09) — ce que la base doit rendre, et à qui.
 *
 * CE QUE CES TESTS PROTÈGENT, ET POURQUOI AUCUN ŒIL NE LE VERRAIT.
 *
 * 1. **Le lot demandé, et pas un autre.** La première écriture de `fiche_lot`
 *    avait oublié `where l.id = p_lot` : elle rendait le premier lot venu du
 *    portefeuille, avec son locataire et son solde. À l'écran, une fiche
 *    plausible s'affichait — sous le bon titre, avec les mauvaises données.
 *    Un test qui se contenterait de « la fonction répond » ne l'aurait pas vu.
 *
 * 2. **Le portefeuille (RM-18.1.3).** Ces quatre fonctions sont SECURITY
 *    DEFINER : elles contournent le RLS, leur contrôle d'accès est entièrement
 *    à leur charge. L'appartenance à l'agence ne suffit pas — un agent restreint
 *    ne gère que les lots des mandats qui lui sont confiés, et la fenêtre porte
 *    le téléphone du locataire, l'e-mail du propriétaire et la comptabilité.
 *
 * 3. **Un seul chiffre d'impayé.** `fiche_lot` lit `etat_loyers_bail_brut`, la
 *    source que l'alerte d'impayé et l'échéancier du locataire utilisent déjà.
 *    Le jour où quelqu'un la remplacera par une somme d'écritures, deux
 *    chiffres différents diront la dette du même locataire.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("La fenêtre du lot", () => {
  let db: Client;
  let org: string;
  let patron: string; // admin_agence : tout le parc
  let agent: string; // agent restreint : son portefeuille seulement
  let mandant: string;
  let mandat: string;
  let lotConfie: string;
  let lotVoisin: string; // même mandat, même agent — le rapport les couvre tous deux
  let lotEtranger: string; // même agence, mandat d'un autre : hors portefeuille
  let bail: string;
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

  async function creerCompte(prefixe: string): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         $1||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`,
      [prefixe]
    );
    return id;
  }

  async function devenir(compte: string) {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [compte]
    );
    await db.query("set local role authenticated");
  }

  /** Retour au propriétaire de la base : les insertions du harnais. */
  async function redevenirService() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }

  /**
   * Un lot détenu par le mandant et confié au mandat.
   *
   * La détention n'est pas de la figuration : `mandat_lignes` refuse un lot que
   * le mandant ne détient pas (RM-5.1.1).
   */
  async function lotSousMandat(nom: string, leMandat: string, leMandant: string): Promise<string> {
    const {
      rows: [bien],
    } = await db.query<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,$2||' — immeuble','appartement'::public.bien_type,'3 rue des Lices','49000','Angers')
       returning id`,
      [org, nom]
    );
    const {
      rows: [l],
    } = await db.query<{ id: string }>(
      `insert into public.lots (organization_id, bien_id, nom, etat, surface_m2, pieces)
       values ($1,$2,$3,'loue'::public.lot_etat, 42, 2) returning id`,
      [org, bien.id, nom]
    );
    await db.query(
      `insert into public.detentions (organization_id, lot_id, person_id, quote_part)
       values ($1,$2,$3,100)`,
      [org, l.id, leMandant]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
       values ($1,$2,$3,7,current_date - 30)`,
      [org, leMandat, l.id]
    );
    return l.id;
  }

  /** Rattacher une personne à un compte, avec l'adhésion « locataire ». */
  async function brancherLocataire(personne: string): Promise<string> {
    const compte = await creerCompte("locataire");
    await db.query("update public.persons set account_id = $2 where id = $1", [personne, compte]);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role, status)
       values ($1,$2,'locataire','active')`,
      [compte, org]
    );
    return compte;
  }

  beforeEach(async () => {
    await db.query("begin");
    const {
      rows: [o],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (name, status, type)
       values ('Cabinet de la fenêtre','active'::public.organization_status,'agence'::public.organization_type)
       returning id`
    );
    org = o.id;
    patron = await creerCompte("patron");
    agent = await creerCompte("agent");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'), ($3,$2,'agent')`,
      [patron, org, agent]
    );

    const {
      rows: [m],
    } = await db.query<{ id: string }>(
      `insert into public.persons (organization_id, nom, prenom, email)
       values ($1,'Bailleur','Claire','claire@exemple.test') returning id`,
      [org]
    );
    mandant = m.id;
    const {
      rows: [md],
    } = await db.query<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id, date_rapport)
       values ($1,$2,'brouillon'::public.mandat_etat, current_date - 90, $3, 10) returning id`,
      [org, mandant, agent]
    );
    mandat = md.id;
    lotConfie = await lotSousMandat("Lot confié", mandat, mandant);
    lotVoisin = await lotSousMandat("Lot voisin", mandat, mandant);
    // Un mandat ne s'active qu'une fois composé (recette 23/08).
    await db.query("update public.mandats set etat='actif'::public.mandat_etat where id=$1", [
      mandat,
    ]);

    // Un second mandat, confié à PERSONNE : ses lots sont hors du portefeuille
    // de notre agent, tout en restant dans son agence.
    const {
      rows: [autreMandant],
    } = await db.query<{ id: string }>(
      "insert into public.persons (organization_id, nom) values ($1,'Autre bailleur') returning id",
      [org]
    );
    const {
      rows: [autreMandat],
    } = await db.query<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat, date_debut)
       values ($1,$2,'brouillon'::public.mandat_etat, current_date - 90) returning id`,
      [org, autreMandant.id]
    );
    lotEtranger = await lotSousMandat("Lot d'un autre", autreMandat.id, autreMandant.id);
    await db.query("update public.mandats set etat='actif'::public.mandat_etat where id=$1", [
      autreMandat.id,
    ]);

    // Le locataire du lot confié, joignable, et un terme échu impayé.
    const {
      rows: [p],
    } = await db.query<{ id: string }>(
      `insert into public.persons (organization_id, nom, prenom, email, telephone)
       values ($1,'Martin','Léa','lea@exemple.test','0612345678') returning id`,
      [org]
    );
    locataire = p.id;
    const {
      rows: [b],
    } = await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges,
         depot_garantie, date_debut, jour_echeance, locataire_principal)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,600,current_date - 120,5,$3)
       returning id`,
      [org, lotConfie, locataire]
    );
    bail = b.id;
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance, loyer_hc, charges, montant_du)
       values ($1,$2,date_trunc('month',current_date - interval '1 month')::date, current_date - 20, 600, 50, 650)`,
      [org, bail]
    );
    await db.query(
      `insert into public.ecritures (organization_id, lot_id, categorie, sens, montant,
         date_piece, date_imputation, libelle)
       values ($1,$2,'travaux','depense',120,current_date - 10,current_date - 10,'Robinetterie')`,
      [org, lotConfie]
    );
  });

  describe("La fiche rend LE lot demandé", () => {
    it("chaque lot rend son propre nom — pas le premier du portefeuille", async () => {
      await devenir(patron);
      const a = await db.query<{ lot_nom: string }>("select lot_nom from public.fiche_lot($1)", [
        lotConfie,
      ]);
      const b = await db.query<{ lot_nom: string }>("select lot_nom from public.fiche_lot($1)", [
        lotVoisin,
      ]);
      expect(a.rows[0]?.lot_nom).toBe("Lot confié");
      expect(b.rows[0]?.lot_nom).toBe("Lot voisin");
    });

    it("l'occupant, le mandant et le taux d'honoraires arrivent ensemble", async () => {
      await devenir(patron);
      const { rows } = await db.query<{
        locataire: string;
        locataire_telephone: string | null;
        mandant: string;
        taux_honoraires: string;
        loyer_hc: string;
      }>(
        "select locataire, locataire_telephone, mandant, taux_honoraires, loyer_hc from public.fiche_lot($1)",
        [lotConfie]
      );
      expect(rows[0].locataire).toBe("Léa Martin");
      expect(rows[0].locataire_telephone).toBe("0612345678");
      expect(rows[0].mandant).toBe("Claire Bailleur");
      expect(Number(rows[0].taux_honoraires)).toBe(7);
      expect(Number(rows[0].loyer_hc)).toBe(600);
    });

    it("un bail terminé retire le contact de l'occupant", async () => {
      await db.query("update public.baux set etat='termine'::public.bail_etat where id=$1", [bail]);
      await devenir(patron);
      const { rows } = await db.query<{
        locataire: string | null;
        locataire_email: string | null;
        locataire_telephone: string | null;
      }>(
        "select locataire, locataire_email, locataire_telephone from public.fiche_lot($1)",
        [lotConfie]
      );
      // Un bail terminé ne fait plus partie des baux joints : plus d'occupant
      // du tout, donc à plus forte raison plus de numéro de téléphone — on ne
      // laisse pas le téléphone de quelqu'un qui n'habite plus là.
      expect(rows[0].locataire_email).toBeNull();
      expect(rows[0].locataire_telephone).toBeNull();
    });
  });

  describe("Le solde dit la même chose que partout ailleurs", () => {
    it("l'impayé échu de la fiche est celui de l'échéancier du bail", async () => {
      await devenir(patron);
      const { rows: fiche } = await db.query<{ impaye_echu: string; termes_impayes: number }>(
        "select impaye_echu, termes_impayes from public.fiche_lot($1)",
        [lotConfie]
      );
      const { rows: echeancier } = await db.query<{ reste: string }>(
        `select coalesce(sum(montant_du - montant_couvert),0)::text as reste
           from public.etat_loyers_bail($1)
          where date_echeance < current_date and montant_du > montant_couvert`,
        [bail]
      );
      expect(Number(fiche[0].impaye_echu)).toBe(Number(echeancier[0].reste));
      expect(Number(fiche[0].impaye_echu)).toBe(650);
      expect(Number(fiche[0].termes_impayes)).toBe(1);
    });
  });

  describe("Le portefeuille de l'agent (RM-18.1.3)", () => {
    it("l'agent lit le lot qui lui est confié", async () => {
      await devenir(agent);
      const { rows } = await db.query("select lot_nom from public.fiche_lot($1)", [lotConfie]);
      expect(rows).toHaveLength(1);
    });

    it.each([
      ["fiche_lot", "select * from public.fiche_lot($1)"],
      ["documents_du_lot", "select * from public.documents_du_lot($1)"],
      ["comptabilite_du_lot", "select * from public.comptabilite_du_lot($1, null)"],
      ["rapport_du_lot", "select * from public.rapport_du_lot($1, null)"],
    ])("%s ne rend rien sur un lot hors du portefeuille", async (_nom, sql) => {
      await devenir(agent);
      const { rows } = await db.query(sql, [lotEtranger]);
      expect(rows).toHaveLength(0);
    });

    it("l'admin d'agence, lui, lit tout le parc", async () => {
      await devenir(patron);
      const { rows } = await db.query("select lot_nom from public.fiche_lot($1)", [lotEtranger]);
      expect(rows).toHaveLength(1);
    });

    it("un compte sans adhésion ne lit rien, même avec l'UUID du lot", async () => {
      const intrus = await creerCompte("intrus");
      await devenir(intrus);
      for (const sql of [
        "select * from public.fiche_lot($1)",
        "select * from public.documents_du_lot($1)",
        "select * from public.comptabilite_du_lot($1, null)",
        "select * from public.rapport_du_lot($1, null)",
      ]) {
        const { rows } = await db.query(sql, [lotConfie]);
        expect(rows, sql).toHaveLength(0);
      }
    });
  });

  describe("Les documents du lot, du bail et du mandat au même endroit", () => {
    async function deposer(entite: string, entiteId: string, titre: string) {
      const {
        rows: [d],
      } = await db.query<{ id: string }>(
        // Le contenu n'est pas décoratif : `documents_contenu_ou_purge` exige
        // qu'un document non purgé porte son fichier.
        `insert into public.documents (organization_id, type, titre,
           storage_path, mime_type, taille_octets, empreinte)
         values ($1,'autre'::public.document_type,$2,
           'test/'||gen_random_uuid()||'.pdf','application/pdf',1024,md5($2))
         returning id`,
        [org, titre]
      );
      await db.query(
        `insert into public.document_liens (organization_id, document_id, entite, entite_id)
         values ($1,$2,$3::public.entite_liee,$4)`,
        [org, d.id, entite, entiteId]
      );
    }

    it("les trois rattachements remontent, chacun nommé", async () => {
      await deposer("lot", lotConfie, "Plan du lot");
      await deposer("bail", bail, "Bail signé");
      await deposer("mandat", mandat, "Mandat de gestion");
      await devenir(agent);
      const { rows } = await db.query<{ titre: string; rattachement: string }>(
        "select titre, rattachement from public.documents_du_lot($1)",
        [lotConfie]
      );
      expect(rows.map((r) => r.rattachement).sort()).toEqual(["ce lot", "le bail", "le mandat"]);
    });

    it("un document purgé ne remonte plus", async () => {
      await deposer("lot", lotConfie, "Vieux devis");
      await db.query("update public.documents set purged_at = now() where titre = 'Vieux devis'");
      await devenir(agent);
      const { rows } = await db.query("select * from public.documents_du_lot($1)", [lotConfie]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("La comptabilité du lot", () => {
    it("une dépense se lit en négatif — une colonne, pas deux", async () => {
      await devenir(agent);
      const { rows } = await db.query<{ montant_signe: string; libelle: string }>(
        "select montant_signe, libelle from public.comptabilite_du_lot($1, null)",
        [lotConfie]
      );
      const depense = rows.find((r) => r.libelle === "Robinetterie");
      expect(Number(depense?.montant_signe)).toBe(-120);
    });

    it("les écritures d'un autre lot ne s'y mélangent pas", async () => {
      await devenir(agent);
      const { rows } = await db.query("select * from public.comptabilite_du_lot($1, null)", [
        lotVoisin,
      ]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("Le rapport vu depuis le lot", () => {
    it("dit combien de lots le mandat couvre — le rapport les couvre tous", async () => {
      await devenir(agent);
      const { rows } = await db.query<{ mandant: string; lots_du_mandat: number; mois: string }>(
        "select mandant, lots_du_mandat, mois from public.rapport_du_lot($1, null)",
        [lotConfie]
      );
      expect(rows[0].mandant).toBe("Claire Bailleur");
      // Deux lots au mandat : l'écran doit le dire AVANT le clic, sinon l'agent
      // croit envoyer le compte d'un seul lot.
      expect(Number(rows[0].lots_du_mandat)).toBe(2);
    });

    it("un lot sans mandat en cours n'a pas de rapport à rendre", async () => {
      await db.query("update public.mandat_lignes set date_fin = current_date - 1 where lot_id = $1", [
        lotConfie,
      ]);
      await devenir(patron);
      const { rows } = await db.query("select * from public.rapport_du_lot($1, null)", [lotConfie]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("La même fenêtre pour le locataire, à sa portée (12/09)", () => {
    it("il lit SON logement : le lot, son bail, ce qu'il doit", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows } = await db.query<{
        portee: string;
        lot_nom: string;
        loyer_hc: string;
        impaye_echu: string;
      }>("select portee, lot_nom, loyer_hc, impaye_echu from public.fiche_lot($1)", [lotConfie]);
      expect(rows).toHaveLength(1);
      expect(rows[0].portee).toBe("locataire");
      expect(rows[0].lot_nom).toBe("Lot confié");
      expect(Number(rows[0].loyer_hc)).toBe(600);
      // Sa dette est la sienne : il doit pouvoir la lire, c'est le chiffre qui
      // figure déjà sur son échéancier.
      expect(Number(rows[0].impaye_echu)).toBe(650);
    });

    it("le mandant, son e-mail et les honoraires de l'agence lui sont TUS", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows } = await db.query<{
        mandant: string | null;
        mandant_email: string | null;
        taux_honoraires: string | null;
        proprietaires: string | null;
        blocages: string[] | null;
      }>(
        `select mandant, mandant_email, taux_honoraires, proprietaires, blocages
           from public.fiche_lot($1)`,
        [lotConfie]
      );
      // Ce n'est pas l'écran qui masque : l'écran ne peut pas masquer ce qu'on
      // ne lui a pas donné.
      expect(rows[0].mandant).toBeNull();
      expect(rows[0].mandant_email).toBeNull();
      expect(rows[0].taux_honoraires).toBeNull();
      expect(rows[0].proprietaires).toBeNull();
      expect(rows[0].blocages).toBeNull();
    });

    it("le gérant, lui, garde tout — c'est la même fonction", async () => {
      await devenir(patron);
      const { rows } = await db.query<{ portee: string; mandant: string; proprietaires: string }>(
        "select portee, mandant, proprietaires from public.fiche_lot($1)",
        [lotConfie]
      );
      expect(rows[0].portee).toBe("gerant");
      expect(rows[0].mandant).toBe("Claire Bailleur");
      expect(rows[0].proprietaires).toContain("Claire Bailleur");
    });

    it("un locataire ne lit pas le lot du voisin", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows } = await db.query("select * from public.fiche_lot($1)", [lotVoisin]);
      expect(rows).toHaveLength(0);
    });

    it("il ne lit ni la comptabilité ni le rapport du lot", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      for (const sql of [
        "select * from public.comptabilite_du_lot($1, null)",
        "select * from public.rapport_du_lot($1, null)",
      ]) {
        const { rows } = await db.query(sql, [lotConfie]);
        expect(rows, sql).toHaveLength(0);
      }
    });

    it("les documents du mandat ne lui remontent pas", async () => {
      const {
        rows: [d],
      } = await db.query<{ id: string }>(
        `insert into public.documents (organization_id, type, titre,
           storage_path, mime_type, taille_octets, empreinte)
         values ($1,'autre'::public.document_type,'Mandat de gestion',
           'test/mandat.pdf','application/pdf',1024,md5('m')) returning id`,
        [org]
      );
      await db.query(
        `insert into public.document_liens (organization_id, document_id, entite, entite_id)
         values ($1,$2,'mandat'::public.entite_liee,$3)`,
        [org, d.id, mandat]
      );
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows } = await db.query<{ titre: string }>(
        "select titre from public.documents_du_lot($1)",
        [lotConfie]
      );
      expect(rows.map((r) => r.titre)).not.toContain("Mandat de gestion");
    });
  });

  describe("Le locataire et son agence lisent la MÊME dette (12/09)", () => {
    /**
     * CE QUE CE TEST PROTÈGE — et ce qu'aucun autre ne protégeait.
     *
     * Constaté au navigateur le 12/09 : « Mes paiements » annonçait à un
     * locataire qui devait 400 € « Tous vos loyers sont à jour — rien à régler
     * pour l'instant », pendant que l'agence voyait l'impayé et que la relance
     * partait. `mon_echeancier_locataire` chaînait `etat_loyers_bail`, à qui la
     * migration du 10/09 avait ajouté une garde de GÉRANT : la jointure
     * latérale ne rendait plus rien, pour tous les locataires, depuis deux
     * jours. « Zéro terme » ressemble trait pour trait à « aucun loyer appelé »
     * — c'est pourquoi personne ne l'a vu.
     */
    it("l'échéancier du locataire n'est pas vide quand il doit de l'argent", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows } = await db.query<{ periode: string; montant_du: string; statut: string }>(
        "select periode, montant_du, statut from public.mon_echeancier_locataire($1)",
        [org]
      );
      expect(rows.length, "un locataire avec un terme appelé a un échéancier").toBeGreaterThan(0);
      expect(Number(rows[0].montant_du)).toBe(650);
    });

    it("son reste dû est au centime celui que lit son agence", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows: sien } = await db.query<{ reste: string }>(
        `select coalesce(sum(montant_du - montant_couvert),0)::text as reste
           from public.mon_echeancier_locataire($1)
          where montant_du > montant_couvert`,
        [org]
      );
      await devenir(patron);
      const { rows: agence } = await db.query<{ impaye_echu: string }>(
        "select impaye_echu from public.fiche_lot($1)",
        [lotConfie]
      );
      expect(Number(sien[0].reste)).toBe(Number(agence[0].impaye_echu));
      expect(Number(sien[0].reste)).toBe(650);
    });

    it("il ne lit PAS l'échéancier d'une autre agence", async () => {
      const compte = await brancherLocataire(locataire);
      await devenir(compte);
      const { rows } = await db.query(
        "select * from public.mon_echeancier_locataire(gen_random_uuid())"
      );
      expect(rows).toHaveLength(0);
    });

    it("un compte sans adhésion locataire n'en lit aucun", async () => {
      const intrus = await creerCompte("intrus");
      await devenir(intrus);
      const { rows } = await db.query("select * from public.mon_echeancier_locataire($1)", [org]);
      expect(rows).toHaveLength(0);
    });
  });

  describe("Aucune de ces fonctions n'est ouverte à anon", () => {
    it.each([
      "fiche_lot(uuid)",
      "documents_du_lot(uuid)",
      "comptabilite_du_lot(uuid, date)",
      "rapport_du_lot(uuid, date)",
    ])("%s est fermée à anon et à public", async (signature) => {
      await redevenirService();
      const { rows } = await db.query<{ anon: boolean; pub: boolean }>(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('public', $1, 'EXECUTE') as pub`,
        [`public.${signature}`]
      );
      expect(rows[0].anon).toBe(false);
      expect(rows[0].pub).toBe(false);
    });
  });
});
