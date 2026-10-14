/**
 * Vérification finale du 14/10/2026 (VFL-05, VFL-06) : trois endroits calculaient « aujourd'hui » en jour UTC
 * (`new Date().toISOString().slice(0, 10)`) au lieu du jour de Paris :
 *  - la « date de bascule » proposée par défaut à la reprise des soldes ;
 *  - la date plancher du champ « date d'expiration » de l'attestation d'assurance du locataire ;
 *  - le refus, côté serveur, d'une attestation déjà expirée.
 * Entre minuit et 2 h à Paris (heure d'été), le jour UTC est celui de la veille : le formulaire proposait hier, et
 * une attestation expirée la veille était acceptée. `aujourdhuiParis()` (src/lib/ged.ts) est la seule source du jour.
 *
 * Le serveur est simulé en UTC, l'horloge à 01:47 à Paris le 14/10/2026 (23:47 UTC le 13/10).
 *
 * Le dernier bloc est une garde de source : aucun formulaire ni aucune action de `src/app` ne calcule le jour avec
 * `toISOString().slice(0, 10)`, sauf les usages légitimes listés (et justifiés) ci-dessous.
 */
process.env.TZ = "UTC";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ rpc: vi.fn(), televerse: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: (_action: unknown, initial: unknown) => [initial, () => {}, false] };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/actions/reprise-comptable", () => ({ reprendreSoldes: vi.fn() }));
vi.mock("@/app/actions/annonces", () => ({ creerAnnonce: vi.fn(), supprimerAnnonce: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "locataire-test" } } }) },
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: { role: "locataire" }, error: null });
      return q;
    },
    storage: { from: () => ({ upload: banc.televerse }) },
    rpc: banc.rpc,
  }),
}));

import { FormulaireReprise } from "@/app/agence/[orgId]/comptabilite/reprise/formulaire-reprise";
import { FormulaireAttestation } from "@/app/locataire/[orgId]/formulaire-attestation";
import { CarteAnnonces } from "@/app/agence/[orgId]/parc/[bienId]/carte-annonces";
import { deposerMonAttestation } from "@/app/actions/attestation-locataire";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T23:47:00.000Z"));
  banc.rpc.mockReset().mockResolvedValue({ error: null });
  banc.televerse.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());

/** La valeur de l'attribut d'un champ, repéré par son `name` ou son `id`. */
function attribut(html: string, repere: string, attribut: string): string | null {
  const element = new RegExp(`<input[^>]*${repere}[^>]*>`).exec(html)?.[0];
  if (!element) return null;
  return new RegExp(`\\s${attribut}="([^"]*)"`).exec(element)?.[1] ?? null;
}

describe("à 01:47 à Paris (23:47 UTC la veille), le jour proposé est celui de Paris", () => {
  it("VFL-05 : la date de bascule de la reprise des soldes est le 14/10/2026", () => {
    const html = renderToStaticMarkup(createElement(FormulaireReprise, { orgId: "org-test" }));
    expect(attribut(html, 'name="date_bascule"', "value")).toBe("2026-10-14");
  });

  it("VFL-06 : la date plancher de l'attestation d'assurance est le 14/10/2026", () => {
    const html = renderToStaticMarkup(createElement(FormulaireAttestation, { orgId: "org-test", renouvellement: false }));
    expect(attribut(html, 'name="expire_le"', "min")).toBe("2026-10-14");
  });

  it("la visibilité par défaut d'une annonce est une semaine après le jour de Paris : le 21/10/2026", () => {
    const html = renderToStaticMarkup(createElement(CarteAnnonces, { orgId: "org-test", bienId: "bien-test", annonces: [] }));
    expect(attribut(html, 'name="visible_jusquau"', "value")).toBe("2026-10-21");
  });
});

