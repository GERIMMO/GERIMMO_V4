/**
 * Tests d'intégration — le justificatif d'une retenue et la retenue elle-même
 * naissent ensemble ou pas du tout.
 *
 * Défaut d'origine : le formulaire de restitution déposait le devis en GED
 * AVANT d'appeler `ajouter_retenue`. Deux requêtes PostgREST = deux
 * transactions : un refus légitime de la règle métier — « Élément entièrement
 * amorti » (RM-2.4.5) ou « Sans état des lieux d'entrée » (RM-2.4.3),
 * wiki/regles-metier/Vétusté et décote.md — laissait derrière lui une fiche
 * rattachée à rien, portant le nom du locataire, et dont l'empreinte
 * anti-doublon interdisait ensuite de redéposer le même devis corrigé.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

async function creerUtilisateur(db: Client): Promise<string> {
  const {
    rows: [{ id }],
  } = await db.query(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
      'test-rj-'||gen_random_uuid()||'@test.local','x', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb, now(), now(),'','','','','')
    returning id`);
  return id;
}

async function simuler(db: Client, accountId: string | null, role = "authenticated") {
  await db.query("reset role");
  if (accountId) {
    await db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [accountId]
    );
  } else {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  }
  await db.query(`set local role ${role}`);
}

async function attendreEchec(db: Client, motif: RegExp, sql: string, params: unknown[] = []) {
  await db.query("savepoint e");
  await expect(db.query(sql, params)).rejects.toThrow(motif);
  await db.query("rollback to savepoint e");
}

describe.skipIf(!DB_URL)("Retenue — le justificatif ne survit pas au refus", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
  let proprietaire: string;
  let locataire: string;

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
      rows: [{ id: org }],
    } = await db.query(`insert into public.organizations (name, status) values ('CC retenue','active') returning id`);
    orgA = org;
    gerant = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [gerant, orgA]
    );
    const pers = await db.query(
      `insert into public.persons (organization_id, nom) values ($1,'Prop'),($1,'Loc') returning id, nom`,
      [orgA]
    );
    proprietaire = pers.rows.find((p) => p.nom === "Prop")!.id;
    locataire = pers.rows.find((p) => p.nom === "Loc")!.id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  // Le devis que l'agent joint à sa retenue : un chemin Storage sous le préfixe
  // de l'agence (isolation du bucket) et l'empreinte de son contenu.
  function piece(contenu: string) {
    return {
      chemin: `${orgA}/${crypto.randomUUID()}.pdf`,
      mime: "application/pdf",
      taille: 12345,
      empreinte: contenu,
    };
  }

  async function bailAvecDepotEncaisse(depot: number): Promise<string> {
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'8 rue CC','appartement'::public.bien_type,'8 rue CC',null,'75001','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    await db.query(
      `insert into public.detentions (lot_id, organization_id, person_id, quote_part) values ($1,$2,$3,100)`,
      [lot, orgA, proprietaire]
    );
    // Dépôt d'un bail nu plafonné à 1 mois de loyer HC (RM-2.1.1)
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, depot_garantie, loyer_hc)
       values ($1,$2,$3,$4,$4) returning id`,
      [orgA, lot, locataire, depot]
    );
    await db.query(`select public.encaisser_depot($1,$2,current_date,'virement',null,null)`, [bail, depot]);
    return bail;
  }

  async function edlEntreeSignee(bail: string): Promise<void> {
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id, bail_id, type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
  }

  async function restitutionOuverte(depot = 900): Promise<string> {
    const bail = await bailAvecDepotEncaisse(depot);
    await edlEntreeSignee(bail);
    const {
      rows: [{ id }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    return id;
  }

  async function compterGed(): Promise<{ documents: number; liens: number }> {
    const {
      rows: [c],
    } = await db.query(
      `select (select count(*) from public.documents where organization_id=$1)::int as documents,
              (select count(*) from public.document_liens where organization_id=$1)::int as liens`,
      [orgA]
    );
    return c;
  }

  it("élément amorti (RM-2.4.5) : la retenue est refusée ET la GED reste vierge", async () => {
    const rst = await restitutionOuverte();
    const p = piece("empreinte-devis-peinture");

    // Âge 9 ans sur une durée de vie de 7 : la vétusté a tout consommé
    await attendreEchec(
      db,
      /entièrement amorti/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture salon',900,7,9,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );

    expect(await compterGed()).toEqual({ documents: 0, liens: 0 });
    const {
      rows: [{ n }],
    } = await db.query(`select count(*)::int as n from public.retenues where restitution_id=$1`, [rst]);
    expect(n).toBe(0);
  });

  it("après le refus, le MÊME devis se redépose : l'empreinte n'est plus bloquée", async () => {
    const rst = await restitutionOuverte();
    const p = piece("empreinte-devis-peinture");

    await attendreEchec(
      db,
      /entièrement amorti/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture salon',900,7,9,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );

    // L'agent corrige l'âge (3 ans, pas 9) et rejoue avec le même fichier :
    // c'est exactement le geste que la pièce fantôme interdisait.
    const {
      rows: [{ montant }],
    } = await db.query(
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture salon',900,7,3,$2,$3,$4,$5) as montant`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );
    expect(Number(montant)).toBeCloseTo(514.29, 2); // 900 × 4/7, décote linéaire RM-2.4.4
  });

  it("geste légitime : la retenue acceptée porte sa pièce, rattachée et visible", async () => {
    const rst = await restitutionOuverte();
    const p = piece("empreinte-devis-accepte");

    await db.query(
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture salon',900,7,3,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );

    const {
      rows: [r],
    } = await db.query(
      `select r.montant_retenu, r.sans_justificatif, d.titre, d.type::text as type,
              d.storage_path, d.mime_type, d.taille_octets, d.empreinte, d.deposited_by,
              (select string_agg(l.entite::text, ',' order by l.entite::text)
                 from public.document_liens l where l.document_id = d.id) as rattachements
       from public.retenues r
       join public.documents d on d.id = r.justificatif_document
       where r.restitution_id = $1`,
      [rst]
    );
    expect(Number(r.montant_retenu)).toBeCloseTo(514.29, 2);
    expect(r.sans_justificatif).toBe(false);
    expect(r.titre).toBe("Devis/facture — Peinture salon");
    expect(r.type).toBe("justificatif");
    expect(r.storage_path).toBe(p.chemin);
    expect(r.empreinte).toBe(p.empreinte);
    expect(r.deposited_by).toBe(gerant);
    // Rattachement minimal module 12 : l'agence. Pas le bail — un devis de
    // remise en état n'a rien à faire dans l'espace du locataire (RM-12.5.5).
    expect(r.rattachements).toBe("organisation");

    // Pièce fournie : pas d'alerte « retenue sans justificatif »
    const {
      rows: [{ n }],
    } = await db.query(
      `select count(*)::int as n from public.alerts
       where organization_id=$1 and type='retenue_sans_justificatif'`,
      [orgA]
    );
    expect(n).toBe(0);

    // Et la pièce est bien lisible par le gérant dans la GED de son agence
    const ged = await db.query(`select titre from public.documents where organization_id=$1`, [orgA]);
    expect(ged.rows.map((d) => d.titre)).toEqual(["Devis/facture — Peinture salon"]);
  });

  it("geste légitime sans pièce : le chemin d'origine et son alerte sont intacts", async () => {
    const rst = await restitutionOuverte();
    const {
      rows: [{ montant }],
    } = await db.query(`select public.ajouter_retenue($1,'Joint silicone',60,null,null,null) as montant`, [rst]);
    expect(Number(montant)).toBeCloseTo(60, 2);

    const {
      rows: [{ sans_justificatif }],
    } = await db.query(`select sans_justificatif from public.retenues where restitution_id=$1`, [rst]);
    expect(sans_justificatif).toBe(true);
    const al = await db.query(
      `select type from public.alerts where organization_id=$1 and type='retenue_sans_justificatif'`,
      [orgA]
    );
    expect(al.rowCount).toBe(1);
    expect(await compterGed()).toEqual({ documents: 0, liens: 0 });
  });

  it("sans EDL d'entrée (RM-2.4.3) : refus, et aucune pièce déposée au passage", async () => {
    const bail = await bailAvecDepotEncaisse(700);
    const {
      rows: [{ id: rst }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,false) as id`, [bail]);
    const p = piece("empreinte-devis-sans-edl");

    await attendreEchec(
      db,
      /aucune retenue n'est possible/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture',300,null,null,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );
    expect(await compterGed()).toEqual({ documents: 0, liens: 0 });
  });

  it("décompte finalisé : refus, et aucune pièce déposée au passage", async () => {
    const rst = await restitutionOuverte();
    await db.query(`select public.finaliser_decompte($1)`, [rst]);
    const p = piece("empreinte-devis-finalise");

    await attendreEchec(
      db,
      /finalisé/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture',300,null,null,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );
    expect(await compterGed()).toEqual({ documents: 0, liens: 0 });
  });

  it("justificatif fourni après coup : le second dépôt refusé ne laisse rien", async () => {
    const rst = await restitutionOuverte();
    await db.query(`select public.ajouter_retenue($1,'Joint silicone',60,null,null,null)`, [rst]);
    const {
      rows: [{ id: retenue }],
    } = await db.query(`select id from public.retenues where restitution_id=$1`, [rst]);

    const p1 = piece("empreinte-facture-joint");
    await db.query(`select public.justifier_retenue_avec_piece($1,$2,$3,$4,$5)`, [
      retenue,
      p1.chemin,
      p1.mime,
      p1.taille,
      p1.empreinte,
    ]);
    const {
      rows: [r],
    } = await db.query(
      `select sans_justificatif, justificatif_document is not null as a_une_piece
       from public.retenues where id=$1`,
      [retenue]
    );
    expect(r.sans_justificatif).toBe(false);
    expect(r.a_une_piece).toBe(true);
    // L'alerte liée à l'événement d'origine se ferme (décision 29/08)
    const al = await db.query(
      `select statut from public.alerts where organization_id=$1 and type='retenue_sans_justificatif'`,
      [orgA]
    );
    expect(al.rows.map((a) => a.statut)).toEqual(["fermee"]);
    expect(await compterGed()).toEqual({ documents: 1, liens: 1 });

    // Double-clic, ou deux agents sur le même dossier : la seconde pièce ne
    // doit pas rester en GED derrière le refus.
    const p2 = piece("empreinte-facture-en-double");
    await attendreEchec(db, /déjà un justificatif/, `select public.justifier_retenue_avec_piece($1,$2,$3,$4,$5)`, [
      retenue,
      p2.chemin,
      p2.mime,
      p2.taille,
      p2.empreinte,
    ]);
    expect(await compterGed()).toEqual({ documents: 1, liens: 1 });
  });

  it("fichier malformé : format hors PDF/JPEG/PNG et chemin hors agence refusés", async () => {
    const rst = await restitutionOuverte();
    const p = piece("empreinte-devis-malforme");

    await attendreEchec(
      db,
      /Format refusé/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture',900,7,3,$2,'application/zip',$3,$4)`,
      [rst, p.chemin, p.taille, p.empreinte]
    );
    // Le 1er segment du chemin porte l'isolation du bucket : un chemin qui
    // sort de l'agence est un chemin qu'on refuse d'écrire.
    await attendreEchec(
      db,
      /Chemin de fichier invalide/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture',900,7,3,$2,$3,$4,$5)`,
      [rst, `${crypto.randomUUID()}/ailleurs.pdf`, p.mime, p.taille, p.empreinte]
    );
    expect(await compterGed()).toEqual({ documents: 0, liens: 0 });
  });

  async function creerIntrus(): Promise<string> {
    await db.query("reset role");
    const {
      rows: [{ id: autreOrg }],
    } = await db.query(`insert into public.organizations (name, status) values ('Autre agence','active') returning id`);
    const intrus = await creerUtilisateur(db);
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`,
      [intrus, autreOrg]
    );
    return intrus;
  }

  it("une autre agence ne peut ni écrire la pièce ni sonder les empreintes", async () => {
    const rst = await restitutionOuverte();
    const p = piece("empreinte-devis-intrus");

    const intrus = await creerIntrus();
    await simuler(db, intrus);
    await attendreEchec(
      db,
      /Accès refusé/,
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture',900,7,3,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );
    await simuler(db, gerant);
    expect(await compterGed()).toEqual({ documents: 0, liens: 0 });
  });

  // Le contrôle d'accès de `ajouter_retenue_avec_justificatif` a l'air de faire
  // double emploi avec celui d'`ajouter_retenue` — il ne le fait pas : la fiche
  // s'insère AVANT que la règle ne tranche, et l'unicité d'empreinte répond
  // donc AVANT le refus d'accès. Sans ce contrôle, un intrus apprend si un
  // contenu donné dort déjà dans la GED de l'autre agence : les deux sondes
  // doivent rester INDISCERNABLES.
  it("l'intrus ne distingue pas une empreinte connue d'une empreinte inconnue", async () => {
    const rst = await restitutionOuverte();
    await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path, mime_type,
         taille_octets, empreinte)
       values ($1,'justificatif','Devis confidentiel',$2,'application/pdf',100,'EMPREINTE-DE-A')`,
      [orgA, `${orgA}/deja.pdf`]
    );
    const intrus = await creerIntrus();
    await simuler(db, intrus);

    const sonde = async (empreinte: string): Promise<string> => {
      await db.query("savepoint s");
      const reponse = await db
        .query(
          `select public.ajouter_retenue_avec_justificatif($1,'Peinture',900,7,3,$2,'application/pdf',100,$3)`,
          [rst, `${orgA}/${crypto.randomUUID()}.pdf`, empreinte]
        )
        .then(() => "aucun refus")
        .catch((e: Error) => e.message);
      await db.query("rollback to savepoint s");
      return reponse;
    };

    expect(await sonde("EMPREINTE-DE-A")).toBe("Accès refusé");
    expect(await sonde("EMPREINTE-INCONNUE")).toBe("Accès refusé");
    await simuler(db, gerant);
  });

  it("l'octet abandonné part en file de purge, jamais un fichier encore réclamé", async () => {
    const rst = await restitutionOuverte();
    const p = piece("empreinte-devis-vivant");
    await db.query(
      `select public.ajouter_retenue_avec_justificatif($1,'Peinture salon',900,7,3,$2,$3,$4,$5)`,
      [rst, p.chemin, p.mime, p.taille, p.empreinte]
    );

    // Le chemin d'un dépôt que la règle a refusé : plus aucune fiche ne le
    // réclame, il porte pourtant des données du locataire — il doit partir.
    const orphelin = `${orgA}/${crypto.randomUUID()}.pdf`;
    const {
      rows: [{ mis }],
    } = await db.query(`select public.purger_fichier_sans_fiche($1) as mis`, [orphelin]);
    expect(mis).toBe(true);

    // Une pièce vivante ne se détruit pas par ce chemin…
    const {
      rows: [{ vivant }],
    } = await db.query(`select public.purger_fichier_sans_fiche($1) as vivant`, [p.chemin]);
    expect(vivant).toBe(false);
    // …ni le fichier d'une agence dont on n'est pas membre.
    const {
      rows: [{ ailleurs }],
    } = await db.query(`select public.purger_fichier_sans_fiche($1) as ailleurs`, [
      `${crypto.randomUUID()}/x.pdf`,
    ]);
    expect(ailleurs).toBe(false);

    await db.query("reset role");
    const file = await db.query(`select storage_path, deleted_at from public.purge_fichiers`);
    expect(file.rows.map((f) => f.storage_path)).toEqual([orphelin]);
    expect(file.rows[0].deleted_at).toBeNull();
  });
});

// Les fonctions ci-dessus ne protègent la GED que si le formulaire passe
// réellement par elles. Le défaut d'origine ne vivait pas en base mais dans
// l'ordre des appels de l'action serveur : dépôt de la fiche, PUIS règle
// métier. Ce garde-fou lit la source pour que ce retour en arrière se voie.
describe("Formulaire de restitution — la fiche ne précède plus la règle", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../src/app/actions/restitution.ts"),
    "utf8"
  );

  it("passe par les RPC indivisibles, jamais par un dépôt GED préalable", () => {
    expect(source).toContain("ajouter_retenue_avec_justificatif");
    expect(source).toContain("justifier_retenue_avec_piece");
    // deposerFichierGed écrit la fiche dans SA propre transaction : l'utiliser
    // ici, c'est reposer la pièce fantôme du refus.
    expect(source).not.toContain("deposerFichierGed");
  });

  it("met en file de purge l'octet monté au Storage quand la règle refuse", () => {
    expect(source).toContain("purger_fichier_sans_fiche");
  });
});

// ── Banc d'essai à DEUX transactions ───────────────────────────────────────
//
// Les tests ci-dessus appellent la RPC indivisible dans un savepoint qu'ils
// défont ensuite : après un `rollback to savepoint`, la GED est vide QUOI QUE
// la fonction ait écrit. Ils vérifient donc le message de refus, pas
// l'indivisibilité — vérifié : une fonction qui écrit la fiche PUIS refuse les
// laisse tous passer.
//
// Le défaut ne vit pas dans une transaction, il vit ENTRE deux : PostgREST
// traite chaque requête dans la sienne, et ce que la première a écrit survit
// au refus de la seconde. Ce banc rejoue cette réalité — un savepoint par
// appel, relâché au succès, défait au seul refus — puis fait tourner l'action
// serveur RÉELLE dessus. Remettre le dépôt GED avant la règle métier fait
// tomber ces tests ; la lecture de source, non.
const banc = vi.hoisted(() => ({
  db: null as unknown,
  gerant: "",
  // Le Storage n'est pas transactionnel : ce qui y monte n'est jamais défait.
  montes: [] as string[],
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    supabase: supabaseSurLaBase(),
    user: { id: banc.gerant },
    role: "admin_agence",
  }),
}));

async function commeUneRequete<T>(
  travail: () => Promise<T>
): Promise<{ data: T | null; error: { message: string } | null }> {
  const db = banc.db as Client;
  await db.query("savepoint requete");
  try {
    const data = await travail();
    await db.query("release savepoint requete");
    return { data, error: null };
  } catch (e) {
    await db.query("rollback to savepoint requete");
    return { data: null, error: { message: (e as Error).message } };
  }
}

// Le client que l'action croit être PostgREST : les mêmes appels, joués sur la
// connexion pg du test — donc sous le rôle et la RLS du gérant.
function supabaseSurLaBase() {
  const db = () => banc.db as Client;
  return {
    rpc: (nom: string, args: Record<string, unknown>) =>
      commeUneRequete(async () => {
        const cles = Object.keys(args);
        const appel = cles.map((c, i) => `${c} => $${i + 1}`).join(", ");
        const r = await db().query(`select public.${nom}(${appel}) as v`, cles.map((c) => args[c]));
        return r.rows[0]?.v ?? null;
      }),
    storage: {
      from: () => ({
        upload: async (chemin: string) => {
          banc.montes.push(chemin);
          return { error: null };
        },
      }),
    },
    from: (table: string) => ({
      select: (colonnes: string) => {
        const ou: string[] = [];
        const vals: unknown[] = [];
        const q = {
          eq(c: string, v: unknown) {
            vals.push(v);
            ou.push(`${c} = $${vals.length}`);
            return q;
          },
          is(c: string, v: unknown) {
            ou.push(`${c} is ${v === null ? "null" : String(v)}`);
            return q;
          },
          maybeSingle: () =>
            commeUneRequete(async () => {
              const r = await db().query(
                `select ${colonnes} from public.${table} where ${ou.join(" and ")} limit 1`,
                vals
              );
              return r.rows[0] ?? null;
            }),
        };
        return q;
      },
      insert: (valeurs: Record<string, unknown>) => {
        // Fidélité au vrai client : PostgREST sérialise en JSON, une clé
        // `undefined` n'est donc pas transmise.
        const champs = JSON.parse(JSON.stringify(valeurs)) as Record<string, unknown>;
        const colonnes = Object.keys(champs);
        const executer = (retour: string) =>
          commeUneRequete(async () => {
            const r = await db().query(
              `insert into public.${table} (${colonnes.join(", ")})
               values (${colonnes.map((_, i) => `$${i + 1}`).join(", ")}) ${retour}`,
              colonnes.map((c) => champs[c])
            );
            return r.rows[0] ?? null;
          });
        return {
          then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
            executer("").then(ok, ko),
          select: (cols: string) => ({ single: () => executer(`returning ${cols}`) }),
        };
      },
    }),
  };
}

// Un PDF minimal mais VRAI : en-tête %PDF- et marque de fin %%EOF, sans quoi
// preparerFichierGed le refuse avant même d'arriver à la règle métier.
function devisPdf(contenu: string): File {
  return new File([`%PDF-1.4\n% ${contenu}\n%%EOF\n`], "devis.pdf", { type: "application/pdf" });
}
function formulaireRetenue(libelle: string, cout: string, duree: string, age: string, f?: File) {
  const fd = new FormData();
  fd.set("libelle", libelle);
  fd.set("cout", cout);
  fd.set("duree_vie", duree);
  fd.set("age", age);
  if (f) fd.set("justificatif", f);
  return fd;
}

describe.skipIf(!DB_URL)("Action serveur — la fiche ne précède plus la règle", () => {
  let db: Client;
  let orgA: string;
  let gerant: string;
  let bailId: string;
  let rst: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    banc.db = db;
  });
  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    banc.montes.length = 0;
    await db.query("begin");
    const {
      rows: [{ id: org }],
    } = await db.query(`insert into public.organizations (name,status) values ('Banc retenue','active') returning id`);
    orgA = org;
    gerant = await creerUtilisateur(db);
    banc.gerant = gerant;
    await db.query(`insert into public.memberships (account_id, organization_id, role) values ($1,$2,'admin_agence')`, [
      gerant,
      orgA,
    ]);
    const {
      rows: [{ id: loc }],
    } = await db.query(`insert into public.persons (organization_id,nom) values ($1,'Loc') returning id`, [orgA]);
    await simuler(db, gerant);
    const {
      rows: [{ id: bien }],
    } = await db.query(
      `select public.creer_bien_avec_lot($1,'9 rue Banc','appartement'::public.bien_type,'9 rue Banc',null,'75001','Paris',1990,false,45,2) as id`,
      [orgA]
    );
    const {
      rows: [{ id: lot }],
    } = await db.query(`select id from public.lots where bien_id=$1`, [bien]);
    const {
      rows: [{ id: bail }],
    } = await db.query(
      `insert into public.baux (organization_id,lot_id,locataire_principal,depot_garantie,loyer_hc)
       values ($1,$2,$3,900,900) returning id`,
      [orgA, lot, loc]
    );
    bailId = bail;
    await db.query(`select public.encaisser_depot($1,900,current_date,'virement',null,null)`, [bail]);
    const {
      rows: [{ id: edl }],
    } = await db.query(
      `insert into public.etats_des_lieux (organization_id,bail_id,type) values ($1,$2,'entree') returning id`,
      [orgA, bail]
    );
    await db.query(`select public.generer_grille_edl($1)`, [edl]);
    await db.query(`update public.edl_lignes set etat='bon'::public.etat_element where edl_id=$1`, [edl]);
    await db.query(`select public.signer_edl($1)`, [edl]);
    const {
      rows: [{ id }],
    } = await db.query(`select public.demarrer_restitution($1,current_date,true) as id`, [bail]);
    rst = id;
  });

  afterEach(async () => {
    await db.query("rollback");
  });

  async function gedDeLAgence() {
    const {
      rows: [c],
    } = await db.query(
      `select (select count(*) from public.documents where organization_id=$1)::int as documents,
              (select count(*) from public.document_liens where organization_id=$1)::int as liens`,
      [orgA]
    );
    return c;
  }

  it("le refus de la règle ne laisse AUCUNE fiche derrière lui (deux transactions)", async () => {
    const { ajouterRetenue } = await import("@/app/actions/restitution");
    // Peinture de 9 ans sur une durée de vie de 7 : RM-2.4.5, issue normale
    const etat = await ajouterRetenue(
      orgA,
      bailId,
      rst,
      {},
      formulaireRetenue("Peinture salon", "900", "7", "9", devisPdf("devis-peinture"))
    );

    expect(etat.erreur).toMatch(/entièrement amorti/);
    // Rien n'est défait ici : c'est l'état que l'agent suivant trouvera.
    expect(await gedDeLAgence()).toEqual({ documents: 0, liens: 0 });
    const {
      rows: [{ n }],
    } = await db.query(`select count(*)::int as n from public.retenues where restitution_id=$1`, [rst]);
    expect(n).toBe(0);
  });

  it("l'octet monté au Storage part en file de purge quand la règle refuse", async () => {
    const { ajouterRetenue } = await import("@/app/actions/restitution");
    await ajouterRetenue(
      orgA,
      bailId,
      rst,
      {},
      formulaireRetenue("Peinture salon", "900", "7", "9", devisPdf("devis-a-purger"))
    );

    expect(banc.montes).toHaveLength(1);
    await db.query("reset role");
    const file = await db.query(`select storage_path from public.purge_fichiers where storage_path = $1`, [
      banc.montes[0],
    ]);
    expect(file.rowCount).toBe(1);
  });

  it("après le refus, le MÊME devis passe : l'empreinte n'est pas séquestrée", async () => {
    const { ajouterRetenue } = await import("@/app/actions/restitution");
    const devis = devisPdf("devis-identique");
    await ajouterRetenue(orgA, bailId, rst, {}, formulaireRetenue("Peinture salon", "900", "7", "9", devis));

    // L'agent corrige l'âge et rejoint le MÊME fichier : c'est le geste que la
    // pièce fantôme interdisait par son empreinte.
    const etat = await ajouterRetenue(
      orgA,
      bailId,
      rst,
      {},
      formulaireRetenue("Peinture salon", "900", "7", "3", devisPdf("devis-identique"))
    );

    expect(etat.erreur).toBeUndefined();
    expect(etat.succes).toMatch(/Retenue ajoutée/);
    const {
      rows: [r],
    } = await db.query(
      `select r.montant_retenu, r.sans_justificatif, d.storage_path
         from public.retenues r join public.documents d on d.id = r.justificatif_document
        where r.restitution_id = $1`,
      [rst]
    );
    expect(Number(r.montant_retenu)).toBeCloseTo(514.29, 2); // 900 × 4/7 (RM-2.4.4)
    expect(r.sans_justificatif).toBe(false);
    // La pièce gardée est celle du SECOND dépôt, la seule que la GED connaisse.
    expect(r.storage_path).toBe(banc.montes[1]);
    expect(await gedDeLAgence()).toEqual({ documents: 1, liens: 1 });
  });

  it("geste légitime du premier coup : la retenue et sa pièce, sans purge", async () => {
    const { ajouterRetenue } = await import("@/app/actions/restitution");
    const etat = await ajouterRetenue(
      orgA,
      bailId,
      rst,
      {},
      formulaireRetenue("Peinture salon", "900", "7", "3", devisPdf("devis-bon-du-premier-coup"))
    );

    expect(etat.succes).toMatch(/Retenue ajoutée/);
    expect(await gedDeLAgence()).toEqual({ documents: 1, liens: 1 });
    await db.query("reset role");
    const file = await db.query(`select count(*)::int as n from public.purge_fichiers`);
    expect(file.rows[0].n).toBe(0);
  });
});
