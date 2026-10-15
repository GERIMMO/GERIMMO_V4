/**
 * Invitation d'un artisan par un propriétaire direct (décision du dirigeant du 15/10/2026, migration 20261014840000).
 *
 * « L'artisan doit pouvoir être invité par un propriétaire, ce sera à l'artisan de s'inscrire. » Le propriétaire invite par
 * l'adresse e-mail ; l'artisan crée son compte, inscrit son entreprise, dépose ses attestations ; Gerimmo le valide ; une
 * fois l'invitation ACCEPTÉE, il est dans le carnet du propriétaire et peut être sollicité même si la commune du bien est
 * fermée au réseau (règle du carnet personnel existante, zone de l'artisan toujours exigée).
 *
 * Chaque cas agit avec les droits réels du profil (rôle `authenticated`, jeton simulé), dans une transaction annulée.
 * Le rejeu et le retour arrière de la migration sont dans invitation-artisan-migration-rejeu.test.ts (DDL : en série).
 */
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

config({ path: ".env.local", quiet: true });
const DB = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB);

const SIGNATURES = [
  "public.preparer_invitation_artisan(uuid,text,text,public.artisan_metier)",
  "public.renvoyer_invitation_artisan(uuid)",
  "public.annuler_invitation_artisan(uuid)",
  "public.noter_envoi_invitation_artisan(uuid,boolean)",
  "public.carnet_artisans_proprietaire(uuid)",
  "public.mon_invitation_artisan(uuid)",
  "public.repondre_invitation_artisan(uuid,boolean)",
  "public.invitations_des_artisans_a_valider()",
];
const MESSAGE_BLOQUEE = "Cette invitation ne peut pas aboutir. Contactez la personne qui vous a invité.";

