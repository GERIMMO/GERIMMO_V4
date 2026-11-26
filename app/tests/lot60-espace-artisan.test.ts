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
vi.mock("@/app/actions/artisan", () => ({ demarrerMonIntervention: async () => ({}) }));
vi.mock("@/app/artisan/acces", () => ({
  chargerFicheArtisan: async () => ({ user: { id: "u1" }, fiche: etat.lectureEnEchec ? null : { artisan_id: "a1" }, erreur: etat.lectureEnEchec }),
}));

import { NavArtisan, entreeActive, entreesMenuArtisan } from "@/components/nav-artisan";
import PagePanneArtisan from "@/app/artisan/panne/page";
import { CONSIGNE_PLUS_DE_DATE, consigneDatesProposees, datesAGarder, joursAGarder } from "@/app/artisan/agenda/dates-a-garder";
import { CarteMission } from "@/app/artisan/carte-mission";
import { LIBELLE_EXPORT_ARTISAN, NavigationPrivee, PRECISION_EXPORT_ARTISAN } from "@/app/artisan/clients/elements";
import { LienAssistance } from "@/components/bouton-assistance";
import { BoutonDemarrer } from "@/app/artisan/missions/[interventionId]/bouton-demarrer";
import { PHRASE_CONTACT_OUVERT, lireEtatDiscussion, phraseContactOccupant } from "@/lib/contact-occupant";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreneauMission, LigneAgenda } from "@/app/artisan/acces";

beforeEach(() => { etat.chemin = "/artisan"; etat.lectureEnEchec = false; etat.redirections = []; });

