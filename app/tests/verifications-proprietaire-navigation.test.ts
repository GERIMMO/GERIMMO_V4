import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionDuJour, LectureActionsDuJour } from "@/lib/actions-du-jour";
import type { RappelLoyer } from "@/lib/rappels-loyers";

const m = vi.hoisted(() => ({ acces: vi.fn(), charger: vi.fn(), loyers: vi.fn(), rappels: vi.fn(), liste: vi.fn() }));
vi.mock("@/lib/espace", () => ({ verifierAccesEspace: m.acces }));
vi.mock("@/lib/actions-du-jour", () => ({ chargerActionsDuJour: m.charger }));
vi.mock("@/lib/rappels-loyers", async importer => ({ ...await importer<typeof import("@/lib/rappels-loyers")>(), lireRappelsLoyers: m.loyers }));
vi.mock("@/lib/ged", async importer => ({ ...await importer<typeof import("@/lib/ged")>(), aujourdhuiParis: () => "2026-10-26" }));
vi.mock("@/lib/portefeuille", () => ({ lotsDuPortefeuille: async () => null }));
vi.mock("@/app/agence/[orgId]/alertes/formulaire-alerte", () => ({ FormulaireAlerte: () => null }));
vi.mock("@/app/agence/[orgId]/alertes/liste-alertes", () => ({
  ListeAlertes: (props: { alertes: { id: string; titre: string }[] }) => {
    m.liste(props);
    return createElement("div", { "data-alertes": true }, props.alertes.map(alerte => createElement("p", { key: alerte.id }, alerte.titre)));
  },
}));
vi.mock("@/components/rappels-loyers", () => ({
  RappelsLoyers: (props: object) => { m.rappels(props); return createElement("div", { "data-rappels": true }); },
}));

import PageAlertes from "@/app/agence/[orgId]/alertes/page";
import { chargerVerificationsProprietaire } from "@/lib/lecture-verifications-proprietaire";

const org = "11111111-2222-4333-8444-555555555555";
const rappel = (patch: Partial<RappelLoyer> = {}): RappelLoyer => ({
  appel_id: "octobre", bail_id: "bail", lot_nom: "Appartement", locataire: "Camille",
  periode: "2026-10-01", date_echeance: "2026-10-26", montant_du: 800, montant_couvert: 0,
  non_recu_signale_le: null, ...patch,
});
const impaye: ActionDuJour = {
  cle: "impaye-bail", source: "bail", nature: "Bail", criticite: "critique", titre: "Impayé TEST",
  detail: null, echeance: null, href: `/espace/${org}/baux/bail#loyers`,
};
const alerteImpayee = {
  id: "alerte-impaye", type: "loyer_impaye", titre: "Alerte impayée TEST", criticite: "critique",
  details: { bail_id: "bail" }, assigned_all: true, assignee_account_id: null,
};
function plan(actions: ActionDuJour[] = []): LectureActionsDuJour {
  return {
    plan: {
      surLesBaux: actions.filter((a): a is Extract<ActionDuJour, { source: "bail" }> => a.source === "bail"),
      enRetard: actions.filter(a => a.source !== "bail"), aVenir: [], total: actions.length,
      retards: actions.length, critiques: actions.filter(a => a.criticite === "critique").length,
    },
    attendues: [], erreurs: { baux: false, alertes: false, rapports: false },
  };
}
function client(ouvertes: object[] = []) {
  const requete = (table: string) => {
    const filtres: Record<string, unknown> = {};
    const q: unknown = new Proxy({}, {
      get(_cible, methode) {
        if (methode === "then") return (resolve: (valeur: unknown) => unknown) => Promise.resolve({
          data: table === "alerts" && filtres.statut === "ouverte" ? ouvertes : [], error: null,
        }).then(resolve);
        if (methode === "eq") return (champ: string, valeur: unknown) => { filtres[champ] = valeur; return q; };
        return () => q;
      },
    });
    return q;
  };
  return { from: requete, rpc: requete };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.charger.mockResolvedValue(plan());
  m.loyers.mockResolvedValue({ lignes: [], error: null });
});
async function rendre({ proprietaire = true, lectureSeule = false, ouvertes = [] as object[] } = {}) {
  const db = client(ouvertes);
  m.acces.mockResolvedValue({
    supabase: db, user: { id: "compte" }, role: proprietaire ? "proprietaire_direct" : "admin_agence",
    organisation: { type: proprietaire ? "proprietaire_direct" : "agence" }, estProprietaire: proprietaire,
    traverseeLectureSeule: lectureSeule,
  });
  return renderToStaticMarkup(await PageAlertes({ params: Promise.resolve({ orgId: org }), searchParams: Promise.resolve({}) } as never));
}

