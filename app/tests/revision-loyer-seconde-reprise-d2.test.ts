/**
 * RÉVISION DU LOYER — seconde reprise du lot D2 (24/11/2026), côté application (sans base).
 *
 * Tient les constats du relecteur qui se jouent hors de la base :
 *  - constat 5 : deux révisions en attente du même terme (14/10 : 700 → 714 € ; 15/10 : 714 → 728 €) — le loyer du terme en
 *    cours est 700 €, et c'est le loyer du bail (728 €) qui s'annonce ; l'ordre de lecture est fixe partout ;
 *  - constat 6 : un bail qui finit avant le premier terme révisé n'annonce rien ;
 *  - constat 1 : le formulaire reconnaît l'année non faite comme la base, à l'année de bail (`indicePrecedentExige`).
 * Le reste (indices, termes rattrapés, ordre rendu par la base, retour) est tenu par
 * tests/revision-loyer-seconde-reprise-d2-base.test.ts ; le formulaire rendu, par tests/revision-loyer-reprise-d2-ecran.test.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indicePrecedentExige, loyerDuTermeEnCours } from "@/lib/baux";

describe("constat 5 — loyer du terme en cours avec deux révisions en attente du même terme", () => {
  const du14 = { ancien_loyer: 700, nouveau_loyer: 714, premier_terme: "2026-11-01" };
  const du15 = { ancien_loyer: 714, nouveau_loyer: 728, premier_terme: "2026-11-01" };

  it("preuve du relecteur : le 20/10/2026, le terme en cours est à 700 € et 728 € s'annoncent à compter de novembre (avant : 728 € sans annonce)", () => {
    expect(loyerDuTermeEnCours(728, [du14, du15], "2026-10-20")).toEqual({
      loyer: 700, aVenir: { loyer: 728, premierTerme: "2026-11-01", dernierTermeAvant: "2026-10-01" },
    });
  });

  it("une fois le premier terme commencé, plus rien n'attend : le loyer du bail", () => {
    expect(loyerDuTermeEnCours(728, [du14, du15], "2026-11-01")).toEqual({ loyer: 728, aVenir: null });
  });

  it("le bail ne porte pas le loyer de la dernière révision en attente (un avenant est passé depuis) : on s'en tient au loyer du bail", () => {
    expect(loyerDuTermeEnCours(800, [du14, du15], "2026-10-20")).toEqual({ loyer: 800, aVenir: null });
    // Une seule révision en attente : inchangé.
    expect(loyerDuTermeEnCours(714, [du14], "2026-10-20")).toEqual({ loyer: 700, aVenir: { loyer: 714, premierTerme: "2026-11-01", dernierTermeAvant: "2026-10-01" } });
  });

  it("l'ordre de lecture est fixe partout : premier terme, date d'enregistrement, date d'effet", () => {
    const tri = "order by rv.premier_terme, rv.created_at, rv.date_effet";
    expect(readFileSync("supabase/migrations/20261124150000_revision_loyer_seconde_reprise_d2.sql", "utf8")).toContain(tri);
    expect(readFileSync("src/lib/documents/modeles/catalogue-bail.ts", "utf8"))
      .toContain('.not("premier_terme", "is", null)\n        .order("premier_terme").order("created_at").order("date_effet"));');
  });
});

describe("constat 6 — un bail qui finit avant le premier terme révisé n'annonce rien", () => {
  const revision = { ancien_loyer: 700, nouveau_loyer: 714, premier_terme: "2026-01-01" };

  it("preuve du relecteur : préavis finissant le 20/12/2025, révision du 03/12 (premier terme janvier 2026) — 700 €, sans annonce", () => {
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03", "2025-12-20")).toEqual({ loyer: 700, aVenir: null });
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03", "2025-12-31")).toEqual({ loyer: 700, aVenir: null });
  });

  it("le bail finit pendant ou après le premier terme révisé, ou n'a pas de date de fin : l'annonce reste", () => {
    const annonce = { loyer: 700, aVenir: { loyer: 714, premierTerme: "2026-01-01", dernierTermeAvant: "2025-12-01" } };
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03", "2026-01-01")).toEqual(annonce);
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03", "2026-02-28")).toEqual(annonce);
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03", null)).toEqual(annonce);
    expect(loyerDuTermeEnCours(714, [revision], "2025-12-03")).toEqual(annonce);
  });

  it("la date de fin du bail est transmise par l'attestation de loyer, le dossier CAF, l'attestation du locataire et son espace", () => {
    expect(readFileSync("src/lib/documents/modeles/catalogue-bail.ts", "utf8"))
      .toContain("loyerDuTermeEnCours(ctx.bail.loyer_hc, revisions as unknown as RevisionDuLoyer[], aujourdhui, ctx.bail.date_fin)");
    expect(readFileSync("src/app/attestation-loyer/[orgId]/page.tsx", "utf8")).toMatch(/aujourdhui,\n\s*\/\/[^\n]*\n\s*bail\?\.date_fin,\n\s*\);/);
    expect(readFileSync("src/app/locataire/[orgId]/logement/page.tsx", "utf8")).toMatch(/aujourdhuiParis\(\),\n\s*\/\/[^\n]*\n\s*bail\.date_fin,\n\s*\);/);
  });
});

describe("constat 1 — l'indice de l'année précédente est exigé d'après l'année de bail (miroir de la base)", () => {
  it("preuve du relecteur : bail du 15/10/2023 sans révision, demande du 24/11/2025 (deuxième année de bail) — exigé, quel que soit le libellé du trimestre", () => {
    expect(indicePrecedentExige("2023-10-15", "2025-11-24", [])).toBe(true);
  });

  it("première année de bail, ou révision faite l'année de bail précédente : pas exigé", () => {
    expect(indicePrecedentExige("2023-10-15", "2024-11-24", [])).toBe(false);
    expect(indicePrecedentExige("2023-10-15", "2025-11-24", [{ date_effet: "2024-10-15" }])).toBe(false);
    // Révision de la première année demandée la veille de la deuxième date anniversaire : elle compte pour la première année.
    expect(indicePrecedentExige("2023-10-15", "2025-10-15", [{ date_effet: "2025-10-14" }])).toBe(false);
    expect(indicePrecedentExige("2023-10-15", "2023-12-01", [])).toBe(false); // avant la première date anniversaire
    expect(indicePrecedentExige(null, "2025-11-24", [])).toBe(false);
  });

  it("une révision plus ancienne ne suffit pas : c'est celle de l'année de bail précédente qui compte", () => {
    // Bail de 2021, révisé en 2022 seulement ; demande en 2025 (quatrième année) : l'année 3 n'a pas été révisée.
    expect(indicePrecedentExige("2021-10-15", "2025-11-24", [{ date_effet: "2022-10-15" }])).toBe(true);
    expect(indicePrecedentExige("2021-10-15", "2025-11-24", [{ date_effet: "2022-10-15" }, { date_effet: "2024-11-02" }])).toBe(false);
  });

  it("bail du 29 février : l'année de bail suit la date anniversaire repliée au 28, comme en base", () => {
    expect(indicePrecedentExige("2024-02-29", "2026-02-27", [])).toBe(false); // encore la première année
    expect(indicePrecedentExige("2024-02-29", "2026-02-28", [])).toBe(true);
    expect(indicePrecedentExige("2024-02-29", "2026-02-28", [{ date_effet: "2025-02-28" }])).toBe(false);
  });
});
