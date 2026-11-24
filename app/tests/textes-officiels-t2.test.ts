/**
 * Textes officiels, lot T2 — bail, caution, colocation, notice. Écarts relevés entre le recueil fourni par le dirigeant
 * (source Légifrance et version déclarées, non recontrôlées) et le code :
 *  - R08-A1 : mandataire du bail — activité exercée et garant ;
 *  - R08-A2 : honoraires — les trois premiers alinéas du I de l'article 5, rappelés mot pour mot ;
 *  - R08-A3 : première échéance — montant d'une période complète, détaillé ; premier terme calculé comme l'appel de loyer ;
 *  - R08-A4, A5, A7, R05-A1 : clause résolutoire, phrases de la rubrique III, rappel de décence, quote-part de charges ;
 *  - R17-A1, R17-A4 : clause de solidarité dans les mots de l'article 8-1, exception des époux et partenaires de PACS ;
 *  - R17-A2 : pas de bail nu à durée réduite ; R20-A1 = R08-A6 : plus de rubrique « durée réduite » en meublé ;
 *  - R03-A1, R17-A3 : acte de cautionnement refusé (bailleur société non familiale ; colocataire non désigné) ;
 *  - R03-A2, R03-A3 : conditions de la révision comme au bail ; plus de « pénalités de retard » ;
 *  - R06-A2 = R11-A1, R06-A3 : phrases fausses du résumé de la notice ;
 *  - R01-A3 : version de la loi citée dans l'ancienne rédaction de la lettre de révision.
 * Les rendus archivés (bail déjà préparé pour la signature) sont gardés par signature-empreinte-avant-g8.test.ts.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chargerContexteBail: vi.fn(),
  signatureOrganisation: vi.fn(async () => null),
}));
import { chargerContexteBail, typographieArchivee, type ContexteBail } from "@/lib/documents/modeles/communs";
import { Fusion } from "@/lib/documents/gabarit";
import { assemblerBailNu, construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { assemblerBailMeuble, construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { assemblerBailColocation } from "@/lib/documents/modeles/bail-colocation";
import { assemblerCautionnement } from "@/lib/documents/modeles/cautionnement";
import { assemblerNotice } from "@/lib/documents/modeles/notice";
import { REFUS_BAIL_DUREE_REDUITE, calculPremiereEcheance } from "@/lib/documents/modeles/mentions-location";
import { ARTICLE_5_I_ALINEAS_1_A_3, CLAUSE_RESOLUTOIRE_CONTRAT_TYPE, EMPREINTE_TEXTES_CONTRAT_TYPE, RAPPEL_DECENCE_METHODE_DPE } from "@/lib/documents/modeles/contrat-type-textes";
import { REFUS_CAUTION_BAILLEUR_SOCIETE, REFUS_CAUTION_SANS_COLOCATAIRE } from "@/lib/textes-signature-actes";
import { texteMentionCaution } from "@/lib/mention-caution";
import { selectionSignatureValide } from "@/lib/politique-signature";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";

/** Le texte lu : balises retirées, blancs réunis, apostrophes et espaces insécables ramenés à leur forme simple. */
const texteDe = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h\d>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;|[  ]/g, " ").replace(/’/g, "'").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const simple = (s: string) => s.replace(/’/g, "'");

