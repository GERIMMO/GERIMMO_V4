import { describe, expect, it } from "vitest";
import { ambianceAccueil, type AmbianceAccueilId } from "../src/lib/ambiance-accueil";

function decalerJour(jour: string, ecart: number): string {
  const date = new Date(`${jour}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ecart);
  return date.toISOString().slice(0, 10);
}

const EXEMPLES: readonly [string, AmbianceAccueilId, string][] = [
  ["2026-01-20", "hiver", "Hiver"],
  ["2026-03-10", "printemps", "Printemps"],
  ["2026-07-20", "ete", "Été"],
  ["2026-09-20", "automne", "Automne"],
  ["2026-01-01", "nouvel-an", "Nouvel An"],
  ["2026-02-14", "saint-valentin", "Saint-Valentin"],
  ["2026-04-05", "paques", "Pâques"],
  ["2026-05-01", "fete-travail", "Fête du Travail"],
  ["2026-05-31", "fete-meres", "Fête des Mères"],
  ["2026-06-21", "fete-peres", "Fête des Pères"],
  ["2026-06-20", "fete-musique", "Fête de la Musique"],
  ["2026-07-14", "14-juillet", "14 Juillet"],
  ["2026-09-01", "rentree", "Rentrée"],
  ["2026-10-31", "halloween", "Halloween"],
  ["2026-12-25", "noel", "Noël"],
];

describe("ambiance de l’accueil selon le jour de Paris fourni", () => {
  it.each(EXEMPLES)("%s : scène locale distincte pour %s", (jour, id, libelle) => {
    expect(ambianceAccueil(jour)).toEqual({ id, libelle, image: `/illustrations/accueil-evenements/${id}.webp` });
  });

  it.each([
    ["2026-12-28", "noel"], ["2026-12-29", "nouvel-an"], ["2026-12-31", "nouvel-an"],
    ["2027-01-01", "nouvel-an"], ["2027-01-04", "nouvel-an"], ["2027-01-05", "hiver"],
    ["2027-02-06", "hiver"], ["2027-02-07", "saint-valentin"],
    ["2027-02-14", "saint-valentin"], ["2027-02-15", "hiver"],
    ["2026-04-28", "printemps"], ["2026-04-29", "fete-travail"],
    ["2026-05-01", "fete-travail"], ["2026-05-02", "printemps"],
    ["2026-07-09", "ete"], ["2026-07-10", "14-juillet"],
    ["2026-07-14", "14-juillet"], ["2026-07-15", "ete"],
    ["2026-08-24", "ete"], ["2026-08-25", "rentree"], ["2026-08-31", "rentree"],
    ["2026-09-01", "rentree"], ["2026-09-07", "rentree"], ["2026-09-08", "automne"],
    ["2026-10-19", "automne"], ["2026-10-20", "halloween"], ["2026-10-31", "halloween"],
    ["2026-11-01", "automne"], ["2026-11-30", "automne"], ["2026-12-01", "noel"],
  ])("%s : %s aux limites des fenêtres fixes", (jour, ambiance) => {
    expect(ambianceAccueil(jour).id).toBe(ambiance);
  });

  // Dates indépendantes du calcul : Nominis / Conférence des évêques de France.
  // https://nominis.cef.fr/contenus/saint/11423/Paques.html
  it.each(["2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21"])(
    "Pâques %s : de J-7 au lundi inclus, même en changeant de mois",
    (paques) => {
      expect(ambianceAccueil(decalerJour(paques, -8)).id).toBe("printemps");
      for (let decalage = -7; decalage <= 1; decalage += 1) {
        expect(ambianceAccueil(decalerJour(paques, decalage)).id).toBe("paques");
      }
      expect(ambianceAccueil(decalerJour(paques, 2)).id).toBe("printemps");
    },
  );

  it.each(["2026-05-31", "2027-05-30", "2028-05-28", "2029-05-27", "2030-05-26", "2034-06-04"])(
    "fête des Mères %s : cinq jours avant et le jour même",
    (fete) => {
      expect(ambianceAccueil(decalerJour(fete, -6)).id).not.toBe("fete-meres");
      for (let decalage = -5; decalage <= 0; decalage += 1) {
        expect(ambianceAccueil(decalerJour(fete, decalage)).id).toBe("fete-meres");
      }
      expect(ambianceAccueil(decalerJour(fete, 1)).id).not.toBe("fete-meres");
    },
  );

  it.each([
    ["2020-05-31", "printemps"], ["2020-06-07", "fete-meres"],
    ["2023-05-28", "printemps"], ["2023-06-04", "fete-meres"],
    ["2034-05-28", "printemps"], ["2034-06-04", "fete-meres"],
  ])("%s : le report français en cas de Pentecôte est respecté", (jour, ambiance) => {
    expect(ambianceAccueil(jour).id).toBe(ambiance);
  });

  it.each(["2026-06-21", "2027-06-20", "2028-06-18", "2029-06-17", "2030-06-16"])(
    "fête des Pères le troisième dimanche de juin : %s",
    (fete) => {
      expect(ambianceAccueil(decalerJour(fete, -6)).id).not.toBe("fete-peres");
      expect(ambianceAccueil(decalerJour(fete, -5)).id).toBe("fete-peres");
      expect(ambianceAccueil(fete).id).toBe("fete-peres");
      expect(ambianceAccueil(decalerJour(fete, 1)).id).not.toBe("fete-peres");
    },
  );

  it.each([
    ["2026-06-15", "ete"], ["2026-06-16", "fete-peres"], ["2026-06-18", "fete-peres"],
    ["2026-06-19", "fete-musique"], ["2026-06-20", "fete-musique"],
    ["2026-06-21", "fete-peres"], ["2026-06-22", "ete"],
    ["2027-06-19", "fete-musique"], ["2027-06-20", "fete-peres"], ["2027-06-21", "fete-musique"],
    ["2033-06-19", "fete-peres"], ["2033-06-20", "fete-musique"], ["2033-06-21", "fete-musique"],
  ])("%s : %s, sans faire disparaître la musique ni la fête des Pères", (jour, ambiance) => {
    expect(ambianceAccueil(jour).id).toBe(ambiance);
  });

  it.each([
    ["2026-02-28", "hiver"], ["2028-02-29", "hiver"], ["2000-02-29", "hiver"],
    ["2026-03-01", "printemps"], ["2026-05-25", "printemps"], ["2026-06-01", "ete"],
    ["2026-08-24", "ete"], ["2026-09-08", "automne"], ["2026-11-30", "automne"],
    ["0001-01-01", "nouvel-an"], ["0099-08-20", "ete"], ["9999-12-31", "nouvel-an"],
  ])("%s : saison ou fête %s, y compris les années bissextiles et limites", (jour, ambiance) => {
    expect(ambianceAccueil(jour).id).toBe(ambiance);
  });

  it.each(Array.from({ length: 15 }, (_, index) => 2026 + index))(
    "%s : les quinze scènes apparaissent et aucune date ne reste sans ambiance",
    (annee) => {
      const ids = new Set<AmbianceAccueilId>();
      let jour = `${annee}-01-01`;
      while (jour.startsWith(String(annee))) {
        ids.add(ambianceAccueil(jour).id);
        jour = decalerJour(jour, 1);
      }
      expect([...ids].sort()).toEqual(EXEMPLES.map(([, id]) => id).sort());
    },
  );

  it.each([
    "", "2026-2-07", "2026-02-7", "26-02-07", "2026/02/07",
    "2026-02-07T23:00:00Z", " 2026-02-07", "2026-02-07 ",
    "0000-01-01", "2026-00-01", "2026-13-01", "2026-01-00", "2026-10-32",
    "2026-04-31", "2026-02-29", "1900-02-29", "2100-02-29", "2028-02-30",
    "10000-01-01", "2026-06-31", "2026-11-31",
  ])("rejette %j au lieu de choisir une décoration trompeuse", (jour) => {
    expect(() => ambianceAccueil(jour)).toThrow(RangeError);
  });

  it.each([null, undefined, 20261026, new Date("2026-10-26")])("rejette aussi une entrée non textuelle : %j", (jour) => {
    expect(() => ambianceAccueil(jour as unknown as string)).toThrow(RangeError);
  });
});
