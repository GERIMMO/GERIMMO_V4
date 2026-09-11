/**
 * Encaisser : l'écran doit dire ce qu'il vient de faire, et ne rien promettre
 * qu'il ne tienne.
 *
 * LA RÈGLE, inchangée : un encaissement s'impute du terme le PLUS ANCIEN au
 * plus récent (RM-3.3.2, règle légale de l'ancienneté de la dette —
 * wiki/processus/Quittancement des loyers.md). La quittance n'est émise
 * qu'après encaissement intégral (RM-3.4.1) ; un paiement partiel produit un
 * reçu, jamais une quittance (RM-3.4.2). Et « la banque fait foi sur les
 * montants et les dates » (RM-A6.7).
 *
 * LE DÉFAUT rejoué ici :
 *  (a) le succès n'était jamais affiché, et le seul message existant venait du
 *      COMPTEUR de documents de emettre_quittances — or un déclencheur a déjà
 *      resynchronisé les documents pendant l'INSERT, si bien que le compteur
 *      vaut 0 : « aucun reçu ni quittance à émettre » juste après en avoir
 *      émis un ;
 *  (b) le bouton promettait « Encaisser {reste de CE terme} » alors que
 *      l'argent partait sur un impayé plus ancien, et la ligne cliquée ne
 *      bougeait pas ;
 *  (c) la date d'un encaissement refusé était perdue — et la base date alors
 *      l'écriture du jour (date_paiement vaut CURRENT_DATE par défaut).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  compteRenduEncaissement,
  imputationsRealisees,
  type EtatAppel,
} from "../src/lib/imputation";
import { moisEnFrancais } from "../src/lib/ged";
import { InputDateJour } from "../src/components/input-date-jour";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const JUILLET = "2026-07-01";
const AOUT = "2026-08-01";

// Deux termes de 500 €, rien d'encaissé : l'état d'avant.
const AVANT: EtatAppel[] = [
  { appel_id: "a-juillet", periode: JUILLET, montant_du: 500, montant_couvert: 0 },
  { appel_id: "a-aout", periode: AOUT, montant_du: 500, montant_couvert: 0 },
];

describe("Compte rendu d'encaissement — dire sur quel terme l'argent est allé", () => {
  it("nomme le terme le plus ANCIEN, pas celui que l'agent regardait", () => {
    // L'agent clique « Encaisser 500,00 € » sur la ligne d'AOÛT ; la base
    // solde JUILLET. Le compte rendu doit nommer juillet.
    const apres: EtatAppel[] = [
      { appel_id: "a-juillet", periode: JUILLET, montant_du: 500, montant_couvert: 500 },
      { appel_id: "a-aout", periode: AOUT, montant_du: 500, montant_couvert: 0 },
    ];
    const rendu = compteRenduEncaissement(500, AVANT, apres);

    expect(rendu).toContain("juillet 2026 soldé, 500,00 € → quittance");
    expect(rendu).not.toContain("août");
    expect(rendu).toContain("RM-3.3.2");
  });

  it("dit qu'un paiement partiel produit un REÇU, et pourquoi (RM-3.4.2)", () => {
    const apres: EtatAppel[] = [
      { appel_id: "a-juillet", periode: JUILLET, montant_du: 500, montant_couvert: 300 },
      { appel_id: "a-aout", periode: AOUT, montant_du: 500, montant_couvert: 0 },
    ];
    const rendu = compteRenduEncaissement(300, AVANT, apres);

    expect(rendu).toContain("juillet 2026 réglé en partie, 300,00 € (reste 200,00 €) → reçu");
    expect(rendu).toContain("la quittance ne libère qu'au solde (RM-3.4.2)");
    expect(rendu).not.toContain("→ quittance");
  });

  it("enchaîne les termes servis dans l'ordre, quittance puis reçu", () => {
    const apres: EtatAppel[] = [
      { appel_id: "a-juillet", periode: JUILLET, montant_du: 500, montant_couvert: 500 },
      { appel_id: "a-aout", periode: AOUT, montant_du: 500, montant_couvert: 300 },
    ];
    const rendu = compteRenduEncaissement(800, AVANT, apres);

    expect(rendu).toContain(
      "juillet 2026 soldé, 500,00 € → quittance ; août 2026 réglé en partie, 300,00 € (reste 200,00 €) → reçu"
    );
  });

  it("ne tait pas l'excédent : il reste en avance sur le prochain appel (RM-3.5.1)", () => {
    const apres: EtatAppel[] = [
      { appel_id: "a-juillet", periode: JUILLET, montant_du: 500, montant_couvert: 500 },
      { appel_id: "a-aout", periode: AOUT, montant_du: 500, montant_couvert: 500 },
    ];
    const rendu = compteRenduEncaissement(1200, AVANT, apres);

    expect(rendu).toContain("200,00 € en avance sur le prochain appel");
  });

  it("sur un bail sans échéancier, dit que l'argent attend le prochain appel", () => {
    // Cas réel : l'agent encaisse avant d'avoir généré l'échéancier. Rien à
    // imputer n'est pas rien à dire.
    const rendu = compteRenduEncaissement(100, [], []);
    expect(rendu).toContain("aucun terme à couvrir");
    expect(rendu).toContain("100,00 € en avance sur le prochain appel");
  });

  it("ignore le centime d'arrondi du numeric : ce n'est pas une imputation", () => {
    const apres: EtatAppel[] = [
      { appel_id: "a-juillet", periode: JUILLET, montant_du: 500, montant_couvert: "0.001" },
      { appel_id: "a-aout", periode: AOUT, montant_du: 500, montant_couvert: 0 },
    ];
    expect(imputationsRealisees(AVANT, apres)).toEqual([]);
  });
});

describe.skipIf(!DB_URL)("Encaissement en base — la règle impute au plus ancien", () => {
  let db: Client;
  let org: string;
  let gerant: string;
  let bail: string;
  let moisAffiche: string;
  let moisAnterieur: string;

  // Les dates sont rendues en texte, comme PostgREST les livre à l'action :
  // le pilote `pg` rendrait des objets Date, que le code applicatif ne voit
  // jamais.
  const lire = async (mois: string): Promise<Record<string, unknown>[]> =>
    (
      await db.query(
        `select statut, est_quittance, montant_du, montant_couvert,
                to_char(dette_anterieure_periode,'YYYY-MM-DD') as dette_anterieure_periode,
                dette_anterieure_reste
           from public.quittancement_mois($1, $2::date)`,
        [org, mois]
      )
    ).rows;

  const etatLoyers = async (): Promise<EtatAppel[]> =>
    (
      await db.query(
        `select appel_id, to_char(periode,'YYYY-MM-DD') as periode, montant_du, montant_couvert
           from public.etat_loyers_bail($1)`,
        [bail]
      )
    ).rows;

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
    const {
      rows: [o],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Encaissement CR','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'ecr-'||gen_random_uuid()||'@test.local','x', now(),'{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [{ id: locataire }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom) values ($1,'Dubois','Anne') returning id`,
      [org]
    );
    const {
      rows: [bien],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Bien CR','appartement'::public.bien_type,'3 rue CR','75001','Paris') returning id`,
      [org]
    );
    const {
      rows: [lot],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot CR','loue'::public.lot_etat) returning id`,
      [org, bien.id]
    );
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, type, etat,
         loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,$3,'nu'::public.bail_type,'actif'::public.bail_etat,450,50,
               date_trunc('month', current_date - interval '1 month')::date, 5)
       returning id`,
      [org, lot.id, locataire]
    );
    bail = b.id;
    // Deux termes de 500 € : le mois précédent (impayé) et le mois affiché.
    const { rows: periodes } = await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance,
         loyer_hc, charges, montant_du)
       select $1, $2, d::date, (d + interval '4 days')::date, 450, 50, 500
       from generate_series(date_trunc('month', current_date - interval '1 month'),
                            date_trunc('month', current_date),
                            interval '1 month') d
       returning to_char(periode,'YYYY-MM-DD') as periode`,
      [org, bail]
    );
    expect(periodes).toHaveLength(2);
    moisAnterieur = periodes[0].periode;
    moisAffiche = periodes[1].periode;
    await enGerant();
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  it("LE DÉFAUT : le reste du terme affiché part sur la dette antérieure", async () => {
    const avant = await etatLoyers();
    const ligne = avant.find((l) => l.periode === moisAffiche)!;
    const reste = Number(ligne.montant_du) - Number(ligne.montant_couvert);
    expect(reste).toBe(500);

    // Le geste : « Encaisser 500,00 € » sur la ligne du mois AFFICHÉ.
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,$3,current_date,'virement')`,
      [org, bail, reste]
    );
    const apres = await etatLoyers();

    // La règle a fait son office : c'est le terme ANTÉRIEUR qui est soldé.
    const anterieur = apres.find((l) => l.periode === moisAnterieur)!;
    const affiche = apres.find((l) => l.periode === moisAffiche)!;
    expect(Number(anterieur.montant_couvert)).toBe(500);
    expect(Number(affiche.montant_couvert)).toBe(0);

    // Et c'est ce que le compte rendu dit désormais, mot pour mot.
    const rendu = compteRenduEncaissement(reste, avant, apres);
    expect(rendu).toContain(`${moisEnFrancais(moisAnterieur)} soldé, 500,00 € → quittance`);
    expect(rendu).not.toContain(moisEnFrancais(moisAffiche));
  });

  it("le compteur de emettre_quittances vaut 0 après l'INSERT : il ne peut pas servir de compte rendu", async () => {
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,300,current_date,'virement')`,
      [org, bail]
    );
    const {
      rows: [compteurs],
    } = await db.query(`select * from public.emettre_quittances($1)`, [bail]);

    // Le déclencheur a déjà tout fait pendant l'INSERT…
    expect(Number(compteurs.nb_quittances)).toBe(0);
    expect(Number(compteurs.nb_recus)).toBe(0);
    // … alors qu'un REÇU existe bel et bien (RM-3.4.2).
    const { rows: documents } = await db.query(
      `select q.est_quittance, q.montant from public.quittances q where q.bail_id = $1`,
      [bail]
    );
    expect(documents).toHaveLength(1);
    expect(documents[0].est_quittance).toBe(false);
    expect(Number(documents[0].montant)).toBe(300);
  });

  it("quittancement_mois nomme la dette antérieure — de quoi rendre le bouton honnête", async () => {
    const [ligneAffichee] = await lire(moisAffiche);
    expect(ligneAffichee.dette_anterieure_periode).toBe(moisAnterieur);
    expect(Number(ligneAffichee.dette_anterieure_reste)).toBe(500);

    // Sur le terme le plus ancien lui-même, il n'y a rien à signaler : le
    // libellé simple reste juste (geste légitime voisin).
    const [ligneAnterieure] = await lire(moisAnterieur);
    expect(ligneAnterieure.dette_anterieure_periode).toBeNull();
    expect(ligneAnterieure.dette_anterieure_reste).toBeNull();
  });

  it("GESTE LÉGITIME : sans dette antérieure, le terme cliqué est bien soldé et quittancé", async () => {
    // La dette antérieure est réglée d'abord…
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,500,current_date,'virement')`,
      [org, bail]
    );
    const [ligne] = await lire(moisAffiche);
    expect(ligne.dette_anterieure_periode).toBeNull();

    // … puis le terme affiché : il se solde, et il produit une QUITTANCE.
    const avant = await etatLoyers();
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,500,current_date,'virement')`,
      [org, bail]
    );
    const apres = await etatLoyers();
    const rendu = compteRenduEncaissement(500, avant, apres);
    expect(rendu).toContain(`${moisEnFrancais(moisAffiche)} soldé, 500,00 € → quittance`);

    const [apresPaiement] = await lire(moisAffiche);
    expect(apresPaiement.statut).toBe("paye");
    expect(apresPaiement.est_quittance).toBe(true);
  });

  it("une date d'encaissement absente est silencieusement datée du jour (RM-A6.7)", async () => {
    // Pourquoi la conservation de la saisie compte : le champ vide ne laisse
    // pas un trou, il fait entrer la date du jour à la place de celle du relevé.
    const {
      rows: [defaut],
    } = await db.query(
      `select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'encaissements'
          and column_name = 'date_paiement'`
    );
    expect(String(defaut.column_default)).toContain("CURRENT_DATE");

    const {
      rows: [enc],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, mode)
       values ($1,$2,100,'virement') returning date_paiement = current_date as date_du_jour`,
      [org, bail]
    );
    expect(enc.date_du_jour).toBe(true);
  });
});

describe("Date d'un encaissement refusé — la saisie revient dans le champ (RM-A6.7)", () => {
  const rendre = (valeurSoumise?: string) =>
    renderToStaticMarkup(
      createElement(InputDateJour, { name: "date_paiement", valeurSoumise })
    );

  it("repose la date que l'action refusée a renvoyée", () => {
    expect(rendre("2026-08-15")).toContain('value="2026-08-15"');
  });

  it("sans saisie à reposer, le champ reste vide et se remplit à l'hydratation", () => {
    // Le pré-remplissage à « aujourd'hui » est volontairement différé après
    // l'hydratation : inchangé par la correction.
    expect(rendre()).toContain('value=""');
  });
});
