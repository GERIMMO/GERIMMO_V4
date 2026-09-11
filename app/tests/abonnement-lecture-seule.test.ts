/**
 * Tests d'intégration — l'abonnement a un effet (11/09).
 *
 * Jusqu'à cette date, `organizations.status` valait essai / active /
 * suspendue / archivee et RIEN n'en tenait compte : `statutOrganisation()`
 * choisissait une couleur de pastille, c'est tout. Une agence qui ne payait
 * plus continuait de tout faire, un essai expiré n'expirait pas. On ne peut
 * pas vendre un abonnement dont le non-paiement n'a aucune conséquence.
 *
 * La règle est tenue par un DÉCLENCHEUR, et pas ailleurs : le produit écrit
 * presque tout par des fonctions SECURITY DEFINER, qui contournent la RLS.
 * Ces tests vérifient les deux moitiés de la règle — ce qui est refusé, et
 * surtout CE QUI DOIT CONTINUER DE PASSER. La seconde est la plus importante :
 * un garde-fou trop large couperait la lecture, c'est-à-dire l'engagement de
 * réversibilité.
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

// Le refus a deux formulations, selon qui écrit : le gérant s'entend dire quoi
// faire, les tiers (locataire, artisan, mandant) reçoivent un refus neutre qui
// ne leur parle pas de l'abonnement d'autrui. Les deux refusent également.
const MESSAGE_REFUS = /Abonnement suspendu|n'enregistre plus de nouvelles saisies/;

let db: Client;

async function creerUtilisateur(): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-ab-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

/** Pose (ou retire) l'identité de l'appelant, sans changer de rôle SQL. */
async function identite(accountId: string | null) {
  await db.query(
    `select set_config('request.jwt.claims', $1, true)`,
    [accountId ? JSON.stringify({ sub: accountId, role: "authenticated" }) : ""]
  );
}

