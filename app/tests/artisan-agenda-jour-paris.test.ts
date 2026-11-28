import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const agenda = vi.hoisted(() => vi.fn(async (): Promise<{ lignes: Record<string, string | number>[]; erreur: boolean }> => ({ lignes: [], erreur: false })));

vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({ fiche: { statut_plateforme: "valide" } }),
  chargerAgenda: agenda,
  chargerCreneauxMission: async () => ({
    erreur: false,
    lignes: [{ creneau_id: "date-proposee", statut: "propose", propose_par: "artisan", debut: "2026-11-21T09:00:00Z", fin: "2026-11-21T11:00:00Z" }],
  }),
  chargerDemandesRdv: async () => ({ lignes: [], erreur: false }),
  // Audit P1-05 : les discussions de mission portant un message à lire (aucune dans ces scénarios).
  chargerEchangesNonLus: async () => ({ lignes: [], erreur: false }),
}));
vi.mock("@/app/artisan/clients/resumes", () => ({ ChantiersDansAgenda: () => null }));
vi.mock("@/app/artisan/carte-mission", () => ({ CarteMission: ({ligne}: {ligne: {intervention_id:string}}) => ligne.intervention_id }));

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
    const html = renderToStaticMarkup(await PageAgendaArtisan({params: Promise.resolve({}), searchParams: Promise.resolve({})}));
    const semaine = html.match(/<ol[^>]+aria-label="Rendez-vous des sept prochains jours"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
    const cases = [...semaine.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(html).toContain(titre);
    expect(html).toContain("Mes 7 prochains jours");
    expect(cases).toHaveLength(7);
    expect(cases.map((c) => Number(c.replace(/<[^>]+>/g, " ").match(/\b\d+\b/)?.[0]))).toEqual(numeros);
    expect(cases[0]).toContain("bg-[var(--marque-clair)]");
    expect(cases.slice(1).every((c) => !c.includes("bg-[var(--marque-clair)]"))).toBe(true);
  });
});

it("retire un travail déjà terminé du nombre de rendez-vous à venir et préserve son historique", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
  const debut_prevu = "2026-11-21T08:00:00Z";
  agenda.mockResolvedValueOnce({ erreur: false, lignes: [
    { debut_prevu, statut: "planifiee", intervention_id: "mission-attendue" },
    { debut_prevu, statut: "terminee", intervention_id: "mission-deja-terminee" },
  ] });
  const html = renderToStaticMarkup(await PageAgendaArtisan({params: Promise.resolve({}), searchParams: Promise.resolve({})}));
  expect(html).toContain('aria-label="1 rendez-vous"');
  expect(html).not.toContain('aria-label="2 rendez-vous"');
  const [calendrier, historique] = html.split("Historique des rendez-vous");
  expect(calendrier).toContain("mission-attendue");
  expect(calendrier).not.toContain("mission-deja-terminee");
  expect(historique).toContain("mission-deja-terminee");
});

it("lit le créneau proposé dans sa journée et permet de filtrer les missions sans rendez-vous", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
  const lignes = [
    { statut: "planifiee", debut_prevu: "2026-11-21T08:00:00Z", intervention_id: "mission-fixee" },
    { statut: "acceptee", debut_prevu: "", creneaux_en_attente: 1, intervention_id: "mission-proposee" },
  ];
  agenda.mockResolvedValueOnce({ erreur: false, lignes });
  const calendrier = renderToStaticMarkup(await PageAgendaArtisan({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }));
  expect(calendrier.match(/<section[^>]+id="jour-2026-11-21"[^>]*>[\s\S]*?<\/section>/)?.[0]).toContain("proposé · à garder libre");
  agenda.mockResolvedValueOnce({ erreur: false, lignes });
  const organisation = renderToStaticMarkup(await PageAgendaArtisan({ params: Promise.resolve({}), searchParams: Promise.resolve({ vue: "a-organiser" }) }));
  expect(organisation).toContain("mission-proposee");
  expect(organisation).not.toContain("mission-fixee");
});
