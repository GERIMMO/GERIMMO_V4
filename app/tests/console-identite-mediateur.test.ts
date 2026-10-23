/**
 * Relecture du 23/10 (pages légales et console) : la console dit au dirigeant l'état réel de l'identité de l'éditeur
 * et du blocage des abonnements, depuis que le médiateur ne bloque plus rien (décision du 23/10).
 *  — /admin/sante : une lecture de l'identité en échec n'affiche plus le médiateur « fourni » ;
 *  — /admin/sante : « le paiement en ligne reste fermé » seulement si la règle de blocage est active ;
 *  — /admin/parametres : « L'identité est complète » ne s'affiche plus quand le médiateur manque.
 * Aucune donnée réelle : des valeurs fictives.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  identite: { editeur: {} as Record<string, string | null>, indisponible: false },
  reglage: { blocageIdentiteActif: true, revision: 1 as number | null, indisponible: false },
}));
vi.mock("@/lib/editeur-serveur", () => ({ lireEditeur: async () => etat.identite }));
vi.mock("@/lib/reglage-souscription-serveur", () => ({ lireReglageSouscription: async () => etat.reglage }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: null, error: null }),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "like", "in", "is", "gte", "order", "limit", "eq"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: { valeurs: {}, revision: 1 }, error: null });
      q.single = () => Promise.resolve({ data: null, error: null });
      q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return q;
    },
  }),
}));
vi.mock("@/app/admin/sante/lancer-mission", () => ({ LancerMission: () => null }));
vi.mock("@/app/admin/parametres/identite", () => ({ IdentiteEditeur: () => null }));
vi.mock("@/app/actions/reglage-souscription", () => ({ reglerBlocageSouscription: async () => ({}) }));
import PageSante from "../src/app/admin/sante/page";
import PageParametres from "../src/app/admin/parametres/page";
import { BlocageSouscription } from "../src/app/admin/parametres/blocage-souscription";

const REQUIS = {
  denomination: "Personne fictive", forme: "Entrepreneur individuel (EI)", siege: "1 rue Exemple, Paris",
  rcs: "RNE — 000 000 000", siret: "00000000000000", directeurPublication: "Personne fictive",
  email: "contact@example.test", telephone: "01 00 00 00 00",
};
const MEDIATEUR = { mediateurNom: "Médiateur fictif", mediateurAdresse: "2 rue Exemple, Paris", mediateurSite: "https://example.test/m" };
const TOUT_NUL = Object.fromEntries([...Object.keys(REQUIS), ...Object.keys(MEDIATEUR)].map((k) => [k, null]));

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'");
/** La puce d'une ligne de la liste des faits de /admin/sante. */
const puceSante = (html: string, fait: string) =>
  new RegExp(`<span>${fait}</span><span class="puce [^"]*">([^<]*)</span>`).exec(html)?.[1];

beforeEach(() => {
  etat.identite = { editeur: { ...REQUIS }, indisponible: false };
  etat.reglage = { blocageIdentiteActif: true, revision: 1, indisponible: false };
});

describe("/admin/sante : documents légaux", () => {
  it("lecture de l'identité en échec : le médiateur n'est pas affiché « fourni »", async () => {
    // lireEditeur rend l'identité du code, tout à null, et `indisponible` vrai.
    etat.identite = { editeur: { ...TOUT_NUL }, indisponible: true };
    const html = renderToStaticMarkup(await PageSante());
    for (const fait of ["Le médiateur de la consommation", "L'adresse du médiateur", "Le site du médiateur"]) {
      const puce = puceSante(html, fait.replace("'", "&#x27;"));
      expect(puce, fait).toBeDefined();
      expect(puce, fait).not.toBe("fourni");
    }
    expect(texte(html)).toContain("L’identité de l’éditeur n’a pas pu être lue : chaque fait est compté comme non fourni.");
  });

  it("lecture réussie, médiateur fourni : il s'affiche « fourni »", async () => {
    etat.identite = { editeur: { ...REQUIS, ...MEDIATEUR, telephone: null }, indisponible: false };
    const html = renderToStaticMarkup(await PageSante());
    expect(puceSante(html, "Le médiateur de la consommation")).toBe("fourni");
    expect(puceSante(html, "Le téléphone de contact")).toBe("manquant");
    expect(texte(html)).not.toContain("n’a pas pu être lue");
  });

  it("règle de blocage active et fait requis manquant : le paiement en ligne reste fermé", async () => {
    etat.identite = { editeur: { ...REQUIS, telephone: null }, indisponible: false };
    const t = texte(renderToStaticMarkup(await PageSante()));
    expect(t).toContain("le paiement en ligne reste fermé");
    expect(t).not.toContain("Le blocage des abonnements est levé");
  });

  it("règle de blocage levée et fait requis manquant : la page ne dit plus le paiement fermé", async () => {
    etat.identite = { editeur: { ...REQUIS, telephone: null }, indisponible: false };
    etat.reglage = { blocageIdentiteActif: false, revision: 2, indisponible: false };
    const t = texte(renderToStaticMarkup(await PageSante()));
    expect(t).not.toContain("le paiement en ligne reste fermé");
    // Exact : la règle levée ne ferme plus rien, mais d'autres gardes (Stripe, TVA) peuvent encore fermer le paiement.
    expect(t).toContain(
      "Le blocage des abonnements est levé dans les paramètres : ces manques ne ferment plus le paiement en ligne.",
    );
  });
});

describe("/admin/parametres : carte « Blocage des abonnements »", () => {
  it("identité requise complète, médiateur absent : ne dit pas l'identité complète", async () => {
    const t = texte(renderToStaticMarkup(await PageParametres()));
    expect(t).not.toContain("L’identité est complète");
    expect(t).toContain("L’identité requise est complète ; le médiateur reste à compléter et ne bloque rien.");
    expect(t).toContain("8 / 11 fournis");
  });

  it("identité requise et médiateur complets : l'identité est complète", async () => {
    etat.identite = { editeur: { ...REQUIS, ...MEDIATEUR }, indisponible: false };
    const t = texte(renderToStaticMarkup(await PageParametres()));
    expect(t).toContain("L’identité est complète : cette règle ne bloque actuellement aucune souscription.");
    expect(t).not.toContain("le médiateur reste à compléter");
  });

  it("un fait requis manque : la liste des faits requis, sans parler d'identité complète", () => {
    const t = texte(renderToStaticMarkup(createElement(BlocageSouscription, {
      actif: true, revision: 1, manquants: ["le téléphone de contact"], aCompleter: ["le médiateur de la consommation"],
    })));
    expect(t).toContain("À compléter : le téléphone de contact. Lever ce blocage ne complète pas les mentions légales.");
    expect(t).not.toContain("identité requise est complète");
    expect(t).not.toContain("L’identité est complète");
  });
});
