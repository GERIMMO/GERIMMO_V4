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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compteRenduEncaissement,
  imputationsRealisees,
  type EtatAppel,
} from "../src/lib/imputation";
import { moisEnFrancais } from "../src/lib/ged";
import { InputDateJour } from "../src/components/input-date-jour";
import {
  QuittancementMois,
  type LigneQuittancement,
} from "@/app/agence/[orgId]/comptabilite/quittancement-mois";

// ── Deux bancs d'essai, pour tenir les DEUX moitiés du défaut ──────────────
//
// Le compte rendu ne vaut que s'il remonte jusqu'à l'œil de l'agent. Or les
// tests purs ne prouvent que la fabrication du message : la fonction
// quittancement_mois et le composant peuvent revenir en arrière sans qu'un
// seul d'entre eux tombe. D'où ces deux bancs.
//
// 1. L'ÉCRAN. En rendu serveur, useActionState rend toujours l'état INITIAL :
//    on ne peut donc pas observer le succès d'une action sans poser cet état
//    soi-même. C'est tout ce que ce doublage fait — le reste de React est le
//    vrai (react-dom/server continue de s'appuyer dessus).
const etatSimule = vi.hoisted(() => ({
  valeur: {} as { succes?: string; erreur?: string },
}));
vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  return { ...reel, useActionState: () => [etatSimule.valeur, () => {}, false] };
});

// 2. L'ACTION, jouée pour de vrai contre la base locale : seuls
//    l'authentification (déjà posée dans la transaction par set_config) et le
//    cache Next sont remplacés. Le reste — l'état d'avant, l'INSERT, le
//    déclencheur, l'état d'après — est celui de la production.
const banc = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    supabase: supabaseSurLaBase(),
    user: { id: "gerant-simule" },
    role: "admin_agence",
  }),
}));

