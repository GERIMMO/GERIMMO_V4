/**
 * ARTISAN : RELANCE D'UNE FACTURE RESTÉE SANS RÈGLEMENT, ET RENDEZ-VOUS MANQUÉ CONSIGNÉ — audit palier 1 du
 * 22/11/2026, P2-04 (référentiel, module 10, RM-10.5.3 : « les absences sont attribuées et tracées »).
 *
 * Ces tests tiennent, sous les vrais rôles et par les vraies fonctions :
 *  1. RELANCE : pas avant 30 jours après le dépôt, 15 jours entre deux relances, jamais sur une facture refusée ou
 *     réglée en totalité ; une ligne à la chronologie, UNE alerte ouverte chez le gestionnaire, qui se ferme
 *     d'elle-même au règlement total ou au refus ; seul l'artisan de la facture relance ;
 *  2. RENDEZ-VOUS MANQUÉ : seulement sur un rendez-vous confirmé dont l'heure est passée ; l'artisan ne peut dire que
 *     « le locataire était absent », le gestionnaire l'un ou l'autre ; le rendez-vous tombe (mission « acceptée »,
 *     créneau caduc) ; ligne à la chronologie ; alerte au gestionnaire quand c'est l'artisan qui le dit, fermée au
 *     rendez-vous suivant ; chacun ne lit que ce qui le concerne, et la précision libre n'est lue que par son auteur
 *     et le gestionnaire ;
 *  3. la table est fermée ; la migration se rejoue ; son retour ne supprime ni table, ni colonne, ni ligne.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. Le dernier bloc rejoue du DDL : le fichier
 * tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122235800_artisan_relance_facture_rdv_manque";
const CODE = "20261122235800";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

const FONCTIONS = [
  "public.mes_relances_factures()",
  "public.relancer_ma_facture(uuid)",
  "public.consigner_rdv_manque_artisan(uuid,text)",
  "public.consigner_rdv_manque(uuid,uuid,text,text)",
  "public.rdv_manques_de_ma_mission(uuid)",
  "public.mes_rdv_manques_artisan()",
  "public.mes_rdv_manques_locataire(uuid)",
];
const INTERNES = [
  "public.relance_etat_facture(uuid)",
  "public.rdv_manque_consigner_interne(uuid,text,text,text)",
  "public.fermer_alerte_relance_facture()",
  "public.fermer_alerte_rdv_manque()",
];

describe("relance de facture et rendez-vous manqué — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/artisan-relance-rdv-manque-base.test.ts"');
  });

  it("elle cite la fonction du jour de Paris : son retour précède ceux des migrations plus anciennes", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("public.aujourdhui_paris()");
    expect(sql).not.toMatch(/current_date|poser_gardes_abonnement|poser_gardes_diagnostic_artisan/i);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // Elle n'appelle aucune fonction du lot « règlement » (20261014610000), dont le retour refuserait alors de se jouer.
    expect(sql).not.toMatch(/etat_facture_intervention|enregistrer_reglement_facture|retirer_reglement_facture|mes_reglements_factures_artisan/);
    // Aucun e-mail : la migration ne touche ni la file d'envoi ni les intentions de notification.
    expect(sql).not.toMatch(/notification_intentions|capturer_notification\(|emails?_/i);
    const chaine = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8").split("Ordre complet si tout doit être défait :")[1] ?? "";
    const codes = [...chaine.split("puis `500000`")[0].matchAll(/`(\d{14})`/g)].map((m) => m[1]);
    const rang = codes.indexOf(CODE);
    expect(rang).toBeGreaterThanOrEqual(0);
    expect(codes.slice(0, rang).every((c) => c > CODE)).toBe(true);
    expect(codes[rang + 1]).toBe("20261122235500");
  });

  it("le retour ne supprime ni table, ni colonne, ni ligne", () => {
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop table|drop column|truncate|delete from public\./i);
    for (const f of [...FONCTIONS, ...INTERNES]) expect(retour.replace(/\s+/g, ""), f).toContain(`dropfunctionifexists${f.replace(/\s+/g, "")}`);
    expect(retour).toContain(`delete from supabase_migrations.schema_migrations where version = '${CODE}'`);
  });
});

describe.skipIf(!url)("relance de facture et rendez-vous manqué (avec base)", () => {
  let db: Client;
  let orgA = "", orgB = "", gerantA = "", gerantB = "", cptLoc = "", cptAutreLoc = "", cptArtisan = "", cptAutreArtisan = "";
  let artisan = "", incident = "", intervention = "", numeroIncident = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
  const unique = () => Math.random().toString(36).slice(2, 10);
  const un = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];
  async function compte(prefixe: string) {
    const c = await id(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
        $1||gen_random_uuid()||'@test.local','x',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','') returning id`, [prefixe]);
    await db.query("insert into auth.sessions(id,user_id) values($1,$1)", [c]);
    return c;
  }
  async function agir(compteId: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(compteId ? { sub: compteId, role, aal: "aal2", session_id: compteId } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };
  const jour = async (decalage = 0) => { await base(); return String((await un("select to_char(public.aujourdhui_paris() + $1::int, 'DD/MM/YYYY') j", [decalage])).j); };

  /** L'artisan dépose une facture par la vraie fonction, pièce comprise ; `ilYA` la vieillit de tant de jours. */
  async function deposer(numero: string, ilYA = 0, montant = 100000) {
    await agir(cptArtisan);
    const chemin = `${orgA}/factures-artisan/${intervention}/${randomUUID()}.pdf`;
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)", [chemin, cptArtisan]);
    const f = String((await un("select public.deposer_facture_artisan($1,$2,$3,null,$4,'application/pdf',10,$5) f", [intervention, numero, montant, chemin, `emp-${unique()}`])).f);
    await base();
    if (ilYA) await db.query("update public.intervention_factures set deposee_le = now() - make_interval(days => $2) where id=$1", [f, ilYA]);
    return f;
  }
  const relancer = async (facture: string, parCompte = cptArtisan) => {
    await agir(parCompte);
    return refus("select public.relancer_ma_facture($1)", [facture]);
  };
  const etatRelance = async (facture: string) => {
    await base();
    return un("select relances, relancee_le is not null relancee from public.intervention_factures where id=$1", [facture]);
  };
  const alertesRelance = async (facture: string) => {
    await base();
    return (await db.query("select statut::text, closed_action, titre, details->>'libelle' libelle, (details->>'relance')::int relance from public.alerts where organization_id=$1 and type='facture_artisan_relancee' and details->>'facture_id'=$2 order by created_at, (details->>'relance')::int", [orgA, facture])).rows;
  };
  const mesRelances = async () => {
    await agir(cptArtisan);
    return (await db.query("select facture_id, relances, relancable, to_char(relance_possible_le,'DD/MM/YYYY') possible from public.mes_relances_factures()")).rows;
  };

  /** Met la mission « planifiée », avec un rendez-vous confirmé décalé de tant d'heures par rapport à maintenant. */
  async function planifier(heures: number) {
    await base();
    await db.query("update public.incident_interventions set statut='planifiee', demarree_le=null, debut_prevu = now() + make_interval(hours => $2), fin_prevue = now() + make_interval(hours => $2 + 1) where id=$1", [intervention, heures]);
    await db.query("update public.intervention_creneaux set statut='caduc' where intervention_id=$1 and statut='retenu'", [intervention]);
    await db.query(`insert into public.intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin,statut)
      select organization_id, id, 'artisan', 1, debut_prevu, fin_prevue, 'retenu' from public.incident_interventions where id=$1`, [intervention]);
  }
  const mission = async () => {
    await base();
    return un(`select i.statut::text, i.debut_prevu, i.fin_prevue,
        (select count(*)::int from public.intervention_creneaux c where c.intervention_id=i.id and c.statut='retenu') retenus,
        (select count(*)::int from public.intervention_creneaux c where c.intervention_id=i.id and c.statut='caduc') caducs
      from public.incident_interventions i where i.id=$1`, [intervention]);
  };
  const manques = async () => {
    await base();
    return (await db.query("select absent, consigne_role, consigne_par, note, rdv_debut from public.intervention_rdv_manques where intervention_id=$1 order by rdv_debut", [intervention])).rows;
  };
  const alertesRdv = async () => {
    await base();
    return (await db.query("select statut::text, closed_action, titre, details->>'libelle' libelle, details->>'absent' absent from public.alerts where organization_id=$1 and type='rdv_manque' and details->>'intervention_id'=$2 order by created_at", [orgA, intervention])).rows;
  };
  const parArtisan = async (note: string | null = null, parCompte = cptArtisan) => {
    await agir(parCompte);
    return refus("select public.consigner_rdv_manque_artisan($1,$2)", [intervention, note]);
  };
  const parGestionnaire = async (absent: string | null, note: string | null = null, parCompte = gerantA, espace = orgA) => {
    await agir(parCompte);
    return refus("select public.consigner_rdv_manque($1,$2,$3,$4)", [espace, intervention, absent, note]);
  };

  beforeEach(async () => {
    await db.query("begin");
    orgA = await id("insert into public.organizations(name,status) values('Agence fictive des relances A','active') returning id");
    orgB = await id("insert into public.organizations(name,status) values('Agence fictive des relances B','active') returning id");
    gerantA = await compte("gerant-a"); gerantB = await compte("gerant-b"); cptLoc = await compte("locataire"); cptAutreLoc = await compte("autre-locataire");
    cptArtisan = await compte("artisan"); cptAutreArtisan = await compte("autre-artisan");
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,$2,'locataire'),($6,$2,'locataire')`, [gerantA, orgA, gerantB, orgB, cptLoc, cptAutreLoc]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Résidence fictive','immeuble','1 rue du Test','75011','Paris') returning id", [orgA]);
    const lot = await id("insert into public.lots(bien_id,organization_id,nom,etat) values($1,$2,'Lot 1','loue') returning id", [bien, orgA]);
    const lot2 = await id("insert into public.lots(bien_id,organization_id,nom,etat) values($1,$2,'Lot 2','loue') returning id", [bien, orgA]);
    const personne = await id("insert into public.persons(organization_id,account_id,nom,prenom,telephone) values($1,$2,'Martin','Léa','0600000000') returning id", [orgA, cptLoc]);
    const autre = await id("insert into public.persons(organization_id,account_id,nom,prenom,telephone) values($1,$2,'Durand','Noé','0600000001') returning id", [orgA, cptAutreLoc]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50) returning id", [orgA, lot, personne]);
    await db.query("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50)", [orgA, lot2, autre]);
    numeroIncident = `INC-${unique()}`;
    incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,$5,$2,$3,$4,'espace_locataire','plomberie_canalisation','Fuite sous évier','qualifie','proprietaire','Joint usé par le temps') returning id`, [orgA, lot, bail, personne, numeroIncident]);
    artisan = await id(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Plomberie fictive',lpad((floor(random()*99999999999999))::text,14,'0'),'0611111111','valide','verifie') returning id`, [cptArtisan]);
    await db.query(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Autre artisan fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0622222222','valide','verifie')`, [cptAutreArtisan]);
    const consultation = await id("insert into public.incident_consultations(organization_id,incident_id,metier,nature_travaux,statut) values($1,$2,'plomberie','entretien_courant','close') returning id", [orgA, incident]);
    const sollicitation = await id("insert into public.incident_sollicitations(organization_id,consultation_id,incident_id,artisan_id,statut) values($1,$2,$3,$4,'retenue') returning id", [orgA, consultation, incident, artisan]);
    const devis = await id(`insert into public.incident_devis(organization_id,sollicitation_id,incident_id,artisan_id,montant_ttc_cents,description,valide_jusqu_au,statut)
      values($1,$2,$3,$4,100000,'Remplacement du joint',current_date+30,'retenu') returning id`, [orgA, sollicitation, incident, artisan]);
    intervention = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,devis_id,nature_travaux,statut,acceptee_le,demarree_le)
      values($1,$2,$3,$4,'entretien_courant','en_cours',now(),now()) returning id`, [orgA, incident, artisan, devis]);
    await base();
  });

  /** Ce qu'il faut pour qu'une facture puisse être déposée : photo « après » et compte rendu. */
  async function terminerLesTravaux() {
    await base();
    const cheminPhoto = `${orgA}/apres-${unique()}.jpg`;
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)", [cheminPhoto]);
    const photo = await id("insert into public.documents(organization_id,type,storage_path,mime_type,taille_octets,empreinte) values($1,'photo_incident',$2,'image/jpeg',10,$3) returning id", [orgA, cheminPhoto, `emp-${unique()}`]);
    await db.query("insert into public.intervention_photos(organization_id,intervention_id,document_id,moment) values($1,$2,$3,'apres')", [orgA, intervention, photo]);
    await agir(cptArtisan);
    await db.query("select public.deposer_compte_rendu($1,'Joint remplacé',null,null,100000,false)", [intervention]);
    await base();
  }

  // ── 1. La relance d'une facture ─────────────────────────────────────────────────────────────────────────────────

  it("pas de relance avant 30 jours : la base dit à partir de quand, et l'artisan le lit", async () => {
    await terminerLesTravaux();
    const f = await deposer("F-2026-40");
    expect(await relancer(f)).toBe(`Une facture se relance à partir de 30 jours après son dépôt : vous pourrez relancer celle-ci le ${await jour(30)}`);
    expect(await etatRelance(f)).toEqual({ relances: 0, relancee: false });
    expect(await mesRelances()).toEqual([{ facture_id: f, relances: 0, relancable: false, possible: await jour(30) }]);
    expect(await alertesRelance(f)).toEqual([]);
  });

  it("après 30 jours : la relance s'écrit au dossier, ouvre UNE alerte, et la suivante attend 15 jours", async () => {
    await terminerLesTravaux();
    const f = await deposer("F-2026-41", 31);
    expect((await mesRelances())[0]).toMatchObject({ facture_id: f, relancable: true });
    expect(await relancer(f)).toBe("");
    expect(await etatRelance(f)).toEqual({ relances: 1, relancee: true });

    await base();
    const fil = (await db.query("select acteur_account_id, details from public.incident_evenements where incident_id=$1 and type='facture_relancee'", [incident])).rows;
    expect(fil).toEqual([{ acteur_account_id: cptArtisan, details: { facture_id: f, numero: "F-2026-41", intervention_id: intervention, relance: 1, jours_depuis_depot: 31, etat: "deposee", reste_cents: 100000 } }]);
    const depot = await jour(-31);
    expect(await alertesRelance(f)).toEqual([{
      statut: "ouverte", closed_action: null, titre: `Facture relancée par l'artisan — ${numeroIncident}`, relance: 1,
      libelle: `Plomberie fictive vous relance pour sa facture n° F-2026-41 déposée le ${depot}, pas encore contrôlée.`,
    }]);

    // Le même jour, puis 14 jours plus tard : trop tôt. Au quinzième jour : la relance suivante passe.
    expect(await relancer(f)).toBe(`Vous avez relancé cette facture le ${await jour()} : la relance suivante sera possible le ${await jour(15)}`);
    expect((await mesRelances())[0]).toMatchObject({ relancable: false, possible: await jour(15) });
    await base();
    await db.query("update public.intervention_factures set relancee_le = now() - interval '14 days' where id=$1", [f]);
    expect(await relancer(f)).toMatch(/la relance suivante sera possible le/);
    await base();
    await db.query("update public.intervention_factures set relancee_le = now() - interval '15 days' where id=$1", [f]);
    expect(await relancer(f)).toBe("");
    expect(await etatRelance(f)).toEqual({ relances: 2, relancee: true });
    const alertes = await alertesRelance(f);
    expect(alertes.map((a) => [a.relance, a.statut, a.closed_action])).toEqual([
      [1, "fermee", "Remplacée par une nouvelle relance de l'artisan"],
      [2, "ouverte", null],
    ]);
  });

  it("facture validée : la relance dit le reste à régler ; réglée en totalité, l'alerte se ferme et plus rien ne se relance", async () => {
    await terminerLesTravaux();
    const f = await deposer("F-2026-42", 40);
    await agir(gerantA);
    await db.query("select public.valider_facture_artisan($1,$2,'Pièce et montant vérifiés')", [orgA, f]);
    await db.query("select public.enregistrer_reglement_facture($1,$2,30000,public.aujourdhui_paris(),'virement',null,gen_random_uuid())", [orgA, f]);
    expect(await relancer(f)).toBe("");
    const [alerte] = await alertesRelance(f);
    expect(alerte.statut).toBe("ouverte");
    expect(alerte.libelle).toBe(`Plomberie fictive vous relance pour sa facture n° F-2026-42 déposée le ${await jour(-40)} (reste à régler : 700,00 €).`);

    // Un règlement partiel de plus ne ferme rien ; le solde, si.
    await agir(gerantA);
    await db.query("select public.enregistrer_reglement_facture($1,$2,20000,public.aujourdhui_paris(),'virement',null,gen_random_uuid())", [orgA, f]);
    expect((await alertesRelance(f))[0].statut).toBe("ouverte");
    await agir(gerantA);
    await db.query("select public.enregistrer_reglement_facture($1,$2,50000,public.aujourdhui_paris(),'virement',null,gen_random_uuid())", [orgA, f]);
    expect(await alertesRelance(f)).toMatchObject([{ statut: "fermee", closed_action: "Facture réglée en totalité" }]);

    await base();
    await db.query("update public.intervention_factures set relancee_le = now() - interval '20 days' where id=$1", [f]);
    expect(await relancer(f)).toBe("Votre client a déclaré cette facture réglée en totalité : il n'y a rien à relancer");
    expect(await mesRelances()).toEqual([]);
  });

  it("facture refusée : la relance en cours se ferme, et il n'y a plus rien à relancer", async () => {
    await terminerLesTravaux();
    const f = await deposer("F-2026-43", 35);
    expect(await relancer(f)).toBe("");
    await agir(gerantA);
    await db.query("select public.refuser_facture_artisan($1,$2,'Le montant ne correspond pas au devis accepté')", [orgA, f]);
    expect(await alertesRelance(f)).toMatchObject([{ statut: "fermee", closed_action: "Facture refusée, à corriger par l'artisan" }]);
    await base();
    await db.query("update public.intervention_factures set relancee_le = now() - interval '20 days' where id=$1", [f]);
    expect(await relancer(f)).toBe("Cette facture a été refusée par votre client : déposez la facture corrigée, il n'y a rien à relancer");
    expect(await mesRelances()).toEqual([]);
  });

  it("seul l'artisan de la facture relance : ni un autre artisan, ni le gestionnaire, ni le locataire, ni un visiteur", async () => {
    await terminerLesTravaux();
    const f = await deposer("F-2026-44", 31);
    expect(await relancer(f, cptAutreArtisan)).toBe("Facture introuvable");
    expect(await relancer(f, gerantA)).toMatch(/compte réel de l'artisan/);
    expect(await relancer(f, cptLoc)).toMatch(/compte réel de l'artisan/);
    await agir(null, "anon");
    expect(await refus("select public.relancer_ma_facture($1)", [f])).toMatch(/permission denied/);
    expect(await refus("select * from public.mes_relances_factures()")).toMatch(/permission denied/);
    // Un autre artisan ne lit pas la facture des autres dans sa liste.
    await agir(cptAutreArtisan);
    expect((await db.query("select * from public.mes_relances_factures()")).rows).toEqual([]);
    expect(await etatRelance(f)).toEqual({ relances: 0, relancee: false });
  });

  // ── 2. Le rendez-vous manqué ────────────────────────────────────────────────────────────────────────────────────

  it("rien ne se consigne avant l'heure du rendez-vous, ni sans rendez-vous confirmé", async () => {
    expect(await parArtisan()).toBe("Aucun rendez-vous confirmé n'est en cours pour cette mission");
    expect(await parGestionnaire("locataire")).toBe("Aucun rendez-vous confirmé n'est en cours pour cette mission");
    await planifier(2);
    expect(await parArtisan()).toMatch(/^Le rendez-vous du \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} n'a pas encore commencé : un rendez-vous manqué se consigne après son heure$/);
    expect(await parGestionnaire("artisan")).toMatch(/n'a pas encore commencé/);
    expect(await manques()).toEqual([]);
    expect(await mission()).toMatchObject({ statut: "planifiee", retenus: 1 });
  });

  it("l'artisan consigne l'absence du locataire : le rendez-vous tombe, le dossier le dit, le gestionnaire est alerté", async () => {
    await planifier(-2);
    const avant = await mission();
    expect(await parArtisan("  Personne à l'interphone, attendu 20 minutes.  ")).toBe("");
    expect(await manques()).toEqual([{ absent: "locataire", consigne_role: "artisan", consigne_par: cptArtisan, note: "Personne à l'interphone, attendu 20 minutes.", rdv_debut: avant.debut_prevu }]);
    expect(await mission()).toEqual({ statut: "acceptee", debut_prevu: null, fin_prevue: null, retenus: 0, caducs: 1 });

    await base();
    const fil = (await db.query("select acteur_account_id, details from public.incident_evenements where incident_id=$1 and type='rdv_manque'", [incident])).rows;
    expect(fil).toHaveLength(1);
    expect(fil[0].acteur_account_id).toBe(cptArtisan);
    expect(fil[0].details).toMatchObject({ intervention_id: intervention, absent: "locataire", par: "artisan", note: "Personne à l'interphone, attendu 20 minutes." });
    expect(new Date(fil[0].details.rdv_debut).getTime()).toBe(new Date(avant.debut_prevu).getTime());

    const heure = String((await un("select to_char($1::timestamptz at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI') h", [avant.debut_prevu])).h);
    expect(await alertesRdv()).toEqual([{
      statut: "ouverte", closed_action: null, absent: "locataire", titre: `Rendez-vous manqué — ${numeroIncident}`,
      libelle: `L'artisan indique que le locataire était absent au rendez-vous du ${heure}. Un nouveau rendez-vous est à convenir : l'artisan peut proposer d'autres dates, ou vous pouvez le fixer.`,
    }]);

    // Le même rendez-vous ne se consigne pas deux fois : il n'existe plus.
    expect(await parArtisan()).toBe("Aucun rendez-vous confirmé n'est en cours pour cette mission");
    expect(await parGestionnaire("artisan")).toBe("Aucun rendez-vous confirmé n'est en cours pour cette mission");

    // Le gestionnaire fixe un nouveau rendez-vous : l'alerte se ferme d'elle-même.
    await agir(gerantA);
    await db.query("select public.fixer_creneau_arbitrage_motive($1,$2,now() + interval '3 days',now() + interval '3 days 1 hour','Convenu au téléphone',null)", [orgA, intervention]);
    expect(await alertesRdv()).toMatchObject([{ statut: "fermee", closed_action: "Nouveau rendez-vous fixé" }]);
    expect(await mission()).toMatchObject({ statut: "planifiee", retenus: 1 });
  });

  it("le gestionnaire consigne l'absence de l'artisan : comptée pour lui, sans alerte, et sa précision reste chez lui", async () => {
    await planifier(-3);
    expect(await parGestionnaire(null)).toBe("Indiquez qui était absent : le locataire ou l'artisan");
    expect(await parGestionnaire("voisin")).toBe("Indiquez qui était absent : le locataire ou l'artisan");
    expect(await parGestionnaire("artisan", "x".repeat(501))).toBe("Raccourcissez votre précision (500 caractères au plus)");
    expect(await parGestionnaire("artisan", "Le locataire a attendu toute la matinée.")).toBe("");
    expect(await manques()).toMatchObject([{ absent: "artisan", consigne_role: "gestionnaire", consigne_par: gerantA, note: "Le locataire a attendu toute la matinée." }]);
    expect(await mission()).toMatchObject({ statut: "acceptee", debut_prevu: null, retenus: 0 });
    expect(await alertesRdv()).toEqual([]);

    // L'artisan lit le fait, pas la précision du gestionnaire ; son compteur passe à 1.
    await agir(cptArtisan);
    expect((await db.query("select absent, consigne_role, note from public.rdv_manques_de_ma_mission($1)", [intervention])).rows)
      .toEqual([{ absent: "artisan", consigne_role: "gestionnaire", note: null }]);
    expect((await un("select public.mes_rdv_manques_artisan() n")).n).toBe(1);
    // Un autre artisan ne lit rien de cette mission, et son compteur reste à zéro.
    await agir(cptAutreArtisan);
    expect((await db.query("select * from public.rdv_manques_de_ma_mission($1)", [intervention])).rows).toEqual([]);
    expect((await un("select public.mes_rdv_manques_artisan() n")).n).toBe(0);
  });

  it("l'absence du locataire dite par le gestionnaire ne compte pas pour l'artisan ; une absence de plus de douze mois non plus", async () => {
    await planifier(-1);
    expect(await parGestionnaire("locataire")).toBe("");
    await agir(cptArtisan);
    expect((await un("select public.mes_rdv_manques_artisan() n")).n).toBe(0);
    expect((await db.query("select absent, consigne_role from public.rdv_manques_de_ma_mission($1)", [intervention])).rows).toEqual([{ absent: "locataire", consigne_role: "gestionnaire" }]);
    await planifier(-1);
    await base();
    await db.query("update public.incident_interventions set debut_prevu = now() - interval '13 months', fin_prevue = now() - interval '13 months' + interval '1 hour' where id=$1", [intervention]);
    expect(await parGestionnaire("artisan")).toBe("");
    await agir(cptArtisan);
    expect((await un("select public.mes_rdv_manques_artisan() n")).n).toBe(0);
  });

  it("le locataire lit la date et qui est dit absent, jamais la précision ; un autre locataire ne lit rien", async () => {
    await planifier(-2);
    expect(await parArtisan("Précision réservée au gestionnaire")).toBe("");
    await agir(cptLoc);
    const lu = (await db.query("select * from public.mes_rdv_manques_locataire($1)", [orgA])).rows;
    expect(lu).toHaveLength(1);
    expect(Object.keys(lu[0]).sort()).toEqual(["absent", "consigne_le", "consigne_role", "incident_id", "intervention_id", "rdv_debut"]);
    expect(lu[0]).toMatchObject({ incident_id: incident, intervention_id: intervention, absent: "locataire", consigne_role: "artisan" });
    await agir(cptAutreLoc);
    expect((await db.query("select * from public.mes_rdv_manques_locataire($1)", [orgA])).rows).toEqual([]);
    await agir(gerantB);
    expect((await db.query("select * from public.mes_rdv_manques_locataire($1)", [orgA])).rows).toEqual([]);
  });

  it("chacun son geste : l'artisan ne dit que « le locataire était absent », et personne d'autre ne consigne à sa place", async () => {
    await planifier(-2);
    // Ni un autre artisan, ni le locataire, ni un gestionnaire, par la fonction de l'artisan.
    expect(await parArtisan(null, cptAutreArtisan)).toMatch(/Accès refusé/);
    expect(await parArtisan(null, cptLoc)).toMatch(/compte réel de l'artisan/);
    expect(await parArtisan(null, gerantA)).toMatch(/compte réel de l'artisan/);
    // Ni l'artisan, ni le locataire, ni le gestionnaire d'un autre espace, par la fonction du gestionnaire.
    expect(await parGestionnaire("locataire", null, cptArtisan)).toMatch(/Accès refusé/);
    expect(await parGestionnaire("artisan", null, cptLoc)).toMatch(/Accès refusé/);
    expect(await parGestionnaire("artisan", null, gerantB)).toMatch(/Accès refusé/);
    expect(await parGestionnaire("artisan", null, gerantB, orgB)).toBe("Intervention introuvable");
    await agir(null, "anon");
    expect(await refus("select public.consigner_rdv_manque_artisan($1,null)", [intervention])).toMatch(/permission denied/);
    expect(await refus("select public.consigner_rdv_manque($1,$2,'artisan',null)", [orgA, intervention])).toMatch(/permission denied/);
    expect(await manques()).toEqual([]);
    // La base refuse qu'une ligne dise « artisan absent » au nom de l'artisan.
    await base();
    expect(await refus("insert into public.intervention_rdv_manques(organization_id,intervention_id,rdv_debut,absent,consigne_role) values($1,$2,now(),'artisan','artisan')", [orgA, intervention]))
      .toMatch(/intervention_rdv_manques_artisan_dit_locataire/);
  });

  it("la table est fermée : ni lecture ni écriture directe, et le cœur commun n'est appelable par personne", async () => {
    await planifier(-2);
    expect(await parArtisan()).toBe("");
    for (const c of [gerantA, cptArtisan, cptLoc]) {
      await agir(c);
      expect(await refus("select * from public.intervention_rdv_manques")).toMatch(/permission denied/);
      expect(await refus("insert into public.intervention_rdv_manques(organization_id,intervention_id,rdv_debut,absent,consigne_role) values($1,$2,now(),'locataire','gestionnaire')", [orgA, intervention])).toMatch(/permission denied/);
      expect(await refus("select public.rdv_manque_consigner_interne($1,'artisan','gestionnaire',null)", [intervention])).toMatch(/permission denied/);
    }
    await base();
    const droits = await un(`select
      (select relrowsecurity from pg_class where oid='public.intervention_rdv_manques'::regclass) rls,
      has_table_privilege('authenticated','public.intervention_rdv_manques','select') lecture,
      has_table_privilege('anon','public.intervention_rdv_manques','select') anonyme`);
    expect(droits).toEqual({ rls: true, lecture: false, anonyme: false });
    expect((await db.query("select tgname from pg_trigger where tgrelid='public.intervention_rdv_manques'::regclass and not tgisinternal order by 1")).rows.map((x) => x.tgname))
      .toEqual(["abonnement_intervention_rdv_manques", "diagnostic_artisan_lecture", "traversee_lecture_seule"]);
    for (const f of FONCTIONS) {
      expect(await un("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') u", [f]), f).toEqual({ a: false, u: true });
    }
    for (const f of INTERNES) {
      expect(await un("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated',$1,'execute') u", [f]), f).toEqual({ a: false, u: false });
    }
  });

  // ── 3. Rejeu et retour ──────────────────────────────────────────────────────────────────────────────────────────

  it("la migration se rejoue ; le retour supprime les fonctions et garde tout ce qui a été consigné", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const existent = async () => {
      await base();
      return Number((await un("select count(*)::int n from unnest($1::text[]) f where to_regprocedure(f) is not null", [[...FONCTIONS, ...INTERNES]])).n);
    };
    const declencheurs = async () => {
      await base();
      return Number((await un("select count(*)::int n from pg_trigger where not tgisinternal and tgname in ('fermer_alerte_relance_reglement','fermer_alerte_relance_refus','fermer_alerte_rdv_manque')")).n);
    };
    const types = async () => {
      await base();
      const d = String((await un("select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.incident_evenements'::regclass and conname='incident_evenements_type_check'")).d);
      return { relance: d.includes("'facture_relancee'"), rdv: d.includes("'rdv_manque'") };
    };
    await base();
    expect([await existent(), await declencheurs()]).toEqual([11, 3]);
    expect(await types()).toEqual({ relance: true, rdv: true });
    await db.query(migration);
    await db.query(migration);
    expect([await existent(), await declencheurs()]).toEqual([11, 3]);

    // ── Retour SANS rien de consigné : les deux types quittent la liste fermée.
    await db.query("savepoint vide");
    await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,'artisan_relance_facture_rdv_manque') on conflict do nothing", [CODE]);
    await db.query(retour);
    expect([await existent(), await declencheurs()]).toEqual([0, 0]);
    expect(await types()).toEqual({ relance: false, rdv: false });
    expect(Number((await un("select count(*)::int n from supabase_migrations.schema_migrations where version=$1", [CODE])).n)).toBe(0);
    await db.query(retour);
    expect(await types()).toEqual({ relance: false, rdv: false });
    await db.query(migration);
    expect([await existent(), await declencheurs()]).toEqual([11, 3]);
    expect(await types()).toEqual({ relance: true, rdv: true });
    await db.query("rollback to savepoint vide");

    // ── Retour AVEC un rendez-vous manqué et une relance : rien n'est effacé, les types restent.
    await planifier(-2);
    expect(await parArtisan("Absent")).toBe("");
    await base();
    await db.query("update public.incident_interventions set statut='en_cours', demarree_le=now() where id=$1", [intervention]);
    await terminerLesTravaux();
    const f = await deposer("F-RETOUR", 31);
    expect(await relancer(f)).toBe("");
    await base();
    await db.query(retour);
    expect([await existent(), await declencheurs()]).toEqual([0, 0]);
    expect(await types()).toEqual({ relance: true, rdv: true });
    expect(await manques()).toMatchObject([{ absent: "locataire", consigne_role: "artisan", note: "Absent" }]);
    expect(await etatRelance(f)).toEqual({ relances: 1, relancee: true });
    expect(Number((await un("select count(*)::int n from public.incident_evenements where incident_id=$1 and type in ('rdv_manque','facture_relancee')", [incident])).n)).toBe(2);

    await db.query(migration);
    expect([await existent(), await declencheurs()]).toEqual([11, 3]);
    expect(await relancer(f)).toMatch(/la relance suivante sera possible le/);
  });
});
