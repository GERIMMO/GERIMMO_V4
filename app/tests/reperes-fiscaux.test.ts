/**
 * LES REPÈRES FISCAUX SORTIS DU CODE — audit palier 1, P2-09 (23/11/2026).
 *
 * L'aide du récapitulatif fiscal disait « 15 000 € » et « 30 % » en dur. Ces deux valeurs du micro-foncier se lisent
 * maintenant dans un réglage du superviseur, avec la date de leur dernière vérification. Ce fichier tient :
 *  - la lecture stricte du réglage : une réponse qui n'a pas exactement la forme attendue n'affiche AUCUN chiffre ;
 *  - les phrases : avec date, sans date (jamais présentée comme vérifiée), illisible (aucun chiffre) ;
 *  - l'écran du propriétaire dans ces trois états, et le fait qu'il ne tombe pas si la lecture échoue ;
 *  - le panneau de la console et le geste du superviseur (confirmation exigée, lecture stricte des deux saisies) ;
 *  - le code de l'écran : plus aucune valeur écrite en dur.
 *
 * Les règles de la base ont leur test (reperes-fiscaux-base.test.ts).
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { avecDetenteursAuReel } from "./fixtures/profil-fiscal";
import { baseSimulee, type BaseSimulee, type Ligne } from "./fixtures/base-simulee";

const m = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn(), base: null as unknown, rpcEcran: vi.fn() }));
const supabaseEcran = { from: (table: string) => (m.base as BaseSimulee).client.from(table), rpc: (...a: unknown[]) => m.rpcEcran(...a) };

vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase: supabaseEcran, estProprietaire: true, role: "proprietaire_direct", user: { id: "u" } }),
}));

import { reglerReperesFiscaux } from "@/app/actions/reperes-fiscaux";
import { ReperesFiscauxReglage } from "@/app/admin/parametres/reperes-fiscaux";
import { RecapitulatifFiscal } from "@/components/recapitulatif-fiscal";
import {
  BORNES_REPERES_FISCAUX, chargerReperesFiscaux, etatVerification, eurosEntiers, libelleVerification, lireEntierSaisi,
  lireReponseReperes, phrasesMicroFoncier, type ReperesFiscaux,
} from "@/lib/reperes-fiscaux";

/** Le texte tel qu'on le lit : sans balise, apostrophes droites, espaces insécables (fines ou non) en espaces. */
const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const lisible = (s: string) => s.replace(/’/g, "'").replace(/[  ]/g, " ");

const LIVRAISON: ReperesFiscaux = { plafondEuros: 15000, abattementPourcent: 30, verifieLe: null };
const VERIFIES: ReperesFiscaux = { plafondEuros: 15300, abattementPourcent: 31, verifieLe: "2026-11-23" };
const REPONSE = (r: ReperesFiscaux) => ({ micro_foncier_plafond_euros: r.plafondEuros, micro_foncier_abattement_pourcent: r.abattementPourcent, verifie_le: r.verifieLe });

beforeEach(() => { vi.resetAllMocks(); });