// Le client que l'action croit être PostgREST : les mêmes appels, exécutés sur
// la connexion pg du test — donc dans SA transaction et sous SON rôle.
function supabaseSurLaBase() {
  const db = banc.db as Client;
  return {
    rpc: async (nom: string, args: Record<string, string>) => {
      if (nom === "etat_loyers_bail")
        return {
          data: (
            await db.query(
              `select appel_id, to_char(periode,'YYYY-MM-DD') as periode, montant_du,
                      montant_couvert, statut
                 from public.etat_loyers_bail($1)`,
              [args.p_bail]
            )
          ).rows,
          error: null,
        };
      if (nom === "emettre_quittances")
        return {
          data: (await db.query(`select * from public.emettre_quittances($1)`, [args.p_bail])).rows,
          error: null,
        };
      throw new Error(`Appel non prévu par le banc d'essai : ${nom}`);
    },
    from: (table: string) => ({
      insert: async (v: Record<string, unknown>) => {
        // Fidélité au vrai client : PostgREST sérialise en JSON, donc une clé
        // `undefined` n'est PAS transmise et la colonne garde son défaut — ce
        // qui est précisément le piège de date_paiement (CURRENT_DATE).
        const champs = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
        const colonnes = Object.keys(champs);
        await db.query(
          `insert into public.${table} (${colonnes.join(", ")})
           values (${colonnes.map((_, i) => `$${i + 1}`).join(", ")})`,
          colonnes.map((c) => champs[c])
        );
        return { error: null };
      },
    }),
  };
}

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
    // L'action jouée plus bas écrit dans CETTE transaction, donc sous le même
    // rôle et le même rollback que les tests SQL voisins.
    banc.db = db;
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

  const appelDuMois = async (mois: string): Promise<string> =>
    (
      await db.query(
        `select id from public.appels_loyer where bail_id = $1 and periode = $2::date`,
        [bail, mois]
      )
    ).rows[0].id;

  it("L'ACTION nomme le terme antérieur — et ne dit plus « aucun reçu ni quittance à émettre »", async () => {
    // Le geste complet, pas seulement sa règle : c'est encaisserReste qui
    // rendait le message, et c'est lui qui mentait. Le compteur de documents
    // dont il tirait sa phrase vaut 0 (le déclencheur a déjà tout fait), si
    // bien qu'il annonçait l'inverse de ce qui venait de se produire.
    const { encaisserReste } = await import("@/app/actions/quittancement");
    const resultat = await encaisserReste(org, bail, await appelDuMois(moisAffiche));

    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toContain(`${moisEnFrancais(moisAnterieur)} soldé, 500,00 € → quittance`);
    expect(resultat.succes).not.toContain(moisEnFrancais(moisAffiche));
    expect(resultat.succes).not.toContain("aucun reçu ni quittance à émettre");
  });

  it("GESTE LÉGITIME par l'action : sans dette antérieure, le terme cliqué est soldé et quittancé", async () => {
    const { encaisserReste } = await import("@/app/actions/quittancement");
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,500,current_date,'virement')`,
      [org, bail]
    );
    const resultat = await encaisserReste(org, bail, await appelDuMois(moisAffiche));

    expect(resultat.succes).toContain(`${moisEnFrancais(moisAffiche)} soldé, 500,00 € → quittance`);
    const [ligne] = await lire(moisAffiche);
    expect(ligne.statut).toBe("paye");
    expect(ligne.est_quittance).toBe(true);
  });

  it("L'AUTRE porte d'entrée — la saisie détaillée rend le même compte rendu, à la date du relevé", async () => {
    // Deux écrans encaissent : le quittancement (un clic) et la fiche du bail
    // (saisie détaillée). Le second passe une date ; elle doit entrer telle
    // quelle — « la banque fait foi sur les montants et les dates » (RM-A6.7).
    const { ajouterEncaissement } = await import("@/app/actions/loyers");
    const dateReleve = `${moisAnterieur.slice(0, 8)}15`;
    const saisie = new FormData();
    saisie.set("montant", "500");
    saisie.set("date_paiement", dateReleve);
    saisie.set("mode", "virement");
    const resultat = await ajouterEncaissement(org, bail, {}, saisie);

    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toContain(`${moisEnFrancais(moisAnterieur)} soldé, 500,00 € → quittance`);
    expect(resultat.succes).not.toContain("aucun reçu ni quittance à émettre");

    const {
      rows: [ecrit],
    } = await db.query(
      `select to_char(date_paiement,'YYYY-MM-DD') as date_paiement,
              date_paiement = current_date as date_du_jour
         from public.encaissements where bail_id = $1`,
      [bail]
    );
    expect(ecrit.date_paiement).toBe(dateReleve);
    expect(ecrit.date_du_jour).toBe(false);
  });

  it("REFUSÉE, la saisie détaillée rend la date pour que le champ la repose (RM-A6.7)", async () => {
    // Le maillon que le rendu du champ ne prouve pas : sans `valeurs` renvoyées
    // par l'action, InputDateJour n'a rien à reposer et la base redate du jour.
    const { ajouterEncaissement } = await import("@/app/actions/loyers");
    const saisie = new FormData();
    saisie.set("montant", "0");
    saisie.set("date_paiement", "2026-08-15");
    const resultat = await ajouterEncaissement(org, bail, {}, saisie);

    expect(resultat.erreur).toBe("Montant invalide.");
    expect(resultat.valeurs?.date_paiement).toBe("2026-08-15");
  });

  it("quittancement_mois reste borné au portefeuille de l'agent restreint", async () => {
    // La fonction a été réécrite : sa garde de portefeuille explicite a disparu
    // du WHERE et ne tient plus que par celle d'etat_loyers_bail, appelée dans
    // le lateral. Rien ne l'empêcherait de repartir — sauf ce test.
    expect(await lire(moisAffiche)).toHaveLength(1);

    // Créer un compte demande les droits de l'installateur, pas ceux du gérant.
    await db.query("reset role");
    const {
      rows: [{ id: agent }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'ecr-agent-'||gen_random_uuid()||'@test.local','x', now(),'{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    // Agent sans aucun mandat : portefeuille vide, donc tout bail lui est étranger.
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'agent')`,
      [agent, org]
    );
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [agent]
    );
    await db.query("set local role authenticated");

    expect((await db.query(`select public.bail_hors_portefeuille($1,$2) as hors`, [org, bail])).rows[0].hors).toBe(true);
    expect(await lire(moisAffiche)).toHaveLength(0);
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

