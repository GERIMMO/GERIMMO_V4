/**
 * Outil « Calcul IRL » (30/09) : la série officielle de l'IRL est lue chez
 * l'Insee (SDMX-ML, série 001515333) côté serveur. Lecture des deux formats,
 * choix automatique des indices, et repli silencieux (null) si l'Insee ne
 * répond pas. Les fixtures ne portent que deux valeurs réelles (T2 2025 et
 * T2 2026) ; les autres sont factices.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  URL_SDMX_SERIE_IRL,
  chargerSerieIrl,
  choisirIndices,
  lireSerieSdmx,
  numeroTrimestre,
  trimestreDeDate,
} from "../src/lib/outils/irl-insee";
import { calculerRevisionIrl } from "../src/lib/outils/irl";

const fixture = (nom: string) => readFileSync(path.resolve(__dirname, "fixtures", nom), "utf8");
const STRUCTURE_SPECIFIC = fixture("insee-irl-structure-specific.xml");
const GENERIC = fixture("insee-irl-generic.xml");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lecture de la série SDMX", () => {
  it("format StructureSpecific : attributs dans n'importe quel ordre, triés, valeurs vides écartées", () => {
    const serie = lireSerieSdmx(STRUCTURE_SPECIFIC);
    expect(serie.map((o) => `${o.trimestre} ${o.annee}`)).toEqual([
      "T2 2024",
      "T2 2025",
      "T4 2025",
      "T1 2026",
      "T2 2026",
      "T3 2026",
    ]);
    expect(serie.find((o) => o.annee === 2025 && o.trimestre === "T2")?.valeur).toBe(146.68);
    expect(serie.find((o) => o.annee === 2026 && o.trimestre === "T2")?.valeur).toBe(148.37);
  });

  it("format Generic : ObsDimension et ObsValue, périodes illisibles écartées", () => {
    expect(lireSerieSdmx(GENERIC)).toEqual([
      { trimestre: "T2", annee: 2025, valeur: 146.68 },
      { trimestre: "T1", annee: 2026, valeur: 122.22 },
      { trimestre: "T2", annee: 2026, valeur: 148.37 },
    ]);
  });

  it("une réponse vide ou étrangère ne donne aucune observation", () => {
    expect(lireSerieSdmx("")).toEqual([]);
    expect(lireSerieSdmx("<html><body>Service indisponible</body></html>")).toEqual([]);
  });
});

describe("choix automatique des indices", () => {
  const serie = lireSerieSdmx(STRUCTURE_SPECIFIC);

  it("bail signé en mai 2025 : T2 2025 = 146,68 → T2 2026 = 148,37 → 850 € devient 859,79 €", () => {
    const t = trimestreDeDate("2025-05-14");
    expect(t).toEqual({ trimestre: "T2", annee: 2025 });
    const s = choisirIndices(serie, t!);
    expect(s.reference?.valeur).toBe(146.68);
    expect(s.nouveau).toEqual({ trimestre: "T2", annee: 2026, valeur: 148.37 });
    expect(s.dernier).toEqual({ trimestre: "T3", annee: 2026, valeur: 133.33 });
    const r = calculerRevisionIrl({
      loyer: 850,
      indiceReference: s.reference!.valeur,
      trimestreReference: { trimestre: numeroTrimestre(s.reference!.trimestre), annee: s.reference!.annee },
      indiceNouveau: s.nouveau!.valeur,
      trimestreNouveau: { trimestre: numeroTrimestre(s.nouveau!.trimestre), annee: s.nouveau!.annee },
    });
    expect(r.ok && r.nouveauLoyer).toBe(859.79);
  });

  it("le nouvel indice est le plus récent du même trimestre, pas l'année suivante", () => {
    const s = choisirIndices(serie, { trimestre: "T2", annee: 2024 });
    expect(s.reference?.annee).toBe(2024);
    expect(s.nouveau?.annee).toBe(2026);
  });

  it("indice pas encore publié : aucun nouvel indice, rien d'inventé", () => {
    const s = choisirIndices(serie, { trimestre: "T2", annee: 2026 });
    expect(s.reference?.valeur).toBe(148.37);
    expect(s.nouveau).toBeNull();
    expect(choisirIndices(serie, { trimestre: "T3", annee: 2025 }).reference).toBeNull();
  });

  it("trimestre d'une date", () => {
    expect(trimestreDeDate("2024-01-01")).toEqual({ trimestre: "T1", annee: 2024 });
    expect(trimestreDeDate("2024-12-31")).toEqual({ trimestre: "T4", annee: 2024 });
    expect(trimestreDeDate("")).toBeNull();
    expect(trimestreDeDate("2024-13-01")).toBeNull();
  });
});

describe("chargement serveur", () => {
  it("interroge la série BDM en XML, avec délai et cache d'une journée", async () => {
    const f = vi.fn(async () => new Response(STRUCTURE_SPECIFIC, { status: 200 }));
    vi.stubGlobal("fetch", f);
    const serie = await chargerSerieIrl();
    expect(serie?.length).toBe(6);
    const [url, options] = f.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).toBe("https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/001515333");
    expect(URL_SDMX_SERIE_IRL).toBe(url);
    expect((options.headers as Record<string, string>).Accept).toBe("application/xml");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.next?.revalidate).toBe(86400);
  });

  it("réseau coupé, erreur HTTP ou réponse vide : null, jamais d'exception", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("réseau"))));
    await expect(chargerSerieIrl()).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 503 })));
    await expect(chargerSerieIrl()).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<vide/>", { status: 200 })));
    await expect(chargerSerieIrl()).resolves.toBeNull();
  });
});

describe("aucune valeur d'indice dans le code", () => {
  it("le module de lecture ne contient aucun indice", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/lib/outils/irl-insee.ts"), "utf8");
    expect(src.match(/\b1[0-9]\d\.\d{2}\b/g) ?? []).toEqual([]);
  });
});
