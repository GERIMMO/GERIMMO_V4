/**
 * UN BAIL REPRIS EN COURS NE RÉCLAME PAS LES LOYERS D'AVANT SON ARRIVÉE SUR GERIMMO — date de bascule, 20/11/2026. Côté écran.
 *
 * La base décide (migration 20261120200000, tests/loyers-suivis-depuis-base.test.ts) ; l'écran annonce. Ce que ces
 * tests tiennent, sans base :
 *  1. `premierMoisSuivi` : le mois en cours quand le mois d'entrée est passé, rien sinon ;
 *  2. `moisEnClair` : « novembre 2026 », et rien plutôt qu'une invention pour une date mal formée ;
 *  3. la fiche du bail lit la date de bascule À PART, de façon tolérante, et n'annonce rien que la base ne ferait pas ;
 *  4. la rubrique des loyers dit depuis quand ils sont suivis, et mène au premier geste utile.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moisEnClair, premierMoisSuivi } from "../src/lib/baux";

describe("premierMoisSuivi : le mois de l'activation, pour un bail dont le mois d'entrée est passé", () => {
  it.each([
    ["2024-11-01", "2026-11-20", "2026-11-01"],
    ["2026-10-31", "2026-11-01", "2026-11-01"],
    ["2026-10-31", "2026-11-30", "2026-11-01"],
    ["2025-12-31", "2026-01-01", "2026-01-01"],
    ["2026-11-01", "2026-11-20", null],
    ["2026-11-19", "2026-11-20", null],
    ["2026-11-20", "2026-11-20", null],
    ["2026-11-21", "2026-11-20", null],
    ["2027-01-01", "2026-11-20", null],
  ])("entrée le %s, activé le %s → %s", (entree, jour, attendu) => {
    expect(premierMoisSuivi(entree, jour)).toBe(attendu);
  });

  it.each([null, undefined, "", "01/11/2024", "2024-11", "hier", "2024-11-01T00:00:00Z"])(
    "une date d'entrée absente ou mal formée (%s) ne pose aucune date de bascule",
    (entree) => {
      expect(premierMoisSuivi(entree as string | null | undefined, "2026-11-20")).toBeNull();
    },
  );

  it("un jour de référence mal formé ne pose rien non plus", () => {
    expect(premierMoisSuivi("2024-11-01", "20/11/2026")).toBeNull();
    expect(premierMoisSuivi("2024-11-01", "")).toBeNull();
  });
});

describe("moisEnClair", () => {
  it.each([
    ["2026-01-01", "janvier 2026"], ["2026-02-01", "février 2026"], ["2026-08-01", "août 2026"],
    ["2026-11-01", "novembre 2026"], ["2026-12-01", "décembre 2026"], ["2027-10-01", "octobre 2027"],
  ])("%s → %s", (date, attendu) => {
    expect(moisEnClair(date)).toBe(attendu);
  });

  it.each([null, undefined, "", "2026-13-01", "2026-00-01", "novembre 2026", "2026-11"])("rien pour %s", (date) => {
    expect(moisEnClair(date as string | null | undefined)).toBeNull();
  });
});

describe("la fiche du bail", () => {
  const page = readFileSync("src/app/agence/[orgId]/baux/[bailId]/page.tsx", "utf8");

  it("lit la date de bascule par une requête à part : la fiche s'affiche même si la colonne n'existe pas encore", () => {
    expect(page).toContain('supabase.from("baux").select("loyers_suivis_depuis").eq("id", bailId).eq("organization_id", orgId).maybeSingle()');
    expect(page).toContain("const loyersSuivisDepuis = basculeIndisponible ? null :");
    // La requête principale du bail ne la demande pas : une colonne absente n'y ferait pas échouer toute la fiche.
    const principale = page.slice(page.indexOf('"id, chambre_id, type, etat, zone_tendue'), page.indexOf("if (erreurBail)"));
    expect(principale).not.toContain("loyers_suivis_depuis");
  });

  it("annonce, avant le dépôt du contrat, le mois à partir duquel les loyers seront suivis — seulement si la base connaît la règle", () => {
    expect(page).toContain('const moisBasculeAnnonce = bail.etat === "brouillon" && !basculeIndisponible ? moisEnClair(premierMoisSuivi(bail.date_debut, aujourdhuiParis())) : null;');
    expect(page).toContain("{moisBasculeAnnonce && !bail.document_signe && <p className=\"text-sm\" data-loyers-suivis-a-partir>");
    expect(page).toContain("Gerimmo suivra les loyers à partir {deElide(moisBasculeAnnonce)} : ceux d’avant ne seront pas réclamés.");
  });

  it("transmet à la rubrique des loyers la date posée par la base, en clair", () => {
    expect(page).toContain("loyersSuivisDepuis={moisEnClair(loyersSuivisDepuis)}");
  });
});

describe("la rubrique « Loyers & paiements »", () => {
  const loyers = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8");

  it("dit depuis quand les loyers sont suivis, et que ceux d'avant ne sont pas réclamés", () => {
    expect(loyers).toContain("{loyersSuivisDepuis && (");
    expect(loyers).toContain("data-loyers-suivis-depuis");
    expect(loyers).toContain("Gerimmo suit les loyers de ce bail depuis {loyersSuivisDepuis}.");
    expect(loyers).toContain("ils ne sont pas réclamés.");
  });

  it("échéancier vide : dit où il commencera et quoi faire du loyer déjà payé ; sans date de bascule, la phrase d'avant", () => {
    expect(loyers).toContain("générez l’échéancier, il commencera en ${loyersSuivisDepuis}. Si ce loyer est déjà payé, enregistrez-le ensuite pour obtenir la quittance.");
    expect(loyers).toContain('"Aucun appel pour l’instant : générez l’échéancier du bail."');
  });

  it("sans date de bascule, rien n'est affiché de plus (prop facultative, vide par défaut)", () => {
    expect(loyers).toContain("  loyersSuivisDepuis = null,");
    expect(loyers).toContain("  loyersSuivisDepuis?: string | null;");
  });
});