/** Une base simulée : toute lecture rend une liste vide (un DPE « D » pour les diagnostics). */
function base(): SupabaseClient {
  const from = (table: string) => {
    const resultat = { data: table === "diagnostics" ? { classe_dpe: "D" } : [], error: null };
    const q: Record<string, unknown> = { maybeSingle: async () => resultat, then: (ok: (v: unknown) => unknown) => Promise.resolve(resultat).then(ok) };
    for (const op of ["select", "eq", "is", "in", "order", "limit"]) q[op] = () => q;
    return q;
  };
  return { from, rpc: from } as unknown as SupabaseClient;
}
const nu = (c: ContexteBail, o: { typographieArchivee?: boolean } = {}) => texteDe(construireBailNu(c, { dpeClasse: "D", f: new Fusion(), ...o }).html);
const meuble = (c: ContexteBail, o: { typographieArchivee?: boolean } = {}) => texteDe(construireBailMeuble(c, { dpeClasse: "D", inventaire: [], f: new Fusion(), ...o }).html);
function agence(): ContexteBail {
  const c = contexte();
  Object.assign(c.organisation, { type: "agence", name: "Agence du Parc", carte_pro: "CPI 6901 2018 000 025 — CCI de Lyon", garantie_financiere: "Garant Fictif, 1 rue de l'Essai, 69002 Lyon, 120 000 €" });
  return c;
}
function avecLocataires(n: number): ContexteBail {
  const c = contexte();
  c.locataires = Array.from({ length: n }, (_, i) => personne({ id: `l${i + 1}`, nom: `Locataire${i + 1}`, prenom: "Ana" }));
  c.bail.locataire_principal = "l1";
  return c;
}

let ctx: ContexteBail;
beforeEach(() => {
  ctx = contexte();
  vi.mocked(chargerContexteBail).mockImplementation(async () => ctx);
});

describe("passages du contrat type repris mot pour mot", () => {
  it("les six textes extraits du recueil n'ont pas été retouchés (empreinte relevée à l'extraction)", () => {
    const tout = [...ARTICLE_5_I_ALINEAS_1_A_3, ...CLAUSE_RESOLUTOIRE_CONTRAT_TYPE, RAPPEL_DECENCE_METHODE_DPE];
    expect(tout).toHaveLength(6);
    expect(createHash("sha256").update(tout.join("\n")).digest("hex")).toBe(EMPREINTE_TEXTES_CONTRAT_TYPE);
  });
  it.each([["nu", nu], ["meublé", meuble]] as const)("R08-A4, R08-A7 — bail %s : clause résolutoire et rappel de décence du contrat type", (_nom, rendre) => {
    const texte = rendre(contexte());
    for (const phrase of [...CLAUSE_RESOLUTOIRE_CONTRAT_TYPE, RAPPEL_DECENCE_METHODE_DPE]) expect(texte).toContain(phrase);
    // Les anciennes rédactions ne sont plus imprimées.
    expect(texte).not.toContain("sous réserve des dispositions de l'article 24");
    expect(texte).not.toContain("doit également respecter le seuil applicable");
  });
  it.each([["nu", nu], ["meublé", meuble]] as const)("R08-A2 — bail %s d'une agence : les trois alinéas de l'article 5 I, les plafonds, le détail par partie", (_nom, rendre) => {
    const texte = rendre(agence());
    expect(texte).toContain("Il est rappelé les dispositions du I de l'article 5 de la loi du 6 juillet 1989, alinéas 1 à 3 :");
    for (const alinea of ARTICLE_5_I_ALINEAS_1_A_3) expect(texte).toContain(`« ${alinea} »`);
    expect(texte).toContain("Plafonds applicables :");
    expect(texte).toContain("Honoraires à la charge du bailleur : — prestations de visite du preneur, de constitution de son dossier et de rédaction de bail : 300,00 € TTC, dus à la signature du bail ; — prestation de réalisation de l'état des lieux d'entrée : 120,00 € TTC, dus à compter de la réalisation de la prestation.");
    expect(texte).toContain("Honoraires à la charge du locataire : — prestations de visite du preneur, de constitution de son dossier et de rédaction de bail : 300,00 € TTC, dus à la signature du bail ; — prestation de réalisation de l'état des lieux d'entrée : 100,00 € TTC, dus à compter de la réalisation de la prestation.");
    // L'ancienne paraphrase n'est plus imprimée.
    expect(texte).not.toContain("Conformément à l'article 5-I");
  });
  it("sans agence, la rubrique des honoraires reste « sans objet »", () => {
    expect(nu(contexte())).toContain("Sans objet — location conclue sans intermédiaire.");
  });
});

