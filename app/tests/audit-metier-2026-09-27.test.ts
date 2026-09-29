/**
 * Audit métier du 27/09 — non-régression des corrections en base.
 *
 * Chaque test rejoue le constat de l'audit (chiffres de l'audit quand il en
 * donne) et vérifie la règle du wiki citée en commentaire. Transaction annulée
 * à la fin de chaque test. Nécessite SUPABASE_DB_URL (base locale).
 */
import { verifierBaseDeTest } from "./garde-base";
import { couvrirParMandat } from "./fixtures/mandat";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit métier du 27/09 — corrections en base", () => {
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
      `insert into public.organizations (name, status, relances_envoi_auto, appels_envoi_auto)
       values ('Audit 27/09','active', true, true) returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'audit27-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
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
       values ($1,'Bien audit','appartement'::public.bien_type,'1 rue A','75012','Paris', false) returning id`,
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

  async function lot(meuble = false): Promise<string> {
    await db.query("reset role");
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat, meuble)
       values ($1,$2,'Lot '||gen_random_uuid(),'loue'::public.lot_etat,$3) returning id`,
      [org, bien, meuble]
    );
    return l.id;
  }

  async function bail(champs: Record<string, unknown>): Promise<string> {
    await db.query("reset role");
    const l = (champs.lot_id as string | undefined) ?? (await lot(champs.type === "meuble"));
    const donnees: Record<string, unknown> = {
      organization_id: org,
      lot_id: l,
      locataire_principal: locataire,
      type: "nu",
      etat: "actif",
      loyer_hc: 650,
      charges: 50,
      jour_echeance: 5,
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

  // ------------------------------------------------------------------------
  // BLOQUANT — révision IRL composée (wiki « Révision annuelle IRL »,
  // RM-3.8.2 et RM-3.8.7)
  // ------------------------------------------------------------------------
  it("IRL : la 2e révision part de l'indice de la 1re, pas de celui de la signature", async () => {
    const b = await bail({
      loyer_hc: 750,
      depot_garantie: 750,
      revision_irl: true,
      irl_valeur: 145.17,
      irl_trimestre: "2e trimestre",
      date_debut: "2024-09-01",
    });
    // Les deux échéances ne sont pas prescrites si on les date à l'anniversaire
    // le plus récent et à celui d'avant ; on décale la date de début pour que
    // « il y a un an » et « aujourd'hui » soient des anniversaires.
    await db.query(
      `update public.baux set date_debut = (current_date - interval '2 years')::date where id = $1`,
      [b]
    );
    await enGerant();
    const {
      rows: [an1],
    } = await db.query(
      `select public.reviser_loyer($1, 148.03, (current_date - interval '1 year')::date) as loyer`,
      [b]
    );
    expect(Number(an1.loyer)).toBe(764.78); // l'exemple du wiki
    const {
      rows: [an2],
    } = await db.query(`select public.reviser_loyer($1, 150.00, current_date) as loyer`, [b]);
    // Juste : 764,78 × 150 / 148,03 = 774,96 € (l'ancien calcul donnait 790,23 €)
    expect(Number(an2.loyer)).toBe(774.96);
    const { rows } = await db.query(
      `select irl_reference, irl_nouveau from public.revisions_loyer where bail_id = $1 order by date_effet`,
      [b]
    );
    // RM-3.8.7 : chaque révision conserve l'indice réellement utilisé
    expect(rows.map((r) => [Number(r.irl_reference), Number(r.irl_nouveau)])).toEqual([
      [145.17, 148.03],
      [148.03, 150],
    ]);
  });

  it("IRL : la date d'effet est une date anniversaire du bail, jamais avant la première", async () => {
    const b = await bail({ revision_irl: true, irl_valeur: 145.17, date_debut: "2026-01-01" });
    await db.query(
      `update public.baux set date_debut = (current_date - 14)::date where id = $1`,
      [b]
    );
    await enGerant();
    // 14 jours après la prise d'effet (constat de l'audit agence)
    await echec(/date anniversaire/i, `select public.reviser_loyer($1, 148.03, current_date)`, [b]);
    // Avant même le début du bail
    await echec(
      /date anniversaire/i,
      `select public.reviser_loyer($1, 148.03, (current_date - 30)::date)`,
      [b]
    );
  });

  it("IRL : une révision antérieure à la dernière appliquée est refusée", async () => {
    const b = await bail({ revision_irl: true, irl_valeur: 145.17, date_debut: "2024-01-01" });
    await db.query(
      `update public.baux set date_debut = (current_date - interval '2 years')::date where id = $1`,
      [b]
    );
    await enGerant();
    await db.query(`select public.reviser_loyer($1, 148.03, current_date)`, [b]);
    await echec(
      /plus récente/i,
      `select public.reviser_loyer($1, 147.00, (current_date - interval '1 year')::date)`,
      [b]
    );
  });

  // ------------------------------------------------------------------------
  // MAJEUR — IRL à la baisse avec un dépôt d'exactement un mois (RM-2.1.5)
  // ------------------------------------------------------------------------
  it("dépôt : une révision à la baisse passe, le dépôt n'est jamais recontrôlé sur un bail engagé", async () => {
    const b = await bail({ depot_garantie: 650, revision_irl: true, irl_valeur: 145.17 });
    await db.query(
      `update public.baux set date_debut = (current_date - interval '1 year')::date where id = $1`,
      [b]
    );
    await enGerant();
    const {
      rows: [r],
    } = await db.query(`select public.reviser_loyer($1, 144, current_date) as loyer`, [b]);
    expect(Number(r.loyer)).toBe(644.76); // l'exemple de l'audit, autrefois bloqué
    // Le solde du dépôt s'encaisse toujours, au plafond du loyer de signature
    const {
      rows: [e],
    } = await db.query(`select public.encaisser_depot($1, 650, current_date, 'virement') as cumul`, [b]);
    expect(Number(e.cumul)).toBe(650);
    // Modifier le DÉPÔT reste contrôlé
    await db.query("reset role");
    await echec(/Dépôt de garantie trop élevé/, `update public.baux set depot_garantie = 700 where id = $1`, [b]);
  });

  it("dépôt : sur un brouillon, baisser le loyer sous le dépôt reste refusé (fixation)", async () => {
    const b = await bail({ etat: "brouillon", depot_garantie: 650 });
    await echec(/Dépôt de garantie trop élevé/, `update public.baux set loyer_hc = 600 where id = $1`, [b]);
  });

  // ------------------------------------------------------------------------
  // MAJEUR — terme échu (wiki « Période de loyer »)
  // ------------------------------------------------------------------------
  it("terme échu : le terme du mois se paie le jour d'échéance du mois suivant", async () => {
    const echu = await bail({ paiement_echeance: "echu", date_debut: "2026-08-01" });
    const echoir = await bail({ paiement_echeance: "echoir", date_debut: "2026-08-01" });
    await enGerant();
    await db.query(`select public.generer_appels_loyer($1)`, [echu]);
    await db.query(`select public.generer_appels_loyer($1)`, [echoir]);
    const { rows } = await db.query(
      `select bail_id, to_char(date_echeance,'YYYY-MM-DD') as e from public.appels_loyer
        where bail_id in ($1,$2) and periode = '2026-08-01'`,
      [echu, echoir]
    );
    const par = Object.fromEntries(rows.map((r) => [r.bail_id, r.e]));
    expect(par[echu]).toBe("2026-09-05");
    expect(par[echoir]).toBe("2026-08-05");
  });

  // ------------------------------------------------------------------------
  // MAJEUR — congé du bailleur au terme (wiki « Bail » § 1.11)
  // ------------------------------------------------------------------------
  it("congé du bailleur : effet au terme du bail, refusé s'il arrive trop tard", async () => {
    const b = await bail({ date_debut: "2026-09-01" });
    await enGerant();
    // Présenté le 01/10/2026 : effet au terme, le 31/08/2029 (et non 01/04/2027)
    await db.query(
      `select public.enregistrer_conge($1,'bailleur','2026-10-01',6::smallint,'Motif légitime et sérieux')`,
      [b]
    );
    const {
      rows: [c],
    } = await db.query(
      `select to_char(c.date_effet,'YYYY-MM-DD') as effet, to_char(b.date_fin,'YYYY-MM-DD') as fin
         from public.conges c join public.baux b on b.id = c.bail_id where c.bail_id = $1`,
      [b]
    );
    expect(c).toEqual({ effet: "2029-08-31", fin: "2029-08-31" });

    // Moins de six mois avant le terme : le congé serait nul, il est bloqué
    const tard = await bail({ date_debut: "2026-09-01" });
    await enGerant();
    await echec(
      /tardif/i,
      `select public.enregistrer_conge($1,'bailleur','2029-04-01',6::smallint,'Motif légitime et sérieux')`,
      [tard]
    );
  });

  it("congé du bailleur : meublé reconduit d'un an, terme de la période en cours", async () => {
    const b = await bail({ type: "meuble", date_debut: "2025-01-01" });
    await enGerant();
    await db.query(
      `select public.enregistrer_conge($1,'bailleur','2026-06-15',3::smallint,'Motif légitime et sérieux')`,
      [b]
    );
    const {
      rows: [c],
    } = await db.query(`select to_char(date_effet,'YYYY-MM-DD') as effet from public.conges where bail_id = $1`, [b]);
    expect(c.effet).toBe("2026-12-31");
  });

  it("congé du bailleur : prix obligatoire pour une vente, bénéficiaire pour une reprise", async () => {
    const b = await bail({ date_debut: "2026-09-01" });
    await enGerant();
    await echec(
      /prix de vente/i,
      `select public.enregistrer_conge($1,'bailleur','2026-10-01',6::smallint,'Vente du logement')`,
      [b]
    );
    await echec(
      /bénéficiaire/i,
      `select public.enregistrer_conge($1,'bailleur','2026-10-01',6::smallint,'Reprise (bénéficiaire familial)')`,
      [b]
    );
    await db.query(
      `select public.enregistrer_conge($1,'bailleur','2026-10-01',6::smallint,'Vente du logement',null,250000)`,
      [b]
    );
    const {
      rows: [c],
    } = await db.query(`select prix_vente from public.conges where bail_id = $1`, [b]);
    expect(Number(c.prix_vente)).toBe(250000);
  });

  // ------------------------------------------------------------------------
  // MAJEUR — zone tendue figée au bail (RM-1.1.7, RM-1.10.7)
  // ------------------------------------------------------------------------
  it("zone tendue : figée à la signature, un rezonage du bien ne change pas le préavis", async () => {
    const b = await bail({ etat: "brouillon", date_debut: "2026-01-01" });
    const {
      rows: [z],
    } = await db.query(`select zone_tendue from public.baux where id = $1`, [b]);
    expect(z.zone_tendue).toBe(false); // déduite du bien
    await db.query(`update public.baux set etat = 'actif' where id = $1`, [b]);
    // Le bien passe en zone tendue APRÈS la signature
    await db.query(`update public.biens set zone_tendue = true where id = $1`, [bien]);
    await enGerant();
    await db.query(`select public.enregistrer_conge($1,'locataire',current_date,3::smallint)`, [b]);
    const {
      rows: [c],
    } = await db.query(`select preavis_mois, zone_tendue from public.conges where bail_id = $1`, [b]);
    expect(c).toEqual({ preavis_mois: 3, zone_tendue: false });
    // Et la zone ne s'écrit plus directement
    await db.query("reset role");
    await echec(/figée/i, `update public.baux set zone_tendue = true where id = $1`, [b]);
  });

  it("zone tendue : en brouillon, la zone des honoraires fait foi (une seule valeur)", async () => {
    const b = await bail({ etat: "brouillon" });
    await db.query(`update public.baux set zone_honoraires = 'tendue' where id = $1`, [b]);
    const {
      rows: [z],
    } = await db.query(`select zone_tendue from public.baux where id = $1`, [b]);
    expect(z.zone_tendue).toBe(true);
  });

  // ------------------------------------------------------------------------
  // MAJEUR — trop-perçu et régularisation dans le décompte final
  // (wiki « Solde de tout compte », « Régularisation des charges »)
  // ------------------------------------------------------------------------
  async function appel(b: string, periode: string, montant: number) {
    await db.query("reset role");
    await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, loyer_hc, charges, montant_du, date_echeance)
       values ($1,$2,$3,$4,0,$4,$3)`,
      [org, b, periode, montant]
    );
  }
  async function encaisser(b: string, montant: number) {
    await db.query("reset role");
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,$3,'2026-08-10','virement')`,
      [org, b, montant]
    );
  }

  it("restitution : le trop-perçu de loyer revient au locataire avec le dépôt", async () => {
    const b = await bail({ etat: "preavis", loyer_hc: 700, charges: 0, depot_garantie: 650, date_debut: "2026-08-01" });
    await appel(b, "2026-08-01", 700);
    await encaisser(b, 1400);
    await enGerant();
    await db.query(`select public.encaisser_depot($1, 650, '2026-08-01', 'virement')`, [b]);
    const {
      rows: [{ id: r }],
    } = await db.query(`select public.demarrer_restitution($1, '2026-09-01', true) as id`, [b]);
    const {
      rows: [m],
    } = await db.query(`select impayes, trop_percu from public.restitutions where id = $1`, [r]);
    expect([Number(m.impayes), Number(m.trop_percu)]).toEqual([0, 700]);
    const {
      rows: [{ solde }],
    } = await db.query(`select public.finaliser_decompte($1) as solde`, [r]);
    expect(Number(solde)).toBe(1350); // et non 650
    await db.query("reset role");
    const { rows: ecr } = await db.query(
      `select categorie, montant from public.ecritures where bail_id = $1 and sens = 'depense' order by categorie`,
      [b]
    );
    expect(ecr.map((e) => [e.categorie, Number(e.montant)])).toEqual([
      ["depot_garantie", 650],
      ["trop_percu_restitue", 700],
    ]);
  });

  it("restitution : le complément de régularisation entre dans les impayés, le trop-perçu en créance", async () => {
    const b = await bail({ etat: "preavis", loyer_hc: 700, charges: 0, depot_garantie: 650, date_debut: "2025-01-01" });
    await appel(b, "2026-08-01", 700);
    await encaisser(b, 700);
    await db.query(
      `insert into public.regularisations_charges (organization_id, bail_id, annee, provisions, charges_reelles, ecart)
       values ($1,$2,2025,600,900,-300)`,
      [org, b]
    );
    await enGerant();
    const {
      rows: [m],
    } = await db.query(`select * from public.montants_restitution_a_jour($1)`, [b]);
    expect([Number(m.impayes), Number(m.trop_percu)]).toEqual([300, 0]);
    // Un trop-perçu de régularisation (+193,97, exemple du wiki) : dû au locataire
    await db.query("reset role");
    await db.query(`update public.regularisations_charges set ecart = 193.97 where bail_id = $1`, [b]);
    await enGerant();
    const {
      rows: [m2],
    } = await db.query(`select * from public.montants_restitution_a_jour($1)`, [b]);
    expect([Number(m2.impayes), Number(m2.trop_percu)]).toEqual([0, 193.97]);
  });

  it("restitution : « conforme » est refusé quand le comparatif d'EDL relève des écarts (RM-2.4.2)", async () => {
    const b = await bail({ etat: "preavis", date_debut: "2025-01-01" });
    for (const [type, etat] of [["entree", "bon"], ["sortie", "mauvais"]]) {
      const {
        rows: [edl],
      } = await db.query(
        `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,$3) returning id`,
        [org, b, type]
      );
      await db.query(
        `insert into public.edl_lignes (organization_id, edl_id, piece, libelle, etat)
         values ($1,$2,'Séjour','Murs',$3::public.etat_element)`,
        [org, edl.id, etat]
      );
      await db.query(`update public.etats_des_lieux set etat = 'signe' where id = $1`, [edl.id]);
    }
    await enGerant();
    await echec(/Sortie non conforme/, `select public.demarrer_restitution($1, current_date, true)`, [b]);
    const {
      rows: [{ id }],
    } = await db.query(`select public.demarrer_restitution($1, current_date, false) as id`, [b]);
    const {
      rows: [r],
    } = await db.query(`select delai_mois from public.restitutions where id = $1`, [id]);
    expect(r.delai_mois).toBe(2);
  });

  // ------------------------------------------------------------------------
  // MAJEUR — relances et avis : tous les colocataires, dette totale
  // (wiki « Relances et mise en demeure », « Quittancement des loyers »)
  // ------------------------------------------------------------------------
  it("relance automatique : dette totale et tous les colocataires", async () => {
    const b = await bail({ type: "colocation", loyer_hc: 700, charges: 0, date_debut: "2026-06-01" });
    const {
      rows: [co],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, email)
       values ($1,'Durand','Léo','leo.durand@exemple.fr') returning id`,
      [org]
    );
    await db.query(
      `insert into public.bail_personnes (organization_id, bail_id, person_id, role) values ($1,$2,$3,'colocataire')`,
      [org, b, co.id]
    );
    for (const mois of ["2026-06-01", "2026-07-01", "2026-08-01"]) await appel(b, mois, 700);
    await db.query(
      `update public.appels_loyer set date_echeance = current_date - 20 where bail_id = $1`,
      [b]
    );
    const { rows } = await db.query(
      `select reste, total_du, autres_destinataires from public.relances_loyer_dues(500) where bail_id = $1`,
      [b]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].reste)).toBe(700);
    expect(Number(rows[0].total_du)).toBe(2100);
    expect(rows[0].autres_destinataires).toEqual(["leo.durand@exemple.fr"]);

    await db.query(`update public.appels_loyer set created_at = now() where bail_id = $1`, [b]);
    const { rows: avis } = await db.query(
      `select autres_destinataires from public.appels_a_envoyer(500) where bail_id = $1`,
      [b]
    );
    expect(avis.length).toBeGreaterThan(0);
    expect(avis[0].autres_destinataires).toEqual(["leo.durand@exemple.fr"]);
  });

  // ------------------------------------------------------------------------
  // MINEUR — forfait de charges refusé sur un bail nu hors colocation
  // (wiki « Régularisation des charges », contrat type IV.B)
  // ------------------------------------------------------------------------
  it("forfait de charges : refusé sur un bail nu, libre en meublé et en colocation", async () => {
    await echec(/forfait impossibles sur un bail nu/i, `insert into public.baux
        (organization_id, lot_id, locataire_principal, type, etat, loyer_hc, charges, charges_mode)
        values ($1,$2,$3,'nu','brouillon',650,50,'forfait')`, [org, await lot(), locataire]);
    await bail({ type: "meuble", charges_mode: "forfait" });
    await bail({ type: "colocation", charges_mode: "forfait" });
  });
});
