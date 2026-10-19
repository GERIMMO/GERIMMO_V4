import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({ fiche: { statut_plateforme: "valide" } }),
  chargerAgenda: async () => ({ lignes: [], erreur: false }),
  chargerDemandesRdv: async () => ({ lignes: [], erreur: false }),
}));
vi.mock("@/app/artisan/clients/resumes", () => ({ ChantiersDansAgenda: () => null }));
vi.mock("@/app/artisan/carte-mission", () => ({ CarteMission: () => null }));

import PageAgendaArtisan from "@/app/artisan/agenda/page";

const fuseauInitial = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  if (fuseauInitial === undefined) delete process.env.TZ;
  else process.env.TZ = fuseauInitial;
});

describe("les sept jours de l’agenda commencent aujourd’hui à Paris", () => {
  it.each([
    ["UTC", "2026-10-18T22:30:00Z", "lundi 19 octobre 2026", [19, 20, 21, 22, 23, 24, 25]],
    ["America/Los_Angeles", "2026-10-18T22:30:00Z", "lundi 19 octobre 2026", [19, 20, 21, 22, 23, 24, 25]],
    ["Pacific/Kiritimati", "2026-10-18T10:30:00Z", "dimanche 18 octobre 2026", [18, 19, 20, 21, 22, 23, 24]],
    ["UTC", "2026-03-28T23:30:00Z", "dimanche 29 mars 2026", [29, 30, 31, 1, 2, 3, 4]],
    ["UTC", "2026-10-24T22:30:00Z", "dimanche 25 octobre 2026", [25, 26, 27, 28, 29, 30, 31]],
    ["UTC", "2026-12-31T23:30:00Z", "vendredi 1 janvier 2027", [1, 2, 3, 4, 5, 6, 7]],
  ])("serveur %s, instant %s", async (fuseau, instant, titre, numeros) => {
    process.env.TZ = fuseau;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
    const html = renderToStaticMarkup(await PageAgendaArtisan());
    const semaine = html.match(/<ol[^>]+aria-label="Rendez-vous des sept prochains jours"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
    const cases = [...semaine.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(html).toContain(titre);
    expect(cases).toHaveLength(7);
    expect(cases.map((c) => Number(c.replace(/<[^>]+>/g, " ").match(/\b\d+\b/)?.[0]))).toEqual(numeros);
    expect(cases[0]).toContain("bg-[var(--marque-clair)]");
    expect(cases.slice(1).every((c) => !c.includes("bg-[var(--marque-clair)]"))).toBe(true);
  });
});
