/**
 * Les documents légaux — le contrat qu'on fait accepter (11/09).
 *
 * Jusqu'à cette date, la case d'inscription faisait cocher « j'accepte les
 * conditions d'utilisation », l'action serveur refusait l'inscription sans
 * elle, et le document n'existait nulle part : on faisait signer un contrat
 * introuvable. Le site, marchand et français, ne publiait par ailleurs aucune
 * mention légale — manquement pénalement sanctionné (art. 6-III de la LCEN).
 *
 * Ces tests gardent les trois propriétés qui rendent la correction durable :
 * le lien depuis la case, l'ouverture au public des routes, et le fait qu'un
 * fait d'éditeur manquant se voie au lieu de se taire.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CONDITIONS_VERSION, documentsIncomplets, faitsManquants } from "../src/lib/editeur";

const SRC = path.resolve(__dirname, "..", "src");
const lire = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

describe("identité de l'éditeur", () => {
  it("dit ce qu'il lui manque, en français", () => {
    const manquants = faitsManquants();
    // Aucune assertion sur la LONGUEUR : le jour où l'éditeur est renseigné,
    // la liste se vide et ce test doit continuer à passer.
    for (const m of manquants) {
      // Une phrase lisible, pas un nom de champ : ces libellés s'affichent
      // tels quels au visiteur. « le SIRET » est une phrase ; « siret » non.
      expect(m).toMatch(/^(le |la |l'|les )/);
      expect(m).toContain(" ");
    }
  });

  it("un éditeur complet ne manque de rien, et fait disparaître l'encadré", () => {
    const complet = {
      denomination: "Gerimmo SAS",
      forme: "société par actions simplifiée",
      capital: "10 000 €",
      siege: "1 rue de la Paix, 75002 Paris",
      rcs: "Paris 000 000 000",
      siret: "00000000000000",
      tvaIntracommunautaire: null,
      directeurPublication: "Une personne",
      email: "contact@exemple.fr",
      telephone: null,
      mediateurNom: "Un médiateur",
      mediateurAdresse: null,
      mediateurSite: null,
    };
    expect(faitsManquants(complet)).toEqual([]);
    expect(documentsIncomplets(complet)).toBe(false);
  });

  it("un seul fait retiré suffit à rouvrir l'encadré", () => {
    const presque = {
      denomination: "Gerimmo SAS",
      forme: "SAS",
      capital: null,
      siege: "1 rue de la Paix, 75002 Paris",
      rcs: "Paris 000 000 000",
      siret: "00000000000000",
      tvaIntracommunautaire: null,
      directeurPublication: "Une personne",
      email: "contact@exemple.fr",
      telephone: null,
      mediateurNom: null, // ← obligatoire dès qu'un client est un particulier
      mediateurAdresse: null,
      mediateurSite: null,
    };
    expect(documentsIncomplets(presque)).toBe(true);
    expect(faitsManquants(presque)).toEqual(["le médiateur de la consommation"]);
  });

  it("la version des conditions est datée et comparable", () => {
    // Elle voyage dans les métadonnées du compte à l'inscription : elle doit
    // rester triable pour savoir quelle version un compte a acceptée.
    expect(CONDITIONS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("le contrat est lisible avant d'être accepté", () => {
  it("la case d'inscription renvoie vers les conditions", () => {
    const src = lire("app/inscription/formulaire-inscription.tsx");
    // Le lien vit DANS le libellé de la case : c'est là qu'on lit ce qu'on
    // accepte, pas dans un pied de page.
    const label = src.slice(src.indexOf('name="cgu"'), src.indexOf('name="cgu"') + 1400);
    expect(label).toContain('href="/conditions"');
  });

  it("les trois pages légales sont ouvertes au public", () => {
    const proxy = fs.readFileSync(path.join(SRC, "proxy.ts"), "utf8");
    const liste = proxy.slice(proxy.indexOf("PUBLIC_PATHS"), proxy.indexOf("REDIRECT_SI_CONNECTE"));
    for (const route of ["/conditions", "/mentions-legales", "/confidentialite"]) {
      expect(liste).toContain(`"${route}"`);
    }
  });

  it("l'inscription enregistre QUELLE version a été acceptée", () => {
    // Sans cela, l'éditeur ne peut pas prouver le contenu du contrat le jour
    // de sa formation — alors que l'article 16 se réserve de le modifier.
    const auth = lire("app/actions/auth.ts");
    expect(auth).toContain("cgu_version: CONDITIONS_VERSION");
    expect(auth).toContain("cgu_acceptee_le");
  });
});

describe("les pages légales ne promettent que ce qui existe", () => {
  it("l'article de réversibilité n'affirme pas les exports absents", () => {
    const cgu = lire("app/conditions/page.tsx");
    const article = cgu.slice(cgu.indexOf('titre="9. Réversibilité"'), cgu.indexOf('titre="10.'));
    // Le journal s'exporte (route /comptabilite/export) : l'article peut le dire.
    expect(article).toContain("journal de gestion");
    // Les autres exports et l'accès après suspension n'existent pas : aucun
    // engagement contractuel ne doit les présenter comme disponibles.
    expect(article).not.toContain("archive documentaire indexée");
    expect(article).not.toContain("export du référentiel");
    expect(article).not.toContain("accès en lecture seule après suspension");
  });

  it("la route d'export citée par l'article 9 existe vraiment", () => {
    const route = path.join(SRC, "app/agence/[orgId]/comptabilite/export/route.ts");
    expect(fs.existsSync(route)).toBe(true);
  });
});

// Relevé du 29/09 : des conditions d'utilisation qui portaient aussi la vente,
// des prix « TTC » et « HT » sous un régime de franchise, une résiliation
// « sans préavis » contredite par l'article 8.6, une conservation « à venir »
// alors que l'accueil promettait que rien n'est supprimé.
describe("conditions générales d'utilisation et de vente (29/09)", () => {
  const cgu = lire("app/conditions/page.tsx");

  it("portent leur vrai nom, partout où on les nomme", () => {
    expect(cgu).toContain('titre="Conditions générales d\'utilisation et de vente"');
    expect(lire("app/inscription/formulaire-inscription.tsx")).toContain("conditions générales d&apos;utilisation et de vente");
    expect(lire("components/chrome-public.tsx")).toContain('["/conditions", "Conditions générales"]');
  });

  it("disent la même chose de la résiliation aux articles 8.6 et 15", () => {
    expect(cgu).not.toContain("sans\n          frais ni préavis");
    expect(cgu).not.toMatch(/sans\s+frais\s+ni\s+préavis/);
    const art15 = cgu.slice(cgu.indexOf('titre="15.'), cgu.indexOf('titre="16.'));
    expect(art15).toContain("prochaine échéance");
  });

  it("prévoient l'information avant reconduction de l'annuel (art. L. 215-1)", () => {
    expect(cgu).toContain("L. 215-1");
    expect(cgu).toMatch(/au plus tôt trois mois et au plus tard\s+un mois avant le terme/);
  });

  it("n'annoncent pas de prix TTC ou HT sous la franchise en base", () => {
    expect(cgu).toContain('{FRANCHISE ? "" : ", prix toutes taxes comprises"}');
    expect(cgu).toContain('{FRANCHISE ? "" : " hors taxes"}');
  });

  it("arrêtent conservation, disponibilité, plafond et mise en demeure", () => {
    for (const cle of ["conservation", "disponibilite", "plafond", "delaiMiseEnDemeure"]) {
      expect(cgu).not.toMatch(new RegExp(`\\n  ${cle}: null,`));
    }
    expect(cgu).toContain("jamais supprimées automatiquement");
    expect(cgu).toContain("dix ans");
    expect(cgu).toContain("douze mois précédant le fait générateur");
    expect(cgu).toContain('delaiMiseEnDemeure: "trente jours"');
    // La réversibilité ne promet plus une suppression au terme d'un délai.
    const art9 = cgu.slice(cgu.indexOf('titre="9. Réversibilité"'), cgu.indexOf('titre="10.'));
    expect(art9).not.toContain("supprimées ou anonymisées");
  });

  it("portent l'annexe « article 28 » avec ses clauses obligatoires", () => {
    const annexe = cgu.slice(cgu.indexOf("Annexe — Traitement de données pour le compte du Client"));
    for (const clause of [
      "Instructions documentées",
      "Confidentialité",
      "Sécurité",
      "Sous-traitants ultérieurs",
      "Droits des personnes",
      "analyse d&apos;impact",
      "Violation de données",
      "Fin du contrat",
      "Information et audit",
    ]) {
      expect(annexe).toContain(clause);
    }
    // Les sous-traitants sont ceux des autres pages légales, pas une liste recopiée.
    expect(annexe).toContain("<TableauPrestataires />");
  });

  it("« rien n'est supprimé automatiquement » se dit de la même façon partout", () => {
    for (const fichier of ["app/page.tsx", "app/tarifs/page.tsx"]) {
      const texte = lire(fichier).replace(/&apos;/g, "'");
      expect(texte).toMatch(/rien n'est supprimé automatiquement du fait de l'arrêt/i);
      expect(texte).toContain("tant que le compte existe");
    }
  });
});

describe("confidentialité (29/09)", () => {
  const page = lire("app/confidentialite/page.tsx");

  it("donne la base légale de chaque traitement", () => {
    for (const base of ["Exécution du contrat", "obligation légale", "Intérêt légitime", "consentement"]) {
      expect(page).toContain(base);
    }
  });

  it("dit comment les transferts hors UE sont encadrés, sans certifier personne", () => {
    expect(page).toContain("clauses contractuelles types de la");
    expect(page).toContain("Data Privacy Framework UE–États-Unis, selon le prestataire");
    expect(page).toContain("GitHub Actions");
    expect(page).not.toMatch(/hébergées <b className="font-semibold">dans\s+l&apos;Union/);
  });

  it("conserve les factures dix ans et la preuve d'acceptation le temps du contrat plus cinq ans", () => {
    expect(page).toContain("10 ans (obligation légale)");
    expect(page).toContain("Durée du contrat, puis 5 ans");
  });

  it("n'envoie plus exercer ses droits par le formulaire de devis", () => {
    const droits = page.slice(page.indexOf('titre="Vos droits"'));
    expect(droits).not.toContain("OuNousEcrire");
    expect(droits).toContain('href="/assistance"');
    // L'adresse de l'éditeur dès qu'elle est fournie ; sa réserve, sinon.
    expect(droits).toContain("adresse de contact de l'éditeur");
  });

  it("est annoncée au moment de l'inscription", () => {
    const formulaire = lire("app/inscription/formulaire-inscription.tsx");
    const avantBouton = formulaire.slice(0, formulaire.indexOf("<BoutonEnvoi"));
    expect(avantBouton).toContain('href="/confidentialite"');
  });
});
