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
    // L'archive documentaire et l'export du référentiel n'existent pas : ils
    // doivent rester marqués « à fournir », jamais promis à l'indicatif.
    const promesse = article.slice(article.indexOf("Engagements supplémentaires"));
    expect(promesse).toContain("AFournir");
    expect(promesse).toContain("ne sont pas encore écrites");
  });

  it("la route d'export citée par l'article 9 existe vraiment", () => {
    const route = path.join(SRC, "app/agence/[orgId]/comptabilite/export/route.ts");
    expect(fs.existsSync(route)).toBe(true);
  });
});
