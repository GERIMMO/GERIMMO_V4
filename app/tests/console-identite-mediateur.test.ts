import { rendreServeur } from "./fixtures/rendu-serveur";
/**
 * Relecture du 23/10 (pages légales et console) : la console dit au dirigeant l'état réel de l'identité de l'éditeur
 * et du blocage des abonnements, depuis que le médiateur ne bloque plus rien (décision du 23/10).
 *  — /admin/sante : une lecture de l'identité en échec n'affiche plus le médiateur « fourni » ;
 *  — /admin/sante : « le paiement en ligne reste fermé » seulement si la règle de blocage est active ;
 *  — /admin/parametres : « L'identité est complète » ne s'affiche plus quand le médiateur manque ; la carte nomme
 *    les faits à compléter au lieu d'un « médiateur » écrit en dur (seconde relecture du 23/10).
 * Lot D7 (décision du dirigeant du 24/11/2026, Q7 : « on peut ouvrir les ventes même sans » médiateur) : la carte
 * disait « Pour un particulier, les coordonnées du médiateur restent requises avant une première commande » — ce
 * n'est plus vrai, et les attentes ci-dessous sont mises à jour ; règle levée, la première souscription d'un
 * particulier reste fermée sans vendeur, ce que /admin/sante dit désormais.
 * Reprise du lot D7 (24/11/2026, décision de pilotage) : PAR DÉFAUT, sans médiateur, la première souscription d'un
 * particulier reste fermée ; lever le blocage l'ouvre, en connaissance de cause. Les attentes « le médiateur ne bloque
 * rien », « sans rien bloquer » et « à compléter, non bloquant » affirmaient la règle du premier commit D7 : elles sont
 * réécrites. La carte cite les articles L. 612-1 et L. 616-1 du recueil, mot pour mot, et dit que la décision
 * appartient au dirigeant.
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
vi.mock("@/app/actions/reglage-souscription", () => ({ reglerOuvertureVentes: async () => ({}), reglerBlocageSouscription: async () => ({}) }));
import PageSante from "../src/app/admin/sante/page";
import PageParametres from "../src/app/admin/parametres/page";
import { BlocageSouscription } from "../src/app/admin/parametres/blocage-souscription";

const REQUIS = {
  // Reprise D7 : le nom d'un entrepreneur individuel porte « EI » (sans quoi il compte comme un manque du vendeur).
  denomination: "Personne fictive EI", forme: "Entrepreneur individuel (EI)", siege: "1 rue Exemple, Paris",
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
    const html = await rendreServeur(await PageSante());
    for (const fait of ["Le médiateur de la consommation", "L'adresse du médiateur", "Le site du médiateur"]) {
      const puce = puceSante(html, fait.replace("'", "&#x27;"));
      expect(puce, fait).toBeDefined();
      expect(puce, fait).not.toBe("fourni");
    }
    expect(texte(html)).toContain("L’identité de l’éditeur n’a pas pu être lue : chaque fait est compté comme non fourni.");
  });

  it("lecture réussie, médiateur fourni : il s'affiche « fourni »", async () => {
    etat.identite = { editeur: { ...REQUIS, ...MEDIATEUR, telephone: null }, indisponible: false };
    const html = await rendreServeur(await PageSante());
    expect(puceSante(html, "Le médiateur de la consommation")).toBe("fourni");
    expect(puceSante(html, "Le téléphone de contact")).toBe("manquant");
    expect(texte(html)).not.toContain("n’a pas pu être lue");
  });

  it("règle de blocage active et fait requis manquant : le paiement en ligne reste fermé", async () => {
    etat.identite = { editeur: { ...REQUIS, telephone: null }, indisponible: false };
    const t = texte(await rendreServeur(await PageSante()));
    expect(t).toContain("le paiement en ligne reste fermé");
    expect(t).not.toContain("Le blocage des abonnements est levé");
  });

  it("règle de blocage levée et fait requis manquant : la page ne dit plus le paiement fermé", async () => {
    etat.identite = { editeur: { ...REQUIS, telephone: null }, indisponible: false };
    etat.reglage = { blocageIdentiteActif: false, revision: 2, indisponible: false };
    const t = texte(await rendreServeur(await PageSante()));
    expect(t).not.toContain("le paiement en ligne reste fermé");
    // Reprise D7 (D7R-04) : sans vendeur, TOUTE première souscription reste fermée, pas seulement celle d'un particulier.
    expect(t).toContain(
      "Le blocage des abonnements est levé dans les paramètres : ces manques ne ferment plus les augmentations payantes ; toute première souscription reste fermée.",
    );
  });

  // Reprise D7 (D7R-06) : la page disait que les faits « à compléter » s'affichent « à venir » sur les mentions légales
  // et ne ferment rien. Les mentions disent « aucun n'est désigné », et le médiateur ferme le particulier par défaut.
  it("identité requise complète, médiateur absent : la page dit ce que les mentions affichent et ce qui reste fermé", async () => {
    const html = await rendreServeur(await PageSante());
    const t = texte(html);
    expect(t).toContain(
      "L’identité requise est complète. Reste le médiateur de la consommation : tant qu’il n’est pas saisi, les mentions légales disent qu’aucun n’est désigné, et la première souscription d’un particulier reste fermée, sauf si le blocage des abonnements est levé dans les paramètres.",
    );
    expect(t).not.toContain("s’affichent « à venir » sur les mentions légales");
    expect(t).not.toContain("non bloquant");
    expect(puceSante(html, "Le médiateur de la consommation")).toBe("à compléter");
    expect(t).toContain("3 à compléter (médiateur)");
  });
});

const L612 = "article L. 612-1 : « Tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable du litige qui l’oppose à un professionnel. A cet effet, le professionnel garantit au consommateur le recours effectif à un dispositif de médiation de la consommation. »";
const L616 = "article L. 616-1 : « Tout professionnel communique au consommateur, selon des modalités fixées par décret en Conseil d’Etat, les coordonnées du ou des médiateurs compétents dont il relève. »";

describe("/admin/parametres : carte « Blocage des abonnements »", () => {
  it("vendeur complet, médiateur absent, règle active : la carte dit ce qui est fermé, cite les deux articles et à qui revient la décision", async () => {
    const t = texte(renderToStaticMarkup(await PageParametres()));
    expect(t).toContain("Règle active. Sans médiateur de la consommation saisi, un particulier ne peut pas souscrire pour la première fois ; les professionnels ne sont pas concernés.");
    expect(t).toContain("L’identité du vendeur est complète.");
    expect(t).toContain("Médiateur de la consommation : aucun n’est saisi (reste à compléter : le médiateur de la consommation, l'adresse du médiateur, le site du médiateur).");
    expect(t).toContain(L612);
    expect(t).toContain(L616);
    expect(t).toContain("Lever le blocage ouvre quand même la vente aux particuliers, sans médiateur : cette décision vous appartient, en tant que dirigeant. Elle est inscrite à l’historique des changements");
    expect(t).toContain("disent qu’aucun médiateur n’est désigné : rien n’est inventé.");
    // La console ne dit nulle part que vendre sans médiateur est permis, ni que le médiateur « ne bloque rien ».
    expect(t).not.toMatch(/conforme|autorisé par la loi|n’est pas exigé/i);
    expect(t).not.toContain("Le médiateur de la consommation ne bloque rien");
    expect(t).not.toContain("sans rien bloquer");
    expect(t).toContain("8 / 11 fournis");
    // La carte d'ouverture des ventes dit la même règle.
    expect(t).toContain("Sans médiateur de la consommation saisi, l’ouverture reste possible, mais la première souscription d’un particulier demeure fermée");
  });

  it("vendeur complet, médiateur absent, règle levée : la carte dit que la vente est ouverte aux particuliers sans médiateur, sur décision du dirigeant", () => {
    const t = texte(renderToStaticMarkup(createElement(BlocageSouscription, {
      actif: false, revision: 1, manquants: [], aCompleter: ["le médiateur de la consommation", "l'adresse du médiateur", "le site du médiateur"],
    })));
    expect(t).toContain("Règle levée. Un particulier peut souscrire même si aucun médiateur de la consommation n’est saisi");
    expect(t).toContain(L612);
    expect(t).toContain(L616);
    expect(t).toContain("Vous avez levé le blocage : la vente est ouverte aux particuliers sans médiateur. Cette décision vous appartient, en tant que dirigeant ; elle est inscrite à l’historique des changements.");
    expect(t).toContain("Réactiver le blocage");
    expect(t).not.toMatch(/conforme/i);
  });

  it("vendeur et médiateur complets : rien à citer, la règle ne ferme la souscription d'aucun particulier", async () => {
    etat.identite = { editeur: { ...REQUIS, ...MEDIATEUR }, indisponible: false };
    const t = texte(renderToStaticMarkup(await PageParametres()));
    expect(t).toContain("L’identité du vendeur est complète.");
    expect(t).toContain("Le médiateur de la consommation est saisi : cette règle ne ferme la souscription d’aucun particulier.");
    expect(t).not.toContain("L. 612-1");
    expect(t).not.toContain("reste à compléter");
  });

  it("seul le site du médiateur manque : la carte le nomme, sans dire le médiateur entier à compléter", () => {
    const t = texte(renderToStaticMarkup(createElement(BlocageSouscription, {
      actif: true, revision: 1, manquants: [], aCompleter: ["le site du médiateur"],
    })));
    expect(t).toContain("Médiateur de la consommation : aucun n’est saisi (reste à compléter : le site du médiateur).");
    expect(t).not.toContain("le médiateur de la consommation, l'adresse");
  });

  it("un fait requis manque : la liste de ce qui manque au vendeur, et la levée n'ouvre aucune première souscription", () => {
    const t = texte(renderToStaticMarkup(createElement(BlocageSouscription, {
      actif: true, revision: 1, manquants: ["le téléphone de contact"], aCompleter: ["le médiateur de la consommation"],
    })));
    expect(t).toContain("Identité du vendeur à compléter : le téléphone de contact. Lever ce blocage ne complète pas les mentions légales et n’ouvre aucune première souscription.");
    expect(t).not.toContain("L’identité du vendeur est complète");
  });

  it("entrepreneur individuel dont le nom ne porte pas « EI » : la page le compte comme un manque du vendeur (D7R-05)", async () => {
    etat.identite = { editeur: { ...REQUIS, denomination: "Personne fictive" }, indisponible: false };
    const t = texte(renderToStaticMarkup(await PageParametres()));
    expect(t).toContain("Identité du vendeur à compléter : la mention « EI » accolée au nom de l'éditeur (entrepreneur individuel).");
  });

  it("règle levée, vendeur incomplet : la carte dit que toute première souscription reste fermée", () => {
    const t = texte(renderToStaticMarkup(createElement(BlocageSouscription, {
      actif: false, revision: 1, manquants: ["le téléphone de contact"], aCompleter: [],
    })));
    expect(t).toContain("Toute première souscription, d’un particulier comme d’un professionnel, reste fermée tant que l’identité du vendeur est incomplète.");
  });
});
