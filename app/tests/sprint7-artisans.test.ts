/**
 * Sprint 7 — socle artisans (module 8) : les gardes de la BASE.
 *
 * Ce fichier ne teste pas des écrans : il essaie de CONTOURNER les règles que
 * le wiki confie à la base. Chaque cas nomme sa règle. Deux familles :
 *  · les gardes métier (décennale, métier, deux devis, photo obligatoire,
 *    deux approbations, réaffectation au refus) ;
 *  · le modèle d'accès inter-agences de l'artisan (RM-A1.7/A1.8), neuf dans ce
 *    produit : il voit son agenda toutes agences confondues, et rien d'autre.
 *
 * Nécessite SUPABASE_DB_URL. Sans elle, les tests sont ignorés.
 */
import { verifierBaseDeTest } from "./garde-base";
import { config } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
const DB_URL = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(DB_URL);

describe.skipIf(!DB_URL)("Sprint 7 — socle artisans", () => {
  let db: Client;
  // Décor monté une fois, dans une transaction annulée à la fin.
  let orgA = "", orgB = "";
  let gerantA = "", gerantB = "", sa = "", cptArtisan = "", cptLoc = "", cptLocB = "";
  let artisan = "", artisanBis = "";
  let incidentA = "", incidentB = "";
  let consultation = "", intervention = "";

  const connecte = (id: string) =>
    db.query(
      `select set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role','authenticated')::text, true)`,
      [id]
    );
  const role = (r: string) =>
    db.query(r === "reset" ? "reset role" : `set local role ${r}`);
  const agir = async (compte: string) => {
    await role("reset");
    await connecte(compte);
    await role("authenticated");
  };
  const enTantQuePostgres = () => role("reset");

  // Une tentative que l'on ATTEND refusée avorte la transaction du test si on
  // la joue nue : chacune se joue donc sous un point de reprise, qu'on annule.
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

  async function parc(org: string, compte: string) {
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
      [org]
    );
    const { rows: [lot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat)
       values ($1,$2,'Lot 1','loue') returning id`,
      [bien.id, org]
    );
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`,
      [org, compte]
    );
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat,
         date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
      [org, lot.id, personne.id]
    );
    const { rows: [incident] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id,
         declarant_person_id, canal, categorie, description, etat, imputation,
         imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire',
         'Joint usé par le temps') returning id`,
      [org, lot.id, bail.id, personne.id]
    );
    return incident.id as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status)
       values ('Artisans — Agence A','active'), ('Artisans — Agence B','active')
       returning id, name`
    );
    orgA = orgs.find((o) => o.name.endsWith("A")).id;
    orgB = orgs.find((o) => o.name.endsWith("B")).id;

    gerantA = await nouveauCompte("gerant-a");
    gerantB = await nouveauCompte("gerant-b");
    sa = await nouveauCompte("sa");
    cptArtisan = await nouveauCompte("artisan");
    cptLoc = await nouveauCompte("loc-a");
    cptLocB = await nouveauCompte("loc-b");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
        ($1,$3,'admin_agence'),($2,$4,'admin_agence'),($5,$3,'locataire'),($6,$4,'locataire')`,
      [gerantA, gerantB, orgA, orgB, cptLoc, cptLocB]
    );
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1, null, 'super_admin')`,
      [sa]
    );

    incidentA = await parc(orgA, cptLoc);
    incidentB = await parc(orgB, cptLocB);

    // L'agence A crée la fiche (module 8, 8.1) ; l'artisan la reprend ensuite.
    await agir(gerantA);
    const { rows: [{ artisan_creer_ou_rattacher: id }] } = await db.query(
      `select public.artisan_creer_ou_rattacher($1,'Plomberie Durand','12345678901234',
         '0611111111', null, array['plomberie']::public.artisan_metier[], array['75011'])`,
      [orgA]
    );
    artisan = id;
    await enTantQuePostgres();
    await db.query(`update public.artisans set account_id=$2 where id=$1`, [artisan, cptArtisan]);

    // Un second artisan, déjà validé et public, pour les cas de concurrence.
    const { rows: [bis] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, statut_plateforme,
         siret_etat, visibilite)
       values ('Plomberie Bis','98765432109876','0622222222','valide','verifie','publique')
       returning id`
    );
    artisanBis = bis.id;
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [artisanBis]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [artisanBis]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,'emp-bis', current_date + 300)`,
      [artisanBis, `artisans/${artisanBis}/d.pdf`]
    );
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  // ── Les deux approbations, à ne pas confondre ───────────────────────────
  it("validation PLATEFORME : une agence ne peut pas donner à un artisan le droit d'exister", async () => {
    await agir(gerantA);
    await expect(
      essai(`select public.artisan_decider_plateforme($1,'validation',null)`, [artisan])
    ).rejects.toThrow(/Accès refusé/);
  });

  it("sans validation plateforme, l'artisan n'est pas sollicitable", async () => {
    await agir(gerantA);
    const { rows: [{ id }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',false,30) as id`,
      [orgA, incidentA]
    );
    await expect(
      essai(`select public.solliciter_artisan($1,$2,$3)`, [orgA, id, artisan])
    ).rejects.toThrow(/profil non validé|liste noire|hors zone|non rattaché/);
    await enTantQuePostgres();
    await db.query(`update public.incident_consultations set statut='annulee' where id=$1`, [id]);
  });

  it("le super admin valide, et seulement lui (RM-8.5.3) — après vérification du SIRET", async () => {
    await agir(sa);
    // « Vérifié » est le seul état affectable : valider avant de vérifier
    // créerait un artisan valide et proposable nulle part (RM-A1.9).
    await expect(
      essai(`select public.artisan_decider_plateforme($1,'validation',null)`, [artisan])
    ).rejects.toThrow(/Vérifiez d'abord le SIRET/);
    await db.query(`select public.artisan_definir_siret_etat($1,'verifie')`, [artisan]);
    await db.query(`select public.artisan_decider_plateforme($1,'validation',null)`, [artisan]);
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select statut_plateforme, siret_etat from public.artisans where id=$1`, [artisan]
    );
    expect(rows[0].statut_plateforme).toBe("valide");
    expect(rows[0].siret_etat).toBe("verifie");
  });

  // ── La décennale selon la NATURE des travaux (RM-8.2.9) ─────────────────
  it("la décennale n'est pas exigée pour l'entretien courant, et l'est au-delà", async () => {
    await agir(gerantA);
    const { rows: [{ id: courant }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',false,30) as id`,
      [orgA, incidentA]
    );
    // Entretien courant : il passe, sans attestation.
    await db.query(`select public.solliciter_artisan($1,$2,$3)`, [orgA, courant, artisan]);
    await enTantQuePostgres();
    await db.query(`update public.incident_consultations set statut='annulee' where id=$1`, [courant]);

    await agir(gerantA);
    const { rows: [{ id: lourd }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','remplacement_equipement',false,30) as id`,
      [orgA, incidentA]
    );
    consultation = lourd;
    await expect(
      essai(`select public.solliciter_artisan($1,$2,$3)`, [orgA, lourd, artisan])
    ).rejects.toThrow(/décennale/);
  });

  it("le filtre décennale n'a pas d'interrupteur : artisan_affectable n'accepte aucun argument pour le lever", async () => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='artisan_affectable'`
    );
    expect(rows[0].args).not.toMatch(/boolean/);
  });

  it("l'artisan dépose lui-même sa décennale (RM-8.2.1) et redevient affectable aussitôt (RM-8.2.2)", async () => {
    await agir(cptArtisan);
    // Pas dans le dossier d'un autre.
    await expect(
      essai(
        `select public.deposer_ma_piece('decennale',
           'artisans/00000000-0000-0000-0000-000000000000/d.pdf','application/pdf',
           1000,'emp-vol',current_date, current_date + 365)`
      )
    ).rejects.toThrow(/Chemin de stockage invalide/);
    await db.query(
      `select public.deposer_ma_piece('decennale',$1,'application/pdf',1000,'emp-dec',
         current_date, current_date + 365)`,
      [`artisans/${artisan}/decennale.pdf`]
    );
    await agir(gerantA);
    await db.query(`select public.solliciter_artisan($1,$2,$3)`, [orgA, consultation, artisan]);
  });

  it("deux artisans au maximum en parallèle (RM-9.1.1)", async () => {
    await enTantQuePostgres();
    const { rows: [ter] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, statut_plateforme,
         siret_etat, visibilite)
       values ('Plomberie Ter','11111111111111','0633333333','valide','verifie','publique')
       returning id`
    );
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [ter.id]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [ter.id]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,'emp-ter', current_date + 300)`,
      [ter.id, `artisans/${ter.id}/d.pdf`]
    );
    await agir(gerantA);
    await db.query(`select public.solliciter_artisan($1,$2,$3)`, [orgA, consultation, artisanBis]);
    await expect(
      essai(`select public.solliciter_artisan($1,$2,$3)`, [orgA, consultation, ter.id])
    ).rejects.toThrow(/[Dd]eux artisans au maximum/);
  });

  it("la sélection d'un devis n'appartient NI au locataire NI à une autre agence", async () => {
    await agir(cptArtisan);
    const { rows: mesDemandes } = await db.query(`select * from public.mes_sollicitations()`);
    const demande = mesDemandes.find((d) => d.statut === "envoyee");
    const { rows: [{ d: devis }] } = await db.query(
      `select public.deposer_devis($1, 45000,'Remplacement du mitigeur',
         null,null,null,null,null) as d`,
      [demande.sollicitation_id]
    );

    await agir(cptLoc);
    await expect(
      essai(`select public.retenir_devis($1,$2)`, [orgA, devis])
    ).rejects.toThrow(/Accès refusé/);

    await agir(gerantB);
    await expect(
      essai(`select public.retenir_devis($1,$2)`, [orgA, devis])
    ).rejects.toThrow(/Accès refusé/);

    await agir(gerantA);
    const { rows: [{ i }] } = await db.query(
      `select public.retenir_devis($1,$2) as i`, [orgA, devis]
    );
    intervention = i;
    await enTantQuePostgres();
    const { rows } = await db.query(`select etat from public.incidents where id=$1`, [incidentA]);
    expect(rows[0].etat).toBe("affecte");
  });

  // ── Le modèle d'accès de l'artisan ──────────────────────────────────────
  it("RM-A1.7 : l'artisan ne lit EN DIRECT aucune donnée d'agence", async () => {
    await agir(cptArtisan);
    for (const table of [
      "incidents", "baux", "lots", "persons", "biens",
      "incident_interventions", "incident_devis", "incident_sollicitations",
      "incident_consultations", "artisan_evaluations", "intervention_creneaux",
    ]) {
      const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
      expect(rows[0].n, `${table} devrait être vide pour l'artisan`).toBe(0);
    }
  });

  it("l'artisan n'a aucun privilège d'écriture, même sur les tables de sa mission", async () => {
    await agir(cptArtisan);
    await expect(
      essai(`update public.incident_interventions set statut='terminee'`)
    ).rejects.toThrow(/permission denied/);
    await expect(
      essai(`update public.incidents set etat='clos'`)
    ).rejects.toThrow(/permission denied/);
  });

  it("aucune politique RLS du produit ne nomme le rôle artisan", async () => {
    await enTantQuePostgres();
    const { rows } = await db.query(
      `select policyname from pg_policies where schemaname='public'
       and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%''artisan''%'`
    );
    expect(rows.map((r) => r.policyname)).toEqual([]);
  });

  it("l'agenda ne donne le contact de l'occupant qu'une fois la mission acceptée", async () => {
    await agir(cptArtisan);
    const avant = (await db.query(`select * from public.mon_agenda_artisan()`)).rows;
    expect(avant).toHaveLength(1);
    expect(avant[0].occupant_nom).toBeNull();
    expect(avant[0].occupant_telephone).toBeNull();
    expect(avant[0].adresse).toBe("1 rue du Test");

    await db.query(`select public.accepter_mission($1)`, [intervention]);
    const apres = (await db.query(`select * from public.mon_agenda_artisan()`)).rows;
    expect(apres[0].occupant_nom).toBe("Martin");
    expect(apres[0].occupant_telephone).toBe("0600000000");

    // Rien du bail ni du loyer ne franchit la projection.
    expect(Object.keys(apres[0])).not.toContain("loyer_hc");
    expect(Object.keys(apres[0])).not.toContain("bail_id");
  });

  it("un compte qui n'est pas artisan n'a pas d'agenda, et un artisan ne voit pas la mission d'un autre", async () => {
    await agir(cptLoc);
    expect((await db.query(`select * from public.mon_agenda_artisan()`)).rows).toHaveLength(0);
    await agir(gerantA);
    expect((await db.query(`select * from public.mon_agenda_artisan()`)).rows).toHaveLength(0);
    await agir(cptArtisan);
    await enTantQuePostgres();
    const autre = await nouveauCompte("artisan-autre");
    await db.query(`update public.artisans set account_id=$2 where id=$1`, [artisanBis, autre]);
    await agir(autre);
    expect((await db.query(`select * from public.mon_agenda_artisan()`)).rows).toHaveLength(0);
    await expect(
      essai(`select public.accepter_mission($1)`, [intervention])
    ).rejects.toThrow(/Accès refusé/);
  });

  it("l'agence ne lit pas les pièces justificatives de l'artisan (pivot du 2026-09-04)", async () => {
    await agir(gerantA);
    const { rows } = await db.query(`select count(*)::int as n from public.artisan_pieces`);
    expect(rows[0].n).toBe(0);
    // Elle lit en revanche le profil de l'artisan qu'elle a rattaché.
    const { rows: profil } = await db.query(
      `select count(*)::int as n from public.artisans where id=$1`, [artisan]
    );
    expect(profil[0].n).toBe(1);
  });

  // ── RM-10 : les créneaux ────────────────────────────────────────────────
  it("trois créneaux au minimum, de part et d'autre (RM-10.1.1 / RM-10.2.2)", async () => {
    const trois = (mois: string) =>
      JSON.stringify(
        [1, 2, 3].map((j) => ({
          debut: `2026-${mois}-0${j}T08:00:00Z`,
          fin: `2026-${mois}-0${j}T10:00:00Z`,
        }))
      );
    await agir(cptArtisan);
    await expect(
      essai(`select public.proposer_creneaux($1,'[]'::jsonb)`, [intervention])
    ).rejects.toThrow(/au moins trois créneaux/);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [intervention, trois("10")]);

    await agir(cptLoc);
    // Un refus sec n'existe pas : refuser oblige à contre-proposer trois.
    await expect(
      essai(`select public.contre_proposer_creneaux($1,$2,'[]'::jsonb)`, [orgA, intervention])
    ).rejects.toThrow(/proposez-en trois/);
    await db.query(
      `select public.contre_proposer_creneaux($1,$2,$3::jsonb)`,
      [orgA, intervention, trois("11")]
    );

    // Le locataire d'une autre agence n'a rien à faire ici.
    await agir(cptLocB);
    await expect(
      essai(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`,
        [orgA, intervention, trois("11")])
    ).rejects.toThrow(/Accès refusé/);
  });

  it("six créneaux refusés : l'artisan ne propose plus, le gérant arbitre (RM-10.4.1)", async () => {
    const trois = (mois: string) =>
      JSON.stringify(
        [1, 2, 3].map((j) => ({
          debut: `2026-${mois}-1${j}T08:00:00Z`,
          fin: `2026-${mois}-1${j}T10:00:00Z`,
        }))
      );
    await agir(cptArtisan);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [intervention, trois("10")]);
    await agir(cptLoc);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`,
      [orgA, intervention, trois("11")]);

    await agir(cptArtisan);
    await expect(
      essai(`select public.proposer_creneaux($1,$2::jsonb)`, [intervention, trois("12")])
    ).rejects.toThrow(/gérant/);

    await enTantQuePostgres();
    const { rows: alertes } = await db.query(
      `select count(*)::int as n from public.alerts
       where organization_id=$1 and type='creneaux_arbitrage' and statut='ouverte'`,
      [orgA]
    );
    expect(alertes[0].n).toBe(1);
    // Les créneaux refusés restent : RM-10.4.4, le refus persistant est opposable.
    const { rows: refuses } = await db.query(
      `select count(*)::int as n from public.intervention_creneaux
       where intervention_id=$1 and statut='refuse'`,
      [intervention]
    );
    expect(refuses[0].n).toBeGreaterThanOrEqual(6);

    await agir(gerantA);
    await db.query(
      `select public.fixer_creneau_arbitrage($1,$2,'2026-12-02T08:00:00Z',
         '2026-12-02T10:00:00Z','Réglé au téléphone')`,
      [orgA, intervention]
    );
  });

  // ── RM-7.5.2 : la photo est une garde, pas une consigne d'interface ─────
  it("RM-7.5.2 : sans photo du travail réalisé, l'intervention ne se termine pas — RPC ET écriture directe", async () => {
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [intervention]);
    await expect(
      essai(`select public.deposer_compte_rendu($1,'Joint remplacé',null,null,null,false)`,
        [intervention])
    ).rejects.toThrow(/photo du travail réalisé/);

    // Contournement : on écrit le compte rendu en direct, en tant que
    // propriétaire de la base, puis on force le statut. Le déclencheur tient.
    await enTantQuePostgres();
    await db.query(
      `insert into public.intervention_comptes_rendus
         (organization_id, intervention_id, artisan_id, travaux_realises)
       values ($1,$2,$3,'Contournement')`,
      [orgA, intervention, artisan]
    );
    await expect(
      essai(`update public.incident_interventions set statut='terminee', terminee_le=now()
                where id=$1`, [intervention])
    ).rejects.toThrow(/photo du travail réalisé/);
    await db.query(`delete from public.intervention_comptes_rendus where intervention_id=$1`,
      [intervention]);
    await expect(
      essai(`update public.incident_interventions set statut='terminee', terminee_le=now()
                where id=$1`, [intervention])
    ).rejects.toThrow(/compte rendu est obligatoire/);
  });

  it("RM-7.5.3 : l'artisan signale la cause réelle, l'agent révise l'imputation avant facturation", async () => {
    await agir(cptArtisan);
    await db.query(
      `select public.deposer_photo_intervention($1,'apres',$2,'image/jpeg',100,'emp-apres')`,
      [intervention, `${orgA}/apres.jpg`]
    );
    await db.query(
      `select public.deposer_compte_rendu($1,'Canalisation percée par une vis',
         'Perçage lors de la pose d''une étagère','degradation_fautive',52000,false)`,
      [intervention]
    );
    // Mission finie : le contact de l'occupant se referme (l'artisan garde sa
    // ligne d'agenda, plus le téléphone de quelqu'un chez qui il n'ira plus).
    const { rows: fini } = await db.query(`select * from public.mon_agenda_artisan()`);
    expect(fini[0].occupant_telephone).toBeNull();
    expect(fini[0].adresse).toBe("1 rue du Test");

    await enTantQuePostgres();
    const { rows: etat } = await db.query(`select etat from public.incidents where id=$1`, [incidentA]);
    expect(etat[0].etat).toBe("termine");
    const { rows: alerte } = await db.query(
      `select count(*)::int as n from public.alerts
       where organization_id=$1 and type='incident_imputation_a_reviser' and statut='ouverte'`,
      [orgA]
    );
    expect(alerte[0].n).toBe(1);

    await agir(gerantA);
    // La qualification ordinaire reste fermée après affectation (règle du 23/08).
    await expect(
      essai(`select public.qualifier_incident($1,$2,'degradation_fautive','Cause réelle')`,
        [orgA, incidentA])
    ).rejects.toThrow(/ne se qualifie plus/);
    await db.query(
      `select public.reviser_imputation_apres_diagnostic($1,$2,'degradation_fautive',
         'L''artisan constate un perçage : dégradation fautive')`,
      [orgA, incidentA]
    );
    await enTantQuePostgres();
    const { rows: apres } = await db.query(
      `select imputation from public.incidents where id=$1`, [incidentA]
    );
    expect(apres[0].imputation).toBe("degradation_fautive");
  });

  it("sans signalement d'artisan, la révision après diagnostic est refusée", async () => {
    await enTantQuePostgres();
    await db.query(
      `update public.intervention_comptes_rendus set cause_reelle=null, imputation_suggeree=null
       where intervention_id=$1`, [intervention]
    );
    await agir(gerantA);
    await expect(
      essai(`select public.reviser_imputation_apres_diagnostic($1,$2,'locataire','Au jugé')`,
        [orgA, incidentA])
    ).rejects.toThrow(/signalé de cause différente/);
    await enTantQuePostgres();
    await db.query(
      `update public.intervention_comptes_rendus
       set cause_reelle='Perçage', imputation_suggeree='degradation_fautive'
       where intervention_id=$1`, [intervention]
    );
  });

  // ── Module 11 : ce que l'artisan voit de sa note ────────────────────────
  it("l'artisan voit sa moyenne et sa fiabilité, jamais le détail ni les commentaires (RM-11.2.2/11.4)", async () => {
    await agir(gerantA);
    await db.query(
      `select public.evaluer_artisan_gerant($1,$2,5::smallint,4::smallint,4::smallint,
         'Commentaire privé à l''agence')`,
      [orgA, intervention]
    );
    await expect(
      essai(`select public.evaluer_artisan_gerant($1,$2,5::smallint,5::smallint,5::smallint,null)`,
        [orgA, intervention])
    ).rejects.toThrow(/déjà été évaluée/);

    await agir(cptLoc);
    await db.query(`select public.noter_artisan_locataire($1,$2,4::smallint,'Ponctuel')`,
      [orgA, intervention]);

    await agir(cptArtisan);
    const { rows, fields } = await db.query(`select * from public.ma_note_artisan()`);
    const colonnes = fields.map((f) => f.name);
    expect(colonnes).not.toContain("commentaire");
    expect(colonnes).not.toContain("evaluateur_account_id");
    expect(Number(rows[0].note_publiee)).toBeGreaterThan(0);
    // Moins de trois évaluations : « nouveau », pas encore publié (RM-11.4.1).
    expect(rows[0].publiable).toBe(false);
  });

  // ── RM-A1.8 : les deux listes noires ne se confondent pas ───────────────
  it("la liste noire LOCALE n'engage que son agence ; la GLOBALE vaut partout", async () => {
    // L'artisan se rend public : c'est son geste (RM-8.4.2), pas celui d'une agence.
    await agir(gerantA);
    await expect(
      essai(`select public.definir_ma_visibilite('publique')`)
    ).rejects.toThrow(/Accès refusé/);
    await agir(cptArtisan);
    await db.query(`select public.definir_ma_visibilite('publique')`);

    await agir(gerantB);
    await expect(
      essai(`select public.artisan_blacklist_locale($1,$2,'')`, [orgB, artisan])
    ).rejects.toThrow(/motif est obligatoire/);
    await db.query(`select public.artisan_blacklist_locale($1,$2,'Deux refus en un mois')`,
      [orgB, artisan]);
    const { rows: chezB } = await db.query(
      `select * from public.artisans_affectables($1,'plomberie','entretien_courant','75011')`,
      [orgB]
    );
    expect(chezB.some((r) => r.artisan_id === artisan)).toBe(false);

    await agir(gerantA);
    const { rows: chezA } = await db.query(
      `select * from public.artisans_affectables($1,'plomberie','entretien_courant','75011')`,
      [orgA]
    );
    expect(chezA.some((r) => r.artisan_id === artisan)).toBe(true);
    await expect(
      essai(`select public.artisan_decider_plateforme($1,'blacklist_globale','Faux')`, [artisan])
    ).rejects.toThrow(/Accès refusé/);

    await agir(sa);
    await db.query(
      `select public.artisan_decider_plateforme($1,'blacklist_globale','Attestation falsifiée')`,
      [artisan]
    );
    await agir(gerantA);
    const { rows: apres } = await db.query(
      `select * from public.artisans_affectables($1,'plomberie','entretien_courant','75011')`,
      [orgA]
    );
    expect(apres.some((r) => r.artisan_id === artisan)).toBe(false);
  });

  it("une intervention ne peut pas NAÎTRE terminée : le déclencheur couvre aussi l'insert", async () => {
    await enTantQuePostgres();
    await expect(
      essai(
        `insert into public.incident_interventions (organization_id, incident_id, artisan_id,
           nature_travaux, statut, terminee_le)
         values ($1,$2,$3,'entretien_courant','terminee',now())`,
        [orgA, incidentA, artisan]
      )
    ).rejects.toThrow(/compte rendu est obligatoire/);
  });

  it("auto-inscription de l'artisan, et file de validation réservée au super admin", async () => {
    const nouveau = await nouveauCompte("artisan-libre");
    await agir(nouveau);
    await expect(
      essai(`select public.inscrire_mon_entreprise_artisan('Elec Libre','22222222222222',
        '0644444444','e@l.fr', array[]::public.artisan_metier[], array['75011'])`)
    ).rejects.toThrow(/au moins un métier/);
    await db.query(
      `select public.inscrire_mon_entreprise_artisan('Elec Libre','22222222222222',
         '0644444444','e@l.fr', array['electricite']::public.artisan_metier[], array['75011'])`
    );
    const { rows: fiche } = await db.query(`select * from public.mon_artisan()`);
    expect(fiche[0].statut_plateforme).toBe("en_attente");
    // Privé par défaut, et non publiable tant que le SIRET n'est pas vérifié.
    expect(fiche[0].visibilite).toBe("privee");
    await expect(
      essai(`select public.definir_ma_visibilite('publique')`)
    ).rejects.toThrow(/SIRET vérifié/);

    await agir(gerantA);
    await expect(
      essai(`select * from public.artisans_a_valider()`)
    ).rejects.toThrow(/Accès refusé/);
    await agir(sa);
    const { rows: file } = await db.query(`select * from public.artisans_a_valider()`);
    expect(file.some((f) => f.raison_sociale === "Elec Libre")).toBe(true);
  });

  it("stockage : l'artisan écrit dans le dossier de sa mission et dans le sien, nulle part ailleurs", async () => {
    await enTantQuePostgres();
    // La mission de l'artisan n'est plus vivante à ce stade du scénario : on
    // vérifie donc les deux états, mission vivante et mission close.
    await db.query(
      `update public.incident_interventions set statut='en_cours' where id=$1`, [intervention]
    );
    await agir(cptArtisan);
    // On tente le VRAI dépôt : c'est la politique de storage.objects qui
    // tranche, pas une reformulation de son expression.
    const depot = async (chemin: string) => {
      try {
        await essai(
          `insert into storage.objects (bucket_id, name) values ('documents', $1)`,
          [chemin]
        );
        return true;
      } catch {
        return false;
      }
    };

    expect(await depot(`${orgA}/photo.jpg`), "le dossier de son agence de mission").toBe(true);
    expect(await depot(`artisans/${artisan}/rc-pro.pdf`), "son propre dossier de pièces").toBe(true);
    expect(await depot(`${orgB}/photo.jpg`), "le dossier d'une agence sans mission").toBe(false);
    expect(await depot(`artisans/${artisanBis}/vol.pdf`), "le dossier d'un confrère").toBe(false);

    // Et ce qu'il a le droit de relire : ses pièces et les fichiers de ses
    // missions, jamais ceux d'un autre.
    const { rows: chemins } = await db.query(`select public.chemins_fichiers_artisan() as c`);
    const lisibles = chemins.map((r) => r.c);
    expect(lisibles.some((c: string) => c.startsWith(`artisans/${artisan}/`))).toBe(true);
    expect(lisibles.some((c: string) => c.startsWith(`artisans/${artisanBis}/`))).toBe(false);

    await enTantQuePostgres();
    await db.query(
      `update public.incident_interventions set statut='terminee' where id=$1`, [intervention]
    );
    await agir(cptArtisan);
    expect(await depot(`${orgA}/photo2.jpg`), "mission finie : il n'écrit plus chez l'agence").toBe(false);
  });

  it("une intervention en cours n'est jamais interrompue par une liste noire (RM-8.2.7)", async () => {
    await enTantQuePostgres();
    await db.query(
      `insert into public.incident_interventions (organization_id, incident_id, artisan_id,
         nature_travaux, statut)
       values ($1,$2,$3,'entretien_courant','en_cours')`,
      [orgB, incidentB, artisanBis]
    );
    await agir(gerantB);
    await expect(
      essai(`select public.artisan_blacklist_locale($1,$2,'Motif')`, [orgB, artisanBis])
    ).rejects.toThrow(/intervention/);
    await agir(sa);
    await expect(
      essai(`select public.artisan_decider_plateforme($1,'blacklist_globale','Motif')`,
        [artisanBis])
    ).rejects.toThrow(/intervention/);
  });
});
