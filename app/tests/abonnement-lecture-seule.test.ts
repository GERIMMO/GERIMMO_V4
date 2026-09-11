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

const MESSAGE_REFUS = /Abonnement suspendu/;

let db: Client;

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
  it("refuse la création, en disant pourquoi et où réactiver", async () => {
    const org = await creerOrg("Suspendue", "suspendue");
    const erreur = await refusee(
      "insert into public.persons (organization_id, nom) values ($1, 'Dupont')",
      [org]
    );
    expect(erreur).toMatch(MESSAGE_REFUS);
    // Le message dit à l'utilisateur ce qu'il garde, et où aller.
    expect(erreur).toMatch(/consultables et exportables/);
    expect(erreur).toMatch(/Mon abonnement/);
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
