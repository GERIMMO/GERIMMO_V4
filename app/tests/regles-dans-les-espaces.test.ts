/**
 * « Les règles à connaître » se lit dans l'espace (20/11/2026).
 *
 * Constat du dirigeant, le jour de la mise en ligne de la refonte : la rubrique du menu ouvrait `/veille`, une page
 * servie hors de l'espace — plus de menu, un seul lien de retour. Seul l'artisan avait ses règles dans sa coquille
 * (`/artisan/regles`, 25/09). L'agence, le propriétaire et le locataire ont maintenant la même page dans la leur.
 *
 * Ces tests tiennent : les menus, la lecture (la même que `/veille`, aucune autre), les onglets (décision D33),
 * la pagination et les gardes d'accès des deux nouvelles pages.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  lienRegles,
  lireRegles,
  parametresRegles,
  ReglesAConnaitre,
  REGLES_PAR_PAGE,
  type RegleAConnaitre,
} from "../src/components/regles-a-connaitre";
import { navigationEspace } from "../src/lib/navigation-espace";

const ORG = "3c1d2f4a-0000-4000-8000-000000000001";
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const sansCommentaires = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const regle = (n: number, publics: string[] = ["bailleur"]): RegleAConnaitre => ({
  id: `regle-${n}`,
  titre: `Règle fictive ${n}`,
  resume: "Résumé fictif.",
  action_conseillee: "Action fictive.",
  publics,
  source_nom: "Service Public",
  source_url: "https://www.service-public.gouv.fr/particuliers/actualites/A00000",
  application_le: "2027-01-01",
  valide_le: "2026-11-01T10:00:00Z",
});

const rendre = (props: Partial<Parameters<typeof ReglesAConnaitre>[0]> = {}) =>
  renderToStaticMarkup(
    ReglesAConnaitre({
      adresse: `/agence/${ORG}/regles`,
      accueil: `/agence/${ORG}`,
      libelleAccueil: "Revenir au tableau de bord",
      publicChoisi: "agence",
      page: 1,
      lignes: [regle(1)],
      total: 1,
      echec: false,
      ...props,
    }),
  );

describe("les menus ouvrent la rubrique dans l'espace", () => {
  it.each(["admin_agence", "agent"] as const)("%s : l'entrée pointe vers /agence/<id>/regles", (role) => {
    const nav = navigationEspace({ orgId: ORG, role, badges: {} });
    const entree = [...nav.principales, ...nav.secondaires].find((e) => e.libelle === "Les règles à connaître");
    expect(entree?.href).toBe(`/agence/${ORG}/regles`);
  });

  // Audit palier 1 du 22/11/2026 (P1-19) : le bailleur avait la page, mais aucun lien dans son espace. Son menu ne
  // change pas (navigation-espace.test.ts) : le lien vit dans son aide.
  it("le propriétaire atteint ses règles depuis l'aide de son espace, sans entrée de menu en plus", () => {
    const nav = navigationEspace({ orgId: ORG, role: "proprietaire_direct", badges: {} });
    expect([...nav.principales, ...nav.secondaires].map((e) => e.libelle)).not.toContain("Les règles à connaître");
    const aide = sansCommentaires(lire("src/app/agence/[orgId]/faq/aide-proprietaire.tsx"));
    expect(aide).toContain("<Link href={`${base}/regles`}>");
    expect(aide).toContain("Les règles à connaître</Link>");
    expect(aide).toContain("const base = useBaseEspace(orgId);");
  });

  it("le menu du locataire pointe vers /locataire/<id>/regles", () => {
    const source = sansCommentaires(lire("src/components/nav-locataire.tsx"));
    expect(source).toContain('{ href: `${base}/regles`, libelle: "Les règles à connaître", icone: "doc" }');
  });

  it("plus aucun menu d'espace ne sort vers /veille", () => {
    for (const fichier of ["src/lib/navigation-espace.ts", "src/components/nav-locataire.tsx", "src/components/nav-artisan.tsx"]) {
      expect(sansCommentaires(lire(fichier)), fichier).not.toContain("/veille");
    }
  });
});

describe("les deux pages restent derrière la garde de leur espace et ne lisent rien de nouveau", () => {
  it("l'agence et le propriétaire passent par verifierAccesEspace ; le propriétaire lit sous /espace", () => {
    const source = lire("src/app/agence/[orgId]/regles/page.tsx");
    expect(source).toContain("await verifierAccesEspace(orgId)");
    expect(source).toContain("baseEspace(orgId, estProprietaire)");
    expect(source).toContain('estProprietaire ? "bailleur" : "agence"');
  });

  it("le locataire passe par verifierAccesEspaceLocataire", () => {
    const source = lire("src/app/locataire/[orgId]/regles/page.tsx");
    expect(source).toContain("await verifierAccesEspaceLocataire(orgId)");
    expect(source).toContain('parametresRegles(await searchParams, "locataire")');
  });

  it("une seule table est lue, celle des informations publiées, et rien n'est écrit", () => {
    for (const fichier of ["src/components/regles-a-connaitre.tsx", "src/app/agence/[orgId]/regles/page.tsx", "src/app/locataire/[orgId]/regles/page.tsx"]) {
      const source = sansCommentaires(lire(fichier));
      expect(source.match(/\.from\("([^"]+)"\)/g) ?? [], fichier).toEqual(fichier.endsWith("regles-a-connaitre.tsx") ? ['.from("regulatory_watch_published")'] : []);
      expect(source, fichier).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(source, fichier).not.toContain("use server");
    }
  });

  it("la lecture est celle de /veille : filtre par public, plus récentes d'abord, vingt par page", async () => {
    const appels: [string, unknown[]][] = [];
    const requete: Record<string, unknown> = {};
    for (const methode of ["select", "order", "range", "contains"]) {
      requete[methode] = (...args: unknown[]) => {
        appels.push([methode, args]);
        return requete;
      };
    }
    requete.then = (suite: (r: unknown) => unknown) => Promise.resolve({ data: [regle(1)], error: null, count: 41 }).then(suite);
    const supabase = { from: (table: string) => (appels.push(["from", [table]]), requete) };
    const resultat = await lireRegles(supabase as never, "locataire", 2);
    expect(resultat).toEqual({ lignes: [regle(1)], total: 41, echec: false });
    expect(appels).toContainEqual(["from", ["regulatory_watch_published"]]);
    expect(appels).toContainEqual(["contains", ["publics", ["locataire"]]]);
    expect(appels).toContainEqual(["range", [REGLES_PAR_PAGE, 2 * REGLES_PAR_PAGE - 1]]);
    expect(appels.filter(([m]) => m === "order")).toEqual([["order", ["valide_le", { ascending: false }]], ["order", ["id"]]]);

    appels.length = 0;
    await lireRegles(supabase as never, null, 1);
    expect(appels.some(([m]) => m === "contains")).toBe(false);
  });
});

describe("l'adresse : le public du profil par défaut, « tous » pour lever le filtre", () => {
  it("sans paramètre, la page ouvre sur le public du profil", () => {
    expect(parametresRegles({}, "agence")).toEqual({ publicChoisi: "agence", page: 1 });
    expect(parametresRegles({}, "locataire")).toEqual({ publicChoisi: "locataire", page: 1 });
  });

  it("« tous » lève le filtre ; une valeur inconnue aussi, sans erreur", () => {
    expect(parametresRegles({ public: "tous" }, "agence").publicChoisi).toBeNull();
    expect(parametresRegles({ public: "n-importe-quoi" }, "agence").publicChoisi).toBeNull();
    expect(parametresRegles({ public: ["bailleur", "locataire"] }, "agence").publicChoisi).toBe("agence");
  });

  it("un onglet choisi est respecté ; « artisan » n'est pas servi ici", () => {
    expect(parametresRegles({ public: "bailleur" }, "locataire").publicChoisi).toBe("bailleur");
    expect(parametresRegles({ public: "artisan" }, "locataire").publicChoisi).toBeNull();
  });

  it("la page est bornée entre 1 et 1000", () => {
    expect(parametresRegles({ page: "0" }, "agence").page).toBe(1);
    expect(parametresRegles({ page: "-4" }, "agence").page).toBe(1);
    expect(parametresRegles({ page: "abc" }, "agence").page).toBe(1);
    expect(parametresRegles({ page: "7" }, "agence").page).toBe(7);
    expect(parametresRegles({ page: "999999" }, "agence").page).toBe(1000);
  });

  it("les liens restent sous la page de l'espace", () => {
    expect(lienRegles(`/agence/${ORG}/regles`, null)).toBe(`/agence/${ORG}/regles?public=tous`);
    expect(lienRegles(`/locataire/${ORG}/regles`, "bailleur")).toBe(`/locataire/${ORG}/regles?public=bailleur`);
    expect(lienRegles(`/espace/${ORG}/regles`, "bailleur", 3)).toBe(`/espace/${ORG}/regles?public=bailleur&page=3`);
  });
});

describe("l'écran : les mêmes onglets et les mêmes textes que /veille, sans sortir de l'espace", () => {
  it("un seul titre d'écran, et aucun lien vers /veille ni vers une page hors de l'espace", () => {
    const html = rendre();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Les règles à connaître");
    expect(html).not.toContain("/veille");
    const liensInternes = [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(liensInternes.length).toBeGreaterThan(0);
    for (const lien of liensInternes) expect(lien.startsWith(`/agence/${ORG}`), lien).toBe(true);
  });

  it("décision D33 : « Tout voir », bailleurs, locataires ; ni onglet « Agences », ni onglet « Artisans »", () => {
    const html = rendre();
    const debut = html.indexOf('aria-label="Informations par public"');
    const onglets = html.slice(debut, html.indexOf("</nav>", debut));
    expect(onglets).toContain("Tout voir");
    expect(onglets).toContain("Propriétaires bailleurs");
    expect(onglets).toContain("Locataires");
    expect(onglets).not.toContain("Agences");
    expect(onglets).not.toContain("Artisans");
    expect(onglets).not.toContain("public=agence");
  });

  it("l'onglet actif est annoncé ; pour une agence, aucun onglet n'est actif, comme sur /veille", () => {
    expect(rendre({ publicChoisi: "agence" })).not.toContain('aria-current="page"');
    expect(rendre({ publicChoisi: "bailleur" })).toMatch(/aria-current="page"[^>]*>Propriétaires bailleurs/);
    expect(rendre({ publicChoisi: null })).toMatch(/aria-current="page"[^>]*>Tout voir/);
  });

  it("la source officielle s'ouvre dans un nouvel onglet ; une adresse hors des sources admises n'est pas un lien", () => {
    expect(rendre()).toContain('href="https://www.service-public.gouv.fr/particuliers/actualites/A00000" target="_blank" rel="noreferrer"');
    const html = rendre({ lignes: [{ ...regle(1), source_url: "https://exemple.invalid/piege" }] });
    expect(html).not.toContain("exemple.invalid");
  });

  it("l'état vide nomme le public et ramène à l'accueil de l'espace", () => {
    const html = rendre({ lignes: [], total: 0, publicChoisi: "locataire", adresse: `/locataire/${ORG}/regles`, accueil: `/locataire/${ORG}`, libelleAccueil: "Revenir à l’accueil" });
    expect(html).toContain("Aucune nouvelle règle pour locataires pour l’instant.");
    expect(html).toContain(`href="/locataire/${ORG}"`);
    expect(html).toContain("Revenir à l’accueil");
  });

  it("une panne de lecture s'annonce, sans liste ni pagination", () => {
    const html = rendre({ lignes: [], total: 0, echec: true });
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Pagination"');
    expect(html).not.toContain("Aucune nouvelle règle");
  });

  it("la pagination garde le public choisi", () => {
    const html = rendre({ lignes: Array.from({ length: REGLES_PAR_PAGE }, (_, i) => regle(i)), total: 45, page: 2, publicChoisi: "bailleur" });
    expect(html).toContain("Page 2 sur 3");
    expect(html).toContain(`href="/agence/${ORG}/regles?public=bailleur"`);
    expect(html).toContain(`href="/agence/${ORG}/regles?public=bailleur&amp;page=3"`);
    expect(rendre({ total: 5 })).not.toContain('aria-label="Pagination"');
  });
});
