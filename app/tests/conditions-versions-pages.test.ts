/**
 * Relecture adverse du socle (24/10/2026, I2) : une version archivée APRÈS sa date d'effet ne doit pas se présenter
 * comme le texte « en vigueur à compter du » cette date. La version 2026-09-30 sera archivée fin octobre : sous la même
 * version, la page a été corrigée entre-temps (médiateur, prestataires, identité lue en base). Les pages publiques le
 * disent : texte relevé tel jour, corrections possibles depuis la date d'effet. Le panneau de Santé le dit avant le clic.
 *
 * Sans base : la lecture des versions est remplacée.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VersionArchivee } from "../src/lib/conditions-versions";

const m = vi.hoisted(() => ({ versions: [] as (VersionArchivee & { texte_html: string })[] }));
vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("introuvable"); } }));
vi.mock("@/app/admin/sante/bouton-archiver-conditions", () => ({ BoutonArchiverConditions: () => null }));
vi.mock("@/lib/conditions-versions", async (importer) => {
  const vrai = await importer<typeof import("../src/lib/conditions-versions")>();
  return {
    ...vrai,
    listerVersionsArchivees: async () => m.versions,
    lireVersionArchivee: async (_db: unknown, document: string, version: string) =>
      m.versions.find((v) => v.document === document && v.version === version) ?? null,
  };
});
import PageVersionArchivee from "../src/app/conditions/versions/[document]/[version]/page";
import PageVersionsConditions from "../src/app/conditions/versions/page";
import { ArchiveConditions } from "../src/app/admin/sante/archive-conditions";
import { releveApresEffet } from "../src/lib/conditions-versions";

function version(publiee_le: string, date_effet = "2026-09-30"): VersionArchivee & { texte_html: string } {
  return {
    document: "conditions_clients",
    version: "2026-09-30",
    date_effet,
    nature: "substantielle",
    publiee_le,
    empreinte_sha256: "a".repeat(64),
    resume_modifications: "Essai gratuit porté à deux mois.",
    texte_html: "<h1>Conditions</h1><p>Texte.</p>",
  };
}

async function pageVersion(): Promise<string> {
  const params = Promise.resolve({ document: "conditions_clients", version: "2026-09-30" });
  return renderToStaticMarkup(await PageVersionArchivee({ params } as never));
}

beforeEach(() => {
  m.versions = [];
});

describe("I2 : relevé après la date d'effet", () => {
  it("releveApresEffet compare le jour de Paris du relevé à la date d'effet", () => {
    expect(releveApresEffet({ date_effet: "2026-09-30", publiee_le: "2026-09-30T21:30:00Z" })).toBeNull(); // 23 h 30 à Paris
    expect(releveApresEffet({ date_effet: "2026-09-30", publiee_le: "2026-09-30T22:30:00Z" })).toBe("2026-10-01"); // 0 h 30
    expect(releveApresEffet({ date_effet: "2026-09-30", publiee_le: "2026-10-25T09:00:00Z" })).toBe("2026-10-25");
    expect(releveApresEffet({ date_effet: "2026-11-01", publiee_le: "2026-10-25T09:00:00Z" })).toBeNull();
  });

  it("la page d'une version relevée après sa date d'effet le dit, avec les deux dates", async () => {
    m.versions = [version("2026-10-25T09:00:00Z")];
    const html = await pageVersion();
    expect(html).toContain("Archivée après sa date d’effet");
    expect(html).toContain("texte relevé le 25 octobre 2026");
    expect(html).toContain("des corrections ont pu intervenir entre le 30 septembre 2026 et cette date sous la même version");
  });

  it("une version relevée le jour de son effet, ou avant, ne porte pas la mention", async () => {
    m.versions = [version("2026-09-30T08:00:00Z")];
    expect(await pageVersion()).not.toContain("Archivée après sa date d’effet");
    m.versions = [version("2026-10-25T09:00:00Z", "2026-11-01")];
    expect(await pageVersion()).not.toContain("Archivée après sa date d’effet");
  });

  it("M1 : un texte rangé dont le balisage n'est pas admis ne s'affiche pas (l'empreinte reste lisible)", async () => {
    m.versions = [{ ...version("2026-09-30T08:00:00Z"), texte_html: '<h1>Conditions</h1><img src="x" onerror="alert(1)">' }];
    const html = await pageVersion();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("ne peut pas être affiché ici");
    expect(html).toContain("a".repeat(64));
    m.versions = [version("2026-09-30T08:00:00Z")];
    expect(await pageVersion()).toContain("<h1>Conditions</h1><p>Texte.</p>");
  });

  it("la liste des versions porte la même mention", async () => {
    m.versions = [version("2026-10-25T09:00:00Z")];
    const html = renderToStaticMarkup(await PageVersionsConditions());
    expect(html).toContain("Archivée après sa date d’effet : texte relevé le 25 octobre 2026");
  });

  it("Santé prévient avant le premier archivage d'une version déjà en vigueur", () => {
    // V1 (24/10/2026) : les conditions clients et celles de l'espace artisan sont en vigueur depuis le 24 octobre.
    const html = renderToStaticMarkup(ArchiveConditions({ versions: [], sansArchive: [], autorise: true, aujourdhui: "2026-10-25" }));
    expect(html).toContain("en vigueur depuis le 24 octobre 2026");
    expect(html.match(/en vigueur depuis le 24 octobre 2026/g)).toHaveLength(2);
    expect(html).toContain("relevé aujourd’hui");
    expect(html).toContain("à trancher par le dirigeant avant le premier archivage");
    // Le jour de l'effet, ou une fois archivées, rien à signaler.
    expect(renderToStaticMarkup(ArchiveConditions({ versions: [], sansArchive: [], autorise: true, aujourdhui: "2026-10-24" })))
      .not.toContain("à trancher par le dirigeant");
    const v1 = (document: "conditions_clients" | "conditions_artisans") => ({
      ...version("2026-10-25T09:00:00Z", "2026-10-24"),
      document,
      version: "2026-10-24",
    });
    expect(renderToStaticMarkup(ArchiveConditions({ versions: [v1("conditions_clients"), v1("conditions_artisans")], sansArchive: [], autorise: true, aujourdhui: "2026-10-26" })))
      .not.toContain("à trancher par le dirigeant");
    // L'archive de la version du 30 septembre ne vaut pas archive de la V1.
    expect(renderToStaticMarkup(ArchiveConditions({ versions: [version("2026-10-23T09:00:00Z")], sansArchive: [], autorise: true, aujourdhui: "2026-10-26" })))
      .toContain("à trancher par le dirigeant");
  });
});
