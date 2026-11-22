/**
 * L'AVENANT SIGNÉ S'ENREGISTRE, ET MODIFIE LE LOYER ET LES CHARGES DU BAIL — audit palier 1 du 22/11/2026, P1-14.
 *
 * Le défaut : l'avenant n'était qu'un texte mis en PDF. Rien n'était stocké, et le loyer appelé chaque mois restait
 * celui d'avant l'avenant, sans moyen de le corriger (le contenu d'un bail signé est figé).
 *
 * Ces tests tiennent, sous les vrais rôles et par les vraies fonctions :
 *  1. l'avenant s'applique par UN SEUL chemin — à la création du premier loyer qu'il concerne. Les mois d'avant sa
 *     date d'effet gardent l'ancien montant (même appelés en retard), les mois à partir d'elle prennent le nouveau,
 *     y compris au prorata d'une sortie en cours de mois et sur plusieurs mois rattrapés d'un coup ;
 *  2. un avenant à effet futur attend, sans rien changer, et s'applique seul le mois venu ;
 *  3. un loyer déjà appelé n'est jamais réécrit ; un seul avenant en attente ; la pièce signée est obligatoire et sa
 *     fiche naît avec l'avenant (un refus ne laisse rien dans les documents) ;
 *  4. une hausse du loyer est refusée quand le dernier diagnostic classe le logement F ou G (même prudence que la
 *     révision annuelle) ; une baisse reste possible ;
 *  5. l'annulation n'est possible que tant que l'avenant n'est pas appliqué, avec un motif ;
 *  6. le locataire, un autre espace, un agent hors portefeuille, un visiteur : ni lecture ni écriture ;
 *  7. la migration se rejoue ; son retour retire l'application automatique sans rien effacer ni défaire.
 *
 * Nécessite SUPABASE_DB_URL. Transaction annulée à la fin de chaque test. « Le temps qui passe » se joue en avançant
 * la date d'effet d'un avenant en attente, ou en créant le loyer du mois suivant comme le fera le générateur. Le
 * dernier bloc rejoue du DDL : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const NOM = "20261122190000_avenants_bail";
const SIGNATURE = "public.enregistrer_avenant_bail(uuid,uuid,text,date,date,numeric,numeric,text,text,bigint,text)";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe("avenant au bail — manifeste, retour et prudences (sans base)", () => {
  const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
  const sql = migration.replace(/^\s*--.*$/gm, "");

  it("la migration est au manifeste une seule fois, avec son retour listé", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.at(-1)).toBe(`${NOM}.sql`);
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
    expect(readFileSync("vitest.config.ts", "utf8")).toContain('"tests/avenants-bail-base.test.ts"');
  });

  it("elle n'ouvre rien au visiteur, ne réécrit ni le générateur des loyers ni la révision annuelle", () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(sql).not.toMatch(/create or replace function public\.(generer_appels_loyer_interne|generer_appels_loyer|reviser_loyer)\b/i);
    // Aucun loyer déjà appelé n'est modifié ni effacé : la migration n'écrit dans les appels que par son déclencheur
    // « avant création ».
    expect(sql).not.toMatch(/(update|delete\s+from)\s+public\.appels_loyer/i);
    expect(sql).toMatch(/create trigger a_avenant_du_bail before insert on public\.appels_loyer/);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });

  it("elle ne pose de garde que sur SA table : jamais le passage général, qui en poserait sur les tables des autres", () => {
    // Constaté au banc : `poser_gardes_abonnement()` repasse sur toutes les tables d'un espace et avait posé ses gardes
    // sur cinq tables qui n'en portent volontairement pas (courriels durables, preuves de commande…), cassant deux
    // parcours d'abonnement. La garde de la table des avenants est posée par son nom.
    expect(sql).not.toContain("poser_gardes_abonnement");
    expect(sql).toMatch(/create trigger abonnement_avenants_bail before insert or update or delete on public\.avenants_bail\s+for each row execute function public\.refuser_ecriture_si_fermee\(\)/);
    const declencheurs = [...sql.matchAll(/create trigger \S+ [^;]*? on public\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(declencheurs)].sort()).toEqual(["appels_loyer", "avenants_bail"]);
    // Son retour est inscrit dans l'ordre complet des retours (la migration cite la fonction du jour de Paris).
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toMatch(/Ordre complet si tout doit être défait :\s*\n`20261122190000` \(avenant au bail/);
  });

  it("elle ne cite aucun article de loi : ses prudences sont dites comme des prudences, et renvoyées au juriste", () => {
    // Règle de la mission : aucune référence légale inventée. Les sites officiels n'étaient pas ouverts à l'écriture.
    expect(migration).not.toMatch(/\b(art\.|article|loi n°|décret)\s*\d/i);
    expect(migration).toContain("JURISTE.md");
    expect(migration).toMatch(/aucune n'est présentée comme une règle de droit/);
  });

  it("le retour ne supprime ni la table ni un avenant, et ne touche à aucun bail", () => {
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(retour).not.toMatch(/drop table/i);
    expect(retour).not.toMatch(/delete from public\./i);
    expect(retour).not.toMatch(/update public\./i);
    expect(retour).toContain("drop trigger if exists a_avenant_du_bail on public.appels_loyer");
  });
});

describe.skipIf(!url)("avenant au bail : enregistrement, application, annulation (avec base)", () => {
  let db: Client;
  let org = "", proprietaire = "", locataire = "", personne = "", bien = "";
  /** Le 1er du mois courant (jour de Paris) et le jour de Paris, lus une fois sur la base. */
  let M0 = "", AUJOURDHUI = "";

  /** Le 1er du mois courant décalé de n mois, « AAAA-MM-JJ ». */
  const mois = (n: number) => {
    const [a, m] = M0.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
  };
  const joursDuMois = (premier: string) => {
    const [a, m] = premier.split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).getUTCDate();
  };
  const fr = (iso: string) => iso.split("-").reverse().join("/");

  async function utilisateur() {
    const id = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [id, `${id}@test.local`]);
    return id;
  }
  async function agir(id: string | null, role: "authenticated" | "anon" = "authenticated") {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(id ? { sub: id, role, aal: "aal2" } : { role })]);
    await db.query(`set local role ${role}`);
  }
  const base = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  /** Joue une requête qui doit être refusée ; rend le message du refus (« » si elle passe). */
  const refus = async (sql: string, p: unknown[] = []) => {
    await db.query("savepoint refus");
    try { await db.query(sql, p); await db.query("release savepoint refus"); return ""; }
    catch (e) { await db.query("rollback to savepoint refus"); return (e as Error).message; }
  };

  /** Un logement et son bail en cours (700 € + 50 € de charges par défaut). `appels` : les loyers sont déjà appelés. */
  async function bail(o: { debut: string; loyer?: number; charges?: number; etat?: string; fin?: string | null; appels?: boolean; dans?: string; irl?: boolean; suivisDepuis?: string }) {
    await base();
    const dans = o.dans ?? org;
    const b = o.dans ? (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','2 rue fictive','75001','Paris',false) returning id", [dans])).rows[0].id : bien;
    const lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Logement '||gen_random_uuid(),'loue') returning id", [dans, b])).rows[0].id as string;
    const qui = o.dans ? (await db.query("insert into persons(organization_id,nom,prenom) values($1,'TEST Autre','Lou') returning id", [dans])).rows[0].id : personne;
    const an = Number(AUJOURDHUI.slice(0, 4));
    const id = (await db.query(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,date_fin,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue,revision_irl,irl_trimestre,irl_valeur)
      values($1,$2,$3,'nu',$4,$5,$6,$7,$8,$7,1,false,$9,$10,$11) returning id`,
      [dans, lot, qui, o.etat ?? "actif", o.debut, o.fin ?? null, o.loyer ?? 700, o.charges ?? 50, o.irl === true, o.irl ? `T1 ${an - 2}` : null, o.irl ? 140 : null])).rows[0].id as string;
    // Bail repris en cours : Gerimmo n'appelle ses loyers qu'à partir de ce mois.
    if (o.suivisDepuis) await db.query("update baux set loyers_suivis_depuis=$2 where id=$1", [id, o.suivisDepuis]);
    if (o.appels) await db.query("select public.generer_appels_loyer_interne($1)", [id]);
    return { id, lot };
  }
  type Saisie = { objet?: string | null; signe?: string | null; effet?: string | null; loyer?: number | null; charges?: number | null; chemin?: string | null; mime?: string; dans?: string };
  const APPEL = `select public.enregistrer_avenant_bail($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,1234,gen_random_uuid()::text) id`;
  const parametres = (b: string, s: Saisie) => {
    const dans = s.dans ?? org;
    return [dans, b, s.objet === undefined ? "Baisse du loyer convenue avec le locataire" : s.objet,
      s.signe === undefined ? AUJOURDHUI : s.signe, s.effet === undefined ? mois(1) : s.effet,
      s.loyer === undefined ? 650 : s.loyer, s.charges === undefined ? 60 : s.charges,
      s.chemin === undefined ? `${dans}/avenant-${randomUUID()}.pdf` : s.chemin, s.mime ?? "application/pdf"];
  };
  /** Enregistre un avenant sous le compte donné ; rend son identifiant. */
  async function enregistrer(par: string, b: string, s: Saisie = {}) {
    await agir(par);
    const id = (await db.query(APPEL, parametres(b, s))).rows[0].id as string;
    await base();
    return id;
  }
  /** Tente d'enregistrer ; rend le message du refus. */
  async function refuse(par: string, b: string, s: Saisie = {}) {
    await agir(par);
    const m = await refus(APPEL, parametres(b, s));
    await base();
    return m;
  }
  const leBail = async (b: string) => { await base(); return (await db.query("select loyer_hc::float8 loyer, charges::float8 charges from baux where id=$1", [b])).rows[0] as { loyer: number; charges: number }; };
  const appels = async (b: string) => { await base(); return (await db.query(`select periode::text, loyer_hc::float8 loyer, charges::float8 charges, montant_du::float8 du, prorata,
      base_loyer_hc::float8 base_loyer, base_charges::float8 base_charges from appels_loyer where bail_id=$1 order by periode`, [b])).rows; };
  const avenants = async (b: string) => { await base(); return (await db.query(`select id, objet, signe_le::text, date_effet::text, ancien_loyer_hc::float8 ancien_loyer, nouveau_loyer_hc::float8 nouveau_loyer,
      anciennes_charges::float8 anciennes_charges, nouvelles_charges::float8 nouvelles_charges, document_id, enregistre_par,
      applique_le is not null applique, annule_le is not null annule, annule_par, annulation_motif from avenants_bail where bail_id=$1 order by enregistre_le, date_effet`, [b])).rows; };
  const journal = async () => { await base(); return (await db.query("select action, account_id, details from audit_log where organization_id=$1 and action like 'avenant_bail_%' order by created_at, action desc", [org])).rows; };
  const mensuel = (periode: string, loyer: number, charges: number) => ({ periode, loyer, charges, du: loyer + charges, prorata: false, base_loyer: loyer, base_charges: charges });
  /** « Un mois a passé » : la date d'effet d'un avenant en attente est atteinte (le banc recule sa date). */
  const effetAtteint = async (avenant: string, effet: string) => { await base(); await db.query("update avenants_bail set date_effet=$2 where id=$1", [avenant, effet]); };
  /** Le loyer d'un mois, créé comme le fera le générateur le mois venu : avec les montants qu'il a lus sur le bail. */
  async function appelerLeMois(b: string, periode: string, loyer: number, charges: number) {
    await base();
    await db.query(`insert into appels_loyer(organization_id,bail_id,periode,loyer_hc,charges,montant_du,date_echeance,prorata)
      select organization_id,id,$2::date,$3,$4,$3::numeric+$4::numeric,$2::date,false from baux where id=$1`, [b, periode, loyer, charges]);
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect();
    const { rows } = await db.query("select date_trunc('month', public.aujourdhui_paris())::date::text m0, public.aujourdhui_paris()::text auj");
    M0 = rows[0].m0; AUJOURDHUI = rows[0].auj;
  });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    proprietaire = await utilisateur();
    locataire = await utilisateur();
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST avenant','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [proprietaire, org]);
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'locataire')", [locataire, org]);
    bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','1 rue fictive','75001','Paris',false) returning id", [org])).rows[0].id;
    personne = (await db.query("insert into persons(organization_id,nom,prenom,account_id) values($1,'TEST Locataire','Awa',$2) returning id", [org, locataire])).rows[0].id;
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("effet déjà atteint, loyer du mois pas encore appelé : l'avenant s'applique tout de suite, pièce et journal compris", async () => {
    const b = await bail({ debut: mois(0) });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(0), objet: "  Baisse du loyer convenue avec le locataire  " });

    expect(await leBail(b.id)).toEqual({ loyer: 650, charges: 60 });
    // Le loyer du mois est appelé dans le même geste, au montant de l'avenant.
    expect(await appels(b.id)).toEqual([mensuel(mois(0), 650, 60)]);
    const [a] = await avenants(b.id);
    expect(a).toMatchObject({ id, objet: "Baisse du loyer convenue avec le locataire", signe_le: AUJOURDHUI, date_effet: mois(0),
      ancien_loyer: 700, nouveau_loyer: 650, anciennes_charges: 50, nouvelles_charges: 60, enregistre_par: proprietaire, applique: true, annule: false });

    // La pièce signée : une fiche née avec l'avenant, rangée au bail et à l'espace.
    const { rows: [doc] } = await db.query("select type::text, titre, mime_type, deposited_by, organization_id from documents where id=$1", [a.document_id]);
    expect(doc).toEqual({ type: "justificatif", titre: `Avenant signé le ${fr(AUJOURDHUI)} — effet au ${fr(mois(0))}`, mime_type: "application/pdf", deposited_by: proprietaire, organization_id: org });
    expect((await db.query("select entite::text, entite_id from document_liens where document_id=$1 order by 1", [a.document_id])).rows)
      .toEqual([{ entite: "bail", entite_id: b.id }, { entite: "organisation", entite_id: org }]);

    const j = await journal();
    expect(j.map((x) => x.action)).toEqual(["avenant_bail_enregistre", "avenant_bail_applique"]);
    expect(j[0]).toMatchObject({ account_id: proprietaire, details: { avenant_id: id, bail_id: b.id, date_effet: mois(0), ancien_loyer_hc: 700, nouveau_loyer_hc: 650, anciennes_charges: 50, nouvelles_charges: 60, document_id: a.document_id } });
    expect(j[1]).toMatchObject({ account_id: proprietaire, details: { avenant_id: id, nouveau_loyer_hc: 650, nouvelles_charges: 60, loyer_hc_remplace: 700, charges_remplacees: 50 } });
  });

  it("les mois d'avant la date d'effet, appelés en retard, gardent l'ancien montant ; à partir d'elle, le nouveau", async () => {
    // Bail entré il y a deux mois, dont aucun loyer n'est encore appelé ; l'avenant prend effet ce mois-ci.
    const b = await bail({ debut: mois(-2) });
    await enregistrer(proprietaire, b.id, { effet: mois(0) });
    expect(await appels(b.id)).toEqual([mensuel(mois(-2), 700, 50), mensuel(mois(-1), 700, 50), mensuel(mois(0), 650, 60)]);
    expect(await leBail(b.id)).toEqual({ loyer: 650, charges: 60 });
    expect((await avenants(b.id))[0]).toMatchObject({ applique: true });
  });

  it("effet futur : l'avenant attend sans rien changer, et un second est refusé tant qu'il attend", async () => {
    const b = await bail({ debut: mois(-13), appels: true });
    const avant = await appels(b.id);
    expect(avant).toHaveLength(14);
    await enregistrer(proprietaire, b.id, { effet: mois(1) });

    expect(await leBail(b.id)).toEqual({ loyer: 700, charges: 50 });
    expect(await appels(b.id)).toEqual(avant);
    expect((await avenants(b.id))[0]).toMatchObject({ date_effet: mois(1), applique: false, annule: false, ancien_loyer: 700, nouveau_loyer: 650 });
    expect((await journal()).map((x) => x.action)).toEqual(["avenant_bail_enregistre"]);
    // Relancer la création des loyers avant le mois venu ne déclenche rien.
    await db.query("select public.generer_appels_loyer_interne($1)", [b.id]);
    expect(await leBail(b.id)).toEqual({ loyer: 700, charges: 50 });

    expect(await refuse(proprietaire, b.id, { effet: mois(2), loyer: 640 })).toBe(`Un avenant attend déjà son application (effet au ${fr(mois(1))}) : annulez-le, ou attendez qu'il s'applique`);
    expect(await avenants(b.id)).toHaveLength(1);
  });

  it("le mois venu, l'avenant en attente s'applique au loyer appelé — par la tâche automatique, sans personne", async () => {
    const b = await bail({ debut: mois(-13), appels: true });
    const avant = await appels(b.id);
    const id = await enregistrer(proprietaire, b.id, { effet: mois(1) });
    // Le mois suivant arrive : le générateur a lu l'ancien loyer sur le bail, et crée le loyer du mois.
    await appelerLeMois(b.id, mois(1), 700, 50);

    expect(await appels(b.id)).toEqual([...avant, mensuel(mois(1), 650, 60)]);
    expect(await leBail(b.id)).toEqual({ loyer: 650, charges: 60 });
    expect((await avenants(b.id))[0]).toMatchObject({ id, applique: true });
    const j = await journal();
    expect(j.map((x) => x.action)).toEqual(["avenant_bail_enregistre", "avenant_bail_applique"]);
    // Appliqué par la tâche automatique : aucun compte n'est noté.
    expect(j[1]).toMatchObject({ account_id: null, details: { avenant_id: id, loyer_hc_remplace: 700, charges_remplacees: 50 } });
    // Les loyers déjà appelés n'ont pas bougé.
    expect((await appels(b.id)).slice(0, avant.length)).toEqual(avant);
  });

  it("plusieurs mois rattrapés d'un coup par le générateur : l'ancien montant avant la date d'effet, le nouveau ensuite", async () => {
    const b = await bail({ debut: mois(-3) });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(1) });
    expect(await appels(b.id)).toEqual([]);
    await effetAtteint(id, mois(-1));
    // Un seul passage du générateur : il lit le bail UNE fois (700 + 50), puis crée quatre mois.
    await db.query("select public.generer_appels_loyer_interne($1)", [b.id]);
    expect(await appels(b.id)).toEqual([mensuel(mois(-3), 700, 50), mensuel(mois(-2), 700, 50), mensuel(mois(-1), 650, 60), mensuel(mois(0), 650, 60)]);
    expect(await leBail(b.id)).toEqual({ loyer: 650, charges: 60 });
  });

  it("sortie en cours de mois : le loyer du mois d'effet est proratisé sur le NOUVEAU montant, comme le fait le générateur", async () => {
    const b = await bail({ debut: mois(-1) });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(1) });
    await base();
    const sortie = `${mois(0).slice(0, 8)}15`;
    await db.query("update baux set date_fin=$2 where id=$1", [b.id, sortie]);
    await effetAtteint(id, mois(0));
    await db.query("select public.generer_appels_loyer_interne($1)", [b.id]);

    const n = joursDuMois(mois(0));
    const loyer = Math.round((650 * 15 / n) * 100) / 100, charges = Math.round((60 * 15 / n) * 100) / 100;
    const [m1, m0] = await appels(b.id);
    expect(m1).toEqual(mensuel(mois(-1), 700, 50));
    expect(m0.loyer).toBeCloseTo(loyer, 2);
    expect(m0.charges).toBeCloseTo(charges, 2);
    expect(m0.du).toBeCloseTo(m0.loyer + m0.charges, 2);
    // La base mensuelle retenue pour ce mois proratisé est celle de l'avenant.
    expect(m0).toMatchObject({ periode: mois(0), prorata: true, base_loyer: 650, base_charges: 60 });
  });

  it("le calcul du déclencheur reste celui du générateur : entrée et sortie en cours de mois donnent la même ligne qu'un bail né aux nouveaux montants", async () => {
    const ligne = async (b: string, periode: string) => {
      await base();
      return (await db.query(`select periode::text, loyer_hc::text, charges::text, montant_du::text, prorata, base_loyer_hc::float8 base_loyer,
        base_charges::float8 base_charges, date_echeance::text from appels_loyer where bail_id=$1 and periode=$2`, [b, periode])).rows[0];
    };
    const jour = (premier: string, j: number) => `${premier.slice(0, 8)}${String(j).padStart(2, "0")}`;
    // Sortie le 15 du mois d'effet ; entrée le 10 du mois d'effet ; entrée le 10 et sortie le 20 du même mois.
    const cas: { nom: string; debut: string; fin: string | null; effet: string }[] = [
      { nom: "sortie en cours de mois", debut: mois(-1), fin: jour(mois(0), 15), effet: mois(0) },
      { nom: "entrée en cours de mois", debut: jour(mois(-1), 10), fin: null, effet: mois(-1) },
      { nom: "entrée et sortie le même mois", debut: jour(mois(-1), 10), fin: jour(mois(-1), 20), effet: mois(-1) },
    ];
    for (const c of cas) {
      const avecAvenant = await bail({ debut: c.debut, fin: c.fin, etat: c.fin ? "preavis" : "actif" });
      await enregistrer(proprietaire, avecAvenant.id, { effet: c.effet, loyer: 633.33, charges: 47.5 });
      const natif = await bail({ debut: c.debut, fin: c.fin, etat: c.fin ? "preavis" : "actif", loyer: 633.33, charges: 47.5, appels: true });
      const attendu = await ligne(natif.id, c.effet);
      expect(attendu, c.nom).toBeDefined();
      expect(attendu.prorata, c.nom).toBe(true);
      expect(await ligne(avecAvenant.id, c.effet), c.nom).toEqual(attendu);
    }
  });

  it("bail repris en cours, ou qui n'a pas encore commencé : jamais d'effet avant le premier loyer que Gerimmo appelle", async () => {
    // Bail entré il y a vingt mois, repris ce mois-ci : Gerimmo n'appelle ses loyers que depuis ce mois.
    const repris = await bail({ debut: mois(-20), suivisDepuis: mois(0) });
    expect(await refuse(proprietaire, repris.id, { effet: mois(-2) })).toBe(`La date d'effet ne peut pas précéder le premier loyer de ce bail suivi dans Gerimmo : au plus tôt le ${fr(mois(0))}`);
    await enregistrer(proprietaire, repris.id, { effet: mois(0) });
    // Aucun loyer d'avant la reprise n'est créé au passage.
    expect(await appels(repris.id)).toEqual([mensuel(mois(0), 650, 60)]);
    expect(await leBail(repris.id)).toEqual({ loyer: 650, charges: 60 });

    // Bail signé qui commence dans deux mois : l'avenant ne peut pas prendre effet avant l'entrée ; il attend.
    const aVenir = await bail({ debut: mois(2) });
    expect(await refuse(proprietaire, aVenir.id, { effet: mois(1) })).toBe(`La date d'effet ne peut pas précéder le premier loyer de ce bail suivi dans Gerimmo : au plus tôt le ${fr(mois(2))}`);
    await enregistrer(proprietaire, aVenir.id, { effet: mois(2) });
    expect((await avenants(aVenir.id))[0]).toMatchObject({ date_effet: mois(2), applique: false });
    expect(await appels(aVenir.id)).toEqual([]);
    expect(await leBail(aVenir.id)).toEqual({ loyer: 700, charges: 50 });
  });

  it("le déclencheur n'agit que là où un avenant s'applique : jamais sur un bail sans avenant, ni après coup, ni pour un avenant annulé", async () => {
    // 1. Bail sans avenant : la ligne créée reste celle écrite.
    const sans = await bail({ debut: mois(0) });
    await appelerLeMois(sans.id, mois(0), 123, 4);
    expect(await appels(sans.id)).toEqual([mensuel(mois(0), 123, 4)]);

    // 2. Avenant appliqué lors d'un passage PRÉCÉDENT : le générateur lit désormais le bail à jour, sa ligne fait foi.
    const b = await bail({ debut: mois(0) });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(0) });
    await db.query("update avenants_bail set applique_le = now() - interval '1 day' where id=$1", [id]);
    await appelerLeMois(b.id, mois(1), 1, 1);
    expect((await appels(b.id)).at(-1)).toEqual(mensuel(mois(1), 1, 1));

    // 3. Avenant annulé avant son effet : le mois venu, rien ne change.
    const c = await bail({ debut: mois(-1), appels: true });
    const annule = await enregistrer(proprietaire, c.id, { effet: mois(1) });
    await agir(proprietaire);
    await db.query("select public.annuler_avenant_bail($1,$2,$3)", [org, annule, "Les parties ont renoncé à la baisse."]);
    await appelerLeMois(c.id, mois(1), 700, 50);
    expect((await appels(c.id)).at(-1)).toEqual(mensuel(mois(1), 700, 50));
    expect(await leBail(c.id)).toEqual({ loyer: 700, charges: 50 });
    expect((await avenants(c.id))[0]).toMatchObject({ applique: false, annule: true });
  });

  it("annulation : seulement tant que l'avenant attend, avec un motif ; ensuite un nouvel avenant redevient possible", async () => {
    const b = await bail({ debut: mois(-1), appels: true });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(1) });

    await agir(locataire);
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [org, id, "Je ne suis plus d'accord."])).toBe("Accès refusé");
    await agir(proprietaire);
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [org, id, "non"])).toBe("Indiquez le motif de l'annulation (5 à 500 caractères)");
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [org, randomUUID(), "Avenant inconnu."])).toBe("Accès refusé");
    await db.query("select public.annuler_avenant_bail($1,$2,$3)", [org, id, "  Erreur de saisie sur le montant.  "]);
    expect((await avenants(b.id))[0]).toMatchObject({ applique: false, annule: true, annule_par: proprietaire, annulation_motif: "Erreur de saisie sur le montant." });
    // Rejouer l'annulation ne change rien et n'écrit pas une seconde ligne au journal.
    await agir(proprietaire);
    await db.query("select public.annuler_avenant_bail($1,$2,$3)", [org, id, "Second motif, ignoré."]);
    expect((await avenants(b.id))[0].annulation_motif).toBe("Erreur de saisie sur le montant.");
    expect((await journal()).map((x) => x.action)).toEqual(["avenant_bail_enregistre", "avenant_bail_annule"]);
    expect((await journal())[1]).toMatchObject({ account_id: proprietaire, details: { avenant_id: id, motif: "Erreur de saisie sur le montant." } });
    // La pièce de l'avenant annulé reste au dossier : rien n'est effacé.
    expect((await db.query("select count(*)::int n from documents where organization_id=$1", [org])).rows[0].n).toBe(1);

    // La place est libre : un nouvel avenant, même date d'effet, s'enregistre et s'applique le mois venu.
    const second = await enregistrer(proprietaire, b.id, { effet: mois(1), loyer: 660, charges: 50 });
    await appelerLeMois(b.id, mois(1), 700, 50);
    expect(await leBail(b.id)).toEqual({ loyer: 660, charges: 50 });
    // Appliqué : il ne s'annule plus.
    await agir(proprietaire);
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [org, second, "Trop tard pour revenir en arrière."]))
      .toBe("Cet avenant est déjà appliqué au bail : il ne s'annule plus. Une nouvelle modification passe par un nouvel avenant");
    expect(await leBail(b.id)).toEqual({ loyer: 660, charges: 50 });
  });

  it("refus à l'enregistrement : chaque règle dit pourquoi, et aucun refus ne laisse de trace (ni avenant, ni pièce)", async () => {
    const b = await bail({ debut: mois(-13), appels: true });
    const cas: [Saisie, string | RegExp][] = [
      [{ objet: "non" }, "Indiquez l'objet de l'avenant (5 à 500 caractères)"],
      [{ objet: "x".repeat(501) }, "Indiquez l'objet de l'avenant (5 à 500 caractères)"],
      [{ signe: null }, "La date de signature de l'avenant est obligatoire, et ne peut pas être dans le futur"],
      [{ signe: mois(2) }, "La date de signature de l'avenant est obligatoire, et ne peut pas être dans le futur"],
      [{ signe: mois(-40) }, "La date de signature de l'avenant est antérieure au bail : vérifiez-la"],
      [{ loyer: 0 }, "Le nouveau loyer hors charges est un montant positif, au centime"],
      [{ loyer: -5 }, "Le nouveau loyer hors charges est un montant positif, au centime"],
      [{ loyer: 650.123 }, "Le nouveau loyer hors charges est un montant positif, au centime"],
      [{ loyer: null }, "Le nouveau loyer hors charges est un montant positif, au centime"],
      [{ charges: -1 }, "Les nouvelles charges sont un montant positif ou nul, au centime"],
      [{ charges: 60.999 }, "Les nouvelles charges sont un montant positif ou nul, au centime"],
      [{ loyer: 700, charges: 50 }, "Cet avenant ne change ni le loyer ni les charges : rien à enregistrer ici"],
      [{ effet: null }, "La date d'effet d'un avenant est le 1er d'un mois"],
      [{ effet: `${mois(1).slice(0, 8)}15` }, "La date d'effet d'un avenant est le 1er d'un mois"],
      // Le loyer du mois courant est déjà appelé : l'avenant ne le réécrit pas.
      [{ effet: mois(0) }, `Des loyers sont déjà appelés jusqu'à ${fr(mois(0)).slice(3)} : un avenant ne modifie pas un loyer déjà appelé. Sa date d'effet est au plus tôt le ${fr(mois(1))}`],
      [{ effet: mois(-3) }, `Des loyers sont déjà appelés jusqu'à ${fr(mois(0)).slice(3)} : un avenant ne modifie pas un loyer déjà appelé. Sa date d'effet est au plus tôt le ${fr(mois(1))}`],
      [{ effet: mois(25) }, "Date d'effet trop lointaine (plus de deux ans) : vérifiez-la"],
      [{ chemin: null }, "L'avenant signé est obligatoire : déposez la pièce"],
      [{ chemin: "   " }, "L'avenant signé est obligatoire : déposez la pièce"],
      // La pièce doit être rangée dans le dossier de CET espace, et être un PDF ou une image.
      [{ chemin: `${randomUUID()}/avenant.pdf` }, "Chemin de fichier invalide"],
      [{ mime: "application/zip" }, "Format refusé : PDF, JPEG ou PNG uniquement"],
    ];
    for (const [saisie, attendu] of cas) {
      const m = await refuse(proprietaire, b.id, saisie);
      if (typeof attendu === "string") expect(m, JSON.stringify(saisie)).toBe(attendu); else expect(m, JSON.stringify(saisie)).toMatch(attendu);
    }
    // Seul un bail en cours reçoit un avenant.
    for (const etat of ["brouillon", "termine"]) {
      const autre = await bail({ debut: mois(-2), etat, fin: etat === "termine" ? mois(-1) : null });
      expect(await refuse(proprietaire, autre.id), etat).toBe("Un avenant ne s'enregistre que sur un bail en cours");
    }
    // Un bail qui se termine : pas d'effet après sa fin.
    const finissant = await bail({ debut: mois(-2), etat: "preavis", fin: `${mois(1).slice(0, 8)}20`, appels: true });
    expect(await refuse(proprietaire, finissant.id, { effet: mois(2) })).toBe(`Le bail se termine le ${fr(`${mois(1).slice(0, 8)}20`)} : l'avenant prendrait effet après sa fin`);
    // … mais un bail en préavis reçoit un avenant pour un mois qu'il couvre encore.
    await enregistrer(proprietaire, finissant.id, { effet: mois(1) });

    await base();
    expect((await db.query("select count(*)::int n from avenants_bail where organization_id=$1", [org])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from documents where organization_id=$1", [org])).rows[0].n).toBe(1);
    expect(await leBail(b.id)).toEqual({ loyer: 700, charges: 50 });
    expect(await avenants(b.id)).toEqual([]);
  });

  it("hausse du loyer refusée quand le dernier diagnostic classe le logement F ou G ; la baisse reste possible", async () => {
    const b = await bail({ debut: mois(-13), appels: true });
    const dpe = async (classe: string, realiseIlYA: number) => {
      await base();
      await db.query(`insert into diagnostics(organization_id,lot_id,type,date_realisation,date_expiration,classe_dpe)
        values($1,$2,'dpe',public.aujourdhui_paris()-$4::int,public.aujourdhui_paris()+3000,$3)`, [org, b.lot, classe, realiseIlYA]);
    };
    await dpe("G", 200);
    expect(await refuse(proprietaire, b.id, { loyer: 750, charges: 50 }))
      .toBe("Hausse du loyer refusée : le dernier diagnostic classe ce logement G (même règle que pour la révision annuelle). Si votre situation relève d'une exception, faites-la confirmer par un juriste");
    // Une baisse du loyer, ou un changement des seules charges, n'est pas une hausse du loyer.
    const baisse = await enregistrer(proprietaire, b.id, { loyer: 690, charges: 70 });
    await agir(proprietaire);
    await db.query("select public.annuler_avenant_bail($1,$2,$3)", [org, baisse, "Essai : on rejoue avec un autre diagnostic."]);
    // Un diagnostic plus récent classe le logement D : la hausse redevient possible.
    await dpe("D", 10);
    await enregistrer(proprietaire, b.id, { loyer: 750, charges: 50 });
    expect((await avenants(b.id)).at(-1)).toMatchObject({ nouveau_loyer: 750, applique: false, annule: false });
  });

  it("une révision annuelle passée entre l'enregistrement et l'effet : le montant signé s'applique, le journal garde ce qu'il a remplacé", async () => {
    const b = await bail({ debut: mois(-13), appels: true, irl: true });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(1), loyer: 800, charges: 50, objet: "Loyer porté à 800 euros après travaux" });
    await agir(proprietaire);
    const an = Number(AUJOURDHUI.slice(0, 4));
    const { rows: [r] } = await db.query("select public.reviser_loyer($1, 142, $2)::float8 nouveau", [b.id, `T1 ${an - 1}`]);
    expect(r.nouveau).toBe(710);
    expect(await leBail(b.id)).toEqual({ loyer: 710, charges: 50 });

    await appelerLeMois(b.id, mois(1), 710, 50);
    expect(await leBail(b.id)).toEqual({ loyer: 800, charges: 50 });
    expect((await appels(b.id)).at(-1)).toEqual(mensuel(mois(1), 800, 50));
    // L'avenant garde ce que les parties ont lu en le signant (700) ; le journal dit ce qu'il a réellement remplacé (710).
    expect((await avenants(b.id))[0]).toMatchObject({ id, ancien_loyer: 700, nouveau_loyer: 800, applique: true });
    expect((await journal()).at(-1)).toMatchObject({ action: "avenant_bail_applique", details: { loyer_hc_remplace: 710, nouveau_loyer_hc: 800 } });
  });

  it("isolation : le locataire, un autre espace, un compte sans espace et un visiteur ne lisent ni n'écrivent rien", async () => {
    const b = await bail({ debut: mois(-1), appels: true });
    const id = await enregistrer(proprietaire, b.id, { effet: mois(1) });

    // Un autre espace, avec son propre bail.
    const voisin = await utilisateur(), sansEspace = await utilisateur();
    const orgB = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST avenant voisin','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id as string;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [voisin, orgB]);
    const chezVoisin = await bail({ debut: mois(-1), appels: true, dans: orgB });

    const lire = async (qui: string) => { await agir(qui); const n = (await db.query("select count(*)::int n from public.avenants_bail")).rows[0].n as number; await base(); return n; };
    expect(await lire(proprietaire)).toBe(1);
    for (const [qui, nom] of [[locataire, "locataire"], [voisin, "voisin"], [sansEspace, "sans espace"]] as const) {
      expect(await lire(qui), nom).toBe(0);
      expect(await refuse(qui, b.id, { effet: mois(2), loyer: 600 }), nom).toBe("Accès refusé");
      await agir(qui);
      expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [org, id, "Annulation par un tiers."]), nom).toBe("Accès refusé");
      expect(await refus("select public.appliquer_avenant_bail_interne($1)", [id]), nom).toMatch(/permission denied/);
    }
    // Le voisin ne fait pas passer le bail d'un autre par son propre espace, ni l'inverse.
    expect(await refuse(voisin, b.id, { dans: orgB, effet: mois(2), loyer: 600 })).toBe("Accès refusé");
    expect(await refuse(proprietaire, chezVoisin.id, { effet: mois(2), loyer: 600 })).toBe("Accès refusé");
    await agir(voisin);
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [orgB, id, "Annulation par l'espace voisin."])).toBe("Accès refusé");

    // Personne n'écrit un avenant à la main, pas même qui gère le bail.
    await agir(proprietaire);
    expect(await refus("insert into public.avenants_bail(organization_id,bail_id,objet,signe_le,date_effet,ancien_loyer_hc,nouveau_loyer_hc,anciennes_charges,nouvelles_charges,document_id) select organization_id,bail_id,objet,signe_le,date_effet + 31,1,2,1,2,document_id from public.avenants_bail")).toMatch(/permission denied/);
    expect(await refus("update public.avenants_bail set nouveau_loyer_hc = 1")).toMatch(/permission denied/);
    expect(await refus("delete from public.avenants_bail")).toMatch(/permission denied/);
    // Le visiteur : rien du tout.
    await agir(null, "anon");
    expect(await refus("select * from public.avenants_bail")).toMatch(/permission denied/);
    expect(await refus(APPEL, parametres(b.id, { effet: mois(2), loyer: 600 }))).toMatch(/permission denied/);
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [org, id, "Annulation par un visiteur."])).toMatch(/permission denied/);

    await base();
    expect(await avenants(b.id)).toHaveLength(1);
    expect((await avenants(b.id))[0]).toMatchObject({ id, applique: false, annule: false });
    expect((await db.query("select has_function_privilege('anon',$1,'execute') a, has_function_privilege('authenticated','public.appliquer_avenant_bail_interne(uuid)','execute') b, has_function_privilege('authenticated','public.appliquer_avenant_a_l_appel()','execute') c", [SIGNATURE])).rows[0])
      .toEqual({ a: false, b: false, c: false });
  });

  it("agence : l'administrateur enregistre ; l'agent hors portefeuille ne lit ni n'écrit l'avenant d'un bail qu'il ne gère pas", async () => {
    const admin = await utilisateur(), agent = await utilisateur();
    const agence = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST avenant agence','agence','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id as string;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'admin_agence'),($3,$2,'agent')", [admin, agence, agent]);
    const b = await bail({ debut: mois(-1), appels: true, dans: agence });
    await agir(agent);
    expect((await db.query("select public.bail_hors_portefeuille($1,$2) hors", [agence, b.id])).rows[0].hors).toBe(true);
    expect(await refuse(agent, b.id, { dans: agence, effet: mois(1) })).toBe("Accès refusé");
    const id = await enregistrer(admin, b.id, { dans: agence, effet: mois(1) });
    await agir(agent);
    expect((await db.query("select count(*)::int n from public.avenants_bail")).rows[0].n).toBe(0);
    expect(await refus("select public.annuler_avenant_bail($1,$2,$3)", [agence, id, "Annulation hors portefeuille."])).toBe("Accès refusé");
    await agir(admin);
    expect((await db.query("select count(*)::int n from public.avenants_bail")).rows[0].n).toBe(1);
  });

  it("la migration se rejoue ; son retour retire l'application automatique sans rien effacer ni défaire", async () => {
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const objets = async () => { await base(); return (await db.query(`select
        to_regclass('public.avenants_bail') is not null as "table",
        to_regprocedure($1) is not null as enregistrer,
        to_regprocedure('public.annuler_avenant_bail(uuid,uuid,text)') is not null as annuler,
        to_regprocedure('public.appliquer_avenant_bail_interne(uuid)') is not null as appliquer,
        (select count(*)::int from pg_trigger where tgname='a_avenant_du_bail' and tgrelid='public.appels_loyer'::regclass) as declencheurs`, [SIGNATURE])).rows[0]; };
    const TOUT = { table: true, enregistrer: true, annuler: true, appliquer: true, declencheurs: 1 };

    // Un avenant déjà appliqué, et un autre en attente.
    const applique = await bail({ debut: mois(0) });
    await enregistrer(proprietaire, applique.id, { effet: mois(0) });
    const attente = await bail({ debut: mois(-1), appels: true });
    await enregistrer(proprietaire, attente.id, { effet: mois(1) });

    expect(await objets()).toEqual(TOUT);
    // Tous les déclencheurs des AUTRES tables, avant et après : la migration ne doit en poser ni en retirer aucun.
    const ailleurs = async () => (await db.query(`select c.relname||'.'||t.tgname||':'||t.tgenabled::text nom from pg_trigger t
      join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname in ('public','support_interne') and c.relname <> 'avenants_bail' order by 1`)).rows.map((r) => r.nom as string);
    const avant = await ailleurs();
    expect(avant).toContain("appels_loyer.a_avenant_du_bail:O");
    await db.query(migration);
    expect(await objets()).toEqual(TOUT);
    expect(await ailleurs()).toEqual(avant);
    expect((await db.query(`select t.tgname from pg_trigger t where t.tgrelid='public.avenants_bail'::regclass and not t.tgisinternal order by 1`)).rows.map((r) => r.tgname))
      .toEqual(["abonnement_avenants_bail", "diagnostic_artisan_lecture", "traversee_lecture_seule"]);
    // Le rejeu ne vide rien et ne rouvre rien.
    expect((await db.query("select count(*)::int n from avenants_bail where organization_id=$1", [org])).rows[0].n).toBe(2);
    expect((await db.query(`select has_table_privilege('anon','public.avenants_bail','select') a, has_table_privilege('authenticated','public.avenants_bail','insert') b,
      has_function_privilege('anon',$1,'execute') c, relrowsecurity d from pg_class where oid='public.avenants_bail'::regclass`, [SIGNATURE])).rows[0])
      .toEqual({ a: false, b: false, c: false, d: true });

    await db.query("insert into supabase_migrations.schema_migrations(version,name) values('20261122190000','avenants_bail') on conflict do nothing");
    await db.query(retour);
    expect(await objets()).toEqual({ table: true, enregistrer: false, annuler: false, appliquer: false, declencheurs: 0 });
    expect((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261122190000'")).rows[0].n).toBe(0);
    // Rien n'est effacé, rien n'est défait : les deux avenants restent, le bail déjà modifié garde son nouveau loyer.
    expect((await db.query("select count(*)::int n from avenants_bail where organization_id=$1", [org])).rows[0].n).toBe(2);
    expect(await leBail(applique.id)).toEqual({ loyer: 650, charges: 60 });
    await agir(proprietaire);
    expect((await db.query("select count(*)::int n from public.avenants_bail")).rows[0].n).toBe(2);
    // L'avenant en attente ne s'applique plus tout seul : le loyer du mois suivant reste celui écrit.
    await appelerLeMois(attente.id, mois(1), 700, 50);
    expect((await appels(attente.id)).at(-1)).toEqual(mensuel(mois(1), 700, 50));
    expect(await leBail(attente.id)).toEqual({ loyer: 700, charges: 50 });
    await db.query(retour);
    expect(await objets()).toEqual({ table: true, enregistrer: false, annuler: false, appliquer: false, declencheurs: 0 });

    // La migration rejouée après le retour : l'avenant resté en attente s'applique au loyer suivant.
    await db.query(migration);
    expect(await objets()).toEqual(TOUT);
    await appelerLeMois(attente.id, mois(2), 700, 50);
    expect((await appels(attente.id)).at(-1)).toEqual(mensuel(mois(2), 650, 60));
    expect(await leBail(attente.id)).toEqual({ loyer: 650, charges: 60 });
  });
});
