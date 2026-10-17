/**
 * Report ou annulation d'un rendez-vous confirmé par le LOCATAIRE (décision D22 du 14/10/2026, option B ;
 * fiches LOC-21, CHN-01, REP-04 ; migration 20261014620000).
 *
 * Ce que ces tests gardent, dans l'ordre des critères d'acceptation de la fiche (C.12) :
 *   1. une demande de report laisse le rendez-vous confirmé intact tant que l'artisan n'a pas répondu ;
 *   2. l'accord de l'artisan déplace le rendez-vous (ancien créneau caduc, nouveau retenu), et le rendez-vous reporté
 *      reçoit son propre rappel même si l'ancienne date a déjà été rappelée ;
 *   3. le refus de l'artisan maintient le rendez-vous et ouvre l'arbitrage du gérant ;
 *   4. sans réponse dans le délai, la demande expire, le rendez-vous reste, le gérant est alerté ;
 *   5. l'annulation prend effet immédiatement, avec alerte au gérant (« tardive » à moins de 24 h), sans sanction ;
 *   6. deux reports n'ouvrent pas l'arbitrage « six refus » ; le troisième est refusé avec renvoi au gestionnaire ;
 *   7. rejeu : même clé, aucun doublon ; clic répété sur « Accepter » ou « Confirmer » : succès silencieux ;
 *   8. une date de report en conflit avec un autre rendez-vous confirmé de l'artisan est refusée ;
 *   9. un autre locataire, un ancien locataire, un autre artisan, une autre agence : rien ;
 *  10. un rendez-vous passé ou démarré ne se reporte ni ne s'annule par ce circuit.
 *
 * Nécessite SUPABASE_DB_URL (base locale jetable). Une seule transaction, annulée à la fin ; un point de reprise par cas.
 * RDV_LOCATAIRE_PREVIEW=1 applique la migration dans la transaction (base qui ne l'a pas encore).
 */
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifierBaseDeTest } from "./garde-base";

const url = process.env.SUPABASE_DB_URL;
verifierBaseDeTest(url);
const migration = readFileSync(
  new URL("../supabase/migrations/20261014620000_rendez_vous_locataire_report_annulation.sql", import.meta.url),
  "utf8"
);

// Des instants ronds, à sept jours : « date(h) » = début de l'heure h après ce point.
const instant = Math.ceil((Date.now() + 7 * 86400000) / 3600000) * 3600000;
const date = (heure: number) => new Date(instant + heure * 3600000).toISOString();
const troisDates = (depart = 24) => [
  { debut: date(depart), fin: date(depart + 2) },
  { debut: date(depart + 24), fin: date(depart + 26) },
  { debut: date(depart + 48), fin: date(depart + 50) },
];
const MOTIF = "empechement";

