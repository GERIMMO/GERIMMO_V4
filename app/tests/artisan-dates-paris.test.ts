/**
 * Audit du 13/10/2026 (ARC-10, partie base) : les clients externes de l'artisan comparaient la date du règlement, la
 * date d'accord du client et la validité du devis à `current_date`, c'est-à-dire au jour du fuseau de la session
 * (UTC chez Supabase). Entre minuit et 2 h à Paris (heure d'été), la date réelle du jour était refusée « sans date
 * future », et celle de la veille acceptée.
 *
 * `now()` ne se simule pas : on fait varier le fuseau de la SESSION, dont dépend `current_date`. Un fuseau très en
 * retard (UTC-12) ou très en avance (UTC+14) sur Paris donne, à toute heure de la journée, au moins un cas où le jour
 * de la session n'est pas celui de Paris, exactement comme UTC entre 22 h et minuit. Avec l'expression explicite
 * `(now() at time zone 'Europe/Paris')::date`, le résultat ne dépend plus du fuseau de la session : c'est aussi ce
 * qui rend sans importance le fuseau réel de la base de production.
 *
 * Tout est joué dans une transaction annulée à la fin.
 */
import { randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

// UTC : le fuseau supposé de la production ; UTC-12 et UTC+14 : les deux extrêmes ; Paris : rien ne diverge.
const FUSEAUX = ["UTC", "Etc/GMT+12", "Etc/GMT-14", "Europe/Paris"];
const LIGNES = [{ libelle: "Réparation TEST", quantite: 2, prix_unitaire_ht_cents: 2500, tva_bps: 1000 }];

describe.skipIf(!url)("Clients externes : le jour est celui de Paris, quel que soit le fuseau de la session (ARC-10)", () => {
  let db: Client;
  let uid: string;
  let artisan: string;
  let pdf: string;
  let photo: string;
  let client: string;
  let chantier: string;

  /** Le jour de Paris, décalé de `decalage` jours, au format AAAA-MM-JJ. */
  async function jourParis(decalage = 0) {
    const { rows } = await db.query("select ((now() at time zone 'Europe/Paris')::date + $1::int)::text as j", [decalage]);
    return rows[0].j as string;
  }
  async function fuseau(nom: string) {
    await db.query("select set_config('timezone', $1, true)", [nom]);
  }
  async function identite(id: string) {
    await db.query("reset role");
    await db.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated', 'aal', 'aal2')::text, true)",
      [id]
    );
    await db.query("set local role authenticated");
  }
  /** Joue le geste puis l'annule, qu'il réussisse ou non : chaque cas repart du même état. */
  async function sansTrace<T>(geste: () => Promise<T>): Promise<T> {
    await db.query("savepoint essai");
    try {
      return await geste();
    } finally {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
    }
  }
  /** Un état que l'artisan ne peut pas produire (une validité déjà échue), posé par le propriétaire de la base. */
  async function fixerValidite(devis: string, validite: string) {
    await db.query("reset role");
    await db.query("update public.artisan_devis_externes set valide_jusqu_au = $2::date where id = $1", [devis, validite]);
    await identite(uid);
  }

  async function revision() {
    return (await db.query("select revision from public.artisan_chantiers where id = $1", [chantier])).rows[0].revision as number;
  }
  async function ecrire(action: string, donnees: Record<string, unknown>, id: string | undefined = chantier, rev?: number) {
    const { rows } = await db.query("select public.artisan_externe_ecrire($1, $2, $3, $4, $5) as id", [
      action, id, rev ?? (action === "client" || action === "chantier" ? 0 : await revision()), donnees, randomUUID(),
    ]);
    return rows[0].id as string;
  }
  async function dernierDevis() {
    return (await db.query("select * from public.artisan_devis_externes where chantier_id = $1 order by version desc limit 1", [chantier])).rows[0];
  }
  async function reglement(facture: string, date: string) {
    const { rows } = await db.query("select public.artisan_reglement_ecrire('reglement', 'externe', $1, $2, $3) as id", [
      facture,
      { montant_cents: 1000, date, moyen: "virement", reference: "Versement fictif", piece_id: pdf },
      randomUUID(),
    ]);
    return rows[0].id as string;
  }

  /** Un devis en brouillon, valable 30 jours. */
  async function devisBrouillon() {
    await ecrire("devis", { description: "Réparation fictive", lignes: LIGNES, valide_jusqu_au: await jourParis(30) });
    return (await dernierDevis()).id as string;
  }
  /** Un devis relu et validé (PDF joint), valable 30 jours. */
  async function devisValide() {
    const devis = await devisBrouillon();
    await ecrire("valider_devis", { devis_id: devis, piece_id: pdf });
    return devis;
  }
  /** Une facture de 55 EUR sur un chantier mené à son terme : de quoi enregistrer des règlements. */
  async function factureExterne() {
    const devis = await devisValide();
    await ecrire("decision", { devis_id: devis, piece_id: pdf, decision: "accepte", date: await jourParis(), motif: "Accord écrit fictif du client" });
    await ecrire("planning", {
      debut: new Date(Date.now() + 2 * 86400000).toISOString(),
      fin: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(),
      motif: "",
    });
    await ecrire("demarrer", {});
    await ecrire("bilan", { bilan: "Réparation fictive terminée, aucune opération réelle", piece_id: photo });
    await ecrire("facture", { numero: "TEST-55", montant_ttc_cents: 5500, piece_id: pdf });
    return (await db.query("select id from public.artisan_factures_externes where chantier_id = $1", [chantier])).rows[0].id as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query("update public.artisan_modules_locaux set actif = true");
    uid = randomUUID();
    await db.query("insert into auth.users(id, email, encrypted_password, email_confirmed_at) values ($1, $2, 'x', now())", [uid, `dates-paris-${uid}@example.invalid`]);
    artisan = (await db.query(
      "insert into public.artisans(account_id, raison_sociale, siret, telephone) values ($1, 'TEST Artisan dates', $2, '0600000000') returning id",
      [uid, String(randomInt(10000000000000, 99999999999999))]
    )).rows[0].id;
    await db.query("insert into public.artisan_profils_documents(artisan_id, adresse, mentions) values ($1, 'Adresse TEST', 'ENTREPRISE FICTIVE')", [artisan]);
    const piece = async (mime: string) => (await db.query(
      `insert into public.artisan_pieces_privees(artisan_id, storage_path, nom, mime, taille, sha256, created_by)
       values ($1, $2, 'TEST', $3, 100, $4, $5) returning id`,
      [artisan, `${artisan}/${randomUUID()}.test`, mime, "a".repeat(64), uid]
    )).rows[0].id as string;
    pdf = await piece("application/pdf");
    photo = await piece("image/png");
  });
  beforeEach(async () => {
    await db.query("reset role");
    await db.query("savepoint cas");
    await identite(uid);
    // Le dossier se prépare au fuseau de Paris, dont le jour est celui que la base doit toujours employer : seul
    // le geste testé se joue ensuite dans le fuseau du cas.
    await fuseau("Europe/Paris");
    client = await ecrire("client", { nom: "Client TEST", type: "particulier", adresse: "1 rue fictive", email: "client@example.invalid" }, undefined, 0);
    chantier = await ecrire("chantier", { titre: "Chantier TEST", adresse: "1 rue fictive", description: "Réparation fictive" }, client, 0);
  });
  afterEach(async () => {
    await db.query("reset role");
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  it("la définition en vigueur ne compare plus rien à current_date : le jour de Paris y est écrit", async () => {
    for (const signature of [
      "public.artisan_reglement_ecrire(text,text,uuid,jsonb,uuid)",
      "public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)",
    ]) {
      const { rows } = await db.query("select pg_get_functiondef($1::text::regprocedure) as def", [signature]);
      expect(rows[0].def, signature).not.toMatch(/current_date/);
      expect(rows[0].def, signature).toContain("(now() at time zone 'Europe/Paris')::date");
      expect(rows[0].def, signature).toContain("Audit du 13/10 (ARC-10)");
    }
    const { rows } = await db.query("select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) as def");
    expect(rows[0].def).toContain("(d.created_at at time zone 'Europe/Paris')::date");
    expect(rows[0].def).not.toContain("d.created_at::date");
  });

  describe.each(FUSEAUX)("session en fuseau %s", (zone) => {
    it("règlement : le jour de Paris est accepté, le lendemain est refusé comme date future", async () => {
      const facture = await factureExterne();
      const aujourdhui = await jourParis();
      const demain = await jourParis(1);
      await fuseau(zone);
      expect(await sansTrace(() => reglement(facture, aujourdhui))).toBeTruthy();
      await expect(sansTrace(() => reglement(facture, demain))).rejects.toThrow(/sans date future/);
    });

    it("validité d'un nouveau devis : du jour de Paris à +365 jours, pas avant, pas au-delà", async () => {
      await fuseau(zone);
      const creer = async (validite: string) => sansTrace(() => ecrire("devis", { description: "TEST", lignes: LIGNES, valide_jusqu_au: validite }));
      expect(await creer(await jourParis())).toBeTruthy();
      expect(await creer(await jourParis(365))).toBeTruthy();
      await expect(creer(await jourParis(-1))).rejects.toThrow(/validité/);
      await expect(creer(await jourParis(366))).rejects.toThrow(/validité/);
    });

    it("relecture du devis : valable jusqu'au jour de Paris inclus, plus valable la veille", async () => {
      const devis = await devisBrouillon();
      await fuseau(zone);
      const valider = async (validite: string) => sansTrace(async () => {
        await fixerValidite(devis, validite);
        return ecrire("valider_devis", { devis_id: devis, piece_id: pdf });
      });
      expect(await valider(await jourParis())).toBeTruthy();
      await expect(valider(await jourParis(-1))).rejects.toThrow(/devis valable/);
    });

    it("décision du client : un devis valable jusqu'au jour de Paris inclus se décide, celui de la veille non", async () => {
      const devis = await devisValide();
      const aujourdhui = await jourParis();
      await fuseau(zone);
      const decider = async (validite: string) => sansTrace(async () => {
        await fixerValidite(devis, validite);
        return ecrire("decision", { devis_id: devis, piece_id: pdf, decision: "accepte", date: aujourdhui, motif: "Accord écrit fictif du client" });
      });
      expect(await decider(aujourdhui)).toBeTruthy();
      await expect(decider(await jourParis(-1))).rejects.toThrow(/encore valable/);
    });

    it("date d'accord du client : le jour de Paris est accepté ; demain et la veille du devis sont refusés", async () => {
      const devis = await devisValide();
      await fuseau(zone);
      // Le devis a été créé aujourd'hui à Paris : un accord daté d'avant sa création est incohérent.
      const decider = async (date: string) => sansTrace(() =>
        ecrire("decision", { devis_id: devis, piece_id: pdf, decision: "accepte", date, motif: "Accord écrit fictif du client" })
      );
      expect(await decider(await jourParis())).toBeTruthy();
      await expect(decider(await jourParis(1))).rejects.toThrow(/Date de décision invalide/);
      await expect(decider(await jourParis(-1))).rejects.toThrow(/Date de décision invalide/);
    });
  });
});