describe("R08-A1 — mandataire : activité exercée et garant", () => {
  it.each([["nu", nu], ["meublé", meuble]] as const)("bail %s : l'activité et le garant suivent la carte professionnelle", (_nom, rendre) => {
    expect(rendre(agence())).toContain("Le bailleur est représenté par son mandataire : Agence du Parc, 8 avenue des Tilleuls, 69006 Lyon — activité exercée : gestion immobilière — carte professionnelle : CPI 6901 2018 000 025 — CCI de Lyon — garant (nom et adresse) : Garant Fictif, 1 rue de l'Essai, 69002 Lyon, 120 000 €.");
  });
  it("garant non renseigné : le contrat est incomplet (pas de PDF), et le libellé le nomme", () => {
    const c = agence();
    c.organisation.garantie_financiere = null;
    expect(construireBailNu(c, { dpeClasse: "D", f: new Fusion() }).manquants).toContain("garantie financière du mandataire (nom et adresse du garant)");
  });
});

describe("R08-A3 — première échéance : période complète, puis premier terme calculé comme l'appel de loyer", () => {
  it("bail qui prend effet un 1er : le montant d'une période complète, détaillé, sans prorata", () => {
    const texte = nu(contexte());
    expect(texte).toContain("Montant total dû à la première échéance de paiement pour une période complète de location : 740,00 € (loyer 650,00 € + charges 90,00 €). V — Travaux");
    expect(texte).not.toContain("prorata");
  });
  it.each([["nu", nu], ["meublé", meuble]] as const)("bail %s qui prend effet le 15 novembre : 740,00 € pour la période complète, 394,67 € pour le premier terme", (_nom, rendre) => {
    const c = contexte();
    c.bail.date_debut = "2026-11-15";
    const texte = rendre(c);
    expect(texte).toContain("pour une période complète de location : 740,00 € (loyer 650,00 € + charges 90,00 €). Le contrat ne prenant pas effet le premier jour du mois, le premier terme est dû au prorata des jours du mois (16 jours sur 30) : 394,67 € (loyer 346,67 € + charges 48,00 €).");
    expect(texte).not.toContain("(premier mois au prorata)");
  });
  it("cas chiffrés : chaque ligne arrondie au centime, puis additionnée", () => {
    // 650,50 × 16/30 = 346,933… → 346,93 ; 50,50 × 16/30 = 26,933… → 26,93 ; total 373,86 (l'ancien calcul, arrondi du total
    // 701,00 × 16/30 = 373,866…, donnait 373,87 : un centime de plus que l'appel de loyer).
    expect(calculPremiereEcheance(650.5, 50.5, "2026-11-15")).toEqual({ complet: { loyer: 650.5, charges: 50.5, total: 701 }, prorata: { loyer: 346.93, charges: 26.93, total: 373.86, joursDus: 16, joursMois: 30 } });
    // Février 2028 (bissextile), entrée le 29 : un jour sur 29.
    expect(calculPremiereEcheance(1000, 100, "2028-02-29").prorata).toEqual({ loyer: 34.48, charges: 3.45, total: 37.93, joursDus: 1, joursMois: 29 });
    // Février 2027, entrée le 28 : un jour sur 28.
    expect(calculPremiereEcheance(1000, 100, "2027-02-28").prorata).toEqual({ loyer: 35.71, charges: 3.57, total: 39.28, joursDus: 1, joursMois: 28 });
    // Entrée le 31 d'un mois de 31 jours : un jour sur 31 ; entrée le 2 : trente jours sur 31.
    expect(calculPremiereEcheance(930, 0, "2026-12-31").prorata).toEqual({ loyer: 30, charges: 0, total: 30, joursDus: 1, joursMois: 31 });
    expect(calculPremiereEcheance(930, 31, "2026-12-02").prorata).toEqual({ loyer: 900, charges: 30, total: 930, joursDus: 30, joursMois: 31 });
    // Demi-centime exact : 0,25 € × 2/4 n'existe pas (aucun mois de 4 jours) ; 7,75 € × 15/30 = 3,875 → 3,88 (arrondi au plus proche, demi vers le haut, comme round() de la base).
    expect(calculPremiereEcheance(7.75, 0, "2026-11-16").prorata?.loyer).toBe(3.88);
    expect(calculPremiereEcheance(650, 90, "2026-09-01").prorata).toBeNull();
  });
  it("grille : le premier terme est toujours la somme de ses deux lignes, et jamais plus que la période complète", () => {
    let cas = 0, ecartsAncienCalcul = 0;
    for (const loyer of [0, 0.01, 333.33, 650, 650.5, 733.37, 1234.56, 99999.99]) for (const charges of [0, 0.5, 33.33, 50.5, 90, 120.07])
      for (const mois of ["2026-11", "2026-12", "2027-02", "2028-02"]) for (let jour = 2; jour <= Number(new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5)), 0)).getUTCDate()); jour++) {
        const c = calculPremiereEcheance(loyer, charges, `${mois}-${String(jour).padStart(2, "0")}`);
        const p = c.prorata!;
        cas++;
        expect(Math.round(p.total * 100)).toBe(Math.round(p.loyer * 100) + Math.round(p.charges * 100));
        expect(p.total).toBeLessThanOrEqual(c.complet.total);
        // Calcul témoin en entiers (centimes), arrondi au plus proche, demi vers le haut.
        const temoin = (x: number) => Math.floor((Math.round(x * 100) * p.joursDus * 2 + p.joursMois) / (2 * p.joursMois)) / 100;
        expect(p.loyer).toBe(temoin(loyer));
        expect(p.charges).toBe(temoin(charges));
        if (Math.round(((p.joursDus / p.joursMois) * (loyer + charges)) * 100) !== Math.round(p.total * 100)) ecartsAncienCalcul++;
      }
    expect(cas).toBe(8 * 6 * (29 + 30 + 27 + 28));
    // L'ancien calcul (arrondi du total) s'écartait de la somme des lignes dans une partie des cas : c'est l'écart corrigé.
    expect(ecartsAncienCalcul).toBeGreaterThan(0);
  });
  it("loyer, charges ou date d'entrée absents : le montant reste à renseigner, avec son libellé d'avant", () => {
    const c = contexte();
    c.bail.loyer_hc = null;
    expect(construireBailNu(c, { dpeClasse: "D", f: new Fusion() }).manquants).toContain("loyer + charges, montant au prorata");
  });
});