describe("VFL-06 : le contrôle serveur de l'attestation compte le jour de Paris", () => {
  function depot(expire: string) {
    const f = new FormData();
    f.set("fichier", new File(["pas un vrai PDF"], "attestation.pdf", { type: "application/pdf" }));
    f.set("expire_le", expire);
    return deposerMonAttestation("org-test", {}, f);
  }

  it("refuse à 01:47 à Paris une attestation expirée la veille (13/10/2026), que le jour UTC aurait laissée passer", async () => {
    const r = await depot("2026-10-13");
    expect(r.erreur).toMatch(/déjà expirée/);
    expect(banc.televerse).not.toHaveBeenCalled();
  });

  it("accepte, à la même heure, une attestation qui expire aujourd'hui à Paris (14/10/2026) : elle passe le contrôle de date", async () => {
    const r = await depot("2026-10-14");
    expect(r.erreur ?? "").not.toMatch(/déjà expirée/);
  });

  it("refuse toujours une date très ancienne, et un champ vide est réclamé", async () => {
    expect((await depot("2020-01-01")).erreur).toMatch(/déjà expirée/);
    expect((await depot("")).erreur).toMatch(/date d'expiration/);
  });
});

// --- Garde de source -------------------------------------------------------------------------------------------

const RACINE = resolve(__dirname, "..");
const DOSSIER_APP = join(RACINE, "src", "app");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

/** Le jour calculé depuis un instant : `toISOString().slice(0, 10)`, ou ses variantes (substring, split("T")[0]). */
const JOUR_UTC = /toISOString\(\)\s*\.\s*(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)|toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/;

/** Un formulaire ou une action : par le nom, par le dossier des actions, ou par ce que le fichier fait. */
function estFormulaireOuAction(chemin: string, source: string): boolean {
  const rel = relative(DOSSIER_APP, chemin).split("\\").join("/");
  const nom = rel.split("/").pop() ?? "";
  return (
    /^formulaires?[-.]/.test(nom) ||
    rel.startsWith("actions/") ||
    /^actions?[-.]|\/actions?[-.a-z]*\.tsx?$/.test(`/${rel}`) ||
    /^\s*["']use server["']/m.test(source) ||
    /<form[\s>]|useActionState|useActionStateProtegee|useActionFormulaire/.test(source)
  );
}

/**
 * Les seuls usages admis : un aller-retour de validation d'une date saisie, ou une échéance lointaine où un jour
 * d'écart n'a aucune conséquence. Aucun ne calcule « aujourd'hui ». `contient` doit figurer sur la ligne.
 */
const EXCEPTIONS: { fichier: string; contient: string; motif: string }[] = [
  {
    fichier: "src/app/actions/mandats.ts",
    contient: "new Date(value).toISOString().slice(0,10) === value",
    motif: "valide une date saisie par aller-retour (31/02 devient 03/03 et ne revient pas) : aucun « aujourd'hui » en jeu",
  },
  {
    fichier: "src/app/admin/brief/actions.ts",
    contient: "reexamen.toISOString().slice(0, 10)",
    motif: "date de réexamen d'une idée écartée, six mois plus tard : un jour d'écart n'est comparé à rien",
  },
];

describe("aucun formulaire ni aucune action de src/app ne calcule « aujourd'hui » en jour UTC", () => {
  const candidats = fichiers(DOSSIER_APP)
    .map((chemin) => ({ chemin, rel: relative(RACINE, chemin).split("\\").join("/"), source: readFileSync(chemin, "utf8") }))
    .filter(({ chemin, source }) => estFormulaireOuAction(chemin, source));

  it("la recherche voit bien les formulaires et les actions (sinon la garde ne garde rien)", () => {
    const noms = candidats.map((c) => c.rel);
    expect(noms).toContain("src/app/agence/[orgId]/comptabilite/reprise/formulaire-reprise.tsx");
    expect(noms).toContain("src/app/locataire/[orgId]/formulaire-attestation.tsx");
    expect(noms).toContain("src/app/actions/attestation-locataire.ts");
    expect(noms).toContain("src/app/admin/brief/actions.ts");
    expect(candidats.length).toBeGreaterThan(60);
  });

  const occurrences = candidats.flatMap(({ rel, source }) =>
    source.split("\n").flatMap((ligne, i) => (JOUR_UTC.test(ligne) ? [{ rel, ligne: ligne.trim(), numero: i + 1 }] : []))
  );
  const admise = (o: { rel: string; ligne: string }) =>
    EXCEPTIONS.some((e) => e.fichier === o.rel && o.ligne.includes(e.contient));

  it("hors exceptions justifiées, aucune ligne ne l'utilise : utilisez aujourdhuiParis() (src/lib/ged.ts)", () => {
    const fautes = occurrences.filter((o) => !admise(o)).map((o) => `${o.rel}:${o.numero}  ${o.ligne.slice(0, 120)}`);
    expect(fautes).toEqual([]);
  });

  it("la liste d'exceptions reste courte, et chaque exception désigne encore une ligne réelle", () => {
    expect(EXCEPTIONS.length).toBeLessThanOrEqual(3);
    for (const e of EXCEPTIONS) {
      expect(occurrences.some((o) => o.rel === e.fichier && o.ligne.includes(e.contient)), `exception périmée : ${e.fichier}`).toBe(true);
      expect(e.motif.length).toBeGreaterThan(20);
    }
  });

  it("la garde reconnaît les variantes d'écriture", () => {
    for (const ecriture of [
      "new Date().toISOString().slice(0, 10)",
      "new Date().toISOString().slice(0,10)",
      "d.toISOString().substring(0, 10)",
      'new Date().toISOString().split("T")[0]',
    ]) expect(JOUR_UTC.test(ecriture), ecriture).toBe(true);
    expect(JOUR_UTC.test("new Date().toISOString()")).toBe(false);
    expect(JOUR_UTC.test("aujourdhuiParis()")).toBe(false);
  });
});
