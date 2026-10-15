/**
 * Lot « artisan-externe » — décisions du dirigeant du 14/10/2026.
 *
 * D24-B (fiches ARC-07, ARC-04) : le numéro d'une facture externe est unique pour un artisan sans tenir compte
 * des majuscules ni des espaces autour (index unique + contrôle serveur + message clair), y compris face aux
 * factures que Gerimmo a déjà reçues de lui. L'écran de relecture est testé dans artisan-prive-facture.test.ts.
 *
 * D25-B (fiche ARC-08) : un artisan « refusé » ou sur la liste noire globale ne peut plus écrire dans l'outil
 * clients externes (client, chantier, devis, facture) ; la lecture et l'export restent ouverts. Un artisan
 * « en attente » garde l'outil.
 *
 * Tout est joué dans une transaction annulée à la fin, sur la base locale jetable (SUPABASE_DB_URL).
 */
import { randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { MESSAGE_ECRITURE_FERMEE } from "@/lib/artisan-prive-exclusion";
import { MESSAGE_NUMERO_FACTURE_UTILISE } from "@/lib/artisan-prive-facture";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const jour = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const validite = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const lignes = [{ libelle: "Réparation TEST", quantite: 2, prix_unitaire_ht_cents: 2500, tva_bps: 1000 }];

describe.skipIf(!url)("Clients externes — numéro de facture unique (D24-B) et artisans exclus (D25-B)", () => {
  let db: Client, uid: string, autre: string, artisan: string, artisanB: string, pdf: string, photo: string, client: string, chantier: string;

  async function identite(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [id]);
    await db.query("set local role authenticated");
  }
  async function compte() {
    const id = randomUUID();
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'x',now())", [id, `lot-ext-${id}@example.invalid`]);
    return id;
  }
  async function fiche(id: string) {
    return (await db.query("insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'TEST Artisan lot externe',$2,'0600000000') returning id", [id, String(randomInt(10000000000000, 99999999999999))])).rows[0].id as string;
  }
  async function piece(mime: string, a = artisan, owner = uid) {
    return (await db.query("insert into public.artisan_pieces_privees(artisan_id,storage_path,nom,mime,taille,sha256,created_by) values($1,$2,'TEST',$3,100,$4,$5) returning id", [a, `${a}/${randomUUID()}.test`, mime, "a".repeat(64), owner])).rows[0].id as string;
  }
  async function revision(h = chantier) {
    return (await db.query("select revision from public.artisan_chantiers where id=$1", [h])).rows[0].revision as number;
  }
  async function ecrire(action: string, donnees: Record<string, unknown>, id: string | undefined = chantier, rev?: number, cle = randomUUID()) {
    return (await db.query("select public.artisan_externe_ecrire($1,$2,$3,$4,$5) id", [action, id, rev ?? (action === "client" || action === "chantier" ? 0 : await revision(id)), donnees, cle])).rows[0].id as string;
  }
  async function essai<T>(f: () => Promise<T>) {
    await db.query("savepoint erreur");
    try { const r = await f(); await db.query("release savepoint erreur"); return r; }
    catch (e) { await db.query("rollback to savepoint erreur"); throw e; }
  }
  async function dernierDevis(h = chantier) {
    return (await db.query("select * from public.artisan_devis_externes where chantier_id=$1 order by version desc limit 1", [h])).rows[0];
  }
  /** Un chantier terminé, devis accepté, prêt pour la facture. Par défaut chez l'artisan A ; `propre` : les pièces et le client d'un autre artisan. */
  async function chantierPretFacture(titre = "Chantier prêt", propre: { client: string; pdf: string; photo: string } = { client, pdf, photo }) {
    const h = await ecrire("chantier", { titre, adresse: "1 rue fictive", description: "Réparation fictive" }, propre.client, 0);
    await ecrire("devis", { description: "Réparation fictive", lignes, valide_jusqu_au: validite }, h);
    const d = await dernierDevis(h);
    await ecrire("valider_devis", { devis_id: d.id, piece_id: propre.pdf }, h);
    await ecrire("decision", { devis_id: d.id, piece_id: propre.pdf, decision: "accepte", date: jour, motif: "Accord écrit fictif du client" }, h);
    await ecrire("planning", { debut: new Date(Date.now() + 2 * 86400000).toISOString(), fin: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString() }, h);
    await ecrire("demarrer", {}, h);
    await ecrire("bilan", { bilan: "Réparation fictive terminée, aucune opération réelle", piece_id: propre.photo }, h);
    return h;
  }
  const facture = (numero: string, h = chantier, piece_id = pdf) => ecrire("facture", { numero, montant_ttc_cents: 5500, piece_id }, h);
  /** La chaîne complète de l'artisan B (profil du devis, pièces à lui, client, chantier terminé), jouée sous son identité. */
  async function chaineArtisanB(titre = "Chantier de B") {
    await db.query("reset role");
    await db.query("insert into public.artisan_profils_documents(artisan_id,adresse,mentions) values($1,'Adresse TEST B','ENTREPRISE FICTIVE B') on conflict do nothing", [artisanB]);
    const pdfB = await piece("application/pdf", artisanB, autre);
    const photoB = await piece("image/png", artisanB, autre);
    await identite(autre);
    // Un client distinct à chaque appel : deux dossiers identiques chez un même artisan sont refusés comme doublons.
    const clientB = await ecrire("client", { nom: `Client de B ${randomUUID().slice(0, 8)}`, type: "particulier", adresse: "8 rue fictive" }, undefined, 0);
    return { chantier: await chantierPretFacture(titre, { client: clientB, pdf: pdfB, photo: photoB }), pdf: pdfB };
  }
  async function statut(a: string, etat: "en_attente" | "valide" | "refuse", listeNoire = false) {
    await db.query("reset role");
    await db.query(
      "update public.artisans set statut_plateforme=$2::public.artisan_statut_plateforme, statut_motif=$3, blacklist_globale_le=$4::timestamptz, blacklist_globale_motif=$5 where id=$1",
      [a, etat, etat === "refuse" ? "Motif de test" : null, listeNoire ? new Date().toISOString() : null, listeNoire ? "Motif de test" : null]
    );
    await identite(uid);
  }
  async function activite() {
    return (await db.query("select public.mon_activite_artisan_privee() a")).rows[0].a;
  }
  async function compter() {
    return (await db.query(
      `select (select count(*)::int from public.artisan_clients) clients, (select count(*)::int from public.artisan_chantiers) chantiers,
              (select count(*)::int from public.artisan_devis_externes) devis, (select count(*)::int from public.artisan_factures_externes) factures,
              (select count(*)::int from public.artisan_evenements_prives) evenements`
    )).rows[0];
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query("update public.artisan_modules_locaux set actif=true");
    uid = await compte(); autre = await compte();
    artisan = await fiche(uid); artisanB = await fiche(autre);
    await db.query("insert into public.artisan_profils_documents(artisan_id,adresse,mentions) values($1,'Adresse TEST','ENTREPRISE FICTIVE')", [artisan]);
    pdf = await piece("application/pdf");
    photo = await piece("image/png");
  });
  beforeEach(async () => {
    await db.query("reset role");
    await db.query("savepoint cas");
    await identite(uid);
    client = await ecrire("client", { nom: "Client TEST", type: "particulier", adresse: "1 rue fictive", email: "client@example.invalid" }, undefined, 0);
    chantier = await chantierPretFacture();
  });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("D24-B — le numéro de facture est unique sans tenir compte de la casse", () => {
    it("refuse « art-2026-0001 » quand « ART-2026-0001 » existe déjà, avec un message qui dit pourquoi", async () => {
      await facture("ART-2026-0001");
      const second = await chantierPretFacture("Second chantier");
      await expect(essai(() => facture("art-2026-0001", second))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
      expect((await compter()).factures).toBe(1);
    });

    it("refuse aussi le même numéro entouré d'espaces, et la casse mêlée", async () => {
      await facture("ART-2026-0001");
      const second = await chantierPretFacture("Second chantier");
      await expect(essai(() => facture("  ART-2026-0001  ", second))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
      await expect(essai(() => facture("Art-2026-0001", second))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
      expect((await compter()).factures).toBe(1);
    });

    it("garde le numéro tel que l'artisan l'a écrit (aucune donnée réécrite), espaces de bord retirés", async () => {
      await facture("  Art-2026-0007 ");
      expect((await db.query("select numero from public.artisan_factures_externes where chantier_id=$1", [chantier])).rows[0].numero).toBe("Art-2026-0007");
    });

    it("accepte un numéro différent", async () => {
      await facture("ART-2026-0001");
      const second = await chantierPretFacture("Second chantier");
      await facture("ART-2026-0002", second);
      expect((await compter()).factures).toBe(2);
    });

    it("l'unicité est par artisan : le même numéro, même en casse différente, est accepté chez un autre artisan, dans les deux sens", async () => {
      // A dépose « ART-2026-0001 » ; B (chaîne complète, ses propres pièces) peut déposer « art-2026-0001 ».
      await facture("ART-2026-0001");
      const b = await chaineArtisanB();
      await facture("art-2026-0001", b.chantier, b.pdf);
      // B dépose en premier « ART-2026-0777 » ; A peut ensuite déposer le même numéro, à l'identique.
      const b2 = await chaineArtisanB("Second chantier de B");
      await facture("ART-2026-0777", b2.chantier, b2.pdf);
      await identite(uid);
      const second = await chantierPretFacture("Second chantier");
      await facture("ART-2026-0777", second);
      await db.query("reset role");
      const numeros = async (a: string) => ((await db.query("select numero from public.artisan_factures_externes where artisan_id=$1", [a])).rows.map((r) => r.numero as string)).sort();
      expect(await numeros(artisan)).toEqual(["ART-2026-0001", "ART-2026-0777"]);
      expect(await numeros(artisanB)).toEqual(["ART-2026-0777", "art-2026-0001"]);
      // L'index est lui aussi par artisan.
      const index = (await db.query("select indexdef from pg_indexes where indexname='artisan_factures_externes_numero_normalise_key'")).rows[0].indexdef as string;
      expect(index).toMatch(/UNIQUE/i);
      expect(index).toMatch(/artisan_id, lower\(btrim\(numero\)\)/);
    });

    it("chez l'autre artisan, la règle s'applique aussi : son propre doublon (casse ou espaces) est refusé", async () => {
      const b = await chaineArtisanB();
      await facture("ART-2026-0001", b.chantier, b.pdf);
      const b2 = await chaineArtisanB("Second chantier de B");
      await expect(essai(() => facture(" art-2026-0001 ", b2.chantier, b2.pdf))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
    });

    it("l'index unique tient même sans passer par la fonction (filet de sécurité)", async () => {
      await facture("ART-2026-0001");
      const second = await chantierPretFacture("Second chantier");
      const d = await dernierDevis(second);
      await db.query("reset role");
      await expect(
        essai(() =>
          db.query(
            "insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,piece_id) values($1,$2,$3,'art-2026-0001',100,$4)",
            [artisan, second, d.id, pdf]
          )
        )
      ).rejects.toThrow(/artisan_factures_externes_numero_normalise_key/);
    });

    it("refuse le numéro d'une facture que Gerimmo a déjà reçue de ce même artisan", async () => {
      await db.query("reset role");
      // Ligne minimale : les clés étrangères (agence, intervention, document) ne sont pas l'objet du test.
      await db.query("set local session_replication_role = replica");
      await db.query(
        "insert into public.intervention_factures(organization_id,intervention_id,artisan_id,numero,montant_ttc_cents,document_id) values($1,$2,$3,'F-GERIMMO-2026-001',12000,$4)",
        [randomUUID(), randomUUID(), artisan, randomUUID()]
      );
      await db.query("set local session_replication_role = origin");
      await identite(uid);
      await expect(essai(() => facture("f-gerimmo-2026-001"))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
      await facture("F-GERIMMO-2026-002");
    });

    it("le numéro d'une autre fiche artisan ne bloque pas", async () => {
      await db.query("reset role");
      await db.query("set local session_replication_role = replica");
      await db.query(
        "insert into public.intervention_factures(organization_id,intervention_id,artisan_id,numero,montant_ttc_cents,document_id) values($1,$2,$3,'F-AUTRE-001',12000,$4)",
        [randomUUID(), randomUUID(), artisanB, randomUUID()]
      );
      await db.query("set local session_replication_role = origin");
      await identite(uid);
      await facture("F-AUTRE-001");
    });

    it("rejouée avec la même clé, la même demande rend la même facture (pas de faux doublon)", async () => {
      const cle = randomUUID();
      const premiere = await ecrire("facture", { numero: "ART-2026-0009", montant_ttc_cents: 5500, piece_id: pdf }, chantier, undefined, cle);
      const rev = await revision();
      expect(await ecrire("facture", { numero: "ART-2026-0009", montant_ttc_cents: 5500, piece_id: pdf }, chantier, rev - 1, cle)).toBe(premiere);
      expect((await compter()).factures).toBe(1);
    });

    it("un second dépôt sur le même chantier reste refusé (une seule facture par chantier)", async () => {
      await facture("ART-2026-0001");
      await expect(essai(() => facture("ART-2026-0002"))).rejects.toThrow(/existe déjà|terminé ou annulé/);
    });
  });

  describe("D25-B — un artisan refusé ou sur liste noire n'écrit plus, lit et exporte encore", () => {
    const ACTIONS_COUPEES: [string, () => Promise<unknown>][] = [
      ["client", () => ecrire("client", { nom: "Autre client", type: "particulier", adresse: "2 rue fictive" }, undefined, 0)],
      ["modifier_client", () => ecrire("modifier_client", { nom: "Nouveau nom", type: "particulier", adresse: "1 rue fictive" }, client, 1)],
      ["archiver_client", () => ecrire("archiver_client", { archive: true }, client, 1)],
      ["chantier", () => ecrire("chantier", { titre: "Nouveau", adresse: "A", description: "D" }, client, 0)],
      ["devis", async () => ecrire("devis", { description: "X", lignes, valide_jusqu_au: validite })],
      ["facture", () => facture("ART-2026-0100")],
      ["annuler", () => ecrire("annuler", { motif: "Annulation de test" })],
    ];

    it.each(["refuse", "liste_noire"] as const)("%s : toutes les écritures sont refusées avec le message du cas, rien n'est écrit", async (cas) => {
      await statut(artisan, cas === "refuse" ? "refuse" : "valide", cas === "liste_noire");
      const avant = await compter();
      for (const [nom, agir] of ACTIONS_COUPEES) {
        await expect(essai(agir), nom).rejects.toThrow(MESSAGE_ECRITURE_FERMEE[cas]);
      }
      expect(await compter()).toEqual(avant);
    });

    it("refusé ET sur liste noire : le message de la liste noire (la plus lourde) s'applique", async () => {
      await statut(artisan, "refuse", true);
      await expect(essai(() => ecrire("client", { nom: "X", type: "particulier", adresse: "A" }, undefined, 0))).rejects.toThrow(MESSAGE_ECRITURE_FERMEE.liste_noire);
    });

    it("la lecture et l'export restent ouverts, et disent pourquoi la saisie est fermée", async () => {
      const avant = await activite();
      expect(avant.activation.exclusion).toBeNull();
      await statut(artisan, "refuse");
      const apres = await activite();
      expect(apres.activation.exclusion).toBe("refuse");
      expect(apres.clients).toHaveLength(1);
      expect(apres.chantiers).toHaveLength(1);
      expect(apres.devis.length).toBeGreaterThan(0);
      expect(apres.pieces).toHaveLength(avant.pieces.length);
      await statut(artisan, "valide", true);
      expect((await activite()).activation.exclusion).toBe("liste_noire");
    });

    it("un artisan « en attente » garde l'outil (adoption), comme un artisan validé", async () => {
      await statut(artisan, "en_attente");
      expect((await activite()).activation.exclusion).toBeNull();
      await ecrire("client", { nom: "Client en attente", type: "particulier", adresse: "3 rue fictive" }, undefined, 0);
      await statut(artisan, "valide");
      await ecrire("client", { nom: "Client validé", type: "particulier", adresse: "4 rue fictive" }, undefined, 0);
    });

    it("c'est réversible : une fois relevé, l'artisan écrit de nouveau", async () => {
      await statut(artisan, "refuse", true);
      await expect(essai(() => ecrire("client", { nom: "X", type: "particulier", adresse: "A" }, undefined, 0))).rejects.toThrow(/Gerimmo/);
      await statut(artisan, "valide", false);
      await ecrire("client", { nom: "Après levée", type: "particulier", adresse: "5 rue fictive" }, undefined, 0);
    });

    it("une demande déjà enregistrée n'est pas rejouée par un artisan exclu entre-temps", async () => {
      const cle = randomUUID();
      const donnees = { nom: "Client rejoué", type: "particulier", adresse: "6 rue fictive" };
      await ecrire("client", donnees, undefined, 0, cle);
      await statut(artisan, "refuse");
      await expect(essai(() => ecrire("client", donnees, undefined, 0, cle))).rejects.toThrow(MESSAGE_ECRITURE_FERMEE.refuse);
    });

    it("l'exclusion d'un artisan ne touche pas un autre artisan", async () => {
      await statut(artisan, "refuse", true);
      await identite(autre);
      await ecrire("client", { nom: "Client de B", type: "particulier", adresse: "7 rue fictive" }, undefined, 0);
    });

    it("la décision ne vise que client, devis et facture : les règlements déclarés restent ouverts (à confirmer par le dirigeant)", async () => {
      const f = await facture("ART-2026-0200");
      const id = (await db.query("select id from public.artisan_factures_externes where chantier_id=$1", [chantier])).rows[0].id;
      expect(f).toBeTruthy();
      await statut(artisan, "refuse", true);
      const r = await db.query("select public.artisan_reglement_ecrire('reglement','externe',$1,$2,$3) id", [id, { montant_cents: 1000, date: jour, moyen: "virement", reference: "Versement fictif", piece_id: pdf }, randomUUID()]);
      expect(r.rows[0].id).toBeTruthy();
    });

    it("la fonction de contrôle n'est ouverte ni à anon ni à un compte sans fiche artisan", async () => {
      await db.query("reset role");
      const droits = (await db.query("select has_function_privilege('anon','public.artisan_exclusion_plateforme()','execute') anon, has_function_privilege('authenticated','public.artisan_exclusion_plateforme()','execute') connecte")).rows[0];
      expect(droits).toEqual({ anon: false, connecte: true });
      const sansFiche = await compte();
      await identite(sansFiche);
      expect((await db.query("select public.artisan_exclusion_plateforme() e")).rows[0].e).toBeNull();
    });

    it("le message de la base est celui que l'écran affiche (une seule rédaction)", () => {
      expect(MESSAGE_ECRITURE_FERMEE.refuse).toMatch(/inscription a été refusée/);
      expect(MESSAGE_ECRITURE_FERMEE.liste_noire).toMatch(/retiré du réseau/);
      for (const m of Object.values(MESSAGE_ECRITURE_FERMEE)) expect(m).toMatch(/consultables/);
    });
  });
});