describe("R08-A5, R05-A1 — rubrique III et extraits du règlement de copropriété", () => {
  it("bail nu : reconduction pour la durée du contrat, congés, dans les mots du contrat type", () => {
    const texte = nu(contexte());
    expect(texte).toContain("Durée du contrat : trois ans. En l'absence de proposition de renouvellement du contrat, celui-ci est, à son terme, reconduit tacitement pour trois ans et dans les mêmes conditions. Le locataire peut mettre fin au bail à tout moment, après avoir donné congé. Le bailleur, quant à lui, peut mettre fin au bail à son échéance et après avoir donné congé, soit pour reprendre le logement en vue de l'occuper lui-même ou une personne de sa famille, soit pour le vendre, soit pour un motif sérieux et légitime.");
    expect(texte).not.toContain("dans les formes et délais légaux");
    const societe = contexte();
    societe.bailleurs[0].qualite = "SCI";
    expect(nu(societe)).toContain("Durée du contrat : six ans. En l'absence de proposition de renouvellement du contrat, celui-ci est, à son terme, reconduit tacitement pour six ans et dans les mêmes conditions.");
  });
  it("copropriété : la quote-part du lot dans chaque catégorie de charges est annoncée, au contrat et dans la liste des annexes", () => {
    for (const texte of [nu(contexte()), meuble(contexte())]) {
      expect(texte).toContain("à l'usage des parties privatives et communes, et précisant la quote-part afférente au lot loué dans chacune des catégories de charges, lui sont remis en annexe.");
      expect(texte).toContain("☐ Les extraits du règlement de copropriété (destination de l'immeuble, jouissance et usage des parties privatives et communes, quote-part afférente au lot loué dans chacune des catégories de charges)");
    }
  });
});