describe("L'écran de quittancement — il dit ce qu'il vient de faire, et ne promet rien d'autre", () => {
  // Une ligne d'août dont la dette est ailleurs : le cas du défaut.
  const ligneAvecDetteAnterieure: LigneQuittancement = {
    bail_id: "b-1",
    appel_id: "a-aout",
    lot_id: "l-1",
    lot_nom: "Lot 1",
    locataire: "Anne Dubois",
    montant_du: 500,
    montant_couvert: 0,
    statut: "impaye",
    quittance_id: null,
    est_quittance: null,
    email_envoye_at: null,
    dette_anterieure_periode: JUILLET,
    dette_anterieure_reste: 500,
  };

  const rendre = (ligne: LigneQuittancement) =>
    renderToStaticMarkup(
      createElement(QuittancementMois, {
        orgId: "o-1",
        mois: "2026-08",
        moisLabel: "août 2026",
        lignes: [ligne],
      })
    );

  // Le libellé du bouton, découpé dans le rendu : c'est la promesse faite à
  // l'agent avant le clic.
  const libelleDuBouton = (html: string) => /Encaisser[^<]*/.exec(html)?.[0] ?? "";

  // Le doublage de useActionState sert le MÊME état à toutes les actions de la
  // carte, envoi groupé compris — dont le bandeau est rendu en tête. Chercher
  // le compte rendu dans la carte entière le trouverait donc là, et passerait
  // même si la LIGNE le jetait : on ne regarde que les lignes.
  const corpsDesLignes = (html: string) => html.slice(html.indexOf("<ul"));

  it("promet le terme que la base servira VRAIMENT, et chiffre la dette antérieure", () => {
    const html = rendre(ligneAvecDetteAnterieure);
    expect(libelleDuBouton(html)).toContain("500,00 €");
    expect(libelleDuBouton(html)).toContain("juillet 2026");
    expect(html).toContain("500,00 € de dette antérieure");
  });

  it("GESTE LÉGITIME : sans dette antérieure, le bouton garde son libellé simple", () => {
    const html = rendre({
      ...ligneAvecDetteAnterieure,
      dette_anterieure_periode: null,
      dette_anterieure_reste: null,
    });
    expect(libelleDuBouton(html)).toBe("Encaisser 500,00 €");
    expect(html).not.toContain("de dette antérieure");
  });

  it("AFFICHE le compte rendu que l'action lui rend — il n'est plus jeté", () => {
    etatSimule.valeur = {
      succes: "500,00 € encaissés · imputés du terme le plus ancien au plus récent (RM-3.3.2) : juillet 2026 soldé, 500,00 € → quittance.",
    };
    try {
      expect(corpsDesLignes(rendre(ligneAvecDetteAnterieure))).toContain(
        "juillet 2026 soldé, 500,00 € → quittance"
      );
    } finally {
      etatSimule.valeur = {};
    }
  });

  it("le compte rendu SURVIT au basculement de la ligne en « payé »", () => {
    // C'est là que le message disparaissait : l'encaissement réussi retire le
    // bouton de l'arbre, et l'état qu'il portait partait avec lui.
    etatSimule.valeur = { succes: "500,00 € encaissés · juillet 2026 soldé, 500,00 € → quittance." };
    try {
      const lignes = corpsDesLignes(
        rendre({
          ...ligneAvecDetteAnterieure,
          statut: "paye",
          montant_couvert: 500,
          quittance_id: "q-1",
          est_quittance: true,
          dette_anterieure_periode: null,
          dette_anterieure_reste: null,
        })
      );
      expect(lignes).not.toContain("Encaisser");
      expect(lignes).toContain("juillet 2026 soldé, 500,00 € → quittance");
    } finally {
      etatSimule.valeur = {};
    }
  });
});
