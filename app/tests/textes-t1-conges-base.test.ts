/**
 * Textes officiels, lot T1 (25/11/2026) — migration 20261125101500 : ce que la base accepte et refuse à l'enregistrement
 * d'un congé.
 *
 * Avant : un congé du bailleur reçu le lendemain de la date limite passait (« réception + préavis <= terme + 1 jour ») ;
 * en zone tendue, le locataire avait un mois de préavis d'office ; une société non familiale pouvait enregistrer un congé
 * pour reprise en location nue.
 *
 * Ici : les exemples chiffrés de la notice annexée à l'arrêté du 13 décembre 2017 (recueil fourni par le dirigeant),
 * joués contre `enregistrer_conge` et `date_limite_conge_bailleur`. Le dernier bloc rejoue la migration et son retour
 * dans la transaction du test : le fichier tourne en série (FICHIERS_EN_SERIE de vitest.config.ts).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";
import { dateLimiteCongeBailleur } from "@/lib/delai-conge-bailleur";

const NOM = "20261125101500_conge_textes_officiels_t1";
const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);

describe.skipIf(!url)("congés : date limite du bailleur, préavis du locataire, reprise par une société (avec base)", () => {
  let db: Client, org: string, compte: string, lot: string, bien: string, locataire: string, bailleur: string;

  async function agir(id: string) {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" })]);
    await db.query("set local role authenticated");
  }
  /** Un bail actif sur le lot du décor. `debut` fixe le terme : un bail nu de trois ans commencé le 21/09/2024 finit le 20/09/2027. */
  async function bail(debut: string, sur: { type?: string; zone?: boolean | null } = {}) {
    await db.query("reset role");
    // La zone tendue du bail est figée depuis celle du bien : le décor la pose aux deux endroits.
    await db.query("update public.biens set zone_tendue=$2 where id=$1", [bien, sur.zone === undefined ? false : sur.zone]);
    const id = (await db.query(`insert into baux(organization_id,lot_id,locataire_principal,type,etat,date_debut,loyer_hc,charges,depot_garantie,jour_echeance,zone_tendue)
      values($1,$2,$3,$4,'actif',$5,450,50,450,1,$6) returning id`, [org, lot, locataire, sur.type ?? "nu", debut, sur.zone === undefined ? false : sur.zone])).rows[0].id as string;
    await agir(compte);
    return id;
  }
  /** Tente l'enregistrement dans un point de reprise : rend la date d'effet et le préavis, ou le message du refus. */
  async function conge(bailId: string, par: "bailleur" | "locataire", reception: string, sur: { preavis?: number; motif?: string | null; prix?: number | null; beneficiaire?: string | null } = {}) {
    await db.query("savepoint essai");
    try {
      await db.query("select public.enregistrer_conge($1,$2::public.conge_par,$3::date,$4::smallint,$5,null,$6,$7)",
        [bailId, par, reception, sur.preavis ?? 3, sur.motif === undefined ? (par === "bailleur" ? "Motif légitime et sérieux" : null) : sur.motif, sur.prix ?? null, sur.beneficiaire ?? null]);
      await db.query("reset role");
      const ligne = (await db.query<{ date_effet: string; preavis_mois: number }>("select date_effet::text, preavis_mois from public.conges where bail_id=$1", [bailId])).rows[0];
      await db.query("rollback to savepoint essai");
      await agir(compte);
      return ligne;
    } catch (e) {
      await db.query("rollback to savepoint essai");
      await agir(compte);
      return { refus: (e as Error).message };
    }
  }

  beforeAll(async () => { db = new Client({ connectionString: url }); await db.connect(); });
  beforeEach(async () => {
    await db.query("begin"); await db.query("reset role");
    compte = randomUUID();
    await db.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{}','{}',now(),now())`, [compte, `${compte}@test.local`]);
    org = (await db.query("insert into organizations(name,type,status,essai_fin) values('TEST congés T1','proprietaire_direct','essai',public.aujourdhui_paris()+30) returning id")).rows[0].id;
    await db.query("insert into memberships(account_id,organization_id,role) values($1,$2,'proprietaire_direct')", [compte, org]);
    bien = (await db.query("insert into biens(organization_id,nom,type,address_line1,postal_code,city,zone_tendue) values($1,'TEST Bien','appartement','1 rue fictive','69003','Lyon',false) returning id", [org])).rows[0].id;
    lot = (await db.query("insert into lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST Appartement','loue') returning id", [org, bien])).rows[0].id;
    locataire = (await db.query("insert into persons(organization_id,nom,prenom) values($1,'TEST Locataire','Awa') returning id", [org])).rows[0].id;
    bailleur = (await db.query("insert into persons(organization_id,nom,prenom,qualite) values($1,'TEST Bailleur','Paul','Personne physique') returning id", [org])).rows[0].id;
    await db.query("insert into detentions(organization_id,lot_id,person_id,quote_part,date_debut) values($1,$2,$3,100,'2020-01-01')", [org, lot, bailleur]);
    await agir(compte);
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("R13-A1 — les exemples de la notice : la date limite passe, le lendemain est refusé avec la bonne date dans le message", async () => {
    // [début du bail nu de trois ans, terme (dernier jour), dernière réception admise, lendemain]
    const cas: [string, string, string, string][] = [
      ["2024-06-16", "2027-06-15", "2026-12-15", "2026-12-16"],
      ["2024-07-01", "2027-06-30", "2026-12-31", "2027-01-01"],
      ["2024-09-01", "2027-08-31", "2027-02-28", "2027-03-01"],
      ["2025-09-01", "2028-08-31", "2028-02-29", "2028-03-01"],
      ["2024-09-21", "2027-09-20", "2027-03-20", "2027-03-21"],
    ];
    for (const [debut, terme, limite, lendemain] of cas) {
      const id = await bail(debut);
      expect(await conge(id, "bailleur", limite), `${terme} reçu le ${limite}`).toEqual({ date_effet: terme, preavis_mois: 6 });
      const refus = await conge(id, "bailleur", lendemain);
      const fr = (iso: string) => iso.split("-").reverse().join("/");
      expect("refus" in refus && refus.refus, `${terme} reçu le ${lendemain}`).toBe(
        `Congé du bailleur tardif : le bail arrive à son terme le ${fr(terme)}, le congé devait être reçu par le locataire au plus tard le ${fr(limite)} (préavis de 6 mois). Reçu le ${fr(lendemain)}, il serait sans effet pour ce terme (wiki Bail § 1.11)`);
      await db.query("reset role");
      await db.query("delete from public.baux where id=$1", [id]);
      await agir(compte);
    }
  });

  it("R13-A1 — meublé (trois mois, même règle par prudence) : terme le 20 septembre, reçu le 20 juin admis, le 21 juin refusé", async () => {
    const id = await bail("2026-09-21", { type: "meuble" });
    expect(await conge(id, "bailleur", "2027-06-20")).toEqual({ date_effet: "2027-09-20", preavis_mois: 3 });
    const refus = await conge(id, "bailleur", "2027-06-21");
    expect("refus" in refus && refus.refus).toContain("au plus tard le 20/06/2027 (préavis de 3 mois)");
  });

  it("la fonction de base et le calcul de l'application rendent la même date limite, jour par jour, sur quatre ans", async () => {
    await db.query("reset role");
    const { rows } = await db.query<{ terme: string; n: number; limite: string }>(
      `select t::date::text terme, n, public.date_limite_conge_bailleur(t::date, n)::text limite
         from generate_series('2026-01-01'::date, '2029-12-31'::date, interval '1 day') t, (values (3),(6)) v(n)`);
    expect(rows.length).toBe(2 * 1461);
    for (const r of rows) expect(dateLimiteCongeBailleur(r.terme, r.n), `${r.terme} / ${r.n} mois`).toBe(r.limite);
    expect((await db.query("select public.date_limite_conge_bailleur(null, 6) a, public.date_limite_conge_bailleur('2027-06-30', 0) b")).rows[0]).toEqual({ a: null, b: null });
  });

  it("R02-A5 — locataire en zone tendue : trois mois par défaut, un mois seulement quand l'enregistrement le demande", async () => {
    const id = await bail("2024-09-21", { zone: true });
    expect(await conge(id, "locataire", "2026-12-01", { preavis: 3 })).toEqual({ date_effet: "2027-03-01", preavis_mois: 3 });
    expect(await conge(id, "locataire", "2026-12-01", { preavis: 1 })).toEqual({ date_effet: "2027-01-01", preavis_mois: 1 });
  });

  it("R02-A5 — hors zone tendue, zone inconnue et meublé : inchangés", async () => {
    const hors = await bail("2024-09-21", { zone: false });
    expect(await conge(hors, "locataire", "2026-12-01", { preavis: 3 })).toEqual({ date_effet: "2027-03-01", preavis_mois: 3 });
    const refus = await conge(hors, "locataire", "2026-12-01", { preavis: 1 });
    expect("refus" in refus && refus.refus).toMatch(/^Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire/);
    await db.query("reset role"); await db.query("delete from public.baux where id=$1", [hors]); await agir(compte);
    const inconnue = await bail("2024-09-21", { zone: null });
    expect(await conge(inconnue, "locataire", "2026-12-01", { preavis: 1 })).toEqual({ date_effet: "2027-01-01", preavis_mois: 1 });
    expect(await conge(inconnue, "locataire", "2026-12-01", { preavis: 3 })).toEqual({ date_effet: "2027-03-01", preavis_mois: 3 });
    await db.query("reset role"); await db.query("delete from public.baux where id=$1", [inconnue]); await agir(compte);
    const meuble = await bail("2026-09-21", { type: "meuble", zone: true });
    expect(await conge(meuble, "locataire", "2026-12-01", { preavis: 3 })).toEqual({ date_effet: "2027-01-01", preavis_mois: 1 });
  });

  it("R13-A5 — reprise en location nue : refusée pour une SCI non familiale ou une personne morale, admise pour une personne physique et une SCI familiale", async () => {
    const reprise = { motif: "Reprise (bénéficiaire familial)", beneficiaire: "Marie Dupont, fille du bailleur" };
    const qualite = async (q: string) => { await db.query("reset role"); await db.query("update public.persons set qualite=$2 where id=$1", [bailleur, q]); await agir(compte); };
    // Bailleur société : le bail nu dure six ans (21/09/2024 → 20/09/2030).
    for (const q of ["SCI", "Personne morale"]) {
      await qualite(q);
      const id = await bail("2024-09-21");
      const refus = await conge(id, "bailleur", "2030-01-10", reprise);
      expect("refus" in refus && refus.refus, q).toMatch(/^Congé pour reprise impossible : le bailleur est une société \(SCI non familiale ou autre personne morale\)\./);
      // La vente reste possible pour une société.
      expect(await conge(id, "bailleur", "2030-01-10", { motif: "Vente du logement", prix: 250000 }), q).toEqual({ date_effet: "2030-09-20", preavis_mois: 6 });
      await db.query("reset role"); await db.query("delete from public.baux where id=$1", [id]); await agir(compte);
    }
    for (const q of ["Personne physique", "SCI familiale", "Indivision (personnes physiques)"]) {
      await qualite(q);
      const id = await bail("2024-09-21");
      expect(await conge(id, "bailleur", "2027-01-10", reprise), q).toEqual({ date_effet: "2027-09-20", preavis_mois: 6 });
      await db.query("reset role"); await db.query("delete from public.baux where id=$1", [id]); await agir(compte);
    }
    // Meublé : non contrôlé (le texte fourni ne le dit pas).
    await qualite("SCI");
    const meuble = await bail("2026-09-21", { type: "meuble" });
    expect(await conge(meuble, "bailleur", "2027-01-10", reprise)).toEqual({ date_effet: "2027-09-20", preavis_mois: 3 });
  });

  it("droits : la fonction de calcul est interne ; `enregistrer_conge` reste fermée à anon ; la colonne dit ce qu'elle contient", async () => {
    await db.query("reset role");
    const droits = (await db.query(`select
        has_function_privilege('anon','public.date_limite_conge_bailleur(date,integer)','execute') calcul_anon,
        has_function_privilege('authenticated','public.date_limite_conge_bailleur(date,integer)','execute') calcul_connecte,
        has_function_privilege('anon','public.enregistrer_conge(uuid,public.conge_par,date,smallint,text,uuid,numeric,text)','execute') conge_anon,
        has_function_privilege('authenticated','public.enregistrer_conge(uuid,public.conge_par,date,smallint,text,uuid,numeric,text)','execute') conge_connecte`)).rows[0];
    expect(droits).toEqual({ calcul_anon: false, calcul_connecte: false, conge_anon: false, conge_connecte: true });
    const commentaire = (await db.query("select col_description('public.conges'::regclass, (select attnum from pg_attribute where attrelid='public.conges'::regclass and attname='date_premiere_presentation')) c")).rows[0].c;
    expect(commentaire).toContain("Date de réception du congé par son destinataire");
  });

  it("rejeu de la migration sans effet ; son retour rend l'ancienne règle (et ses défauts) ; la marche avant repart ; aucun congé enregistré n'est touché", async () => {
    // Un congé enregistré sous la nouvelle règle : il doit traverser le rejeu, le retour et la marche avant sans changer.
    const temoin = await bail("2024-09-21", { zone: true });
    await db.query("select public.enregistrer_conge($1,'locataire','2026-12-01'::date,3::smallint)", [temoin]);
    await db.query("reset role");
    const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8");
    const retour = readFileSync(`supabase/retours-arriere/${NOM}.retour.sql`, "utf8");
    const etat = async () => (await db.query(`select
        to_regprocedure('public.date_limite_conge_bailleur(date,integer)') is not null calcul,
        pg_get_functiondef('public.enregistrer_conge(uuid,public.conge_par,date,smallint,text,uuid,numeric,text)'::regprocedure) like '%if v_effet > v_terme then%' limite,
        pg_get_functiondef('public.enregistrer_conge(uuid,public.conge_par,date,smallint,text,uuid,numeric,text)'::regprocedure) like '%ajuster_appel_fin_de_bail%' dernier_terme,
        (select date_effet::text || '/' || preavis_mois from public.conges where bail_id=$1) temoin`, [temoin])).rows[0];
    const apres = { calcul: true, limite: true, dernier_terme: true, temoin: "2027-03-01/3" };
    expect(await etat()).toEqual(apres);
    await db.query(migration);
    expect(await etat()).toEqual(apres);
    await db.query(retour);
    expect(await etat()).toEqual({ calcul: false, limite: false, dernier_terme: true, temoin: "2027-03-01/3" });
    // L'ancienne règle est bien revenue : le lendemain de la date limite repasse, la zone tendue redonne un mois d'office.
    await db.query("delete from public.baux where id=$1", [temoin]);
    const ancien = await bail("2024-09-21", { zone: true });
    expect(await conge(ancien, "bailleur", "2027-03-21")).toEqual({ date_effet: "2027-09-20", preavis_mois: 6 });
    expect(await conge(ancien, "locataire", "2026-12-01", { preavis: 3 })).toEqual({ date_effet: "2027-01-01", preavis_mois: 1 });
    await db.query("reset role");
    await db.query(retour);
    await db.query(migration);
    expect((await etat()).limite).toBe(true);
    await agir(compte);
    expect("refus" in (await conge(ancien, "bailleur", "2027-03-21"))).toBe(true);
    expect(await conge(ancien, "locataire", "2026-12-01", { preavis: 3 })).toEqual({ date_effet: "2027-03-01", preavis_mois: 3 });
  });
});
