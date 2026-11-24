/**
 * Textes officiels, lot T1 (25/11/2026) — congés du bailleur et du locataire.
 *
 * Référence : le recueil fourni par le dirigeant (article 15, article 13 et article 25-8 de la loi du 6 juillet 1989 ;
 * notice annexée à l'arrêté du 13 décembre 2017). Source et version déclarées par le recueil, non recontrôlées.
 *
 *  - R13-A1 : la date limite d'un congé du bailleur se compte jusqu'au DERNIER JOUR du bail (l'ancienne règle acceptait
 *    un jour de plus). Les cas chiffrés ci-dessous sont les exemples de la notice (points 1-4, 2-1-4 et 2-2-2).
 *  - R02-A1 / R13-A3 : le congé pour vendre d'un logement nu reproduit mot pour mot les cinq premiers alinéas de
 *    l'article 15 II ; texte altéré : pas de lettre.
 *  - R02-A3 : conditions de la vente exigées en location nue. R02-A4 / R13-A4 : notice annoncée en pièce jointe, jamais
 *    imprimée par Gerimmo. R13-A5 : reprise refusée à une société non familiale. R13-A7 : logement acheté déjà loué.
 *  - R02-A5 : en zone tendue, plus de préavis d'un mois d'office. R02-A6 / R13-A2 : « réception », plus « première
 *    présentation ».
 */
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
// Pour jouer le cas « texte de l'article 15 II altéré » sans toucher au fichier : la vérification réelle reste appelée
// tant que `texteAltere.oui` est faux.
const texteAltere = vi.hoisted(() => ({ oui: false }));
vi.mock("@/lib/documents/modeles/article-15-ii", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/documents/modeles/article-15-ii")>();
  return { ...reel, alineasArticle15IIIntacts: (alineas?: readonly string[]) => (texteAltere.oui ? null : reel.alineasArticle15IIIntacts(alineas)) };
});
vi.mock("@/app/actions/documents-generes", () => ({ genererDocument: vi.fn() }));
vi.mock("@/app/actions/baux", () => ({ enregistrerConge: vi.fn(), annulerConge: vi.fn() }));
vi.mock("@/app/actions/edl", () => ({ creerEdl: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/espace/org/baux/b1", useSearchParams: () => new URLSearchParams() }));

import { congeBailleurDansLesDelais, dateLimiteCongeBailleur, refusLogementAcheteOccupe } from "@/lib/delai-conge-bailleur";
import { ALINEAS_ARTICLE_15_II, alineasArticle15IIIntacts } from "@/lib/documents/modeles/article-15-ii";
import { assemblerCongeBailleur } from "@/lib/documents/modeles/conge-bailleur";
import { chargerContexteBail } from "@/lib/documents/modeles/communs";
import { OPTIONS_CATALOGUE, CONGE_NOTICE_A_JOINDRE, CONGE_RECEPTION } from "@/lib/documents/catalogue-options";
import { refusDocumentIncomplet } from "@/lib/documents/completude";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";

const NOM = "20261125101500_conge_textes_officiels_t1";
const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/&amp;/g, "&").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const source = (chemin: string) => readFileSync(chemin, "utf8");
const sansCommentaires = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("R13-A1 — date limite de réception d'un congé du bailleur", () => {
  // [terme (dernier jour du bail), préavis en mois, dernière date de réception admise, d'où vient l'exemple]
  const EXEMPLES_DE_LA_NOTICE: [string, number, string, string][] = [
    ["2027-06-15", 6, "2026-12-15", "terme le 15 juin → au plus tard le 15 décembre de l'année précédente"],
    ["2027-06-30", 6, "2026-12-31", "terme le 30 juin → au plus tard le 31 décembre de l'année précédente"],
    ["2027-08-31", 6, "2027-02-28", "terme le 31 août → au plus tard le 28 février"],
    ["2028-08-31", 6, "2028-02-29", "terme le 31 août → le 29 février les années bissextiles"],
    ["2027-09-20", 6, "2027-03-20", "échéance au 20 septembre → le préavis court à compter du 20 mars"],
    ["2017-07-20", 6, "2017-01-20", "point 2-1-4 : terme le 20 juillet 2017 → congé le 20 janvier 2017"],
    ["2020-05-31", 6, "2019-11-30", "point 2-2-2 : terme le 31 mai 2020 → au plus tard le 30 novembre 2019"],
  ];

  it.each(EXEMPLES_DE_LA_NOTICE)("terme %s, %i mois → reçu au plus tard le %s (%s)", (terme, mois, limite) => {
    expect(dateLimiteCongeBailleur(terme, mois)).toBe(limite);
    expect(congeBailleurDansLesDelais(limite, terme, mois)).toBe(true);
    // Le lendemain de la date limite est trop tard : c'est le jour que l'ancienne règle acceptait à tort.
    const lendemain = new Date(`${limite}T00:00:00Z`);
    lendemain.setUTCDate(lendemain.getUTCDate() + 1);
    expect(congeBailleurDansLesDelais(lendemain.toISOString().slice(0, 10), terme, mois)).toBe(false);
  });

  it("le cas du juriste : dernier jour du bail le 20 septembre, congé reçu le 21 mars (nu) ou le 21 juin (meublé) → tardif d'un jour", () => {
    expect(congeBailleurDansLesDelais("2027-03-20", "2027-09-20", 6)).toBe(true);
    expect(congeBailleurDansLesDelais("2027-03-21", "2027-09-20", 6)).toBe(false);
    expect(congeBailleurDansLesDelais("2027-06-20", "2027-09-20", 3)).toBe(true);
    expect(congeBailleurDansLesDelais("2027-06-21", "2027-09-20", 3)).toBe(false);
  });

  // Fins de mois : même règle que les deux exemples de la notice (le délai expire le dernier jour du mois quand le
  // quantième n'existe pas). Ces cas-ci ne sont PAS dans la notice : ils sont déduits, et notés pour le juriste.
  it.each([
    ["2027-02-28", 6, "2026-08-31"],
    ["2028-02-29", 6, "2027-08-31"],
    ["2027-08-29", 6, "2027-02-28"],
    ["2027-08-30", 6, "2027-02-28"],
    ["2028-08-29", 6, "2028-02-29"],
    ["2028-08-30", 6, "2028-02-29"],
    ["2027-12-31", 6, "2027-06-30"],
    ["2027-11-30", 3, "2027-08-31"],
    ["2027-05-31", 3, "2027-02-28"],
    ["2027-05-30", 3, "2027-02-28"],
    ["2027-05-29", 3, "2027-02-28"],
    ["2027-05-28", 3, "2027-02-28"],
  ] as [string, number, string][])("fin de mois (déduit) : terme %s, %i mois → %s", (terme, mois, limite) => {
    expect(dateLimiteCongeBailleur(terme, mois)).toBe(limite);
  });

  it("la date limite est toujours la DERNIÈRE date admise, jour par jour, sur quatre ans de termes", () => {
    for (const mois of [3, 6]) {
      const jour = new Date("2026-01-01T00:00:00Z");
      for (let i = 0; i < 1461; i++) {
        const terme = jour.toISOString().slice(0, 10);
        const limite = dateLimiteCongeBailleur(terme, mois);
        const apres = new Date(`${limite}T00:00:00Z`);
        apres.setUTCDate(apres.getUTCDate() + 1);
        expect(congeBailleurDansLesDelais(limite, terme, mois), terme).toBe(true);
        expect(congeBailleurDansLesDelais(apres.toISOString().slice(0, 10), terme, mois), terme).toBe(false);
        jour.setUTCDate(jour.getUTCDate() + 1);
      }
    }
  });

  it("le modèle et l'écran lisent la même règle ; l'écran affiche la date limite du terme en cours", async () => {
    const { GenererCongeBailleur } = await import("@/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur");
    const rendre = (meuble: boolean) => renderToStaticMarkup(createElement(GenererCongeBailleur, { orgId: "org", bailId: "b1", cheminRetour: "/espace/org/baux/b1", meuble, terme: "2027-09-20" }));
    expect(rendre(false)).toContain('data-conge-date-limite="2027-03-20"');
    expect(texteDe(rendre(false))).toContain("Pour ce terme, le locataire doit avoir reçu le congé au plus tard le 20/03/2027. Gardez une marge.");
    expect(rendre(true)).toContain('data-conge-date-limite="2027-06-20"');
    // Sans terme calculable : aucune date n'est annoncée.
    expect(renderToStaticMarkup(createElement(GenererCongeBailleur, { orgId: "org", bailId: "b1", cheminRetour: "/x", meuble: false, terme: null }))).not.toContain("data-conge-date-limite");
  });
});

describe("R02-A1, R13-A3 — les cinq premiers alinéas de l'article 15 II", () => {
  it("cinq alinéas, intacts, qui commencent et finissent comme le texte du recueil", () => {
    expect(ALINEAS_ARTICLE_15_II).toHaveLength(5);
    expect(alineasArticle15IIIntacts()).toBe(ALINEAS_ARTICLE_15_II);
    expect(ALINEAS_ARTICLE_15_II[0]).toMatch(/^II\. - Lorsqu'il est fondé sur la décision de vendre le logement, le congé doit, à peine de nullité, indiquer le prix et les conditions de la vente projetée\./);
    expect(ALINEAS_ARTICLE_15_II[1]).toBe("A l'expiration du délai de préavis, le locataire qui n'a pas accepté l'offre de vente est déchu de plein droit de tout titre d'occupation sur le local.");
    expect(ALINEAS_ARTICLE_15_II[3]).toContain("le notaire doit, lorsque le bailleur n'y a pas préalablement procédé, notifier au locataire ces conditions et prix à peine de nullité de la vente.");
    expect(ALINEAS_ARTICLE_15_II[4]).toMatch(/l'acceptation de l'offre de vente est nulle de plein droit\.$/);
    // Rien de la mise en page du recueil (pied de page, retour à la ligne) ni de l'alinéa suivant n'est resté dans le texte.
    for (const alinea of ALINEAS_ARTICLE_15_II) expect(alinea).not.toMatch(/GERIMMO|RECUEIL|\n|  |Les termes des cinq alinéas/);
  });

  it("un texte retouché, coupé ou incomplet n'est plus « intact »", () => {
    expect(alineasArticle15IIIntacts(ALINEAS_ARTICLE_15_II.slice(0, 4))).toBeNull();
    expect(alineasArticle15IIIntacts([...ALINEAS_ARTICLE_15_II.slice(0, 4), ALINEAS_ARTICLE_15_II[4].replace("quatre", "trois")])).toBeNull();
    expect(alineasArticle15IIIntacts(ALINEAS_ARTICLE_15_II.map((a) => a.replace("A l'expiration", "À l'expiration")))).toBeNull();
    expect(alineasArticle15IIIntacts([...ALINEAS_ARTICLE_15_II, "Les termes des cinq alinéas précédents sont reproduits à peine de nullité dans chaque notification."])).toBeNull();
  });
});

describe("la lettre de congé du bailleur", () => {
  beforeEach(() => {
    vi.mocked(chargerContexteBail).mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  const bail = (sur: (c: ReturnType<typeof contexte>) => void = () => {}) => {
    const ctx = contexte();
    ctx.bail.etat = "actif";
    sur(ctx);
    return ctx;
  };
  const brut = async (options: Record<string, string>, ctx = bail(), terme = "2029-08-31") => {
    vi.mocked(chargerContexteBail).mockResolvedValue(ctx);
    const rpc = vi.fn(async () => ({ data: terme, error: null }));
    return { resultat: await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", options), rpc };
  };
  const lettre = async (options: Record<string, string>, ctx = bail(), terme = "2029-08-31") => {
    const { resultat } = await brut(options, ctx, terme);
    if (!("document" in resultat)) throw new Error(`congé non assemblé : ${JSON.stringify(resultat)}`);
    return { texte: texteDe(resultat.document.html), html: resultat.document.html, manquants: resultat.document.manquants };
  };
  const VENTE = { motif: "vente", prix_vente: "245000", conditions_vente: "Vente libre de toute occupation.", achete_occupe: "non" };
  const REPRISE = { motif: "reprise", beneficiaire_nom: "Marie Dupont", beneficiaire_lien: "fille du bailleur", beneficiaire_adresse: "12 rue des Lilas, 69003 Lyon", raisons_reprise: "Elle s'installe à Lyon pour son travail.", achete_occupe: "non" };

  it("vente d'un logement nu : les cinq alinéas sont imprimés mot pour mot, dans l'ordre, sous leur titre", async () => {
    const { texte, html, manquants } = await lettre(VENTE);
    expect(html).toContain("<h2>Article 15, II, de la loi du 6 juillet 1989 (reproduction)</h2>");
    let position = texte.indexOf("Article 15, II, de la loi du 6 juillet 1989 (reproduction)");
    expect(position).toBeGreaterThan(0);
    for (const alinea of ALINEAS_ARTICLE_15_II) {
      const ou = texte.indexOf(alinea, position);
      expect(ou, alinea.slice(0, 60)).toBeGreaterThan(position - 1);
      position = ou + alinea.length;
    }
    // L'ancien résumé, qui disait autre chose que la loi, a disparu.
    expect(texte).not.toContain("nullité de l'offre");
    expect(texte).not.toContain("le notaire doit vous notifier");
    expect(refusDocumentIncomplet({ manquants })).toBeNull();
  });

  it("texte de l'article 15 II altéré : le congé pour vendre d'un logement nu n'est PAS produit, et le refus dit pourquoi", async () => {
    texteAltere.oui = true;
    try {
      const { resultat } = await brut(VENTE);
      expect(resultat).toEqual({
        erreur: "Le congé pour vendre un logement loué nu doit reproduire les cinq premiers alinéas de l’article 15 II de la loi du 6 juillet 1989. Le texte enregistré dans Gerimmo n’est pas intact : la lettre n’est pas produite. Signalez-le depuis Aide et retours.",
      });
      // Les autres congés ne reproduisent pas ce texte : ils restent possibles.
      expect("document" in (await brut(REPRISE)).resultat).toBe(true);
      expect("document" in (await brut({ motif: "vente" }, bail((c) => { c.bail.type = "meuble"; }))).resultat).toBe(true);
    } finally {
      texteAltere.oui = false;
    }
  });

  it("vente d'un logement nu : désignation des locaux reprise du bail, prix et conditions de la vente", async () => {
    const { texte } = await lettre(VENTE);
    expect(texte).toContain("Désignation des locaux loués, telle qu'elle figure au bail :");
    // Le nombre de pièces s'imprime quand il est connu, sans bloquer (sur un lot loué, la base le verrouille).
    expect(texte).toContain("Autres parties du logement :");
    const sansPieces = await lettre(VENTE, bail((c) => { c.lot.pieces = null; }));
    expect(sansPieces.texte).not.toContain("Nombre de pièces principales");
    expect(sansPieces.manquants).not.toContain("nombre");
    // La désignation n'est exigée que pour la vente d'un logement nu : une reprise ou un motif légitime ne la réclament pas.
    const lotIncomplet = (c: ReturnType<typeof contexte>) => { c.lot.description = null; c.lot.locaux_privatifs = null; };
    expect((await lettre(VENTE, bail(lotIncomplet))).manquants).toEqual(expect.arrayContaining(["autres parties du logement", "locaux privatifs du logement"]));
    for (const options of [REPRISE, { motif: "motif_legitime", motif_detail: "Impayés répétés." }]) {
      const autre = await lettre(options, bail(lotIncomplet));
      expect(autre.manquants).not.toContain("autres parties du logement");
      expect(autre.manquants).not.toContain("locaux privatifs du logement");
    }
    expect((await lettre({ motif: "vente" }, bail((c) => { lotIncomplet(c); c.bail.type = "meuble"; }))).manquants).not.toContain("locaux privatifs du logement");
    expect(texte).toContain("Locaux et équipements à usage privatif :");
    expect(texte).toContain("Conditions de la vente projetée : Vente libre de toute occupation.");
  });

  it("R02-A3 — vente d'un logement nu sans conditions de la vente : comptées manquantes, pas de PDF ; elles se saisissent dans le formulaire", async () => {
    const { manquants } = await lettre({ ...VENTE, conditions_vente: "" });
    expect(manquants).toContain("conditions de la vente");
    expect(refusDocumentIncomplet({ manquants })?.erreur).toMatch(/^PDF non généré/);
    expect(lienPourManquant("conditions de la vente", "org", [{ entite: "bail", entiteId: "b1" }], "conge_bailleur")).toBeNull();
    // Meublé : ni offre de vente, ni reproduction, ni conditions exigées.
    const meuble = await lettre({ motif: "vente" }, bail((c) => { c.bail.type = "meuble"; }));
    expect(meuble.manquants).not.toContain("conditions de la vente");
    expect(meuble.texte).not.toContain("(reproduction)");
    expect(meuble.texte).toContain("n'emporte pas offre de vente");
  });

  it("R02-A4, R13-A4 — vente ou reprise d'un logement nu : la notice est annoncée en pièce jointe, jamais imprimée", async () => {
    for (const options of [VENTE, REPRISE]) {
      const { texte, html } = await lettre(options);
      expect(html).toContain("<h2>Pièce jointe</h2>");
      expect(texte).toContain("Notice d'information relative aux obligations du bailleur et aux voies de recours et d'indemnisation du locataire, jointe au présent congé (arrêté du 13 décembre 2017).");
      // Aucun passage de la notice elle-même (ni son sommaire, ni sa coquille « 30 0000 € ») n'est dans la lettre.
      expect(texte).not.toMatch(/30 0000|Dispositions communes au congé pour vendre|Contacts utiles/);
    }
    // Motif légitime et sérieux, ou logement meublé : la notice ne s'applique pas, la lettre ne l'annonce pas.
    expect((await lettre({ motif: "motif_legitime", motif_detail: "Impayés répétés." })).html).not.toContain("Pièce jointe");
    expect((await lettre({ ...REPRISE }, bail((c) => { c.bail.type = "meuble"; }))).html).not.toContain("Pièce jointe");
  });

  it("R02-A8, R02-A9 — reprise : liens « à la date du congé », amende pénale ; protection de la personne à charge", async () => {
    const { texte } = await lettre(REPRISE);
    expect(texte).toContain("le partenaire auquel il est lié par un pacte civil de solidarité enregistré à la date du congé, son concubin notoire depuis au moins un an à la date du congé");
    expect(texte).toContain("est puni d'une amende pénale dont le montant ne peut être supérieur à 6 000 € pour une personne physique et à 30 000 € pour une personne morale");
    expect(texte).not.toContain("dommages et intérêts");
    expect(texte).toContain("lorsque le locataire a à sa charge une personne de plus de soixante-cinq ans vivant habituellement dans le logement");
    expect(texte).toContain("article L. 544-1 du code de la sécurité sociale");
    // Meublé : l'article 25-8 ne reprend pas l'allocation de l'article L. 544-1.
    const meuble = await lettre(REPRISE, bail((c) => { c.bail.type = "meuble"; }));
    expect(meuble.texte).not.toContain("L. 544-1");
    expect(meuble.texte).toContain("personne de plus de soixante-cinq ans vivant habituellement dans le logement");
    // Motif légitime : pas de sanction du congé « pour reprendre ou vendre ».
    expect((await lettre({ motif: "motif_legitime", motif_detail: "Impayés répétés." })).texte).not.toContain("amende pénale");
  });

  it("R13-A5 — reprise d'un logement nu : refusée pour une SCI non familiale ou une autre personne morale ; admise pour une SCI familiale", async () => {
    for (const qualite of ["SCI", "Personne morale", "sci_non_familiale".replace(/_/g, " ")]) {
      const { resultat, rpc } = await brut(REPRISE, bail((c) => { c.bailleurs = [{ ...personne({ id: "s1", nom: "SCI Fictive", prenom: null, qualite }), quote_part: 100 }]; }));
      expect("erreur" in resultat && resultat.erreur, qualite).toMatch(/^Congé pour reprise impossible : le bailleur est une société/);
      expect(rpc).not.toHaveBeenCalled();
    }
    const familiale = await lettre(REPRISE, bail((c) => { c.bailleurs = [{ ...personne({ id: "s1", nom: "SCI Famille Fictive", prenom: null, qualite: "SCI familiale" }), quote_part: 100 }]; }));
    expect(familiale.texte).toContain("la reprise est faite par la société au profit de l'un de ses associés (article 13 de la loi du 6 juillet 1989)");
    // La vente reste ouverte à une société ; en meublé, la reprise n'est pas contrôlée (le texte fourni ne le dit pas).
    const societe = (c: ReturnType<typeof contexte>) => { c.bailleurs = [{ ...personne({ id: "s1", nom: "SCI Fictive", prenom: null, qualite: "SCI" }), quote_part: 100 }]; };
    expect("document" in (await brut(VENTE, bail(societe))).resultat).toBe(true);
    expect("document" in (await brut(REPRISE, bail((c) => { societe(c); c.bail.type = "meuble"; }))).resultat).toBe(true);
  });

  it("R13-A7 — logement acheté déjà loué : la question est obligatoire en location nue (vente, reprise), pas ailleurs", async () => {
    for (const options of [VENTE, REPRISE]) {
      const sans: Record<string, string> = { ...options };
      delete sans.achete_occupe;
      const { resultat } = await brut(sans);
      expect("erreur" in resultat && resultat.erreur).toMatch(/^Indiquez si le logement a été acheté alors qu’il était déjà loué \(oui ou non\)/);
      const sansDate = await brut({ ...options, achete_occupe: "oui" });
      expect("erreur" in sansDate.resultat && sansDate.resultat.erreur).toBe("Logement acheté déjà loué : indiquez la date d’acquisition.");
    }
    expect("document" in (await brut({ motif: "motif_legitime", motif_detail: "Impayés répétés." })).resultat).toBe(true);
    expect("document" in (await brut({ motif: "vente" }, bail((c) => { c.bail.type = "meuble"; }))).resultat).toBe(true);
  });

  it("R13-A7 — les exemples de la notice : Gerimmo compare le terme visé à la date d'acquisition et refuse dans le doute", async () => {
    // Point 2-2-2 : acquis le 1er mars 2015, bail à échéance le 31 mai 2017 → pas de congé pour vendre à ce terme ;
    // au terme de la première reconduction (31 mai 2020), oui.
    expect(refusLogementAcheteOccupe("vente", "2015-03-01", "2017-05-31")).toMatch(/ne peut être donné qu’au terme de la première reconduction tacite ou du premier renouvellement/);
    expect(refusLogementAcheteOccupe("vente", "2015-03-01", "2020-05-31")).toBeNull();
    // Point 2-1-4 : acquis le 15 juin 2016, terme le 20 juillet 2017 → le congé pour reprise ne prend effet que le 15 juin 2018 :
    // Gerimmo ne sait pas l'écrire, il refuse.
    expect(refusLogementAcheteOccupe("reprise", "2016-06-15", "2017-07-20")).toMatch(/ne prend effet qu’à l’expiration d’une durée de deux ans à compter de la date d’acquisition/);
    expect(refusLogementAcheteOccupe("reprise", "2016-06-15", "2018-06-16")).toBeNull();
    // Égalité (terme exactement deux ou trois ans après) : le texte ne tranche pas, Gerimmo refuse.
    expect(refusLogementAcheteOccupe("reprise", "2016-06-15", "2018-06-15")).not.toBeNull();
    expect(refusLogementAcheteOccupe("vente", "2015-03-01", "2018-03-01")).not.toBeNull();
    // Dans la lettre : le terme visé (31/08/2029) est comparé à l'acquisition.
    const refuse = await brut({ ...VENTE, achete_occupe: "oui", date_acquisition: "2027-01-10" });
    expect("erreur" in refuse.resultat && refuse.resultat.erreur).toMatch(/^Logement acheté déjà loué le 10\/01\/2027 : le terme visé \(31\/08\/2029\) n’intervient pas plus de trois ans après l’acquisition\./);
    expect("document" in (await brut({ ...VENTE, achete_occupe: "oui", date_acquisition: "2020-01-10" })).resultat).toBe(true);
    expect("erreur" in (await brut({ ...REPRISE, achete_occupe: "oui", date_acquisition: "2028-01-10" })).resultat).toBe(true);
    expect("document" in (await brut({ ...REPRISE, achete_occupe: "oui", date_acquisition: "2027-01-10" })).resultat).toBe(true);
  });

  it("R13-A1 — la lettre vise le terme suivant quand le congé serait reçu le lendemain de la date limite", async () => {
    // Terme en cours le 20/09/2027 : reçu le 20/03/2027, il tient ; reçu le 21/03/2027, il vise le terme suivant.
    const appels = async (reception: string) => {
      vi.mocked(chargerContexteBail).mockResolvedValue(bail());
      const rpc = vi.fn(async (_nom: string, args: { p_date: string }) => ({ data: args.p_date <= "2027-09-20" ? "2027-09-20" : "2030-09-20", error: null }));
      const r = await assemblerCongeBailleur({ rpc } as unknown as SupabaseClient, "org", "b1", { ...VENTE, date_presentation: reception });
      if (!("document" in r)) throw new Error("congé non assemblé");
      return texteDe(r.document.html);
    };
    const aTemps = await appels("2027-03-20");
    expect(aTemps).toContain("prend effet à l'échéance du bail, soit le 20/09/2027");
    expect(aTemps).not.toContain("il vise l'échéance suivante");
    const tardif = await appels("2027-03-21");
    expect(tardif).toContain("prend effet à l'échéance du bail, soit le 20/09/2030");
    expect(tardif).toMatch(/Reçu le 21\/03\/2027 ?, ce congé ne respecterait plus le préavis avant l'échéance en cours : il vise l'échéance suivante\./);
  });

  it("la lettre ne se dit jamais « conforme » et ne parle plus de « présentation »", async () => {
    for (const options of [VENTE, REPRISE, { motif: "motif_legitime", motif_detail: "Impayés répétés." }]) {
      const { texte } = await lettre(options);
      expect(texte).not.toMatch(/\bconforme\b|première présentation|[Pp]résenté le|huissier/);
    }
  });
});

describe("R02-A6, R13-A2, R02-A10 — « réception », plus « première présentation » ; « commissaire de justice »", () => {
  const ECRANS = [
    "src/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur.tsx",
    "src/lib/documents/modeles/conge-bailleur.ts",
    "src/app/actions/conge-locataire.ts",
  ];

  it("les écrans et le modèle du congé ne disent plus « première présentation » ni « huissier »", () => {
    for (const chemin of ECRANS) {
      const texte = sansCommentaires(source(chemin));
      expect(texte, chemin).not.toMatch(/première présentation|[Pp]résentation prévue|huissier/);
    }
    const options = JSON.stringify(OPTIONS_CATALOGUE.conge_bailleur);
    expect(options).not.toMatch(/première présentation|Présentation prévue|huissier/);
    expect(OPTIONS_CATALOGUE.conge_bailleur.find((c) => c.cle === "date_presentation")?.libelle).toBe("Réception prévue par le locataire (aujourd’hui par défaut)");
  });

  it("la consigne dit ce qui fait courir le délai, pour chacun des trois modes de notification", () => {
    expect(CONGE_RECEPTION).toContain("pour une lettre recommandée avec demande d’avis de réception, le jour où la lettre lui est effectivement remise (une lettre présentée mais non retirée ne fait pas courir le délai)");
    expect(CONGE_RECEPTION).toContain("pour un acte de commissaire de justice, le jour de la signification");
    expect(CONGE_RECEPTION).toContain("pour une remise en main propre contre récépissé ou émargement, le jour de la remise");
  });

  it("la fiche du bail dit « reçu le » pour un congé enregistré ; la colonne garde son nom (aucune donnée n'est changée)", () => {
    const page = source("src/app/agence/[orgId]/baux/[bailId]/page.tsx");
    expect(page).toContain("le locataire\"}, reçu");
    expect(page).toContain("c.date_premiere_presentation");
    const migration = source(`supabase/migrations/${NOM}.sql`).replace(/^\s*--.*$/gm, "");
    expect(migration).toContain("comment on column public.conges.date_premiere_presentation is");
    expect(migration).not.toMatch(/alter table public\.conges|update public\.conges|delete from public\.conges/i);
  });
});

describe("R02-A4 — l'écran dit de joindre la notice soi-même, et où la trouver", () => {
  it("vente ou reprise d'un logement nu : rappel affiché ; meublé : pas de rappel", async () => {
    const { GenererCongeBailleur } = await import("@/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur");
    const rendre = (meuble: boolean) => renderToStaticMarkup(createElement(GenererCongeBailleur, { orgId: "org", bailId: "b1", cheminRetour: "/x", meuble, terme: "2029-08-31" }));
    const rappel = /<p[^>]*data-conge-notice-a-joindre[^>]*>([\s\S]*?)<\/p>/.exec(rendre(false))?.[1] ?? "";
    expect(texteDe(rappel)).toContain("Notice à joindre vous-même.");
    expect(texteDe(rappel)).toContain("Gerimmo ne l'imprime pas : joignez-la vous-même.");
    expect(rendre(true)).not.toContain("data-conge-notice-a-joindre");
  });

  it("le texte indique Légifrance et l'identifiant du texte donnés par le recueil, sans adresse inventée", () => {
    expect(CONGE_NOTICE_A_JOINDRE).toContain("l’annexe de cet arrêté, publiée sur Légifrance (legifrance.gouv.fr, texte JORFTEXT000036236664)");
    expect(CONGE_NOTICE_A_JOINDRE).not.toMatch(/https?:\/\//);
    expect(OPTIONS_CATALOGUE.conge_bailleur.find((c) => c.cle === "motif")?.aide).toContain(CONGE_NOTICE_A_JOINDRE);
  });

  it("le catalogue pose aussi la question « acheté déjà loué » et demande les conditions de la vente", () => {
    const champs = OPTIONS_CATALOGUE.conge_bailleur;
    const question = champs.find((c) => c.cle === "achete_occupe");
    expect(question?.choix?.map((c) => c.valeur)).toEqual(["", "non", "oui"]);
    expect(question?.si?.valeurs).toEqual(["vente", "reprise"]);
    expect(champs.find((c) => c.cle === "date_acquisition")?.type).toBe("date");
    expect(champs.find((c) => c.cle === "conditions_vente")?.aide).toContain("Obligatoires pour un logement loué nu");
    // La liste de choix facultative n'est plus « required » dans le formulaire du catalogue (réponse exigée par le modèle, en location nue).
    expect(source("src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx")).toContain("required={!c.facultatif} value={choixSaisis[c.cle]");
  });
});

describe("R02-A5 — préavis réduit du locataire : jamais un mois d'office en zone tendue", () => {
  const rendre = async (props: Record<string, unknown>) => {
    const { FormulaireConge } = await import("@/app/agence/[orgId]/baux/[bailId]/formulaires-bail");
    return renderToStaticMarkup(createElement(FormulaireConge, { orgId: "org", bailId: "b1", type: "nu", ...props } as never));
  };
  const preavis = (html: string) => /<input[^>]*name="preavis_mois"[^>]*>/.exec(html)?.[0] ?? "";

  it("logement nu en zone tendue : trois mois tant que la case « motif précisé et justifié dans la lettre » n'est pas cochée", async () => {
    const html = await rendre({ zoneTendue: true });
    expect(preavis(html)).toContain('value="3"');
    const texte = texteDe(html);
    expect(texte).toContain("Préavis réduit à 1 mois : la lettre de congé précise le motif et le justifie (zone tendue, mutation, santé, perte d'emploi, RSA/AAH…)");
    expect(texte).toContain("le préavis est d'un mois seulement si le locataire le demande dans sa lettre de congé, en précisant ce motif et en le justifiant. Sinon, le préavis est de trois mois.");
    expect(texte).not.toContain("de plein droit");
  });

  it("meublé : un mois ; nu hors zone tendue : trois mois, comme avant", async () => {
    expect(preavis(await rendre({ type: "meuble" }))).toContain('value="1"');
    expect(preavis(await rendre({ zoneTendue: false }))).toContain('value="3"');
  });

  it("l'espace du locataire ne promet plus un mois parce que le logement est en zone tendue", () => {
    const page = sansCommentaires(source("src/app/locataire/[orgId]/logement/page.tsx"));
    expect(page).toContain("const preavisMois = bailMeuble ? 1 : 3;");
    expect(page).toContain("1 mois si votre lettre de congé précise que le logement est en zone tendue et le justifie ; sinon 3 mois");
    const carte = sansCommentaires(source("src/app/locataire/[orgId]/logement/carte-conge.tsx"));
    expect(carte).not.toContain("logement meublé ou zone tendue");
    expect(carte).toContain("sans cela, le préavis reste de 3 mois");
    expect(sansCommentaires(source("src/app/locataire/[orgId]/faq/page.tsx"))).not.toContain("1 mois en meublé ou en zone tendue");
  });
});

describe("migration du lot T1 — manifeste et retour (sans base)", () => {
  it("la migration est au manifeste une seule fois, en dernier, avec son retour listé au LISEZ-MOI", () => {
    const manifeste = readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);
    expect(manifeste.filter((l) => l === `${NOM}.sql`)).toHaveLength(1);
    expect(manifeste.indexOf(`${NOM}.sql`)).toBeGreaterThan(manifeste.indexOf("20261124230000_reperes_fiscaux_ancien_reglage_journal_source.sql"));
    expect(existsSync(`supabase/retours-arriere/${NOM}.retour.sql`)).toBe(true);
    expect(readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8")).toContain(`| \`${NOM}.retour.sql\` | \`${NOM}.sql\``);
    expect(readFileSync("tests/relais-migrations-manifeste.test.ts", "utf8")).toContain(`"${NOM}.sql",`);
  });

  it("la migration n'écrit aucune donnée, ne lit pas le jour de la session et n'ouvre aucun droit", () => {
    const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/current_date/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/alter table|drop table|truncate|update public\.conges|delete from public\.conges/i);
    expect(sql).toContain("revoke execute on function public.date_limite_conge_bailleur(date, integer) from public, anon, authenticated;");
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
  });
});