describe.skipIf(!url)("D22 — report ou annulation d'un rendez-vous par le locataire", () => {
  let db: Client;
  let org: string, orgB: string, gerant: string, gerantB: string, loc: string, locB: string, locVoisin: string, locAncien: string, locColoc: string;
  let cptArtisan: string, cptArtisanB: string, artisan: string;
  let mission: string, creneau: string;

  const id = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0].id as string;
  const postgres = async () => { await db.query("reset role"); await db.query("select set_config('request.jwt.claims','',true)"); };
  async function agir(uid: string) {
    await postgres();
    await db.query("select set_config('request.jwt.claims',json_build_object('sub',$1::text,'role','authenticated','aal','aal2')::text,true)", [uid]);
    await db.query("set local role authenticated");
  }
  async function essai<T>(f: () => Promise<T>): Promise<T> {
    await db.query("savepoint essai");
    try { const r = await f(); await db.query("release savepoint essai"); return r; }
    catch (e) { await db.query("rollback to savepoint essai"); throw e; }
  }
  async function utilisateur() {
    return id("insert into auth.users(id,email,encrypted_password,email_confirmed_at) values(gen_random_uuid(),$1,'x',now()) returning id", [`d22-${randomUUID()}@example.invalid`]);
  }
  /** Un lot loué, le bail du locataire `l`, un incident qualifié, une mission acceptée pour `a`. */
  async function creerMission(a = artisan, o = org, l = loc, etatBail = "actif") {
    await postgres();
    const bien = await id("insert into public.biens(organization_id,nom,type,address_line1,postal_code,city) values($1,'TEST D22','appartement','1 rue TEST','75001','Paris') returning id", [o]);
    const lot = await id("insert into public.lots(organization_id,bien_id,nom,etat) values($1,$2,'TEST','loue') returning id", [o, bien]);
    const personne = (await db.query("select id from public.persons where organization_id=$1 and account_id=$2 limit 1", [o, l])).rows[0]?.id
      ?? await id("insert into public.persons(organization_id,account_id,nom,prenom,email) values($1,$2,'TEST','Léa',$3) returning id", [o, l, `lea-${randomUUID().slice(0, 8)}@example.invalid`]);
    const bail = await id("insert into public.baux(organization_id,lot_id,locataire_principal,etat,date_debut,loyer_hc,charges) values($1,$2,$3,$4,current_date-30,500,50) returning id", [o, lot, personne, etatBail]);
    const incident = await id("insert into public.incidents(organization_id,numero,lot_id,bail_id,declarant_person_id,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,$5,'espace_locataire','plomberie_canalisation','TEST D22','qualifie','proprietaire','TEST') returning id", [o, `TEST-${randomUUID().slice(0, 8)}`, lot, bail, personne]);
    return id("insert into public.incident_interventions(organization_id,incident_id,artisan_id,nature_travaux,statut) values($1,$2,$3,'entretien_courant','acceptee') returning id", [o, incident, a]);
  }
  async function slot(m: string, debut = 0, fin = 2, auteur = "artisan", o = org) {
    await postgres();
    return id("insert into public.intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin) values($1,$2,$3,1,$4,$5) returning id", [o, m, auteur, date(debut), date(fin)]);
  }
  /** Le chemin du produit : l'artisan a proposé, le locataire retient → mission planifiée. */
  async function planifier(m = mission, debut = 0, u = loc, o = org) {
    const cr = await slot(m, debut, debut + 2, "artisan", o);
    await agir(u);
    await db.query("select public.choisir_creneau($1,$2)", [o, cr]);
    return cr;
  }
  async function etat(m = mission) {
    await postgres();
    return (await db.query("select statut,debut_prevu,fin_prevue from public.incident_interventions where id=$1", [m])).rows[0];
  }
  async function creneaux(m = mission) {
    await postgres();
    return (await db.query("select id,statut,propose_par,demande_id,debut from public.intervention_creneaux where intervention_id=$1 order by created_at,debut", [m])).rows;
  }
  async function demandes(m = mission) {
    await postgres();
    return (await db.query("select * from public.intervention_demandes_rdv where intervention_id=$1 order by demandee_le", [m])).rows;
  }
  async function evenements(m = mission) {
    await postgres();
    return (await db.query("select type,details from public.incident_evenements where details->>'intervention_id'=$1 order by created_at", [m])).rows;
  }
  async function alertes(m = mission) {
    await postgres();
    return (await db.query("select type,statut,criticite,closed_action,details from public.alerts where details->>'intervention_id'=$1 order by created_at", [m])).rows;
  }
  async function demanderReport(opts: { cle?: string; dates?: { debut: string; fin: string }[]; motif?: string; texte?: string | null; u?: string; m?: string; o?: string } = {}) {
    await agir(opts.u ?? loc);
    const { rows } = await db.query("select public.demander_report_rdv($1,$2,$3,$4,$5,$6) as id", [
      opts.o ?? org, opts.m ?? mission, opts.motif ?? MOTIF, opts.texte ?? "Je ne serai pas là", JSON.stringify(opts.dates ?? troisDates()), opts.cle ?? randomUUID(),
    ]);
    return rows[0].id as string;
  }
  async function annuler(opts: { cle?: string; motif?: string; u?: string; m?: string; o?: string } = {}) {
    await agir(opts.u ?? loc);
    const { rows } = await db.query("select public.annuler_rdv_locataire($1,$2,$3,$4,$5) as id", [
      opts.o ?? org, opts.m ?? mission, opts.motif ?? MOTIF, "Finalement réparé", opts.cle ?? randomUUID(),
    ]);
    return rows[0].id as string;
  }
  async function accepter(cr: string, u = cptArtisan) { await agir(u); return db.query("select public.accepter_creneau_locataire($1)", [cr]); }
  async function refuser(m = mission, u = cptArtisan) { await agir(u); return db.query("select public.refuser_creneaux_locataire($1,$2)", [m, "Chantier à l'autre bout de la ville ces jours-là"]); }
  async function datesDeLaDemande(demande: string) {
    await postgres();
    return (await db.query("select id,statut,debut from public.intervention_creneaux where demande_id=$1 order by debut", [demande])).rows;
  }
  async function mesRendezVous(u = loc, o = org) {
    await agir(u);
    return (await db.query("select * from public.mes_rendez_vous_locataire($1)", [o])).rows;
  }
  async function mesDemandesArtisan(u = cptArtisan) {
    await agir(u);
    return (await db.query("select * from public.mes_demandes_rdv_artisan()")).rows;
  }
  /** Déplace l'horloge de la demande : expirée depuis une heure. */
  async function expirer(demande: string) {
    await postgres();
    await db.query("update public.intervention_demandes_rdv set expire_le = now() - interval '1 hour' where id=$1", [demande]);
  }
  /** Rapproche le rendez-vous confirmé : dans `heures` heures. */
  async function rendezVousDans(heures: number, m = mission) {
    await postgres();
    await db.query("update public.incident_interventions set debut_prevu = now() + make_interval(hours => $2), fin_prevue = now() + make_interval(hours => $2 + 2) where id=$1", [m, heures]);
    await db.query("update public.intervention_creneaux set debut = now() + make_interval(hours => $2), fin = now() + make_interval(hours => $2 + 2) where intervention_id=$1 and statut='retenu'", [m, heures]);
  }

  beforeAll(async () => {
    db = new Client({ connectionString: url }); await db.connect(); await db.query("begin");
    if (process.env.RDV_LOCATAIRE_PREVIEW === "1") await db.query(migration);
    org = await id("insert into public.organizations(name,status) values('D22 TEST','active') returning id");
    orgB = await id("insert into public.organizations(name,status) values('D22 TEST B','active') returning id");
    const comptes: string[] = []; for (let n = 0; n < 9; n++) comptes.push(await utilisateur());
    [gerant, gerantB, loc, locB, locVoisin, locAncien, cptArtisan, cptArtisanB, locColoc] = comptes;
    await db.query(
      `insert into public.memberships(account_id,organization_id,role) values
         ($1,$2,'admin_agence'),($3,$4,'admin_agence'),($5,$2,'locataire'),($6,$4,'locataire'),($7,$2,'locataire'),($8,$2,'locataire'),($9,$2,'locataire')`,
      [gerant, org, gerantB, orgB, loc, locB, locVoisin, locAncien, locColoc]
    );
    const art = async (u: string) => id("insert into public.artisans(account_id,raison_sociale,siret,telephone,email,statut_plateforme,siret_etat) values($1,'TEST D22',$2,'0600000000','artisan@example.invalid','valide','verifie') returning id", [u, String(randomInt(10000000000000, 99999999999999))]);
    artisan = await art(cptArtisan); await art(cptArtisanB);
  });
  beforeEach(async () => {
    await postgres(); await db.query("savepoint cas");
    mission = await creerMission();
    creneau = await planifier(mission, 0);
  });
  afterEach(async () => { await db.query("rollback to savepoint cas"); await postgres(); });
  afterAll(async () => { await db?.query("rollback"); await db?.end(); });

  // ── 1. La demande de report ne touche pas au rendez-vous ─────────────────────────────────────────────────────────
  it("C.12-1 : la demande est en attente, les trois dates sont proposées, le rendez-vous confirmé est inchangé", async () => {
    const avant = await etat();
    expect(avant.statut).toBe("planifiee");
    const demande = await demanderReport();
    const [d] = await demandes();
    expect(d).toMatchObject({ id: demande, type: "report", statut: "en_attente", motif_code: MOTIF, motif_texte: "Je ne serai pas là", creneau_retenu_id: creneau });
    expect(new Date(d.rdv_debut).toISOString()).toBe(date(0));
    // L'artisan répond dans les 48 h, et au plus tard au début du rendez-vous (ici le rendez-vous est à 7 jours).
    expect(Math.abs(new Date(d.expire_le).getTime() - (Date.now() + 48 * 3600000))).toBeLessThan(60000);
    const apres = await etat();
    expect(apres).toEqual(avant);
    const dates = await datesDeLaDemande(demande);
    expect(dates.map((c) => c.statut)).toEqual(["propose", "propose", "propose"]);
    expect((await creneaux()).find((c) => c.id === creneau)?.statut).toBe("retenu");
    expect((await evenements()).map((e) => e.type)).toEqual(["creneau_retenu", "rdv_report_demande"]);
    // L'artisan voit la demande et son motif ; le locataire voit la sienne et ne peut plus en envoyer une seconde.
    expect(await mesDemandesArtisan()).toMatchObject([{ demande_id: demande, type: "report", statut: "en_attente", motif_code: MOTIF, motif_texte: "Je ne serai pas là" }]);
    const [rv] = await mesRendezVous();
    expect(rv).toMatchObject({ intervention_id: mission, demande_id: demande, demande_statut: "en_attente", report_possible: false, annulation_possible: true, reports_restants: 1 });
  });

  it("C.7 : moins de trois dates, doublons ou dates passées sont refusés comme pour la contre-proposition", async () => {
    await expect(essai(() => demanderReport({ dates: troisDates().slice(0, 2) }))).rejects.toThrow(/trois nouvelles disponibilités/);
    const doublon = troisDates(); doublon[1] = { ...doublon[0] };
    await expect(essai(() => demanderReport({ dates: doublon }))).rejects.toThrow(/différentes/);
    const passee = troisDates(); passee[0] = { debut: new Date(Date.now() - 3600000).toISOString(), fin: new Date(Date.now() + 3600000).toISOString() };
    await expect(essai(() => demanderReport({ dates: passee }))).rejects.toThrow(/dans le futur/);
    await expect(essai(() => demanderReport({ motif: "vacances_a_bali" }))).rejects.toThrow(/motif/);
    await expect(essai(() => demanderReport({ texte: "x".repeat(1001) }))).rejects.toThrow(/trop longue/);
    expect(await demandes()).toEqual([]);
    expect((await creneaux()).filter((c) => c.propose_par === "locataire")).toEqual([]);
  });

  it("C.7 : une demande déjà en attente refuse la seconde ; le locataire peut retirer la sienne", async () => {
    const demande = await demanderReport();
    await expect(essai(() => demanderReport())).rejects.toThrow(/attend déjà la réponse/);
    await agir(loc);
    await db.query("select public.retirer_demande_rdv($1,$2)", [org, demande]);
    expect((await demandes())[0]).toMatchObject({ statut: "retiree" });
    expect((await datesDeLaDemande(demande)).map((c) => c.statut)).toEqual(["caduc", "caduc", "caduc"]);
    expect((await evenements()).map((e) => e.type)).toContain("rdv_report_retire");
    // Retirer deux fois : la seconde lit « déjà traitée ».
    await agir(loc);
    await expect(essai(() => db.query("select public.retirer_demande_rdv($1,$2)", [org, demande]))).rejects.toThrow(/déjà été traitée/);
    // Une demande retirée ne consomme pas le plafond : une nouvelle demande part.
    const deuxieme = await demanderReport();
    expect((await mesRendezVous())[0]).toMatchObject({ reports_restants: 1 });
    // L'artisan ne peut plus retenir une date retirée : elle est caduque.
    await expect(essai(async () => accepter((await datesDeLaDemande(demande))[0].id))).rejects.toThrow(/plus proposée/);
    // La preuve par le plafond lui-même : la deuxième est acceptée, une troisième demande part encore (la retirée ne
    // compte pas) ; compter la retirée l'aurait refusée (« déjà fait l'objet de 2 demandes »).
    await accepter((await datesDeLaDemande(deuxieme))[0].id);
    await demanderReport({ dates: troisDates(200) });
    expect((await demandes()).map((d) => d.statut)).toEqual(["retiree", "acceptee", "en_attente"]);
  });

  // ── 2. L'accord de l'artisan déplace le rendez-vous ──────────────────────────────────────────────────────────────
  it("C.12-2 : l'artisan retient une date — ancien créneau caduc, nouveau retenu, mission planifiée aux nouvelles dates", async () => {
    const demande = await demanderReport();
    const [, deuxieme] = await datesDeLaDemande(demande);
    await accepter(deuxieme.id);
    const apres = await etat();
    expect(apres.statut).toBe("planifiee");
    expect(new Date(apres.debut_prevu).toISOString()).toBe(date(48));
    expect(new Date(apres.fin_prevue).toISOString()).toBe(date(50));
    const tous = await creneaux();
    expect(tous.find((c) => c.id === creneau)?.statut).toBe("caduc");
    expect(tous.find((c) => c.id === deuxieme.id)?.statut).toBe("retenu");
    // D21 : les deux autres dates sont écartées, pas refusées — elles ne comptent pas dans les six refus.
    expect(tous.filter((c) => c.demande_id === demande && c.id !== deuxieme.id).map((c) => c.statut)).toEqual(["caduc", "caduc"]);
    expect(tous.filter((c) => c.statut === "refuse")).toEqual([]);
    const [d] = await demandes();
    expect(d).toMatchObject({ statut: "acceptee", creneau_accepte_id: deuxieme.id });
    expect(d.repondu_le).not.toBeNull();
    const types = (await evenements()).map((e) => e.type);
    expect(types).toEqual(["creneau_retenu", "rdv_report_demande", "creneau_retenu", "rdv_report_accepte"]);
    const [rv] = await mesRendezVous();
    expect(rv).toMatchObject({ demande_statut: "acceptee", report_possible: true, reports_restants: 1 });
    expect(new Date(rv.nouveau_debut).toISOString()).toBe(date(48));
  });

  it("C.12-2 : le rendez-vous reporté a droit à son rappel même si l'ancienne date a déjà été rappelée", async () => {
    await postgres();
    // Le rendez-vous est demain 9 h à Paris : la tâche le rappelle, et trace le rappel.
    await db.query(`update public.incident_interventions set debut_prevu = ((now() at time zone 'Europe/Paris')::date + 1 + time '09:00') at time zone 'Europe/Paris', fin_prevue = ((now() at time zone 'Europe/Paris')::date + 1 + time '11:00') at time zone 'Europe/Paris' where id=$1`, [mission]);
    await db.query(`update public.intervention_creneaux set debut = ((now() at time zone 'Europe/Paris')::date + 1 + time '09:00') at time zone 'Europe/Paris', fin = ((now() at time zone 'Europe/Paris')::date + 1 + time '11:00') at time zone 'Europe/Paris' where id=$1`, [creneau]);
    const avant = (await db.query("select destinataire from public.rendez_vous_a_rappeler(200) where intervention_id=$1", [mission])).rows;
    expect(avant.map((r) => r.destinataire).sort()).toEqual(["artisan", "locataire"]);
    for (const qui of ["artisan", "locataire"]) {
      const { rows } = await db.query("select public.marquer_rappel_envoye($1,'veille',$2,'x@example.invalid') as ok", [mission, qui]);
      expect(rows[0].ok).toBe(true);
    }
    expect((await db.query("select destinataire from public.rendez_vous_a_rappeler(200) where intervention_id=$1", [mission])).rows).toEqual([]);
    // Deux passes le même jour : la trace n'est pas doublée.
    expect((await db.query("select public.marquer_rappel_envoye($1,'veille','locataire','x@example.invalid') as ok", [mission])).rows[0].ok).toBe(false);
    // Le rendez-vous est dans moins de 24 h : le report n'est plus possible ici (le locataire l'annulerait ou appellerait).
    // On recule donc l'horloge du rendez-vous à J+2 pour pouvoir le reporter, en gardant la trace du rappel « veille ».
    await db.query(`update public.incident_interventions set debut_prevu = debut_prevu + interval '1 day', fin_prevue = fin_prevue + interval '1 day' where id=$1`, [mission]);
    await db.query(`update public.intervention_creneaux set debut = debut + interval '1 day', fin = fin + interval '1 day' where id=$1`, [creneau]);
    // Le locataire demande un report ; l'artisan retient « demain 14 h » : un autre rendez-vous, à rappeler lui aussi
    // la veille, alors que l'échéance « veille » de la mission est déjà tracée pour l'ancien créneau.
    await postgres();
    const demain9 = (await db.query(`select (((now() at time zone 'Europe/Paris')::date + 1 + time '14:00') at time zone 'Europe/Paris') as d, (((now() at time zone 'Europe/Paris')::date + 1 + time '16:00') at time zone 'Europe/Paris') as f`)).rows[0];
    const demande = await demanderReport({ dates: [{ debut: new Date(demain9.d).toISOString(), fin: new Date(demain9.f).toISOString() }, troisDates()[1], troisDates()[2]] });
    const [premiere] = await datesDeLaDemande(demande);
    await accepter(premiere.id);
    await postgres();
    const apres = (await db.query("select destinataire from public.rendez_vous_a_rappeler(200) where intervention_id=$1", [mission])).rows;
    // Sans le correctif, la trace de l'ancienne date (DEC-09) aurait étouffé ce rappel.
    expect(apres.map((r) => r.destinataire).sort()).toEqual(["artisan", "locataire"]);
    const traces = (await db.query("select echeance, destinataire, debut_prevu from public.intervention_rappels where intervention_id=$1 order by envoye_le", [mission])).rows;
    expect(traces).toHaveLength(2);
    expect(traces.every((t) => t.debut_prevu !== null)).toBe(true);
  });

  // ── 3. Le refus de l'artisan ──────────────────────────────────────────────────────────────────────────────────────
  it("C.12-3 : l'artisan refuse avec motif — rendez-vous maintenu, demande refusée, alerte d'arbitrage au gérant", async () => {
    const avant = await etat();
    const demande = await demanderReport();
    await refuser();
    expect(await etat()).toEqual(avant);
    expect((await creneaux()).find((c) => c.id === creneau)?.statut).toBe("retenu");
    const [d] = await demandes();
    expect(d).toMatchObject({ id: demande, statut: "refusee", reponse_motif: "Chantier à l'autre bout de la ville ces jours-là" });
    expect((await datesDeLaDemande(demande)).map((c) => c.statut)).toEqual(["refuse", "refuse", "refuse"]);
    const types = (await evenements()).map((e) => e.type);
    expect(types).toContain("creneaux_refuses");
    expect(types).toContain("rdv_report_refuse");
    expect(await alertes()).toMatchObject([{ type: "creneaux_arbitrage", statut: "ouverte", criticite: "critique" }]);
    // Le locataire lit le refus et son motif ; il n'y a plus de demande en attente, mais le rendez-vous tient.
    const [rv] = await mesRendezVous();
    expect(rv).toMatchObject({ demande_statut: "refusee", reponse_motif: "Chantier à l'autre bout de la ville ces jours-là", annulation_possible: true });
    expect(new Date(rv.rdv_debut).toISOString()).toBe(date(0));
    // Le gérant arbitre : la demande est tranchée, l'alerte d'arbitrage se ferme (fonction existante).
    await agir(gerant);
    await db.query("select public.fixer_creneau_arbitrage($1,$2,$3,$4,'Accord par téléphone')", [org, mission, date(72), date(74)]);
    expect((await demandes())[0].statut).toBe("refusee");
    expect((await alertes()).map((a) => a.statut)).toEqual(["fermee"]);
  });

  it("l'arbitrage du gérant tranche une demande encore en attente (arbitree) et ferme les alertes du locataire", async () => {
    await demanderReport();
    await agir(gerant);
    await db.query("select public.fixer_creneau_arbitrage_motive($1,$2,$3,$4,'Accord par téléphone',null)", [org, mission, date(72), date(74)]);
    const [d] = await demandes();
    expect(d).toMatchObject({ statut: "arbitree", reponse_motif: "Rendez-vous fixé par le gestionnaire" });
    expect((await datesDeLaDemande(d.id)).map((c) => c.statut)).toEqual(["caduc", "caduc", "caduc"]);
    expect(new Date((await etat()).debut_prevu).toISOString()).toBe(date(72));
  });

  // ── 4. Le silence de l'artisan ────────────────────────────────────────────────────────────────────────────────────
  it("C.12-4 : sans réponse dans le délai, la demande expire, le rendez-vous reste, le gérant est alerté", async () => {
    const avant = await etat();
    const demande = await demanderReport();
    // Encore dans son délai : la tâche n'y touche pas.
    await postgres();
    expect((await db.query("select public.expirer_demandes_rdv() as n")).rows[0].n).toBe(0);
    expect((await demandes())[0]).toMatchObject({ statut: "en_attente" });
    expect(await alertes()).toEqual([]);
    await expirer(demande);
    // Avant le passage de la tâche, le locataire et l'artisan lisent déjà « expirée », et l'artisan ne peut plus accepter.
    expect((await mesRendezVous())[0].demande_statut).toBe("expiree");
    expect((await mesDemandesArtisan())[0].statut).toBe("expiree");
    await expect(essai(async () => accepter((await datesDeLaDemande(demande))[0].id))).rejects.toThrow(/délai de réponse .* dépassé/);
    await postgres();
    const { rows } = await db.query("select public.expirer_demandes_rdv() as n");
    expect(rows[0].n).toBe(1);
    expect((await demandes())[0]).toMatchObject({ statut: "expiree" });
    expect((await datesDeLaDemande(demande)).map((c) => c.statut)).toEqual(["caduc", "caduc", "caduc"]);
    expect(await etat()).toEqual(avant);
    expect((await evenements()).map((e) => e.type)).toContain("rdv_report_expire");
    expect(await alertes()).toMatchObject([{ type: "rdv_demande_sans_reponse", statut: "ouverte", criticite: "normale" }]);
    // Une seconde passe ne refait rien.
    expect((await db.query("select public.expirer_demandes_rdv() as n")).rows[0].n).toBe(0);
    expect(await alertes()).toHaveLength(1);
    // Le locataire peut redemander (le plafond compte la demande expirée : il lui en reste une).
    expect((await mesRendezVous())[0]).toMatchObject({ report_possible: true, reports_restants: 1 });
  });

  it("C.12-4 : une organisation dont l'écriture est fermée ne voit pas ses demandes échues expirées par la tâche", async () => {
    const demande = await demanderReport();
    await expirer(demande);
    // Le statut d'une organisation n'est modifiable que par le super admin : la garde est levée pour ce seul geste.
    await db.query("set local session_replication_role = replica");
    await db.query("update public.organizations set status='suspendue' where id=$1", [org]);
    await db.query("set local session_replication_role = origin");
    expect((await db.query("select public.org_ecriture_ouverte($1) as o", [org])).rows[0].o).toBe(false);
    expect((await db.query("select public.expirer_demandes_rdv() as n")).rows[0].n).toBe(0);
    expect((await demandes())[0]).toMatchObject({ statut: "en_attente" });
    expect(await alertes()).toEqual([]);
  });

  it("l'expiration est réservée à la tâche planifiée : un compte connecté est refusé", async () => {
    await agir(gerant);
    await expect(essai(() => db.query("select public.expirer_demandes_rdv()"))).rejects.toThrow(/tache planifiee|permission denied/);
  });

  it("demande échue avant le passage de la tâche : le locataire n'est pas bloqué, la demande expire avec son alerte", async () => {
    const premiere = await demanderReport();
    await expirer(premiere);
    // Ce que l'écran lit : la demande est expirée, le report est de nouveau possible, l'annulation ne serait pas tardive.
    expect((await mesRendezVous())[0]).toMatchObject({ demande_statut: "expiree", report_possible: true, reports_restants: 1, annulation_tardive: false });
    // Retirer une demande échue n'est plus possible : elle sortirait du plafond et le gérant ne serait jamais alerté.
    await agir(loc);
    await expect(essai(() => db.query("select public.retirer_demande_rdv($1,$2)", [org, premiere]))).rejects.toThrow(/délai de réponse de l'artisan est dépassé/);
    expect((await demandes())[0]).toMatchObject({ statut: "en_attente" });
    // Une nouvelle demande part : l'échue passe d'abord « expirée », avec son événement et l'alerte « sans réponse ».
    const seconde = await demanderReport({ dates: troisDates(200) });
    const liste = await demandes();
    expect(liste.find((d) => d.id === premiere)).toMatchObject({ statut: "expiree" });
    expect(liste.find((d) => d.id === seconde)).toMatchObject({ statut: "en_attente" });
    expect((await datesDeLaDemande(premiere)).map((c) => c.statut)).toEqual(["caduc", "caduc", "caduc"]);
    expect((await evenements()).map((e) => e.type)).toContain("rdv_report_expire");
    expect(await alertes()).toMatchObject([{ type: "rdv_demande_sans_reponse", statut: "ouverte" }]);
    // La tâche ne la compte pas une seconde fois.
    await postgres();
    expect((await db.query("select public.expirer_demandes_rdv() as n")).rows[0].n).toBe(0);
  });

  it("demande échue avant le passage de la tâche : l'annulation l'expire (alerte « sans réponse ») au lieu de la retirer", async () => {
    const report = await demanderReport();
    await expirer(report);
    await annuler();
    expect((await demandes()).find((d) => d.id === report)).toMatchObject({ statut: "expiree" });
    expect((await alertes()).map((a) => a.type).sort()).toEqual(["rdv_annule_locataire", "rdv_demande_sans_reponse"]);
    expect((await demandes()).find((d) => d.type === "annulation")).toMatchObject({ tardive: false });
  });

  // ── 5. L'annulation (option B : effet immédiat, alerte) ───────────────────────────────────────────────────────────
  it("C.12-5 : l'annulation rend le créneau caduc, la mission revient à fixer, le gérant est alerté ; aucune sanction", async () => {
    const demande = await annuler();
    const apres = await etat();
    expect(apres).toMatchObject({ statut: "acceptee", debut_prevu: null, fin_prevue: null });
    expect((await creneaux()).find((c) => c.id === creneau)?.statut).toBe("caduc");
    const [d] = await demandes();
    expect(d).toMatchObject({ id: demande, type: "annulation", statut: "acceptee", tardive: false, creneau_retenu_id: creneau });
    expect((await evenements()).map((e) => e.type)).toEqual(["creneau_retenu", "rdv_annule_par_locataire"]);
    expect(await alertes()).toMatchObject([{ type: "rdv_annule_locataire", statut: "ouverte", criticite: "normale" }]);
    // Le locataire lit l'annulation ; plus rien à reporter ni annuler tant qu'il n'y a pas de nouveau rendez-vous.
    const [rv] = await mesRendezVous();
    expect(rv).toMatchObject({ statut_mission: "acceptee", demande_type: "annulation", report_possible: false, annulation_possible: false });
    // L'artisan la lit aussi, avec le motif.
    expect(await mesDemandesArtisan()).toMatchObject([{ type: "annulation", motif_code: MOTIF }]);
    // Aucun « rendez-vous manqué » n'est imputé à l'artisan (C.15-5).
    await agir(cptArtisan);
    expect((await db.query("select rdv_manques from public.ma_note_artisan()")).rows[0].rdv_manques).toBe(0);
    // L'accord de l'artisan reste exigé pour tout nouveau créneau : il repropose, le locataire choisit — et l'alerte se ferme.
    await agir(cptArtisan);
    await db.query("select public.proposer_creneaux($1,$2)", [mission, JSON.stringify(troisDates(100))]);
    const nouveau = (await creneaux()).find((c) => c.statut === "propose" && c.propose_par === "artisan")!;
    await agir(loc);
    await db.query("select public.choisir_creneau($1,$2)", [org, nouveau.id]);
    expect((await etat()).statut).toBe("planifiee");
    expect(await alertes()).toMatchObject([{ type: "rdv_annule_locataire", statut: "fermee", closed_action: "Nouveau rendez-vous fixé" }]);
  });

  it("C.12-5 : à moins de 24 h, l'annulation reste possible, elle est tracée « tardive » et l'alerte le dit", async () => {
    await rendezVousDans(12);
    // Le report, lui, n'est plus possible : le locataire est renvoyé vers l'annulation ou son gestionnaire.
    expect((await mesRendezVous())[0]).toMatchObject({ report_possible: false, annulation_possible: true, annulation_tardive: true });
    await expect(essai(() => demanderReport())).rejects.toThrow(/moins de 24 heures/);
    await annuler();
    expect((await demandes())[0]).toMatchObject({ type: "annulation", tardive: true });
    expect((await evenements()).at(-1)).toMatchObject({ type: "rdv_annule_par_locataire", details: expect.objectContaining({ tardive: true }) });
    expect(await alertes()).toMatchObject([{ type: "rdv_annule_tardif", statut: "ouverte", criticite: "normale" }]);
  });

  it("une annulation retire la demande de report en attente, qui tombait avec le rendez-vous", async () => {
    const report = await demanderReport();
    await annuler();
    const liste = await demandes();
    // Les deux demandes naissent dans la même transaction de test (même instant) : on les lit par type.
    expect(liste.map((d) => [d.type, d.statut]).sort()).toEqual([["annulation", "acceptee"], ["report", "retiree"]]);
    expect((await datesDeLaDemande(report)).map((c) => c.statut)).toEqual(["caduc", "caduc", "caduc"]);
  });

  // ── 6. Le plafond, et pas d'arbitrage fantôme ─────────────────────────────────────────────────────────────────────
  it("C.12-6 : deux reports acceptés n'ouvrent pas l'arbitrage « six refus » ; le troisième renvoie au gestionnaire", async () => {
    for (const depart of [24, 200]) {
      const demande = await demanderReport({ dates: troisDates(depart) });
      const [premiere] = await datesDeLaDemande(demande);
      await accepter(premiere.id);
    }
    expect((await creneaux()).filter((c) => c.statut === "refuse")).toEqual([]);
    expect((await alertes()).filter((a) => a.type === "creneaux_arbitrage")).toEqual([]);
    expect((await mesRendezVous())[0]).toMatchObject({ report_possible: false, reports_restants: 0, annulation_possible: true });
    await expect(essai(() => demanderReport({ dates: troisDates(400) }))).rejects.toThrow(/déjà fait l'objet de 2 demandes de report .* contactez votre gestionnaire/);
    // L'artisan peut toujours déplacer le rendez-vous de son côté (fonction existante) : rien n'est bloqué pour lui.
    await agir(cptArtisan);
    await db.query("select public.proposer_creneaux($1,$2)", [mission, JSON.stringify(troisDates(500))]);
    expect((await etat()).statut).toBe("acceptee");
  });

  // ── 7. Rejeu ──────────────────────────────────────────────────────────────────────────────────────────────────────
  it("C.12-7 : la même clé d'envoi rend la même demande, sans doublon de dates ni d'événement", async () => {
    const cle = randomUUID();
    const a = await demanderReport({ cle });
    const b = await demanderReport({ cle, dates: troisDates(300) });
    expect(b).toBe(a);
    expect(await demandes()).toHaveLength(1);
    expect(await datesDeLaDemande(a)).toHaveLength(3);
    expect((await evenements()).filter((e) => e.type === "rdv_report_demande")).toHaveLength(1);
    // Même chose pour l'annulation : une seule demande, un seul événement, une seule alerte.
    await agir(loc);
    await db.query("select public.retirer_demande_rdv($1,$2)", [org, a]);
    const cle2 = randomUUID();
    const c = await annuler({ cle: cle2 });
    expect(await annuler({ cle: cle2 })).toBe(c);
    expect((await demandes()).filter((d) => d.type === "annulation")).toHaveLength(1);
    expect(await alertes()).toHaveLength(1);
    // Sans clé : refus clair, rien n'est écrit.
    await agir(loc);
    await expect(essai(() => db.query("select public.demander_report_rdv($1,$2,$3,$4,$5,null)", [org, mission, MOTIF, null, JSON.stringify(troisDates())]))).rejects.toThrow(/référence de cet envoi manque/);
  });

  it("REP-04 : le clic répété de l'artisan sur « Accepter », ou du locataire sur « Confirmer », est un succès silencieux", async () => {
    const demande = await demanderReport();
    const [premiere] = await datesDeLaDemande(demande);
    await accepter(premiere.id);
    await expect(accepter(premiere.id)).resolves.toBeDefined();
    expect((await demandes())[0].statut).toBe("acceptee");
    expect((await evenements()).filter((e) => e.type === "rdv_report_accepte")).toHaveLength(1);
    // Le locataire reclique sur le créneau qu'il vient de confirmer (hors report) : même silence.
    const autre = await creerMission();
    const cr = await planifier(autre, 10);
    await agir(loc);
    await expect(db.query("select public.choisir_creneau($1,$2)", [org, cr])).resolves.toBeDefined();
    expect((await etat(autre)).statut).toBe("planifiee");
  });

  // ── 8. Le planning de l'artisan ───────────────────────────────────────────────────────────────────────────────────
  it("C.12-8 : une date de report en conflit avec un autre rendez-vous confirmé de l'artisan est refusée ; une autre passe", async () => {
    const autre = await creerMission();
    await planifier(autre, 24); // l'artisan est pris de date(24) à date(26)
    const demande = await demanderReport({ dates: [{ debut: date(25), fin: date(27) }, troisDates()[1], troisDates()[2]] });
    const [conflit, libre] = await datesDeLaDemande(demande);
    await expect(essai(() => accepter(conflit.id))).rejects.toThrow(/chevauche/);
    expect((await etat()).statut).toBe("planifiee");
    expect(new Date((await etat()).debut_prevu).toISOString()).toBe(date(0));
    await accepter(libre.id);
    expect(new Date((await etat()).debut_prevu).toISOString()).toBe(date(48));
  });

  // ── 9. Isolation ──────────────────────────────────────────────────────────────────────────────────────────────────
  it("C.12-9 : un autre locataire, un ancien locataire, un autre artisan, une autre agence échouent en appel direct", async () => {
    // Le voisin a SA personne, SON bail actif et SA mission dans la même agence : seules les gardes de bail l'arrêtent.
    const missionVoisin = await creerMission(artisan, org, locVoisin);
    await planifier(missionVoisin, 60, locVoisin);
    expect((await mesRendezVous(locVoisin)).map((r) => r.intervention_id)).toEqual([missionVoisin]);
    const demande = await demanderReport();
    const [premiere] = await datesDeLaDemande(demande);
    for (const u of [locVoisin, locB, gerant]) {
      await expect(essai(() => demanderReport({ u, o: u === locB ? orgB : org }))).rejects.toThrow(/Accès refusé|introuvable/);
      await expect(essai(() => annuler({ u, o: u === locB ? orgB : org }))).rejects.toThrow(/Accès refusé|introuvable/);
      await agir(u);
      await expect(essai(() => db.query("select public.retirer_demande_rdv($1,$2)", [u === locB ? orgB : org, demande]))).rejects.toThrow(/Accès refusé|introuvable/);
    }
    await expect(essai(() => accepter(premiere.id, cptArtisanB))).rejects.toThrow(/Accès refusé/);
    await expect(essai(() => refuser(mission, cptArtisanB))).rejects.toThrow(/Accès refusé/);
    expect(await mesDemandesArtisan(cptArtisanB)).toEqual([]);
    expect((await mesRendezVous(locVoisin)).map((r) => r.intervention_id)).toEqual([missionVoisin]);
    expect(await mesRendezVous(locB, orgB)).toEqual([]);
    expect((await demandes()).map((d) => d.statut)).toEqual(["en_attente"]);
    // Un colocataire légitime du bail de `loc` agit, lui : il lit le rendez-vous et retire la demande.
    await postgres();
    const coloc = await id("insert into public.persons(organization_id,account_id,nom,prenom,email) values($1,$2,'TEST','Colette',$3) returning id", [org, locColoc, `coloc-${randomUUID().slice(0, 8)}@example.invalid`]);
    await db.query("insert into public.bail_personnes(organization_id,bail_id,person_id,role) values($1,(select bail_id from public.incidents where id=(select incident_id from public.incident_interventions where id=$2)),$3,'colocataire')", [org, mission, coloc]);
    expect((await mesRendezVous(locColoc)).map((r) => r.intervention_id)).toEqual([mission]);
    await agir(locColoc);
    await db.query("select public.retirer_demande_rdv($1,$2)", [org, demande]);
    expect((await demandes()).map((d) => d.statut)).toEqual(["retiree"]);
    // Un ancien locataire (bail terminé) lit, mais n'agit plus.
    const ancienne = await creerMission(artisan, org, locAncien);
    await planifier(ancienne, 30, locAncien);
    await postgres();
    await db.query("update public.baux set etat='termine' where id=(select bail_id from public.incidents where id=(select incident_id from public.incident_interventions where id=$1))", [ancienne]);
    await expect(essai(() => demanderReport({ u: locAncien, m: ancienne }))).rejects.toThrow(/Accès refusé/);
    await expect(essai(() => annuler({ u: locAncien, m: ancienne }))).rejects.toThrow(/Accès refusé/);
    // La table n'est lisible que par les gérants de l'organisation : le locataire et l'artisan n'y voient rien,
    // le gérant d'une autre agence non plus.
    for (const [u, attendu] of [[loc, 0], [cptArtisan, 0], [gerantB, 0], [gerant, 1]] as const) {
      await agir(u);
      expect((await db.query("select count(*)::int as n from public.intervention_demandes_rdv where intervention_id=$1", [mission])).rows[0].n).toBe(attendu);
    }
    expect((await demandes()).length).toBe(1);
  });

  // ── 10. Passé ou démarré ──────────────────────────────────────────────────────────────────────────────────────────
  it("C.12-10 : un rendez-vous passé ou une intervention démarrée ne se reporte ni ne s'annule par ce circuit", async () => {
    await rendezVousDans(-1);
    expect((await mesRendezVous())[0]).toMatchObject({ report_possible: false, annulation_possible: false });
    await expect(essai(() => demanderReport())).rejects.toThrow(/passé ou a commencé/);
    await expect(essai(() => annuler())).rejects.toThrow(/passé ou a commencé/);
    const autre = await creerMission();
    await planifier(autre, 40);
    await agir(cptArtisan);
    await db.query("select public.demarrer_intervention($1)", [autre]);
    await expect(essai(() => demanderReport({ m: autre }))).rejects.toThrow(/pas de rendez-vous confirmé/);
    await expect(essai(() => annuler({ m: autre }))).rejects.toThrow(/pas de rendez-vous confirmé/);
  });

  it("la mission annulée par le gérant close la demande en attente et ses dates", async () => {
    await demanderReport();
    await agir(gerant);
    await db.query("select public.annuler_mission($1,$2,'Réglé par le syndic')", [org, mission]);
    const [d] = await demandes();
    expect(d).toMatchObject({ statut: "arbitree", reponse_motif: "Mission annulée" });
    expect((await datesDeLaDemande(d.id)).map((c) => c.statut)).toEqual(["caduc", "caduc", "caduc"]);
    // Plus de mission vivante : plus rien dans les deux lectures.
    expect(await mesRendezVous()).toEqual([]);
    expect(await mesDemandesArtisan()).toEqual([]);
  });

  it("pendant une demande de report, l'artisan ne « déplace » pas le rendez-vous de son côté : il répond à la demande", async () => {
    const demande = await demanderReport();
    const avant = await etat();
    await agir(cptArtisan);
    await expect(essai(() => db.query("select public.proposer_creneaux($1,$2::jsonb)", [mission, JSON.stringify(troisDates(300))])))
      .rejects.toThrow(/Le locataire vous a proposé des dates/);
    expect((await demandes())[0]).toMatchObject({ id: demande, statut: "en_attente" });
    expect(await etat()).toEqual(avant);
  });

  it("C.7 : l'échéance de réponse est de 48 h, ou la veille du rendez-vous si elle est plus proche", async () => {
    await rendezVousDans(50);
    const demande = await demanderReport();
    await postgres();
    const { rows: [r] } = await db.query("select d.expire_le, iv.debut_prevu from public.intervention_demandes_rdv d join public.incident_interventions iv on iv.id=d.intervention_id where d.id=$1", [demande]);
    expect(new Date(r.debut_prevu).getTime() - new Date(r.expire_le).getTime()).toBe(24 * 3600000);
  });

  it("le locataire ne lit aucune table du module en direct, et la liste des trois nombres est celle de la décision", async () => {
    await agir(loc);
    for (const table of ["intervention_demandes_rdv", "intervention_creneaux", "intervention_rappels"]) {
      expect((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n).toBe(0);
    }
    const { rows } = await db.query("select * from public.parametres_rdv_locataire()");
    expect(rows[0]).toEqual({ delai_report_heures: 24, reports_max: 2, reponse_artisan_heures: 48 });
  });
  it("D22 complément : une réservation durable au plus, uniquement avant échéance et réservée au service", async () => {
    const d=await demanderReport();
    await agir(cptArtisan);
    await expect(essai(()=>db.query('select public.reserver_relance_report_rdv($1)',[d]))).rejects.toThrow(/permission denied/);
    await postgres(); await db.query('set local role service_role');
    expect((await db.query('select * from public.reports_rdv_a_relancer(10)')).rows).toContainEqual({demande_id:d});
    const r=(await db.query('select public.reserver_relance_report_rdv($1) as r',[d])).rows[0].r;
    expect(r).toMatchObject({demande_id:d,intervention_id:mission,adresse:'artisan@example.invalid'});
    expect((await db.query('select public.reserver_relance_report_rdv($1) as r',[d])).rows[0].r).toBeNull();
    expect((await db.query('select * from public.reports_rdv_a_relancer(10)')).rows).not.toContainEqual({demande_id:d});
    await db.query('select public.noter_relance_report_rdv($1,true)',[d]);
    await postgres();
    expect((await demandes())[0].relance_envoyee_le).not.toBeNull();
  });
  it("D22 complément : un report expiré ou retiré n’est jamais relancé",async()=>{
    const d=await demanderReport();
    await expirer(d);
    await db.query('set local role service_role');
    expect((await db.query('select public.reserver_relance_report_rdv($1) as r',[d])).rows[0].r).toBeNull();
    expect((await db.query('select * from public.reports_rdv_a_relancer(10)')).rows).not.toContainEqual({demande_id:d});
  });
  it("D22 complément : prendre acte est idempotent, réservé à son artisan, ne change ni mission ni alerte",async()=>{
    const d=await annuler();
    const avant=await etat(); const alertesAvant=await alertes();
    await agir(cptArtisanB);
    await expect(essai(()=>db.query('select public.accuser_annulation_rdv($1)',[d]))).rejects.toThrow(/indisponible/);
    await agir(cptArtisan);
    expect((await db.query('select public.accuser_annulation_rdv($1) as r',[d])).rows[0].r).toBe(true);
    expect((await db.query('select public.accuser_annulation_rdv($1) as r',[d])).rows[0].r).toBe(false);
    expect((await mesDemandesArtisan())[0].annulation_vue_le).not.toBeNull();
    expect(await etat()).toEqual(avant); expect(await alertes()).toEqual(alertesAvant);
  });
  it("D22 complément : proposer de nouveaux créneaux reste possible sans prendre acte",async()=>{
    await annuler();
    await agir(cptArtisan);
    await db.query('select public.proposer_creneaux($1,$2::jsonb)',[mission,JSON.stringify(troisDates(300))]);
    expect((await demandes())[0].annulation_vue_le).toBeNull();
    expect((await creneaux()).filter(c=>c.statut==='propose')).toHaveLength(3);
  });

});
