/**
 * Audit 2026-09-10 — non-régression du durcissement.
 * Chaque test rejoue l'abus constaté et vérifie qu'il est désormais refusé,
 * sans empêcher le geste légitime. Transaction annulée à la fin.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Audit 2026-09-10 — durcissement", () => {
  let db: Client;
  let org: string;
  let lot: string;
  let bail: string;
  let gerant: string;

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
      `insert into public.organizations (name, status) values ('Durci','active') returning id`
    );
    org = o.id;
    const {
      rows: [{ id: compte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'durci-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    gerant = compte;
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, org]
    );
    const {
      rows: [bien],
    } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Bien durci','appartement'::public.bien_type,'1 rue D','75001','Paris') returning id`,
      [org]
    );
    const {
      rows: [l],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot durci','loue'::public.lot_etat) returning id`,
      [org, bien.id]
    );
    lot = l.id;
    const {
      rows: [b],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,current_date - 90, 5) returning id`,
      [org, lot]
    );
    bail = b.id;
  });

  async function enGerant() {
    await db.query("reset role");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [gerant]
    );
    await db.query("set local role authenticated");
  }

  it("un encaissement ne se modifie plus : on supprime et on ressaisit (RM-A6.3)", async () => {
    const {
      rows: [enc],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,650,current_date,'virement') returning id`,
      [org, bail]
    );
    await enGerant();
    await db.query("savepoint s");
    await expect(
      db.query(`update public.encaissements set montant = 5000 where id = $1`, [enc.id])
    ).rejects.toThrow(/permission denied|refus|denied/i);
    await db.query("rollback to savepoint s");
    // Le geste légitime reste ouvert
    await db.query(`delete from public.encaissements where id = $1`, [enc.id]);
  });

  it("une écriture ne se contre-passe qu'une fois", async () => {
    const {
      rows: [e],
    } = await db.query(
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
         date_imputation, libelle, bail_id, lot_id)
       values ($1,'loyer','recette',300,current_date,current_date,'Origine',$2,$3) returning id`,
      [org, bail, lot]
    );
    const contre = (motif: string) =>
      db.query(
        `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
           date_imputation, libelle, bail_id, lot_id, contre_ecriture_de)
         values ($1,'loyer','depense',300,current_date,current_date,$2,$3,$4,$5)`,
        [org, motif, bail, lot, e.id]
      );
    await contre("Annulation 1");
    await db.query("savepoint s");
    await expect(contre("Annulation 2")).rejects.toThrow(/duplicate|unique/i);
    await db.query("rollback to savepoint s");
  });

  it("un lot ne porte jamais deux baux vivants", async () => {
    // Un échec de contrainte avorte la transaction : on isole par un point de
    // reprise, sinon les vérifications suivantes ne peuvent plus s'exécuter.
    await db.query("savepoint s");
    await expect(
      db.query(
        `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
         values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,current_date,5)`,
        [org, lot]
      )
    ).rejects.toThrow(/duplicate|unique/i);
    await db.query("rollback to savepoint s");
    // Un bail terminé sur le même lot reste possible (l'historique vit)
    await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'termine'::public.bail_etat,600,50,current_date - 400,5)`,
      [org, lot]
    );
  });

  it("une révision IRL ne se rejoue pas à la même date d'effet", async () => {
    const revise = () =>
      db.query(
        `insert into public.revisions_loyer (organization_id, bail_id, date_effet,
           irl_reference, irl_nouveau, ancien_loyer, nouveau_loyer)
         values ($1,$2,current_date,100,103,600,618)`,
        [org, bail]
      );
    await revise();
    await db.query("savepoint s");
    await expect(revise()).rejects.toThrow(/duplicate|unique/i);
    await db.query("rollback to savepoint s");
  });

  it("la quittance n'est plus forgeable : seul l'horodatage d'envoi est écrit", async () => {
    const {
      rows: [a],
    } = await db.query(
      `insert into public.appels_loyer (organization_id, bail_id, periode, date_echeance,
         loyer_hc, charges, montant_du)
       values ($1,$2,date_trunc('month',current_date)::date,current_date,600,50,650) returning id`,
      [org, bail]
    );
    const {
      rows: [q],
    } = await db.query(
      `insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
       values ($1,$2,$3,false,100) returning id`,
      [org, bail, a.id]
    );
    await enGerant();
    await db.query("savepoint s");
    await expect(
      db.query(`update public.quittances set est_quittance = true where id = $1`, [q.id])
    ).rejects.toThrow(/permission denied|denied/i);
    await db.query("rollback to savepoint s");
    // L'envoi, lui, reste enregistrable par l'application
    await db.query(`update public.quittances set email_envoye_at = now() where id = $1`, [q.id]);
  });

  it("le dépôt ne s'encaisse plus sur un bail terminé ni après le décompte (RM-2.1.3, RM-2.7.3)", async () => {
    // Le dépôt est « encaissé à l'entrée, restitué à la sortie » (RM-2.1.3) :
    // passé la sortie, l'encaisser rouvre de l'argent déjà rendu et fabrique
    // une écriture de recette au journal. Bornes : bail terminé, et décompte
    // de restitution finalisé (figé après envoi, RM-2.7.3).
    await db.query(`update public.baux set depot_garantie = 600 where id = $1`, [bail]);
    // Bail terminé sur le même lot (l'historique cohabite avec le bail vivant)
    const {
      rows: [fini],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges,
         depot_garantie, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'termine'::public.bail_etat,600,50,600,current_date - 400,5)
       returning id`,
      [org, lot]
    );
    // Bail encore en préavis, mais décompte de restitution déjà finalisé
    const {
      rows: [lotSortie],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       select organization_id, bien_id, 'Lot sortie', 'preavis'::public.lot_etat
         from public.lots where id = $1 returning id`,
      [lot]
    );
    const {
      rows: [sortant],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges,
         depot_garantie, date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'preavis'::public.bail_etat,600,50,600,current_date - 400,5)
       returning id`,
      [org, lotSortie.id]
    );
    await db.query(
      `insert into public.restitutions (organization_id, bail_id, date_remise_cles,
         delai_mois, depot, statut)
       values ($1,$2,current_date,1,600,'finalise')`,
      [org, sortant.id]
    );
    await enGerant();
    // Un échec avorte la transaction : chaque refus est isolé par un point de reprise
    await db.query("savepoint s");
    await expect(
      db.query(`select public.encaisser_depot($1,600,current_date,'virement',null,null)`, [fini.id])
    ).rejects.toThrow(/terminé/i);
    await db.query("rollback to savepoint s");
    await db.query("savepoint s");
    await expect(
      db.query(`select public.encaisser_depot($1,600,current_date,'virement',null,null)`, [
        sortant.id,
      ])
    ).rejects.toThrow(/finalisé/i);
    await db.query("rollback to savepoint s");
    // Le geste légitime passe toujours : encaissement (même partiel) sur un bail vivant
    const {
      rows: [{ cumul }],
    } = await db.query(
      `select public.encaisser_depot($1,300,current_date,'virement',null,null) as cumul`,
      [bail]
    );
    expect(Number(cumul)).toBe(300);
    const ecr = await db.query(
      `select count(*)::int as n from public.ecritures
        where bail_id = $1 and categorie = 'depot_garantie' and sens = 'recette'`,
      [bail]
    );
    expect(ecr.rows[0].n).toBe(1);

    // Les portes de service (vérification adversariale) : la règle ne doit pas
    // tenir qu'à la fonction, sinon il suffit de ne pas passer par elle.
    // 1. Écriture directe en table : aucune policy INSERT sur depot_encaissements.
    await db.query("savepoint s");
    await expect(
      db.query(
        `insert into public.depot_encaissements
           (organization_id, bail_id, montant, date_encaissement, moyen)
         values ($1,$2,600,current_date,'virement')`,
        [org, fini.id]
      )
    ).rejects.toThrow(/depot_encaissements/i);
    await db.query("rollback to savepoint s");
    // 2. Le décompte arrêté ne se déverrouille pas : ni suppression, ni retour
    //    « en cours » (aucune policy d'écriture sur restitutions) — sans quoi la
    //    seconde borne se dissoudrait d'un UPDATE (RM-2.7.3).
    const efface = await db.query(`delete from public.restitutions where bail_id = $1`, [
      sortant.id,
    ]);
    expect(efface.rowCount).toBe(0);
    const rouvre = await db.query(
      `update public.restitutions set statut = 'en_cours' where bail_id = $1`,
      [sortant.id]
    );
    expect(rouvre.rowCount).toBe(0);
  });

  it("une fonction déclencheur ne s'accroche plus à une table forgée (advisor 2026-09-10)", async () => {
    // Le droit EXECUTE sur une fonction déclencheur n'autorise pas l'appel direct
    // (Postgres le refuse), mais il autorise à la POSER en déclencheur sur une
    // table à soi. anon et authenticated ayant TEMPORARY sur la base, anon
    // accrochait contre_passer_depot_encaissement() — SECURITY DEFINER, donc
    // exécutée sous postgres, hors RLS — à une table temporaire et forgeait une
    // contre-écriture dans le journal d'une autre agence (RM-A1.6/A1.10 ;
    // contre-écriture sans motif ni auteur légitime : RM-A6.3/A6.4/A6.6).
    const depot = await db.query(
      `insert into public.depot_encaissements (organization_id, bail_id, montant, date_encaissement, moyen)
       values ($1,$2,1200,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(
      `insert into public.ecritures (organization_id, bail_id, lot_id, categorie, sens, montant,
         date_piece, date_imputation, libelle, systeme, depot_encaissement_id)
       values ($1,$2,$3,'depot_garantie','recette',1200,current_date,current_date,
               'Encaissement du dépôt',true,$4)`,
      [org, bail, lot, depot.rows[0].id]
    );

    // L'ABUS : anon, sans compte ni adhésion, avec l'identifiant en dur.
    const fonctions = [
      "contre_passer_depot_encaissement",
      "garde_portefeuille_agent",
      "mandat_titulaire_protege",
    ];
    for (const [i, fn] of fonctions.entries()) {
      // Le refus avorte la transaction : chaque tentative a son point de reprise.
      await db.query("savepoint anon_trigger");
      await db.query("reset role");
      await db.query("set local role anon");
      await db.query(`create temp table piege_${i} (id uuid)`);
      await expect(
        db.query(
          `create trigger abus before delete on piege_${i}
             for each row execute function public.${fn}()`
        )
      ).rejects.toThrow(/permission denied/i);
      await db.query("rollback to savepoint anon_trigger");
    }
    await db.query("reset role");

    // LE GESTE LÉGITIME reste entier : un déclencheur s'exécute sous le
    // propriétaire de la fonction, la révocation ne l'atteint pas.
    // 1. Le gérant supprime l'encaissement → contre-passation automatique.
    await enGerant();
    await db.query(`delete from public.depot_encaissements where id = $1`, [depot.rows[0].id]);
    await db.query("reset role");
    const contre = await db.query(
      `select count(*)::int as n from public.ecritures
        where organization_id = $1 and contre_ecriture_de is not null`,
      [org]
    );
    expect(contre.rows[0].n).toBe(1);

    // 2. L'administrateur d'agence désigne toujours le titulaire d'un mandat
    //    (RM-18.1.4) : mandat_titulaire_protege() mord encore, sans le bloquer.
    const personne = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Bailleur') returning id`,
      [org]
    );
    const mandat = await db.query(
      `insert into public.mandats (organization_id, person_id, etat, date_debut)
       values ($1,$2,'actif',current_date) returning id`,
      [org, personne.rows[0].id]
    );
    await enGerant();
    await db.query(`update public.mandats set agent_account_id = $1 where id = $2`, [
      gerant,
      mandat.rows[0].id,
    ]);
    await db.query("reset role");
    const titulaire = await db.query(`select agent_account_id from public.mandats where id = $1`, [
      mandat.rows[0].id,
    ]);
    expect(titulaire.rows[0].agent_account_id).toBe(gerant);

    // 3. Plus aucune fonction déclencheur du schéma public n'est exécutable
    //    par anon ou authenticated : la surface publique est l'API, rien d'autre.
    const restes = await db.query(
      `select count(*)::int as n from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and pg_get_function_result(p.oid) = 'trigger'
          and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))`
    );
    expect(restes.rows[0].n).toBe(0);
  });

  it("on ne clôture qu'un mois révolu : ni le mois en cours, ni un mois futur (RM-4.4.1, RM-4.1.5)", async () => {
    // La clôture verrouille définitivement la période (RM-4.4.1) et plus aucune
    // écriture ne peut y être ajoutée (RM-4.4.2). Clôturer le mois EN COURS fige
    // donc une comptabilité incomplète : tout ce qui s'encaisse les jours
    // suivants du même mois tombe dans un mois déjà clos. Clôturer un mois FUTUR
    // supprime la période d'accueil que suppose RM-4.1.5 (« une écriture sur
    // période clôturée s'impute sur la période ouverte suivante »).
    const mois = (decalage: string) =>
      `(date_trunc('month', current_date) ${decalage})::date`;
    await enGerant();

    // L'ABUS 1 : le mois en cours. Un refus avorte la transaction, chaque
    // tentative a donc son point de reprise.
    await db.query("savepoint cloture");
    await expect(
      db.query(`select public.cloturer_mois($1, ${mois("+ interval '0 month'")})`, [org])
    ).rejects.toThrow(/non révolu/i);
    await db.query("rollback to savepoint cloture");

    // L'ABUS 1bis : le dernier jour du mois en cours — le mois n'est achevé qu'à minuit.
    await db.query("savepoint cloture");
    await expect(
      db.query(
        `select public.cloturer_mois($1, (date_trunc('month', current_date)
           + interval '1 month' - interval '1 day')::date)`,
        [org]
      )
    ).rejects.toThrow(/non révolu/i);
    await db.query("rollback to savepoint cloture");

    // L'ABUS 2 : des mois futurs, jusqu'à l'an prochain.
    for (const futur of ["+ interval '1 month'", "+ interval '3 months'", "+ interval '15 months'"]) {
      await db.query("savepoint cloture");
      await expect(
        db.query(`select public.cloturer_mois($1, ${mois(futur)})`, [org])
      ).rejects.toThrow(/non révolu/i);
      await db.query("rollback to savepoint cloture");
    }
    const {
      rows: [{ n: aucune }],
    } = await db.query(
      `select count(*)::int as n from public.clotures_comptables where organization_id = $1`,
      [org]
    );
    expect(aucune).toBe(0);

    // LE GESTE LÉGITIME reste entier — c'est le geste normal de fin de mois :
    // clôturer le mois écoulé (identique, au calendrier près, à la clôture du
    // mois précédent le 1er du mois suivant), et rattraper plusieurs mois d'un
    // coup (variante V5 « clôture rétroactive » du parcours 4.4).
    for (const passe of ["- interval '1 month'", "- interval '2 months'", "- interval '3 months'"]) {
      await db.query(`select public.cloturer_mois($1, ${mois(passe)})`, [org]);
    }
    const {
      rows: [{ n: closes }],
    } = await db.query(
      `select count(*)::int as n from public.clotures_comptables where organization_id = $1`,
      [org]
    );
    expect(closes).toBe(3);

    // Et la comptabilité du mois en cours reste vivante : une écriture du jour
    // entre toujours, tandis que le mois clos, lui, la refuse.
    await db.query(
      `insert into public.ecritures (organization_id, bail_id, lot_id, categorie, sens,
         montant, date_piece, date_imputation, libelle)
       values ($1,$2,$3,'loyer','recette',650,current_date,current_date,'Loyer du jour')`,
      [org, bail, lot]
    );
    await db.query("savepoint cloture");
    await expect(
      db.query(
        `insert into public.ecritures (organization_id, bail_id, lot_id, categorie, sens,
           montant, date_piece, date_imputation, libelle)
         values ($1,$2,$3,'loyer','recette',650,current_date,${mois("- interval '1 month'")},'Loyer du mois clos')`,
        [org, bail, lot]
      )
    ).rejects.toThrow(/Mois clôturé/i);
    await db.query("rollback to savepoint cloture");

    // L'ABUS 3 (revue adversariale) : les bornes infinies. L'appel RPC est
    // atteignable sans passer par le champ « mois » de l'écran, et Postgres
    // accepte 'infinity' / '-infinity' comme dates. '-infinity' se glissait sous
    // la garde — il est bien « antérieur au mois courant » — et écrivait une
    // ligne de clôture que personne ne sait lire ; 'infinity' était refusé, mais
    // par un message dégénéré (« <NULL> n'est pas achevé »). Une clôture porte
    // sur un mois du calendrier, pas sur une borne infinie.
    for (const borne of ["-infinity", "infinity"]) {
      await db.query("savepoint cloture");
      await expect(
        db.query(`select public.cloturer_mois($1, $2::date)`, [org, borne])
      ).rejects.toThrow(/mois du calendrier/i);
      await db.query("rollback to savepoint cloture");
    }
    // Aucune borne infinie n'a laissé de trace : les trois mois passés, et rien d'autre.
    const {
      rows: [{ n: toujoursTrois }],
    } = await db.query(
      `select count(*)::int as n from public.clotures_comptables
        where organization_id = $1 and isfinite(mois)`,
      [org]
    );
    expect(toujoursTrois).toBe(3);
    const {
      rows: [{ n: infinies }],
    } = await db.query(
      `select count(*)::int as n from public.clotures_comptables
        where organization_id = $1 and not isfinite(mois)`,
      [org]
    );
    expect(infinies).toBe(0);
    await db.query("reset role");
  });

  // ------------------------------------------------------------------
  // L'ABUS : course check-then-insert sur initialiser_espace_proprietaire().
  // La fonction lisait l'adhésion, puis insérait. Deux appels concurrents —
  // double-clic sur /espaces, retry réseau, deux onglets — ne se voient pas :
  // rejoué le 2026-09-10 à deux connexions (la seconde appelant la fonction
  // pendant que la première n'avait pas encore committé), le même compte
  // repartait avec DEUX organisations « Parc de … ». Un espace fantôme, et
  // l'exclusivité propriétaire direct / mandant — qui se raisonne espace par
  // espace — contournable. L'unicité est désormais portée par la base
  // (index unique partiel), pas par une lecture applicative : ce test rejoue
  // le résultat exact que la course committait et le voit refusé.
  // ------------------------------------------------------------------
  it("espace propriétaire direct : un compte n'en a qu'un, et l'unicité vient de la base", async () => {
    const compteAuth = `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'durci-pd-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb, $1::jsonb, now(), now(),
         '','','','','')
       returning id`;
    const {
      rows: [{ id: compte }],
    } = await db.query(compteAuth, ['{"nom":"Sarda","prenom":"Louise"}']);

    const enProprietaire = async (uid: string) => {
      await db.query("reset role");
      await db.query(
        `select set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
        [uid]
      );
      await db.query("set local role authenticated");
    };

    // LE GESTE LÉGITIME : le propriétaire ouvre son espace ; le rechargement de
    // /espaces (second appel) lui rend le MÊME — l'idempotence promise au S9a.
    await enProprietaire(compte);
    const {
      rows: [{ org: espace }],
    } = await db.query(`select public.initialiser_espace_proprietaire() as org`);
    const {
      rows: [{ org: encore }],
    } = await db.query(`select public.initialiser_espace_proprietaire() as org`);
    expect(encore).toBe(espace);
    await db.query("reset role");

    // L'ABUS dans son résultat exact : une seconde organisation de type
    // propriétaire direct et une seconde adhésion active pour le même compte.
    const {
      rows: [{ id: fantome }],
    } = await db.query(
      `insert into public.organizations (name, type, status)
       values ('Parc fantôme','proprietaire_direct','essai') returning id`
    );
    await db.query("savepoint espace_pd");
    await expect(
      db.query(
        `insert into public.memberships (account_id, organization_id, role)
         values ($1,$2,'proprietaire_direct')`,
        [compte, fantome]
      )
    ).rejects.toThrow(/memberships_un_seul_espace_proprietaire/);
    await db.query("rollback to savepoint espace_pd");
    const {
      rows: [{ n: espaces }],
    } = await db.query(
      `select count(*)::int as n from public.memberships
        where account_id = $1 and role = 'proprietaire_direct' and status = 'active'`,
      [compte]
    );
    expect(espaces).toBe(1);

    // C'est bien une contrainte de base — index UNIQUE, partiel, sur le compte —
    // et non un verrou applicatif que deux transactions se partageraient mal.
    const {
      rows: [index],
    } = await db.query(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'memberships'
          and indexname = 'memberships_un_seul_espace_proprietaire'`
    );
    expect(index.indexdef).toMatch(/UNIQUE/);
    expect(index.indexdef).toMatch(/proprietaire_direct/);

    // LES GESTES LÉGITIMES VOISINS restent entiers.
    // 1. L'adhésion inactivée du propriétaire devenu mandant cohabite avec une
    //    adhésion active : sans cela, aucun retour en gestion directe.
    await db.query(
      `insert into public.memberships (account_id, organization_id, role, status)
       values ($1,$2,'proprietaire_direct','inactive')`,
      [compte, fantome]
    );
    // 2. Le même compte reste par ailleurs agent d'une agence.
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'agent')`,
      [compte, org]
    );
    // 3. Un autre compte ouvre son propre espace, sans être gêné par le premier.
    const {
      rows: [{ id: voisin }],
    } = await db.query(compteAuth, ['{"nom":"Nguyen","prenom":"Paul"}']);
    await enProprietaire(voisin);
    const {
      rows: [{ org: espaceVoisin }],
    } = await db.query(`select public.initialiser_espace_proprietaire() as org`);
    expect(espaceVoisin).not.toBe(espace);
    await db.query("reset role");
    const {
      rows: [{ n: parcs }],
    } = await db.query(
      `select count(*)::int as n from public.memberships
        where account_id in ($1,$2) and role = 'proprietaire_direct' and status = 'active'`,
      [compte, voisin]
    );
    expect(parcs).toBe(2);
  });

  // ------------------------------------------------------------------
  // Le rôle anon n'écrit plus rien (migration 20260910174000)
  // 26 tables de `public` accordaient encore à anon l'ACL complète
  // (insert/update/delete/truncate/references/trigger) : la seule barrière
  // était le `qual` des politiques RLS. Or la RLS NE S'APPLIQUE PAS au
  // TRUNCATE — rejoué en local, `truncate public.encaissements` passait sous
  // `set local role anon`. Le socle exige que l'anonyme soit refusé AVANT la
  // RLS (RM-A1.6/A1.7, wiki/regles-metier/Isolation multi-organisation ;
  // RM-A4.6, wiki/regles-metier/Socle de sécurité).
  // ------------------------------------------------------------------
  it("anon n'écrit plus dans aucune table, sauf le formulaire de devis du site vitrine", async () => {
    // L'ABUS : un visiteur sans session, avec des identifiants EN DUR — c'est
    // tout ce dont dispose un attaquant muni de la seule clé publiable.
    // Le refus attendu nomme LA TABLE : « permission denied for table X ».
    // Un simple /permission denied/ ne mordrait pas — rejoué en local avec les
    // privilèges rétablis, le `delete quittances` échoue déjà sur « permission
    // denied for FUNCTION org_ids_avec_roles » (le qual de la politique), ce qui
    // satisferait un motif trop lâche sans que le privilège soit fermé.
    const abus: [string, string, string][] = [
      // TRUNCATE : hors de portée de la RLS, seul le privilège comptait.
      ["truncate encaissements", "truncate table public.encaissements", "encaissements"],
      ["truncate quittances", "truncate table public.quittances", "quittances"],
      ["truncate clôtures", "truncate table public.clotures_comptables", "clotures_comptables"],
      // TRUNCATE ... CASCADE : les rares tables que protégeait une clé
      // étrangère ne tenaient que par elle.
      [
        "truncate appels_loyer cascade",
        "truncate table public.appels_loyer cascade",
        "appels_loyer",
      ],
      // INSERT / UPDATE / DELETE : refusés désormais au privilège, plus bas
      // que la politique.
      [
        "insert messages",
        `insert into public.messages (organization_id, person_id, auteur, texte)
           values ('11111111-1111-1111-1111-111111111111',
                   '22222222-2222-2222-2222-222222222222','gerant','abus')`,
        "messages",
      ],
      [
        "delete quittances",
        `delete from public.quittances where id = '33333333-3333-3333-3333-333333333333'`,
        "quittances",
      ],
      ["update site_pages", `update public.site_pages set slug = 'pirate'`, "site_pages"],
      // Écriture masquée dans une CTE : le privilège se vérifie quand même.
      [
        "delete quittances via CTE",
        `with x as (delete from public.quittances
                     where id = '33333333-3333-3333-3333-333333333333' returning 1)
         select count(*) from x`,
        "quittances",
      ],
      // ON CONFLICT DO UPDATE sur la seule table encore ouverte : l'insertion
      // du formulaire vitrine ne doit pas se muer en droit de modification.
      [
        "upsert demandes_devis",
        `insert into public.demandes_devis (id, nom, email)
           values ('44444444-4444-4444-4444-444444444444','X','x@exemple.fr')
           on conflict (id) do update set nom = 'pirate'`,
        "demandes_devis",
      ],
      // TRIGGER : poser un déclencheur sur une table qu'on ne possède pas.
      [
        "trigger sur quittances",
        `create trigger abus_anon before delete on public.quittances
           for each row execute function public.log_tech()`,
        "quittances",
      ],
    ];
    for (const [nom, sql, table] of abus) {
      // Un refus de privilège avorte la transaction : point de reprise par abus.
      await db.query("savepoint anon_ecriture");
      await db.query("reset role");
      await db.query(
        `select set_config('request.jwt.claims', json_build_object('role','anon')::text, true)`
      );
      await db.query("set local role anon");
      await expect(db.query(sql), nom).rejects.toThrow(
        new RegExp(`permission denied for table ${table}`, "i")
      );
      await db.query("rollback to savepoint anon_ecriture");
    }
    await db.query("reset role");

    // L'invariant de catalogue : dans `public`, la seule écriture qu'anon
    // conserve est l'insertion des demandes de devis.
    const { rows: restes } = await db.query(
      `select c.relname || '/' || p.priv as reste
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         cross join lateral (values ('INSERT'),('UPDATE'),('DELETE'),
                                    ('TRUNCATE'),('REFERENCES'),('TRIGGER')) as p(priv)
        where n.nspname = 'public'
          and c.relkind in ('r','p')
          and has_table_privilege('anon', c.oid, p.priv)
          and not (c.relname = 'demandes_devis' and p.priv = 'INSERT')
        order by 1`
    );
    expect(
      restes,
      `anon garde des écritures : ${restes.map((r) => r.reste).join(", ")}`
    ).toHaveLength(0);

    // L'invariant de DURABILITÉ : le balayage ci-dessus ne vaut que pour les
    // tables du jour. La brèche venait des PRIVILÈGES PAR DÉFAUT du schéma —
    // seule origine possible des 26 tables constatées, puisque aucune migration
    // ne porte de `grant` de table à anon (20260906130000 crée demandes_devis
    // avec sa politique `to anon` et sans grant : sans ce défaut, le formulaire
    // vitrine n'aurait jamais écrit). Tant qu'ils accordent une écriture à anon,
    // la première table créée par la prochaine migration rouvre tout, TRUNCATE
    // compris. Le bootstrap du banc (e2e/local/bootstrap-supabase-local.sql)
    // reproduit fidèlement ce réglage de production : sur une base remontée à
    // neuf, cette assertion est rouge sans la révocation de la migration.
    const { rows: defauts } = await db.query(
      `select pg_get_userbyid(d.defaclrole) || ' → ' || a.privilege_type as reste
         from pg_default_acl d
         join pg_namespace n on n.oid = d.defaclnamespace
         cross join lateral aclexplode(d.defaclacl) a
        where n.nspname = 'public'
          and d.defaclobjtype = 'r'
          and a.grantee = 'anon'::regrole
          and a.privilege_type in ('INSERT','UPDATE','DELETE',
                                   'TRUNCATE','REFERENCES','TRIGGER')
        order by 1`
    );
    expect(
      defauts,
      `les privilèges par défaut rouvriront la brèche sur toute table future : ${defauts
        .map((d) => d.reste)
        .join(", ")}`
    ).toHaveLength(0);

    // LES GESTES LÉGITIMES restent entiers.
    // 1. Le formulaire de devis du site vitrine écrit toujours, sans session
    //    (src/app/actions/devis.ts, politique demandes_devis_insert_public).
    await db.query("savepoint anon_legitime");
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('role','anon')::text, true)`
    );
    await db.query("set local role anon");
    await db.query(
      `insert into public.demandes_devis (nom, email, agence, message)
       values ('Visiteur Vitrine','visiteur@exemple.fr','Agence Test','Un devis, svp')`
    );
    // 2. La lecture publique des maquettes du site vitrine n'est pas touchée :
    //    ce lot ne traite que l'écriture.
    await db.query(`select count(*) from public.site_pages`);
    await db.query("reset role");
    await db.query("rollback to savepoint anon_legitime");

    // 3. Le gérant connecté, lui, écrit comme avant — la révocation ne vise
    //    que le rôle anon, jamais `authenticated`.
    await enGerant();
    await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,650,current_date,'virement')`,
      [org, bail]
    );
    await db.query("reset role");
    const {
      rows: [{ n }],
    } = await db.query(
      `select count(*)::int as n from public.encaissements where bail_id = $1`,
      [bail]
    );
    expect(n).toBe(1);
  });

  // ------------------------------------------------------------------
  // L'ABUS : reviser_loyer() recevait l'INDICE DE RÉFÉRENCE en paramètre.
  // Le wiki le fige au bail — RM-3.8.2, « l'indice de référence est celui figé
  // au bail à sa signature » (baux.irl_trimestre / irl_valeur) — il ne se
  // choisit donc pas au moment de la révision. Rejoué le 2026-09-10 : un bail
  // dont le bail fige l'IRL à 145,17, révisé avec « référence = 100 »,
  // multipliait le loyer au lieu de l'indexer (750 € → 1 110,23 €). Et rien ne
  // bornait la FRÉQUENCE (parcours 3.8 : « annuelle par bail », déclencheur
  // « date anniversaire ») : l'index unique (bail_id, date_effet) n'empêche que
  // le rejeu à la MÊME date, si bien que deux appels à un mois d'écart
  // composaient la hausse — 750 € → 1 687,55 € en deux gestes. L'indice vient
  // désormais du bail, et deux révisions d'un même bail sont séparées d'au
  // moins un an.
  // ------------------------------------------------------------------
  it("la révision IRL prend l'indice figé au bail, et une seule fois par an (RM-3.8.2, RM-3.8.5)", async () => {
    await db.query(
      `update public.baux set irl_valeur = 145.17, irl_trimestre = '2e trimestre 2025'
        where id = $1`,
      [bail]
    );
    // Un bail voisin SANS indice figé, pour vérifier le blocage explicite.
    const {
      rows: [lotSansIndice],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       select organization_id, bien_id, 'Lot sans indice', 'loue'::public.lot_etat
         from public.lots where id = $1 returning id`,
      [lot]
    );
    const {
      rows: [bailSansIndice],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges,
         date_debut, jour_echeance)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,current_date - 90,5)
       returning id`,
      [org, lotSansIndice.id]
    );
    // Un bail plus ancien, pour la suite d'échéances annuelles légitimes.
    const {
      rows: [lotSuite],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       select organization_id, bien_id, 'Lot suite', 'loue'::public.lot_etat
         from public.lots where id = $1 returning id`,
      [lot]
    );
    const {
      rows: [bailSuite],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, type, etat, loyer_hc, charges,
         date_debut, jour_echeance, irl_valeur, irl_trimestre)
       values ($1,$2,'nu'::public.bail_type,'actif'::public.bail_etat,600,50,
         current_date - 800,5,145.17,'2e trimestre 2025')
       returning id`,
      [org, lotSuite.id]
    );
    await enGerant();

    // L'ABUS 1 : choisir l'indice de référence à l'appel. La signature à quatre
    // arguments n'existe plus — l'indice de référence n'est pas une donnée d'appel.
    await db.query("savepoint irl");
    await expect(
      db.query(`select public.reviser_loyer($1, 100, 148.03, (current_date - 30)::date)`, [bail])
    ).rejects.toThrow(/does not exist|n'existe pas/i);
    await db.query("rollback to savepoint irl");

    // LE GESTE LÉGITIME : la révision annuelle, à l'indice du bail.
    // 600 × 148,03 / 145,17 = 611,82 € — la formule du parcours 3.8.
    const {
      rows: [revision],
    } = await db.query(
      `select public.reviser_loyer($1, 148.03, (current_date - 30)::date) as loyer`,
      [bail]
    );
    expect(Number(revision.loyer)).toBe(611.82);
    const {
      rows: [ligne],
    } = await db.query(
      `select irl_reference, irl_nouveau, ancien_loyer, nouveau_loyer
         from public.revisions_loyer where bail_id = $1`,
      [bail]
    );
    // L'indice conservé sur la révision (RM-3.8.7) est celui du bail, pas celui de l'appel.
    expect(Number(ligne.irl_reference)).toBe(145.17);
    expect(Number(ligne.ancien_loyer)).toBe(600);
    expect(Number(ligne.nouveau_loyer)).toBe(611.82);

    // L'ABUS 2 : réviser une seconde fois dans l'année — un mois après, puis en
    // antidatant. Un refus avorte la transaction : chaque tentative a son point
    // de reprise.
    for (const effet of ["current_date", "(current_date - 200)::date"]) {
      await db.query("savepoint irl");
      await expect(
        db.query(`select public.reviser_loyer($1, 152.00, ${effet})`, [bail])
      ).rejects.toThrow(/Révision annuelle/i);
      await db.query("rollback to savepoint irl");
    }

    // La garde vit dans la BASE, pas seulement dans la fonction : l'écriture
    // directe dans revisions_loyer se heurte au même refus.
    await db.query("reset role");
    await db.query("savepoint irl");
    await expect(
      db.query(
        `insert into public.revisions_loyer (organization_id, bail_id, date_effet,
           irl_reference, irl_nouveau, ancien_loyer, nouveau_loyer)
         values ($1,$2,current_date - 20,145.17,152,611.82,640)`,
        [org, bail]
      )
    ).rejects.toThrow(/Révision annuelle/i);
    await db.query("rollback to savepoint irl");

    // L'ABUS 3 : DATER DANS LE FUTUR pour contourner la garde annuelle. Des
    // révisions espacées d'un an sont toutes acceptées par la garde — même
    // enregistrées LE MÊME JOUR — et chacune s'applique aussitôt au loyer.
    // Rejoué le 2026-09-10, garde annuelle en place : cinq appels d'affilée à
    // +0, +1, +2, +3 et +4 ans portaient un loyer de 750 € à 2 755,16 €
    // (+267 %). RM-3.8.5 borne la fenêtre des deux côtés : la révision se
    // demande « dans l'année QUI SUIT la date anniversaire », donc jamais avant
    // l'échéance. Le loyer ne s'augmente pas d'avance.
    await enGerant();
    for (const effet of [
      "(current_date + 1)::date",
      "(current_date - 30 + interval '1 year')::date",
      "(current_date + interval '4 years')::date",
    ]) {
      await db.query("savepoint irl");
      await expect(
        db.query(`select public.reviser_loyer($1, 152.00, ${effet})`, [bail])
      ).rejects.toThrow(/Révision anticipée/i);
      await db.query("rollback to savepoint irl");
    }
    // Le loyer en est resté à l'unique révision légitime.
    const {
      rows: [apresAbus],
    } = await db.query(`select loyer_hc from public.baux where id = $1`, [bail]);
    expect(Number(apresAbus.loyer_hc)).toBe(611.82);

    // LE GESTE LÉGITIME VOISIN : deux échéances annuelles réellement dues —
    // celle de l'an dernier, pas encore prescrite, puis celle de ce jour. La
    // seconde part du loyer déjà révisé (« loyer actuel = bail ou dernière
    // révision ») : 600 → 611,82 → 640,61 €.
    const {
      rows: [anDernier],
    } = await db.query(
      `select public.reviser_loyer($1, 148.03, (current_date - interval '1 year')::date) as loyer`,
      [bailSuite.id]
    );
    expect(Number(anDernier.loyer)).toBe(611.82);
    const {
      rows: [cetteAnnee],
    } = await db.query(`select public.reviser_loyer($1, 152.00, current_date) as loyer`, [
      bailSuite.id,
    ]);
    expect(Number(cetteAnnee.loyer)).toBe(640.61);
    const {
      rows: [{ n: revisions }],
    } = await db.query(
      `select count(*)::int as n from public.revisions_loyer where bail_id = $1`,
      [bailSuite.id]
    );
    expect(revisions).toBe(2);

    // Bail sans indice figé : blocage explicite (cas d'erreur « indice non
    // saisi » du parcours 3.8), jamais un calcul approximé sur un indice deviné.
    await db.query("savepoint irl");
    await expect(
      db.query(`select public.reviser_loyer($1, 148.03, (current_date - 30)::date)`, [
        bailSansIndice.id,
      ])
    ).rejects.toThrow(/Indice de référence absent du bail/i);
    await db.query("rollback to savepoint irl");
    await db.query("reset role");
  });

  it("une contre-écriture automatique porte le motif de son auteur (RM-A6.6)", async () => {
    // LE DÉFAUT. Corriger un encaissement, c'est le supprimer et le ressaisir
    // (RM-A6.3) ; la suppression contre-passe le journal automatiquement. Cette
    // contre-écriture partait avec un libellé constant : le journal disait ce
    // qui avait été annulé, jamais pourquoi. RM-A6.6 : « le motif d'une
    // contre-écriture est obligatoire ».
    await enGerant();

    // 1 ─ Le motif voyage jusqu'à l'écriture.
    const {
      rows: [enc],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,650,current_date,'virement') returning id`,
      [org, bail]
    );
    const motif = "Chèque rejeté par la banque — relevé à l'appui";
    await db.query(`select public.supprimer_encaissement($1, $2)`, [enc.id, motif]);
    const {
      rows: [motivee],
    } = await db.query(
      `select c.motif, c.libelle, c.sens, c.montant, c.contre_ecriture_de
         from public.ecritures c
         join public.ecritures o on o.id = c.contre_ecriture_de
        where o.encaissement_id = $1`,
      [enc.id]
    );
    expect(motivee.motif).toBe(motif);
    // Le motif se lit AUSSI dans le journal, sans changer d'écran.
    expect(motivee.libelle).toContain(motif);
    // Ce qui faisait la contre-écriture ne bouge pas : sens inversé, même montant.
    expect(motivee.sens).toBe("depense");
    expect(Number(motivee.montant)).toBe(650);

    // 2 ─ GESTE LÉGITIME VOISIN : le DELETE direct d'avant contre-passe
    // toujours, à l'identique — motif nul, libellé inchangé (rétrocompatible).
    const {
      rows: [ancien],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,100,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(`delete from public.encaissements where id = $1`, [ancien.id]);
    const {
      rows: [sansMotif],
    } = await db.query(
      `select c.motif, c.libelle from public.ecritures c
         join public.ecritures o on o.id = c.contre_ecriture_de
        where o.encaissement_id = $1`,
      [ancien.id]
    );
    expect(sansMotif.motif).toBeNull();
    expect(sansMotif.libelle).toBe("Annulation — encaissement supprimé");

    // 3 ─ Le paramètre est OPTIONNEL : l'appel sans motif reste possible en
    // base (l'obligation vit à l'écran, cf. arbitrage de la migration).
    const {
      rows: [muet],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,120,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(`select public.supprimer_encaissement($1)`, [muet.id]);
    const {
      rows: [muette],
    } = await db.query(
      `select c.motif, c.libelle from public.ecritures c
         join public.ecritures o on o.id = c.contre_ecriture_de
        where o.encaissement_id = $1`,
      [muet.id]
    );
    expect(muette.motif).toBeNull();
    expect(muette.libelle).toBe("Annulation — encaissement supprimé");

    // 4 ─ Le motif ne DÉTEINT pas : la suppression suivante de la même
    // transaction repart sans motif, elle n'hérite pas de celui d'avant.
    const {
      rows: [voisin],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,130,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(`delete from public.encaissements where id = $1`, [voisin.id]);
    const {
      rows: [propre],
    } = await db.query(
      `select c.motif from public.ecritures c
         join public.ecritures o on o.id = c.contre_ecriture_de
        where o.encaissement_id = $1`,
      [voisin.id]
    );
    expect(propre.motif).toBeNull();

    // 5 ─ Même chemin pour la contre-passation d'un encaissement de DÉPÔT.
    await db.query("reset role");
    const {
      rows: [dep],
    } = await db.query(
      `insert into public.depot_encaissements (organization_id, bail_id, montant, date_encaissement, moyen)
       values ($1,$2,600,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(
      `insert into public.ecritures (organization_id, bail_id, lot_id, categorie, sens, montant,
         date_piece, date_imputation, libelle, systeme, depot_encaissement_id)
       values ($1,$2,$3,'depot_garantie','recette',600,current_date,current_date,
               'Encaissement du dépôt de garantie',true,$4)`,
      [org, bail, lot, dep.id]
    );
    await enGerant();
    const motifDepot = "Virement non parvenu — saisi par erreur";
    await db.query(`select public.supprimer_encaissement_depot($1, $2)`, [dep.id, motifDepot]);
    const {
      rows: [contreDepot],
    } = await db.query(
      `select motif, libelle, sens from public.ecritures
        where categorie = 'depot_garantie' and contre_ecriture_de is not null`
    );
    expect(contreDepot.motif).toBe(motifDepot);
    expect(contreDepot.libelle).toContain(motifDepot);
    expect(contreDepot.sens).toBe("depense");

    // 6 ─ Le chemin MANUEL exigeait déjà le motif : il le STOCKE désormais,
    // au lieu de le fondre dans le seul libellé. Le refus du motif vide tient.
    const {
      rows: [libre],
    } = await db.query(
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
         date_imputation, libelle, bail_id, lot_id)
       values ($1,'travaux','depense',80,current_date,current_date,'Origine',$2,$3) returning id`,
      [org, bail, lot]
    );
    await db.query("savepoint a66");
    await expect(
      db.query(`select public.contre_ecriture($1, '   ')`, [libre.id])
    ).rejects.toThrow(/Motif de contre-écriture obligatoire/i);
    await db.query("rollback to savepoint a66");
    await db.query(`select public.contre_ecriture($1, 'Devis imputé au mauvais bien')`, [libre.id]);
    const {
      rows: [manuelle],
    } = await db.query(`select motif from public.ecritures where contre_ecriture_de = $1`, [
      libre.id,
    ]);
    expect(manuelle.motif).toBe("Devis imputé au mauvais bien");

    // 7 ─ La nouvelle porte n'ouvre RIEN : elle s'exécute sous l'appelant, donc
    // la RLS tranche comme pour un DELETE direct. Une agence voisine, avec
    // l'identifiant en dur, ne supprime rien et n'écrit aucun motif chez nous.
    await db.query("reset role");
    const {
      rows: [autreOrg],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Voisine A6.6','active') returning id`
    );
    const {
      rows: [{ id: voisineCompte }],
    } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',
         'a66-voisine-'||gen_random_uuid()||'@test.local','x', now(), '{}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
       returning id`
    );
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [voisineCompte, autreOrg.id]
    );
    const {
      rows: [convoite],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,140,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(
      `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)`,
      [voisineCompte]
    );
    await db.query("set local role authenticated");
    await db.query("savepoint a66");
    await expect(
      db.query(`select public.supprimer_encaissement($1, $2)`, [convoite.id, "ménage"])
    ).rejects.toThrow(/introuvable/i);
    await db.query("rollback to savepoint a66");
    await db.query("reset role");
    const {
      rows: [{ n: survivants }],
    } = await db.query(
      `select count(*)::int as n from public.encaissements where id = $1`,
      [convoite.id]
    );
    expect(survivants).toBe(1);
  });

  // Machine à états incohérente : un lot « disponible » avec un bail en préavis
  // qui court encore (constaté en production). L'état du lot découle du bail —
  // activation, congé, clôture le pilotent ; il ne se décrète pas à la main
  // (décision du 2026-08-03, chaîne critique RM-1.7.1→1.7.3).
  it("l'état du lot ne contredit plus son bail : ni libéré à la main pendant le préavis, ni désynchronisé par une écriture directe sur le bail", async () => {
    await enGerant();

    // L'ABUS 1 : libérer à la main un lot dont le bail est actif.
    await db.query("savepoint coherence");
    await expect(
      db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot])
    ).rejects.toThrow(/il reste loué/i);
    await db.query("rollback to savepoint coherence");

    // Le congé enregistré : le bail passe en préavis et le lot suit.
    await db.query(
      `select public.enregistrer_conge($1, 'locataire'::public.conge_par, current_date, 3::smallint)`,
      [bail]
    );
    const {
      rows: [apresConge],
    } = await db.query(`select etat from public.lots where id = $1`, [lot]);
    expect(apresConge.etat).toBe("preavis");

    // L'ABUS 2 — le cas de production : « le locataire est parti » pendant le
    // préavis remettait le lot sur le marché alors que son bail courait encore.
    await db.query("savepoint coherence");
    await expect(
      db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot])
    ).rejects.toThrow(/ne se libère pas à la main/i);
    await db.query("rollback to savepoint coherence");

    // L'ABUS 3 — par l'autre bout : écrire l'état du BAIL en direct (la policy
    // `baux_update` l'autorise) sans toucher au lot. Le contrôle est porté par
    // la transaction ; on le force ici comme le fait sa validation.
    await db.query("savepoint coherence");
    await db.query(`update public.baux set etat = 'actif' where id = $1`, [bail]);
    await expect(db.query("set constraints all immediate")).rejects.toThrow(
      /le lot suit le bail/i
    );
    await db.query("rollback to savepoint coherence");

    // LE GESTE LÉGITIME : état des lieux de sortie signé, puis clôture du bail
    // (RM-3.11.2) — le lot redevient disponible de lui-même.
    const {
      rows: [{ id: edlSortie }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type)
       values ($1,$2,'sortie') returning id`,
      [org, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edlSortie]);
    await db.query(
      `update public.edl_lignes set etat = 'bon'::public.etat_element where edl_id = $1`,
      [edlSortie]
    );
    await db.query(`select public.signer_edl($1)`, [edlSortie]);
    await db.query(`select public.terminer_bail($1)`, [bail]);
    const {
      rows: [apresCloture],
    } = await db.query(
      `select l.etat as lot, b.etat as bail
         from public.lots l join public.baux b on b.id = $2 where l.id = $1`,
      [lot, bail]
    );
    expect(apresCloture.lot).toBe("disponible");
    expect(apresCloture.bail).toBe("termine");
    // Une transaction cohérente se valide sans broncher.
    await db.query("set constraints all immediate");
  });

  // Le contournement du contrôle précédent : plutôt que de libérer le lot, on
  // déménage le bail. `baux_update` ne contrôle que l'organisation — rien
  // n'empêche de réécrire `lot_id`. Le lot quitté restait alors « loué » pour
  // toujours, sans locataire : exactement l'incohérence que la règle
  // « le bail fait foi, le lot suit » interdit (décision du 2026-08-03).
  it("un bail déménagé ne laisse pas derrière lui un lot loué sans bail", async () => {
    const {
      rows: [{ bien_id: bien }],
    } = await db.query(`select bien_id from public.lots where id = $1`, [lot]);
    const {
      rows: [voisin],
    } = await db.query(
      `insert into public.lots (organization_id, bien_id, nom, etat)
       values ($1,$2,'Lot voisin','disponible'::public.lot_etat) returning id`,
      [org, bien]
    );
    await enGerant();

    // L'ABUS : rattacher le bail vivant au lot voisin et n'aligner que
    // celui-ci — le lot d'origine reste « loué » sans plus aucun bail.
    await db.query("savepoint demenagement");
    await db.query(`update public.baux set lot_id = $1 where id = $2`, [voisin.id, bail]);
    await db.query(`update public.lots set etat = 'loue' where id = $1`, [voisin.id]);
    await expect(db.query("set constraints all immediate")).rejects.toThrow(
      /aucun bail ne vit dessus/i
    );
    await db.query("rollback to savepoint demenagement");
    await db.query("set constraints all deferred");

    // LE GESTE LÉGITIME : le même déménagement, mais en libérant le lot
    // d'origine — les deux lots disent alors la vérité de leur bail.
    await db.query(`update public.baux set lot_id = $1 where id = $2`, [voisin.id, bail]);
    await db.query(`update public.lots set etat = 'loue' where id = $1`, [voisin.id]);
    await db.query(`update public.lots set etat = 'disponible' where id = $1`, [lot]);
    await db.query("set constraints all immediate");
    const {
      rows: [etats],
    } = await db.query(
      `select (select etat from public.lots where id = $1) as origine,
              (select etat from public.lots where id = $2) as arrivee`,
      [lot, voisin.id]
    );
    expect(etats.origine).toBe("disponible");
    expect(etats.arrivee).toBe("loue");
  });

  // Vérification adversariale du lot RM-A6.6 : trois FONCTIONS fabriquaient une
  // contre-écriture, mais une quatrième voie ne passe par aucune fonction —
  // l'INSERT direct en table, ouvert à tout membre de l'agence par la politique
  // `ecritures_insert`. Elle contournait aussi bien public.contre_ecriture()
  // (qui exige le motif depuis l'origine) que la contre-passation automatique.
  it("une contre-écriture écrite à la main porte son motif : l'INSERT direct ne la forge plus (RM-A6.6)", async () => {
    const {
      rows: [origine],
    } = await db.query(
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
         date_imputation, libelle, bail_id, lot_id)
       values ($1,'travaux','depense',80,current_date,current_date,'Origine',$2,$3) returning id`,
      [org, bail, lot]
    );
    await enGerant();

    const forger = (motif: string | null) =>
      db.query(
        `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
           date_imputation, libelle, bail_id, lot_id, contre_ecriture_de, motif)
         values ($1,'travaux','recette',80,current_date,current_date,'Annulation maison',$2,$3,$4,$5)`,
        [org, bail, lot, origine.id, motif]
      );

    // 1 ─ LE DÉFAUT : la contre-écriture forgée sans motif est refusée. Chaque
    // refus est isolé par un savepoint (une contrainte qui lâche avorte tout).
    await db.query("savepoint a66bis");
    await expect(forger(null)).rejects.toThrow(/Motif de contre-écriture obligatoire/i);
    await db.query("rollback to savepoint a66bis");

    // 2 ─ Un motif blanc ne vaut pas motif : la même porte reste fermée.
    await db.query("savepoint a66bis");
    await expect(forger("   ")).rejects.toThrow(/Motif de contre-écriture obligatoire/i);
    await db.query("rollback to savepoint a66bis");

    // 3 ─ GESTE LÉGITIME VOISIN : l'écriture ORDINAIRE, sans lien d'annulation,
    // reste libre — on n'a pas fermé le journal, seulement l'annulation muette.
    await db.query(
      `insert into public.ecritures (organization_id, categorie, sens, montant, date_piece,
         date_imputation, libelle) values ($1,'divers','depense',12,current_date,current_date,'Ordinaire')`,
      [org]
    );

    // 4 ─ GESTE LÉGITIME VOISIN : on n'exige QUE le motif (RM-A6.6), pas le
    // sens ni le montant. Une contre-écriture saisie à la main avec son motif
    // passe toujours.
    await forger("Erreur de saisie constatée au rapprochement");
    const {
      rows: [forgee],
    } = await db.query(`select motif from public.ecritures where contre_ecriture_de = $1`, [
      origine.id,
    ]);
    expect(forgee.motif).toBe("Erreur de saisie constatée au rapprochement");

    // 5 ─ GESTE LÉGITIME VOISIN : la contre-passation AUTOMATIQUE sans motif
    // reste possible — c'est le comportement d'avant, délibérément conservé
    // (arbitrage de la migration). Le durcissement ne vise que le client.
    const {
      rows: [enc],
    } = await db.query(
      `insert into public.encaissements (organization_id, bail_id, montant, date_paiement, mode)
       values ($1,$2,300,current_date,'virement') returning id`,
      [org, bail]
    );
    await db.query(`delete from public.encaissements where id = $1`, [enc.id]);
    const {
      rows: [auto],
    } = await db.query(
      `select c.motif, c.libelle from public.ecritures c
         join public.ecritures o on o.id = c.contre_ecriture_de
        where o.encaissement_id = $1`,
      [enc.id]
    );
    expect(auto.motif).toBeNull();
    expect(auto.libelle).toBe("Annulation — encaissement supprimé");
  });
});
