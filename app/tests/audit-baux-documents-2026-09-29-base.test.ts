/**
 * Audit des parcours baux et actes du 29/09 — non-régression en base
 * (migration 20260929120000_audit_baux_documents).
 *
 * Constats rejoués : révision IRL rétroactive (1) et trimestre de l'indice
 * (21), durée du bail nu selon la qualité du bailleur (3) avec parité TS/SQL,
 * congé pour vente en meublé (20), départ d'un colocataire (7). Transaction
 * annulée après chaque test. Nécessite SUPABASE_DB_URL (base locale).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dureeBailNuAnnees, normaliserQualiteBailleur } from "@/lib/qualite-bailleur";
import { numeroTrimestreIrl } from "@/lib/baux";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit baux et actes du 29/09 — corrections en base", () => {
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
      `insert into public.organizations (name, status) values ('Audit 29/09','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'audit29-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
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
       values ($1,'Bien audit 29','appartement'::public.bien_type,'1 rue A','75012','Paris', false) returning id`,
      [org]
    );
    bien = b.id;
    locataire = await personne("Martin", "Claire", null);
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  async function personne(nom: string, prenom: string | null, qualite: string | null): Promise<string> {
    await db.query("reset role");
    const {
      rows: [p],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, email, qualite)
       values ($1,$2,$3,$4,$5) returning id`,
      [org, nom, prenom, `${nom.toLowerCase().replace(/\W/g, "")}-${Math.random().toString(36).slice(2)}@exemple.fr`, qualite]
    );
    return p.id;
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
      loyer_hc: 750,
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
    return b.id;
  }

  async function echec(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint e");
    await expect(db.query(sql, params)).rejects.toThrow(motif);
    await db.query("rollback to savepoint e");
  }

  async function date(expr: string): Promise<string> {
    const {
      rows: [r],
    } = await db.query(`select to_char((${expr})::date, 'YYYY-MM-DD') as d`);
    return r.d;
  }

  // ------------------------------------------------------------------------
  // Constat 1 — révision IRL : effet = max(anniversaire, demande)
  // ------------------------------------------------------------------------
  it("IRL : demandée après l'anniversaire, la révision prend effet à la date de la demande", async () => {
    const b = await bail({
      revision_irl: true,
      irl_valeur: 145.17,
      irl_trimestre: "2e trimestre 2025",
      date_debut: await date("(current_date - 60) - interval '1 year'"),
    });
    await enGerant();
    const {
      rows: [r],
    } = await db.query(`select public.reviser_loyer($1, 148.03, 'T2 2026') as loyer`, [b]);
    expect(Number(r.loyer)).toBe(764.78);
    const {
      rows: [rev],
    } = await db.query(
      `select to_char(date_effet,'YYYY-MM-DD') effet, to_char(date_echeance,'YYYY-MM-DD') echeance,
              to_char(date_demande,'YYYY-MM-DD') demande, irl_trimestre
         from public.revisions_loyer where bail_id = $1`,
      [b]
    );
    // Anniversaire il y a 60 jours, demande aujourd'hui : effet aujourd'hui,
    // jamais rétroactif à l'anniversaire.
    expect(rev.echeance).toBe(await date("current_date - 60"));
    expect(rev.demande).toBe(await date("current_date"));
    expect(rev.effet).toBe(await date("current_date"));
    expect(rev.irl_trimestre).toBe("T2 2026");
  });

  it("IRL : demandée le jour anniversaire, effet à l'anniversaire ; jamais demandée d'avance", async () => {
    const b = await bail({
      revision_irl: true,
      irl_valeur: 145.17,
      irl_trimestre: "T2 2025",
      date_debut: await date("(current_date - 60) - interval '1 year'"),
    });
    await enGerant();
    await echec(/anticipée/i, `select public.reviser_loyer($1, 148.03, 'T2 2026', current_date + 1)`, [b]);
    await db.query(`select public.reviser_loyer($1, 148.03, 'T2 2026', current_date - 60)`, [b]);
    const {
      rows: [rev],
    } = await db.query(
      `select to_char(date_effet,'YYYY-MM-DD') effet from public.revisions_loyer where bail_id = $1`,
      [b]
    );
    expect(rev.effet).toBe(await date("current_date - 60"));
  });

  it("IRL : une révision tardive n'empêche pas celle de l'anniversaire suivant (une par année de bail)", async () => {
    const b = await bail({
      revision_irl: true,
      irl_valeur: 145.17,
      irl_trimestre: "2e trimestre 2024",
      date_debut: await date("current_date - interval '2 years'"),
    });
    await enGerant();
    // Échéance il y a un an, demandée 100 jours plus tard : effet à la demande
    await db.query(
      `select public.reviser_loyer($1, 148.03, 'T2 2025', (current_date - interval '1 year' + interval '100 days')::date)`,
      [b]
    );
    // L'anniversaire suivant (aujourd'hui) tombe 265 jours plus tard : dû.
    const {
      rows: [r],
    } = await db.query(`select public.reviser_loyer($1, 150, 'T2 2026') as loyer`, [b]);
    expect(Number(r.loyer)).toBe(774.96);
    // Même année de bail : refusé
    await echec(/une seule révision par année de bail/i, `select public.reviser_loyer($1, 151, 'T2 2027')`, [b]);
  });

  // ------------------------------------------------------------------------
  // Constat 21 — l'indice nouveau est du même trimestre que la référence
  // ------------------------------------------------------------------------
  it("IRL : trimestre exigé, identique à celui du bail, d'une année postérieure", async () => {
    const b = await bail({
      revision_irl: true,
      irl_valeur: 145.17,
      irl_trimestre: "2e trimestre 2025",
      date_debut: await date("current_date - interval '1 year'"),
    });
    await enGerant();
    await echec(/format/i, `select public.reviser_loyer($1, 148.03, '2026')`, [b]);
    await echec(/même trimestre/i, `select public.reviser_loyer($1, 148.03, 'T3 2026')`, [b]);
    await echec(/année postérieure/i, `select public.reviser_loyer($1, 148.03, 'T2 2025')`, [b]);
    await db.query(`select public.reviser_loyer($1, 148.03, 't2  2026')`, [b]);
  });

  it("IRL : un bail sans trimestre lisible prend celui de sa première révision", async () => {
    const b = await bail({
      revision_irl: true,
      irl_valeur: 145.17,
      date_debut: await date("current_date - interval '2 years'"),
    });
    await enGerant();
    await db.query(`select public.reviser_loyer($1, 148.03, 'T3 2025', (current_date - interval '1 year')::date)`, [b]);
    await echec(/même trimestre/i, `select public.reviser_loyer($1, 150, 'T2 2026')`, [b]);
    await db.query(`select public.reviser_loyer($1, 150, 'T3 2026')`, [b]);
  });

  it("IRL : parité du trimestre lu entre la base et l'écran", async () => {
    const libelles = ["T2 2026", "2e trimestre 2026", "1er trimestre", "3ème trimestre 2025", "deuxième trimestre", "4e trim.", "T4", "sans trimestre", ""];
    const { rows } = await db.query(
      `select x, public.trimestre_irl_numero(x) n from unnest($1::text[]) x`,
      [libelles]
    );
    for (const r of rows) expect(numeroTrimestreIrl(r.x)).toBe(r.n === null ? null : Number(r.n));
  });

  // ------------------------------------------------------------------------
  // Constat 3 — durée du bail nu : une règle, deux miroirs
  // ------------------------------------------------------------------------
  it("durée du bail nu : même résultat en base et dans le PDF", async () => {
    const cas: (string | null)[][] = [
      [],
      ["Personne physique"],
      [null],
      ["SCI familiale"],
      ["Indivision (personnes physiques)"],
      ["indivision"],
      ["SCI"],
      ["Personne morale"],
      ["Personne physique", "SCI familiale"],
      ["Personne physique", "SCI"],
      ["SCI familiale", "Personne morale"],
      ["personne_physique", "sci familiale"],
    ];
    for (const qualites of cas) {
      const {
        rows: [r],
      } = await db.query(`select public.duree_bail_nu_annees($1::text[]) d`, [qualites]);
      expect(dureeBailNuAnnees(qualites), JSON.stringify(qualites)).toBe(r.d);
    }
    const bruts = ["Indivision", "personne_physique", " SCI  familiale ", "sci", "Personne morale", "", "bidon"];
    const { rows } = await db.query(
      `select x, public.qualite_bailleur_normalisee(x) n from unnest($1::text[]) x`,
      [bruts]
    );
    for (const r of rows) expect(normaliserQualiteBailleur(r.x)).toBe(r.n);
  });

  it("qualité : liste fermée en base, anciennes écritures ramenées à la liste", async () => {
    const p = await personne("Indivision Durand", null, "Indivision");
    const {
      rows: [r],
    } = await db.query(`select qualite from public.persons where id = $1`, [p]);
    expect(r.qualite).toBe("Indivision (personnes physiques)");
    await echec(/Qualité « SARL Bidule » inconnue/, `update public.persons set qualite = 'SARL Bidule' where id = $1`, [p]);
  });

  it("congé du bailleur : SCI familiale et indivision = 3 ans, SCI ou société = 6 ans, mixte avec SCI = 6 ans", async () => {
    const debut = await date("current_date - interval '3 years' + interval '8 months'");
    const terme3 = await date(`('${debut}'::date + interval '3 years')::date - 1`);
    const terme6 = await date(`('${debut}'::date + interval '6 years')::date - 1`);
    const cas: [string[], string][] = [
      [["SCI familiale"], terme3],
      [["Indivision (personnes physiques)"], terme3],
      [["SCI"], terme6],
      [["Personne morale"], terme6],
      [["Personne physique", "SCI"], terme6],
      [["Personne physique", "SCI familiale"], terme3],
    ];
    for (const [qualites, attendu] of cas) {
      const l = await lot();
      for (const q of qualites) {
        const p = await personne(`Bailleur ${q}`, q === "Personne physique" ? "Jean" : null, q);
        await db.query(
          `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,$4)`,
          [l, org, p, 100 / qualites.length]
        );
      }
      const b = await bail({ lot_id: l, date_debut: debut });
      await enGerant();
      const {
        rows: [t],
      } = await db.query(`select to_char(public.terme_bail($1),'YYYY-MM-DD') t`, [b]);
      expect(t.t, qualites.join(" + ")).toBe(attendu);
      if (attendu === terme3) {
        // Présenté aujourd'hui, 8 mois avant le terme de 3 ans : congé au terme
        const {
          rows: [{ id }],
        } = await db.query(
          `select public.enregistrer_conge($1, 'bailleur', current_date, 6::smallint, 'Reprise', null, null, 'Fils du bailleur') id`,
          [b]
        );
        const {
          rows: [c],
        } = await db.query(`select to_char(date_effet,'YYYY-MM-DD') e from public.conges where id = $1`, [id]);
        expect(c.e).toBe(terme3);
      }
      await db.query("reset role");
    }
  });

  // ------------------------------------------------------------------------
  // Constat 20 — congé pour vente : prix exigé en location nue seulement
  // ------------------------------------------------------------------------
  it("congé pour vente : prix obligatoire en nu, facultatif en meublé", async () => {
    const debutNu = await date("current_date - interval '3 years' + interval '8 months'");
    const nu = await bail({ date_debut: debutNu });
    const debutMeuble = await date("current_date - interval '1 year' + interval '4 months'");
    const meuble = await bail({ type: "meuble", date_debut: debutMeuble });
    await enGerant();
    await echec(
      /prix de vente proposé est obligatoire/i,
      `select public.enregistrer_conge($1, 'bailleur', current_date, 6::smallint, 'Vente du logement')`,
      [nu]
    );
    const {
      rows: [{ id }],
    } = await db.query(
      `select public.enregistrer_conge($1, 'bailleur', current_date, 3::smallint, 'Vente du logement') id`,
      [meuble]
    );
    const {
      rows: [c],
    } = await db.query(
      `select c.prix_vente, to_char(c.date_effet,'YYYY-MM-DD') e from public.conges c where c.id = $1`,
      [id]
    );
    expect(c.prix_vente).toBeNull();
    expect(c.e).toBe(await date(`('${debutMeuble}'::date + interval '1 year')::date - 1`));
  });

  // ------------------------------------------------------------------------
  // Constat 7 — départ d'un colocataire, garant lié
  // ------------------------------------------------------------------------
  it("colocation : pas de suppression hors brouillon ; le départ fixe la solidarité à 6 mois, garant compris", async () => {
    const l = await lot();
    const b = await bail({ lot_id: l, type: "colocation", date_debut: await date("current_date - 200") });
    const coloc = await personne("Petit", "Hugo", null);
    const garant = await personne("Petit", "Anne", null);
    const nouveau = await personne("Roux", "Léa", null);
    const {
      rows: [lc],
    } = await db.query(
      `insert into public.bail_personnes (organization_id, bail_id, person_id, role, quote_part)
       values ($1,$2,$3,'colocataire',50) returning id`,
      [org, b, coloc]
    );
    const {
      rows: [lg],
    } = await db.query(
      `insert into public.bail_personnes (organization_id, bail_id, person_id, role, garant_de)
       values ($1,$2,$3,'garant',$4) returning id`,
      [org, b, garant, coloc]
    );
    await enGerant();
    await echec(/Enregistrez son départ/, `delete from public.bail_personnes where id = $1`, [lc.id]);
    await echec(/Enregistrez son départ/, `delete from public.bail_personnes where id = $1`, [lg.id]);
    await echec(/Seul un colocataire/, `select public.enregistrer_depart_colocataire($1, current_date)`, [lg.id]);

    const {
      rows: [r],
    } = await db.query(
      `select to_char(public.enregistrer_depart_colocataire($1, current_date + 10),'YYYY-MM-DD') fin`,
      [lc.id]
    );
    const attendu = await date("current_date + 10 + interval '6 months'");
    expect(r.fin).toBe(attendu);
    const { rows } = await db.query(
      `select role, to_char(date_depart,'YYYY-MM-DD') depart, to_char(date_solidarite_fin,'YYYY-MM-DD') fin
         from public.bail_personnes where bail_id = $1 order by role`,
      [b]
    );
    expect(rows).toEqual([
      { role: "colocataire", depart: await date("current_date + 10"), fin: attendu },
      { role: "garant", depart: null, fin: attendu },
    ]);
    await echec(/déjà enregistré/, `select public.enregistrer_depart_colocataire($1, current_date)`, [lc.id]);

    // Remplacé par un nouveau colocataire au bail : la solidarité cesse au départ
    await db.query("reset role");
    const coloc2 = await personne("Blanc", "Paul", null);
    const {
      rows: [lc2],
    } = await db.query(
      `insert into public.bail_personnes (organization_id, bail_id, person_id, role, quote_part)
       values ($1,$2,$3,'colocataire',25),($1,$2,$4,'colocataire',25) returning id`,
      [org, b, coloc2, nouveau]
    );
    await enGerant();
    const {
      rows: [r2],
    } = await db.query(
      `select to_char(public.enregistrer_depart_colocataire($1, current_date + 30, $2),'YYYY-MM-DD') fin`,
      [lc2.id, nouveau]
    );
    expect(r2.fin).toBe(await date("current_date + 30"));
  });

  it("colocation : un brouillon se corrige encore en retirant la personne", async () => {
    const l = await lot();
    const b = await bail({ lot_id: l, type: "colocation", etat: "brouillon" });
    const coloc = await personne("Vert", "Zoé", null);
    const {
      rows: [lc],
    } = await db.query(
      `insert into public.bail_personnes (organization_id, bail_id, person_id, role) values ($1,$2,$3,'colocataire') returning id`,
      [org, b, coloc]
    );
    await enGerant();
    const { rowCount } = await db.query(`delete from public.bail_personnes where id = $1`, [lc.id]);
    expect(rowCount).toBe(1);
  });
});
