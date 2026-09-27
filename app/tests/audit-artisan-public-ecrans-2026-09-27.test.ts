/**
 * Audit ARTISAN / PAGES PUBLIQUES / COMPTE du 27/09 — les corrections côté
 * application (les gardes de la base sont dans audit-artisan-2026-09-27).
 *
 * Un cas par constat corrigé ; les écrans serveur ne se rendent pas sous
 * vitest, leurs propriétés se vérifient donc sur le source, comme le fait
 * pages-legales.test.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ENTETES_SECURITE, politiqueDeSecurite } from "../next.config";
import { PRESTATAIRES } from "../src/lib/editeur";
import { classerErreurInscription, MESSAGE_BOITE_MAIL } from "../src/lib/inscription";
import { cheminFicheAlerte, gesteAlerte } from "../src/lib/chemin-alerte";
import { TYPES_EVENEMENT_INCIDENT } from "../src/lib/incidents";

const SRC = path.resolve(__dirname, "..", "src");
const lire = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

describe("inscription d'un artisan sans compte (bloquant n° 2)", () => {
  it("la page d'inscription artisan est publique dans le proxy, et elle seule du portail", () => {
    const proxy = lire("proxy.ts");
    const liste = proxy.slice(proxy.indexOf("const PUBLIC_PATHS"), proxy.indexOf("];"));
    expect(liste).toContain('"/artisan/inscription"');
    expect(liste).not.toMatch(/"\/artisan"\s*,/);
  });

  it("le gabarit du portail ne renvoie plus un visiteur vers /connexion, la page crée le compte", () => {
    expect(lire("app/artisan/layout.tsx")).not.toMatch(/redirect\(\s*["']\/connexion/);
    const page = lire("app/artisan/inscription/page.tsx");
    expect(page).toContain("FormulaireCompteArtisan");
    expect(page).not.toMatch(/if \(!user\) redirect/);
  });

  it("le compte créé est marqué artisan et revient à l'inscription, jamais à un espace propriétaire", () => {
    const auth = lire("app/actions/auth.ts");
    const creation = auth.slice(auth.indexOf("export async function creerCompteArtisan"));
    expect(creation).toMatch(/espace: "artisan"/);
    expect(creation).toContain("next=/artisan/inscription");
    expect(lire("app/espaces/page.tsx")).toMatch(
      /user_metadata\?\.espace === "artisan"[\s\S]{0,40}\)\s*\{\s*redirect\("\/artisan\/inscription"\)/
    );
  });
});

describe("énumération de comptes à l'inscription (majeur)", () => {
  it("une adresse déjà inscrite se classe à part, sans message qui le dise", () => {
    expect(classerErreurInscription({ code: "user_already_exists", message: "User already registered" }))
      .toEqual({ type: "adresse_deja_inscrite" });
    expect(classerErreurInscription({ message: "User already registered" }))
      .toEqual({ type: "adresse_deja_inscrite" });
    expect(classerErreurInscription({ code: "weak_password", message: "weak" }).type).toBe("mot_de_passe_faible");
    expect(MESSAGE_BOITE_MAIL).not.toMatch(/existe/i);
  });

  it("aucune action d'inscription ne dit plus « Un compte existe déjà »", () => {
    expect(lire("app/actions/auth.ts")).not.toContain("Un compte existe déjà pour cette adresse");
  });
});

describe("CSP et en-têtes (majeur, détail)", () => {
  const connect = politiqueDeSecurite()
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("connect-src"))!;

  it("l'autocomplétion d'adresse n'est plus bloquée : api-adresse.data.gouv.fr est dans connect-src", () => {
    expect(connect.split(/\s+/)).toContain("https://api-adresse.data.gouv.fr");
  });

  it("Cross-Origin-Opener-Policy est posé", () => {
    const parNom = Object.fromEntries(ENTETES_SECURITE.map((e) => [e.key, e.value]));
    expect(parNom["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });
});

describe("pages légales (mineurs)", () => {
  it("Scaleway, GitHub Actions et la Base Adresse Nationale sont déclarés, avec leur rôle", () => {
    const parNom = (debut: string) => PRESTATAIRES.find((p) => p.nom.startsWith(debut));
    expect(parNom("Scaleway")?.role).toMatch(/sauvegarde/i);
    expect(parNom("Scaleway")?.role).toMatch(/chiffr/i);
    expect(parNom("Scaleway")?.localisation).toMatch(/fr-par/);
    expect(parNom("GitHub")?.role).toMatch(/sauvegarde/i);
    expect(parNom("GitHub")?.localisation).toMatch(/hors UE/);
    expect(parNom("Base Adresse Nationale")?.role).toMatch(/adresse/i);
  });

  it("les mentions ne disent plus « hébergées dans l'UE » sans nuance au-dessus de prestataires américains", () => {
    const mentions = lire("app/mentions-legales/page.tsx");
    const hebergement = mentions.slice(mentions.indexOf('titre="Hébergement"'));
    expect(hebergement.slice(0, 1200)).toMatch(/hors de[\s\S]{0,20}l&apos;Union/);
  });

  it("le formulaire de la vitrine ne promet plus des données « jamais transmises »", () => {
    expect(lire("app/formulaire-devis-vitrine.tsx")).not.toContain("jamais transmises");
  });

  it("l'ancre #agences garde son titre hors du bandeau et défile à l'arrivée", () => {
    const accueil = lire("app/page.tsx");
    expect(accueil).toMatch(/id="agences" className="[^"]*scroll-mt-/);
    expect(accueil).toContain("<AncreAuChargement />");
  });
});

describe("portail artisan (mineurs et détails)", () => {
  it("« Les règles » et la page de panne allument l'onglet Mon entreprise", () => {
    const nav = lire("components/nav-artisan.tsx");
    expect(nav).toContain('"/artisan/regles"');
    expect(nav).toContain('"/artisan/panne"');
  });

  it("« Mes espaces » n'est affiché que s'il mène ailleurs", () => {
    expect(lire("app/artisan/layout.tsx")).toMatch(/\{autresEspaces && <Link\s+href="\/espaces"/);
  });

  it("les attestations ne se contredisent plus : seule la décennale conditionne l'affectation", () => {
    const entreprise = lire("app/artisan/entreprise/page.tsx");
    expect(entreprise).not.toContain("à déposer pour être proposé aux agences");
    expect(entreprise).toContain("travaux qui l'exigent");
  });

  it("/compte parle à l'artisan de sa situation et lui rend son portail", () => {
    const compte = lire("app/compte/page.tsx");
    expect(compte).toContain('href="/artisan"');
    expect(compte).toMatch(/estArtisan\s*\?/);
  });

  it("la case CGU de /inscription fait 24 px et sa ligne 44 px", () => {
    const form = lire("app/inscription/formulaire-inscription.tsx");
    expect(form).toMatch(/<label className="flex min-h-11[^"]*">\s*<input\s+type="checkbox"\s+name="cgu"/);
    expect(form).toMatch(/name="cgu"[\s\S]{0,80}className="size-6/);
  });

  it("/relais ne renvoie vers /securite que le compte qui a un second facteur à vérifier", () => {
    expect(lire("app/relais/page.tsx")).toMatch(/nextLevel==="aal2"&&niveau\?\.currentLevel!=="aal2"/);
  });

  it("le cycle artisan a ses écrans : dates du locataire et facture", () => {
    expect(lire("app/artisan/missions/[interventionId]/page.tsx")).toContain("<DatesLocataire");
    expect(fs.existsSync(path.join(SRC, "app/artisan/missions/[interventionId]/facture/page.tsx"))).toBe(true);
    expect(lire("app/artisan/facturation/page.tsx")).not.toContain("n&apos;est pas encore ouvert");
  });

  it("les nouvelles alertes ouvrent le dossier d'incident, les nouveaux événements ont un libellé", () => {
    for (const type of ["facture_artisan_a_valider", "creneaux_arbitrage"]) {
      expect(cheminFicheAlerte({ type, details: { incident_id: "inc" } }, "org")).toBe(
        "/agence/org/incidents?sel=inc"
      );
      expect(gesteAlerte({ type, details: { incident_id: "inc" } }, "org")?.libelle).not.toBe(
        "Ouvrir le dossier concerné"
      );
    }
    expect(TYPES_EVENEMENT_INCIDENT.creneaux_refuses).toBeTruthy();
    expect(TYPES_EVENEMENT_INCIDENT.facture_deposee).toBeTruthy();
  });
});