describe("lecture stricte du réglage", () => {
  it("la réponse attendue donne les trois valeurs", () => {
    expect(lireReponseReperes(REPONSE(LIVRAISON))).toEqual(LIVRAISON);
    expect(lireReponseReperes(REPONSE(VERIFIES))).toEqual(VERIFIES);
    // Une date absente vaut « jamais vérifié ».
    expect(lireReponseReperes({ micro_foncier_plafond_euros: 15000, micro_foncier_abattement_pourcent: 30 })).toEqual(LIVRAISON);
  });

  it.each([
    ["rien", null], ["un texte", "15000"], ["une liste", [15000, 30]], ["un objet vide", {}],
    ["un plafond en texte", { ...REPONSE(LIVRAISON), micro_foncier_plafond_euros: "15000" }],
    ["un plafond décimal", { ...REPONSE(LIVRAISON), micro_foncier_plafond_euros: 15000.5 }],
    ["un plafond sous la borne", { ...REPONSE(LIVRAISON), micro_foncier_plafond_euros: 150 }],
    ["un plafond au-dessus de la borne", { ...REPONSE(LIVRAISON), micro_foncier_plafond_euros: 15_000_000 }],
    ["un plafond négatif", { ...REPONSE(LIVRAISON), micro_foncier_plafond_euros: -15000 }],
    ["un abattement nul", { ...REPONSE(LIVRAISON), micro_foncier_abattement_pourcent: 0 }],
    ["un abattement de 100", { ...REPONSE(LIVRAISON), micro_foncier_abattement_pourcent: 100 }],
    ["un abattement en fraction", { ...REPONSE(LIVRAISON), micro_foncier_abattement_pourcent: 0.3 }],
    ["un abattement absent", { micro_foncier_plafond_euros: 15000, verifie_le: null }],
    ["une date mal formée", { ...REPONSE(LIVRAISON), verifie_le: "23/11/2026" }],
    ["une date qui n'est pas un texte", { ...REPONSE(LIVRAISON), verifie_le: 20261123 }],
  ])("%s : aucune valeur n'est retenue", (_cas, data) => {
    expect(lireReponseReperes(data)).toBeNull();
  });

  it("une panne de la base, un refus ou une réponse vide rendent null, sans lever", async () => {
    expect(await chargerReperesFiscaux({ rpc: async () => ({ data: REPONSE(VERIFIES), error: null }) })).toEqual(VERIFIES);
    expect(await chargerReperesFiscaux({ rpc: async () => ({ data: REPONSE(VERIFIES), error: { message: "permission denied" } }) })).toBeNull();
    expect(await chargerReperesFiscaux({ rpc: async () => ({ data: null, error: null }) })).toBeNull();
    expect(await chargerReperesFiscaux({ rpc: async () => { throw new Error("réseau"); } })).toBeNull();
    expect(await chargerReperesFiscaux({ rpc: (async () => undefined) as never })).toBeNull();
    const rpc = vi.fn(async () => ({ data: REPONSE(LIVRAISON), error: null }));
    await chargerReperesFiscaux({ rpc });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("reperes_fiscaux");
  });
});

describe("les phrases de l'aide", () => {
  it("avec une date : les valeurs enregistrées, la date, et ce qui fait foi", () => {
    const p = phrasesMicroFoncier(VERIFIES);
    expect(lisible(p.regle)).toBe("Régime micro-foncier : si vos recettes brutes n'excèdent pas 15 300 €, seule la ligne des recettes vous sert (abattement automatique de 31 %).");
    expect(lisible(p.verification)).toBe("Plafond et abattement vérifiés par Gerimmo le 23/11/2026. Une loi de finances peut les modifier : la notice officielle fait foi.");
  });

  it("sans date : les valeurs sont citées, mais jamais présentées comme vérifiées", () => {
    const p = phrasesMicroFoncier(LIVRAISON);
    expect(lisible(p.regle)).toContain("n'excèdent pas 15 000 €");
    expect(lisible(p.regle)).toContain("abattement automatique de 30 %");
    expect(lisible(p.verification)).toBe("Aucune date de vérification n'est enregistrée pour ce plafond et cet abattement : contrôlez-les dans la notice officielle avant de vous en servir.");
    expect(p.verification).not.toMatch(/vérifiés par/);
  });

  it("illisible : aucun chiffre, et le renvoi à la notice officielle", () => {
    const p = phrasesMicroFoncier(null);
    expect(`${p.regle} ${p.verification}`).not.toMatch(/[0-9]/);
    expect(p.regle).toContain("plafond de recettes brutes fixé par la loi");
    expect(p.verification).toContain("notice officielle");
  });

  it("les deux-points ne partent pas seuls en début de ligne (espace insécable)", () => {
    for (const r of [VERIFIES, LIVRAISON, null]) {
      const p = phrasesMicroFoncier(r);
      expect(`${p.regle} ${p.verification}`).not.toMatch(/ :/);
      expect(p.regle).toContain("micro-foncier\u00A0:");
    }
  });

  it("le « € » et le « % » ne partent pas seuls à la ligne", () => {
    expect(eurosEntiers(15000)).toMatch(/^15[  ]000 €$/);
    expect(eurosEntiers(1000000)).toMatch(/^1[  ]000[  ]000 €$/);
    expect(phrasesMicroFoncier(LIVRAISON).regle).toContain("30 %");
  });
});