/** Les liens du menu latéral qui portent aria-current="page", par leur texte. */
function allumes(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

describe("E001, E003, E008, E121 — le menu du téléphone", () => {
  it("« Aide en cas de problème » mène à la page d'aide, plus à la page de panne", () => {
    const aide = entreesMenuArtisan({ clientsExternes: true, piecesAAJour: true }).find((e) => e.libelle === "Aide en cas de problème");
    // Reprise du lot 60 (R7) : l'adresse n'est plus figée sur l'accueil (`retour=%2Fartisan`) ; l'entrée est rendue par
    // `LienAssistance`, qui porte le chemin de la page d'où l'on vient (bloc « Reprises du lot 60 », plus bas).
    expect(aide?.href).toBe("/assistance");
    expect(aide?.aide).toBe(true);
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
  // Relecture du lot L4 (26/11) : le paramètre de la page est obligatoire. Ouverte sans `?essai=1` (favori, historique),
  // comme Next l'appelle : des paramètres d'adresse vides.
  const sansEssai = { params: Promise.resolve({}), searchParams: Promise.resolve({}) } as Parameters<typeof PagePanneArtisan>[0];

  it("la fiche se lit : pas de message d'échec, retour à l'espace", async () => {
    await expect(PagePanneArtisan(sansEssai)).rejects.toThrow("redirect:/artisan");
    expect(etat.redirections).toEqual(["/artisan"]);
  });

  it("la lecture échoue encore : le message, l'aide et « Réessayer »", async () => {
    etat.lectureEnEchec = true;
    const page = renderToStaticMarkup(await PagePanneArtisan(sansEssai));
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
    // Reprise du lot 60 (R1) : « Exporter toutes mes données (fichier JSON) » promettait plus que le fichier.
    expect(textes).toEqual(["Clients externes", "Nouveau chantier et devis", "Exporter mon activité (fichier JSON, sans les discussions ni les pièces jointes)"]);
  });
});

/**
 * Reprises du lot 60 (relecture L60R) — R1, R2, R3, R6, R7, R8. Chaque test échoue sur le code du lot 60 (9c54271c) :
 * le libellé promettait « toutes mes données », la phrase « Sur place » renvoyait toujours à la discussion, la largeur
 * minimale des onglets ne valait que sous 421 px, la carte de l'agenda écrivait le compteur brut, l'aide partait de
 * « /artisan » quelle que soit la page, et le compte rendu portait deux mises en garde.
 */
describe("Reprises du lot 60", () => {
  const source = (chemin: string) => readFileSync(chemin, "utf8");

  it("R1 — l'export dit ce qu'il contient, aux deux endroits : ni « toutes mes données », ni discussions, ni pièces jointes", () => {
    expect(LIBELLE_EXPORT_ARTISAN).toBe("Exporter mon activité (fichier JSON, sans les discussions ni les pièces jointes)");
    expect(LIBELLE_EXPORT_ARTISAN).not.toMatch(/toutes? mes données/i);
    expect(PRECISION_EXPORT_ARTISAN).toContain("Les messages des discussions et les fichiers (photos, PDF, justificatifs) n’y figurent pas.");
    // Les pastilles des clients externes.
    const pastilles = renderToStaticMarkup(createElement(NavigationPrivee));
    expect(pastilles).toContain(`>${LIBELLE_EXPORT_ARTISAN}</a>`);
    expect(pastilles).not.toContain("avec vos données Gerimmo");
    // La carte « Mes règlements déclarés » de la facturation : le même libellé, par la même constante, sans texte en dur.
    const resumes = source("src/app/artisan/clients/resumes.tsx");
    expect(resumes.match(/href="\/api\/artisan-prive\/export"[^>]*>\{LIBELLE_EXPORT_ARTISAN\}<\/a>/g)).toHaveLength(1);
    for (const fichier of ["src/app/artisan/clients/resumes.tsx", "src/app/artisan/clients/elements.tsx"]) {
      expect(source(fichier).replace(/^\s*\/\/.*$/gm, ""), fichier).not.toMatch(/Exporter toutes mes données/);
    }
    // L'export lui-même n'est pas élargi : toujours le registre privé et `export_artisan_plateforme`, rien d'autre.
    const route = source("src/app/api/artisan-prive/export/route.ts");
    expect(route.match(/\.rpc\(/g)).toHaveLength(1);
    expect(route).not.toMatch(/intervention_messages|intervention_photos|storage/);
  });

  describe("R2 — « Sur place » sans numéro : qui lit la discussion, et seulement si elle est ouverte", () => {
    it("discussion ouverte : la phrase dit que le client la lit, et le locataire aussi s'il a un compte Gerimmo", () => {
      const phrase = phraseContactOccupant({ telephone: null, discussion: "ouverte" });
      expect(phrase).toBe("Aucun numéro de téléphone n’a été communiqué pour cette personne. Son nom vous est donné le temps de la mission ; pour un message, écrivez dans la discussion de l’intervention, plus bas : votre client la lit, et le locataire aussi s’il a un compte Gerimmo.");
      expect(phrase).not.toContain("voyez la discussion");
    });
    it.each(["fermee", "illisible"] as const)("discussion %s : aucun renvoi à la discussion", (discussion) => {
      const phrase = phraseContactOccupant({ telephone: "", discussion });
      expect(phrase).toBe("Aucun numéro de téléphone n’a été communiqué pour cette personne. Son nom vous est donné le temps de la mission.");
      expect(phrase).not.toMatch(/discussion/);
    });
    it("avec un numéro : la phrase du contact ouvert, quelle que soit la discussion", () => {
      for (const discussion of ["ouverte", "fermee", "illisible"] as const) expect(phraseContactOccupant({ telephone: "06 00 00 00 01", discussion })).toBe(PHRASE_CONTACT_OUVERT);
    });

    /** Une base factice : le contexte rendu par la RPC, l'état de fermeture, et les lectures en échec demandées. */
    function base(o: { contexte?: { statut_intervention: string } | null; rpcEnEchec?: boolean; fermee?: boolean; echec?: "intervention_messages" | "intervention_echanges_etat" }): SupabaseClient {
      const table = (nom: string) => {
        const reponse = o.echec === nom ? { data: null, error: { message: "panne" }, count: null } : { data: nom === "intervention_echanges_etat" ? (o.fermee ? { fermee_le: "2026-11-24T10:00:00Z" } : null) : null, error: null, count: 0 };
        const q: Record<string, unknown> = { select: () => q, eq: () => q, maybeSingle: async () => reponse, then: (ok: (r: typeof reponse) => unknown) => Promise.resolve(reponse).then(ok) };
        return q;
      };
      return { rpc: async () => (o.rpcEnEchec ? { data: null, error: { message: "panne" } } : { data: o.contexte === null ? [] : [o.contexte ?? { statut_intervention: "acceptee" }], error: null }), from: table } as unknown as SupabaseClient;
    }
    it("la discussion est « ouverte » quand l'écran d'échange la rendra ouverte, et seulement alors", async () => {
      expect(await lireEtatDiscussion(base({}), "i1")).toBe("ouverte");
      expect(await lireEtatDiscussion(base({ contexte: { statut_intervention: "planifiee" } }), "i1")).toBe("ouverte");
      expect(await lireEtatDiscussion(base({ fermee: true }), "i1")).toBe("fermee");
      expect(await lireEtatDiscussion(base({ contexte: { statut_intervention: "terminee" } }), "i1")).toBe("fermee");
      expect(await lireEtatDiscussion(base({ rpcEnEchec: true }), "i1")).toBe("illisible");
      expect(await lireEtatDiscussion(base({ contexte: null }), "i1")).toBe("illisible");
      expect(await lireEtatDiscussion(base({ echec: "intervention_messages" }), "i1")).toBe("illisible");
      expect(await lireEtatDiscussion(base({ echec: "intervention_echanges_etat" }), "i1")).toBe("illisible");
    });
    it("la fiche de mission passe par cette phrase, et ne l'écrit plus en dur", () => {
      const page = source("src/app/artisan/missions/[interventionId]/page.tsx");
      expect(page).toContain("{phraseContactOccupant({ telephone: mission.occupant_telephone, discussion })}");
      expect(page).not.toContain("voyez la discussion de l’intervention");
    });
  });

  it("R3 — la largeur minimale d'un onglet vaut à toute largeur, plus seulement sous 421 px", () => {
    const css = source("src/components/onglets-dossier.module.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const horsMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    expect(horsMedia).toMatch(/\.onglets button \{[^}]*min-width:min-content;/);
    expect(horsMedia).not.toMatch(/\.onglets button \{[^}]*min-width:0;/);
    expect(horsMedia).toMatch(/\.onglets \{[^}]*flex-wrap:wrap;/);
  });

  describe("R6 — agenda : le nombre écrit est celui des dates listées", () => {
    const creneau = (debut: string, par: CreneauMission["propose_par"] = "artisan", statut: CreneauMission["statut"] = "propose"): CreneauMission =>
      ({ creneau_id: debut + par, propose_par: par, tour: 1, debut, fin: debut.replace("T08", "T10"), statut });
    const ligne = { intervention_id: "i1", organization_id: "o1", agence_nom: "Agence TEST", incident_numero: "INC-2026-0001", statut: "acceptee", debut_prevu: null, fin_prevue: null, categorie: "plomberie_canalisation", urgence: "normale", adresse: "1 rue des Tests", code_postal: "75012", ville: "Paris", lot_nom: null, etage: null, creneaux_en_attente: 3, dates_locataire_en_attente: 0 } as unknown as LigneAgenda;

    it("compteur 3, deux dates encore lisibles : « 2 dates au choix du locataire »", () => {
      expect(consigneDatesProposees(3, [creneau("2026-11-26T08:00:00Z"), creneau("2026-11-27T08:00:00Z")])).toBe("2 dates au choix du locataire");
      expect(consigneDatesProposees(3, [creneau("2026-11-26T08:00:00Z"), creneau("2026-11-28T08:00:00Z", "locataire")])).toBe("1 date au choix du locataire");
    });
    it("compteur 3, plus aucune date lisible : la carte le dit, sans « 3 dates au choix »", () => {
      expect(consigneDatesProposees(3, [])).toBe(CONSIGNE_PLUS_DE_DATE);
      expect(CONSIGNE_PLUS_DE_DATE).toBe("Plus aucune date proposée n’est disponible : proposez-en de nouvelles");
    });
    it("lecture en échec : le compteur reste, avec le renvoi à la fiche", () => {
      expect(consigneDatesProposees(3, null)).toBe("3 dates au choix du locataire — dates à vérifier sur la fiche");
    });
    it("plus aucune date : la carte redevient un geste de l'artisan (plus « En attente du locataire »)", () => {
      const attente = renderToStaticMarkup(createElement(CarteMission, { ligne, aFaire: "2 dates au choix du locataire", datesAGarder: ["a", "b"] }));
      expect(attente).toContain("En attente du locataire");
      const aRefaire = renderToStaticMarkup(createElement(CarteMission, { ligne, aFaire: CONSIGNE_PLUS_DE_DATE, plusDeDate: true }));
      expect(aRefaire).not.toContain("En attente du locataire");
      expect(aRefaire).toContain("Plus aucune date proposée n’est disponible : proposez-en de nouvelles");
      expect(aRefaire).not.toContain("data-dates-a-garder");
    });
    it("l'agenda écrit la consigne d'après la liste lue", () => {
      const page = source("src/app/artisan/agenda/page.tsx");
      expect(page).toContain("consigneDatesProposees(l.creneaux_en_attente, proposees.get(l.intervention_id) ?? null)");
      expect(page).toContain("plusDeDate={proposees.get(l.intervention_id)?.length === 0}");
    });
  });

  describe("R7 — « Aide en cas de problème » porte la page d'où l'on vient", () => {
    it.each([
      ["/artisan/entreprise", "ecran=%2Fartisan%2Fentreprise", "retour=%2Fartisan%2Fentreprise"],
      ["/artisan/missions/95775939-8bb7-4a14-8502-e1cfff7a7edc", "ecran=%2Fartisan%2Fmissions%2F%5Bdossier%5D", "retour=%2Fartisan%2Fmissions%2F95775939-8bb7-4a14-8502-e1cfff7a7edc"],
    ])("depuis %s", (chemin, ecran, retour) => {
      etat.chemin = chemin;
      const lien = renderToStaticMarkup(createElement(LienAssistance, { nomVisible: true } as Parameters<typeof LienAssistance>[0], "Aide en cas de problème"));
      expect(lien).toContain(`href="/assistance?${ecran}&amp;action=navigation&amp;${retour}"`);
      // Le lien se nomme par son texte : pas d'« Aide et retours » imposé au lecteur d'écran.
      expect(lien).not.toContain("aria-label");
      expect(lien).toContain(">Aide en cas de problème</a>");
    });
    it("les autres liens d'aide gardent leur nom « Aide et retours »", () => {
      expect(renderToStaticMarkup(createElement(LienAssistance, {} as Parameters<typeof LienAssistance>[0], "?"))).toContain('aria-label="Aide et retours"');
    });
    it("le menu du téléphone rend cette entrée avec LienAssistance, et plus aucune adresse d'aide figée", () => {
      const nav = source("src/components/nav-artisan.tsx").replace(/^\s*\/\/.*$/gm, "");
      expect(nav).toMatch(/e\.aide \? <LienAssistance key=\{e\.href\} nomVisible/);
      expect(nav).not.toMatch(/ecran=%2Fartisan|retour=%2Fartisan/);
    });
  });

  it("R8 — compte rendu sans rendez-vous : une seule mise en garde", () => {
    const avecPhrase = renderToStaticMarkup(createElement(BoutonDemarrer, { interventionId: "i1", sansRendezVous: true }));
    expect(avecPhrase).toContain("Si vous intervenez sans attendre le rendez-vous.");
    const sansPhrase = renderToStaticMarkup(createElement(BoutonDemarrer, { interventionId: "i1", sansRendezVous: true, sansPhrase: true }));
    expect(sansPhrase).not.toContain("Si vous intervenez sans attendre le rendez-vous.");
    expect(sansPhrase).toContain("Je démarre l&#x27;intervention");
    const page = source("src/app/artisan/missions/[interventionId]/compte-rendu/page.tsx");
    expect(page).toContain("<BoutonDemarrer interventionId={interventionId} sansRendezVous={!mission.debut_prevu} sansPhrase />");
    expect(page.match(/data-mise-en-garde-sans-rendez-vous/g)).toHaveLength(1);
  });
});
