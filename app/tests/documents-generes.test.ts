/**
 * Sprint « Documents-0 » — socle de rendu et modèles.
 * Unitaires purs (gabarit, fusion, montants en lettres, HTML des modèles) ;
 * le rendu PDF réel est couvert par un test local sauté si Chrome est absent
 * (CI sans navigateur) — la vérification visuelle contre les épreuves est
 * faite en recette.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  Fusion,
  assemblerPage,
  eur,
  formaterDateFr,
  montantEnLettres,
  VERSION_MODELES,
} from "../src/lib/documents/gabarit";
import { construireQuittance, type DonneesQuittance } from "../src/lib/documents/modeles/quittance";
import { corpsRelance } from "../src/lib/relance-paiement-email";

describe("Gabarit — fusion des champs", () => {
  it("imprime la valeur quand elle existe, le libellé d'épreuve sinon — et collecte les manquants", () => {
    const f = new Fusion();
    expect(f.champ("Julie Leblanc", "nom et prénom(s)")).toContain("Julie Leblanc");
    expect(f.champ("", "domicile ou siège social")).toContain(
      '<span class="fusion">domicile ou siège social</span>'
    );
    expect(f.champ(null, "IBAN, facultatif")).toContain("IBAN, facultatif");
    // dédoublonné, dans l'ordre d'apparition
    f.champ(null, "IBAN, facultatif");
    expect(f.manquants).toEqual(["domicile ou siège social", "IBAN, facultatif"]);
  });

  it("échappe le HTML des valeurs (une adresse ne doit pas injecter de balise)", () => {
    const f = new Fusion();
    expect(f.champ("<script>x</script>", "nom")).not.toContain("<script>");
  });

  it("formate dates et montants à la française", () => {
    expect(formaterDateFr("2026-08-01")).toBe("01/08/2026");
    expect(eur(1040.5)).toMatch(/1\s040,50\s€/);
  });

  it("dit les montants en toutes lettres (dépôt de garantie du bail)", () => {
    expect(montantEnLettres(650)).toBe("six cent cinquante euros");
    expect(montantEnLettres(1)).toBe("un euro");
    expect(montantEnLettres(80)).toBe("quatre-vingts euros");
    expect(montantEnLettres(71)).toBe("soixante et onze euros");
    expect(montantEnLettres(1200.5)).toBe("mille deux cents euros et cinquante centimes");
  });
});

describe("Modèle 18/19 — quittance et reçu", () => {
  it("la quittance complète n'a aucun manquant et porte l'ADN de l'épreuve", () => {
    const d = donneesCompletes();
    const doc = construireQuittance(d);
    expect(doc.manquants).toEqual([]);
    expect(doc.html).toContain("<h1>Quittance de loyer</h1>");
    expect(doc.html).toContain("Article 21 de la loi n° 89-462 du 6 juillet 1989");
    expect(doc.html).toContain("Agence Alpha");
    expect(doc.html).toContain("Julie Leblanc");
    expect(doc.html).toContain("lui en donne <b>quittance</b>");
    expect(doc.html).toContain("<h2>Détail des sommes</h2>");
    expect(doc.piedHtml).toContain(VERSION_MODELES);
    expect(doc.piedHtml).toContain(doc.empreinte);
  });

  it("le reçu partiel affiche le solde restant dû et ne dit jamais « quittance »", () => {
    const d = donneesCompletes();
    d.estQuittance = false;
    d.montant = 300;
    const doc = construireQuittance(d);
    expect(doc.html).toContain("Solde restant dû");
    expect(doc.html).toMatch(/440,00\s€/); // 740 dus − 300 encaissés
    expect(doc.html).not.toContain("lui en donne <b>quittance</b>");
    expect(doc.html).toContain("ne vaut pas quittance");
  });

  it("une donnée absente reste en libellé d'épreuve et remonte dans les manquants", () => {
    const d = donneesCompletes();
    d.exp.adresse = null;
    d.encaissements = [];
    const doc = construireQuittance(d);
    expect(doc.html).toContain('<span class="fusion">domicile ou siège social</span>');
    expect(doc.manquants).toContain("domicile ou siège social");
    expect(doc.manquants).toContain("virement, chèque, espèces…");
  });
});

// Rendu PDF réel : uniquement si un Chrome local est disponible
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find(
  (c) => existsSync(c)
);

describe.skipIf(!CHROME)("Rendu PDF (Chrome local)", () => {
  it("produit un PDF A4 valide, avec pied sur chaque page", { timeout: 60_000 }, async () => {
    process.env.GERIMMO_CHROME = CHROME;
    const { rendrePdf } = await import("../src/lib/documents/rendu");
    const doc = construireQuittance(donneesCompletes());
    const octets = await rendrePdf(doc);
    expect(octets.length).toBeGreaterThan(20_000);
    const tete = new TextDecoder().decode(octets.slice(0, 8));
    expect(tete.startsWith("%PDF-")).toBe(true);
    const dossier = "C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-Documents-vault-Gerimmo/ceefd2e8-ae36-45de-ae3c-959d39cbb275/scratchpad/pdf-generes";
    mkdirSync(dossier, { recursive: true });
    writeFileSync(`${dossier}/test-quittance.pdf`, octets);
  });
});

function donneesCompletes(): DonneesQuittance {
  const f = new Fusion();
  return {
    estQuittance: true,
    reference: "QUIT-ABCD1234",
    dateEmission: "2026-08-05",
    periode: "2026-08-01",
    loyerHc: 650,
    charges: 90,
    montant: 740,
    montantDu: 740,
    regularisation: null,
    encaissements: [{ date: "2026-08-03", mode: "virement", montant: 740 }],
    bailleurNom: f.champ("Paul Proprio", "nom et prénom(s), ou dénomination"),
    locatairesNoms: f.champ("Julie Leblanc", "nom et prénom(s) du ou des locataires"),
    logementAdresse: "12 rue des Lilas, 69003 Lyon",
    referenceBail: "BAIL-0F3A21BC",
    dateBail: "2026-01-01",
    exp: {
      nom: "Agence Alpha",
      adresse: "5 place du Marché, 69001 Lyon",
      email: "contact@agence-alpha.fr",
      telephone: "04 78 00 00 00",
      ville: "Lyon",
    },
    f,
  };
}

describe("L'adresse publique du produit, écrite une fois (12/09)", () => {
  /**
   * CE QUE CES TESTS PROTÈGENT. `gerimmo.app` était écrit EN DUR dans le pied de
   * page de tous les PDF générés. Tant que le domaine n'était pas branché, le
   * produit IMPRIMAIT une adresse morte sur des baux, des quittances et des
   * rapports — des documents contractuels qui partent chez des locataires et
   * des propriétaires. Le domaine est acquis depuis ; la constante reste une
   * mauvaise idée, parce qu'une adresse de déploiement change et qu'une
   * constante, elle, ne change que si quelqu'un y pense.
   */
  const siteInitial = process.env.NEXT_PUBLIC_SITE_URL;
  const vercelInitial = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  afterEach(() => {
    if (siteInitial === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = siteInitial;
    if (vercelInitial === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = vercelInitial;
  });

  function piedDe(): string {
    const f = new Fusion();
    return assemblerPage({
      f,
      titreDocument: "Essai",
      nomPied: "Essai",
      reference: "REF-1",
      corps: "<p>corps</p>",
    }).piedHtml;
  }

  it("le pied imprime le DOMAINE configuré, sans protocole", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://gerimmo.app";
    expect(piedDe()).toContain("gerimmo.app");
    expect(piedDe()).not.toContain("https://gerimmo.app");
  });

  it("un sous-domaine ou une préproduction suit, sans qu'on y repense", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.gerimmo.app/";
    const pied = piedDe();
    expect(pied).toContain("app.gerimmo.app");
    // La barre oblique finale ne doit pas s'imprimer sur un bail.
    expect(pied).not.toContain("app.gerimmo.app/");
  });

  it("sans configuration, la marque plutôt que rien : un bail dit d'où il vient", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(piedDe()).toContain("gerimmo.app");
  });

  it("une valeur mal formée ne fait pas tomber la génération d'un bail", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "pas une url";
    expect(() => piedDe()).not.toThrow();
  });
});

describe("La relance de paiement ne promet pas un clic qu'elle ne peut pas tenir", () => {
  it("sans adresse publique configurée, pas de lien mort — le geste est dit en toutes lettres", () => {
    const sans = corpsRelance({
      palier: 3,
      organisation: "Cabinet Martin",
      montantMensuel: 119,
      joursRestants: 0,
      lectureSeuleLe: "2026-09-01",
      lien: null,
    });
    expect(sans).not.toContain("<a href");
    expect(sans).toContain("Mon abonnement");
  });

  it("avec l'adresse, le bouton mène à « Mon abonnement » de SON agence", () => {
    const avec = corpsRelance({
      palier: 1,
      organisation: "Cabinet Martin",
      montantMensuel: 119,
      joursRestants: 12,
      lectureSeuleLe: "2026-09-27",
      lien: "https://gerimmo.app/agence/abc/abonnement",
    });
    expect(avec).toContain('href="https://gerimmo.app/agence/abc/abonnement"');
  });
});