describe("l'état de la vérification, pour la console", () => {
  it("jamais vérifié, vérifié cette année, à revérifier dès que l'année civile a changé", () => {
    expect(etatVerification(LIVRAISON, "2026-11-23")).toBe("jamais");
    expect(etatVerification(VERIFIES, "2026-11-23")).toBe("verifie");
    expect(etatVerification(VERIFIES, "2026-12-31")).toBe("verifie");
    expect(etatVerification(VERIFIES, "2027-01-01")).toBe("a_reverifier");
    expect(etatVerification({ ...VERIFIES, verifieLe: "2025-12-31" }, "2026-01-01")).toBe("a_reverifier");
  });

  it("le libellé court dit l'état et la date", () => {
    expect(libelleVerification(null, "2026-11-23")).toBe("État indisponible");
    expect(libelleVerification(LIVRAISON, "2026-11-23")).toBe("Jamais vérifiés");
    expect(libelleVerification(VERIFIES, "2026-11-23")).toBe("Vérifiés le 23/11/2026");
    expect(libelleVerification(VERIFIES, "2027-02-01")).toBe("À revérifier (vérifiés le 23/11/2026)");
  });
});

describe("lecture d'une saisie du superviseur", () => {
  const plafond = (v: unknown) => lireEntierSaisi(v, BORNES_REPERES_FISCAUX.plafondEuros);
  const abattement = (v: unknown) => lireEntierSaisi(v, BORNES_REPERES_FISCAUX.abattementPourcent);

  it("des chiffres, avec des espaces de milliers tolérées", () => {
    expect(plafond("15000")).toBe(15000);
    expect(plafond("15 000")).toBe(15000);
    expect(plafond("15 000")).toBe(15000);
    expect(plafond("15 000")).toBe(15000);
    expect(plafond(" 1000 ")).toBe(1000);
    expect(plafond("1000000")).toBe(1_000_000);
    expect(abattement("30")).toBe(30);
    expect(abattement("1")).toBe(1);
    expect(abattement("99")).toBe(99);
  });

  it("refuse plutôt que deviner", () => {
    for (const v of ["", " ", "15000,00", "15000.00", "15.000", "15,000", "1e4", "0x3A98", "+15000", "-15000", "15000 €", "quinze mille", "999", "1000001", "12345678", null, undefined, 15000, new Blob(["15000"])])
      expect(plafond(v), String(v)).toBeNull();
    for (const v of ["", "0", "100", "30 %", "30%", "30,5", "0,3", "-30", "trente", null])
      expect(abattement(v), String(v)).toBeNull();
  });

  it("le module ne convertit aucune saisie de façon permissive et n'importe rien (il tourne aussi dans le navigateur)", () => {
    const source = readFileSync("src/lib/reperes-fiscaux.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/\b(parseFloat|parseInt|Number)\s*\(/);
  });
});

describe("l'écran du propriétaire", () => {
  const o = { organization_id: "org" };
  const loyer = (n: number): Ligne => ({
    ...o, id: `loyer${n}`, lot_id: "lot", bail_id: "bail", encaissement_id: `enc${n}`, categorie: "loyer", sens: "recette", montant: 840,
    date_piece: `2026-0${n}-05`, libelle: null, contre_ecriture_de: null,
  });
  const dossier = (): Record<string, Ligne[]> => ({
    ecritures: [loyer(1), loyer(2)],
    fiscal_encaissements_composantes: [1, 2].map((n) => ({ ...o, ecriture_id: `loyer${n}`, loyer_hc: 780, charges: 60, non_ventile: 0 })),
    fiscal_qualifications_ecritures: [],
    fiscal_exercices_lots: [{
      ...o, lot_id: "lot", annee: 2026, version: 1, justification: "Acte et bail vérifiés", regularisation230: 0, quote_part230: 100,
      justification230: "Décompte N−1 : zéro confirmé", periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }],
    }],
    lots: [{ ...o, id: "lot", nom: "Lot A" }],
    biens: [],
  });
  const ecran = async (compact = false) => {
    m.base = baseSimulee(avecDetenteursAuReel(dossier()), { plafondLignes: 1000 });
    return renderToStaticMarkup(await RecapitulatifFiscal({
      params: Promise.resolve({ orgId: "org" }), searchParams: Promise.resolve({ annee: "2026" }), compact,
    }));
  };
  const repondre = (data: unknown, error: unknown = null) =>
    m.rpcEcran.mockImplementation(async (nom: string) => (nom === "reperes_fiscaux" ? { data, error } : { data: null, error: null }));

  it("valeurs vérifiées : l'aide cite les valeurs du réglage et la date de leur vérification", async () => {
    repondre(REPONSE(VERIFIES));
    const html = await ecran();
    const texte = texteDe(html);
    expect(html).toContain('data-micro-foncier="verifie"');
    expect(texte).toContain("Régime micro-foncier : si vos recettes brutes n'excèdent pas 15 300 €, seule la ligne des recettes vous sert (abattement automatique de 31 %).");
    expect(texte).toContain("Plafond et abattement vérifiés par Gerimmo le 23/11/2026.");
    expect(texte).toContain("Le meublé (BIC) et la SCI relèvent d'autres déclarations, que ce récapitulatif ne couvre pas.");
    // Les montants du récapitulatif, eux, ne dépendent pas du réglage.
    expect(texte).toContain("1 560,00 €");
  });

  it("à la livraison (aucune date) : les valeurs sont citées, avec la consigne de les contrôler", async () => {
    repondre(REPONSE(LIVRAISON));
    const html = await ecran();
    const texte = texteDe(html);
    expect(html).toContain('data-micro-foncier="non_date"');
    expect(texte).toContain("n'excèdent pas 15 000 €");
    expect(texte).toContain("abattement automatique de 30 %");
    expect(texte).toContain("Aucune date de vérification n'est enregistrée pour ce plafond et cet abattement");
    expect(texte).not.toContain("vérifiés par Gerimmo");
  });

  it.each([
    ["la lecture échoue", null, { message: "indisponible" }],
    ["la réponse est vide", null, null],
    ["la réponse a une forme inattendue", { micro_foncier_plafond_euros: "15000", micro_foncier_abattement_pourcent: 30, verifie_le: null }, null],
  ])("%s : l'écran s'affiche, l'aide ne cite aucun chiffre", async (_cas, data, error) => {
    repondre(data, error);
    const html = await ecran();
    const texte = texteDe(html);
    expect(html).toContain('data-micro-foncier="illisible"');
    const aide = /<p[^>]*data-micro-foncier="illisible"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(aide).not.toBe("");
    expect(aide).not.toMatch(/[0-9]/);
    expect(texte).toContain("sous un plafond de recettes brutes fixé par la loi");
    expect(texte).toContain("1 560,00 €");
  });

  it("une base qui lève ne fait pas tomber l'écran", async () => {
    m.rpcEcran.mockImplementation(async () => { throw new Error("réseau"); });
    expect(await ecran()).toContain('data-micro-foncier="illisible"');
  });

  it("la vue compacte n'affiche pas cette aide et ne lit donc pas le réglage", async () => {
    repondre(REPONSE(VERIFIES));
    const html = await ecran(true);
    expect(html).not.toContain("data-micro-foncier");
    expect(m.rpcEcran.mock.calls.map(([nom]) => nom)).not.toContain("reperes_fiscaux");
  });

  it("le code de l'écran ne contient plus ni le plafond ni le taux", () => {
    const source = readFileSync("src/components/recapitulatif-fiscal.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/15[\s  ]?000/);
    expect(source).not.toMatch(/\b30[\s ]?%/);
    expect(source).toContain("chargerReperesFiscaux(supabase)");
    expect(source).toContain("phrasesMicroFoncier(reperesFiscaux)");
  });
});

