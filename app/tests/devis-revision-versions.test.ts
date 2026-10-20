/**
 * Décision D18 du 14/10/2026, livraison 2 (le reste de l'option A), fiches ART-13 et PRO2-12 : le gérant ou le
 * propriétaire DEMANDE UNE RÉVISION d'un devis reçu ; l'artisan répond par une version 2 (puis 3, trois au plus :
 * réponse A.15-2) en disant ce qui change, sous sept jours au jour de Paris (réponse A.15-3), ou renonce ; l'historique
 * des versions reste lisible des deux côtés ; chaque version crée une alerte « à décider » ; l'échéance dépassée
 * expire la demande et alerte le gérant.
 *
 * Appels réels sous RLS, scénarios indépendants (point de reprise par cas), transaction finale annulée.
 */
import { randomUUID } from "node:crypto";
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

const CLE_1 = "aaaaaaaa-1111-4111-8111-111111111111";
const CLE_2 = "bbbbbbbb-2222-4222-8222-222222222222";
const CLE_3 = "cccccccc-3333-4333-8333-333333333333";
const MOTIF = "Merci de détailler la main-d'œuvre et de revoir le prix du joint.";
const NOTE = "Main-d'œuvre détaillée par heure, prix du joint ramené au tarif fournisseur.";

describe.skipIf(!DB_URL)("Révision de devis et versions (D18, livraison 2)", () => {
  let db: Client;
  let org = "", autreOrg = "";
  let gerant = "", autreGerant = "", agent = "", cptArtisan = "", cptArtisan2 = "", cptArtisan3 = "", cptLoc = "";
  let artisan = "", artisan2 = "", artisan3 = "";
  let incident = "", numeroIncident = "";

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
    const { rows: [{ id }] } = await essai(
      `select public.deposer_devis_structure($1, ${LIGNES(centimes)}, 'Diagnostic de test', 'Remplacement du joint', 'Sous 7 jours', 'Une journée', null, null) as id`,
      [sollicitation]
    );
    return id as string;
  }

  /** Le brouillon de l'artisan, tel que l'application le tient (statut, saisie) ; « ce qui change » y est lu par la base. */
  async function brouillon(sollicitation: string, artisanId: string, note: string | null, statut = "brouillon") {
    await enTantQuePostgres();
    const saisie = { lignes: [], diagnostic: "Diagnostic", prestations: "Travaux", delai: "Sous 7 jours", duree: "Une journée", ...(note === null ? {} : { noteRevision: note }) };
    // Un brouillon n'a pas de PDF ; un devis validé ou envoyé en a un (contrainte de la table).
    const pdf = statut === "brouillon" ? [null, null, null, null, null] : [`${org}/devis-${sollicitation}.pdf`, "e".repeat(64), 100, "{}", new Date().toISOString()];
    await db.query(
      `insert into public.artisan_devis_preparations (sollicitation_id, artisan_id, saisie, statut, pdf_path, pdf_sha, pdf_taille, entreprise, valide_le)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (sollicitation_id) do update set saisie = excluded.saisie, statut = excluded.statut,
         pdf_path = excluded.pdf_path, pdf_sha = excluded.pdf_sha, pdf_taille = excluded.pdf_taille, entreprise = excluded.entreprise, valide_le = excluded.valide_le`,
      [sollicitation, artisanId, JSON.stringify(saisie), statut, ...pdf]
    );
  }

  async function reviser(compte: string, devis: string, motif: string | null = MOTIF, cle: string | null = CLE_1) {
    await agir(compte);
    const { rows: [{ nouvelle }] } = await essai(`select public.demander_revision_devis($1,$2,$3,$4) as nouvelle`, [org, devis, motif, cle]);
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
  const alertes = async (type: string, devis?: string) => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select * from public.alerts where type = $1 and organization_id = $2 ${devis ? "and details->>'devis_id' = $3" : ""} order by created_at, id`,
      devis ? [type, org, devis] : [type, org]
    );
    return rows;
  };
  const aujourdhuiParis = async () => {
    await enTantQuePostgres();
    const { rows: [{ j }] } = await db.query(`select to_char(public.aujourdhui_paris(), 'YYYY-MM-DD') as j`);
    return j as string;
  };

  /** v1 déposée puis révision demandée : la demande attend la version 2. */
  async function enRevision() {
    const c = await consulter();
    const v1 = await deposer(cptArtisan, c.s1, 48000);
    expect(await reviser(gerant, v1)).toBe(true);
    return { ...c, v1 };
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status, essai_fin)
       values ('Révision de devis — Agence','essai', current_date + 30), ('Révision de devis — Autre agence','active', null) returning id, name`
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
    numeroIncident = inc.numero;

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

  it("demande une révision : v1 « révisée », demande en révision avec échéance à sept jours de Paris, événement, alerte fermée, brouillon rouvert", async () => {
    const { s1 } = await consulter();
    const v1 = await deposer(cptArtisan, s1);
    await brouillon(s1, artisan, null, "envoye");
    await enTantQuePostgres();
    await db.query(`update public.artisan_devis_preparations set devis_id = $1, revision = 3 where sollicitation_id = $2`, [v1, s1]);
    expect(await reviser(gerant, v1)).toBe(true);

    const d = await lireDevis(v1);
    expect(d.statut).toBe("revise");
    expect(d.decision).toBe("revision");
    expect(d.decision_motif).toBe(MOTIF);
    expect(d.decision_cle).toBe(CLE_1);
    expect(d.decide_par).toBe(gerant);
    expect(d.version).toBe(1);
    const s = await lireSollicitation(s1);
    expect(s.statut).toBe("revision_demandee");
    await enTantQuePostgres();
    // La date est lue en texte par la base : un objet Date la décalerait selon le fuseau de la machine.
    const { rows: [{ attendu, lue }] } = await db.query(
      `select to_char(public.aujourdhui_paris() + 7, 'YYYY-MM-DD') as attendu,
              to_char(revision_avant, 'YYYY-MM-DD') as lue
       from public.incident_sollicitations where id = $1`, [s1]);
    expect(lue).toBe(attendu);

    const [e] = await evenements("devis_revision_demandee");
    expect(e.details.motif).toBe(MOTIF);
    expect(e.details.devis_id).toBe(v1);
    expect(e.details.version).toBe(1);
    expect(e.details.revision_avant).toBe(attendu);

    const [a] = await alertes("devis_a_decider", v1);
    expect(a.statut).toBe("fermee");
    expect(a.closed_action).toBe("Révision demandée");

    const { rows: [p] } = await db.query(`select * from public.artisan_devis_preparations where sollicitation_id = $1`, [s1]);
    expect(p.statut).toBe("brouillon");
    expect(p.revision).toBe(4);
    expect(p.devis_id).toBeNull();
    expect(p.pdf_path).toBeNull();
    expect(p.email_statut).toBe("non_envoye");
    expect(p.saisie.diagnostic).toBe("Diagnostic");
  });

  it("exige un motif de dix caractères et une clé ; rejoue le même envoi sans rien refaire ; une autre clé est refusée clairement", async () => {
    const { s1 } = await consulter();
    const v1 = await deposer(cptArtisan, s1);
    await expect(reviser(gerant, v1, "Trop cher")).rejects.toThrow(/dix caractères au moins/);
    await expect(reviser(gerant, v1, MOTIF, null)).rejects.toThrow(/référence de cet envoi/);
    expect(await reviser(gerant, v1)).toBe(true);
    expect(await reviser(gerant, v1, "Autre texte au second envoi", CLE_1)).toBe(false);
    expect(await evenements("devis_revision_demandee")).toHaveLength(1);
    await expect(reviser(gerant, v1, MOTIF, CLE_2)).rejects.toThrow(/déjà été demandée/);
    await agir(gerant);
    await expect(essai(`select public.retenir_devis($1,$2)`, [org, v1])).rejects.toThrow(/n'est plus sélectionnable/);
    await expect(essai(`select public.refuser_devis($1,$2,$3,$4)`, [org, v1, MOTIF, CLE_3])).rejects.toThrow(/n'attend plus de décision/);
  });

  it("l'artisan dépose la version 2 seulement depuis une demande en révision, avec « ce qui change » ; la v1 reste lisible", async () => {
    const { s1, s2, v1 } = await enRevision();
    // Depuis une demande « envoyée » (artisan 2), rien ne change : v1 classique.
    const autre = await deposer(cptArtisan2, s2, 52000);
    expect((await lireDevis(autre)).version).toBe(1);

    // Sans « ce qui change », pas de version 2.
    await brouillon(s1, artisan, null);
    await expect(deposer(cptArtisan, s1, 45000)).rejects.toThrow(/Dites ce qui change/);
    expect(await evenements("devis_revise")).toHaveLength(0);

    await brouillon(s1, artisan, NOTE);
    const v2 = await deposer(cptArtisan, s1, 45000);
    const d2 = await lireDevis(v2);
    expect(d2.version).toBe(2);
    expect(d2.devis_precedent_id).toBe(v1);
    expect(d2.note_revision).toBe(NOTE);
    expect(d2.statut).toBe("depose");
    expect(Number(d2.montant_ttc_cents)).toBe(45000);
    expect((await lireDevis(v1)).statut).toBe("revise");
    expect((await lireSollicitation(s1)).statut).toBe("devis_depose");

    const [e] = await evenements("devis_revise");
    expect(e.details.devis_id).toBe(v2);
    expect(e.details.version).toBe(2);
    expect(e.details.devis_precedent_id).toBe(v1);
    expect(e.details.note_revision).toBe(NOTE);

    const [a] = await alertes("devis_a_decider", v2);
    expect(a.statut).toBe("ouverte");
    expect(a.titre).toBe(`Nouvelle version du devis (v2), à décider — ${numeroIncident}`);
    expect(a.details.version).toBe(2);
    expect(a.details.libelle).toMatch(/nouvelle version/);

    // Une seule ligne par demande pour l'artisan : la dernière version, avec son numéro.
    await agir(cptArtisan);
    const { rows: miennes } = await db.query(`select * from public.mes_sollicitations()`);
    expect(miennes).toHaveLength(1);
    expect(miennes[0].version).toBe(2);
    expect(miennes[0].statut).toBe("devis_depose");
    expect(Number(miennes[0].montant_ttc_cents)).toBe(45000);
    expect(miennes[0].revision_motif).toBeNull();
  });

  it("trois versions au plus : la révision de la v3 est refusée, seuls « retenir » et « refuser » restent", async () => {
    const { s1, v1 } = await enRevision();
    await brouillon(s1, artisan, NOTE);
    const v2 = await deposer(cptArtisan, s1, 45000);
    expect(await reviser(gerant, v2, MOTIF, CLE_2)).toBe(true);
    await brouillon(s1, artisan, "Troisième proposition : remise de 5 %.");
    const v3 = await deposer(cptArtisan, s1, 43000);
    expect((await lireDevis(v3)).version).toBe(3);
    expect((await lireDevis(v3)).devis_precedent_id).toBe(v2);
    await expect(reviser(gerant, v3, MOTIF, CLE_3)).rejects.toThrow(/Dernière version possible/);
    expect((await lireDevis(v3)).statut).toBe("depose");
    // Refuser la v3 reste possible.
    await agir(gerant);
    await db.query(`select public.refuser_devis($1,$2,$3,$4)`, [org, v3, "Les trois versions dépassent le budget.", CLE_3]);
    expect((await lireDevis(v3)).statut).toBe("refuse");
    expect((await lireDevis(v1)).statut).toBe("revise");
    expect((await lireSollicitation(s1)).statut).toBe("refusee");
  });

  it("retenir la v2 confie la mission sur la v2 (plafond calculé sur elle) et écarte la demande en révision de l'autre artisan", async () => {
    const { s1, s2, v1 } = await enRevision();
    await brouillon(s1, artisan, NOTE);
    const v2 = await deposer(cptArtisan, s1, 45000);
    const autre = await deposer(cptArtisan2, s2, 52000);
    expect(await reviser(gerant, autre, MOTIF, CLE_2)).toBe(true);

    await agir(gerant);
    const { rows: [{ iv }] } = await db.query(`select public.retenir_devis($1,$2) as iv`, [org, v2]);
    await enTantQuePostgres();
    const { rows: [mission] } = await db.query(`select devis_id, public.plafond_intervention(id) as plafond from public.incident_interventions where id = $1`, [iv]);
    expect(mission.devis_id).toBe(v2);
    expect(Number(mission.plafond)).toBe(45000);
    expect((await lireDevis(v2)).statut).toBe("retenu");
    expect((await lireDevis(v1)).statut).toBe("revise");
    expect((await lireSollicitation(s2)).statut).toBe("non_retenue");
    expect((await alertes("devis_a_decider", v2))[0].closed_action).toBe("Devis retenu");
  });

  it("l'échéance dépassée : le dépôt est refusé, la tâche quotidienne expire la demande, le devis reste « révisé », le gérant est alerté une fois", async () => {
    const { s1, v1 } = await enRevision();
    await enTantQuePostgres();
    await db.query(`update public.incident_sollicitations set revision_avant = public.aujourdhui_paris() - 1 where id = $1`, [s1]);
    await brouillon(s1, artisan, NOTE);
    await expect(deposer(cptArtisan, s1, 45000)).rejects.toThrow(/délai de réponse .* dépassé/);

    await enTantQuePostgres();
    await db.query(`select public.maintenance_artisans_interne()`);
    expect((await lireSollicitation(s1)).statut).toBe("expiree");
    expect((await lireDevis(v1)).statut).toBe("revise");
    const [e] = await evenements("devis_revision_expiree");
    expect(e.details.sollicitation_id).toBe(s1);
    expect(e.details.devis_id).toBe(v1);
    const [a] = await alertes("devis_revision_expiree");
    expect(a.statut).toBe("ouverte");
    expect(a.details.incident_id).toBe(incident);
    expect(a.details.sollicitation_id).toBe(s1);
    expect(a.titre).toBe(`Révision de devis sans réponse — ${numeroIncident}`);
    // Un second passage ne refait rien.
    await db.query(`select public.maintenance_artisans_interne()`);
    expect(await alertes("devis_revision_expiree")).toHaveLength(1);
    expect(await evenements("devis_revision_expiree")).toHaveLength(1);
    // Le dernier jour compris : une échéance d'aujourd'hui n'expire pas.
    const { s1: s1b } = await (async () => { await enTantQuePostgres(); await db.query("rollback to savepoint scenario"); await db.query("savepoint scenario"); return enRevision(); })();
    await enTantQuePostgres();
    await db.query(`update public.incident_sollicitations set revision_avant = public.aujourdhui_paris() where id = $1`, [s1b]);
    await db.query(`select public.maintenance_artisans_interne()`);
    expect((await lireSollicitation(s1b)).statut).toBe("revision_demandee");
  });

  it("l'artisan peut renoncer depuis la révision ; la demande en révision tient sa place dans le plafond de deux", async () => {
    const { consultation, s1, v1 } = await enRevision();
    await agir(gerant);
    await expect(essai(`select public.solliciter_artisan($1,$2,$3)`, [org, consultation, artisan3])).rejects.toThrow(/Deux artisans au maximum/);
    await agir(cptArtisan);
    await db.query(`select public.decliner_sollicitation($1,$2)`, [s1, "Je ne peux pas baisser davantage."]);
    expect((await lireSollicitation(s1)).statut).toBe("declinee");
    expect((await lireDevis(v1)).statut).toBe("revise");
    await agir(gerant);
    const { rows: [{ id: s3 }] } = await db.query(`select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan3]);
    expect(s3).toBeTruthy();
  });

  it("le suivi du locataire compte l'artisan en révision parmi les consultés, sans montant", async () => {
    const { s2 } = await enRevision();
    await deposer(cptArtisan2, s2, 52000);
    await agir(cptLoc);
    const { rows: [suivi] } = await db.query(`select * from public.mon_suivi_intervention($1) where incident_id = $2`, [org, incident]);
    expect(suivi.nb_artisans_consultes).toBe(2);
    expect(suivi.nb_devis_recus).toBe(1);
    expect(JSON.stringify(suivi)).not.toContain("48000");
    expect(JSON.stringify(suivi)).not.toContain("52000");
  });

  it("un autre gérant, le locataire, l'artisan et un agent hors portefeuille ne demandent pas de révision ; l'autre artisan ne dépose pas la v2", async () => {
    const { s1, v1 } = await enRevision();
    await enTantQuePostgres();
    await db.query("rollback to savepoint scenario");
    await db.query("savepoint scenario");
    const c = await consulter();
    const d1 = await deposer(cptArtisan, c.s1);
    await expect(reviser(autreGerant, d1)).rejects.toThrow(/Accès refusé/);
    await expect(reviser(cptLoc, d1)).rejects.toThrow(/Accès refusé/);
    await expect(reviser(cptArtisan, d1)).rejects.toThrow(/Accès refusé/);
    await expect(reviser(agent, d1)).rejects.toThrow(/hors de votre portefeuille/);
    expect((await lireDevis(d1)).statut).toBe("depose");
    expect(await reviser(gerant, d1)).toBe(true);
    await brouillon(c.s1, artisan, NOTE);
    await expect(deposer(cptArtisan2, c.s1, 40000)).rejects.toThrow(/Accès refusé/);
    void s1; void v1;
  });

  it("l'historique des versions : l'artisan lit les siennes (v1 révisée, v2 déposée, « ce qui change »), jamais celles d'un concurrent", async () => {
    const { s1, s2, v1 } = await enRevision();
    await brouillon(s1, artisan, NOTE);
    const v2 = await deposer(cptArtisan, s1, 45000);
    await deposer(cptArtisan2, s2, 52000);

    await agir(cptArtisan);
    const { rows: versions } = await db.query(`select * from public.mes_versions_devis($1) order by version`, [s1]);
    expect(versions.map((v) => [v.devis_id, v.version, v.statut])).toEqual([[v1, 1, "revise"], [v2, 2, "depose"]]);
    expect(versions[0].decision).toBe("revision");
    expect(versions[0].decision_motif).toBe(MOTIF);
    expect(versions[1].note_revision).toBe(NOTE);
    expect(JSON.stringify(versions)).not.toContain("52000");
    const { rows: concurrentes } = await db.query(`select * from public.mes_versions_devis($1)`, [s2]);
    expect(concurrentes).toHaveLength(0);

    await agir(cptArtisan2);
    const { rows: autres } = await db.query(`select * from public.mes_versions_devis($1)`, [s1]);
    expect(autres).toHaveLength(0);
    const { rows: siennes } = await db.query(`select * from public.mes_sollicitations()`);
    expect(siennes).toHaveLength(1);
    expect(siennes[0].revision_motif).toBeNull();
    expect(JSON.stringify(siennes)).not.toContain(MOTIF);

    // Le gérant lit toutes les versions du dossier (politique de lecture de l'organisation).
    await agir(gerant);
    const { rows: toutes } = await db.query(`select version, statut from public.incident_devis where incident_id = $1 order by version, depose_le`, [incident]);
    expect(toutes).toHaveLength(3);
  });

  it("l'artisan en révision lit le motif et l'échéance de la demande, et sa demande est de nouveau « à chiffrer »", async () => {
    const { s1 } = await enRevision();
    await agir(cptArtisan);
    const { rows: [l] } = await db.query(`select * from public.mes_sollicitations() where sollicitation_id = $1`, [s1]);
    expect(l.statut).toBe("revision_demandee");
    expect(l.revision_motif).toBe(MOTIF);
    expect(l.decision_motif).toBe(MOTIF);
    expect(l.version).toBe(1);
    expect(l.revision_avant).not.toBeNull();
    expect(Number(l.montant_ttc_cents)).toBe(48000);
  });

  it("l'artisan devenu non affectable ne dépose pas la version suivante ; un artisan écarté perd sa demande en révision", async () => {
    const { s1 } = await enRevision();
    await brouillon(s1, artisan, NOTE);
    await enTantQuePostgres();
    await db.query(`delete from public.artisan_metiers where artisan_id = $1`, [artisan]);
    expect(await deposer(cptArtisan, s1, 45000)).toBeNull();
    expect(await deposer(cptArtisan, s1, 45000)).toBeNull();
    expect(await alertes("devis_revision_non_affectable")).toHaveLength(1);
    await enTantQuePostgres();
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [artisan]);
    await agir(gerant);
    await db.query(`select public.artisan_blacklist_locale($1,$2,'Motif de liste noire suffisamment long')`, [org, artisan]);
    expect((await lireSollicitation(s1)).statut).toBe("annulee");
    await brouillon(s1, artisan, NOTE);
    await expect(deposer(cptArtisan, s1, 45000)).rejects.toThrow(/n'attend plus de devis/);
  });

  it("pendant la révision, l'artisan classe le PDF de sa version suivante dans l'espace de l'agence ; plus après son renoncement", async () => {
    // Le serveur dépose le PDF avec le client de l'artisan (envoyerDevisValide) : la sécurité du stockage doit
    // accepter l'emplacement de l'agence tant que la demande attend la version suivante.
    const { s1 } = await enRevision();
    await enTantQuePostgres();
    const chemin = `${org}/devis-gerimmo/${randomUUID()}.pdf`;
    await db.query("insert into artisan_devis_preparations(sollicitation_id,artisan_id,statut,entreprise,pdf_path,pdf_sha,pdf_taille,valide_le) values($1,$2,'valide','{}',$3,$4,10,now()) on conflict(sollicitation_id) do update set statut='valide',entreprise='{}',pdf_path=excluded.pdf_path,pdf_sha=excluded.pdf_sha,pdf_taille=10,valide_le=now()", [s1, artisan, chemin, "a".repeat(64)]);
    await agir(cptArtisan);
    await essai(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [chemin, cptArtisan]);
    await db.query(`select public.decliner_sollicitation($1,$2)`, [s1, "Je ne peux pas baisser davantage."]);
    await expect(
      essai(`insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)`, [`${org}/devis-gerimmo/${randomUUID()}.pdf`, cptArtisan])
    ).rejects.toThrow(/row-level security/);
  });

  it("le parcours réel de l'artisan : envoyer_mon_devis_prepare dépose la v2 avec « ce qui change » lu dans la préparation validée", async () => {
    const { s1, v1 } = await enRevision();
    await enTantQuePostgres();
    const chemin = `${org}/devis-v2.pdf`;
    await db.query(`insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)`, [chemin, cptArtisan]);
    const saisie = { lignes: [{ libelle: "Main-d'œuvre", quantite: 2, prix_unitaire_ht_cents: 5000, tva_bps: 1000 }], diagnostic: "Joint usé", prestations: "Main-d'œuvre", delai: "Cinq jours", duree: "Deux heures", valideJusquAu: "2099-01-01", noteRevision: NOTE };
    await db.query(
      `insert into public.artisan_devis_preparations (sollicitation_id, artisan_id, saisie, statut, entreprise, pdf_path, pdf_sha, pdf_taille, valide_le, revision)
       values ($1,$2,$3,'valide','{}',$4,$5,100,now(),2)
       on conflict (sollicitation_id) do update set saisie = excluded.saisie, statut = 'valide', entreprise = '{}', pdf_path = excluded.pdf_path, pdf_sha = excluded.pdf_sha, pdf_taille = 100, valide_le = now(), revision = 2`,
      [s1, artisan, JSON.stringify(saisie), chemin, "e".repeat(64)]
    );
    await agir(cptArtisan);
    const { rows: [{ id: v2 }] } = await db.query(`select public.envoyer_mon_devis_prepare($1, 2) as id`, [s1]);
    const d2 = await lireDevis(v2);
    expect(d2.version).toBe(2);
    expect(d2.devis_precedent_id).toBe(v1);
    expect(d2.note_revision).toBe(NOTE);
    expect(Number(d2.montant_ttc_cents)).toBe(11000);
    const { rows: [p] } = await db.query(`select statut, devis_id from public.artisan_devis_preparations where sollicitation_id = $1`, [s1]);
    expect(p.statut).toBe("envoye");
    expect(p.devis_id).toBe(v2);
  });

  it("une organisation dont l'abonnement est suspendu ne demande plus de révision", async () => {
    const { s1 } = await consulter();
    const v1 = await deposer(cptArtisan, s1);
    await enTantQuePostgres();
    await db.query(`select public.tache_systeme()`);
    await db.query(`update public.organizations set essai_fin = current_date - 1 where id = $1`, [org]);
    await db.query(`select set_config('gerimmo.systeme', '', true)`);
    await expect(reviser(gerant, v1)).rejects.toThrow(/Abonnement suspendu/);
  });

  it("la demande en révision n'apparaît pas comme « à traiter » tant que la v2 n'est pas là, puis la v2 compte", async () => {
    const { s1 } = await enRevision();
    const j = await aujourdhuiParis();
    await agir(gerant);
    const aTraiter = async () => (await db.query(`select incident_id from public.incident_devis where organization_id = $1 and statut = 'depose' and valide_jusqu_au >= $2`, [org, j])).rows;
    expect(await aTraiter()).toHaveLength(0);
    await brouillon(s1, artisan, NOTE);
    await deposer(cptArtisan, s1, 45000);
    await agir(gerant);
    expect(await aTraiter()).toHaveLength(1);
  });
  it("D18 complément : l’archive PDF est celle de la version autorisée, jamais de la préparation suivante", async () => {
    const {s1}=await consulter();
    async function avecPdf(version:number) {
      const path=`${org}/devis-gerimmo/version-${version}.pdf`;
      await enTantQuePostgres();
      await db.query("insert into storage.objects(bucket_id,name,owner) values('documents',$1,$2)",[path,cptArtisan]);
      await agir(cptArtisan);
      const {rows:[r]}=await db.query(`select public.deposer_devis_structure($1,${LIGNES(45000)},'Diagnostic','Prestations','Un jour','Une heure',null,null,null,$2,'application/pdf',100,$3) as id`,[s1,path,String(version).repeat(64)]);
      return {id:r.id,path};
    }
    const v1=await avecPdf(1);
    await reviser(gerant,v1.id);
    await brouillon(s1,artisan,NOTE,"valide");
    await agir(gerant);
    const lecture=async(version:number|null)=>(await essai("select public.lire_devis_pdf_version($1,$2) as doc",[s1,version])).rows[0].doc;
    expect(await lecture(null)).toMatchObject({version:1,pdf_path:v1.path,pdf_sha:"1".repeat(64)});
    await expect(lecture(2)).rejects.toThrow(/Accès refusé/);
    const v2=await avecPdf(2);
    for (const compte of [gerant,cptArtisan]) {
      await agir(compte);
      expect(await lecture(1)).toMatchObject({version:1,pdf_path:v1.path});
      expect(await lecture(2)).toMatchObject({version:2,pdf_path:v2.path});
      expect(await lecture(null)).toMatchObject({version:2,pdf_path:v2.path});
    }
    for (const compte of [cptArtisan2,autreGerant,cptLoc,agent]) {
      await agir(compte);
      await expect(lecture(1)).rejects.toThrow(/Accès refusé/);
    }
  });
  it("D18 complément : un envoi refusé garde la préparation validée et écrit une seule alerte durable", async () => {
    const {s1}=await enRevision();
    await brouillon(s1,artisan,NOTE,"valide");
    await enTantQuePostgres();
    await db.query(`update public.artisan_devis_preparations set saisie=saisie || jsonb_build_object('lignes',${LIGNES(45000)}) where sollicitation_id=$1`,[s1]);
    await db.query('delete from public.artisan_metiers where artisan_id=$1',[artisan]);
    for(let n=0;n<2;n++) {
      await agir(cptArtisan);
      expect((await db.query('select public.envoyer_mon_devis_prepare($1,1) as id',[s1])).rows[0].id).toBeNull();
    }
    await enTantQuePostgres();
    expect((await db.query('select statut,devis_id from public.artisan_devis_preparations where sollicitation_id=$1',[s1])).rows[0]).toMatchObject({statut:'valide',devis_id:null});
    expect(await alertes('devis_revision_non_affectable')).toHaveLength(1);
  });

});
