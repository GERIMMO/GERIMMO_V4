/**
 * Lot « avoir-facture-externe » — décision D24-C du dirigeant (14/10/2026, fiches ARC-07 et ARC-04).
 *
 * Une facture externe déposée avec une erreur s'annule par l'action MOTIVÉE « annuler_facture » de artisan_externe_ecrire :
 *  - elle émet un AVOIR NUMÉROTÉ du même montant (numérotation propre aux avoirs de l'artisan : continue, sans trou,
 *    unique, jamais réutilisée) ;
 *  - elle autorise ensuite une nouvelle facture sur le chantier ; le numéro de la facture annulée reste réservé ;
 *  - rien n'est supprimé : la facture annulée reste lisible avec son avoir, dans le registre et l'export ;
 *  - garde d'exclusion (D25-B) et rejeu sûr par clé d'envoi, comme les autres écritures de l'outil.
 *
 * Tout est joué dans une transaction annulée à la fin, sur la base locale jetable (SUPABASE_DB_URL). Le module
 * « clients externes » n'est activé que dans cette transaction.
 */
import { randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { MESSAGE_ECRITURE_FERMEE } from "@/lib/artisan-prive-exclusion";
import { MESSAGE_NUMERO_FACTURE_UTILISE } from "@/lib/artisan-prive-facture";
import {
  MESSAGE_FACTURE_A_RELIRE,
  MESSAGE_FACTURE_DEJA_ANNULEE,
  MESSAGE_MOTIF_ANNULATION,
  MESSAGE_REGLEMENT_FACTURE_ANNULEE,
  MESSAGE_REGLEMENTS_A_ANNULER,
} from "@/lib/artisan-prive-avoir";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const jour = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const validite = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const lignes = [{ libelle: "Réparation TEST", quantite: 2, prix_unitaire_ht_cents: 2500, tva_bps: 1000 }];
const MOTIF = "Erreur de numéro sur la pièce jointe";

describe.skipIf(!url)("Clients externes — annuler une facture par un avoir numéroté (D24-C)", () => {
  let db: Client, uid: string, autre: string, artisan: string, artisanB: string, pdf: string, photo: string, client: string, chantier: string;

  async function identite(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [id]);
    await db.query("set local role authenticated");
  }
  async function compte() {
    const id = randomUUID();
    await db.query("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values($1,$2,'x',now())", [id, `lot-avoir-${id}@example.invalid`]);
    return id;
  }
  async function fiche(id: string) {
    return (await db.query("insert into public.artisans(account_id,raison_sociale,siret,telephone) values($1,'TEST Artisan lot avoir',$2,'0600000000') returning id", [id, String(randomInt(10000000000000, 99999999999999))])).rows[0].id as string;
  }
  async function piece(mime: string, a = artisan, owner = uid) {
    return (await db.query("insert into public.artisan_pieces_privees(artisan_id,storage_path,nom,mime,taille,sha256,created_by) values($1,$2,'TEST',$3,100,$4,$5) returning id", [a, `${a}/${randomUUID()}.test`, mime, "a".repeat(64), owner])).rows[0].id as string;
  }
  async function revision(h = chantier) {
    await db.query("savepoint lecture");
    const rev = (await db.query("select revision from public.artisan_chantiers where id=$1", [h])).rows[0].revision as number;
    await db.query("release savepoint lecture");
    return rev;
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
  const deposer = (numero: string, h = chantier, piece_id = pdf, montant = 5500) => ecrire("facture", { numero, montant_ttc_cents: montant, piece_id, justification: montant === 5500 ? undefined : "Écart fictif expliqué au client" }, h);
  /** La facture EN VIGUEUR du chantier (lue sous postgres : la lecture n'est pas l'objet du test). */
  async function factureEnVigueur(h = chantier) {
    await db.query("savepoint lecture");
    const f = (await db.query("select * from public.artisan_factures_externes where chantier_id=$1 and annulee_le is null", [h])).rows[0];
    await db.query("release savepoint lecture");
    return f as { id: string; numero: string; montant_ttc_cents: string } | undefined;
  }
  async function annuler(motif = MOTIF, h = chantier, facture?: string, cle = randomUUID(), rev?: number) {
    const id = facture ?? (await factureEnVigueur(h))!.id;
    return ecrire("annuler_facture", { facture_id: id, motif }, h, rev, cle);
  }
  async function avoirs(a = artisan) {
    await db.query("savepoint lecture");
    const r = (await db.query("select v.*, f.numero facture_numero from public.artisan_avoirs_externes v join public.artisan_factures_externes f on f.id=v.facture_id where v.artisan_id=$1 order by v.rang", [a])).rows;
    await db.query("release savepoint lecture");
    return r;
  }
  async function compter() {
    await db.query("savepoint lecture");
    const r = (await db.query(
      `select (select count(*)::int from public.artisan_factures_externes) factures,
              (select count(*)::int from public.artisan_factures_externes where annulee_le is not null) annulees,
              (select count(*)::int from public.artisan_avoirs_externes) avoirs,
              (select count(*)::int from public.artisan_evenements_prives) evenements`
    )).rows[0];
    await db.query("release savepoint lecture");
    return r;
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
  async function reglement(facture: string, montant = 1000) {
    return (await db.query("select public.artisan_reglement_ecrire('reglement','externe',$1,$2,$3) id", [facture, { montant_cents: montant, date: jour, moyen: "virement", reference: "Versement fictif", piece_id: pdf }, randomUUID()])).rows[0].id as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url });
    await db.connect();
    await db.query("begin");
    await db.query("update public.artisan_modules_locaux set actif=true");
    uid = await compte(); autre = await compte();
    artisan = await fiche(uid); artisanB = await fiche(autre);
    await db.query("insert into public.artisan_profils_documents(artisan_id,adresse,mentions) values($1,'Adresse TEST','ENTREPRISE FICTIVE'),($2,'Adresse TEST B','ENTREPRISE FICTIVE B')", [artisan, artisanB]);
    pdf = await piece("application/pdf");
    photo = await piece("image/png");
  });
  beforeEach(async () => {
    await db.query("reset role");
    await db.query("savepoint cas");
    await identite(uid);
    client = await ecrire("client", { nom: "Client TEST", type: "particulier", adresse: "1 rue fictive", email: "client@example.invalid" }, undefined, 0);
    chantier = await chantierPretFacture();
    await deposer("ART-2026-0001");
  });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await db.query("reset role"); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  describe("annuler une facture émet un avoir numéroté et ne supprime rien", () => {
    it("motivée, l'annulation émet l'avoir AV-0001 du même montant, daté du jour de Paris, et garde la facture intacte", async () => {
      const avant = (await factureEnVigueur())!;
      const retour = await annuler();
      expect(retour).toBe(chantier);
      const [v] = await avoirs();
      expect(v).toMatchObject({ rang: 1, numero: "AV-0001", facture_id: avant.id, facture_numero: "ART-2026-0001", motif: MOTIF, auteur: uid });
      expect(Number(v.montant_ttc_cents)).toBe(5500);
      expect((v.jour as Date).toLocaleDateString("en-CA")).toBe(jour);
      // Rien n'est supprimé ni réécrit : la facture garde son numéro, son montant et sa pièce ; elle est seulement marquée annulée.
      await db.query("savepoint lecture");
      const apres = (await db.query("select * from public.artisan_factures_externes where id=$1", [avant.id])).rows[0];
      await db.query("release savepoint lecture");
      expect(apres).toMatchObject({ numero: avant.numero, montant_ttc_cents: avant.montant_ttc_cents, piece_id: pdf });
      expect(apres.annulee_le).toBeInstanceOf(Date);
      expect(await compter()).toMatchObject({ factures: 1, annulees: 1, avoirs: 1 });
    });

    it("le motif est obligatoire (10 caractères au moins) : sans lui, rien n'est écrit", async () => {
      const avant = await compter();
      for (const motif of ["", "   ", "court", "123456789", "  12345678  "]) {
        await expect(essai(() => annuler(motif)), JSON.stringify(motif)).rejects.toThrow(MESSAGE_MOTIF_ANNULATION);
      }
      await expect(essai(() => annuler("x".repeat(4001)))).rejects.toThrow(MESSAGE_MOTIF_ANNULATION);
      expect(await compter()).toEqual(avant);
      // Dix caractères suffisent, espaces de bord retirés.
      await annuler("  1234567890  ");
      expect((await avoirs())[0].motif).toBe("1234567890");
    });

    it("la numérotation est continue, propre à l'artisan, sur tous ses chantiers : AV-0001, AV-0002, AV-0003", async () => {
      await annuler();
      await deposer("ART-2026-0002");
      await annuler("Montant erroné sur la seconde facture");
      const second = await chantierPretFacture("Second chantier");
      await deposer("ART-2026-0010", second);
      await annuler("Mauvaise pièce jointe déposée", second);
      expect((await avoirs()).map((v) => [v.rang, v.numero, v.facture_numero])).toEqual([
        [1, "AV-0001", "ART-2026-0001"],
        [2, "AV-0002", "ART-2026-0002"],
        [3, "AV-0003", "ART-2026-0010"],
      ]);
    });

    it("chaque artisan a sa propre suite : le premier avoir de B est AV-0001, même après ceux de A", async () => {
      await annuler();
      await db.query("reset role");
      const pdfB = await piece("application/pdf", artisanB, autre);
      const photoB = await piece("image/png", artisanB, autre);
      await identite(autre);
      const clientB = await ecrire("client", { nom: "Client de B", type: "particulier", adresse: "8 rue fictive" }, undefined, 0);
      const hB = await chantierPretFacture("Chantier de B", { client: clientB, pdf: pdfB, photo: photoB });
      await deposer("ART-2026-0001", hB, pdfB);
      await annuler(MOTIF, hB);
      expect((await avoirs(artisanB)).map((v) => v.numero)).toEqual(["AV-0001"]);
      // Sous l'identité de B, ceux de A sont invisibles (RLS) ; on les relit sous celle de A.
      expect(await avoirs(artisan)).toEqual([]);
      await identite(uid);
      expect((await avoirs(artisan)).map((v) => v.numero)).toEqual(["AV-0001"]);
    });

    it("une facture déjà annulée ne s'annule pas deux fois (autre clé) : un seul avoir", async () => {
      const f = (await factureEnVigueur())!;
      await annuler();
      await expect(essai(() => annuler(MOTIF, chantier, f.id))).rejects.toThrow(MESSAGE_FACTURE_DEJA_ANNULEE);
      expect((await compter()).avoirs).toBe(1);
    });

    it("rejouée avec la même clé (réponse perdue), la demande rend le même résultat sans second avoir", async () => {
      const f = (await factureEnVigueur())!;
      const cle = randomUUID();
      const rev = await revision();
      expect(await annuler(MOTIF, chantier, f.id, cle, rev)).toBe(chantier);
      expect(await annuler(MOTIF, chantier, f.id, cle, rev)).toBe(chantier);
      expect((await compter()).avoirs).toBe(1);
      // La même clé pour une autre demande est refusée, comme partout dans l'outil.
      await expect(essai(() => annuler("Un autre motif pour la même clé", chantier, f.id, cle, rev))).rejects.toThrow(/Cette clé a déjà servi/);
    });

    it("une facture d'un autre chantier, ou inconnue, est refusée (on annule la facture du chantier ouvert)", async () => {
      const f = (await factureEnVigueur())!;
      const second = await chantierPretFacture("Second chantier");
      await expect(essai(() => annuler(MOTIF, second, f.id))).rejects.toThrow(MESSAGE_FACTURE_A_RELIRE);
      await expect(essai(() => annuler(MOTIF, chantier, randomUUID()))).rejects.toThrow(MESSAGE_FACTURE_A_RELIRE);
      await expect(essai(() => annuler(MOTIF, chantier, "pas-un-identifiant"))).rejects.toThrow(MESSAGE_FACTURE_A_RELIRE);
      expect((await compter()).avoirs).toBe(0);
    });

    it("un chantier qui a changé entre-temps (révision) est refusé : rechargez", async () => {
      const rev = await revision();
      await expect(essai(() => annuler(MOTIF, chantier, undefined, randomUUID(), rev - 1))).rejects.toThrow(/Le chantier a changé/);
    });

    it("un chantier sans facture, ou pas terminé, ne propose rien à annuler", async () => {
      const second = await chantierPretFacture("Second chantier");
      await expect(essai(() => annuler(MOTIF, second, randomUUID()))).rejects.toThrow(MESSAGE_FACTURE_A_RELIRE);
      const encours = await ecrire("chantier", { titre: "En cours", adresse: "A", description: "D" }, client, 0);
      await expect(essai(() => annuler(MOTIF, encours, randomUUID()))).rejects.toThrow(MESSAGE_FACTURE_A_RELIRE);
    });
  });

  describe("après l'annulation, une nouvelle facture est autorisée ; le numéro annulé reste réservé", () => {
    it("tant que la facture est en vigueur, une seconde facture sur le même chantier reste refusée", async () => {
      await expect(essai(() => deposer("ART-2026-0002"))).rejects.toThrow(/existe déjà/);
    });

    it("après l'avoir, une nouvelle facture (autre numéro) est acceptée et devient la facture en vigueur", async () => {
      await annuler();
      await deposer("ART-2026-0002", chantier, pdf, 6000);
      expect((await factureEnVigueur())!.numero).toBe("ART-2026-0002");
      expect(await compter()).toMatchObject({ factures: 2, annulees: 1, avoirs: 1 });
    });

    it("le numéro de la facture annulée n'est jamais réattribué, quelle que soit la casse, sur ce chantier comme ailleurs", async () => {
      await annuler();
      await expect(essai(() => deposer("ART-2026-0001"))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
      await expect(essai(() => deposer(" art-2026-0001 "))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
      const second = await chantierPretFacture("Second chantier");
      await expect(essai(() => deposer("ART-2026-0001", second))).rejects.toThrow(MESSAGE_NUMERO_FACTURE_UTILISE);
    });

    it("la nouvelle facture peut à son tour être annulée : avoir suivant, et une troisième facture", async () => {
      await annuler();
      await deposer("ART-2026-0002");
      await annuler("Deuxième erreur : mauvais montant");
      await deposer("ART-2026-0003");
      expect((await avoirs()).map((v) => v.numero)).toEqual(["AV-0001", "AV-0002"]);
      expect(await compter()).toMatchObject({ factures: 3, annulees: 2, avoirs: 2 });
    });

    it("l'index d'une seule facture EN VIGUEUR par chantier tient même sans la fonction (filet de sécurité)", async () => {
      const f = (await factureEnVigueur())!;
      await db.query("reset role");
      await expect(
        essai(() => db.query(
          "insert into public.artisan_factures_externes(artisan_id,chantier_id,devis_id,numero,montant_ttc_cents,piece_id) select artisan_id,chantier_id,devis_id,'ART-2026-0099',100,piece_id from public.artisan_factures_externes where id=$1",
          [f.id]
        ))
      ).rejects.toThrow(/artisan_factures_externes_chantier_en_vigueur_key/);
    });
  });

  describe("règlements déclarés : jamais sur une facture annulée", () => {
    it("une facture qui porte un règlement déclaré actif ne s'annule pas ; annulé, le règlement ne bloque plus", async () => {
      const f = (await factureEnVigueur())!;
      const r = await reglement(f.id);
      await expect(essai(() => annuler())).rejects.toThrow(MESSAGE_REGLEMENTS_A_ANNULER);
      expect((await compter()).avoirs).toBe(0);
      await db.query("select public.artisan_reglement_ecrire('annuler_reglement','externe',$1,$2,$3)", [f.id, { reglement_id: r, motif: "Déclaration erronée", piece_id: pdf }, randomUUID()]);
      await annuler();
      expect((await compter()).avoirs).toBe(1);
    });

    it("sur une facture annulée, un nouveau règlement est refusé ; sur la facture qui la remplace, il est accepté", async () => {
      const f = (await factureEnVigueur())!;
      await annuler();
      await expect(essai(() => reglement(f.id))).rejects.toThrow(MESSAGE_REGLEMENT_FACTURE_ANNULEE);
      await deposer("ART-2026-0002");
      const nouvelle = (await factureEnVigueur())!;
      expect(await reglement(nouvelle.id, 5500)).toBeTruthy();
    });
  });

  describe("gardes de l'outil : exclusion (D25-B), module désactivé, autre artisan", () => {
    it.each(["refuse", "liste_noire"] as const)("%s : l'annulation est refusée avec le message du cas, rien n'est écrit", async (cas) => {
      await statut(artisan, cas === "refuse" ? "refuse" : "valide", cas === "liste_noire");
      const avant = await compter();
      await expect(essai(() => annuler())).rejects.toThrow(MESSAGE_ECRITURE_FERMEE[cas]);
      expect(await compter()).toEqual(avant);
    });

    it("un artisan exclu entre-temps ne rejoue pas une annulation déjà enregistrée (la garde passe avant la clé)", async () => {
      const f = (await factureEnVigueur())!;
      const cle = randomUUID();
      const rev = await revision();
      await annuler(MOTIF, chantier, f.id, cle, rev);
      await statut(artisan, "refuse");
      await expect(essai(() => annuler(MOTIF, chantier, f.id, cle, rev))).rejects.toThrow(MESSAGE_ECRITURE_FERMEE.refuse);
    });

    it("« en attente » garde l'outil : l'annulation est acceptée", async () => {
      await statut(artisan, "en_attente");
      await annuler();
      expect((await compter()).avoirs).toBe(1);
    });

    it("module « clients externes » désactivé : l'annulation est refusée", async () => {
      await db.query("reset role");
      await db.query("update public.artisan_modules_locaux set actif=false where code='clients'");
      await identite(uid);
      await expect(essai(() => annuler())).rejects.toThrow(/saisie désactivée/);
      await db.query("reset role");
      await db.query("update public.artisan_modules_locaux set actif=true where code='clients'");
    });

    it("un autre artisan ne peut ni annuler la facture de A, ni lire ses avoirs", async () => {
      const f = (await factureEnVigueur())!;
      await annuler();
      await identite(autre);
      await expect(essai(() => ecrire("annuler_facture", { facture_id: f.id, motif: MOTIF }, chantier, 99))).rejects.toThrow(/Accès refusé/);
      expect((await db.query("select count(*)::int n from public.artisan_avoirs_externes")).rows[0].n).toBe(0);
      expect((await activite()).avoirs).toEqual([]);
    });
  });

  describe("lecture et export : la facture annulée et son avoir figurent tous deux", () => {
    it("mon_activite_artisan_privee rend la facture (marquée annulée) et l'avoir qui l'annule", async () => {
      const f = (await factureEnVigueur())!;
      expect((await activite()).avoirs).toEqual([]);
      await annuler();
      await deposer("ART-2026-0002");
      const a = await activite();
      const externes = a.factures.filter((x: { origine: string }) => x.origine === "externe");
      expect(externes.map((x: { numero: string }) => x.numero).sort()).toEqual(["ART-2026-0001", "ART-2026-0002"]);
      expect(externes.find((x: { id: string }) => x.id === f.id).annulee_le).toBeTruthy();
      expect(externes.find((x: { id: string }) => x.id !== f.id).annulee_le).toBeNull();
      expect(a.avoirs).toHaveLength(1);
      expect(a.avoirs[0]).toMatchObject({ numero: "AV-0001", rang: 1, facture_id: f.id, facture_numero: "ART-2026-0001", chantier_id: chantier, montant_ttc_cents: 5500, motif: MOTIF, jour });
      expect(a.evenements.some((e: { action: string; objet_id: string }) => e.action === "annuler_facture" && e.objet_id === chantier)).toBe(true);
    });

    it("un artisan exclu lit et exporte toujours ses avoirs", async () => {
      await annuler();
      await statut(artisan, "refuse", true);
      expect((await activite()).avoirs.map((v: { numero: string }) => v.numero)).toEqual(["AV-0001"]);
    });
  });

  describe("la base garantit la suite des avoirs : sans trou, jamais modifiée ni supprimée", () => {
    it("un avoir émis ne se modifie ni ne se supprime, même hors de la fonction", async () => {
      await annuler();
      await db.query("reset role");
      const message = /Un avoir émis ne se modifie ni ne se supprime/;
      await expect(essai(() => db.query("update public.artisan_avoirs_externes set motif='Motif réécrit après coup'"))).rejects.toThrow(message);
      await expect(essai(() => db.query("delete from public.artisan_avoirs_externes"))).rejects.toThrow(message);
      await expect(essai(() => db.query("truncate public.artisan_avoirs_externes"))).rejects.toThrow(message);
      expect((await compter()).avoirs).toBe(1);
    });

    it("un rang qui laisserait un trou, ou un montant différent de la facture, est refusé à l'insertion directe", async () => {
      await annuler();
      await deposer("ART-2026-0002");
      const f = (await factureEnVigueur())!;
      await db.query("reset role");
      const inserer = (rang: number, montant: number) => db.query(
        "insert into public.artisan_avoirs_externes(artisan_id,facture_id,rang,montant_ttc_cents,motif,jour,auteur) values($1,$2,$3,$4,$5,public.aujourdhui_paris(),$6)",
        [artisan, f.id, rang, montant, MOTIF, uid]
      );
      await expect(essai(() => inserer(3, 5500))).rejects.toThrow(/sans trou|numéro suivant/);
      await expect(essai(() => inserer(1, 5500))).rejects.toThrow(/numéro suivant|artisan_avoirs_externes_artisan_id_rang_key/);
      await expect(essai(() => inserer(2, 100))).rejects.toThrow(/montant est celui de la facture/);
    });

    it("droits : la table n'est que lisible (RLS) par les comptes connectés, invisible d'anon", async () => {
      await db.query("reset role");
      const { rows } = await db.query(`select
        has_table_privilege('anon','public.artisan_avoirs_externes','select') anon_lecture,
        has_table_privilege('authenticated','public.artisan_avoirs_externes','select') lecture,
        has_table_privilege('authenticated','public.artisan_avoirs_externes','insert') insertion,
        has_table_privilege('authenticated','public.artisan_avoirs_externes','update') modification,
        has_table_privilege('authenticated','public.artisan_avoirs_externes','delete') suppression,
        (select relrowsecurity from pg_class where oid='public.artisan_avoirs_externes'::regclass) rls`);
      expect(rows[0]).toEqual({ anon_lecture: false, lecture: true, insertion: false, modification: false, suppression: false, rls: true });
    });
  });
});
