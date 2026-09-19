import { describe, expect, it } from "vitest";
import voisinsFichier from "../src/data/departements-voisins.json";
import marcheFichier from "../src/data/territoires-marche.json";
import {
  POIDS,
  SEUIL_PERTINENCE,
  decider,
  departementsOuverts,
  noterCandidats,
  type Marche,
  type Voisinage,
} from "../src/lib/score-territoire";
import { DEPARTEMENTS, type EmpreinteDepartement } from "../src/lib/territoire";

const voisinage = voisinsFichier.voisins as Voisinage;

const ligne = (code: string, extra: Partial<EmpreinteDepartement> = {}): EmpreinteDepartement => {
  const d = DEPARTEMENTS.find((x) => x.code === code)!;
  return {
    code, nom: d.nom, region: d.region,
    agences: 0, proprietairesDirects: 0, enEssai: 0, actives: 0, suspendues: 0,
    inscriptionsDuMois: 0, biens: 0, lots: 0, bauxEnCours: 0,
    ...extra,
  };
};

const marcheVide = (): Marche => ({
  sources: [],
  departements: Object.fromEntries(
    DEPARTEMENTS.map((d) => [d.code, { logements_loues_prive: null, agences: null, communes_zone_tendue: null }])
  ),
});

describe("les données de référence versionnées", () => {
  it("couvrent les 101 départements, sans voisin pour l'outre-mer", () => {
    expect(Object.keys(voisinage)).toHaveLength(101);
    expect(voisinage["91"]).toEqual(["28", "45", "77", "78", "92", "94"]);
    expect(voisinage["75"]).toEqual(["92", "93", "94"]);
    expect(voisinage["974"]).toEqual([]);
    // La relation est symétrique : si A touche B, B touche A.
    for (const [a, liste] of Object.entries(voisinage)) for (const b of liste) expect(voisinage[b]).toContain(a);
  });
  it("portent un marché aux 101 entrées et à trois sources nommées", () => {
    expect(Object.keys(marcheFichier.departements)).toHaveLength(101);
    expect(marcheFichier.sources.map((s) => s.cle).sort()).toEqual(["agences", "communes_zone_tendue", "logements_loues_prive"]);
  });
  it("posent des poids qui font 1", () => {
    expect(POIDS.marche + POIDS.agences + POIDS.tension + POIDS.proximite).toBeCloseTo(1);
  });
});

describe("départements ouverts", () => {
  it("compte une organisation domiciliée ou un bien géré, pas un département vide", () => {
    const ouverts = departementsOuverts([
      ligne("91", { agences: 1 }),
      ligne("92", { biens: 1 }),
      ligne("78"),
    ]);
    expect([...ouverts].sort()).toEqual(["91", "92"]);
  });
});

describe("noter les candidats", () => {
  const empreinte = [ligne("91", { agences: 2, biens: 5, lots: 8, bauxEnCours: 6 })];

  it("sans aucune donnée de marché, seule la proximité départage — et tout est dit manquant", () => {
    const candidats = noterCandidats({ empreinte, marche: marcheVide(), voisinage });
    expect(candidats).toHaveLength(100);
    expect(candidats[0].manquants).toEqual(["logements_loues_prive", "agences", "communes_zone_tendue"]);
    // Les six voisins de l'Essonne sont devant tout le monde ; parmi eux, celui
    // qui a le moins de voisins au total a la plus grande part de voisins ouverts.
    const six = candidats.slice(0, 6).map((c) => c.code).sort();
    expect(six).toEqual(["28", "45", "77", "78", "92", "94"]);
    expect(candidats[0].composantes.proximite).toBeGreaterThan(0);
    expect(candidats[99].score).toBe(0);
  });

  it("ne note jamais un département déjà ouvert", () => {
    const candidats = noterCandidats({ empreinte, marche: marcheVide(), voisinage });
    expect(candidats.find((c) => c.code === "91")).toBeUndefined();
  });

  it("classe le marché en rangs : le plus grand vaut 100, un null vaut 0 et est nommé", () => {
    const marche = marcheVide();
    marche.departements["92"].logements_loues_prive = 300000;
    marche.departements["78"].logements_loues_prive = 150000;
    marche.departements["77"].logements_loues_prive = 100000;
    const candidats = noterCandidats({ empreinte, marche, voisinage });
    const de = (code: string) => candidats.find((c) => c.code === code)!;
    expect(de("92").composantes.marche).toBe(100);
    expect(de("78").composantes.marche).toBe(50);
    expect(de("77").composantes.marche).toBe(0);
    expect(de("94").composantes.marche).toBe(0);
    expect(de("94").manquants).toContain("logements_loues_prive");
    expect(de("92").manquants).not.toContain("logements_loues_prive");
    expect(de("92").score).toBeGreaterThan(de("78").score);
  });

  it("applique les poids écrits, pas d'autres", () => {
    const marche = marcheVide();
    marche.departements["92"] = { logements_loues_prive: 10, agences: 10, communes_zone_tendue: 10 };
    marche.departements["77"] = { logements_loues_prive: 1, agences: 1, communes_zone_tendue: 1 };
    const c92 = noterCandidats({ empreinte, marche, voisinage }).find((c) => c.code === "92")!;
    const attendu = Math.round(
      100 * POIDS.marche + 100 * POIDS.agences + 100 * POIDS.tension + c92.composantes.proximite * POIDS.proximite
    );
    expect(c92.score).toBe(attendu);
  });

  it("donne zéro de proximité à l'outre-mer, qui n'a pas de voisin", () => {
    const c = noterCandidats({ empreinte, marche: marcheVide(), voisinage }).find((c) => c.code === "974")!;
    expect(c.composantes.proximite).toBe(0);
  });
});

