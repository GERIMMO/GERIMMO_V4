import { afterEach, describe, expect, it, vi } from "vitest";
import { bilanDiagnostics, presentationDiagnostic } from "../src/lib/presentation-diagnostics";
const document = { type: "dpe", document_id: "pdf", date_expiration: "2028-10-24" };
afterEach(() => vi.useRealTimers());
describe("Un état documentaire compréhensible", () => {
  it("un rapport sans fichier ne peut jamais être présenté comme à jour", () => {
    expect(presentationDiagnostic("dpe", { ...document, document_id: null }).etat).toBe("a_joindre");
  });
  it("sépare une obligation conditionnelle d'un document réellement manquant", () => {
    for (const type of ["gaz", "electricite"]) expect(presentationDiagnostic(type, undefined)).toMatchObject({ etat: "a_confirmer", libelle: "À préciser" });
    expect(presentationDiagnostic("dpe", undefined).etat).toBe("a_ajouter");
    expect(presentationDiagnostic("termites", undefined)).toMatchObject({ etat: "facultatif", libelle: "Facultatif" });
  });
  it("demande le rapport nécessaire et écarte le gaz explicitement absent", () => {
    expect(presentationDiagnostic("electricite", undefined, true, { type: "electricite", situation: "plus_15_ans", date_installation: null }).etat).toBe("a_ajouter");
    expect(presentationDiagnostic("gaz", undefined, true, { type: "gaz", situation: "absente", date_installation: null })).toMatchObject({ etat: "non_concerne", libelle: "Non concerné", ton: "ok" });
  });
  it("un rapport existant conserve son état malgré une déclaration non concernée", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const qualification = { type: "gaz", situation: "absente", date_installation: null } as const;
    expect(presentationDiagnostic("gaz", { ...document, type: "gaz" }, true, qualification).etat).toBe("valide");
    expect(presentationDiagnostic("gaz", { ...document, type: "gaz", date_expiration: "2026-10-20" }, true, qualification).etat).toBe("expire");
    expect(presentationDiagnostic("gaz", { ...document, type: "gaz", document_id: null }, true, qualification).etat).toBe("a_joindre");
    expect(presentationDiagnostic("termites", { ...document, type: "termites", date_expiration: "2026-10-20" }).etat).toBe("expire");
  });
  it("une absence d'échéance ne vaut pas une validité illimitée", () => {
    expect(presentationDiagnostic("plomb", { ...document, type:"plomb", date_expiration: null })).toMatchObject({ etat:"disponible", libelle:"Validité à vérifier", ton:"neutre" });
  });
  it("distingue document expiré, échéance proche et rapport à jour", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    expect(presentationDiagnostic("dpe", document).etat).toBe("valide");
    expect(presentationDiagnostic("dpe", {...document, date_expiration:"2026-10-20"}).etat).toBe("expire");
    expect(presentationDiagnostic("dpe", {...document, date_expiration:"2026-11-20"}).etat).toBe("expire_bientot");
  });
  it("le bilan déduplique les types et sépare les compléments facultatifs des actions", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const bilan = bilanDiagnostics(["dpe", "dpe", "erp", "termites", "plomb", "gaz"], [document,
      {...document, type:"erp",date_expiration:"2026-10-20"}, {...document,type:"plomb",date_expiration:null},
      {...document,type:"gaz",document_id:null}]);
    expect(bilan).toMatchObject({ disponibles:3, aJour:1, aAjouter:1, aRenouveler:1, aVerifier:1, aConfirmer:0, nonConcernes:0, facultatifs:1 });
    expect(bilan.aJour + bilan.aAjouter + bilan.aRenouveler + bilan.aVerifier + bilan.nonConcernes + bilan.facultatifs).toBe(bilan.lignes.length);
  });
  it("une installation récente et un gaz absent ne gonflent aucun compteur de documents", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const bilan = bilanDiagnostics(["electricite", "gaz", "termites"], [], [
      { type: "electricite", situation: "date_connue", date_installation: "2020-01-01" },
      { type: "gaz", situation: "absente", date_installation: null },
    ]);
    expect(bilan).toMatchObject({ disponibles:0, aJour:0, aAjouter:0, aRenouveler:0, aVerifier:0, aConfirmer:0, nonConcernes:2, facultatifs:1 });
  });
  it("les qualifications sont appliquées à leur type même si leur ordre diffère", () => {
    const bilan = bilanDiagnostics(["electricite", "gaz"], [], [
      { type: "gaz", situation: "absente", date_installation: null },
      { type: "electricite", situation: "plus_15_ans", date_installation: null },
    ]);
    expect(bilan.lignes.map(ligne => [ligne.type, ligne.etat])).toEqual([["electricite", "a_ajouter"], ["gaz", "non_concerne"]]);
  });
  it("une année charnière reste à préciser, sans créer un faux manque ni une carte non concernée", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const qualification = { type: "electricite", situation: "annee_connue", date_installation: null, annee_installation: 2011 } as const;
    expect(presentationDiagnostic("electricite", undefined, true, qualification)).toMatchObject({ etat: "a_confirmer", libelle: "À préciser" });
    expect(bilanDiagnostics(["electricite"], [], [qualification])).toMatchObject({ aConfirmer: 1, aVerifier: 1, aAjouter: 0, nonConcernes: 0 });
  });
  it("les années connues alimentent les compteurs sans masquer un rapport déjà déposé", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    const gazRecent = { type: "gaz", situation: "annee_connue", date_installation: null, annee_installation: 2020 } as const;
    const electriciteAncienne = { type: "electricite", situation: "annee_connue", date_installation: null, annee_installation: 2000 } as const;
    expect(bilanDiagnostics(["gaz", "electricite"], [], [gazRecent, electriciteAncienne])).toMatchObject({ aAjouter: 1, nonConcernes: 1, aVerifier: 0 });
    expect(presentationDiagnostic("gaz", { ...document, type: "gaz", date_expiration: "2026-10-20" }, true, gazRecent).etat).toBe("expire");
  });
});
