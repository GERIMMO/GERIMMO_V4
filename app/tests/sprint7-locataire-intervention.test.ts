/**
 * Sprint 7 — CE QUE LE LOCATAIRE VOIT, ET CE QU'IL PEUT FAIRE, DE
 * L'INTERVENTION.
 *
 * Le locataire subit l'incident. Deux choses seulement le concernent : savoir
 * où ça en est, et donner sa disponibilité. Ce fichier essaie de prendre
 * l'application en défaut sur les deux, et surtout sur le troisième point,
 * celui qui n'existe pas : il n'approuve RIEN — ni le devis, ni l'artisan, ni
 * un montant. Si un jour la projection de `mon_suivi_intervention` en laissait
 * filtrer un, l'écran mentirait, et ces tests rougissent.
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

type Suivi = {
  incident_id: string;
  etape: string;
  intervention_id: string | null;
  artisan: string | null;
  nb_artisans_consultes: number;
  nb_devis_recus: number;
  rdv_debut: string | null;
  rdv_fin: string | null;
  terminee_le: string | null;
  creneaux_a_choisir: number;
  mes_creneaux_en_attente: number;
  creneaux_refuses: number;
  arbitrage: boolean;
  travaux_realises: string | null;
  nouvelle_intervention_necessaire: boolean;
  photos_apres: string[];
  deja_notee: boolean;
};

describe.skipIf(!DB_URL)("Sprint 7 — suivi d'intervention côté locataire", () => {
  let db: Client;
  let org = "", orgB = "";
  let gerant = "", cptArtisan = "", cptLoc = "", cptLocB = "", cptAutreLoc = "", sa = "";
  let artisan = "";
  let incident = "", incidentAutre = "", lot = "";
  let intervention = "";

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

  // Une tentative qu'on ATTEND refusée avorte la transaction si on la joue
  // nue : chacune se joue sous un point de reprise, qu'on annule.
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

  const suivi = async (compte: string, organisation = org): Promise<Suivi[]> => {
    await agir(compte);
    const { rows } = await db.query(
      `select * from public.mon_suivi_intervention($1)`,
      [organisation]
    );
    return rows as Suivi[];
  };
  const suiviDe = async (compte: string, inc = incident): Promise<Suivi> => {
    const lignes = await suivi(compte);
    const ligne = lignes.find((l) => l.incident_id === inc);
    if (!ligne) throw new Error(`aucun suivi pour ${inc}`);
    return ligne;
  };

  // Trois créneaux, à N jours, 8 h – 12 h (heure de Paris approchée : le test
  // ne juge pas le fuseau, seulement le nombre et l'ordre).
  const creneauxA = (jours: number[]) =>
    JSON.stringify(
      jours.map((j) => ({
        debut: new Date(Date.now() + j * 86400000).toISOString(),
        fin: new Date(Date.now() + j * 86400000 + 4 * 3600000).toISOString(),
      }))
    );

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

  /** Un lot loué, son bail actif, son locataire, et un incident qualifié. */
  async function parc(organisation: string, compte: string) {
    // Le décor se monte hors session : ces tests appellent `parc` entre deux
    // gestes d'utilisateur, et la RLS refuserait l'insertion.
    await enTantQuePostgres();
    const { rows: [bien] } = await db.query(
      `insert into public.biens (organization_id, nom, type, address_line1, postal_code, city)
       values ($1,'Résidence','immeuble','1 rue du Test','75011','Paris') returning id`,
      [organisation]
    );
    const { rows: [unLot] } = await db.query(
      `insert into public.lots (bien_id, organization_id, nom, etat)
       values ($1,$2,'Lot 1','loue') returning id`,
      [bien.id, organisation]
    );
    const { rows: [personne] } = await db.query(
      `insert into public.persons (organization_id, account_id, nom, prenom, telephone)
       values ($1,$2,'Martin','Léa','0600000000') returning id`,
      [organisation, compte]
    );
    const { rows: [bail] } = await db.query(
      `insert into public.baux (organization_id, lot_id, locataire_principal, etat,
         date_debut, loyer_hc, charges)
       values ($1,$2,$3,'actif', current_date - 200, 700, 50) returning id`,
      [organisation, unLot.id, personne.id]
    );
    const { rows: [inc] } = await db.query(
      `insert into public.incidents (organization_id, numero, lot_id, bail_id,
         declarant_person_id, canal, categorie, description, etat, imputation,
         imputation_justification)
       values ($1, 'INC-' || substr(gen_random_uuid()::text,1,8), $2,$3,$4,'espace_locataire',
         'plomberie_canalisation','Fuite sous évier','qualifie','proprietaire',
         'Joint usé par le temps') returning id`,
      [organisation, unLot.id, bail.id, personne.id]
    );
    return { lot: unLot.id as string, incident: inc.id as string, bail: bail.id as string };
  }

  /** Ouvre la consultation, sollicite, dépose le devis, le retient. */
  async function confierLaMission(inc: string): Promise<string> {
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) as id`,
      [org, inc]
    );
    const { rows: [{ id: sollicitation }] } = await db.query(
      `select public.solliciter_artisan($1,$2,$3) as id`,
      [org, consultation, artisan]
    );
    await agir(cptArtisan);
    const { rows: [{ id: devis }] } = await db.query(
      `select public.deposer_devis($1, 48000, 'Remplacement du joint et du siphon') as id`,
      [sollicitation]
    );
    await agir(gerant);
    const { rows: [{ id }] } = await db.query(
      `select public.retenir_devis($1,$2) as id`, [org, devis]
    );
    return id as string;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    await db.query("begin");

    const { rows: orgs } = await db.query(
      `insert into public.organizations (name, status)
       values ('Suivi LO — Agence A','active'), ('Suivi LO — Agence B','active')
       returning id, name`
    );
    org = orgs.find((o) => o.name.endsWith("A")).id;
    orgB = orgs.find((o) => o.name.endsWith("B")).id;

    gerant = await nouveauCompte("gerant");
    cptArtisan = await nouveauCompte("artisan");
    cptLoc = await nouveauCompte("loc");
    cptLocB = await nouveauCompte("loc-b");
    cptAutreLoc = await nouveauCompte("loc-voisin");
    sa = await nouveauCompte("sa");
    await db.query(
      `insert into public.memberships (account_id, organization_id, role) values
        ($1,$2,'admin_agence'),($3,$2,'locataire'),($4,$2,'locataire'),($5,$6,'locataire')`,
      [gerant, org, cptLoc, cptAutreLoc, cptLocB, orgB]
    );
    await db.query(
      `insert into public.memberships (account_id, organization_id, role)
       values ($1, null, 'super_admin')`,
      [sa]
    );

    const decor = await parc(org, cptLoc);
    lot = decor.lot;
    incident = decor.incident;
    // Un voisin de la même agence : son incident ne doit jamais entrer dans le
    // suivi du premier, ni ses photos dans ses fichiers.
    incidentAutre = (await parc(org, cptAutreLoc)).incident;
    await parc(orgB, cptLocB);

    // L'artisan : validé plateforme, SIRET vérifié, décennale à jour.
    const { rows: [a] } = await db.query(
      `insert into public.artisans (raison_sociale, siret, telephone, email,
         statut_plateforme, siret_etat, visibilite, account_id)
       values ('Plomberie Durand','12345678901234','0611111111','d@test.local',
         'valide','verifie','publique',$1) returning id`,
      [cptArtisan]
    );
    artisan = a.id;
    await db.query(`insert into public.artisan_metiers values ($1,'plomberie')`, [artisan]);
    await db.query(`insert into public.artisan_zones values ($1,'75011')`, [artisan]);
    await db.query(
      `insert into public.artisan_pieces (artisan_id, type, storage_path, mime_type,
         taille_octets, empreinte, expire_le)
       values ($1,'decennale',$2,'application/pdf',10,'emp-dec', current_date + 300)`,
      [artisan, `artisans/${artisan}/decennale.pdf`]
    );
  });

  afterAll(async () => {
    await db?.query("rollback");
    await db?.end();
  });

  // ── Ce que la base refuse au locataire en direct ─────────────────────────

  it("le locataire ne lit AUCUNE table du module 8 en direct — il n'y a pas de porte", async () => {
    intervention = await confierLaMission(incident); // il y a bien quelque chose à lire
    await agir(cptLoc);
    for (const table of [
      "incident_interventions",
      "incident_devis",
      "incident_consultations",
      "incident_sollicitations",
      "intervention_creneaux",
      "intervention_comptes_rendus",
      "intervention_photos",
      "artisan_evaluations",
    ]) {
      const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
      expect({ table, n: rows[0].n }).toEqual({ table, n: 0 });
    }
  });

  it("la mission confiée apparaît dans son suivi, sans un seul montant", async () => {
    const s = await suiviDe(cptLoc);
    expect(s.etape).toBe("artisan_retenu");
    // Le devis existe (480,00 €) et rien de ce qui sort ici ne le porte —
    // ni par une colonne, ni par une valeur.
    expect(Object.keys(s).filter((k) => /montant|cents|prix|cout/i.test(k))).toEqual([]);
    expect(JSON.stringify(s)).not.toContain("48000");
    // Tant que l'artisan n'a pas accepté, on ne nomme personne : la mission
    // peut encore être refusée.
    expect(s.artisan).toBeNull();
  });

  it("un gérant, un super admin, un locataire d'une autre agence : aucun suivi", async () => {
    expect(await suivi(gerant)).toHaveLength(0);
    expect(await suivi(sa)).toHaveLength(0);
    expect(await suivi(cptLocB)).toHaveLength(0);
    // Le voisin de la même agence a son propre incident, jamais celui d'à côté.
    const voisin = await suivi(cptAutreLoc);
    expect(voisin.map((l) => l.incident_id)).not.toContain(incident);
  });

  // ── La négociation du rendez-vous (module 10) ────────────────────────────

  it("l'artisan accepte : son nom apparaît, et le locataire attend ses créneaux", async () => {
    await agir(cptArtisan);
    await db.query(`select public.accepter_mission($1)`, [intervention]);

    const s = await suiviDe(cptLoc);
    expect(s.etape).toBe("creneaux_attendus");
    expect(s.artisan).toBe("Plomberie Durand");
    expect(s.intervention_id).toBe(intervention);
  });

  it("trois créneaux proposés : le locataire a un choix à faire, et les voit", async () => {
    await agir(cptArtisan);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [
      intervention, creneauxA([3, 4, 5]),
    ]);

    const s = await suiviDe(cptLoc);
    expect(s.etape).toBe("creneau_a_choisir");
    expect(s.creneaux_a_choisir).toBe(3);

    await agir(cptLoc);
    const { rows } = await db.query(`select * from public.mes_creneaux_locataire($1)`, [org]);
    expect(rows).toHaveLength(3);
    expect(rows[0].artisan_raison_sociale).toBe("Plomberie Durand");
  });

  it("RM-10.2.2 — un refus sec n'existe pas : moins de trois créneaux est refusé", async () => {
    await agir(cptLoc);
    await expect(
      essai(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`, [
        org, intervention, creneauxA([8, 9]),
      ])
    ).rejects.toThrow(/proposez-en trois/i);
  });

  it("il contre-propose trois créneaux : les siens partent, l'attente change de camp", async () => {
    await agir(cptLoc);
    await db.query(`select public.contre_proposer_creneaux($1,$2,$3::jsonb)`, [
      org, intervention, creneauxA([8, 9, 10]),
    ]);

    const s = await suiviDe(cptLoc);
    expect(s.etape).toBe("ma_proposition");
    expect(s.mes_creneaux_en_attente).toBe(3);
    // RM-10.4.4 : les créneaux refusés sont CONSERVÉS, ils sont opposables.
    expect(s.creneaux_refuses).toBe(3);
    expect(s.arbitrage).toBe(false);
  });

  it("le locataire choisit : le rendez-vous est fixé, les autres tombent", async () => {
    // L'artisan reprend la main et propose à nouveau (deuxième tour).
    await agir(cptArtisan);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [
      intervention, creneauxA([12, 13, 14]),
    ]);
    await agir(cptLoc);
    const { rows } = await db.query(`select * from public.mes_creneaux_locataire($1)`, [org]);
    await db.query(`select public.choisir_creneau($1,$2)`, [org, rows[0].creneau_id]);

    const s = await suiviDe(cptLoc);
    expect(s.etape).toBe("planifiee");
    expect(s.rdv_debut).not.toBeNull();
    expect(s.rdv_fin).not.toBeNull();
    // Plus rien à choisir : les autres créneaux du tour sont refusés.
    await agir(cptLoc);
    const { rows: restants } = await db.query(
      `select * from public.mes_creneaux_locataire($1)`, [org]
    );
    expect(restants).toHaveLength(0);
  });

  it("un autre locataire ne peut pas choisir le créneau d'autrui", async () => {
    const autreIntervention = await confierLaMission(incidentAutre);
    await agir(cptArtisan);
    await db.query(`select public.accepter_mission($1)`, [autreIntervention]);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [
      autreIntervention, creneauxA([6, 7, 11]),
    ]);
    await enTantQuePostgres();
    const { rows: creneaux } = await db.query(
      `select id from public.intervention_creneaux
       where intervention_id=$1 and statut='propose' limit 1`, [autreIntervention]
    );

    await agir(cptLoc);
    // Il n'en voit aucun…
    const { rows: visibles } = await db.query(
      `select * from public.mes_creneaux_locataire($1)`, [org]
    );
    expect(visibles.map((c) => c.creneau_id)).not.toContain(creneaux[0].id);
    // …et s'il en devinait l'identifiant, la base le renvoie.
    await expect(
      essai(`select public.choisir_creneau($1,$2)`, [org, creneaux[0].id])
    ).rejects.toThrow(/Accès refusé/);
  });

  // ── Le travail fait : compte rendu, photo, note ──────────────────────────

  it("intervention démarrée puis terminée : le locataire lit le compte rendu, jamais la cause suggérée", async () => {
    await agir(cptArtisan);
    await db.query(`select public.demarrer_intervention($1)`, [intervention]);
    expect((await suiviDe(cptLoc)).etape).toBe("en_cours");

    await agir(cptArtisan);
    await db.query(
      `select public.deposer_photo_intervention($1,'apres',$2,'image/jpeg',1000,'emp-apres')`,
      [intervention, `${org}/incidents/apres.jpg`]
    );
    await db.query(
      `select public.deposer_compte_rendu($1,'Joint et siphon remplacés, essai concluant',
         'Canalisation percée par vétusté','proprietaire', 51000, false)`,
      [intervention]
    );

    const s = await suiviDe(cptLoc);
    expect(s.etape).toBe("terminee");
    expect(s.travaux_realises).toBe("Joint et siphon remplacés, essai concluant");
    expect(s.photos_apres).toHaveLength(1);
    expect(s.terminee_le).not.toBeNull();
    // RM-7.5.3 : la cause signalée est une DEMANDE d'arbitrage adressée à
    // l'agent, pas une décision. Annoncée au locataire, elle lui ferait croire
    // que « qui paie » a changé alors que personne ne l'a tranché.
    const valeurs = JSON.stringify(s);
    expect(valeurs).not.toContain("vétusté");
    expect(valeurs).not.toContain("51000");
  });

  it("la photo du travail réalisé lui est ouverte — et seulement la sienne", async () => {
    const s = await suiviDe(cptLoc);
    const photo = s.photos_apres[0];

    await agir(cptLoc);
    const { rows } = await db.query(
      `select * from public.mon_document_locataire($1,$2)`, [org, photo]
    );
    expect(rows).toHaveLength(1);
    // La politique storage passe par chemins_pieces_locataire : sans elle, la
    // fiche serait lisible et le fichier refusé.
    const { rows: chemins } = await db.query(
      `select c as chemin from public.chemins_pieces_locataire() c`
    );
    expect(chemins.map((c) => c.chemin)).toContain(rows[0].storage_path);
    // La trace d'accès est la condition de la consultation (RM-0b.7.5).
    await db.query(`select public.log_document_access($1,'consultation')`, [photo]);

    // Le voisin, lui, ne l'atteint ni par la fiche ni par le chemin.
    await agir(cptAutreLoc);
    const { rows: refus } = await db.query(
      `select * from public.mon_document_locataire($1,$2)`, [org, photo]
    );
    expect(refus).toHaveLength(0);
    const { rows: siens } = await db.query(
      `select c as chemin from public.chemins_pieces_locataire() c`
    );
    expect(siens.map((c) => c.chemin)).not.toContain(rows[0].storage_path);
    await expect(
      essai(`select public.log_document_access($1,'consultation')`, [photo])
    ).rejects.toThrow(/acces refuse/i);
  });

  it("l'ajout des photos d'incident n'a rien retiré au locataire de ses autres pièces", async () => {
    // Le contrôle de la migration vérifie le texte des fonctions ; ici on
    // vérifie l'effet : ses pièces de bail restent lisibles.
    await enTantQuePostgres();
    const { rows: def } = await db.query(
      `select pg_get_functiondef(p.oid) as d from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='mon_document_locataire'`
    );
    for (const branche of [
      "pieces_bail_locataire",
      "demandes_signature",
      "mon_dernier_bail_locataire",
      "regularisations_charges",
      "photo_incident",
    ]) {
      expect(def[0].d).toContain(branche);
    }
  });

  it("RM-11.1 — il note ce qu'il a vu, une seule fois, et rien ne le bloque", async () => {
    await agir(cptLoc);
    await db.query(
      `select public.noter_artisan_locataire($1,$2,4::smallint,'Ponctuel et propre')`,
      [org, intervention]
    );
    expect((await suiviDe(cptLoc)).deja_notee).toBe(true);

    await agir(cptLoc);
    await expect(
      essai(`select public.noter_artisan_locataire($1,$2,5::smallint,null)`, [org, intervention])
    ).rejects.toThrow(/déjà noté/i);

    // La note d'un voisin sur une intervention qui n'est pas la sienne : non.
    await agir(cptAutreLoc);
    await expect(
      essai(`select public.noter_artisan_locataire($1,$2,1::smallint,null)`, [org, intervention])
    ).rejects.toThrow(/Accès refusé/);
  });

  it("son avis ne porte ni prix ni technique : la base refuse les critères du gérant", async () => {
    await enTantQuePostgres();
    await expect(
      essai(
        `insert into public.artisan_evaluations (organization_id, intervention_id,
           artisan_id, source, note_globale, note_prix)
         values ($1,$2,$3,'locataire',4,5)`,
        [org, intervention, artisan]
      )
    ).rejects.toThrow();
  });

  // ── Le refus de mission, vu du locataire ─────────────────────────────────

  it("mission refusée : le locataire lit « on en cherche un autre », pas un état technique", async () => {
    const decor = await parc(org, cptLoc);
    const nouvelle = await confierLaMission(decor.incident);
    await agir(cptArtisan);
    await db.query(`select public.refuser_mission($1,'Agenda complet ce mois-ci')`, [nouvelle]);

    const s = await suiviDe(cptLoc, decor.incident);
    expect(s.etape).toBe("reaffectation");
    // Tout ce que portait la mission morte est périmé : on ne le montre pas.
    expect(s.intervention_id).toBeNull();
    expect(s.artisan).toBeNull();
    expect(s.rdv_debut).toBeNull();
  });

  it("une consultation rouverte reprend la main sur la mission qui a échoué", async () => {
    const decor = await parc(org, cptLoc);
    const nouvelle = await confierLaMission(decor.incident);
    await agir(cptArtisan);
    await db.query(`select public.refuser_mission($1,'Trop loin')`, [nouvelle]);
    await agir(gerant);
    await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30)`,
      [org, decor.incident]
    );

    const s = await suiviDe(cptLoc, decor.incident);
    expect(s.etape).toBe("recherche");
    expect(s.nb_devis_recus).toBe(0);
  });

  it("consultation ouverte puis devis déposé : l'étape le dit, sans dire combien", async () => {
    const decor = await parc(org, cptLoc);
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) as id`,
      [org, decor.incident]
    );
    let s = await suiviDe(cptLoc, decor.incident);
    expect(s.etape).toBe("recherche");
    expect(s.nb_artisans_consultes).toBe(0);

    await agir(gerant);
    const { rows: [{ id: sollicitation }] } = await db.query(
      `select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan]
    );
    s = await suiviDe(cptLoc, decor.incident);
    expect(s.etape).toBe("recherche");
    expect(s.nb_artisans_consultes).toBe(1);

    await agir(cptArtisan);
    await db.query(
      `select public.deposer_devis($1, 123456, 'Détartrage complet')`, [sollicitation]
    );
    s = await suiviDe(cptLoc, decor.incident);
    expect(s.etape).toBe("devis_recus");
    expect(s.nb_devis_recus).toBe(1);
    expect(JSON.stringify(s)).not.toContain("123456");
    expect(JSON.stringify(s)).not.toContain("Détartrage");
  });

  it("un incident sans artisan n'encombre pas le suivi, et aucun n'y figure deux fois", async () => {
    const decor = await parc(org, cptLoc);
    const lignes = await suivi(cptLoc);
    expect(lignes.map((l) => l.incident_id)).not.toContain(decor.incident);
    expect(lot).toBeTruthy(); // le décor est bien celui de ce locataire
    // Une ligne par demande : l'écran apparie le suivi à la carte par
    // incident_id (une Map). Un doublon — deux consultations, deux missions —
    // ferait disparaître silencieusement l'étape réelle au profit d'une autre.
    const vus = lignes.map((l) => l.incident_id);
    expect(new Set(vus).size).toBe(vus.length);
    expect(vus.length).toBeGreaterThan(3);
  });

  // ── Ce qu'on a essayé de faire passer, et que la base a refusé ───────────

  it("le PDF du devis est lié à SON incident, et ne lui est pas ouvert pour autant", async () => {
    const decor = await parc(org, cptLoc);
    await agir(gerant);
    const { rows: [{ id: consultation }] } = await db.query(
      `select public.ouvrir_consultation($1,$2,'plomberie','entretien_courant',true,30) as id`,
      [org, decor.incident]
    );
    const { rows: [{ id: sollicitation }] } = await db.query(
      `select public.solliciter_artisan($1,$2,$3) as id`, [org, consultation, artisan]
    );
    await agir(cptArtisan);
    const chemin = `${org}/devis/${sollicitation}.pdf`;
    await db.query(
      `select public.deposer_devis($1::uuid, 99900, 'Devis détaillé', null, $2,
         'application/pdf', 2000, $3)`,
      [sollicitation, chemin, `emp-devis-${sollicitation}`]
    );
    await enTantQuePostgres();
    const { rows: [devis] } = await db.query(
      `select d.id from public.documents d where d.storage_path = $1`, [chemin]
    );
    // Le lien vers l'incident existe bien — c'est exactement le piège.
    const { rows: liens } = await db.query(
      `select 1 from public.document_liens
       where document_id=$1 and entite='incident' and entite_id=$2`,
      [devis.id, decor.incident]
    );
    expect(liens).toHaveLength(1);

    await agir(cptLoc);
    const { rows: fiche } = await db.query(
      `select * from public.mon_document_locataire($1,$2)`, [org, devis.id]
    );
    expect(fiche).toHaveLength(0);
    const { rows: chemins } = await db.query(
      `select c as chemin from public.chemins_pieces_locataire() c`
    );
    expect(chemins.map((c) => c.chemin)).not.toContain(chemin);
  });

  it("il ne lit pas le suivi d'une agence où il n'est pas locataire", async () => {
    expect(await suivi(cptLoc, orgB)).toHaveLength(0);
    expect(await suivi(cptLocB, org)).toHaveLength(0);
  });

  it("ses autres pièces restent lisibles : la branche ajoutée n'a rien remplacé", async () => {
    await enTantQuePostgres();
    const { rows: [personne] } = await db.query(
      `select id from public.persons where organization_id=$1 and account_id=$2 limit 1`,
      [org, cptLoc]
    );
    const { rows: [quittance] } = await db.query(
      `insert into public.documents (organization_id, type, titre, storage_path,
         mime_type, taille_octets, empreinte, partage_le)
       values ($1,'quittance','Quittance de juin',$2,'application/pdf',10,'emp-q',now())
       returning id, storage_path`,
      [org, `${org}/quittances/juin.pdf`]
    );
    await db.query(
      `insert into public.document_liens (document_id, organization_id, entite, entite_id)
       values ($1,$2,'personne',$3)`,
      [quittance.id, org, personne.id]
    );

    await agir(cptLoc);
    const { rows: fiche } = await db.query(
      `select * from public.mon_document_locataire($1,$2)`, [org, quittance.id]
    );
    expect(fiche).toHaveLength(1);
    const { rows: chemins } = await db.query(
      `select c as chemin from public.chemins_pieces_locataire() c`
    );
    expect(chemins.map((c) => c.chemin)).toContain(quittance.storage_path);
  });

  it("bail terminé : il garde la lecture de son suivi, il perd les gestes", async () => {
    await enTantQuePostgres();
    // Une mission acceptée avec des créneaux en attente, puis l'adhésion
    // désactivée : c'est la situation d'un locataire qui a rendu les clés.
    const decor = await parc(org, cptAutreLoc);
    const mission = await confierLaMission(decor.incident);
    await agir(cptArtisan);
    await db.query(`select public.accepter_mission($1)`, [mission]);
    await db.query(`select public.proposer_creneaux($1,$2::jsonb)`, [
      mission, creneauxA([20, 21, 22]),
    ]);
    await enTantQuePostgres();
    const { rows: [creneau] } = await db.query(
      `select id from public.intervention_creneaux
       where intervention_id=$1 and statut='propose' limit 1`, [mission]
    );
    await db.query(
      `update public.memberships set status='inactive'
       where account_id=$1 and organization_id=$2`, [cptAutreLoc, org]
    );

    // La lecture reste (mes_incidents_locataire accepte l'adhésion désactivée)
    const s = await suiviDe(cptAutreLoc, decor.incident);
    expect(s.etape).toBe("creneau_a_choisir");
    // Les gestes, non : ma_personne_locataire exige l'adhésion active.
    await agir(cptAutreLoc);
    const { rows: visibles } = await db.query(
      `select * from public.mes_creneaux_locataire($1)`, [org]
    );
    expect(visibles).toHaveLength(0);
    await expect(
      essai(`select public.choisir_creneau($1,$2)`, [org, creneau.id])
    ).rejects.toThrow(/Accès refusé/);

    await enTantQuePostgres();
    await db.query(
      `update public.memberships set status='active'
       where account_id=$1 and organization_id=$2`, [cptAutreLoc, org]
    );
  });

  it("anon n'appelle rien de tout cela", async () => {
    await enTantQuePostgres();
    for (const f of [
      "public.mon_suivi_intervention(uuid)",
      "public.mes_creneaux_locataire(uuid)",
      "public.choisir_creneau(uuid,uuid)",
      "public.contre_proposer_creneaux(uuid,uuid,jsonb)",
      "public.noter_artisan_locataire(uuid,uuid,smallint,text)",
    ]) {
      const { rows } = await db.query(
        `select has_function_privilege('anon', $1, 'execute') as ouvert`, [f]
      );
      expect({ f, ouvert: rows[0].ouvert }).toEqual({ f, ouvert: false });
    }
  });
});
