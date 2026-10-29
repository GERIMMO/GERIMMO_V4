/**
 * La grille tarifaire du 28/09/2026 : seuils, exemples de référence, taxes.
 * Tout est en centimes ; aucun flottant n'entre dans un montant.
 */
import { describe, expect, it } from "vitest";
import {
  FORMULES_PARTICULIER,
  respectePlancherOffre,
  economieAnnuelleCents,
  estimationProrataCents,
  euros,
  formulesCouvrant,
  montants,
  offreAgence,
  offreFormule,
  offreParticulier,
  sensChangement,
} from "@/lib/tarifs";

describe("particuliers : la formule la moins chère qui couvre le portefeuille", () => {
  it.each([
    // biens, formule, mensuel, annuel, capacité
    [0, "solo", 599, 5990, 1],
    [1, "solo", 599, 5990, 1],
    [2, "bailleur", 1770, 17700, 3],
    [3, "bailleur", 1770, 17700, 3],
    [4, "investisseur", 5900, 59000, 10],
    [10, "investisseur", 5900, 59000, 10],
    [11, "patrimoine", 11800, 118000, 20],
    [20, "patrimoine", 11800, 118000, 20],
    [21, "patrimoine", 12390, 123900, 21],
    [25, "patrimoine", 14750, 147500, 25],
  ] as const)("%i bien(s) → %s, %i c/mois, %i c/an", (n, code, mensuel, annuel, capacite) => {
    const m = offreParticulier(n, "mensuel");
    const a = offreParticulier(n, "annuel");
    expect(m.formule.code).toBe(code);
    expect(a.formule.code).toBe(code);
    expect(m.montantCents).toBe(mensuel);
    expect(a.montantCents).toBe(annuel);
    expect(m.capacite).toBe(capacite);
  });

  it("exemple de la grille : 25 biens = 147,50 € TTC/mois ou 1475,00 € TTC/an", () => {
    expect(euros(offreParticulier(25, "mensuel").montantCents)).toBe("147,50 €");
    expect(euros(offreParticulier(25, "annuel").montantCents)).toBe("1\u202f475,00 €");
    const l = offreParticulier(25, "annuel").lignes;
    expect(l).toEqual([
      expect.objectContaining({ produit: "gerimmo_formule_patrimoine", quantite: 1, totalCents: 118000 }),
      expect.objectContaining({ produit: "gerimmo_bien_supplementaire", quantite: 5, prixUnitaireCents: 5900, totalCents: 29500 }),
    ]);
  });

  it("l'annuel vaut deux mois offerts sur chaque formule", () => {
    for (const f of FORMULES_PARTICULIER) {
      expect(f.annuelCents).toBe(f.mensuelCents * 10);
      expect(economieAnnuelleCents(f)).toBe(f.mensuelCents * 2);
    }
    // 5,99 × 12 = 71,88 ; payé 59,90 → 11,98 = deux mensualités
    expect(economieAnnuelleCents(FORMULES_PARTICULIER[0])).toBe(1198);
  });

  it("une formule plus petite que le portefeuille ne le couvre pas ; une plus grande peut être choisie", () => {
    expect(offreFormule(FORMULES_PARTICULIER[0], 2, "mensuel")).toBeNull();
    expect(offreFormule(FORMULES_PARTICULIER[2], 2, "mensuel")?.montantCents).toBe(5900);
    expect(formulesCouvrant(2, "mensuel").map((o) => o.formule.code)).toEqual(["bailleur", "investisseur", "patrimoine"]);
    expect(formulesCouvrant(21, "annuel").map((o) => o.formule.code)).toEqual(["patrimoine"]);
  });

  it("aucune formule gratuite, même à zéro ou un bien", () => {
    for (const n of [0, 4900]) for (const p of ["mensuel", "annuel"] as const) expect(offreParticulier(n, p).montantCents).toBeGreaterThan(0);
  });
});

