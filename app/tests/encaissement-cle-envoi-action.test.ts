/**
 * D04 (2) et D05, décisions du dirigeant du 14/10/2026 : les ACTIONS d'encaissement, jouées pour de vrai contre la base
 * locale (le faux client de `fixtures/supabase-sur-pg.ts` exécute leurs appels sur une connexion `pg` placée sous le
 * rôle `authenticated`, donc sous les politiques, les droits de colonne et les déclencheurs de la production).
 *
 *  D05 — clé d'envoi (PR178-B-06) : la même clé deux fois = une seule écriture, ni reçu ni quittance de plus, et l'écran
 *        dit « déjà enregistré » ; deux clés différentes = deux écritures ; deux envois simultanés de la même clé = une
 *        seule écriture. Vaut pour l'encaissement de loyer, le dépôt de garantie et l'écriture libre.
 *  D04 (2) — confirmation (VER-TS-02) : au-delà de 2 × (reste dû + un terme), l'encaissement de loyer n'est PAS écrit ;
 *        le serveur renvoie un état « confirmation requise » ; le formulaire se ressoumet avec le drapeau
 *        `confirmation_montant` qui porte le montant confirmé. Rejouer la requête sans le drapeau ne contourne rien.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Ce fichier tourne dans le groupe « serie » de vitest.config.ts (seul
 * sur la base) : ses essais de concurrence valident une fixture, visible sinon des autres fichiers.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { clientSurPg, typesCommePostgrest } from "./fixtures/supabase-sur-pg";
import { supprimerOrganisationDeTest } from "./fixtures/nettoyer-organisation";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const banc = vi.hoisted(() => ({ clients: [] as unknown[], suivant: 0, utilisateur: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => {
    const supabase = banc.clients[banc.suivant++ % banc.clients.length];
    return { supabase, user: { id: banc.utilisateur }, role: "proprietaire_direct" };
  },
}));

type Fixture = { org: string; bail: string; autreBail: string; user: string; appels: string[] };

async function creer(db: Client): Promise<Fixture> {
  const org = (await db.query("insert into public.organizations(name,type,status) values ('TEST action clé','proprietaire_direct','active') returning id")).rows[0].id;
  const user = randomUUID();
  await db.query(
    "insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values ($1,'authenticated','authenticated',$2,'x',now(),'{}','{}')",
    [user, `${user}@test.local`]
  );
  await db.query("insert into public.memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [user, org]);
  const bien = (await db.query("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST action','appartement','1 rue de Test','75001','Paris') returning id", [org])).rows[0].id;
  const loc = (await db.query("insert into public.persons(organization_id,nom,prenom) values($1,'TEST','Locataire') returning id", [org])).rows[0].id;
  const nouveauBail = async (nom: string, avecAppels: boolean) => {
    const lot = (await db.query("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,$3,'loue') returning id", [org, bien, nom])).rows[0].id;
    const bail = (await db.query("insert into public.baux(organization_id,lot_id,type,etat,loyer_hc,charges,depot_garantie,date_debut,jour_echeance,locataire_principal) values($1,$2,'nu','actif',780,60,780,'2026-01-01',5,$3) returning id", [org, lot, loc])).rows[0].id;
    const appels = avecAppels
      ? (await db.query("insert into public.appels_loyer(organization_id,bail_id,periode,date_echeance,loyer_hc,charges,montant_du) select $1,$2,d::date,(d+interval '4 days')::date,780,60,840 from generate_series('2026-01-01'::date,'2026-02-01'::date,interval '1 month') d returning id", [org, bail])).rows.map((r) => r.id as string)
      : [];
    return { bail: bail as string, appels };
  };
  const premier = await nouveauBail("TEST action 1", true);
  const second = await nouveauBail("TEST action 2", true);
  return { org, bail: premier.bail, autreBail: second.bail, user, appels: premier.appels };
}

async function agir(db: Client, user: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,false)", [user]);
  await db.query("set role authenticated");
}

function formulaire(champs: Record<string, string | null | undefined>): FormData {
  const f = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) if (valeur != null) f.set(cle, valeur);
  return f;
}

const MESSAGE_RECHARGER = /Rechargez la page/;

describe.skipIf(!url)("Actions d'encaissement — clé d'envoi (D05) et confirmation (D04)", () => {
  let db: Client;
  let f: Fixture;

  beforeAll(async () => {
    db = new Client({ connectionString: url, types: typesCommePostgrest });
    await db.connect();
  });
  beforeEach(async () => {
    await db.query("reset role");
    await db.query("begin");
    f = await creer(db);
    await agir(db, f.user);
    banc.utilisateur = f.user;
    banc.clients = [clientSurPg(db, { transactionnel: true })];
    banc.suivant = 0;
  });
  afterEach(async () => {
    await db.query("rollback");
    await db.query("reset role");
  });
  afterAll(async () => {
    await db?.end();
  });

  const compter = async (table: string, bail = f.bail) =>
    (await db.query(`select count(*)::int n from public.${table} where bail_id=$1`, [bail])).rows[0].n as number;
  const sommeEncaissee = async () =>
    (await db.query("select coalesce(sum(montant),0)::float s from public.encaissements where bail_id=$1", [f.bail])).rows[0].s as number;

  // ───────────────────────── Encaissement de loyer ─────────────────────────
  describe("encaissement de loyer", () => {
    const envoyer = async (champs: Record<string, string | null | undefined>, bail = f.bail) => {
      const { ajouterEncaissement } = await import("@/app/actions/loyers");
      return ajouterEncaissement(f.org, bail, {}, formulaire({ date_paiement: "2026-02-10", mode: "virement", ...champs }));
    };

    it("la même clé deux fois = une seule écriture ; le second envoi dit « déjà enregistré » et n'émet ni reçu ni quittance", async () => {
      const cle = randomUUID();
      const premier = await envoyer({ montant: "840", cle_envoi: cle });
      expect(premier.erreur).toBeUndefined();
      expect(premier.confirmation).toBeUndefined();
      expect(premier.dejaEnregistre).toBeUndefined();
      expect(premier.succes).toMatch(/soldé/);
      expect(await compter("encaissements")).toBe(1);
      const documents = await compter("quittances");
      expect(documents).toBe(1);

      const second = await envoyer({ montant: "840", cle_envoi: cle });
      expect(second.erreur).toBeUndefined();
      expect(second.dejaEnregistre).toBe(true);
      expect(second.succes).toMatch(/déjà enregistré/);
      expect(second.succes).toContain("840,00 €");
      expect(second.succes).toMatch(/pas été enregistré une seconde fois/);
      expect(await compter("encaissements")).toBe(1);
      expect(await compter("quittances")).toBe(documents);
      expect(await sommeEncaissee()).toBe(840);
    });

    it("le rejeu répété trois fois reste un seul encaissement", async () => {
      const cle = randomUUID();
      await envoyer({ montant: "2", cle_envoi: cle });
      for (let i = 0; i < 3; i++) expect((await envoyer({ montant: "2", cle_envoi: cle })).dejaEnregistre).toBe(true);
      expect(await compter("encaissements")).toBe(1);
    });

    it("deux clés différentes = deux encaissements", async () => {
      const a = await envoyer({ montant: "2", cle_envoi: randomUUID() });
      const b = await envoyer({ montant: "2", cle_envoi: randomUUID() });
      expect(a.dejaEnregistre).toBeUndefined();
      expect(b.dejaEnregistre).toBeUndefined();
      expect(await compter("encaissements")).toBe(2);
      expect(await sommeEncaissee()).toBe(4);
    });

    it("une clé absente ou illisible est refusée AVANT toute écriture, saisie rendue", async () => {
      for (const cle of [undefined, "", "pas-un-uuid"]) {
        const r = await envoyer({ montant: "2", cle_envoi: cle });
        expect(r.erreur).toMatch(MESSAGE_RECHARGER);
        expect(r.valeurs?.montant).toBe("2");
        expect(r.succes).toBeUndefined();
      }
      expect(await compter("encaissements")).toBe(0);
    });

    it("la clé d'un autre dossier est refusée : elle ne vaut ni « déjà enregistré » ni écriture", async () => {
      const cle = randomUUID();
      await envoyer({ montant: "2", cle_envoi: cle });
      const r = await envoyer({ montant: "2", cle_envoi: cle }, f.autreBail);
      expect(r.erreur).toMatch(/autre dossier/);
      expect(r.dejaEnregistre).toBeUndefined();
      expect(await compter("encaissements", f.autreBail)).toBe(0);
      expect(await compter("encaissements")).toBe(1);
    });

    it("rejouer la clé avec un autre montant n'écrit rien et dit ce qui est enregistré et ce qui ne l'est pas", async () => {
      const cle = randomUUID();
      await envoyer({ montant: "2", cle_envoi: cle });
      const r = await envoyer({ montant: "3", cle_envoi: cle });
      expect(r.dejaEnregistre).toBe(true);
      expect(r.succes).toContain("2,00 €");
      expect(r.succes).toContain("3,00 €");
      expect(r.succes).toMatch(/n'a pas été pris en compte/);
      expect(await sommeEncaissee()).toBe(2);
    });

    it("un refus de validation ne consomme pas la clé : la saisie corrigée s'enregistre avec la même clé", async () => {
      const cle = randomUUID();
      const refus = await envoyer({ montant: "12.345", cle_envoi: cle });
      expect(refus.erreur).toMatch(/centime près/);
      expect(await compter("encaissements")).toBe(0);
      const ok = await envoyer({ montant: "12.34", cle_envoi: cle });
      expect(ok.erreur).toBeUndefined();
      expect(ok.dejaEnregistre).toBeUndefined();
      expect(await compter("encaissements")).toBe(1);
    });

    it("l'écran peut lire « déjà enregistré » : le retour est un succès (la saisie est confirmée), pas une erreur", async () => {
      const cle = randomUUID();
      await envoyer({ montant: "2", cle_envoi: cle });
      const r = await envoyer({ montant: "2", cle_envoi: cle });
      expect(r.succes).toBeTruthy();
      expect(r.erreur).toBeUndefined();
    });

    // ─── D04 (2) : la confirmation, au centime ───
    describe("confirmation d'un montant très supérieur au dû (D04, option A : 2 × (reste dû + un terme))", () => {
      // Deux termes de 840 € impayés : reste dû 1 680 €, un terme 840 €, seuil 5 040 €.
      it("un encaissement normal ne demande aucune confirmation (un petit versement, un terme, le reste)", async () => {
        // Le seuil suit le reste dû : ces trois versements restent chacun sous le seuil du moment.
        for (const montant of ["2", "840", "800"]) {
          const r = await envoyer({ montant, cle_envoi: randomUUID() });
          expect(r.confirmation, montant).toBeUndefined();
          expect(r.erreur, montant).toBeUndefined();
          expect(r.succes, montant).toBeTruthy();
        }
      });

      it("juste en dessous du seuil (5 039,99 €) : enregistré sans confirmation", async () => {
        const r = await envoyer({ montant: "5039.99", cle_envoi: randomUUID() });
        expect(r.confirmation).toBeUndefined();
        expect(r.succes).toBeTruthy();
        expect(await sommeEncaissee()).toBe(5039.99);
      });

      it("AU seuil (5 040,00 €) : enregistré sans confirmation (la confirmation commence au-delà)", async () => {
        const r = await envoyer({ montant: "5040", cle_envoi: randomUUID() });
        expect(r.confirmation).toBeUndefined();
        expect(r.succes).toBeTruthy();
        expect(await sommeEncaissee()).toBe(5040);
      });

      it("juste au-dessus du seuil (5 040,01 €) : confirmation requise, RIEN n'est écrit, la saisie est rendue", async () => {
        const r = await envoyer({ montant: "5040.01", cle_envoi: randomUUID() });
        expect(r.succes).toBeUndefined();
        expect(r.erreur).toBeUndefined();
        expect(r.confirmation).toMatchObject({ montant: 5040.01, resteDu: 1680, terme: 840, seuil: 5040 });
        expect(r.confirmation?.message).toMatch(/Rien n'est encore enregistré/);
        expect(r.confirmation?.message).toContain("5 040,01 €");
        expect(r.valeurs).toMatchObject({ montant: "5040.01", date_paiement: "2026-02-10" });
        expect(await compter("encaissements")).toBe(0);
        expect(await compter("quittances")).toBe(0);
      });

      it("le cas du banc : « 840,00 » lu 84000 par un navigateur non francophone est signalé, avec le montant et le calcul", async () => {
        const r = await envoyer({ montant: "84000", cle_envoi: randomUUID() });
        expect(r.confirmation?.montant).toBe(84000);
        expect(r.confirmation?.message).toContain("84 000,00 €");
        expect(r.confirmation?.message).toContain("1 680,00 €");
        expect(r.confirmation?.message).toContain("840,00 €");
        expect(await compter("encaissements")).toBe(0);
      });

      it("le seuil suit le reste dû : une fois 840 € encaissés, il tombe à 2 × (840 + 840) = 3 360 €", async () => {
        await envoyer({ montant: "840", cle_envoi: randomUUID() });
        const auSeuil = await envoyer({ montant: "3360", cle_envoi: randomUUID() });
        expect(auSeuil.confirmation).toBeUndefined();
        expect(auSeuil.succes).toBeTruthy();
        // Tout est maintenant couvert (4 200 € pour deux termes de 840 €) : reste dû 0, un terme 840, seuil 1 680.
        const dessus = await envoyer({ montant: "1680.01", cle_envoi: randomUUID() });
        expect(dessus.confirmation).toMatchObject({ resteDu: 0, terme: 840, seuil: 1680 });
        const auSeuilSolde = await envoyer({ montant: "1680", cle_envoi: randomUUID() });
        expect(auSeuilSolde.confirmation).toBeUndefined();
      });

      it("CONTOURNEMENT impossible : rejouer la requête sans le drapeau redemande la confirmation, à chaque fois", async () => {
        const cle = randomUUID();
        for (let i = 0; i < 3; i++) {
          const r = await envoyer({ montant: "84000", cle_envoi: cle });
          expect(r.confirmation, `essai ${i + 1}`).toBeDefined();
          expect(r.succes, `essai ${i + 1}`).toBeUndefined();
        }
        expect(await compter("encaissements")).toBe(0);
      });

      it("CONTOURNEMENT impossible : un drapeau vide, illisible ou d'un autre montant ne confirme rien", async () => {
        const cle = randomUUID();
        for (const drapeau of ["", "1", "oui", "on", "true", "840.00", "84000.01", "840000", "abc"]) {
          const r = await envoyer({ montant: "84000", cle_envoi: cle, confirmation_montant: drapeau });
          expect(r.confirmation, `drapeau « ${drapeau} »`).toBeDefined();
          expect(r.succes, `drapeau « ${drapeau} »`).toBeUndefined();
        }
        expect(await compter("encaissements")).toBe(0);
      });

      it("CONTOURNEMENT impossible : une confirmation donnée pour un montant ne vaut pas pour un montant plus grand saisi ensuite", async () => {
        const r = await envoyer({ montant: "90000", cle_envoi: randomUUID(), confirmation_montant: "84000.00" });
        expect(r.confirmation?.montant).toBe(90000);
        expect(await compter("encaissements")).toBe(0);
      });

      it("avec le drapeau qui porte le montant saisi, l'encaissement est enregistré UNE fois, avec la même clé", async () => {
        const cle = randomUUID();
        const demande = await envoyer({ montant: "84000", cle_envoi: cle });
        expect(demande.confirmation).toBeDefined();
        expect(await compter("encaissements")).toBe(0);

        const confirme = await envoyer({ montant: "84000", cle_envoi: cle, confirmation_montant: "84000.00" });
        expect(confirme.confirmation).toBeUndefined();
        expect(confirme.erreur).toBeUndefined();
        expect(confirme.succes).toBeTruthy();
        expect(await compter("encaissements")).toBe(1);
        expect(await sommeEncaissee()).toBe(84000);

        // La réponse de la confirmation est perdue ; l'utilisateur revient sur « Encaisser » sans le drapeau :
        // c'est un rejeu de la même clé, pas une nouvelle demande de confirmation, et rien n'est doublé.
        const rejeu = await envoyer({ montant: "84000", cle_envoi: cle });
        expect(rejeu.confirmation).toBeUndefined();
        expect(rejeu.dejaEnregistre).toBe(true);
        expect(await compter("encaissements")).toBe(1);
      });

      it("le drapeau est lu comme un montant : « 84000,00 » (virgule) confirme aussi", async () => {
        const r = await envoyer({ montant: "84000,00", cle_envoi: randomUUID(), confirmation_montant: "84000,00" });
        expect(r.succes).toBeTruthy();
        expect(await sommeEncaissee()).toBe(84000);
      });

      it("un drapeau superflu sur un montant normal ne change rien", async () => {
        const r = await envoyer({ montant: "840", cle_envoi: randomUUID(), confirmation_montant: "840.00" });
        expect(r.confirmation).toBeUndefined();
        expect(r.succes).toBeTruthy();
      });

      it("la demande de confirmation ne consomme pas la clé : la clé servira à l'enregistrement confirmé", async () => {
        const cle = randomUUID();
        await envoyer({ montant: "6000", cle_envoi: cle });
        expect((await db.query("select count(*)::int n from public.encaissements where cle_envoi=$1", [cle])).rows[0].n).toBe(0);
        await envoyer({ montant: "6000", cle_envoi: cle, confirmation_montant: "6000.00" });
        expect((await db.query("select count(*)::int n from public.encaissements where cle_envoi=$1", [cle])).rows[0].n).toBe(1);
      });

      it("sans appel de loyer, le terme est celui du bail (780 + 60) : seuil 1 680 €", async () => {
        // Les appels se retirent en propriétaire de la base : le gérant n'a que des politiques de LECTURE sur cette table,
        // un `delete` joué sous son rôle ne retirerait rien et le test passerait par le chemin normal (deux termes de 840 €).
        await db.query("reset role");
        const retires = await db.query("delete from public.appels_loyer where bail_id=$1", [f.bail]);
        expect(retires.rowCount).toBe(2);
        await agir(db, f.user);
        // Le repli de l'action (loyer + charges du bail) n'est atteint que si l'état du bail ne rend aucun terme.
        expect((await db.query("select count(*)::int n from public.etat_loyers_bail($1)", [f.bail])).rows[0].n).toBe(0);
        const dessous = await envoyer({ montant: "1680", cle_envoi: randomUUID() });
        expect(dessous.confirmation).toBeUndefined();
        const dessus = await envoyer({ montant: "1680.01", cle_envoi: randomUUID() });
        expect(dessus.confirmation).toMatchObject({ resteDu: 0, terme: 840, seuil: 1680 });
      });
    });
  });

  // ───────────────────────── Dépôt de garantie ─────────────────────────
  describe("dépôt de garantie", () => {
    const envoyer = async (champs: Record<string, string | null | undefined>) => {
      const { encaisserDepot } = await import("@/app/actions/depot");
      return encaisserDepot(f.org, f.bail, {}, formulaire({ date: "2026-02-10", moyen: "virement", ...champs }));
    };
    const lignes = async () => (await db.query("select count(*)::int n from public.depot_encaissements where bail_id=$1", [f.bail])).rows[0].n as number;
    const ecrituresDepot = async () =>
      (await db.query("select count(*)::int n from public.ecritures where bail_id is not null and categorie='depot_garantie' and organization_id=$1", [f.org])).rows[0].n as number;

    it("la même clé deux fois = un seul encaissement de dépôt et une seule écriture ; l'écran dit « déjà enregistré »", async () => {
      const cle = randomUUID();
      const premier = await envoyer({ montant: "300", cle_envoi: cle });
      expect(premier.erreur).toBeUndefined();
      expect(premier.succes).toBe("Encaissement enregistré.");
      const second = await envoyer({ montant: "300", cle_envoi: cle });
      expect(second.erreur).toBeUndefined();
      expect(second.dejaEnregistre).toBe(true);
      expect(second.succes).toMatch(/déjà enregistré/);
      expect(await lignes()).toBe(1);
      expect(await ecrituresDepot()).toBe(1);
    });

    it("le rejeu d'un dépôt déjà soldé dit « déjà enregistré », pas « dépasse le dépôt dû »", async () => {
      const cle = randomUUID();
      await envoyer({ montant: "780", cle_envoi: cle });
      const second = await envoyer({ montant: "780", cle_envoi: cle });
      expect(second.dejaEnregistre).toBe(true);
      expect(second.erreur).toBeUndefined();
      expect(await lignes()).toBe(1);
    });

    it("deux clés différentes = deux encaissements ; le plafond du dépôt dû reste appliqué", async () => {
      expect((await envoyer({ montant: "300", cle_envoi: randomUUID() })).succes).toBeTruthy();
      expect((await envoyer({ montant: "300", cle_envoi: randomUUID() })).succes).toBeTruthy();
      const trop = await envoyer({ montant: "300", cle_envoi: randomUUID() });
      expect(trop.erreur).toMatch(/dépasse le dépôt dû restant/);
      expect(await lignes()).toBe(2);
    });

    it("une clé absente ou illisible est refusée avant toute écriture", async () => {
      for (const cle of [undefined, "", "xyz"]) expect((await envoyer({ montant: "300", cle_envoi: cle })).erreur).toMatch(MESSAGE_RECHARGER);
      expect(await lignes()).toBe(0);
    });

    it("un refus de la base ne consomme pas la clé", async () => {
      const cle = randomUUID();
      expect((await envoyer({ montant: "900", cle_envoi: cle })).erreur).toMatch(/dépasse le dépôt dû restant/);
      expect((await envoyer({ montant: "300", cle_envoi: cle })).succes).toBe("Encaissement enregistré.");
      expect(await lignes()).toBe(1);
    });
  });

  // ───────────────────────── Écriture libre ─────────────────────────
  describe("écriture libre", () => {
    const envoyer = async (champs: Record<string, string | null | undefined>) => {
      const { ajouterEcriture } = await import("@/app/actions/compta");
      return ajouterEcriture(f.org, {}, formulaire({ categorie: "Travaux", sens: "depense", libelle: "TEST", ...champs }));
    };
    const lignes = async () => (await db.query("select count(*)::int n from public.ecritures where organization_id=$1", [f.org])).rows[0].n as number;

    it("la même clé deux fois = une seule écriture ; l'écran dit « déjà enregistrée »", async () => {
      const cle = randomUUID();
      const premier = await envoyer({ montant: "12,50", cle_envoi: cle });
      expect(premier.erreur).toBeUndefined();
      expect(premier.succes).toBe("Écriture enregistrée.");
      const second = await envoyer({ montant: "12,50", cle_envoi: cle });
      expect(second.erreur).toBeUndefined();
      expect(second.dejaEnregistre).toBe(true);
      expect(second.succes).toMatch(/déjà enregistrée/);
      expect(second.succes).toContain("12,50 €");
      expect(await lignes()).toBe(1);
    });

    it("deux clés différentes = deux écritures", async () => {
      await envoyer({ montant: "12,50", cle_envoi: randomUUID() });
      await envoyer({ montant: "12,50", cle_envoi: randomUUID() });
      expect(await lignes()).toBe(2);
    });

    it("une saisie ventilée (taxe foncière et TEOM) écrit deux lignes une fois ; son rejeu n'en ajoute aucune", async () => {
      const cle = randomUUID();
      const saisie = { categorie: "Taxe foncière", montant: "1000", teom: "120", cle_envoi: cle };
      expect((await envoyer(saisie)).succes).toBe("Écriture enregistrée.");
      expect(await lignes()).toBe(2);
      expect((await envoyer(saisie)).dejaEnregistre).toBe(true);
      expect(await lignes()).toBe(2);
    });

    it("une clé absente ou illisible est refusée avant toute écriture", async () => {
      for (const cle of [undefined, "", "xyz"]) expect((await envoyer({ montant: "5", cle_envoi: cle })).erreur).toMatch(MESSAGE_RECHARGER);
      expect(await lignes()).toBe(0);
    });

    it("un refus de validation ne consomme pas la clé", async () => {
      const cle = randomUUID();
      expect((await envoyer({ montant: "abc", cle_envoi: cle })).erreur).toBeTruthy();
      expect((await envoyer({ montant: "5", cle_envoi: cle })).succes).toBe("Écriture enregistrée.");
      expect(await lignes()).toBe(1);
    });
  });
});

// ───────────────────────── Deux envois simultanés ─────────────────────────
describe.skipIf(!url)("Actions d'encaissement — deux envois simultanés de la même clé (concurrence)", () => {
  let admin: Client;
  let sessions: Client[];
  let f: Fixture;

  beforeAll(async () => {
    admin = new Client({ connectionString: url });
    await admin.connect();
    // Fixture explicitement fictive, validée : deux sessions ne se voient qu'après un commit.
    await admin.query("begin");
    f = await creer(admin);
    await admin.query("commit");
    sessions = [];
    for (let i = 0; i < 2; i++) {
      const s = new Client({ connectionString: url, types: typesCommePostgrest });
      await s.connect();
      await agir(s, f.user);
      sessions.push(s);
    }
    banc.utilisateur = f.user;
  });
  afterAll(async () => {
    // Les sessions de travail se ferment d'abord, puis la fixture validée est retirée de la base partagée.
    await Promise.all((sessions ?? []).map((s) => s.end()));
    await supprimerOrganisationDeTest(admin, f?.org, f ? [f.user] : []);
    await admin?.end();
  });
  beforeEach(() => {
    banc.clients = sessions.map((s) => clientSurPg(s, { transactionnel: false }));
    banc.suivant = 0;
  });

  const n = async (sql: string, args: unknown[]) => (await admin.query(sql, args)).rows[0].n as number;

  it("encaissement de loyer : deux envois en parallèle, une seule écriture, un seul reçu ; l'autre dit « déjà enregistré »", async () => {
    const { ajouterEncaissement } = await import("@/app/actions/loyers");
    const cle = randomUUID();
    const envoi = () => ajouterEncaissement(f.org, f.bail, {}, formulaire({ montant: "840", date_paiement: "2026-02-10", mode: "virement", cle_envoi: cle }));
    const [a, b] = await Promise.all([envoi(), envoi()]);
    expect([a.erreur, b.erreur]).toEqual([undefined, undefined]);
    expect([a, b].filter((r) => r.dejaEnregistre)).toHaveLength(1);
    expect([a, b].filter((r) => r.succes && !r.dejaEnregistre)).toHaveLength(1);
    expect(await n("select count(*)::int n from public.encaissements where bail_id=$1", [f.bail])).toBe(1);
    expect(await n("select count(*)::int n from public.quittances where bail_id=$1", [f.bail])).toBe(1);
  });

  it("dépôt de garantie : deux envois en parallèle, une seule écriture", async () => {
    const { encaisserDepot } = await import("@/app/actions/depot");
    const cle = randomUUID();
    const envoi = () => encaisserDepot(f.org, f.bail, {}, formulaire({ montant: "100", date: "2026-02-10", moyen: "virement", cle_envoi: cle }));
    const [a, b] = await Promise.all([envoi(), envoi()]);
    expect([a.erreur, b.erreur]).toEqual([undefined, undefined]);
    expect([a, b].filter((r) => r.dejaEnregistre)).toHaveLength(1);
    expect(await n("select count(*)::int n from public.depot_encaissements where bail_id=$1", [f.bail])).toBe(1);
    expect(await n("select count(*)::int n from public.ecritures where depot_encaissement_id in (select id from public.depot_encaissements where bail_id=$1)", [f.bail])).toBe(1);
  });

  it("écriture libre : deux envois en parallèle, une seule écriture", async () => {
    const { ajouterEcriture } = await import("@/app/actions/compta");
    const cle = randomUUID();
    const envoi = () => ajouterEcriture(f.org, {}, formulaire({ categorie: "Travaux", sens: "depense", montant: "33", cle_envoi: cle }));
    const [a, b] = await Promise.all([envoi(), envoi()]);
    expect([a.erreur, b.erreur]).toEqual([undefined, undefined]);
    expect([a, b].filter((r) => r.dejaEnregistre)).toHaveLength(1);
    expect(await n("select count(*)::int n from public.ecritures where organization_id=$1 and categorie='Travaux'", [f.org])).toBe(1);
  });

  it("encaissement de loyer : deux clés différentes en parallèle = deux écritures", async () => {
    const { ajouterEncaissement } = await import("@/app/actions/loyers");
    const envoi = () => ajouterEncaissement(f.org, f.autreBail, {}, formulaire({ montant: "5", date_paiement: "2026-02-10", mode: "virement", cle_envoi: randomUUID() }));
    const [a, b] = await Promise.all([envoi(), envoi()]);
    expect([a.erreur, b.erreur]).toEqual([undefined, undefined]);
    expect([a.dejaEnregistre, b.dejaEnregistre]).toEqual([undefined, undefined]);
    expect(await n("select count(*)::int n from public.encaissements where bail_id=$1", [f.autreBail])).toBe(2);
  });
});
