/**
 * Décision D18 du 14/10/2026 (option A en deux livraisons ; celle-ci est la première, l'option B seule), fiches
 * ART-13 et PRO2-12 : le gérant ou le propriétaire REFUSE un devis reçu avec un motif transmis à l'artisan
 * (réponse A.15-4) ; le refus libère la place dans le plafond de deux artisans (réponse A.15-5).
 *
 * Appels réels sous RLS, scénarios indépendants (point de reprise par cas), transaction finale annulée.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const CLE_1 = "11111111-1111-4111-8111-111111111111";
const CLE_2 = "22222222-2222-4222-8222-222222222222";
const MOTIF = "Le montant dépasse le budget prévu pour cette réparation.";

describe.skipIf(!DB_URL)("Refus motivé d'un devis (D18, livraison 1)", () => {
  let db: Client;
  let org = "", autreOrg = "";
  let gerant = "", autreGerant = "", agent = "", cptArtisan = "", cptArtisan2 = "", cptArtisan3 = "", cptLoc = "";
  let artisan = "", artisan2 = "", artisan3 = "";
  let incident = "";

  const connecte = (id: string) =>
    db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated','aal','aal2')::text, true)`,
      [id]
    );
  const role = (r: string) => db.query(r === "reset" ? "reset role" : `set local role ${r}`);
  const agir = async (compte: string) => {
    await role("reset");
    await connecte(compte);
    await role("authenticated");
  };
  const enTantQuePostgres = () => role("reset");
  const essai = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint essai");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint essai");
      return r;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      throw e;
    }
  };

  async function nouveauCompte(prefixe: string): Promise<string> {
    const { rows } = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new,
         email_change_token_current)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
         'authenticated', $1 || '-' || gen_random_uuid() || '@test.local', 'x', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
         '','','','','')
       returning id`,
      [prefixe]
    );
    return rows[0].id as string;
  }

  async function nouvelArtisan(compte: string, nom: string, siret: string): Promise<string> {
    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email,
         statut_plateforme, siret_etat, visibilite, account_id)
       values ($1,$2,'0611111111',$3,'valide','verifie','publique',$4) returning id`,
      [nom, siret, `${siret}@test.local`, compte]
    );
    await db.query(`insert into public.artisan_agences(organization_id,artisan_id) values($1,$2)`, [org, a.id]);
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [a.id]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [a.id]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,$3, current_date + 300)`,
      [a.id, `artisans/${a.id}/decennale.pdf`, `emp-dec-${siret}`]
    );
    return a.id as string;
  }

  /** Une consultation ouverte avec les deux premiers artisans sollicités (plafond atteint). */
  async function consulter() {
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',false,30) as id`,
      [org, incident]
    );
    const { rows: [{ id: s1 }] } = await db.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan]);
    const { rows: [{ id: s2 }] } = await db.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan2]);
    return { consultation: consultation as string, s1: s1 as string, s2: s2 as string };
  }

  const LIGNES = (centimes: number) =>
    `jsonb_build_array(jsonb_build_object('libelle','Travaux','quantite',1,'prix_unitaire_ht_cents',${centimes},'tva_bps',0))`;

  async function deposer(compte: string, sollicitation: string, centimes = 48000): Promise<string> {
    await agir(compte);
    const { rows: [{ id }] } = await db.query(
      `select public.deposer_devis_structure($1, ${LIGNES(centimes)}, 'Diagnostic de test', 'Remplacement du joint', 'Sous 7 jours', 'Une journée', null, null) as id`,
      [sollicitation]
    );
    return id as string;
  }

  async function refuser(compte: string, devis: string, motif: string | null = MOTIF, cle: string | null = CLE_1) {
    await agir(compte);
    const { rows: [{ nouvelle }] } = await essai(`select public.refuser_devis($1,$2,$3,$4) as nouvelle`, [org, devis, motif, cle]);
    return nouvelle as boolean;
  }

  const lireDevis = async (devis: string) => {
    await enTantQuePostgres();
    const { rows: [d] } = await db.query(`select * from public.incident_devis where id = $1`, [devis]);
    return d;
  };
  const lireSollicitation = async (s: string) => {
    await enTantQuePostgres();
    const { rows: [r] } = await db.query(`select * from public.incident_sollicitations where id = $1`, [s]);
    return r;
  };
  const evenements = async (type: string) => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select * from public.incident_evenements where incident_id = $1 and type = $2 order by created_at, id`,
      [incident, type]
    );
    return rows;
  };
  const alerte = async (devis: string) => {
    await enTantQuePostgres();
    const { rows: [a] } = await db.query(
      `select * from public.alerts where type = 'devis_a_decider' and organization_id = $1 and details->>'devis_id' = $2`,
      [org, devis]
    );
    return a;
  };

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status, essai_fin)
       values ('Refus de devis — Agence','essai', current_date + 30), ('Refus de devis — Autre agence','active', null) returning id, name`
    );
    org = orgs.find((o) => !o.name.includes("Autre")).id;
    autreOrg = orgs.find((o) => o.name.includes("Autre")).id;
    gerant = await nouveauCompte("gerant");
    autreGerant = await nouveauCompte("autre-gerant");
    agent = await nouveauCompte("agent");
    cptArtisan = await nouveauCompte("artisan");
    cptArtisan2 = await nouveauCompte("artisan2");
    cptArtisan3 = await nouveauCompte("artisan3");
    cptLoc = await nouveauCompte("loc");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,$2,'locataire'),($6,$2,'agent')`,
      [gerant, org, autreGerant, autreOrg, cptLoc, agent]
    );

    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`, [org]);
    const { rows: [lot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat) values ($1,$2,'Lot 1','loue') returning id`, [bien.id, org]);
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`, [org, cptLoc]);
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat, date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`, [org, lot.id, personne.id]);
    const { rows: [inc] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id, declarant_person_id, canal, categorie,
         description, etat, imputation, imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire','Joint usé par le temps')
       returning id, numero`, [org, lot.id, bail.id, personne.id]);
    incident = inc.id;

    artisan = await nouvelArtisan(cptArtisan, "Plomberie Durand", "12345678901234");
    artisan2 = await nouvelArtisan(cptArtisan2, "Plomberie Martin", "22345678901234");
    artisan3 = await nouvelArtisan(cptArtisan3, "Plomberie Petit", "32345678901234");
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  beforeEach(async () => {
    await enTantQuePostgres();
    await db.query("savepoint scenario");
  });
  afterEach(async () => {
    await db.query("rollback to savepoint scenario");
  });

  it("refuse un devis déposé : état, décision, motif, événement tracé, alerte fermée, mise en concurrence toujours ouverte", async () => {
    const { consultation, s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    expect(await refuser(gerant, devis)).toBe(true);

    const d = await lireDevis(devis);
    expect(d.statut).toBe("refuse");
    expect(d.decision).toBe("refus");
    expect(d.decide_par).toBe(gerant);
    expect(d.decide_le).not.toBeNull();
    expect(d.decision_motif).toBe(MOTIF);
    expect(d.decision_cle).toBe(CLE_1);
    expect((await lireSollicitation(s1)).statut).toBe("refusee");

    const [e] = await evenements("devis_refuse");
    expect(e).toBeDefined();
    expect(e.acteur_account_id).toBe(gerant);
    expect(e.details.devis_id).toBe(devis);
    expect(e.details.motif).toBe(MOTIF);
    expect(e.details.montant_ttc_cents).toBe(48000);

    const a = await alerte(devis);
    expect(a.statut).toBe("fermee");
    expect(a.closed_action).toBe("Devis refusé");
    expect(a.closed_by).toBe(gerant);

    const { rows: [c] } = await db.query(`select statut from public.incident_consultations where id = $1`, [consultation]);
    expect(c.statut).toBe("ouverte");
  });

  it("exige un motif de dix caractères au moins, et une clé d'envoi", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await expect(refuser(gerant, devis, "Trop cher")).rejects.toThrow(/dix caractères au moins/);
    await expect(refuser(gerant, devis, null)).rejects.toThrow(/dix caractères au moins/);
    await expect(refuser(gerant, devis, "   ")).rejects.toThrow(/dix caractères au moins/);
    await expect(refuser(gerant, devis, MOTIF, null)).rejects.toThrow(/référence de cet envoi/);
    expect((await lireDevis(devis)).statut).toBe("depose");
    expect(await evenements("devis_refuse")).toHaveLength(0);
  });

  it("rejoue le même envoi sans rien refaire ; une autre décision sur un devis refusé est refusée clairement", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    expect(await refuser(gerant, devis)).toBe(true);
    expect(await refuser(gerant, devis, "Un autre motif tapé au second envoi", CLE_1)).toBe(false);
    expect(await evenements("devis_refuse")).toHaveLength(1);
    expect((await lireDevis(devis)).decision_motif).toBe(MOTIF);
    await expect(refuser(gerant, devis, MOTIF, CLE_2)).rejects.toThrow(/déjà été refusé/);
    await agir(gerant);
    await expect(essai(`select public.retenir_devis($1,$2)`, [org, devis])).rejects.toThrow(/a été refusé : il ne peut plus être retenu/);
  });

  it("ne refuse ni un devis retenu, ni un devis écarté, ni un devis expiré, ni un devis annulé", async () => {
    const { s1, s2 } = await consulter();
    const d1 = await deposer(cptArtisan, s1, 48000);
    const d2 = await deposer(cptArtisan2, s2, 52000);
    await agir(gerant);
    await db.query(`select public.retenir_devis($1,$2)`, [org, d1]);
    await expect(refuser(gerant, d1)).rejects.toThrow(/déjà été retenu/);
    await expect(refuser(gerant, d2)).rejects.toThrow(/déjà écarté/);
    expect(await evenements("devis_refuse")).toHaveLength(0);
  });

  it("un devis dont la validité est dépassée (ou déjà « expiré ») ne se refuse pas : il est caduc", async () => {
    const { s1, s2 } = await consulter();
    const d1 = await deposer(cptArtisan, s1);
    const d2 = await deposer(cptArtisan2, s2);
    await enTantQuePostgres();
    await db.query(`update public.incident_devis set valide_jusqu_au = public.aujourdhui_paris() - 1 where id = $1`, [d1]);
    await db.query(`update public.incident_devis set statut = 'expire' where id = $1`, [d2]);
    await expect(refuser(gerant, d1)).rejects.toThrow(/a expiré le/);
    await expect(refuser(gerant, d2)).rejects.toThrow(/a expiré le/);
  });

  it("un dossier qui n'attend plus d'artisan (déjà affecté) ne reçoit plus de décision", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await enTantQuePostgres();
    await db.query(`update public.incidents set etat = 'affecte' where id = $1`, [incident]);
    await expect(refuser(gerant, devis)).rejects.toThrow(/plus en attente d'un artisan/);
  });

  it("un refus libère la place dans le plafond de deux artisans (réponse A.15-5)", async () => {
    const { consultation, s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await agir(gerant);
    await expect(essai(`select public.solliciter_artisan($1,$2,$3)`, [org, consultation, artisan3])).rejects.toThrow(/Deux artisans au maximum/);
    expect(await refuser(gerant, devis)).toBe(true);
    await agir(gerant);
    const { rows: [{ id: s3 }] } = await db.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan3]);
    expect(s3).toBeTruthy();
    await enTantQuePostgres();
    const { rows: [{ n }] } = await db.query(
      `select count(*)::int as n from public.incident_sollicitations where consultation_id = $1 and statut in ('envoyee','devis_depose','retenue')`,
      [consultation]
    );
    expect(n).toBe(2);
  });

  it("un autre gérant, le locataire, l'artisan lui-même et un agent hors portefeuille échouent en appel direct", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await expect(refuser(autreGerant, devis)).rejects.toThrow(/Accès refusé/);
    await expect(refuser(cptLoc, devis)).rejects.toThrow(/Accès refusé/);
    await expect(refuser(cptArtisan, devis)).rejects.toThrow(/Accès refusé/);
    await expect(refuser(agent, devis)).rejects.toThrow(/hors de votre portefeuille/);
    expect((await lireDevis(devis)).statut).toBe("depose");
  });

  it("l'artisan lit le motif du refus de SON devis ; l'autre artisan ne voit ni ce devis ni ce motif", async () => {
    const { s1, s2 } = await consulter();
    const d1 = await deposer(cptArtisan, s1);
    await deposer(cptArtisan2, s2);
    await refuser(gerant, d1);

    await agir(cptArtisan);
    const { rows: miennes } = await db.query(`select * from public.mes_sollicitations()`);
    expect(miennes).toHaveLength(1);
    expect(miennes[0].statut).toBe("refusee");
    expect(miennes[0].decision_motif).toBe(MOTIF);

    await agir(cptArtisan2);
    const { rows: autres } = await db.query(`select * from public.mes_sollicitations()`);
    expect(autres).toHaveLength(1);
    expect(autres[0].sollicitation_id).toBe(s2);
    expect(autres[0].statut).toBe("devis_depose");
    expect(autres[0].decision_motif).toBeNull();
    expect(JSON.stringify(autres)).not.toContain(MOTIF);
  });

  it("le suivi du locataire ne compte plus l'artisan refusé parmi ceux dont un devis est attendu", async () => {
    const { s1, s2 } = await consulter();
    const d1 = await deposer(cptArtisan, s1);
    await deposer(cptArtisan2, s2);
    await agir(cptLoc);
    const { rows: [avant] } = await db.query(`select * from public.mon_suivi_intervention($1) where incident_id = $2`, [org, incident]);
    expect(avant.nb_artisans_consultes).toBe(2);
    expect(avant.nb_devis_recus).toBe(2);
    await refuser(gerant, d1);
    await agir(cptLoc);
    const { rows: [apres] } = await db.query(`select * from public.mon_suivi_intervention($1) where incident_id = $2`, [org, incident]);
    expect(apres.nb_artisans_consultes).toBe(1);
    expect(apres.nb_devis_recus).toBe(1);
    expect(apres.etape).toBe("devis_recus");
  });

  it("une organisation dont l'abonnement est suspendu ne décide plus (message d'abonnement)", async () => {
    const { s1 } = await consulter();
    const devis = await deposer(cptArtisan, s1);
    await enTantQuePostgres();
    // L'essai se termine hier (le statut d'une organisation n'est modifiable que par le super-administrateur ou une tâche système).
    await db.query(`select public.tache_systeme()`);
    await db.query(`update public.organizations set essai_fin = current_date - 1 where id = $1`, [org]);
    await db.query(`select set_config('gerimmo.systeme', '', true)`);
    await expect(refuser(gerant, devis)).rejects.toThrow(/Abonnement suspendu/);
  });
});
