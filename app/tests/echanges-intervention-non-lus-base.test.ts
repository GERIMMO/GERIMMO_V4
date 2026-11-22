/**
 * DISCUSSION D'UNE INTERVENTION : UN NOUVEAU MESSAGE EST SIGNALÉ — audit palier 1 du 22/11/2026, P1-05.
 *
 * Le défaut : la discussion partagée entre le gestionnaire, le locataire et l'artisan n'écrivait que le message — ni
 * alerte, ni compteur de non-lus. Personne ne savait qu'un message l'attendait sans rouvrir la fiche.
 *
 * Ces tests tiennent, sous les vrais rôles et par les vraies fonctions (`envoyer_message_intervention`) :
 *  1. chacun compte les messages DES AUTRES qu'il n'a pas lus — jamais les siens, jamais ceux d'une discussion qu'il
 *     n'a pas le droit de lire (autre espace, autre artisan, mission terminée pour l'artisan, visiteur) ;
 *  2. « marquer lu » n'avance que le marqueur de l'appelant, jusqu'au message qu'il désigne (le dernier qu'il a eu
 *     sous les yeux, par son identifiant) — jamais en arrière, jamais sur un message d'une autre discussion ;
 *  3. le gestionnaire reçoit UNE alerte par intervention, sans le texte du message ; elle se met à jour au message
 *     suivant et se ferme quand un gestionnaire a tout lu ; son propre message n'en ouvre pas ;
 *  4. l'alerte ne bloque jamais un message, et une alerte qui ne se ferme pas ne défait pas la lecture ;
 *  5. personne n'écrit un marqueur à la main, et chacun ne lit que les siens ;
 *  6. la migration se rejoue ; son retour retire le signalement sans toucher aux messages.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test : tous les messages d'un test naissent donc
 * au même instant (celui de la transaction) ; le banc les date explicitement, comme le temps le ferait. Les derniers
 * blocs rejouent du DDL : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { gesteAlerte } from "../src/lib/chemin-alerte";

const NOM = "20261122180000_echanges_intervention_non_lus";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("signalement des messages d'intervention — manifeste, retour et libellés (sans base)", () => {
  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/echanges-intervention-non-lus-base.test.ts"');
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    // Aucun message n'est modifié ni effacé, et le texte d'un message n'entre jamais dans une alerte.
    expect(sql).not.toMatch(/(update|delete\s+from)\s+public\.intervention_messages/i);
    expect(sql).not.toMatch(/new\.texte/i);
  });

  it("l'alerte ouvre le dossier de l'incident, avec un geste nommé", () => {
    const geste = gesteAlerte({ type: "message_intervention", details: { incident_id: "i-1" } }, "org-1");
    // « seFermeSeule » : l'écran ne propose pas de la fermer à la main comme seul geste — la lire suffit.
    expect(geste).toEqual({ href: "/agence/org-1/incidents?sel=i-1", libelle: "Lire le message de l’intervention", seFermeSeule: true });
    expect(gesteAlerte({ type: "message_intervention", details: { incident_id: "i-1" } }, "org-1", "/espace")?.href).toBe("/espace/org-1/incidents?sel=i-1");
  });
});

describe.skipIf(!url)("signalement des messages d'intervention (avec base)", () => {
  let db: Client;
  let orgA = "", orgB = "", gerantA = "", gerantA2 = "", gerantB = "", cptLoc = "", cptArtisan = "", cptAutreArtisan = "";
  let incident = "", intervention = "", numero = "";

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  afterAll(async () => { await db?.end(); });
  afterEach(async () => { await db.query("rollback"); });

  const id = async (sql: string, p: unknown[] = []) => String((await db.query(sql, p)).rows[0].id);
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

  /**
   * Un message, par la vraie fonction, sous le vrai rôle. `ilYA` (minutes) le date explicitement : dans une
   * transaction de test tous les messages naîtraient au même instant. L'alerte ouverte suit la même date.
   */
  async function ecrire(parCompte: string, texte: string, ilYA: number) {
    await agir(parCompte);
    const message = await id("select public.envoyer_message_intervention($1,$2,$3) as id", [intervention, texte, randomUUID()]);
    await base();
    const { rows: [m] } = await db.query(
      "update public.intervention_messages set cree_le = now() - make_interval(mins => $2) where id=$1 returning cree_le::text, auteur_role", [message, ilYA]);
    if (m.auteur_role !== "gerant") {
      await db.query(`update public.alerts set details = details || jsonb_build_object('dernier_le', $2::timestamptz)
        where type='message_intervention' and statut='ouverte' and origine_id=$1`, [intervention, m.cree_le]);
    }
    return { id: message, le: m.cree_le as string };
  }
  const nonLus = async (parCompte: string, espace: string | null) => {
    await agir(parCompte);
    return (await db.query("select intervention_id, incident_id, organization_id, non_lus from public.echanges_intervention_non_lus($1)", [espace])).rows;
  };
  /** L'appelant désigne le dernier message qu'il a eu sous les yeux, par son identifiant. */
  const marquer = async (parCompte: string, dernierMessage: string, cible = intervention) => {
    await agir(parCompte);
    return (await db.query("select public.marquer_echange_intervention_lu($1,$2) as ok", [cible, dernierMessage])).rows[0].ok as boolean;
  };
  const alertes = async () => {
    await base();
    return (await db.query(
      "select statut::text, criticite::text, titre, details, closed_action, closed_by, origine_type, origine_id from public.alerts where organization_id=$1 and type='message_intervention' order by created_at, id", [orgA])).rows;
  };
  const marqueur = async (compteId: string) => {
    await base();
    return (await db.query("select lue_le::text from public.intervention_echanges_lectures where intervention_id=$1 and account_id=$2", [intervention, compteId])).rows[0]?.lue_le as string | undefined;
  };
  const ATTENDU = () => [{ intervention_id: intervention, incident_id: incident, organization_id: orgA }];

  beforeEach(async () => {
    await db.query("begin");
    orgA = await id("insert into public.organizations(name,status) values('Agence fictive des échanges A','active') returning id");
    orgB = await id("insert into public.organizations(name,status) values('Agence fictive des échanges B','active') returning id");
    gerantA = await compte("gerant-a"); gerantA2 = await compte("gerant-a2"); gerantB = await compte("gerant-b");
    cptLoc = await compte("locataire"); cptArtisan = await compte("artisan"); cptAutreArtisan = await compte("autre-artisan");
    await db.query(`insert into public.memberships(account_id,organization_id,role) values
      ($1,$2,'admin_agence'),($3,$2,'admin_agence'),($4,$5,'admin_agence'),($6,$2,'locataire')`, [gerantA, orgA, gerantA2, gerantB, orgB, cptLoc]);
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'Résidence fictive','immeuble','1 rue du Test','75011','Paris') returning id", [orgA]);
    const lot = await id("insert into public.lots(bien_id,organization_id,nom,etat) values($1,$2,'Lot 1','loue') returning id", [bien, orgA]);
    const personne = await id("insert into public.persons(organization_id,account_id,nom,prenom,telephone) values($1,$2,'Martin','Léa','0600000000') returning id", [orgA, cptLoc]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,'actif',current_date-200,700,50) returning id", [orgA, lot, personne]);
    numero = `INC-${randomUUID().slice(0, 8)}`;
    incident = await id(`insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification)
      values($1,$2,$3,$4,$5,'espace_locataire','plomberie_canalisation','Fuite sous évier','affecte','proprietaire','Joint usé par le temps') returning id`, [orgA, numero, lot, bail, personne]);
    const artisan = await id(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Plomberie fictive',lpad((floor(random()*99999999999999))::text,14,'0'),'0611111111','valide','verifie') returning id`, [cptArtisan]);
    await db.query(`insert into public.artisans(account_id,raison_sociale,siret,telephone,statut_plateforme,siret_etat)
      values($1,'Autre artisan fictif',lpad((floor(random()*99999999999999))::text,14,'0'),'0622222222','valide','verifie')`, [cptAutreArtisan]);
    intervention = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le)
      values($1,$2,$3,'entretien_courant','acceptee',now()) returning id`, [orgA, incident, artisan]);
    await base();
  });

  it("sans message : rien à lire pour personne, aucune alerte", async () => {
    expect(await nonLus(gerantA, orgA)).toEqual([]);
    expect(await nonLus(cptLoc, orgA)).toEqual([]);
    expect(await nonLus(cptArtisan, null)).toEqual([]);
    expect(await alertes()).toEqual([]);
  });

  it("l'artisan écrit : le gestionnaire et le locataire ont un message à lire, pas lui ; les tiers ne voient rien", async () => {
    await ecrire(cptArtisan, "Je ne peux pas entrer dans l'immeuble : quel est le code ?", 30);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    expect(await nonLus(gerantA2, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    expect(await nonLus(cptLoc, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    // Son propre message n'est pas « à lire ».
    expect(await nonLus(cptArtisan, null)).toEqual([]);
    // Ni un autre espace (même en nommant celui-ci), ni un autre artisan, ni un visiteur.
    expect(await nonLus(gerantB, orgA)).toEqual([]);
    expect(await nonLus(gerantB, orgB)).toEqual([]);
    expect(await nonLus(cptAutreArtisan, null)).toEqual([]);
    expect(await nonLus(cptAutreArtisan, orgA)).toEqual([]);
    await agir(null, "anon");
    expect(await refus("select * from public.echanges_intervention_non_lus($1)", [orgA])).toMatch(/permission denied/);
  });

  it("le gestionnaire reçoit UNE alerte, sans le texte ; elle se met à jour, puis se ferme quand il a tout lu", async () => {
    const TEXTE = "Code de la porte changé, je suis bloqué dehors.";
    const premier = await ecrire(cptArtisan, TEXTE, 30);
    let [alerte, ...autres] = await alertes();
    expect(autres).toEqual([]);
    expect(alerte).toMatchObject({
      statut: "ouverte", criticite: "normale", titre: `Nouveau message sur l'intervention — ${numero}`,
      origine_type: "intervention", origine_id: intervention,
    });
    expect(alerte.details).toMatchObject({
      incident_id: incident, intervention_id: intervention, messages: 1, dernier_role: "artisan",
      libelle: "L'artisan a écrit dans la discussion de l'intervention.",
    });
    expect(Object.keys(alerte.details).sort()).toEqual(["dernier_le", "dernier_role", "incident_id", "intervention_id", "libelle", "lot_id", "messages"]);
    expect(JSON.stringify(alerte)).not.toContain("Code de la porte");

    // Le locataire répond : toujours une seule alerte, mise à jour.
    const second = await ecrire(cptLoc, "Le code est affiché dans le hall, je descends vous ouvrir.", 20);
    [alerte, ...autres] = await alertes();
    expect(autres).toEqual([]);
    expect(alerte.details).toMatchObject({ messages: 2, dernier_role: "locataire" });
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 2 }]);
    expect(await nonLus(cptArtisan, null)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    expect(await nonLus(cptLoc, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);

    // Le gestionnaire n'a eu sous les yeux que le premier message : il lui en reste un, l'alerte reste ouverte.
    expect(await marquer(gerantA, premier.id)).toBe(true);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    expect((await alertes())[0].statut).toBe("ouverte");
    // Il lit tout : plus rien à lire, l'alerte se ferme avec sa raison.
    expect(await marquer(gerantA, second.id)).toBe(true);
    expect(await nonLus(gerantA, orgA)).toEqual([]);
    expect(await alertes()).toMatchObject([{ statut: "fermee", closed_action: "Discussion lue", closed_by: gerantA }]);
    // Sa lecture n'est que la sienne : son collègue, le locataire et l'artisan gardent leurs messages à lire.
    expect(await nonLus(gerantA2, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 2 }]);
    expect(await nonLus(cptLoc, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    expect(await nonLus(cptArtisan, null)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);

    // Un nouveau message après la lecture rouvre une alerte neuve ; l'ancienne reste à l'historique.
    await ecrire(cptArtisan, "Travail terminé, je referme derrière moi.", 5);
    // (Les deux naissent au même instant dans la transaction du test : on les range par état.)
    expect((await alertes()).map((a) => `${a.statut}:${a.details.messages}`).sort()).toEqual(["fermee:2", "ouverte:1"]);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
  });

  it("le message du gestionnaire n'ouvre pas d'alerte, mais le locataire et l'artisan ont à le lire", async () => {
    const m = await ecrire(gerantA, "L'artisan passera jeudi à 9 h : merci de laisser l'accès libre.", 10);
    expect(await alertes()).toEqual([]);
    expect(await nonLus(gerantA, orgA)).toEqual([]);
    expect(await nonLus(cptLoc, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    expect(await nonLus(cptArtisan, null)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    // Le locataire lit : cela ne concerne que lui.
    expect(await marquer(cptLoc, m.id)).toBe(true);
    expect(await nonLus(cptLoc, orgA)).toEqual([]);
    expect(await nonLus(cptArtisan, null)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
  });

  it("marquer lu : jusqu'au message désigné, à l'instant exact ; jamais en arrière ; seulement pour qui peut lire la discussion", async () => {
    const ancien = await ecrire(cptArtisan, "Premier message.", 60);
    const recent = await ecrire(cptArtisan, "Second message.", 10);
    expect(await marquer(gerantA, recent.id)).toBe(true);
    // Le marqueur porte l'heure du message, à la microseconde : c'est ce qui éteint le signal. (Une heure repassée
    // par un navigateur, arrondie à la milliseconde, tomberait juste avant le message et le laisserait « non lu ».)
    await base();
    expect((await db.query(`select l.lue_le = m.cree_le as exact, l.lue_le::text as marque from public.intervention_echanges_lectures l
      join public.intervention_messages m on m.id=$3 where l.intervention_id=$1 and l.account_id=$2`, [intervention, gerantA, recent.id])).rows[0].exact).toBe(true);
    const pose = await marqueur(gerantA);
    expect(await nonLus(gerantA, orgA)).toEqual([]);
    // Relire un écran plus ancien ne « dé-lit » rien ; le redire non plus.
    expect(await marquer(gerantA, ancien.id)).toBe(false);
    expect(await marquer(gerantA, recent.id)).toBe(false);
    expect(await marqueur(gerantA)).toBe(pose);
    expect(await nonLus(gerantA, orgA)).toEqual([]);

    // Un message qui n'est pas de CETTE discussion, ou qui n'existe pas : aucun effet.
    await base();
    const artisanB = await id("select id from public.artisans where account_id=$1", [cptAutreArtisan]);
    const incidentB = await id(`insert into public.incidents(organization_id,numero,lot_id,canal,categorie,description,etat,imputation,imputation_justification)
      select organization_id,'INC-'||substr(gen_random_uuid()::text,1,8),lot_id,'agence','plomberie_canalisation','Autre dossier','affecte','proprietaire','Autre dossier fictif'
        from public.incidents where id=$1 returning id`, [incident]);
    const autreMission = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le)
      values($1,$2,$3,'entretien_courant','acceptee',now()) returning id`, [orgA, incidentB, artisanB]);
    await agir(cptAutreArtisan);
    const ailleurs = await id("select public.envoyer_message_intervention($1,$2,$3) as id", [autreMission, "Message d'un autre dossier.", randomUUID()]);
    expect(await marquer(gerantA2, ailleurs)).toBe(false);
    expect(await marquer(gerantA2, randomUUID())).toBe(false);
    expect(await marqueur(gerantA2)).toBeUndefined();

    // Sans droit sur la discussion : aucun effet, aucun marqueur.
    for (const tiers of [gerantB, cptAutreArtisan]) {
      expect(await marquer(tiers, recent.id), tiers).toBe(false);
      expect(await marqueur(tiers), tiers).toBeUndefined();
    }
    expect(await marquer(gerantA, recent.id, randomUUID())).toBe(false);
    await agir(null, "anon");
    expect(await refus("select public.marquer_echange_intervention_lu($1, $2)", [intervention, recent.id])).toMatch(/permission denied/);
    // Valeurs absentes : rien.
    await agir(gerantA2);
    expect((await db.query("select public.marquer_echange_intervention_lu($1, null) ok", [intervention])).rows[0].ok).toBe(false);
    expect((await db.query("select public.marquer_echange_intervention_lu(null, $1) ok", [recent.id])).rows[0].ok).toBe(false);
    expect(await marqueur(gerantA2)).toBeUndefined();
  });

  it("mission terminée : l'artisan n'a plus accès à la discussion, donc plus rien à y lire ; le gestionnaire, si", async () => {
    await ecrire(cptLoc, "Merci pour votre passage.", 10);
    expect(await nonLus(cptArtisan, null)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    await base();
    await db.query("update public.incident_interventions set statut='annulee' where id=$1", [intervention]);
    expect(await nonLus(cptArtisan, null)).toEqual([]);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
  });

  it("mission remplacée : sa discussion n'est plus affichée nulle part, elle ne réclame donc plus de lecture", async () => {
    await ecrire(cptArtisan, "Je ne pourrai pas venir cette semaine.", 30);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    // La mission est annulée, une autre est confiée sur le même incident : les écrans n'affichent que la nouvelle.
    await base();
    await db.query("update public.incident_interventions set statut='annulee', confiee_le = now() - interval '2 days' where id=$1", [intervention]);
    const autre = await id("select id from public.artisans where account_id=$1", [cptAutreArtisan]);
    const nouvelle = await id(`insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le)
      values($1,$2,$3,'entretien_courant','acceptee',now()) returning id`, [orgA, incident, autre]);
    expect(await nonLus(gerantA, orgA)).toEqual([]);
    expect(await nonLus(cptLoc, orgA)).toEqual([]);
    // La nouvelle mission, elle, signale ses messages.
    await agir(cptAutreArtisan);
    await db.query("select public.envoyer_message_intervention($1,$2,$3)", [nouvelle, "Je reprends ce dossier.", randomUUID()]);
    expect(await nonLus(gerantA, orgA)).toEqual([{ intervention_id: nouvelle, incident_id: incident, organization_id: orgA, non_lus: 1 }]);
  });

  it("personne n'écrit un marqueur à la main, et chacun ne lit que les siens", async () => {
    const m = await ecrire(cptArtisan, "Un message.", 10);
    expect(await marquer(gerantA, m.id)).toBe(true);
    expect(await marquer(cptLoc, m.id)).toBe(true);
    for (const qui of [gerantA, cptLoc, cptArtisan]) {
      await agir(qui);
      expect(await refus("insert into public.intervention_echanges_lectures(intervention_id,account_id,lue_le) values($1,$2,now())", [intervention, qui]), qui).toMatch(/permission denied/);
      expect(await refus("update public.intervention_echanges_lectures set lue_le = now() - interval '1 year'"), qui).toMatch(/permission denied/);
      expect(await refus("delete from public.intervention_echanges_lectures"), qui).toMatch(/permission denied/);
    }
    await agir(gerantA);
    expect((await db.query("select account_id from public.intervention_echanges_lectures")).rows).toEqual([{ account_id: gerantA }]);
    await agir(cptArtisan);
    expect((await db.query("select account_id from public.intervention_echanges_lectures")).rows).toEqual([]);
    await agir(null, "anon");
    expect(await refus("select * from public.intervention_echanges_lectures")).toMatch(/permission denied/);
    // Les marqueurs suivent l'intervention et le compte : ils disparaissent avec eux, sans bloquer leur suppression.
    await base();
    expect((await db.query(`select confrelid::regclass::text cible, confdeltype::text regle from pg_constraint
      where conrelid='public.intervention_echanges_lectures'::regclass and contype='f' order by 1`)).rows)
      .toEqual([{ cible: "accounts", regle: "c" }, { cible: "incident_interventions", regle: "c" }]);
  });

  it("l'alerte ne bloque jamais un message ; une alerte qui ne se ferme pas ne défait pas la lecture", async () => {
    // Une panne à la pose de l'alerte (ici provoquée) : le message part quand même.
    await db.query("alter table public.alerts add constraint essai_panne_alerte check (type <> 'message_intervention') not valid");
    const m = await ecrire(cptArtisan, "Message malgré la panne de l'alerte.", 10);
    await base();
    expect((await db.query("select count(*)::int n from public.intervention_messages where id=$1", [m.id])).rows[0].n).toBe(1);
    expect(await alertes()).toEqual([]);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 1 }]);
    await base();
    await db.query("alter table public.alerts drop constraint essai_panne_alerte");

    // Une alerte ouverte dont la fermeture est refusée (ici provoquée) : la lecture reste marquée.
    const n = await ecrire(cptArtisan, "Second message, avec alerte.", 5);
    expect((await alertes()).map((a) => a.statut)).toEqual(["ouverte"]);
    await db.query(`create function public.essai_refus_fermeture() returns trigger language plpgsql as $f$
      begin if new.type = 'message_intervention' and new.statut = 'fermee' then raise exception 'fermeture refusée (essai)'; end if; return new; end $f$`);
    await db.query("create trigger essai_refus_fermeture before update on public.alerts for each row execute function public.essai_refus_fermeture()");
    expect(await marquer(gerantA, n.id)).toBe(true);
    expect(await nonLus(gerantA, orgA)).toEqual([]);
    expect((await alertes()).map((a) => a.statut)).toEqual(["ouverte"]);
  });

  it("la migration se rejoue ; son retour retire le signalement sans toucher aux messages", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const objets = async () => (await db.query(`select
        to_regclass('public.intervention_echanges_lectures') is not null as marqueurs,
        to_regprocedure('public.echanges_intervention_non_lus(uuid)') is not null as non_lus,
        to_regprocedure('public.marquer_echange_intervention_lu(uuid,uuid)') is not null as marquer,
        exists(select 1 from pg_trigger where tgname='signaler_message_intervention' and tgrelid='public.intervention_messages'::regclass) as declencheur`)).rows[0];
    const TOUT = { marqueurs: true, non_lus: true, marquer: true, declencheur: true };

    const m = await ecrire(cptArtisan, "Message conservé quoi qu'il arrive.", 10);
    expect(await marquer(cptLoc, m.id)).toBe(true);
    await base();
    expect(await objets()).toEqual(TOUT);
    await db.query(migration);
    expect(await objets()).toEqual(TOUT);
    // Le rejeu ne vide pas les marqueurs et ne double pas le déclencheur.
    expect(await marqueur(cptLoc)).toBeDefined();
    expect((await db.query("select count(*)::int n from pg_trigger where tgname='signaler_message_intervention'")).rows[0].n).toBe(1);
    expect((await db.query(`select has_function_privilege('anon','public.echanges_intervention_non_lus(uuid)','execute') a,
      has_function_privilege('anon','public.marquer_echange_intervention_lu(uuid,uuid)','execute') b,
      has_function_privilege('authenticated','public.signaler_message_intervention()','execute') c`)).rows[0]).toEqual({ a: false, b: false, c: false });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122180000','echanges_intervention_non_lus') on conflict do nothing");
    await db.query(retour);
    expect(await objets()).toEqual({ marqueurs: false, non_lus: false, marquer: false, declencheur: false });
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122180000'")).rows[0].n).toBe(0);
    // Le message est intact ; l'alerte encore ouverte est fermée, avec sa raison.
    expect((await db.query("select texte from public.intervention_messages where id=$1", [m.id])).rows).toEqual([{ texte: "Message conservé quoi qu'il arrive." }]);
    expect((await db.query("select statut::text, closed_action from public.alerts where organization_id=$1 and type='message_intervention'", [orgA])).rows)
      .toEqual([{ statut: "fermee", closed_action: "Signalement retiré" }]);
    // Sans le signalement, la discussion fonctionne comme avant : un message part, sans alerte.
    await agir(cptArtisan);
    await db.query("select public.envoyer_message_intervention($1,$2,$3)", [intervention, "Après le retour.", randomUUID()]);
    await base();
    expect((await db.query("select count(*)::int n from public.alerts where organization_id=$1 and type='message_intervention' and statut='ouverte'", [orgA])).rows[0].n).toBe(0);
    await db.query(retour);
    expect(await objets()).toEqual({ marqueurs: false, non_lus: false, marquer: false, declencheur: false });

    await db.query(migration);
    expect(await objets()).toEqual(TOUT);
    expect(await nonLus(gerantA, orgA)).toEqual([{ ...ATTENDU()[0], non_lus: 2 }]);
  });
});
