/**
 * Phase 3, lot 60 — défauts d'écran de l'espace artisan (relecture des captures de la passe 1).
 *
 * Ce fichier tient ce qui se décide sans navigateur : les entrées du menu, la rubrique allumée, la page de panne qui
 * vérifie la lecture, les dates à garder libres, les pastilles des clients externes. Ce qui se voit à l'écran (onglets à
 * 390 px, fiche de mission, compte rendu, agenda) est tenu par e2e/lot60-espace-artisan.spec.ts.
 */
process.env.TZ = "UTC";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({ chemin: "/artisan", lectureEnEchec: false, redirections: [] as string[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => etat.chemin,
  useRouter: () => ({ push() {}, refresh() {} }),
  redirect: (vers: string) => { etat.redirections.push(vers); throw new Error(`redirect:${vers}`); },
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  chargerFicheArtisan: async () => ({ user: { id: "u1" }, fiche: etat.lectureEnEchec ? null : { artisan_id: "a1" }, erreur: etat.lectureEnEchec }),
}));

import { NavArtisan, entreeActive, entreesMenuArtisan } from "@/components/nav-artisan";
import PagePanneArtisan from "@/app/artisan/panne/page";
import { datesAGarder, joursAGarder } from "@/app/artisan/agenda/dates-a-garder";
import { CarteMission } from "@/app/artisan/carte-mission";
import { NavigationPrivee } from "@/app/artisan/clients/elements";
import type { CreneauMission, LigneAgenda } from "@/app/artisan/acces";

beforeEach(() => { etat.chemin = "/artisan"; etat.lectureEnEchec = false; etat.redirections = []; });