describe.skipIf(!DB)("Invitation d'un artisan par un propriétaire direct", () => {
  let db: Client;
  let org: string, autreOrg: string, agence: string;
  let proprietaire: string, autreProprietaire: string, adminAgence: string, agent: string, locataire: string;
  let artisanCompte: string, sansOrganisation: string, superviseur: string;
  let invite: string, emailInvite: string;
  let bienParis: string, incidentParis: string;

  const id = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].id as string;
  const compte = async (email: string) =>
    id(
      `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
       values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',$1,'x',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','') returning id`,
      [email]
    );
  const unique = () => Math.random().toString(36).slice(2, 10);
  const devenir = async (qui: string) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [qui]);
    await db.query("set local role authenticated");
  };
  const postgres = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims','',true)");
  };
  const echec = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      await db.query(sql, params);
      await db.query("release savepoint essai");
      return "";
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await db.query("release savepoint essai");
      return (e as Error).message;
    }
  };
  const inviter = async (email = emailInvite, qui = proprietaire, organisation = org) => {
    await devenir(qui);
    return (await db.query("select public.preparer_invitation_artisan($1,$2,'Dupont plomberie','plomberie') r", [organisation, email])).rows[0].r as {
      id: string; email: string; organisation: string; expire_le: string;
    };
  };
  const repondre = async (invitation: string, accepter = true, qui = invite) => {
    await devenir(qui);
    return (await db.query("select public.repondre_invitation_artisan($1,$2) r", [invitation, accepter])).rows[0].r as {
      etat: string; erreur?: string; inscription_requise?: boolean;
    };
  };
  const inscrire = async (qui = invite, siret = String(Date.now()).slice(-8).padStart(14, "7"), cp = "75011") => {
    await devenir(qui);
    return id(
      "select public.inscrire_mon_entreprise_artisan('Plomberie Invitée',$1,'0611223344',null,array['plomberie']::public.artisan_metier[],array[$2]::text[]) id",
      [siret, cp]
    );
  };
  const carnet = async (qui = proprietaire) => {
    await devenir(qui);
    return (await db.query("select * from public.carnet_artisans_proprietaire($1)", [org])).rows;
  };
  const relation = async (artisan: string) => {
    await postgres();
    return (await db.query("select statut, created_by, blacklist_le from public.artisan_agences where organization_id=$1 and artisan_id=$2", [org, artisan])).rows;
  };
  const journal = async (action: string) => {
    await postgres();
    return (await db.query("select details from public.audit_log where organization_id=$1 and action=$2", [org, action])).rows;
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB });
    await db.connect();
    await db.query("begin");
    org = await id("insert into public.organizations(name,type,status) values('Parc de Claire Testeuse','proprietaire_direct','active') returning id");
    autreOrg = await id("insert into public.organizations(name,type,status) values('Parc d’un autre propriétaire','proprietaire_direct','active') returning id");
    agence = await id("insert into public.organizations(name,type,status) values('Agence voisine','agence','active') returning id");
    const s = unique();
    [proprietaire, autreProprietaire, adminAgence, agent, locataire, artisanCompte, sansOrganisation, superviseur] = [
      await compte(`proprio-${s}@test.local`), await compte(`autre-proprio-${s}@test.local`), await compte(`admin-${s}@test.local`),
      await compte(`agent-${s}@test.local`), await compte(`locataire-${s}@test.local`), await compte(`artisan-${s}@test.local`),
      await compte(`sans-org-${s}@test.local`), await compte(`sa-${s}@test.local`),
    ];
    await db.query(
      `insert into public.memberships(account_id,organization_id,role) values
        ($1,$2,'proprietaire_direct'),($3,$4,'proprietaire_direct'),($5,$6,'admin_agence'),($7,$6,'agent'),($8,$2,'locataire'),($9,null,'super_admin')`,
      [proprietaire, org, autreProprietaire, autreOrg, adminAgence, agence, agent, locataire, superviseur]
    );
    await db.query(
      "insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat) values($1,'Artisan déjà inscrit',$2,'0600000000','valide','verifie')",
      [artisanCompte, `9${String(Date.now()).slice(-13)}`]
    );
    // Un bien à Paris (commune confirmée, réseau FERMÉ par défaut) et un incident qualifié, pour le parcours complet.
    bienParis = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Bien à Paris','appartement','1 rue du Test','75011','Paris') returning id", [org]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'Lot','loue') returning id", [org, bienParis]);
    const personne = await id("insert into public.persons(organization_id,nom) values($1,'Locataire du bien') returning id", [org]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-100,600,40) returning id", [org, lot, personne]);
    incidentParis = await id(
      "insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,'INV-'||substr(gen_random_uuid()::text,1,8),$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite','qualifie','proprietaire','Usure') returning id",
      [org, lot, bail, personne]
    );
    await devenir(proprietaire);
    await db.query("select public.reseau_confirmer_commune($1,$2,'75056')", [org, bienParis]);
    await postgres();
  });
  beforeEach(async () => {
    await postgres();
    await db.query("savepoint cas");
    emailInvite = `artisan-invite-${unique()}@test.local`;
    invite = await compte(emailInvite);
  });
  afterEach(async () => {
    await db.query("rollback to savepoint cas");
    await db.query("release savepoint cas");
  });
  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  describe("droits", () => {
    it("le propriétaire direct invite ; l'adresse est normalisée en minuscules et l'organisation nommée", async () => {
      const r = await inviter(`  ${emailInvite.toUpperCase()} `);
      expect(r).toMatchObject({ email: emailInvite, organisation: "Parc de Claire Testeuse" });
      await postgres();
      const ligne = (await db.query("select etat, cree_par, nom_memo, metier_memo, expire_le - cree_le as duree from public.invitations_artisans where id=$1", [r.id])).rows[0];
      expect(ligne).toMatchObject({ etat: "en_attente", cree_par: proprietaire, nom_memo: "Dupont plomberie", metier_memo: "plomberie" });
      expect(ligne.duree.days).toBe(30);
      expect(await journal("invitation_artisan")).toHaveLength(1);
      expect(JSON.stringify(await journal("invitation_artisan"))).not.toContain(emailInvite);
    });

    it.each(["autreProprietaire", "adminAgence", "agent", "locataire", "artisanCompte", "sansOrganisation", "superviseur"])(
      "%s ne peut pas inviter pour ce propriétaire",
      async (profil) => {
        const qui = { autreProprietaire, adminAgence, agent, locataire, artisanCompte, sansOrganisation, superviseur }[profil]!;
        await devenir(qui);
        expect(await echec("select public.preparer_invitation_artisan($1,$2)", [org, emailInvite])).toMatch(/Accès refusé/);
      }
    );

    it("une agence ne peut pas inviter pour elle-même (elle a son ajout par SIRET)", async () => {
      await devenir(adminAgence);
      expect(await echec("select public.preparer_invitation_artisan($1,$2)", [agence, emailInvite])).toMatch(/Accès refusé/);
    });

    it("anonyme : aucune des fonctions n'est exécutable, ni la table lisible", async () => {
      await postgres();
      for (const signature of SIGNATURES) {
        const { rows } = await db.query("select has_function_privilege('anon',$1::regprocedure,'execute') a, has_function_privilege('authenticated',$1::regprocedure,'execute') c", [signature]);
        expect(rows[0], signature).toEqual({ a: false, c: true });
      }
      const interne = (await db.query("select has_function_privilege('authenticated','public.invitation_artisan_par_proprietaire(uuid)','execute') c")).rows[0].c;
      expect(interne).toBe(false);
      await db.query("set local role anon");
      expect(await echec("select public.preparer_invitation_artisan($1,$2)", [org, emailInvite])).toMatch(/permission denied/);
      await postgres();
      await devenir(proprietaire);
      expect(await echec("select * from public.invitations_artisans")).toMatch(/permission denied/);
    });

    it("étanchéité : un autre propriétaire, une agence, un locataire ou un artisan ne renvoient, n'annulent, ne notent ni ne lisent", async () => {
      const r = await inviter();
      for (const qui of [autreProprietaire, adminAgence, locataire, artisanCompte, invite]) {
        await devenir(qui);
        expect(await echec("select public.renvoyer_invitation_artisan($1)", [r.id])).toMatch(/Accès refusé/);
        expect(await echec("select public.annuler_invitation_artisan($1)", [r.id])).toMatch(/Accès refusé/);
        expect(await echec("select public.noter_envoi_invitation_artisan($1,true)", [r.id])).toMatch(/Accès refusé/);
        expect(await echec("select * from public.carnet_artisans_proprietaire($1)", [org])).toMatch(/Accès refusé/);
      }
      await devenir(autreProprietaire);
      expect(await db.query("select * from public.carnet_artisans_proprietaire($1)", [autreOrg]).then((x) => x.rows)).toEqual([]);
      await devenir(adminAgence);
      expect(await echec("select * from public.carnet_artisans_proprietaire($1)", [agence])).toMatch(/Accès refusé/);
      await postgres();
      expect((await db.query("select etat, envoye_le from public.invitations_artisans where id=$1", [r.id])).rows).toEqual([{ etat: "en_attente", envoye_le: null }]);
    });

    it("seul le super administrateur lit d'où vient un artisan à valider", async () => {
      for (const qui of [proprietaire, adminAgence, artisanCompte]) {
        await devenir(qui);
        expect(await echec("select * from public.invitations_des_artisans_a_valider()")).toMatch(/Accès refusé/);
      }
    });
  });

  describe("cycle de l'invitation", () => {
    it("adresse invalide refusée, doublon en attente refusé, nouvelle invitation possible après annulation", async () => {
      await devenir(proprietaire);
      expect(await echec("select public.preparer_invitation_artisan($1,'pas-une-adresse')", [org])).toMatch(/adresse e-mail valide/);
      const r = await inviter();
      expect(await echec("select public.preparer_invitation_artisan($1,$2)", [org, emailInvite.toUpperCase()])).toMatch(/déjà en attente/);
      await postgres();
      expect((await db.query("select count(*)::int n from public.invitations_artisans where organization_id=$1 and email=$2", [org, emailInvite])).rows[0].n).toBe(1);
      await devenir(proprietaire);
      await db.query("select public.annuler_invitation_artisan($1)", [r.id]);
      await db.query("select public.annuler_invitation_artisan($1)", [r.id]); // rejouée : sans effet
      expect(await journal("invitation_artisan_annulee")).toHaveLength(1);
      expect((await inviter()).id).not.toBe(r.id);
      // Un autre propriétaire peut inviter la même adresse : une invitation en attente par organisation.
      expect((await inviter(emailInvite, autreProprietaire, autreOrg)).id).toBeTruthy();
    });

    it("l'envoi se note : parti, ou non parti", async () => {
      const r = await inviter();
      await devenir(proprietaire);
      await db.query("select public.noter_envoi_invitation_artisan($1,false)", [r.id]);
      await postgres();
      expect((await db.query("select envoye_le, erreur_envoi from public.invitations_artisans where id=$1", [r.id])).rows[0]).toEqual({ envoye_le: null, erreur_envoi: true });
      await devenir(proprietaire);
      await db.query("select public.noter_envoi_invitation_artisan($1,true)", [r.id]);
      await postgres();
      const ligne = (await db.query("select envoye_le, erreur_envoi from public.invitations_artisans where id=$1", [r.id])).rows[0];
      expect(ligne.erreur_envoi).toBe(false);
      expect(ligne.envoye_le).not.toBeNull();
    });

    it("limite anti-abus : trois envois par adresse et par heure", async () => {
      const r = await inviter();
      await devenir(proprietaire);
      expect((await db.query("select public.renvoyer_invitation_artisan($1) r", [r.id])).rows[0].r).toMatchObject({ id: r.id, email: emailInvite });
      await db.query("select public.renvoyer_invitation_artisan($1)", [r.id]);
      expect(await echec("select public.renvoyer_invitation_artisan($1)", [r.id])).toMatch(/Trop d’invitations envoyées à cette adresse/);
      // Même plafond pour un autre propriétaire : l'adresse ne devient pas la cible d'une rafale.
      await devenir(autreProprietaire);
      expect(await echec("select public.preparer_invitation_artisan($1,$2)", [autreOrg, emailInvite])).toMatch(/Trop d’invitations envoyées à cette adresse/);
      await postgres();
      expect((await db.query("select count(*)::int n from public.invitations_artisans where email=$1", [emailInvite])).rows[0].n).toBe(1);
    });

    it("limite anti-abus : trente invitations par organisation et par heure, budget commun avec les locataires", async () => {
      await devenir(proprietaire);
      for (let n = 0; n < 30; n++) await db.query("select public.preparer_invitation_artisan($1,$2)", [org, `rafale-${n}-${unique()}@test.local`]);
      expect(await echec("select public.preparer_invitation_artisan($1,$2)", [org, emailInvite])).toMatch(/Trop d’invitations envoyées par cette organisation/);
      await postgres();
      expect((await db.query("select count(*)::int n from public.invitations_artisans where organization_id=$1", [org])).rows[0].n).toBe(30);
      // La clé est celle des invitations de locataires (src/lib/lien-mot-de-passe.ts) : elle est épuisée pour elles aussi.
      expect((await db.query("select public.autoriser_lien_mot_de_passe_cle($1,30) ok", [`organisation:${org}`])).rows[0].ok).toBe(false);
    });

    it("seule la session dont l'adresse CONFIRMÉE est celle de l'invitation la voit et y répond", async () => {
      const r = await inviter();
      await devenir(invite);
      expect((await db.query("select * from public.mon_invitation_artisan($1)", [r.id])).rows).toEqual([
        expect.objectContaining({ id: r.id, organisation: "Parc de Claire Testeuse", etat: "en_attente", a_une_fiche: false }),
      ]);
      for (const qui of [artisanCompte, proprietaire, adminAgence]) {
        await devenir(qui);
        expect((await db.query("select * from public.mon_invitation_artisan($1)", [r.id])).rows).toEqual([]);
        expect(await echec("select public.repondre_invitation_artisan($1,true)", [r.id])).toMatch(/Invitation introuvable pour ce compte/);
        expect(await echec("select public.repondre_invitation_artisan($1,false)", [r.id])).toMatch(/Invitation introuvable pour ce compte/);
      }
      await postgres();
      await db.query("update auth.users set email_confirmed_at=null where id=$1", [invite]);
      await devenir(invite);
      expect((await db.query("select * from public.mon_invitation_artisan($1)", [r.id])).rows).toEqual([]);
      expect(await echec("select public.repondre_invitation_artisan($1,true)", [r.id])).toMatch(/Invitation introuvable pour ce compte/);
      await postgres();
      expect((await db.query("select etat from public.invitations_artisans where id=$1", [r.id])).rows[0].etat).toBe("en_attente");
    });

    it("refuser ne demande pas de fiche, se trace, et ne rattache rien", async () => {
      const r = await inviter();
      expect(await repondre(r.id, false)).toEqual({ etat: "refusee" });
      expect(await repondre(r.id, true)).toMatchObject({ etat: "refusee", erreur: expect.stringMatching(/plus valable/) });
      expect(await journal("invitation_artisan_refusee")).toHaveLength(1);
      await devenir(proprietaire);
      expect(await echec("select public.annuler_invitation_artisan($1)", [r.id])).toMatch(/déjà été refusée/);
      expect((await carnet()).map((l) => [l.email, l.etat_invitation, l.raison_sociale])).toEqual([[emailInvite, "refusee", null]]);
    });

    it("expirée : inutilisable pour l'artisan comme pour le renvoi, et une nouvelle invitation la remplace", async () => {
      const r = await inviter();
      await postgres();
      await db.query("update public.invitations_artisans set expire_le=now()-interval '1 second' where id=$1", [r.id]);
      await devenir(invite);
      expect((await db.query("select etat from public.mon_invitation_artisan($1)", [r.id])).rows[0].etat).toBe("expiree");
      expect((await carnet()).map((l) => l.etat_invitation)).toEqual(["expiree"]);
      await devenir(proprietaire);
      expect(await echec("select public.annuler_invitation_artisan($1)", [r.id])).toMatch(/expiré/);
      // Le renvoi la note « expirée » et le dit (l'écriture reste : ce n'est pas une erreur levée).
      expect((await db.query("select public.renvoyer_invitation_artisan($1) r", [r.id])).rows[0].r).toMatchObject({ etat: "expiree", erreur: expect.stringMatching(/expiré/) });
      expect(await echec("select public.renvoyer_invitation_artisan($1)", [r.id])).toMatch(/plus en attente/);
      await inscrire();
      expect(await repondre(r.id)).toMatchObject({ etat: "expiree", erreur: expect.stringMatching(/expiré/) });
      expect(await journal("invitation_artisan_expiree")).toHaveLength(1);
      const nouvelle = await inviter();
      expect(nouvelle.id).not.toBe(r.id);
      expect(await repondre(nouvelle.id)).toEqual({ etat: "acceptee" });
      await postgres();
      expect((await db.query("select etat from public.invitations_artisans where id=$1", [r.id])).rows[0].etat).toBe("expiree");
    });

    it("annulée : l'artisan ne peut plus l'accepter", async () => {
      const r = await inviter();
      await inscrire();
      await devenir(proprietaire);
      await db.query("select public.annuler_invitation_artisan($1)", [r.id]);
      expect(await repondre(r.id)).toMatchObject({ etat: "annulee", erreur: expect.any(String) });
      await devenir(invite);
      expect((await db.query("select etat from public.mon_invitation_artisan($1)", [r.id])).rows[0].etat).toBe("annulee");
      await devenir(proprietaire);
      expect(await echec("select public.renvoyer_invitation_artisan($1)", [r.id])).toMatch(/plus en attente/);
    });
  });

  describe("acceptation", () => {
    it("exige la fiche de l'entreprise ; puis rattache au carnet, une seule fois, sans adhésion", async () => {
      const r = await inviter();
      expect(await repondre(r.id)).toMatchObject({ etat: "en_attente", inscription_requise: true });
      const artisan = await inscrire();
      // Inscrit mais pas encore accepté : le propriétaire ne voit ni sa raison sociale ni son téléphone.
      expect((await carnet()).map((l) => [l.etat_invitation, l.raison_sociale, l.telephone])).toEqual([["en_attente", null, null]]);
      await devenir(proprietaire);
      expect((await db.query("select id from public.artisans where id=$1", [artisan])).rows).toEqual([]);
      await devenir(invite);
      expect((await db.query("select a_une_fiche from public.mon_invitation_artisan($1)", [r.id])).rows[0].a_une_fiche).toBe(true);

      expect(await repondre(r.id)).toEqual({ etat: "acceptee" });
      expect(await repondre(r.id)).toEqual({ etat: "acceptee" }); // rejouée
      expect(await repondre(r.id, false)).toEqual({ etat: "acceptee" }); // un refus après coup ne défait rien
      expect(await relation(artisan)).toEqual([{ statut: "actif", created_by: proprietaire, blacklist_le: null }]);
      const traces = await journal("invitation_artisan_acceptee");
      expect(traces).toHaveLength(1);
      expect(traces[0].details).toMatchObject({ invitation: r.id, artisan_id: artisan, relation: "creee" });
      expect((await db.query("select count(*)::int n from public.memberships where account_id=$1", [invite])).rows[0].n).toBe(0);
      await postgres();
      expect((await db.query("select statut_plateforme from public.artisans where id=$1", [artisan])).rows[0].statut_plateforme).toBe("en_attente");

      const lignes = await carnet();
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toMatchObject({
        invitation_id: r.id, etat_invitation: "acceptee", artisan_id: artisan, raison_sociale: "Plomberie Invitée",
        telephone: "0611223344", statut_plateforme: "en_attente", sollicitable_plateforme: false, relation_statut: "actif",
        liste_noire: false, metiers: ["plomberie"], codes_postaux: ["75011"],
      });
      await devenir(proprietaire);
      expect((await db.query("select id from public.artisans where id=$1", [artisan])).rows).toHaveLength(1);
      expect(await echec("select public.preparer_invitation_artisan($1,$2)", [org, emailInvite])).toMatch(/déjà accepté/);
      expect(await echec("select public.annuler_invitation_artisan($1)", [r.id])).toMatch(/déjà été acceptée/);
    });

    it("un artisan déjà inscrit et validé accepte explicitement : rien n'est rattaché sans son geste", async () => {
      const r = await inviter();
      const artisan = await inscrire();
      await postgres();
      await db.query("update public.artisans set statut_plateforme='valide', siret_etat='verifie' where id=$1", [artisan]);
      expect(await relation(artisan)).toEqual([]);
      expect(await repondre(r.id)).toEqual({ etat: "acceptee" });
      expect((await carnet())[0]).toMatchObject({ statut_plateforme: "valide", sollicitable_plateforme: true });
    });

    it("une relation désactivée (sans liste noire) est réactivée", async () => {
      const r = await inviter();
      const artisan = await inscrire();
      await postgres();
      await db.query("insert into public.artisan_agences(organization_id,artisan_id,statut,created_by) values($1,$2,'desactive',$3)", [org, artisan, proprietaire]);
      expect(await repondre(r.id)).toEqual({ etat: "acceptee" });
      expect(await relation(artisan)).toEqual([{ statut: "actif", created_by: proprietaire, blacklist_le: null }]);
      expect((await journal("invitation_artisan_acceptee"))[0].details.relation).toBe("reactivee");
    });

    it("liste noire LOCALE de cette organisation : jamais rattaché, refus neutre, tracé", async () => {
      const r = await inviter();
      const artisan = await inscrire();
      await postgres();
      await db.query("insert into public.artisan_agences(organization_id,artisan_id,statut,blacklist_le,blacklist_motif,blacklist_par) values($1,$2,'actif',now(),'Chantier abandonné',$3)", [org, artisan, proprietaire]);
      expect(await repondre(r.id)).toEqual({ etat: "en_attente", erreur: MESSAGE_BLOQUEE });
      const ligne = (await relation(artisan))[0];
      expect(ligne.blacklist_le).not.toBeNull();
      expect((await db.query("select etat, artisan_id from public.invitations_artisans where id=$1", [r.id])).rows[0]).toEqual({ etat: "en_attente", artisan_id: null });
      expect((await journal("invitation_artisan_bloquee"))[0].details.motif).toBe("liste_noire_locale");
    });

    it("liste noire GLOBALE de Gerimmo : jamais rattaché", async () => {
      const r = await inviter();
      const artisan = await inscrire();
      await postgres();
      await db.query("update public.artisans set blacklist_globale_le=now(), blacklist_globale_motif='Fraude constatée' where id=$1", [artisan]);
      expect(await repondre(r.id)).toEqual({ etat: "en_attente", erreur: MESSAGE_BLOQUEE });
      expect(await relation(artisan)).toEqual([]);
      expect((await journal("invitation_artisan_bloquee"))[0].details.motif).toBe("liste_noire_globale");
    });

    it("la supervision voit « invité par » avant comme après l'acceptation, tant que l'artisan attend sa validation", async () => {
      const r = await inviter();
      const artisan = await inscrire();
      await devenir(superviseur);
      const avant = (await db.query("select * from public.invitations_des_artisans_a_valider() where artisan_id=$1", [artisan])).rows;
      expect(avant).toEqual([{ artisan_id: artisan, organisation: "Parc de Claire Testeuse", acceptee: false }]);
      await repondre(r.id);
      await devenir(superviseur);
      expect((await db.query("select * from public.invitations_des_artisans_a_valider() where artisan_id=$1", [artisan])).rows).toEqual([
        { artisan_id: artisan, organisation: "Parc de Claire Testeuse", acceptee: true },
      ]);
    });
  });

  it("parcours complet : invité, inscrit, attestations déposées, PAS sollicitable avant validation, validé par Gerimmo, sollicité en commune fermée", async () => {
    const r = await inviter();
    const artisan = await inscrire();
    for (const type of ["rc_pro", "decennale"]) {
      await db.query(
        "select public.deposer_ma_piece_artisan($1::public.artisan_piece_type,$2,'application/pdf',2048,$3,current_date-10,current_date+300)",
        [type, `artisans/${artisan}/${type}.pdf`, `empreinte-${type}-${artisan}`]
      );
    }
    expect(await repondre(r.id)).toEqual({ etat: "acceptee" });

    // Avant la validation de Gerimmo : le carnet ne le propose pas, et une sollicitation directe est refusée.
    await devenir(proprietaire);
    const avant = (await db.query("select * from public.reseau_disponibilite($1,$2,'plomberie','entretien_courant')", [org, bienParis])).rows[0];
    expect(avant.etat).toBe("fermee");
    expect(Number(avant.nb_contacts)).toBe(0);
    expect(await echec("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30)", [org, incidentParis])).toMatch(
      /pas encore disponible pour ce métier dans cette zone/
    );
    await postgres();
    expect((await db.query("select public.artisan_affectable($1,$2,'plomberie','entretien_courant','75011') ok", [artisan, org])).rows[0].ok).toBe(false);

    // Gerimmo valide (SIRET vérifié, justificatifs relus) : jamais automatiquement.
    await devenir(superviseur);
    await db.query("select public.traiter_inscription_artisan_atomique($1,'verifier_siret',null,true,false)", [artisan]);
    await db.query("select public.traiter_inscription_artisan_atomique($1,'validation',null,false,true)", [artisan]);

    await devenir(proprietaire);
    const apres = (await db.query("select * from public.reseau_disponibilite($1,$2,'plomberie','entretien_courant')", [org, bienParis])).rows[0];
    expect(apres.etat).toBe("fermee");
    expect(Number(apres.nb_contacts)).toBe(1);
    const consultation = await id("select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) id", [org, incidentParis]);
    const sollicitation = await id("select public.solliciter_artisan($1,$2,$3) id", [org, consultation, artisan]);
    expect((await db.query("select origine_reseau, commune_reseau from public.incident_sollicitations where id=$1", [sollicitation])).rows[0]).toEqual({
      origine_reseau: "carnet",
      commune_reseau: null,
    });
    await devenir(invite);
    expect((await db.query("select sollicitation_id from public.mes_sollicitations()")).rows.map((l) => l.sollicitation_id)).toContain(sollicitation);
  });

  it("la zone de l'artisan reste exigée : un bien hors de ses codes postaux ne le propose pas", async () => {
    const r = await inviter();
    const artisan = await inscrire(invite, undefined, "69003");
    await postgres();
    await db.query("update public.artisans set statut_plateforme='valide', siret_etat='verifie' where id=$1", [artisan]);
    expect(await repondre(r.id)).toEqual({ etat: "acceptee" });
    await devenir(proprietaire);
    const d = (await db.query("select * from public.reseau_disponibilite($1,$2,'plomberie','entretien_courant')", [org, bienParis])).rows[0];
    expect(Number(d.nb_contacts)).toBe(0);
  });
});