describe("R17-A1, R17-A4 — clause de solidarité", () => {
  const REGLE = "En colocation (article 8-1 de la loi du 6 juillet 1989), la solidarité de celui des colocataires qui donne congé prend fin à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau colocataire figure au bail. À défaut, elle s'éteint au plus tard à l'expiration d'un délai de six mois après la date d'effet du congé.";
  const EXCEPTION = "Cette règle ne s'applique pas si la location est consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat : une telle location n'est pas une colocation au sens de cet article.";
  it.each([["nu", nu], ["meublé", meuble]] as const)("bail %s à deux locataires : la règle de la colocation, puis l'exception des époux et partenaires de PACS", (_nom, rendre) => {
    const texte = rendre(avecLocataires(2));
    expect(texte).toContain(`Les locataires sont tenus solidairement et indivisiblement de l'exécution du présent contrat. ${REGLE} ${EXCEPTION}`);
    // L'ancienne phrase donnait les six mois à tout bail à plusieurs locataires, sans réserve.
    expect(texte).not.toContain("la solidarité s'éteint six mois après la date d'effet du congé, ou dès qu'un nouveau locataire le remplace");
  });
  it("trois locataires : l'exception, qui ne peut pas les concerner, n'est pas imprimée", () => {
    const texte = nu(avecLocataires(3));
    expect(texte).toContain(REGLE);
    expect(texte).not.toContain("époux");
  });
  it("un seul locataire : pas de clause de solidarité", () => {
    expect(nu(contexte())).not.toContain("solidairement");
  });
});