describe("décider du prochain département", () => {
  it("reste dans la région courante tant qu'un candidat y dépasse le seuil", () => {
    const empreinte = [ligne("91", { agences: 1, biens: 3, bauxEnCours: 2 })];
    const candidats = noterCandidats({ empreinte, marche: marcheVide(), voisinage });
    const d = decider(empreinte, candidats, 10);
    expect(d.regionCourante).toBe("Île-de-France");
    expect(d.changementDeRegion).toBe(false);
    expect(d.prochain?.region).toBe("Île-de-France");
    expect(voisinage["91"]).toContain(d.prochain?.code);
  });

  it("change de région, automatiquement, quand la région courante est entièrement ouverte", () => {
    const idf = DEPARTEMENTS.filter((x) => x.region === "Île-de-France").map((x) => x.code);
    const empreinte = idf.map((code, i) => ligne(code, { agences: 1, biens: 8 - i, bauxEnCours: 8 - i }));
    const marche = marcheVide();
    marche.departements["45"].logements_loues_prive = 50000; // le Loiret, voisin de l'Essonne
    const candidats = noterCandidats({ empreinte, marche, voisinage });
    const d = decider(empreinte, candidats);
    expect(d.regionCourante).toBe("Île-de-France");
    expect(d.changementDeRegion).toBe(true);
    expect(d.prochain?.code).toBe("45");
    expect(d.raison).toMatch(/entièrement ouverte/);
  });

  it("change de région quand ce qui reste dans la région est sous le seuil", () => {
    // Essonne ouverte ; les autres franciliens n'ont ni marché ni voisin ouvert
    // hormis la proximité — on force un seuil que la seule proximité n'atteint pas.
    const empreinte = [ligne("91", { agences: 1, biens: 1 })];
    const marche = marcheVide();
    marche.departements["69"] = { logements_loues_prive: 400000, agences: 900, communes_zone_tendue: 40 };
    const candidats = noterCandidats({ empreinte, marche, voisinage });
    const d = decider(empreinte, candidats, 90);
    expect(d.changementDeRegion).toBe(true);
    expect(d.prochain?.code).toBe("69");
    expect(d.raison).toMatch(/sous le seuil de 90/);
  });

  it("ouvre le meilleur candidat quand la plateforme n'est nulle part", () => {
    const marche = marcheVide();
    marche.departements["13"].logements_loues_prive = 1;
    const candidats = noterCandidats({ empreinte: [], marche, voisinage });
    const d = decider([], candidats);
    expect(d.regionCourante).toBeNull();
    expect(d.prochain?.code).toBe("13");
    expect(d.changementDeRegion).toBe(false);
  });

  it("n'a plus rien à proposer quand tout est ouvert", () => {
    const empreinte = DEPARTEMENTS.map((x) => ligne(x.code, { biens: 1 }));
    const candidats = noterCandidats({ empreinte, marche: marcheVide(), voisinage });
    expect(candidats).toHaveLength(0);
    expect(decider(empreinte, candidats).prochain).toBeNull();
  });

  it("expose un seuil par défaut lisible", () => {
    expect(SEUIL_PERTINENCE).toBe(20);
  });
});
