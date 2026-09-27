/**
 * Audit ARTISAN / PAGES PUBLIQUES / COMPTE du 27/09 — les gardes de la BASE.
 *
 * Un cas par correction, chacun nommé d'après le constat qu'il ferme :
 *  1. la réclamation d'une fiche artisan exige une preuve (bloquant n° 1 —
 *     rejoue aap-reclame.sql : un locataire prenait la fiche par son SIRET) ;
 *  2. le PDF d'un devis se dépose sans mission en cours (ged_insert_artisan) ;
 *  3. la contre-proposition du locataire arrive à l'artisan, qui la confirme
 *     ou la refuse vers l'arbitrage (wiki : Planification d'intervention, A5) ;
 *  4. la facture de l'artisan (wiki : Devis, module 9.7), écart justifié et
 *     alerté sans blocage ;
 *  5. le formulaire public de devis a une limite de débit en base.
 *
 * Tout se joue dans une transaction annulée. Nécessite SUPABASE_DB_URL.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit du 27/09 — artisan, pages publiques", () => {
  let db: Client;
  let orgA = "", orgB = "", orgC = "";
  let gerantA = "", cptLoc = "", cptArtisan = "";
  let artisan = "", incidentA = "", intervention = "";
  let sollicitationB = "";

  const role = (r: string) => db.query(r === "reset" ? "reset role" : `set local role ${r}`);
  const agir = async (compte: string) => {
    await role("reset");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated')::text, true)`,
      [compte]
    );
    await role("authenticated");
  };
  const enTantQuePostgres = () => role("reset");
  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  };

  async function nouveauCompte(email: string, confirme = true): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1, 'x', case when $2 then now() end,
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`,
      [email, confirme]
    );
    return rows[0].id as string;
  }
  const unique = () => Math.random().toString(36).slice(2, 10);

  async function parc(org: string, compte: string) {
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
      [org]
    );
    const { rows: [lot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat)
       values ($1,$2,'Lot 1','loue') returning id`,
      [bien.id, org]
    );
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`,
      [org, compte]
    );
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat,
         date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
      [org, lot.id, personne.id]
    );
    const { rows: [incident] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id,
         declarant_person_id, canal, categorie, description, etat, imputation,
         imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire',
         'Joint usé par le temps') returning id`,
      [org, lot.id, bail.id, personne.id]
    );
    return incident.id as string;
  }

  /** Consultation + sollicitation, au statut voulu, posées en base directement. */
  async function sollicitation(org: string, incident: string, statut: string) {
    const { rows: [c] } = await db.query(
      `insert into public.incident_consultations (organization_id, incident_id, metier,
         nature_travaux)
       values ($1,$2,'plomberie','entretien_courant') returning id`,
      [org, incident]
    );
    const { rows: [s] } = await db.query(
      `insert into public.incident_sollicitations (organization_id, consultation_id,
         incident_id, artisan_id, statut)
       values ($1,$2,$3,$4,$5) returning id`,
      [org, c.id, incident, artisan, statut]
    );
    return s.id as string;
  }

  const demain = (jours: number, heure: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + jours);
    d.setUTCHours(heure, 0, 0, 0);
    return d.toISOString();
  };
  const trois = (decalage: number) =>
    JSON.stringify([1, 2, 3].map((j) => ({
      debut: demain(j + decalage, 8),
      fin: demain(j + decalage, 10),
    })));

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (tarification_version,name, status)
       values ('historique','Audit27 — A','active'), ('historique','Audit27 — B','active'), ('historique','Audit27 — C','active')
       returning id, name`
    );
    orgA = orgs.find((o) => o.name.endsWith("A")).id;
    orgB = orgs.find((o) => o.name.endsWith("B")).id;
    orgC = orgs.find((o) => o.name.endsWith("C")).id;

    gerantA = await nouveauCompte(`gerant-${unique()}@test.local`);
    cptLoc = await nouveauCompte(`loc-${unique()}@test.local`);
    const cptLocB = await nouveauCompte(`locb-${unique()}@test.local`);
    cptArtisan = await nouveauCompte(`artisan-${unique()}@test.local`);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
        ($1,$2,'admin_agence'),($3,$2,'locataire'),($4,$5,'locataire')`,
      [gerantA, orgA, cptLoc, cptLocB, orgB]
    );
    incidentA = await parc(orgA, cptLoc);
    const incidentB = await parc(orgB, cptLocB);

    // L'artisan qui travaille : fiche validée, rattachée à son compte.
    const { rows: [a] } = await db.query(
      `insert into public.artisans (account_id, raison_sociale, siret, telephone,
         statut_plateforme, siret_etat)
       values ($1,'Plomberie Audit','55555555500055','0611111111','valide','verifie')
       returning id`,
      [cptArtisan]
    );
    artisan = a.id;

    // Sa mission chez A : devis retenu 1 000 €, mission acceptée.
    const sA = await sollicitation(orgA, incidentA, "retenue");
    const { rows: [devis] } = await db.query(
      `insert into public.incident_devis (organization_id, sollicitation_id, incident_id,
         artisan_id, montant_ttc_cents, description, valide_jusqu_au, statut)
       values ($1,$2,$3,$4,100000,'Remplacement du joint', current_date + 30, 'retenu')
       returning id`,
      [orgA, sA, incidentA, artisan]
    );
    const { rows: [iv] } = await db.query(
      `insert into public.incident_interventions (organization_id, incident_id, artisan_id,
         devis_id, nature_travaux, statut, acceptee_le)
       values ($1,$2,$3,$4,'entretien_courant','acceptee', now()) returning id`,
      [orgA, incidentA, artisan, devis.id]
    );
    intervention = iv.id;

    // Chez B : une simple demande de devis, AUCUNE mission.
    sollicitationB = await sollicitation(orgB, incidentB, "envoyee");
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  // ── 1. Réclamation d'une fiche ─────────────────────────────────────────
  describe("réclamer une fiche créée par une agence", () => {
    let fiche = "";
    let titulaire = "";
    const emailFiche = `contact-${Math.random().toString(36).slice(2, 8)}@plombier.test`;

    beforeAll(async () => {
      await agir(gerantA);
      const { rows: [{ artisan_creer_ou_rattacher: id }] } = await db.query(
        `select public.artisan_creer_ou_rattacher($1,'E2E Plomberie Dubois','48291763500017',
           '0612345678', $2, array['plomberie']::public.artisan_metier[], array['75011'])`,
        [orgA, emailFiche]
      );
      fiche = id;
      await enTantQuePostgres();
      // Validée par la supervision avant toute réclamation (le cas de l'audit).
      await db.query(
        `update public.artisans set statut_plateforme='valide', siret_etat='verifie' where id=$1`,
        [fiche]
      );
    });

    const inscrire = () =>
      essai(
        `select public.inscrire_mon_entreprise_artisan('Nimporte','48291763500017',
           '0700000000','pirate@exemple.fr', array['plomberie']::public.artisan_metier[],
           array[]::text[])`
      );

    it("aap-reclame.sql : un locataire ne prend plus la fiche par son seul SIRET", async () => {
      await agir(cptLoc);
      await expect(inscrire()).rejects.toThrow(/ne peut pas être inscrit depuis ce compte/);
      await enTantQuePostgres();
      const { rows } = await db.query(
        `select account_id, telephone, email from public.artisans where id=$1`, [fiche]
      );
      expect(rows[0]).toEqual({ account_id: null, telephone: "0612345678", email: emailFiche });
    });

    it("la même adresse, mais NON confirmée, ne suffit pas", async () => {
      await enTantQuePostgres();
      titulaire = await nouveauCompte(emailFiche, false);
      await agir(titulaire);
      await expect(inscrire()).rejects.toThrow(/ne peut pas être inscrit depuis ce compte/);
    });

    it("l'adresse confirmée de la fiche la réclame, sans en réécrire les coordonnées, et la renvoie en validation", async () => {
      await enTantQuePostgres();
      // Le même compte, une fois l'adresse confirmée.
      await db.query(`update auth.users set email_confirmed_at = now() where id=$1`, [titulaire]);
      await agir(titulaire);
      await db.query("savepoint reclamation");
      await inscrire();
      await enTantQuePostgres();
      const { rows } = await db.query(
        `select account_id, telephone, email, statut_plateforme, raison_sociale
           from public.artisans where id=$1`,
        [fiche]
      );
      expect(rows[0].account_id).toBe(titulaire);
      expect(rows[0].telephone).toBe("0612345678");
      expect(rows[0].email).toBe(emailFiche);
      expect(rows[0].raison_sociale).toBe("E2E Plomberie Dubois");
      expect(rows[0].statut_plateforme).toBe("en_attente");
      await db.query("rollback to savepoint reclamation");
    });

    it("une fiche déjà réclamée répond le même message qu'une adresse différente", async () => {
      await agir(cptLoc);
      await expect(
        essai(
          `select public.inscrire_mon_entreprise_artisan('X','55555555500055','0700000000',
             null, array['plomberie']::public.artisan_metier[], array[]::text[])`
        )
      ).rejects.toThrow(/ne peut pas être inscrit depuis ce compte/);
    });
  });

  // ── 2. Stockage du devis ───────────────────────────────────────────────
  it("le PDF d'un devis se dépose chez une agence où l'artisan n'a qu'une demande de devis", async () => {
    await agir(cptArtisan);
    await essai(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [
      `${orgB}/devis-${unique()}.pdf`,
    ]);
    // …mais pas chez une agence qui ne lui a rien demandé.
    await expect(
      essai(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [
        `${orgC}/devis-${unique()}.pdf`,
      ])
    ).rejects.toThrow(/row-level security/);
    // Et plus chez B une fois la demande déclinée.
    await enTantQuePostgres();
    await db.query("savepoint decline");
    await db.query(`update public.incident_sollicitations set statut='declinee' where id=$1`, [
      sollicitationB,
    ]);
    await agir(cptArtisan);
    await expect(
      essai(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [
        `${orgB}/devis-${unique()}.pdf`,
      ])
    ).rejects.toThrow(/row-level security/);
    await enTantQuePostgres();
    await db.query("rollback to savepoint decline");
  });

  // ── 3. Créneaux ────────────────────────────────────────────────────────
  describe("la contre-proposition du locataire", () => {
    beforeAll(async () => {
      await agir(cptArtisan);
      await db.query(`select public.proposer_creneaux($1, $2::jsonb)`, [intervention, trois(0)]);
      await agir(cptLoc);
      await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`, [
        orgA,
        intervention,
        trois(10),
      ]);
    });

    it("l'artisan voit les dates du locataire (et les siennes quand il en a)", async () => {
      await agir(cptArtisan);
      const { rows } = await db.query(`select * from public.mes_creneaux_artisan($1)`, [
        intervention,
      ]);
      expect(rows.filter((r) => r.propose_par === "locataire")).toHaveLength(3);
      const { rows: agenda } = await db.query(
        `select dates_locataire_en_attente, creneaux_en_attente from public.mon_agenda_artisan()
          where intervention_id=$1`,
        [intervention]
      );
      expect(agenda[0].dates_locataire_en_attente).toBe(3);
      expect(agenda[0].creneaux_en_attente).toBe(0);
    });

    it("un autre artisan ne lit pas ces créneaux", async () => {
      await agir(cptLoc);
      const { rows } = await db.query(`select * from public.mes_creneaux_artisan($1)`, [
        intervention,
      ]);
      expect(rows).toHaveLength(0);
    });

    it("reproposer ne passe plus par-dessus la réponse du locataire", async () => {
      await agir(cptArtisan);
      await expect(
        essai(`select public.proposer_creneaux($1, $2::jsonb)`, [intervention, trois(20)])
      ).rejects.toThrow(/Le locataire vous a proposé des dates/);
    });

    it("confirmer une date du locataire pose le rendez-vous", async () => {
      await agir(cptArtisan);
      const { rows } = await db.query(
        `select creneau_id from public.mes_creneaux_artisan($1) where propose_par='locataire'
          order by debut limit 1`,
        [intervention]
      );
      await db.query("savepoint accepter");
      await db.query(`select public.accepter_creneau_locataire($1)`, [rows[0].creneau_id]);
      await enTantQuePostgres();
      const { rows: [iv] } = await db.query(
        `select statut from public.incident_interventions where id=$1`, [intervention]
      );
      expect(iv.statut).toBe("planifiee");
      await db.query("rollback to savepoint accepter");
    });

    it("refuser les dates du locataire ouvre l'arbitrage du gérant (A5)", async () => {
      await agir(cptArtisan);
      await expect(
        essai(`select public.refuser_creneaux_locataire($1, '')`, [intervention])
      ).rejects.toThrow(/Dites pourquoi/);
      await db.query(`select public.refuser_creneaux_locataire($1, 'Chantier toute la semaine')`, [
        intervention,
      ]);
      await enTantQuePostgres();
      const { rows } = await db.query(
        `select criticite from public.alerts where organization_id=$1 and type='creneaux_arbitrage'
            and statut='ouverte' and details->>'intervention_id'=$2`,
        [orgA, intervention]
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ── 4. Facture ─────────────────────────────────────────────────────────
  describe("la facture de l'artisan (module 9.7)", () => {
    let cheminFacture = "";

    beforeAll(async () => {
      await enTantQuePostgres();
      await db.query(
        `update public.incident_interventions set statut='en_cours', demarree_le=now() where id=$1`,
        [intervention]
      );
      // Décor posé par le système (aucun utilisateur) : la garde des dépôts
      // (migration 20260927143000) ne vise que les écritures d'un compte.
      await db.query(`select set_config('request.jwt.claims', '', true)`);
      // Le fichier existe au stockage avant sa fiche (la base le vérifie).
      const cheminPhoto = `${orgA}/apres-${unique()}.jpg`;
      await db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [
        cheminPhoto,
      ]);
      const { rows: [doc] } = await db.query(
        `insert into public.documents (organization_id, type, storage_path, mime_type,
           taille_octets, empreinte)
         values ($1,'photo_incident',$2,'image/jpeg',10,$3) returning id`,
        [orgA, cheminPhoto, `emp-${unique()}`]
      );
      await db.query(
        `insert into public.intervention_photos (organization_id, intervention_id, document_id, moment)
         values ($1,$2,$3,'apres')`,
        [orgA, intervention, doc.id]
      );
    });

    it("pas de facture avant l'intervention terminée (module 9 : terminée + photo)", async () => {
      await agir(cptArtisan);
      await expect(
        essai(`select public.deposer_facture_artisan($1,'F-1',100000,null,$2,'application/pdf',10,'e')`, [
          intervention,
          `${orgA}/f.pdf`,
        ])
      ).rejects.toThrow(/une fois l'intervention terminée/);
      await db.query(
        `select public.deposer_compte_rendu($1,'Joint remplacé',null,null,100000,false)`,
        [intervention]
      );
    });

    it("la pièce de la facture se monte dans le seul dossier de sa facture, intervention terminée", async () => {
      await agir(cptArtisan);
      // Le reste du dossier de l'agence reste fermé une fois la mission finie.
      await expect(
        essai(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [
          `${orgA}/facture-${unique()}.pdf`,
          cptArtisan,
        ])
      ).rejects.toThrow();
      cheminFacture = `${orgA}/factures-artisan/${intervention}/facture-${unique()}.pdf`;
      // `owner` : ce que l'API Storage pose au dépôt (le banc n'a pas de défaut).
      await essai(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [
        cheminFacture,
        cptArtisan,
      ]);
    });

    it("un écart avec le devis se justifie, ne bloque pas, et s'alerte en critique", async () => {
      await agir(cptArtisan);
      await expect(
        essai(
          `select public.deposer_facture_artisan($1,'F-2026-12',120000,null,$2,'application/pdf',10,'emp-f')`,
          [intervention, cheminFacture]
        )
      ).rejects.toThrow(/expliquez l'écart/);
      const { rows: [{ deposer_facture_artisan: facture }] } = await db.query(
        `select public.deposer_facture_artisan($1,'F-2026-12',120000,'Pièce supplémentaire',$2,
           'application/pdf',10,'emp-f')`,
        [intervention, cheminFacture]
      );
      expect(facture).toBeTruthy();

      await agir(gerantA);
      const { rows: lues } = await db.query(
        `select numero, montant_ttc_cents, montant_reference_cents from public.intervention_factures`
      );
      expect(lues).toEqual([
        { numero: "F-2026-12", montant_ttc_cents: "120000", montant_reference_cents: "100000" },
      ]);
      await enTantQuePostgres();
      const { rows: alertes } = await db.query(
        `select criticite from public.alerts where organization_id=$1
            and type='facture_artisan_a_valider' and details->>'intervention_id'=$2`,
        [orgA, intervention]
      );
      expect(alertes).toEqual([{ criticite: "critique" }]);

      await agir(cptArtisan);
      const { rows: agenda } = await db.query(
        `select facture_deposee, montant_plafond_cents, montant_final_cents
           from public.mon_agenda_artisan() where intervention_id=$1`,
        [intervention]
      );
      expect(agenda[0]).toEqual({
        facture_deposee: true,
        montant_plafond_cents: "100000",
        montant_final_cents: "100000",
      });
      // Une seule facture par intervention.
      await expect(
        essai(
          `select public.deposer_facture_artisan($1,'F-bis',100000,null,$2,'application/pdf',10,'emp-g')`,
          [intervention, `${orgA}/autre.pdf`]
        )
      ).rejects.toThrow(/déjà été déposée/);
    });

    it("le locataire ne lit pas la facture", async () => {
      await agir(cptLoc);
      const { rows } = await db.query(`select * from public.intervention_factures`);
      expect(rows).toHaveLength(0);
    });
  });

  // ── 5. Formulaire public ───────────────────────────────────────────────
  it("demandes_devis : le doublon s'ignore, la quatrième demande de l'heure est refusée", async () => {
    await role("reset");
    await role("anon");
    const email = `Robot-${unique()}@exemple.test`;
    const ecrire = (message: string) =>
      essai(`insert into public.demandes_devis (nom, email, message) values ('R', $1, $2)`, [
        email,
        message,
      ]);
    await ecrire("un");
    const doublon = await ecrire("un");
    expect(doublon.rowCount).toBe(0);
    await ecrire("deux");
    await ecrire("trois");
    await expect(ecrire("quatre")).rejects.toThrow(/déjà bien reçu vos demandes/);
    await expect(
      essai(`insert into public.demandes_devis (nom, email, message) values ('R', $1, $2)`, [
        `x-${unique()}@exemple.test`,
        "y".repeat(4001),
      ])
    ).rejects.toThrow(/demandes_devis_longueurs/);
    await role("reset");
  });
});
