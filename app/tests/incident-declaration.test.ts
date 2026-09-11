/**
 * Déclaration d'incident par le locataire — le parcours mobile phare
 * (module 19, RM-19.2.2 : « la photo est le premier champ, avant la
 * description ; deux photos et la pièce suffisent, aucune description
 * obligatoire »).
 *
 * Deux défauts couverts :
 *  (a) l'écran promettait la photo seule, la base la refusait — partie
 *      intégration, nécessite SUPABASE_DB_URL (transaction annulée à la fin) ;
 *  (b) tout refus effaçait les photos déjà prises — partie unitaire, sur la
 *      logique de conservation côté client (lib/photos-declaration.ts).
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { valeursDuFormulaire } from "../src/lib/formulaires";
import {
  brancherConservationDesPhotos,
  photosAReposer,
} from "../src/lib/photos-declaration";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

// ============================================================
// (b) Les photos survivent au refus — logique côté client
// ============================================================

describe("Déclaration d'incident — les photos survivent au refus (RM-19.2.2)", () => {
  const photo = (nom: string) => new File(["x"], nom, { type: "image/jpeg" });

  it("le serveur ne peut pas reposer les photos : c'est pourquoi le client les garde", () => {
    // La saisie renvoyée par l'action ne transporte que des chaînes — un
    // <input type=file> ne se repeuple pas depuis le serveur. Si un jour ce
    // test tombe, c'est que quelqu'un a cru corriger le défaut du mauvais côté.
    const envoi = new FormData();
    envoi.set("categorie", "plomberie_joint");
    envoi.set("piece", "Cuisine");
    envoi.append("photos", photo("fuite-1.jpg"));
    envoi.append("photos", photo("fuite-2.jpg"));

    expect(valeursDuFormulaire(envoi)).toEqual({
      categorie: "plomberie_joint",
      piece: "Cuisine",
    });
  });

  it("le champ vidé par la réinitialisation retrouve les photos prises", () => {
    const prises = [photo("fuite-1.jpg"), photo("fuite-2.jpg"), photo("fuite-3.jpg")];
    const aReposer = photosAReposer([], prises);
    expect(aReposer?.map((f) => f.name)).toEqual([
      "fuite-1.jpg",
      "fuite-2.jpg",
      "fuite-3.jpg",
    ]);
  });

  it("un choix frais du locataire prime : on n'écrase jamais une nouvelle sélection", () => {
    const prises = [photo("ancienne.jpg")];
    expect(photosAReposer([photo("nouvelle.jpg")], prises)).toBeNull();
  });

  it("rien de mémorisé, rien à reposer", () => {
    expect(photosAReposer([], [])).toBeNull();
  });

  it("la liste reposée est une copie : le champ ne partage pas la mémoire du composant", () => {
    const prises = [photo("fuite-1.jpg")];
    const aReposer = photosAReposer([], prises);
    expect(aReposer).not.toBe(prises);
    expect(aReposer).toEqual(prises);
  });
});

// ============================================================
// (b bis) Le BRANCHEMENT sur le formulaire — c'est lui qui ferme le défaut,
// la décision pure ne fait que dire quoi reposer. Ce poste n'a pas de
// navigateur : on rejoue à la main les deux seuls faits de plateforme dont le
// remède dépend — reset() prévient ses écoutes AVANT de vider le champ (spec
// HTML), et l'écriture d'une FileList passe par un DataTransfer.
// ============================================================

describe("Déclaration d'incident — le branchement qui repose les photos", () => {
  const photo = (nom: string) => new File(["x"], nom, { type: "image/jpeg" });
  const tourDeBoucle = () => new Promise((resoudre) => setTimeout(resoudre, 0));

  // DataTransfer n'existe pas hors navigateur : sans ce fac-similé,
  // reposerDansLeChamp retomberait dans son catch et le test ne prouverait
  // plus rien.
  class DataTransferDeTest {
    private readonly liste: File[] = [];
    readonly items = {
      add: (fichier: File) => {
        this.liste.push(fichier);
      },
    };
    get files(): File[] {
      return this.liste;
    }
  }

  let dataTransferDorigine: unknown;
  beforeAll(() => {
    const global = globalThis as { DataTransfer?: unknown };
    dataTransferDorigine = global.DataTransfer;
    global.DataTransfer = DataTransferDeTest;
  });
  afterAll(() => {
    (globalThis as { DataTransfer?: unknown }).DataTransfer = dataTransferDorigine;
  });

  // Fac-similé du couple <form>/<input type="file"> réduit à ce qui compte :
  // l'ORDRE de la réinitialisation. reset() prévient, PUIS vide.
  function formulaireAvecPhotos(prises: readonly File[]) {
    const ecoutes = new Map<string, Set<() => void>>();
    const contenu = { fichiers: [...prises] };
    const champ = {
      get files() {
        return contenu.fichiers;
      },
      set files(nouveaux: File[]) {
        contenu.fichiers = nouveaux;
      },
      form: {
        addEventListener(type: string, ecoute: () => void) {
          const pourCeType = ecoutes.get(type) ?? new Set<() => void>();
          pourCeType.add(ecoute);
          ecoutes.set(type, pourCeType);
        },
        removeEventListener(type: string, ecoute: () => void) {
          ecoutes.get(type)?.delete(ecoute);
        },
      },
    } as unknown as HTMLInputElement;
    return {
      champ,
      reinitialiser() {
        for (const ecoute of [...(ecoutes.get("reset") ?? [])]) ecoute();
        contenu.fichiers = [];
      },
      nomsDuChamp: () => contenu.fichiers.map((f) => f.name),
    };
  }

  it("le refus vide le champ, le branchement y remet les photos dans l'ordre", async () => {
    const prises = [photo("fuite-1.jpg"), photo("fuite-2.jpg"), photo("fuite-3.jpg")];
    const { champ, reinitialiser, nomsDuChamp } = formulaireAvecPhotos(prises);
    const debrancher = brancherConservationDesPhotos(champ, prises);

    reinitialiser();
    // Ce que le locataire aurait vu sans le remède : trois photos à reprendre.
    expect(nomsDuChamp()).toEqual([]);

    await tourDeBoucle();
    expect(nomsDuChamp()).toEqual(["fuite-1.jpg", "fuite-2.jpg", "fuite-3.jpg"]);
    debrancher?.();
  });

  it("le formulaire démonté ne repose plus rien : le branchement se défait", async () => {
    const prises = [photo("fuite-1.jpg")];
    const { champ, reinitialiser, nomsDuChamp } = formulaireAvecPhotos(prises);
    brancherConservationDesPhotos(champ, prises)?.();

    reinitialiser();
    await tourDeBoucle();
    expect(nomsDuChamp()).toEqual([]);
  });

  it("aucune photo mémorisée : la réinitialisation laisse le champ vide", async () => {
    const { champ, reinitialiser, nomsDuChamp } = formulaireAvecPhotos([]);
    const debrancher = brancherConservationDesPhotos(champ, []);

    reinitialiser();
    await tourDeBoucle();
    expect(nomsDuChamp()).toEqual([]);
    debrancher?.();
  });

  it("un champ hors formulaire : rien à brancher, et rien ne casse", () => {
    const champ = { files: [], form: null } as unknown as HTMLInputElement;
    expect(brancherConservationDesPhotos(champ, [photo("fuite-1.jpg")])).toBeUndefined();
  });
});

// ============================================================
// (a) La base accepte la déclaration sans description
// ============================================================

describe.skipIf(!DB_URL)("Déclaration d'incident — la photo seule suffit (RM-19.2.2)", () => {
  let db: Client;
  let org: string;
  let admin: string;
  let compteLocataire: string;
  let lot: string;

  async function creerUtilisateur(): Promise<string> {
    const {
      rows: [{ id }],
    } = await db.query(`
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'test-decl-'||gen_random_uuid()||'@test.local','x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
      returning id`);
    return id;
  }

  async function simuler(accountId: string | null) {
    await db.query("reset role");
    await db.query(
      accountId
        ? `select set_config('request.jwt.claims',
             json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`
        : `select set_config('request.jwt.claims', '', true)`,
      accountId ? [accountId] : []
    );
    await db.query("set local role authenticated");
  }

  async function attendreEchec(motif: RegExp, sql: string, params: unknown[] = []) {
    await db.query("savepoint e");
    await expect(db.query(sql, params)).rejects.toThrow(motif);
    await db.query("rollback to savepoint e");
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
    const {
      rows: [{ id: orgId }],
    } = await db.query(
      `insert into public.organizations (name, status) values ('Déclaration Photo','active') returning id`
    );
    org = orgId;
    admin = await creerUtilisateur();
    compteLocataire = await creerUtilisateur();
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'), ($3,$2,'locataire')`,
      [admin, org, compteLocataire]
    );

    await simuler(admin);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'12 rue du Vif','appartement'::public.bien_type,
         '12 rue du Vif', null, '75011','Paris',1995,false,45,2) as id`,
      [org]
    );
    await db.query("reset role");
    const {
      rows: [{ id: lotId }],
    } = await db.query(`select id from public.lots where bien_id = $1`, [bien]);
    lot = lotId;

    const {
      rows: [{ id: personne }],
    } = await db.query(
      `insert into public.persons (organization_id, nom, prenom, account_id)
       values ($1,'Photophile','Léa',$2) returning id`,
      [org, compteLocataire]
    );
    // Fixture : bail posé directement à l'état actif (l'activation outillée est
    // couverte par les tests du sprint 4)
    await db.query(
      `insert into public.baux (organization_id, lot_id, etat, locataire_principal)
       values ($1,$2,'actif',$3)`,
      [org, lot, personne]
    );
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function declarer(description: string | null): Promise<string> {
    await simuler(compteLocataire);
    const {
      rows: [{ id }],
    } = await db.query(
      `select public.declarer_mon_incident($1,'plomberie_joint',$2,'Cuisine',null,
         'normale'::public.incident_urgence) as id`,
      [org, description]
    );
    return id;
  }

  it("le locataire déclare sans un mot : deux photos et la pièce suffisent (RM-19.2.2)", async () => {
    const incident = await declarer(null);
    await db.query("reset role");

    const {
      rows: [i],
    } = await db.query(`select * from public.incidents where id = $1`, [incident]);
    expect(i.description).toBeNull();
    expect(i.piece).toBe("Cuisine");
    expect(i.categorie).toBe("plomberie_joint");
    expect(i.canal).toBe("espace_locataire");
    expect(i.etat).toBe("declare");

    // La déclaration muette reste une vraie déclaration : tracée et alertée
    const { rows: evenements } = await db.query(
      `select type from public.incident_evenements where incident_id = $1`,
      [incident]
    );
    expect(evenements.map((e) => e.type)).toContain("declaration");
    const { rows: alertes } = await db.query(
      `select id from public.alerts where organization_id = $1 and type = 'incident_a_qualifier'
         and details->>'incident_id' = $2`,
      [org, incident]
    );
    expect(alertes).toHaveLength(1);
  });

  it("le geste légitime voisin passe toujours : déclaration décrite, description conservée", async () => {
    const incident = await declarer("Fuite sous l'évier, ça s'étend");
    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(`select description from public.incidents where id = $1`, [incident]);
    expect(i.description).toBe("Fuite sous l'évier, ça s'étend");
  });

  it("une description d'espaces vaut « pas de description » : NULL en base, jamais de blanc", async () => {
    const incident = await declarer("   ");
    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(`select description from public.incidents where id = $1`, [incident]);
    expect(i.description).toBeNull();
  });

  it("la catégorie, elle, reste obligatoire — la photo ne dit pas de quoi il s'agit", async () => {
    await simuler(compteLocataire);
    await attendreEchec(
      /catégorie/i,
      `select public.declarer_mon_incident($1,'',null,'Cuisine',null,'normale'::public.incident_urgence)`,
      [org]
    );
  });

  it("l'agence, qui retranscrit un appel, décrit toujours : sans description, refus", async () => {
    await simuler(admin);
    await attendreEchec(
      /Décrivez le problème/i,
      `select public.ouvrir_incident_agence($1,$2,'plomberie_joint','','Cuisine',null,
         'normale'::public.incident_urgence)`,
      [org, lot]
    );
  });

  it("l'agence décrite ouvre son incident sans encombre (geste légitime voisin)", async () => {
    await simuler(admin);
    const {
      rows: [{ id }],
    } = await db.query(
      `select public.ouvrir_incident_agence($1,$2,'plomberie_joint','Le locataire signale une fuite',
         'Cuisine',null,'normale'::public.incident_urgence) as id`,
      [org, lot]
    );
    await db.query("reset role");
    const {
      rows: [i],
    } = await db.query(`select canal, description from public.incidents where id = $1`, [id]);
    expect(i.canal).toBe("agence");
    expect(i.description).toBe("Le locataire signale une fuite");
  });

  it("la contrainte de table tient : une description blanche reste interdite", async () => {
    await db.query("reset role");
    await attendreEchec(
      /incidents_description_non_vide/,
      `insert into public.incidents (organization_id, numero, lot_id, canal, categorie, description)
       values ($1,'INC-9999-9999',$2,'espace_locataire','autre','   ')`,
      [org, lot]
    );
  });
});