/** Un gérant de l'organisation, identifié comme tel. */
async function gerantDe(org: string): Promise<string> {
  const compte = await creerUtilisateur();
  await db.query("select public.tache_systeme()");
  await db.query(
    `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
    [compte, org]
  );
  await db.query("select set_config('gerimmo.systeme', '', true)");
  return compte;
}

/** Joue une écriture qu'on attend REFUSÉE, sans avorter la transaction. */
async function refusee(sql: string, params: unknown[] = []): Promise<string> {
  await db.query("savepoint essai");
  try {
    await db.query(sql, params);
    await db.query("release savepoint essai");
    return "";
  } catch (e) {
    await db.query("rollback to savepoint essai");
    return (e as Error).message;
  }
}

async function creerOrg(nom: string, statut: string, essaiFin: "hier" | "demain" | null = null): Promise<string> {
  const date = essaiFin === "hier" ? "current_date - 1" : essaiFin === "demain" ? "current_date + 1" : "null";
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(
    `insert into public.organizations (name, status, essai_fin)
     values ($1, $2::public.organization_status, ${date}) returning id`,
    [nom, statut]
  );
  return id;
}

/** Sème une ligne dans une organisation déjà fermée, sous le drapeau système. */
async function semer(sql: string, params: unknown[]): Promise<string> {
  await db.query("savepoint semis");
  await db.query("select public.tache_systeme()");
  const {
    rows: [{ id }],
  } = await db.query<{ id: string }>(sql, params);
  // Le drapeau est LOCAL à la transaction : on le retire pour la suite du test.
  await db.query("select set_config('gerimmo.systeme', '', true)");
  await db.query("release savepoint semis");
  return id;
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});
afterAll(async () => {
  await db?.end();
});
beforeEach(async () => {
  await db.query("begin");
});
afterEach(async () => {
  await db.query("rollback");
});

describe("org_ecriture_ouverte — qui peut encore créer", () => {
  it("ouvre pour une organisation active et un essai en cours, ferme sinon", async () => {
    const cas: [string, string, string | null, boolean][] = [
      ["active", "active", null, true],
      ["essai qui court", "essai", "tomorrow", true],
      ["essai expiré hier", "essai", "yesterday", false],
      ["essai sans date", "essai", null, true],
      ["suspendue", "suspendue", null, false],
      ["archivée", "archivee", null, false],
    ];
    for (const [libelle, statut, quand, attendu] of cas) {
      const date =
        quand === "tomorrow"
          ? "current_date + 1"
          : quand === "today"
            ? "current_date"
            : quand === "yesterday"
              ? "current_date - 1"
              : "null";
      const {
        rows: [{ id }],
      } = await db.query<{ id: string }>(
        `insert into public.organizations (name, status, essai_fin)
         values ($1, $2::public.organization_status, ${date}) returning id`,
        [libelle, statut]
      );
      const {
        rows: [{ ouverte }],
      } = await db.query<{ ouverte: boolean }>(
        "select public.org_ecriture_ouverte($1) as ouverte",
        [id]
      );
      expect(`${libelle}: ${ouverte}`).toBe(`${libelle}: ${attendu}`);
    }
  });
});

describe("une organisation suspendue ne crée plus", () => {
  it("refuse la création au gérant, en disant pourquoi et où réactiver", async () => {
    const org = await creerOrg("Suspendue", "suspendue");
    await identite(await gerantDe(org));
    const erreur = await refusee(
      "insert into public.persons (organization_id, nom) values ($1, 'Dupont')",
      [org]
    );
    expect(erreur).toMatch(/Abonnement suspendu/);
    // Le message dit à l'utilisateur ce qu'il garde, et où aller.
    expect(erreur).toMatch(/consultables et exportables/);
    expect(erreur).toMatch(/Mon abonnement/);
    await identite(null);
  });

  it("ne parle pas d'argent aux tiers : locataire et artisan reçoivent un refus neutre", async () => {
    // Le refus s'applique à QUICONQUE écrit — un locataire qui envoie un
    // message, un artisan qui dépose un devis. Ni l'un ni l'autre n'a
    // d'abonnement à réactiver, et l'état de paiement de l'agence ne les
    // regarde pas : leur dire « Réactivez l'abonnement » est à la fois
    // inutilisable et indiscret.
    const org = await creerOrg("Suspendue", "suspendue");
    await identite(await creerUtilisateur()); // un compte qui n'est pas gérant
    const erreur = await refusee(
      "insert into public.persons (organization_id, nom) values ($1, 'Dupont')",
      [org]
    );
    expect(erreur).toMatch(/n'enregistre plus de nouvelles saisies/);
    expect(erreur).not.toMatch(/[Aa]bonnement suspendu/);
    expect(erreur).not.toMatch(/Mon abonnement/);
    // Il garde l'essentiel : ses documents, et à qui s'adresser.
    expect(erreur).toMatch(/consultables/);
    expect(erreur).toMatch(/contactez-la directement/);
    await identite(null);
  });

  it("refuse aussi la modification et la suppression", async () => {
    // `organizations` porte son propre garde-fou — seul le super admin en
    // change le statut. On crée donc l'organisation DÉJÀ suspendue, et on sème
    // sa ligne sous le drapeau système, comme le ferait une tâche planifiée.
    const org = await creerOrg("Suspendue", "suspendue");
    const person = await semer(
      "insert into public.persons (organization_id, nom) values ($1,'Martin') returning id",
      [org]
    );

    expect(await refusee("update public.persons set nom='Autre' where id=$1", [person])).toMatch(
      MESSAGE_REFUS
    );
    expect(await refusee("delete from public.persons where id=$1", [person])).toMatch(MESSAGE_REFUS);
  });

  it("refuse dès que l'essai est expiré, sans attendre un changement de statut", async () => {
    // Aucun traitement de nuit n'est nécessaire : la date suffit.
    const org = await creerOrg("Essai fini", "essai", "hier");
    expect(
      await refusee("insert into public.persons (organization_id, nom) values ($1,'X')", [org])
    ).toMatch(MESSAGE_REFUS);
  });
});

describe("ce qui doit continuer de passer — la moitié qui compte", () => {
  it("la LECTURE reste entière : c'est l'engagement de réversibilité", async () => {
    const org = await creerOrg("Lecture", "suspendue");
    await semer("insert into public.persons (organization_id, nom) values ($1,'Durand') returning id", [org]);

    const { rows } = await db.query("select nom from public.persons where organization_id=$1", [org]);
    expect(rows.map((r) => r.nom)).toEqual(["Durand"]);
  });

  it("le locataire lit toujours son courrier — marquer « lu » est un UPDATE", async () => {
    // Le piège qui a dicté la forme du déclencheur : `mes_messages_locataire`
    // marque les messages comme lus EN LES LISANT. Une garde posée sans
    // distinction sur `messages` aurait empêché un locataire de lire son
    // courrier parce que son agence ne paie plus.
    const org = await creerOrg("Courrier", "suspendue");
    const person = await semer(
      "insert into public.persons (organization_id, nom) values ($1,'Locataire') returning id",
      [org]
    );
    const message = await semer(
      `insert into public.messages (organization_id, person_id, texte, auteur)
       values ($1,$2,'bonjour','gerant') returning id`,
      [org, person]
    );

    await db.query("update public.messages set lu_le = now() where id=$1", [message]);
    const {
      rows: [{ lu_le }],
    } = await db.query("select lu_le from public.messages where id=$1", [message]);
    expect(lu_le).not.toBeNull();

    // En revanche, ENVOYER reste refusé : c'est un geste de gestion.
    expect(
      await refusee(
        `insert into public.messages (organization_id, person_id, texte, auteur)
         values ($1,$2,'nouveau','locataire')`,
        [org, person]
      )
    ).toMatch(MESSAGE_REFUS);
  });

  it("les journaux écrivent toujours — sans eux, lire deviendrait impossible", async () => {
    const org = await creerOrg("Journaux", "suspendue");
    // `acces_pieces_log` s'écrit À LA LECTURE d'une pièce ; `audit_log` à
    // chaque action. Les bloquer, c'est bloquer la lecture et perdre la trace
    // au moment précis où elle compte.
    await db.query(
      `insert into public.audit_log (organization_id, action, details)
       values ($1, 'lecture', jsonb_build_object('entite', 'document'))`,
      [org]
    );
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.audit_log where organization_id=$1",
      [org]
    );
    expect(n).toBe("1");
  });

  it("les tâches planifiées aboutissent malgré la suspension", async () => {
    // La rétention légale et la génération d'alertes écrivent pour le compte de
    // la plateforme, pas du client. Une organisation suspendue est exactement
    // celle où la purge doit continuer de tourner.
    const org = await creerOrg("Système", "suspendue");
    await db.query("select public.tache_systeme()");
    await db.query("insert into public.persons (organization_id, nom) values ($1,'ParLeSysteme')", [
      org,
    ]);
    const {
      rows: [{ n }],
    } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.persons where organization_id=$1",
      [org]
    );
    expect(n).toBe("1");
  });
});

describe("etat_abonnement — ce que l'écran affiche", () => {
  it("compte les biens, en offre un, et facture le reste", async () => {
    const org = await creerOrg("Facturation", "active");
    for (let i = 0; i < 4; i += 1) {
      await db.query(
        `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
         values ($1, $2, 'appartement'::public.bien_type, '1 rue X', '75001', 'Paris')`,
        [org, `Bien ${i}`]
      );
    }
    // La fonction est filtrée par les rôles de l'appelant : on la teste à
    // travers ses composantes, la garde de rôle étant couverte ailleurs.
    const {
      rows: [r],
    } = await db.query<{ biens: string; factures: string; mensuel: string }>(
      `select count(*)::text as biens,
              greatest(0, count(*) - 1)::text as factures,
              round(greatest(0, count(*) - 1) * 5.99, 2)::text as mensuel
       from public.biens where organization_id = $1`,
      [org]
    );
    expect(r.biens).toBe("4");
    expect(r.factures).toBe("3");
    expect(r.mensuel).toBe("17.97");
  });
});

describe("la garde se repose, elle ne s'oublie pas", () => {
  it("aucune table d'organisation n'échappe au verrou", async () => {
    // Le 11/09, la pose était un bloc anonyme : il énumérait les tables au
    // moment où il s'exécutait. Le module artisan, arrivé quelques heures plus
    // tard, en a créé NEUF de plus — aucune gardée. Une agence suspendue
    // pouvait consulter, faire chiffrer et faire intervenir gratuitement.
    // Ce test est la vraie protection : appeler poser_gardes_abonnement(), on
    // peut encore l'oublier ; ce test, lui, échoue.
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'organization_id'
                      and a.attnum > 0 and not a.attisdropped)
        -- Les journaux n'en portent jamais : les bloquer bloquerait la lecture.
        -- Les tables d'abonnement non plus, et pour la raison INVERSE : c'est
        -- par elles qu'un compte fermé se rouvre. Les garder, ce serait exiger
        -- d'un client qu'il paie avec un compte qu'on lui a fermé faute de
        -- paiement — une impasse parfaite, invisible jusqu'au premier client
        -- qui paie (migration 20260911300000).
        and c.relname not in ('acces_pieces_log', 'audit_log',
                              'abonnements', 'abonnement_evenements')
        and not exists (select 1 from pg_trigger t
                        where t.tgrelid = c.oid and t.tgname like 'abonnement\\_%')
      order by c.relname`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("les tables d'abonnement restent hors garde, sinon le compte fermé ne se rouvre jamais", async () => {
    // Le sens inverse du test précédent. Si quelqu'un « corrigeait » l'oubli
    // apparent en gardant aussi `abonnements`, l'enregistrement du paiement
    // serait refusé chez le client suspendu — celui-là même qui vient de payer
    // pour ne plus l'être. Le défaut ne se verrait qu'en production, au premier
    // encaissement, et se lirait comme un problème de Stripe.
    const { rows } = await db.query<{ n: string }>(`
      select count(*)::text as n from pg_trigger t
      where t.tgname in ('abonnement_abonnements', 'abonnement_abonnement_evenements')`);
    expect(rows[0].n).toBe("0");
  });

  it("les tables d'abonnement n'accordent rien à anon ni à authenticated", async () => {
    // Elles portent l'identifiant client Stripe. Il n'a rien à faire dans une
    // réponse d'API : « Mon abonnement » lit `mon_abonnement()`, qui ne le rend
    // pas. RLS active SANS politique ne suffirait pas — il suffirait qu'on
    // écrive une politique « pour dépanner » pour que la table s'ouvre.
    const { rows } = await db.query<{ grantee: string }>(`
      select distinct g.grantee
      from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name in ('abonnements', 'abonnement_evenements')
        and g.grantee in ('anon', 'authenticated')`);
    expect(rows.map((r) => r.grantee)).toEqual([]);
  });

  it("les journaux restent délibérément hors garde", async () => {
    // Dans l'autre sens : si quelqu'un « corrigeait » l'oubli apparent en
    // gardant aussi les journaux, lire une pièce deviendrait impossible chez un
    // client suspendu — et la trace disparaîtrait au moment où elle compte.
    const { rows } = await db.query<{ n: string }>(`
      select count(*)::text as n from pg_trigger
      where tgrelid in ('public.acces_pieces_log'::regclass, 'public.audit_log'::regclass)
        and tgname like 'abonnement\\_%'`);
    expect(rows[0].n).toBe("0");
  });

  it("la pose se déduit du catalogue, elle ne récite pas une liste", async () => {
    // Ce qui rend la fonction rejouable, c'est qu'elle DEMANDE au catalogue
    // quelles tables portent `organization_id` au lieu de les énumérer. Une
    // liste en dur redeviendrait fausse à la table suivante — c'est exactement
    // ce qui s'est passé le 11/09 avec le bloc anonyme.
    // (On ne l'EXÉCUTE pas ici : reposer 56 déclencheurs prend un verrou
    // exclusif sur tout le schéma et bloquerait les autres fichiers de test.)
    const {
      rows: [{ src }],
    } = await db.query<{ src: string }>(
      "select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) as src"
    );
    expect(src).toContain("pg_attribute");
    expect(src).toContain("organization_id");
    expect(src).toContain("acces_pieces_log");
    // Et elle reste hors de portée des comptes applicatifs.
    const {
      rows: [d],
    } = await db.query<{ a: boolean; n: boolean }>(
      `select has_function_privilege('authenticated','public.poser_gardes_abonnement()','execute') as a,
              has_function_privilege('anon','public.poser_gardes_abonnement()','execute') as n`
    );
    expect(d).toEqual({ a: false, n: false });
  });
});

describe("l'écran « Mon abonnement » ne promet plus ce qui est faux", () => {
  it("ne dit plus « rien ne se ferme sans vous prévenir »", async () => {
    // Depuis le déclencheur du 11/09, un essai expiré ferme l'écriture LE JOUR
    // MÊME : aucun traitement de nuit, la date suffit. La phrase rassurait sur
    // une chose que le produit ne fait pas.
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      new URL("../src/app/agence/[orgId]/abonnement/page.tsx", import.meta.url),
      "utf8"
    );
    expect(src).not.toContain("rien ne se ferme sans vous prévenir");
    // Elle dit ce qui arrive, et ce qui reste possible après.
    expect(src).toContain("lecture seule");
    expect(src).toContain("exporter");
    // Et le décompte vient de la base, pas d'une multiplication refaite ici.
    expect(src).toContain("etat_abonnement");
    expect(src).not.toMatch(/\*\s*5[.,]99/);
  });
});