describe("le panneau de la console", () => {
  const rendre = (reperes: ReperesFiscaux | null, aujourdHui = "2026-11-23") => renderToStaticMarkup(createElement(ReperesFiscauxReglage, { reperes, aujourdHui }));

  it("à la livraison : « Jamais vérifiés », les deux valeurs dans le formulaire, la confirmation obligatoire", () => {
    const html = rendre(LIVRAISON);
    expect(html).toContain('data-reperes-fiscaux="jamais"');
    expect(texteDe(html)).toContain("Jamais vérifiés");
    expect(html).toMatch(/<input[^>]*id="repere-plafond"[^>]*value="15000"/);
    expect(html).toMatch(/<input[^>]*id="repere-abattement"[^>]*value="30"/);
    expect(html).toMatch(/<input[^>]*id="repere-confirmation"[^>]*required=""/);
    expect(html).toMatch(/<form[^>]*data-saisie-confirmee/);
    // Le superviseur voit la phrase exacte que lisent les propriétaires.
    expect(texteDe(html)).toContain("Aucune date de vérification n'est enregistrée");
    expect(texteDe(html)).toContain("Enregistrer et dater la vérification");
  });

  it("vérifiés cette année, puis à revérifier l'année suivante", () => {
    const cetteAnnee = rendre(VERIFIES);
    expect(cetteAnnee).toContain('data-reperes-fiscaux="verifie"');
    expect(texteDe(cetteAnnee)).toContain("Vérifiés le 23/11/2026");
    expect(cetteAnnee).toMatch(/<input[^>]*id="repere-plafond"[^>]*value="15300"/);
    const anneeSuivante = rendre(VERIFIES, "2027-01-02");
    expect(anneeSuivante).toContain('data-reperes-fiscaux="a_reverifier"');
    expect(texteDe(anneeSuivante)).toContain("À revérifier (vérifiés le 23/11/2026)");
  });

  it("réglage illisible : aucun formulaire, plutôt qu'une valeur supposée", () => {
    const html = rendre(null);
    expect(html).toContain('data-reperes-fiscaux="illisible"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("15000");
    expect(texteDe(html)).toContain("Les repères fiscaux ne peuvent pas être lus.");
  });
});

describe("le geste du superviseur", () => {
  const formulaire = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
  const superviseur = (permanent = true, erreurReglage = false) => {
    const rpc = vi.fn(async (nom: string, _args?: unknown) => (
      nom === "is_permanent_super_admin" ? { data: permanent, error: null }
        : { data: null, error: erreurReglage ? { message: "refus" } : null }));
    m.createClient.mockResolvedValue({ rpc });
    return rpc;
  };

  it.each([
    ["un plafond avec une virgule", { plafond: "15000,00", abattement: "30", confirmation: "oui" }, "Plafond"],
    ["un plafond hors bornes", { plafond: "150", abattement: "30", confirmation: "oui" }, "Plafond"],
    ["aucun plafond", { abattement: "30", confirmation: "oui" }, "Plafond"],
    ["un abattement décimal", { plafond: "15000", abattement: "30,5", confirmation: "oui" }, "Abattement"],
    ["un abattement de 100", { plafond: "15000", abattement: "100", confirmation: "oui" }, "Abattement"],
    ["aucune confirmation", { plafond: "15000", abattement: "30" }, "Cochez la confirmation"],
    ["une confirmation inattendue", { plafond: "15000", abattement: "30", confirmation: "on" }, "Cochez la confirmation"],
  ])("refuse %s sans rien demander à la base", async (_cas, champs, motif) => {
    const rpc = superviseur();
    const retour = await reglerReperesFiscaux({}, formulaire(champs));
    expect(retour.erreur).toContain(motif);
    expect(retour.succes).toBeUndefined();
    expect(m.createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sans superviseur permanent en double vérification, le réglage n'est pas appelé", async () => {
    const rpc = superviseur(false);
    const retour = await reglerReperesFiscaux({}, formulaire({ plafond: "15300", abattement: "31", confirmation: "oui" }));
    expect(retour.erreur).toContain("superviseur permanent");
    expect(rpc.mock.calls.map(([nom]) => nom)).toEqual(["is_permanent_super_admin"]);
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("un refus de la base est dit, sans annoncer de succès", async () => {
    superviseur(true, true);
    const retour = await reglerReperesFiscaux({}, formulaire({ plafond: "15300", abattement: "31", confirmation: "oui" }));
    expect(retour).toEqual({ erreur: "Le réglage n’a pas pu être enregistré. Réessayez dans un instant." });
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("enregistre les deux entiers lus, puis rafraîchit la console", async () => {
    const rpc = superviseur();
    const retour = await reglerReperesFiscaux({}, formulaire({ plafond: "15 300", abattement: "31", confirmation: "oui" }));
    expect(rpc).toHaveBeenLastCalledWith("regler_reperes_fiscaux", { p_plafond_euros: 15300, p_abattement_pourcent: 31 });
    expect(retour.erreur).toBeUndefined();
    expect(lisible(retour.succes ?? "")).toContain("plafond de 15 300 €, abattement de 31 %, vérifiés aujourd'hui");
    expect(m.revalidate).toHaveBeenCalledWith("/admin/parametres");
  });
});
