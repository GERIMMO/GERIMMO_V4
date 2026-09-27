/**
 * Audit de l'espace agence du 27/09 — les corrections, éprouvées en base.
 *
 * 1. La machine à états du bail est verrouillée EN BASE (RM-1.7.1, RM-A5.1) :
 *    un client de l'API ne crée plus un bail « actif », ne change plus l'état
 *    d'un bail et ne modifie plus un bail signé ; les fonctions (congé…) le
 *    peuvent toujours.
 * 2. La cloison du portefeuille agent (RM-18.1.3) couvre les tables restées
 *    ouvertes (pièces de lot, appels de charges, pièces demandées…) et le
 *    tableau du mois (`quittancement_mois`), qui l'avait perdue le 11/09.
 * 3. « Annuler l'écriture » refuse les écritures nées d'un encaissement et
 *    les annulations elles-mêmes.
 * 4. Un justificatif refusé ne reste plus en GED (congé, régularisation).
 * 5. L'admin invite un agent ; un mandat ne se confie qu'à un membre de
 *    l'agence et prend sa date de début au passage en « actif ».
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { annulationHorsJournal } from "../src/lib/ecritures";
import { estUuid } from "../src/lib/identifiants";
import { corpsQuittance, echapperHtml } from "../src/lib/quittance-email";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe("Audit agence 27/09 — règles d'écran", () => {
  it("« Annuler l'écriture » n'est proposé que sur une écriture libre", () => {
    expect(annulationHorsJournal({ systeme: false, contre_ecriture_de: null })).toBeNull();
    expect(
      annulationHorsJournal({ systeme: true, contre_ecriture_de: null, encaissement_id: "e" })
    ).toContain("encaissement");
    expect(
      annulationHorsJournal({ systeme: false, contre_ecriture_de: null, depot_encaissement_id: "d" })
    ).toContain("dépôt");
    expect(annulationHorsJournal({ systeme: false, contre_ecriture_de: "x" })).toBe("annulation");
    expect(annulationHorsJournal({ systeme: true, contre_ecriture_de: null })).not.toBeNull();
  });

  it("un identifiant d'URL qui n'est pas un UUID ne désigne rien", () => {
    expect(estUuid("nimporte")).toBe(false);
    expect(estUuid("8d0ec14e-78e9-4de5-a53e-5559aad0c1bf")).toBe(true);
    expect(estUuid(undefined)).toBe(false);
  });

  it("les valeurs saisies sont échappées dans l'e-mail de quittance", () => {
    expect(echapperHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    const html = corpsQuittance({
      estQuittance: true,
      periode: "2026-09-01",
      loyerHc: 600,
      charges: 50,
      montant: 650,
      emetteur: "<b>Agence</b>",
      prenom: "<script>x</script>",
      lien: "https://exemple.test/quittance/1",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Agence</b>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe.skipIf(!DB_URL)("Audit agence 27/09 — en base", () => {
  let db: Client;
  let org: string;
  let admin: string;
  let agent: string;
  let lotA: string; // sous mandat, confié à l'agent
  let lotB: string; // hors de son portefeuille
  let mandant: string;
  let locataireA: string;
  let locataireB: string;
  let bailA: string;
  let bailB: string;

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

  async function compte(prefixe: string): Promise<string> {
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

  async function devenir(compteId: string) {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [compteId]
    );
    await db.query("set local role authenticated");
  }

  async function proprietaire() {
    await db.query("reset role");
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }

  async function refuse(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint refus");
    await expect(db.query(sql, params)).rejects.toThrow(motif);
    await db.query("rollback to savepoint refus");
  }

  async function lot(nom: string): Promise<string> {
    const {
      rows: [bien],
    } = await db.query<{ id: string }>(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,$2,'appartement'::public.bien_type,'1 rue du Test','75001','Paris') returning id`,
      [org, `Immeuble ${nom}`]
    );
    const {
      rows: [l],
    } = await db.query<{ id: string }>(
      `insert into public.lots (organization_id, bien_id, nom, etat) values ($1,$2,$3,'loue') returning id`,
      [org, bien.id, nom]
    );
    await db.query(
      `insert into public.detentions (organization_id, lot_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [org, l.id, mandant]
    );
    return l.id;
  }

  async function personne(nom: string, prenom: string | null = null): Promise<string> {
    const {
      rows: [p],
    } = await db.query<{ id: string }>(
      `insert into public.persons (organization_id, nom, prenom) values ($1,$2,$3) returning id`,
      [org, nom, prenom]
    );
    return p.id;
  }

  async function bailActif(lotId: string, locataire: string): Promise<string> {
    const {
      rows: [b],
    } = await db.query<{ id: string }>(
      `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges,
         depot_garantie, date_debut, etat)
       values ($1,$2,$3,650,50,650,(date_trunc('month', current_date) - interval '2 months')::date,'actif')
       returning id`,
      [org, lotId, locataire]
    );
    return b.id;
  }

  beforeEach(async () => {
    await db.query("begin");
    await proprietaire();
    const {
      rows: [o],
    } = await db.query<{ id: string }>(
      `insert into public.organizations (tarification_version,name, status, type)
       values ('historique','Agence de l''audit 27/09','active','agence') returning id`
    );
    org = o.id;
    admin = await compte("admin");
    agent = await compte("agent");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$3,'admin_agence'), ($2,$3,'agent')`,
      [admin, agent, org]
    );
    mandant = await personne("Bailleur");
    locataireA = await personne("Durand", "Alice");
    locataireB = await personne("Martin", "Bruno");
    lotA = await lot("Lot A");
    lotB = await lot("Lot B");
    const {
      rows: [m],
    } = await db.query<{ id: string }>(
      `insert into public.mandats (organization_id, person_id, etat, date_debut, agent_account_id)
       values ($1,$2,'brouillon',current_date - 90,$3) returning id`,
      [org, mandant, agent]
    );
    await db.query(
      `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
       values ($1,$2,$3,7,current_date - 90)`,
      [org, m.id, lotA]
    );
    await db.query(`update public.mandats set etat='actif' where id=$1`, [m.id]);
    bailA = await bailActif(lotA, locataireA);
    bailB = await bailActif(lotB, locataireB);
  });

  describe("1. Le bail ne change d'état que par ses gestes", () => {
    it("un bail ne se crée pas « actif » par l'API", async () => {
      await devenir(admin);
      await refuse(
        /Un bail se crée en brouillon/,
        `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, date_debut, etat)
         values ($1,$2,$3,500,current_date,'actif')`,
        [org, lotB, locataireB]
      );
    });

    it("un brouillon ne passe pas « actif » par écriture directe, même complet (RM-1.7.1)", async () => {
      await devenir(admin);
      const {
        rows: [b],
      } = await db.query<{ id: string }>(
        `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, charges, depot_garantie, date_debut)
         values ($1,$2,$3,500,20,500,current_date + 30) returning id`,
        [org, lotB, locataireB]
      );
      await refuse(/ne change que par ses gestes/, `update public.baux set etat='actif' where id=$1`, [b.id]);
      const { rows } = await db.query(`select etat, document_signe from public.baux where id=$1`, [b.id]);
      expect(rows[0]).toMatchObject({ etat: "brouillon", document_signe: null });
    });

    it("un bail actif ne revient pas en brouillon sans `devalider_bail`", async () => {
      await devenir(admin);
      await refuse(/ne change que par ses gestes/, `update public.baux set etat='brouillon' where id=$1`, [bailA]);
    });

    it("le loyer, les charges et le dépôt d'un bail actif sont figés — l'agent comme l'admin", async () => {
      for (const qui of [admin, agent]) {
        await devenir(qui);
        await refuse(/contenu est figé \(loyer_hc\)/, `update public.baux set loyer_hc=900 where id=$1`, [bailA]);
        await refuse(/contenu est figé \(charges\)/, `update public.baux set charges=80 where id=$1`, [bailA]);
        await refuse(/contenu est figé/, `update public.baux set irl_valeur=130 where id=$1`, [bailA]);
      }
      await proprietaire();
      const { rows } = await db.query(`select loyer_hc from public.baux where id=$1`, [bailA]);
      expect(Number(rows[0].loyer_hc)).toBe(650);
    });

    it("GESTES LÉGITIMES : le suivi d'envoi s'écrit, le congé fait passer en préavis", async () => {
      await devenir(admin);
      await db.query(`update public.baux set signe_envoye_le = now() where id=$1`, [bailA]);
      await db.query(
        `select public.enregistrer_conge($1,'locataire'::public.conge_par,current_date,3::smallint)`,
        [bailA]
      );
      const { rows } = await db.query(`select etat from public.baux where id=$1`, [bailA]);
      expect(rows[0].etat).toBe("preavis");
    });
  });

  describe("2. La cloison du portefeuille agent", () => {
    it("l'agent n'ajoute ni pièce ni appel de charges sur un lot hors de son portefeuille", async () => {
      await devenir(agent);
      await refuse(
        /hors de votre portefeuille/,
        `insert into public.lot_pieces (lot_id, organization_id, nom, ordre) values ($1,$2,'Pièce',9)`,
        [lotB, org]
      );
      await refuse(
        /hors de votre portefeuille/,
        `insert into public.appels_charges (organization_id, lot_id, exercice, date_reception, total)
         values ($1,$2,2026,current_date,1000)`,
        [org, lotB]
      );
      // Son propre lot, lui, s'équipe toujours.
      await db.query(
        `insert into public.lot_pieces (lot_id, organization_id, nom, ordre) values ($1,$2,'Pièce',9)`,
        [lotA, org]
      );
    });

    it("l'agent ne lit plus les pièces demandées, intentions de congé ni appels de charges des autres", async () => {
      await proprietaire();
      await db.query(
        `insert into public.pieces_demandees (organization_id, person_id, type, libelle)
         values ($1,$2,'attestation_assurance','Attestation')`,
        [org, locataireB]
      );
      await db.query(
        `insert into public.intentions_conge (organization_id, bail_id, person_id) values ($1,$2,$3)`,
        [org, bailB, locataireB]
      );
      await db.query(
        `insert into public.appels_charges (organization_id, lot_id, exercice, date_reception, total)
         values ($1,$2,2026,current_date,1000)`,
        [org, lotB]
      );
      const compter = async () => {
        const { rows } = await db.query(
          `select (select count(*) from public.pieces_demandees where organization_id=$1)::int as pieces,
                  (select count(*) from public.intentions_conge where organization_id=$1)::int as intentions,
                  (select count(*) from public.appels_charges where organization_id=$1)::int as appels`,
          [org]
        );
        return rows[0];
      };
      await devenir(agent);
      expect(await compter()).toEqual({ pieces: 0, intentions: 0, appels: 0 });
      await devenir(admin);
      expect(await compter()).toEqual({ pieces: 1, intentions: 1, appels: 1 });
    });

    it("le tableau du mois ne livre à l'agent que ses baux, nommés « Nom Prénom »", async () => {
      await devenir(admin);
      await db.query(`select public.generer_appels_loyer($1)`, [bailA]);
      await db.query(`select public.generer_appels_loyer($1)`, [bailB]);
      await devenir(agent);
      const { rows: vusAgent } = await db.query(
        `select lot_id, locataire from public.quittancement_mois($1, current_date)`,
        [org]
      );
      expect(vusAgent.map((r) => r.lot_id)).toEqual([lotA]);
      expect(vusAgent[0].locataire).toBe("Durand Alice");
      await devenir(admin);
      const { rows: vusAdmin } = await db.query(
        `select lot_id from public.quittancement_mois($1, current_date)`,
        [org]
      );
      expect(vusAdmin).toHaveLength(2);
    });
  });

  describe("3. « Annuler l'écriture » ne désaccorde plus le journal des loyers", () => {
    it("refuse l'écriture née d'un encaissement, par la fonction comme par l'INSERT direct", async () => {
      await devenir(admin);
      const {
        rows: [enc],
      } = await db.query<{ id: string }>(
        `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
         values ($1,$2,300,current_date,'virement') returning id`,
        [org, bailA]
      );
      const {
        rows: [loyer],
      } = await db.query<{ id: string }>(
        `select id from public.ecritures where encaissement_id=$1 and categorie='loyer'`,
        [enc.id]
      );
      await refuse(/vient d'un encaissement/, `select public.contre_ecriture($1,'test')`, [loyer.id]);
      await refuse(
        /vient d'un encaissement/,
        `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
           date_imputation, libelle, contre_ecriture_de, motif)
         values ($1,'loyer','depense',300,current_date,current_date,'Forgée',$2,'motif')`,
        [org, loyer.id]
      );
      // L'encaissement reste entier : rien n'a bougé au journal.
      const { rows } = await db.query(
        `select count(*)::int as n from public.ecritures where contre_ecriture_de=$1`,
        [loyer.id]
      );
      expect(rows[0].n).toBe(0);
    });

    it("une écriture libre s'annule, mais son annulation ne s'annule pas", async () => {
      await devenir(admin);
      const {
        rows: [e],
      } = await db.query<{ id: string }>(
        `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece, date_imputation, libelle)
         values ($1,'divers','depense',42,current_date,current_date,'Saisie') returning id`,
        [org]
      );
      const {
        rows: [{ contre }],
      } = await db.query(`select public.contre_ecriture($1,'Erreur de saisie') as contre`, [e.id]);
      await refuse(/déjà une annulation/, `select public.contre_ecriture($1,'annule l''annulation')`, [contre]);
    });
  });

  describe("4. Un refus ne laisse pas de pièce orpheline en GED", () => {
    const empreinte = "a".repeat(64);
    const chemin = () => `${org}/justificatif-test.pdf`;

    it("congé refusé : aucune fiche ; le même fichier passe ensuite", async () => {
      await devenir(admin);
      const {
        rows: [brouillon],
      } = await db.query<{ id: string }>(
        `insert into public.baux (organization_id, lot_id, locataire_principal, loyer_hc, date_debut)
         values ($1,$2,$3,500,current_date) returning id`,
        [org, lotB, locataireB]
      );
      const appel = (bail: string) =>
        db.query(
          `select public.enregistrer_conge_avec_justificatif($1,'locataire'::public.conge_par,
             current_date,1::smallint,'Mutation',$2,'application/pdf',1234,$3)`,
          [bail, chemin(), empreinte]
        );
      await db.query("savepoint refus");
      await expect(appel(brouillon.id)).rejects.toThrow();
      await db.query("rollback to savepoint refus");
      const { rows: apresRefus } = await db.query(
        `select count(*)::int as n from public.documents where organization_id=$1 and empreinte=$2`,
        [org, empreinte]
      );
      expect(apresRefus[0].n).toBe(0);

      // Le nouvel essai, sur le bon bail et avec le MÊME fichier, aboutit.
      await appel(bailA);
      const { rows } = await db.query(
        `select c.justificatif_document is not null as justifie, d.titre
           from public.conges c join public.documents d on d.id = c.justificatif_document
          where c.bail_id=$1`,
        [bailA]
      );
      expect(rows[0]).toMatchObject({ justifie: true, titre: "Justificatif de préavis réduit" });
    });

    it("régularisation refusée : aucune fiche", async () => {
      await devenir(admin);
      await db.query("savepoint refus");
      await expect(
        db.query(
          `select public.regulariser_charges_avec_justificatif($1,2000,100,null,$2,'application/pdf',1234,$3)`,
          [bailA, chemin(), empreinte]
        )
      ).rejects.toThrow();
      await db.query("rollback to savepoint refus");
      const { rows } = await db.query(
        `select count(*)::int as n from public.documents where organization_id=$1 and empreinte=$2`,
        [org, empreinte]
      );
      expect(rows[0].n).toBe(0);
    });
  });

  describe("5. Équipe et mandats", () => {
    it("l'admin invite un agent ; un agent ne le peut pas ; pas deux fois", async () => {
      await devenir(agent);
      await refuse(/Réservé à l'admin/, `select * from public.inviter_agent($1,'recrue@test.local')`, [org]);
      await devenir(admin);
      const { rows } = await db.query(
        `select * from public.inviter_agent($1,' Recrue-27-09@Test.local ')`,
        [org]
      );
      expect(rows[0]).toMatchObject({ email: "recrue-27-09@test.local", compte_deja_existant: false });
      await refuse(/fait déjà partie/, `select * from public.inviter_agent($1,'recrue-27-09@test.local')`, [org]);
      await proprietaire();
      const { rows: adhesions } = await db.query(
        `select m.role, m.status from public.memberships m join public.accounts a on a.id = m.account_id
          where a.email = 'recrue-27-09@test.local' and m.organization_id = $1`,
        [org]
      );
      expect(adhesions).toEqual([{ role: "agent", status: "active" }]);
    });

    it("un mandat ne se confie pas au compte d'une autre organisation", async () => {
      await proprietaire();
      const etranger = await compte("etranger");
      const {
        rows: [autre],
      } = await db.query<{ id: string }>(
        `insert into public.organizations (tarification_version,name, status, type) values ('historique','Agence Beta','active','agence') returning id`
      );
      await db.query(
        `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
        [etranger, autre.id]
      );
      await devenir(admin);
      await refuse(
        /ce compte n'en fait pas partie/,
        `update public.mandats set agent_account_id=$1 where organization_id=$2`,
        [etranger, org]
      );
      // À un membre de l'agence, oui.
      await db.query(`update public.mandats set agent_account_id=$1 where organization_id=$2`, [admin, org]);
    });

    it("un mandat qui passe « actif » sans date de début prend le jour de ce passage", async () => {
      await devenir(admin);
      const {
        rows: [m],
      } = await db.query<{ id: string }>(
        `insert into public.mandats (organization_id, person_id, etat) values ($1,$2,'brouillon') returning id`,
        [org, mandant]
      );
      await db.query(
        `insert into public.mandat_lignes (organization_id, mandat_id, lot_id, taux_honoraires, date_debut)
         values ($1,$2,$3,7,current_date)`,
        [org, m.id, lotB]
      );
      await db.query(`update public.mandats set etat='a_signer' where id=$1`, [m.id]);
      await db.query(`update public.mandats set etat='actif' where id=$1`, [m.id]);
      const { rows } = await db.query(
        `select date_debut = current_date as aujourdhui from public.mandats where id=$1`,
        [m.id]
      );
      expect(rows[0].aujourdhui).toBe(true);
    });
  });
});