/** Les liens du menu latéral qui portent aria-current="page", par leur texte. */
function allumes(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

describe("E001, E003, E008, E121 — le menu du téléphone", () => {
  it("« Aide en cas de problème » mène à la page d'aide, plus à la page de panne", () => {
    const aide = entreesMenuArtisan({ clientsExternes: true, piecesAAJour: true }).find((e) => e.libelle === "Aide en cas de problème");
    expect(aide?.href.startsWith("/assistance?")).toBe(true);
    expect(aide?.href).toContain("retour=%2Fartisan");
    expect(entreesMenuArtisan({ clientsExternes: true, piecesAAJour: true }).some((e) => e.href.startsWith("/artisan/panne"))).toBe(false);
  });

  it("le point du bouton « Menu » se retrouve sur « Mes attestations », et seulement là", () => {
    const aRenouveler = entreesMenuArtisan({ clientsExternes: true, piecesAAJour: false });
    expect(aRenouveler.filter((e) => e.point).map((e) => e.libelle)).toEqual(["Mes attestations"]);
    expect(entreesMenuArtisan({ clientsExternes: true, piecesAAJour: true }).some((e) => e.point)).toBe(false);
  });

  it("la page /artisan/entreprise s'y appelle « Ma fiche entreprise », comme dans le menu latéral", () => {
    expect(entreesMenuArtisan({ clientsExternes: false, piecesAAJour: true }).find((e) => e.href === "/artisan/entreprise")?.libelle).toBe("Ma fiche entreprise");
    etat.chemin = "/artisan/entreprise";
    const bureau = renderToStaticMarkup(createElement(NavArtisan, { presentation: "bureau", clientsExternes: true }));
    expect(allumes(bureau)).toEqual(["Ma fiche entreprise"]);
  });
});

describe("E007, E124 — « Nouveau chantier et devis » appartient aux clients externes", () => {
  const devis = { href: "/artisan/devis", sauf: ["/artisan/devis/nouveau"] };

  it("l'onglet « Devis » reste allumé sur les demandes reçues, pas sur le nouveau chantier", () => {
    expect(entreeActive("/artisan/devis", devis)).toBe(true);
    expect(entreeActive("/artisan/devis/95775939-8bb7-4a14-8502-e1cfff7a7edc", devis)).toBe(true);
    expect(entreeActive("/artisan/devis/nouveau", devis)).toBe(false);
  });

  it("menu latéral : seule « Clients externes » est allumée sur /artisan/devis/nouveau ; « Demandes de devis » sur une demande", () => {
    etat.chemin = "/artisan/devis/nouveau";
    expect(allumes(renderToStaticMarkup(createElement(NavArtisan, { presentation: "bureau", clientsExternes: true })))).toEqual(["Clients externes"]);
    etat.chemin = "/artisan/chantiers/c1";
    expect(allumes(renderToStaticMarkup(createElement(NavArtisan, { presentation: "bureau", clientsExternes: true })))).toEqual(["Clients externes"]);
    etat.chemin = "/artisan/devis/95775939-8bb7-4a14-8502-e1cfff7a7edc";
    expect(allumes(renderToStaticMarkup(createElement(NavArtisan, { presentation: "bureau", clientsExternes: true, devisAChiffrer: 1 })))).toEqual(["Demandes de devis 1 en attente"]);
  });

  it("barre du téléphone : aucun onglet allumé sur /artisan/devis/nouveau ; le menu ouvert marque « Clients externes »", () => {
    etat.chemin = "/artisan/devis/nouveau";
    expect(allumes(renderToStaticMarkup(createElement(NavArtisan, { clientsExternes: true, devisAChiffrer: 1 })))).toEqual([]);
    const menu = entreesMenuArtisan({ clientsExternes: true, piecesAAJour: true });
    expect(menu.filter((e) => entreeActive("/artisan/devis/nouveau", e)).map((e) => e.libelle)).toEqual(["Clients externes"]);
    etat.chemin = "/artisan/devis";
    expect(allumes(renderToStaticMarkup(createElement(NavArtisan, { clientsExternes: true })))).toEqual(["Devis"]);
  });
});

describe("E001, E122 — la page de panne vérifie la lecture avant de l'annoncer", () => {
  it("la fiche se lit : pas de message d'échec, retour à l'espace", async () => {
    await expect(PagePanneArtisan()).rejects.toThrow("redirect:/artisan");
    expect(etat.redirections).toEqual(["/artisan"]);
  });

  it("la lecture échoue encore : le message, l'aide et « Réessayer »", async () => {
    etat.lectureEnEchec = true;
    const page = renderToStaticMarkup(await PagePanneArtisan());
    expect(etat.redirections).toEqual([]);
    expect(page).toContain("Lecture momentanément impossible");
    expect(page).toContain("signalez-le à Gerimmo");
    expect(page).toContain(">Réessayer</a>");
  });
});

describe("E006, E116 — les dates proposées au locataire, à garder libres", () => {
  const creneau = (debut: string, par: CreneauMission["propose_par"] = "artisan", statut: CreneauMission["statut"] = "propose"): CreneauMission =>
    ({ creneau_id: debut + par, propose_par: par, tour: 1, debut, fin: debut.replace("T08", "T10"), statut });

  it("seules comptent les dates proposées par l'artisan et encore en attente, dans l'ordre", () => {
    const lues = [creneau("2026-11-27T08:00:00Z"), creneau("2026-11-26T08:00:00Z"), creneau("2026-11-28T08:00:00Z", "locataire"), creneau("2026-11-29T08:00:00Z", "artisan", "retenu")];
    expect(datesAGarder(lues).map((c) => c.debut)).toEqual(["2026-11-26T08:00:00Z", "2026-11-27T08:00:00Z"]);
  });

  it("par jour de Paris, toutes missions confondues (23 h 30 UTC tombe le lendemain à Paris)", () => {
    const jours = joursAGarder([[creneau("2026-11-26T08:00:00Z"), creneau("2026-11-27T08:00:00Z")], [creneau("2026-11-26T13:00:00Z"), creneau("2026-11-27T23:30:00Z")]]);
    expect([...jours]).toEqual([["2026-11-26", 2], ["2026-11-27", 1], ["2026-11-28", 1]]);
  });

  it("la carte de l'agenda écrit les dates, plus seulement leur nombre", () => {
    const ligne = { intervention_id: "i1", organization_id: "o1", agence_nom: "Agence TEST", incident_numero: "INC-2026-0001", statut: "acceptee", debut_prevu: null, fin_prevue: null, categorie: "plomberie_canalisation", urgence: "normale", adresse: "1 rue des Tests", code_postal: "75012", ville: "Paris", lot_nom: null, etage: null, creneaux_en_attente: 2, dates_locataire_en_attente: 0 } as unknown as LigneAgenda;
    const avec = renderToStaticMarkup(createElement(CarteMission, { ligne, aFaire: "2 dates au choix du locataire", datesAGarder: ["jeu. 26 nov. · 09:00 – 11:00", "ven. 27 nov. · 09:00 – 11:00"] }));
    expect(avec).toContain("À garder libres jusqu&#x27;à sa réponse");
    expect(avec).toContain("<li>jeu. 26 nov. · 09:00 – 11:00</li><li>ven. 27 nov. · 09:00 – 11:00</li>");
    const sans = renderToStaticMarkup(createElement(CarteMission, { ligne, aFaire: "2 dates au choix du locataire" }));
    expect(sans).not.toContain("data-dates-a-garder");
  });
});

describe("E011, E012, E123, E128 — les pastilles des clients externes", () => {
  const pastilles = (html: string) => [...html.matchAll(/<a\b[^>]*>[^<]*<\/a>/g)].map((m) => m[0]);

  it("la pastille de la page affichée porte aria-current ; les autres non", () => {
    const clients = pastilles(renderToStaticMarkup(createElement(NavigationPrivee, { enCours: "/artisan/clients" })));
    expect(clients.filter((l) => l.includes('aria-current="page"')).map((l) => l.replace(/<[^>]+>/g, ""))).toEqual(["Clients externes"]);
    const nouveau = pastilles(renderToStaticMarkup(createElement(NavigationPrivee, { enCours: "/artisan/devis/nouveau" })));
    expect(nouveau.filter((l) => l.includes('aria-current="page"')).map((l) => l.replace(/<[^>]+>/g, ""))).toEqual(["Nouveau chantier et devis"]);
    // Sur une fiche (client, chantier, facture), aucune pastille ne désigne la page affichée.
    expect(renderToStaticMarkup(createElement(NavigationPrivee))).not.toContain("aria-current");
  });

  it("« Agenda » et « Facturation » n'y répètent plus la navigation ; l'export dit le fichier", () => {
    const textes = pastilles(renderToStaticMarkup(createElement(NavigationPrivee))).map((l) => l.replace(/<[^>]+>/g, ""));
    expect(textes).toEqual(["Clients externes", "Nouveau chantier et devis", "Exporter toutes mes données (fichier JSON)"]);
  });
});
