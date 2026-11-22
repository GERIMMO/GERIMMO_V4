/**
 * Audit palier 1, P2-05 — rapprocher les crédits d'un relevé des loyers à recevoir, et l'action qui enregistre.
 *
 * Ce que ce fichier prouve :
 *  1. « sûr » exige le montant ET le nom ; tout le reste est proposé décoché, expliqué, ou écarté ;
 *  2. les loyers d'un bail se suivent du plus ancien au plus récent, y compris un partiel puis son solde ;
 *  3. une ligne déjà enregistrée (par sa clé, ou même jour et même montant) ne se propose pas deux fois ;
 *  4. l'action relit tout ce que l'écran envoie, recalcule la clé, enregistre dans l'ordre et dit chaque refus.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), revalider: vi.fn(), emission: vi.fn(), appels: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalider }));
vi.mock("@/lib/quittances", () => ({ emettreRecusQuittances: m.emission }));

import {
  avecCles, clePointage, modeDepuisLibelle, nomRetrouve, rapprocher, verifierSelection,
  type AppelOuvert, type EncaissementConnu, type LigneAPointer, type LigneAvecCle,
} from "@/lib/pointage-loyers";
import type { LigneReleve } from "@/lib/releve-bancaire";
import { enregistrerPointage } from "@/app/actions/pointage-loyers";

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const JOUR = "2026-11-22";
const appel = (n: number, bail: string, periode: string, echeance: string, reste: number, locataire: string | null = "Marc Durand", lot = "Appartement T2"): AppelOuvert => ({
  appelId: `00000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`, bailId: bail, lotNom: lot, locataire, periode, echeance, resteCentimes: reste,
});
const BAIL_A = "aaaaaaaa-0000-4000-a000-000000000001";
const BAIL_B = "bbbbbbbb-0000-4000-a000-000000000002";
const OCT = appel(1, BAIL_A, "2026-10-01", "2026-10-05", 80000);
const NOV = appel(2, BAIL_A, "2026-11-01", "2026-11-05", 80000);
const DEC = appel(3, BAIL_A, "2026-12-01", "2026-12-05", 80000);

async function lignes(...brutes: [string, number, string][]): Promise<LigneAvecCle[]> {
  const vus = new Map<string, number>();
  const sans: LigneReleve[] = brutes.map(([date, centimes, libelle], position) => {
    const cle = `${date}|${centimes}|${libelle}`;
    const rang = vus.get(cle) ?? 0;
    vus.set(cle, rang + 1);
    return { position, date, centimes, libelle, rang };
  });
  return avecCles(ORG, sans);
}
const proposer = async (brutes: [string, number, string][], appels: AppelOuvert[], encaissements: EncaissementConnu[] = []) =>
  rapprocher({ lignes: await lignes(...brutes), appels, encaissements, aujourdHui: JOUR });

describe("nom, mode, clé", () => {
  it("le nom de famille se cherche en mot entier, sans accent ni casse", () => {
    expect(nomRetrouve("VIR SEPA M DURAND MARC LOYER", "Marc Durand")).toBe(true);
    expect(nomRetrouve("vir. sepa de mme lefèvre-martin", "Zoé Lefevre Martin")).toBe(true);
    expect(nomRetrouve("VIR MARTINEZ LOYER", "Paul Martin")).toBe(false);
    expect(nomRetrouve("VIR MARC LOYER", "Marc Durand")).toBe(false);
    expect(nomRetrouve("VIR LI LOYER", "An Li")).toBe(false);
    expect(nomRetrouve("VIR DURAND", null)).toBe(false);
    expect(nomRetrouve("", "Marc Durand")).toBe(false);
  });

  it("le mode vient du libellé ; « autre » quand il ne dit rien", () => {
    expect(modeDepuisLibelle("VIR SEPA DURAND")).toBe("virement");
    expect(modeDepuisLibelle("Virement instantané reçu")).toBe("virement");
    expect(modeDepuisLibelle("REMISE CHEQUE 0012345")).toBe("cheque");
    expect(modeDepuisLibelle("PRLV SEPA DURAND")).toBe("prelevement");
    expect(modeDepuisLibelle("VERSEMENT ESPECES")).toBe("especes");
    expect(modeDepuisLibelle("DURAND LOYER")).toBe("autre");
  });

  it("la clé est stable, propre à l'espace et à la ligne, et a la forme d'un identifiant", async () => {
    const l = { date: "2026-11-05", centimes: 80000, libelle: "VIR SEPA Durand", rang: 0 };
    const cle = await clePointage(ORG, l);
    expect(cle).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await clePointage(ORG, { ...l, libelle: "  vir.  sepa DURAND " })).toBe(cle);
    for (const autre of [{ ...l, rang: 1 }, { ...l, centimes: 80001 }, { ...l, date: "2026-11-06" }, { ...l, libelle: "VIR SEPA DUPONT" }])
      expect(await clePointage(ORG, autre)).not.toBe(cle);
    expect(await clePointage("11111111-1111-4111-a111-111111111111", l)).not.toBe(cle);
  });
});

describe("rapprochement", () => {
  it("montant et nom : sûr ; montant seul : à vérifier ; rien : écarté", async () => {
    const p = await proposer(
      [["2026-10-06", 80000, "VIR SEPA M DURAND LOYER"], ["2026-11-04", 80000, "VIR SEPA 4521 REF 99"], ["2026-11-10", 12345, "REMBOURSEMENT ASSURANCE"]],
      [OCT, NOV],
    );
    expect(p.map((x) => [x.statut, x.candidats.map((c) => c.periode)])).toEqual([
      ["sur", ["2026-10-01"]], ["probable", ["2026-11-01"]], ["aucun", []],
    ]);
    // La seconde ligne règle le loyer suivant du même bail : elle vient après la première.
    expect(p.map((x) => x.apres)).toEqual([null, 0, null]);
    expect(p[1].motif).toMatch(/nom du locataire ne figure pas/);
  });

  it("un règlement bien antérieur à l'échéance n'est pas « sûr », même avec le nom", async () => {
    const [p] = await proposer([["2026-10-10", 80000, "VIR DURAND"]], [NOV]);
    expect(p.statut).toBe("probable");
    expect(p.motif).toMatch(/précède de plus de 15 jours l’échéance du 05\/11\/2026/);
    const [q] = await proposer([["2026-10-25", 80000, "VIR DURAND"]], [NOV]);
    expect(q.statut).toBe("sur");
  });

  it("nom retrouvé, montant inférieur : partiel, puis le solde attend le reste diminué", async () => {
    const p = await proposer([["2026-10-06", 30000, "VIR DURAND ACOMPTE"], ["2026-10-20", 50000, "VIR DURAND SOLDE"]], [OCT]);
    expect(p.map((x) => [x.statut, x.candidats[0].resteAttenduCentimes, x.apres])).toEqual([["partiel", 80000, null], ["sur", 50000, 0]]);
    expect(p[0].motif).toMatch(/inférieur au reste dû \(800,00 €\)/);
  });

  it("nom retrouvé, montant supérieur : à saisir sur le bail, jamais proposé à l'enregistrement", async () => {
    const [p] = await proposer([["2026-11-06", 160000, "VIR DURAND DEUX MOIS"]], [OCT, NOV]);
    expect(p.statut).toBe("superieur");
    expect(p.motif).toMatch(/dépasse le reste dû/);
  });

  it("deux baux au même montant : le nom départage ; sans nom, le propriétaire choisit", async () => {
    const autre = appel(4, BAIL_B, "2026-11-01", "2026-11-05", 80000, "Zoé Martin", "Studio");
    const p = await proposer([["2026-11-05", 80000, "VIR MARTIN ZOE"], ["2026-11-05", 80000, "VIR REF 123"]], [NOV, autre]);
    expect(p[0].statut).toBe("sur");
    expect(p[0].candidats[0].bailId).toBe(BAIL_B);
    // Le loyer de Zoé est pris : il ne reste qu'un candidat à ce montant.
    expect([p[1].statut, p[1].candidats.map((c) => c.bailId)]).toEqual(["probable", [BAIL_A]]);
    const q = await proposer([["2026-11-05", 80000, "VIR REF 123"]], [NOV, autre]);
    expect([q[0].statut, q[0].candidats.length]).toEqual(["choix", 2]);
  });

  it("déjà enregistré par sa clé, ou par le même jour et le même montant (un règlement n'explique qu'une ligne)", async () => {
    const mesLignes = await lignes(["2026-10-06", 80000, "VIR DURAND"], ["2026-11-05", 80000, "VIR LOYER"], ["2026-11-05", 80000, "VIR LOYER"]);
    const p = rapprocher({
      lignes: mesLignes, appels: [NOV], aujourdHui: JOUR,
      encaissements: [
        { bailId: BAIL_A, centimes: 80000, date: "2026-10-06", cle: mesLignes[0].cle },
        { bailId: BAIL_A, centimes: 80000, date: "2026-11-05", cle: null },
      ],
    });
    // La troisième ligne, jumelle de la deuxième, n'est expliquée par aucun règlement : elle reste proposée, décochée.
    expect(p.map((x) => x.statut)).toEqual(["deja", "deja", "probable"]);
    expect(p[0].motif).toBe("Déjà enregistré à partir de ce relevé.");
    expect(p[1].motif).toMatch(/même montant est déjà enregistré à cette date pour Marc Durand \(Appartement T2\)/);
  });

  it("le loyer payé d'avance est reconnu et expliqué, pas proposé ; une ligne datée du futur est écartée", async () => {
    const p = await proposer([["2026-11-20", 80000, "VIR DURAND"], ["2026-12-01", 80000, "VIR DURAND"]], [DEC]);
    expect(p.map((x) => x.statut)).toEqual(["a_venir", "aucun"]);
    expect(p[0].motif).toMatch(/échéance du 05\/12\/2026 n’est pas arrivée/);
    expect(p[1].motif).toMatch(/datée dans le futur/);
  });

  it("l'ordre du fichier n'importe pas : les loyers se servent dans l'ordre des dates", async () => {
    const p = await proposer([["2026-11-05", 80000, "VIR DURAND NOV"], ["2026-10-06", 80000, "VIR DURAND OCT"]], [OCT, NOV]);
    expect(p.map((x) => [x.ligne.position, x.candidats[0].periode, x.apres])).toEqual([[0, "2026-11-01", 1], [1, "2026-10-01", null]]);
  });

  it("la sélection : le plus ancien d'abord ; un même loyer n'est pas choisi deux fois", async () => {
    const p = await proposer([["2026-10-06", 80000, "VIR DURAND"], ["2026-11-05", 80000, "VIR DURAND"]], [OCT, NOV]);
    expect(verifierSelection(p, new Map([[0, OCT.appelId], [1, NOV.appelId]])).size).toBe(0);
    const fautes = verifierSelection(p, new Map([[1, NOV.appelId]]));
    expect(fautes.get(1)).toMatch(/Cochez d’abord le règlement du 06\/10\/2026/);
    // La ligne précédente vient d'être enregistrée pendant cette visite : la suivante est libre.
    expect(verifierSelection(p, new Map([[1, NOV.appelId]]), new Set([0])).size).toBe(0);

    const autre = appel(4, BAIL_B, "2026-11-01", "2026-11-05", 80000, "Zoé Martin", "Studio");
    const q = await proposer([["2026-11-05", 80000, "VIR REF 1"], ["2026-11-05", 80000, "VIR REF 2"]], [NOV, autre]);
    expect(q.map((x) => x.statut)).toEqual(["choix", "choix"]);
    const doublon = verifierSelection(q, new Map([[0, NOV.appelId], [1, NOV.appelId]]));
    expect([...doublon.values()]).toEqual(["Ce loyer est déjà associé à une autre ligne cochée.", "Ce loyer est déjà associé à une autre ligne cochée."]);
    expect(verifierSelection(q, new Map([[0, NOV.appelId], [1, autre.appelId]])).size).toBe(0);
  });

  it("le module tourne dans le navigateur : aucune dépendance serveur", () => {
    const source = readFileSync("src/lib/pointage-loyers.ts", "utf8");
    expect(source.match(/^import .*$/gm)).toEqual(['import { normaliserTexte, type LigneReleve } from "./releve-bancaire";']);
    expect(source).not.toMatch(/node:|use server|\bfetch\(/);
  });
});

describe("l'action qui enregistre", () => {
  const depuis = (table: string) => {
    expect(table).toBe("appels_loyer");
    const requete = { select: () => requete, eq: () => requete, in: (_c: string, ids: string[]) => m.appels(ids) };
    return requete;
  };
  const ligne = (position: number, a: AppelOuvert, plus: Partial<LigneAPointer> = {}): LigneAPointer => ({
    position, date: a.echeance, centimes: 80000, libelle: "VIR SEPA DURAND", rang: 0, appelId: a.appelId, resteCentimes: 80000, ...plus,
  });

  beforeEach(() => {
    // `resetAllMocks` vide aussi les réponses « une fois » qu'un test n'aurait pas consommées.
    vi.resetAllMocks();
    m.acces.mockResolvedValue({ user: { id: "moi" }, role: "proprietaire_direct", supabase: { rpc: m.rpc, from: depuis } });
    m.appels.mockImplementation(async (ids: string[]) => ({
      data: [OCT, NOV, DEC].filter((a) => ids.includes(a.appelId)).map((a) => ({ id: a.appelId, bail_id: a.bailId, periode: a.periode })), error: null,
    }));
    m.rpc.mockResolvedValue({ data: { statut: "enregistre", bail_id: BAIL_A, montant: 800 }, error: null });
    m.emission.mockResolvedValue({ quittances: 1, recus: 0 });
  });

  it("refuse tout autre rôle et toute sélection vide ou trop longue, avant la moindre lecture", async () => {
    m.acces.mockResolvedValue({ user: { id: "agent" }, role: "agent", supabase: { rpc: m.rpc, from: depuis } });
    expect((await enregistrerPointage(ORG, [ligne(0, OCT)])).erreur).toBe("Accès refusé.");
    m.acces.mockResolvedValue({ user: null, role: null, supabase: { rpc: m.rpc, from: depuis } });
    expect((await enregistrerPointage(ORG, [ligne(0, OCT)])).erreur).toBe("Accès refusé.");
    m.acces.mockResolvedValue({ user: { id: "moi" }, role: "proprietaire_direct", supabase: { rpc: m.rpc, from: depuis } });
    expect((await enregistrerPointage(ORG, [])).erreur).toMatch(/Cochez au moins un règlement/);
    expect((await enregistrerPointage(ORG, Array.from({ length: 101 }, (_, i) => ligne(i, OCT)))).erreur).toMatch(/100 règlements au plus/);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.appels).not.toHaveBeenCalled();
    expect(m.acces).toHaveBeenCalledWith(ORG, { geste: "encaissement" });
  });

  it("une seule ligne malformée arrête tout avant d'écrire", async () => {
    const mauvaises: Partial<LigneAPointer>[] = [
      { date: "2099-01-01" }, { date: "05/11/2026" }, { date: "2026-02-30" }, { centimes: 0 }, { centimes: 800.5 }, { centimes: 90000 },
      { resteCentimes: 0 }, { libelle: "X".repeat(201) }, { rang: -1 }, { appelId: "pas-un-identifiant" },
      { centimes: "80000" as unknown as number }, { position: 1.5 },
    ];
    for (const plus of mauvaises)
      expect((await enregistrerPointage(ORG, [ligne(0, OCT), ligne(1, NOV, plus)])).erreur, JSON.stringify(plus)).toMatch(/ne peut pas être enregistrée/);
    expect((await enregistrerPointage(ORG, [ligne(0, OCT), ligne(0, NOV)])).erreur).toMatch(/ne peut pas être enregistrée/);
    expect((await enregistrerPointage(ORG, [null as unknown as LigneAPointer])).erreur).toMatch(/ne peut pas être enregistrée/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("enregistre du plus ancien au plus récent, avec la clé recalculée, le mode lu au libellé, et relit les écrans", async () => {
    const envoi = [ligne(5, NOV, { libelle: "REMISE CHEQUE DURAND" }), ligne(2, OCT)];
    const r = await enregistrerPointage(ORG, envoi);
    expect(r.erreur).toBeUndefined();
    expect(m.rpc.mock.calls.map((c) => [c[0], c[1].p_appel])).toEqual([["pointer_loyer_releve", OCT.appelId], ["pointer_loyer_releve", NOV.appelId]]);
    expect(m.rpc.mock.calls[0][1]).toEqual({
      p_org: ORG, p_appel: OCT.appelId, p_montant: 800, p_date: "2026-10-05", p_mode: "virement",
      p_cle: await clePointage(ORG, envoi[1]), p_reste_attendu: 800, p_libelle: "VIR SEPA DURAND",
    });
    expect(m.rpc.mock.calls[1][1].p_mode).toBe("cheque");
    expect(r.resultats).toEqual([
      { position: 2, statut: "enregistre", message: "Enregistré : ce loyer est soldé." },
      { position: 5, statut: "enregistre", message: "Enregistré : ce loyer est soldé." },
    ]);
    expect(m.emission).toHaveBeenCalledTimes(1);
    for (const chemin of [`/espace/${ORG}/loyers/pointage`, `/agence/${ORG}/loyers`, `/espace/${ORG}`, `/espace/${ORG}/baux/${BAIL_A}`])
      expect(m.revalider).toHaveBeenCalledWith(chemin);
  });

  it("un partiel est annoncé partiel ; les centimes partent en euros exacts", async () => {
    const r = await enregistrerPointage(ORG, [ligne(0, OCT, { centimes: 1999, resteCentimes: 80050 })]);
    expect(m.rpc.mock.calls[0][1]).toMatchObject({ p_montant: 19.99, p_reste_attendu: 800.5 });
    expect(r.resultats?.[0].message).toBe("Enregistré : règlement partiel.");
  });

  it("chaque refus reste celui de sa ligne, dit avec les mots de cet écran ; les autres lignes passent", async () => {
    m.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "Un loyer plus ancien reste à régler. Actualisez le tableau de bord." } })
      .mockResolvedValueOnce({ data: { statut: "deja_enregistre" }, error: null })
      .mockResolvedValueOnce({ data: { statut: "annule" }, error: null });
    const r = await enregistrerPointage(ORG, [ligne(0, OCT), ligne(1, NOV), ligne(2, DEC, { date: "2026-11-20" })]);
    expect(r.resultats?.map((x) => x.statut)).toEqual(["refuse", "deja_enregistre", "refuse"]);
    expect(r.resultats?.[0].message).toBe("Un loyer plus ancien de ce bail reste à régler : pointez-le d’abord.");
    expect(r.resultats?.[0].message).not.toMatch(/tableau de bord/);
    expect(r.resultats?.[2].message).toMatch(/retiré du bail/);
    // Rien de nouveau n'a été écrit : aucun justificatif à créer, aucun écran à relire.
    expect(m.emission).not.toHaveBeenCalled();
    expect(m.revalider).not.toHaveBeenCalled();
  });

  it("les autres refus de la base sont traduits ; un loyer hors de l'espace n'est jamais présenté à la base", async () => {
    const dits: [string, RegExp][] = [
      ["Le montant a changé depuis votre dernière lecture. Actualisez le tableau de bord.", /a changé depuis la lecture du relevé/],
      ["Cette demande a déjà été utilisée. Rechargez le tableau de bord.", /a déjà servi à enregistrer un autre règlement/],
      ["Cette échéance n'est pas encore à confirmer.", /n’est pas encore arrivée/],
      ["Vérifiez le montant, la date et le mode du règlement reçu.", /saisissez ce règlement sur le bail/],
    ];
    for (const [message, attendu] of dits) {
      m.rpc.mockResolvedValueOnce({ data: null, error: { message } });
      const r = await enregistrerPointage(ORG, [ligne(0, OCT)]);
      expect(r.resultats?.[0].message, message).toMatch(attendu);
      expect(r.resultats?.[0].message).not.toMatch(/tableau de bord/);
    }
    m.rpc.mockClear();
    m.appels.mockResolvedValue({ data: [], error: null });
    const r = await enregistrerPointage(ORG, [ligne(0, OCT)]);
    expect(r.resultats).toEqual([{ position: 0, statut: "refuse", message: "Ce loyer n’est plus accessible." }]);
    expect(m.rpc).not.toHaveBeenCalled();
    m.appels.mockResolvedValue({ data: null, error: { message: "panne" } });
    expect((await enregistrerPointage(ORG, [ligne(0, OCT)])).erreur).toMatch(/Aucun règlement n’a été enregistré/);
  });

  it("un justificatif en échec ne remet pas le règlement en cause : il est dit à part", async () => {
    m.emission.mockResolvedValue({ erreur: "modèle indisponible", quittances: 0, recus: 0 });
    const r = await enregistrerPointage(ORG, [ligne(0, OCT)]);
    expect(r.resultats?.[0].statut).toBe("enregistre");
    expect(r.documents).toMatch(/justificatifs restent à vérifier sur le bail : modèle indisponible/);
  });

  it("l'action n'envoie aucun e-mail et ne lit aucun fichier", () => {
    const source = readFileSync("src/app/actions/pointage-loyers.ts", "utf8");
    expect(source).not.toMatch(/envoyerEmail|envoyerQuittance|@\/lib\/email|FormData|arrayBuffer/);
    expect(source.startsWith('"use server";')).toBe(true);
  });
});

describe("l'écran", () => {
  const ecran = readFileSync("src/app/agence/[orgId]/loyers/pointage/pointage-releve.tsx", "utf8");
  const page = readFileSync("src/app/agence/[orgId]/loyers/pointage/page.tsx", "utf8");

  it("le fichier est lu sur l'appareil : il n'est dans aucun formulaire envoyé, et l'écran le dit", () => {
    expect(ecran).toContain("lireReleve(decoderReleve(await fichier.arrayBuffer()))");
    expect(ecran).toContain("Il est lu sur votre appareil : il n’est");
    expect(ecran).toContain("ni envoyé à Gerimmo ni conservé.");
    // Le seul appel au serveur est l'action, avec les seules lignes retenues.
    expect(ecran.match(/enregistrerPointage\(/g)).toHaveLength(1);
    expect(ecran).not.toMatch(/\bfetch\(|new FormData|action=\{/);
    expect(ecran).toContain('<form onSubmit={envoyer} className="space-y-5" data-rapprochement data-saisie-libre>');
  });

  it("seules les correspondances sûres sont cochées d'avance ; le bouton commun porte l'envoi", () => {
    expect(ecran).toContain('(coches[p.ligne.position] ?? p.statut === "sur")');
    expect(ecran).toContain("<BoutonEnvoi enCours={enCours}");
    expect(ecran).toContain("disabled={selection.size === 0 || fautes.size > 0}");
    expect(ecran).toContain("Ce pointage n’envoie aucun e-mail");
  });

  it("la page est réservée au propriétaire et ne présente jamais une lecture en échec comme « rien à pointer »", () => {
    expect(page).toContain("if (!estProprietaire) notFound();");
    expect(page).toContain("Boolean(loyers.error) || lignes.length >= 1000 || reglements.echec !== null");
    expect(page).toContain('supabase.rpc("rappels_loyers_proprietaire", { p_org: orgId })');
    expect(readFileSync("src/components/page-finances.tsx", "utf8")).toContain("href={`${base}/loyers/pointage`} data-lien-pointage");
  });
});