describe("agences : barème marginal, jamais le tarif de la dernière tranche sur tout", () => {
  it.each([
    [0, 4900],
    [1, 4900],
    [10, 4900],
    [11, 5390],
    [20, 9800],
    [50, 24500],
    [51, 24990],
    [100, 49000],
    [200, 98000],
    [201, 98490],
    [300, 147000],
    [500, 245000],
  ])("%i lots → %i c HT/mois", (lots, cents) => {
    expect(offreAgence(lots).montantCents).toBe(cents);
  });

  it("le socle couvre ses 10 lots même quand l'agence en gère moins (30/09)", () => {
    // Une agence souscrite à 0 lot recevait une capacité de 0 : plus rien à créer.
    expect(offreAgence(0).capacite).toBe(10);
    expect(offreAgence(4).capacite).toBe(10);
    expect(offreAgence(10).capacite).toBe(10);
    expect(offreAgence(25).capacite).toBe(25);
  });

  it("le détail d'une facture se recalcule à la main", () => {
    expect(offreAgence(300).lignes.map((l) => [l.quantite, l.prixUnitaireCents, l.totalCents])).toEqual([
      [1, 4900, 4900],
      [40, 490, 19600],
      [150, 490, 73500],
      [100, 490, 49000],
    ]);
  });

  it("une entrée absurde ne produit ni NaN ni montant négatif", () => {
    expect(offreAgence(Number.NaN).montantCents).toBe(4900);
    expect(offreAgence(-4).montantCents).toBe(4900);
    expect(offreParticulier(Number.NaN, "mensuel").montantCents).toBe(599);
  });
});

describe("taxes : le régime de l'éditeur, jamais inventé", () => {
  it("régime non renseigné : aucun montant de TVA n'est calculé", () => {
    const t = montants(3900, "ht", null);
    expect(t.connu).toBe(false);
    expect(t).toMatchObject({ htCents: 3900, ttcCents: null });
    expect(montants(599, "ttc", null)).toMatchObject({ connu: false, ttcCents: 599, htCents: null });
  });

  it("franchise en base : HT = TTC, mention 293 B", () => {
    expect(montants(3900, "ht", { nature: "franchise" })).toMatchObject({ htCents: 3900, tvaCents: 0, ttcCents: 3900 });
    expect(montants(3900, "ht", { nature: "franchise" }).mention).toMatch(/293 B/);
  });

  it("assujetti 20 % : HT agence + TVA en sus, TTC particulier dont TVA", () => {
    expect(montants(3900, "ht", { nature: "assujetti", tauxPourcent: 20 })).toMatchObject({ htCents: 3900, tvaCents: 780, ttcCents: 4680 });
    expect(montants(599, "ttc", { nature: "assujetti", tauxPourcent: 20 })).toMatchObject({ htCents: 499, tvaCents: 100, ttcCents: 599 });
  });
});

describe("changements", () => {
  it("sens d'un changement", () => {
    expect(sensChangement(999, 1999)).toBe("hausse");
    expect(sensChangement(1999, 999)).toBe("baisse");
    expect(sensChangement(999, 999)).toBe("identique");
  });

  it("estimation de prorata : moitié de période restante = moitié de la différence", () => {
    const debut = Date.UTC(2026, 9, 1);
    const fin = Date.UTC(2026, 9, 31);
    const milieu = debut + (fin - debut) / 2;
    expect(estimationProrataCents(999, 1999, debut, fin, milieu)).toBe(500);
    expect(estimationProrataCents(1999, 999, debut, fin, milieu)).toBe(0); // une baisse ne se proratise pas
    expect(estimationProrataCents(999, 1999, debut, fin, fin + 1)).toBe(0);
  });
});


describe("plancher commercial après remise", () => {
  it("reste au-dessus de 4,90 pour chaque capacité, offre, période et supplément", () => {
    for (let n=0;n<=1000;n++) {
      for (const periode of ["mensuel","annuel"] as const) {
        for (const offre of formulesCouvrant(n,periode)) expect(respectePlancherOffre(offre)).toBe(true);
      }
      expect(respectePlancherOffre(offreAgence(n))).toBe(true);
    }
  });
  it("refuse un centime sous le plancher annuel et accepte sa borne exacte", () => {
    const offre=offreParticulier(1,"annuel");
    expect(respectePlancherOffre({...offre,montantCents:5880})).toBe(true);
    expect(respectePlancherOffre({...offre,montantCents:5879})).toBe(false);
    expect(respectePlancherOffre({...offre,montantCents:NaN})).toBe(false);
  });
});