describe("R17-A2, R20-A1 — durée réduite pour un événement précis", () => {
  it("bail nu : le contrat n'est pas produit quand l'événement est rempli, et le message dit quoi faire", async () => {
    ctx.bail.duree_reduite_evenement = "Retour de mutation du bailleur en 2028";
    const r = await assemblerBailNu(base(), "org", "b1");
    expect(r).toEqual({ erreur: REFUS_BAIL_DUREE_REDUITE });
    expect(REFUS_BAIL_DUREE_REDUITE).toContain("Gerimmo ne sait pas encore préparer un bail à durée réduite");
    expect(REFUS_BAIL_DUREE_REDUITE).toContain("videz le champ « Événement justifiant une durée réduite »");
  });
  it("bail nu : un champ vide ou fait d'espaces ne bloque rien", async () => {
    ctx.bail.duree_reduite_evenement = "   ";
    expect("document" in (await assemblerBailNu(base(), "org", "b1"))).toBe(true);
  });
  it("colocation à bail commun, logement nu : même refus ; logement meublé : pas de refus", async () => {
    ctx = avecLocataires(2);
    Object.assign(ctx.bail, { type: "colocation", duree_reduite_evenement: "Retour de mutation" });
    expect(await assemblerBailColocation(base(), "org", "b1")).toEqual({ erreur: REFUS_BAIL_DUREE_REDUITE });
    ctx.lot.meuble = true;
    expect("document" in (await assemblerBailColocation(base(), "org", "b1"))).toBe(true);
  });
  it("le recalcul de l'empreinte d'un bail DÉJÀ préparé n'est pas refusé et rend son ancien texte", async () => {
    ctx.bail.duree_reduite_evenement = "Retour de mutation du bailleur en 2028";
    const r = await assemblerBailNu(base(), "org", "b1", { [typographieArchivee]: true });
    if (!("document" in r)) throw new Error("refus inattendu");
    expect(texteDe(r.document.html)).toContain("Un contrat d'une durée réduite (au moins un an) n'est possible que si un événement précis justifie la reprise du logement par le bailleur : Retour de mutation du bailleur en 2028");
  });
  it("bail meublé : le champ n'est plus lu et la rubrique n'est plus imprimée, même « sans objet »", async () => {
    ctx.bail.type = "meuble";
    ctx.bail.duree_reduite_evenement = "Retour de mutation du bailleur en 2028";
    const r = await assemblerBailMeuble(base(), "org", "b1");
    if (!("document" in r)) throw new Error("refus inattendu");
    const texte = texteDe(r.document.html);
    expect(texte).not.toContain("Retour de mutation");
    expect(texte).not.toMatch(/durée réduite/i);
    expect(texte).toContain("Durée du contrat : un an, reconduit tacitement. Le contrat est reconduit tacitement à son terme pour une durée d'un an et dans les mêmes conditions. Le locataire peut mettre fin au bail à tout moment, après avoir donné congé.");
  });
  it("les deux formulaires du bail ne proposent plus le champ en meublé et préviennent en location nue", () => {
    const dossier = join(__dirname, "../src/app/agence/[orgId]/baux/[bailId]");
    const complements = readFileSync(join(dossier, "formulaire-complements-bail.tsx"), "utf8");
    expect(complements).toMatch(/\{!meuble && <div[^>]*data-complement="conditions"[\s\S]{0,400}name="duree_reduite_evenement"/);
    expect(complements).toContain("Gerimmo ne sait pas encore préparer un bail à durée réduite : si ce champ est rempli, le contrat n’est pas produit.");
    const parcours = readFileSync(join(dossier, "formulaire-parcours-bail.tsx"), "utf8");
    expect(parcours).toMatch(/nom:"duree_reduite_evenement",titre:"Événement justifiant une durée réduite",visible:v=>!\(v\.type==="meuble"/);
  });
});

describe("R03-A1, R17-A3 — acte de cautionnement : un refus plutôt qu'un acte nul", () => {
  const OPTIONS = { garant: "g1", forme: "solidaire", sans_garantie_cumulee: "oui", montant_max: "12000" };
  const garant = (de: string | null) => [{ ...personne({ id: "g1", nom: "Garant", prenom: "Paul" }), garant_de: de }] as never;
  beforeEach(() => {
    ctx.bail.etat = "actif";
    ctx.garants = garant("p1");
  });
  it.each(["SCI", "Personne morale", "sci (non familiale)", "personne_morale"])("bailleur « %s » : acte refusé, message clair", async (qualite) => {
    ctx.bailleurs[0].qualite = qualite;
    expect(await assemblerCautionnement(base(), "org", "b1", OPTIONS)).toEqual({ erreur: REFUS_CAUTION_BAILLEUR_SOCIETE });
    expect(REFUS_CAUTION_BAILLEUR_SOCIETE).toContain("étudiant qui ne bénéficie pas d'une bourse de l'enseignement supérieur");
  });
  it("indivision dont UN bailleur est une société non familiale : refusé aussi", async () => {
    ctx.bailleurs.push({ ...personne({ id: "b2", nom: "Société Fictive", prenom: null, qualite: "Personne morale" }), quote_part: 50 } as never);
    expect(await assemblerCautionnement(base(), "org", "b1", OPTIONS)).toEqual({ erreur: REFUS_CAUTION_BAILLEUR_SOCIETE });
  });
  it.each(["Personne physique", "Indivision (personnes physiques)", "SCI familiale", null])("bailleur « %s » : acte préparé", async (qualite) => {
    ctx.bailleurs[0].qualite = qualite;
    const r = await assemblerCautionnement(base(), "org", "b1", OPTIONS);
    expect("document" in r).toBe(true);
    if ("document" in r) expect(texteDe(r.document.html)).not.toContain("étudiant");
  });
  it("société non familiale et étudiant non boursier déclaré : acte préparé, la déclaration y figure", async () => {
    ctx.bailleurs[0].qualite = "SCI";
    const r = await assemblerCautionnement(base(), "org", "b1", { ...OPTIONS, etudiant_non_boursier: "oui" });
    if (!("document" in r)) throw new Error("refus inattendu");
    expect(texteDe(r.document.html)).toContain("Le bailleur, personne morale, déclare que le logement est loué à un étudiant ne bénéficiant pas d'une bourse de l'enseignement supérieur (article 22-1 de la loi du 6 juillet 1989).");
  });
  it("la déclaration passe par le catalogue (case facultative) et par la signature en ligne", () => {
    const champ = OPTIONS_CATALOGUE.cautionnement.find((c) => c.cle === "etudiant_non_boursier");
    expect(champ).toMatchObject({ type: "case", facultatif: true });
    expect(selectionSignatureValide({ code: "cautionnement", cibleId: "11111111-1111-4111-8111-111111111111", options: { ...OPTIONS, etudiant_non_boursier: "oui" } }).options).toMatchObject({ etudiant_non_boursier: "oui" });
    const formulaire = readFileSync(join(__dirname, "../src/app/agence/[orgId]/documents/catalogue/formulaire-catalogue.tsx"), "utf8");
    expect(formulaire).toContain('type="checkbox" value="oui" required={!c.facultatif}');
  });
  it("bail à plusieurs locataires, garant rattaché à personne : acte refusé", async () => {
    ctx = avecLocataires(2);
    ctx.bail.etat = "actif";
    ctx.garants = garant(null);
    expect(await assemblerCautionnement(base(), "org", "b1", OPTIONS)).toEqual({ erreur: REFUS_CAUTION_SANS_COLOCATAIRE });
    // Rattaché à quelqu'un qui n'est pas (ou plus) locataire du bail : même refus.
    ctx.garants = garant("ancien-colocataire");
    expect(await assemblerCautionnement(base(), "org", "b1", OPTIONS)).toEqual({ erreur: REFUS_CAUTION_SANS_COLOCATAIRE });
  });
  it("bail à deux locataires, colocataire désigné : l'acte le nomme, donne la règle de l'article 8-1 et l'exception des époux", async () => {
    ctx = avecLocataires(2);
    ctx.bail.etat = "actif";
    ctx.garants = garant("l2");
    const r = await assemblerCautionnement(base(), "org", "b1", OPTIONS);
    if (!("document" in r)) throw new Error("refus inattendu");
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Le présent cautionnement garantit les obligations de Locataire2 Ana, locataire au titre du bail");
    expect(texte).toContain("Cautionnement nominatif, donné pour Locataire2 Ana. En colocation (article 8-1 de la loi du 6 juillet 1989), la solidarité du colocataire désigné ci-dessus et l'engagement de la caution prennent fin à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau colocataire figure au bail. À défaut, ils s'éteignent au plus tard à l'expiration d'un délai de six mois après la date d'effet du congé. Cette règle ne s'applique pas si la location est consentie exclusivement à des époux");
    expect(r.mentionCaution).toContain("caution solidaire de Locataire2 Ana envers le bailleur");
  });
  it("un seul locataire, garant sans rattachement : acte préparé comme avant", async () => {
    ctx.garants = garant(null);
    expect("document" in (await assemblerCautionnement(base(), "org", "b1", OPTIONS))).toBe(true);
  });
  it("R03-A2, R03-A3 : conditions de la révision comme au bail ; plus de « pénalités », ni dans l'acte ni dans la mention", async () => {
    const r = await assemblerCautionnement(base(), "org", "b1", OPTIONS);
    if (!("document" in r)) throw new Error("refus inattendu");
    const texte = texteDe(r.document.html);
    expect(texte).toContain("Le loyer est révisé chaque année à la date anniversaire du contrat, dans la limite de la variation de l'indice de référence des loyers (IRL). Trimestre de référence : 2e trimestre 2026 — valeur de l'indice : 145,17. Le cautionnement s'étend au loyer ainsi révisé.");
    expect(texte).toContain("La caution garantit le paiement des loyers, des charges, des réparations locatives et des intérêts de retard dus par le locataire au titre du bail.");
    expect(texte).not.toMatch(/pénalité/i);
    expect(r.mentionCaution).not.toMatch(/pénalité/i);
    const mention = texteMentionCaution({ caution: "Garant Paul", locataires: "Leblanc Julie", plafond: "douze mille euros (12 000,00 €)", solidaire: true });
    expect(mention).toContain("— loyers, charges, réparations locatives et intérêts de retard —");
    // Les éléments de l'article 2297 du code civil restent tous dans la mention.
    for (const element of ["m'engage en qualité de caution solidaire", "en cas de défaillance du locataire", "dans la limite de la somme de douze mille euros (12 000,00 €)", "couvrant le principal et les accessoires", "Je reconnais ne pouvoir exiger du bailleur qu'il poursuive d'abord le locataire, ni qu'il divise ses poursuites entre les cautions."]) expect(mention).toContain(element);
  });
  it("la carte du bail propose la déclaration et annonce les deux refus", () => {
    const carte = readFileSync(join(__dirname, "../src/app/agence/[orgId]/baux/[bailId]/carte-cautionnement.tsx"), "utf8");
    expect(carte).toContain('etudiant_non_boursier: "oui"');
    expect(carte).toContain("data-rappel-caution-colocation");
    expect(carte).not.toContain("Gerimmo ne\n        contrôle pas ce point");
  });
});

describe("R06-A2 = R11-A1, R06-A3 — résumé de la notice", () => {
  it("les phrases fausses sont corrigées d'après le recueil", async () => {
    const r = await assemblerNotice(base(), "org", "b1");
    if (!("document" in r)) throw new Error("refus inattendu");
    const texte = texteDe(r.document.html);
    // Dépôt de garantie rendu en retard : majoration de 10 %, pas d'intérêt (article 22).
    expect(texte).not.toContain("produit intérêt");
    expect(texte).toContain("À défaut de restitution dans ce délai, le montant restant dû au locataire est majoré d'une somme égale à 10 % du loyer mensuel hors charges pour chaque période mensuelle commencée en retard ; cette majoration n'est pas due si le retard vient de ce que le locataire n'a pas communiqué l'adresse de son nouveau domicile. Le dépôt de garantie ne porte pas intérêt au bénéfice du locataire.");
    expect(texte).toContain("une personne physique ou une société civile immobilière familiale (six ans pour une autre personne morale)");
    expect(texte).toContain("À défaut d'état des lieux d'entrée, le logement est présumé avoir été délivré en bon état, sauf si le locataire en apporte la preuve contraire ou si le bailleur a fait obstacle à l'établissement de l'état des lieux.");
    expect(texte).not.toContain("en bon état de réparations locatives");
    expect(texte).toContain("En location meublée, il est d'un mois.");
    expect(texte).toContain("le litige relève du tribunal judiciaire dans le ressort duquel se situe le logement");
    expect(texte).not.toContain("juge des contentieux de la protection");
    // Le résumé dit quelle notice officielle remettre, et reste un résumé.
    expect(texte).toContain("pour un contrat conclu ou renouvelé depuis le 18 octobre 2026, dans sa rédaction issue de l'arrêté du 9 octobre 2026.");
    expect(texte).toContain("Il ne remplace pas la notice d'information officielle");
  });
  it("l'écran du bail dit quelle version de la notice déposer, et Gerimmo n'imprime pas la notice", () => {
    const ecran = readFileSync(join(__dirname, "../src/app/agence/[orgId]/baux/[bailId]/documents-parcours-bail.tsx"), "utf8");
    expect(simple(ecran)).toContain("Version à déposer pour un contrat conclu ou renouvelé depuis le 18 octobre 2026 : l'annexe de l'arrêté du 29 mai 2015 dans sa rédaction issue de l'arrêté du 9 octobre 2026.");
    expect(simple(ecran)).toContain("Gerimmo ne fournit pas ce texte et ne vérifie pas le fichier déposé");
  });
});

describe("R01-A3 — lettre de révision, ancienne rédaction", () => {
  it("la version de la loi de 2014 n'est plus citée", () => {
    const source = readFileSync(join(__dirname, "../src/lib/documents/modeles/revision-irl.ts"), "utf8");
    expect(source).not.toContain("2014-366");
  });
});