describe("synthèse commune de l’accueil, de la navigation et de À faire", () => {
  it("compte le loyer dès aujourd’hui et conserve le contexte d’accès", async () => {
    m.loyers.mockResolvedValue({ lignes: [rappel()], error: null });
    const db = client();
    const portefeuille = new Set(["lot"]);
    const resultat = await chargerVerificationsProprietaire(db as never, org, { userId: "compte", portefeuille });
    expect(resultat.verifications.total).toBe(1);
    expect(resultat.verifications.rappels.dus[0].appel_id).toBe("octobre");
    expect(m.charger).toHaveBeenCalledWith(db, org, { userId: "compte", portefeuille, racine: "/espace" });
    expect(m.loyers).toHaveBeenCalledWith(db, org);
  });

  it("présente les échéances successives d’un même bail une à une et compte chacune, comme la section des loyers", async () => {
    const lignes = [rappel({ appel_id: "septembre", periode: "2026-09-01", date_echeance: "2026-09-26" }), rappel()];
    const db = client();
    const lire = () => chargerVerificationsProprietaire(db as never, org, { userId: "compte", portefeuille: null });
    m.loyers.mockResolvedValue({ lignes, error: null });
    // Une seule ligne présentée, mais deux confirmations à faire : l'en-tête « N à traiter » compte les échéances, comme
    // « N à confirmer » et la carte de l'accueil (audit du 27/10, LAT-03 : plus d'unités mélangées sur un même écran).
    const premier = (await lire()).verifications;
    expect(premier.rappels.dus).toHaveLength(1);
    expect(premier.total).toBe(2);
    m.loyers.mockResolvedValue({ lignes: [{ ...lignes[0], montant_couvert: 800 }, { ...lignes[1], montant_couvert: 200 }], error: null });
    const suivant = (await lire()).verifications;
    expect(suivant.total).toBe(1);
    expect(suivant.rappels.dus[0]).toMatchObject({ appel_id: "octobre", montant_couvert: 200 });
    m.loyers.mockResolvedValue({ lignes: lignes.map(ligne => ({ ...ligne, montant_couvert: 800 })), error: null });
    expect((await lire()).verifications.total).toBe(0);
  });
});

describe("page À faire du propriétaire", () => {
  it("annonce le loyer du jour et expose le composant de réception en mode page", async () => {
    m.loyers.mockResolvedValue({ lignes: [rappel()], error: null });
    expect(await rendre()).toContain("1 à traiter");
    expect(m.rappels).toHaveBeenCalledWith(expect.objectContaining({ orgId: org, lectureSeule: false, dansFenetre: false }));
    expect(m.liste).toHaveBeenCalledWith(expect.objectContaining({ actionsAuDessus: 1, alertes: [] }));
  });

  it("retire les deux impayés redondants tout en conservant les autres demandes", async () => {
    m.charger.mockResolvedValue(plan([impaye, { ...impaye, cle: "edl-bail", titre: "État des lieux TEST", criticite: "normale" }]));
    m.loyers.mockResolvedValue({ lignes: [rappel()], error: null });
    const html = await rendre({ ouvertes: [alerteImpayee] });
    expect(html).toContain("2 à traiter");
    expect(html).toContain("État des lieux TEST");
    expect(html).not.toContain("Impayé TEST");
    expect(html).not.toContain("Alerte impayée TEST");
    expect(m.liste).toHaveBeenCalledWith(expect.objectContaining({ actionsAuDessus: 2, alertes: [] }));
  });

  it.each([
    { date_echeance: "2026-10-27" }, { montant_couvert: 800 },
  ])("ne compte pas un loyer futur ou reçu : %o", async patch => {
    m.loyers.mockResolvedValue({ lignes: [rappel(patch)], error: null });
    expect(await rendre()).toContain("rien à traiter");
    expect(m.liste).toHaveBeenCalledWith(expect.objectContaining({ actionsAuDessus: 0 }));
  });

  it("conserve les impayés et signale la liste incomplète si les loyers ne sont pas vérifiables", async () => {
    m.charger.mockResolvedValue(plan([impaye]));
    m.loyers.mockResolvedValue({ lignes: [], error: { message: "indisponible" } });
    const html = await rendre({ ouvertes: [alerteImpayee] });
    expect(html).toContain("liste indisponible");
    expect(html).toContain("Impayé TEST");
    expect(html).toContain("Alerte impayée TEST");
    expect(html).not.toContain("rien à traiter");
    expect(m.liste).toHaveBeenCalledWith(expect.objectContaining({ listeIncomplete: true }));
  });

  it.each([
    { proprietaire: false, lectureSeule: false },
    { proprietaire: true, lectureSeule: true },
  ])("préserve les accès agence et consultation : %o", async contexte => {
    m.charger.mockResolvedValue(plan([impaye]));
    const html = await rendre(contexte);
    expect(html).toContain("1 à traiter");
    expect(m.loyers).not.toHaveBeenCalled();
    expect(m.rappels).not.toHaveBeenCalled();
    expect(m.liste).toHaveBeenCalledWith(expect.objectContaining({ lectureSeule: contexte.lectureSeule }));
  });
});
