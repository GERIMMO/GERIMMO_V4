/**
 * Audit du 13/10/2026, ART-21, décision D20 (option B) : démarrer, terminer ou facturer avant le rendez-vous confirmé
 * est possible (arrivées anticipées légitimes, urgences) mais :
 *   · l'artisan est AVERTI avant le geste, sans blocage (avant `debut_prevu` − 2 h) ;
 *   · l'écart est écrit à la chronologie (la base le fait : ecart-rendez-vous-chronologie.test.ts) et se lit en clair
 *     (la fiche de l'incident, rendue avec des événements : chronologie-ecart-rendez-vous.test.ts) ;
 *   · l'écran de validation de la facture dit « rendez-vous prévu le … / intervention terminée le … ».
 *
 * Les écrans sont RENDUS (pages de l'artisan, validation de facture), pas lus comme du texte source : un avertissement
 * mis en commentaire, alimenté par la mauvaise date, ou une colonne retirée de la requête, fait tomber un test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fauxClient, table, type BancFaux, type Ligne } from "./faux-postgrest";

const etat = vi.hoisted(() => ({ supabase: null as unknown, agenda: [] as Record<string, unknown>[] }));

// Un client qui honore select, eq et in (voir faux-postgrest.ts) : une colonne retirée du select ou un filtre retiré
// de la requête change ce que l'écran affiche, et fait donc tomber un test.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => etat.supabase }));
vi.mock("../src/app/agence/[orgId]/incidents/validation-facture", () => ({ ValidationFacture: () => null }));

// Les pages de l'artisan sont rendues pour de bon : seuls leurs accès (agenda, navigation) et leurs formulaires
// clients sont remplacés. Chaque formulaire laisse un repère de texte, pour vérifier que l'avertissement le PRÉCÈDE
// sans le remplacer.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (vers: string) => {
    throw new Error(`redirect:${vers}`);
  },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: etat.agenda }),
  chargerCreneauxMission: async () => ({ lignes: [], erreur: false }),
}));
async function bouton(libelle: string) {
  const { createElement: creer } = await import("react");
  return () => creer("button", { type: "button" }, libelle);
}
vi.mock("../src/app/artisan/missions/[interventionId]/bouton-demarrer", async () => ({
  BoutonDemarrer: await bouton("[bouton démarrer]"),
}));
vi.mock("../src/app/artisan/missions/[interventionId]/accepter-refuser", async () => ({
  AccepterOuRefuser: await bouton("[accepter ou refuser]"),
}));
vi.mock("../src/app/artisan/missions/[interventionId]/dates-locataire", async () => ({
  DatesLocataire: await bouton("[dates du locataire]"),
}));
vi.mock("../src/app/artisan/missions/[interventionId]/facture/formulaire-facture", async () => ({
  FormulaireFacture: await bouton("[formulaire de facture]"),
}));
vi.mock("../src/app/artisan/missions/[interventionId]/compte-rendu/photo-chantier", async () => ({
  PhotoChantier: await bouton("[photo du chantier]"),
}));

import {
  avantRendezVous,
  ecartEnMots,
  MARGE_RENDEZ_VOUS_ANTICIPE_MS,
  mentionEcartChronologie,
  phraseAvantLeGeste,
} from "@/lib/rendez-vous-anticipe";
import { AvertissementRendezVousAnticipe } from "../src/app/artisan/missions/[interventionId]/avertissement-rendez-vous";
import { FacturesIncident } from "../src/app/agence/[orgId]/incidents/factures-incident";
import PageMission from "../src/app/artisan/missions/[interventionId]/page";
import PageFacture from "../src/app/artisan/missions/[interventionId]/facture/page";
import PageComptePhoto from "../src/app/artisan/missions/[interventionId]/compte-rendu/page";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");
const heures = (n: number) => n * 3600 * 1000;
const dans = (ms: number) => new Date(Date.now() + ms).toISOString();
const DECODAGE: [RegExp, string][] = [[/&#x27;/g, "'"], [/&quot;/g, '"'], [/&amp;/g, "&"]];
const texte = (html: string) =>
  DECODAGE.reduce((t, [motif, remplacement]) => t.replace(motif, remplacement), html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

describe("avantRendezVous : la marge de deux heures", () => {
  const debut = "2026-10-19T09:00:00.000Z";
  const t = (iso: string) => new Date(iso);

  it("avertit plus de deux heures avant le début du rendez-vous", () => {
    expect(avantRendezVous(debut, t("2026-10-14T09:00:00.000Z"))).toBe(true);
    expect(avantRendezVous(debut, t("2026-10-19T06:59:59.000Z"))).toBe(true);
  });
  it("n'avertit plus à deux heures pile, ni après", () => {
    expect(avantRendezVous(debut, t("2026-10-19T07:00:00.000Z"))).toBe(false);
    expect(avantRendezVous(debut, t("2026-10-19T08:30:00.000Z"))).toBe(false);
    expect(avantRendezVous(debut, t("2026-10-19T09:00:00.000Z"))).toBe(false);
    expect(avantRendezVous(debut, t("2026-10-20T09:00:00.000Z"))).toBe(false);
  });
  it("n'avertit pas sans rendez-vous confirmé (dépannage) ni avec une date illisible", () => {
    expect(avantRendezVous(null, t("2026-10-14T09:00:00.000Z"))).toBe(false);
    expect(avantRendezVous(undefined, t("2026-10-14T09:00:00.000Z"))).toBe(false);
    expect(avantRendezVous("pas une date", t("2026-10-14T09:00:00.000Z"))).toBe(false);
  });
  it("la marge est celle de la base : deux heures, écrites dans ecart_rendez_vous", () => {
    expect(MARGE_RENDEZ_VOUS_ANTICIPE_MS).toBe(heures(2));
    expect(lire("supabase/migrations/20261014301000_ecart_rendez_vous_chronologie.sql")).toContain("interval '2 hours'");
  });
});

describe("l'avertissement de l'artisan avant le geste", () => {
  const rendu = (debut: string | null, geste: "demarrer" | "terminer" | "facturer") =>
    renderToStaticMarkup(createElement(AvertissementRendezVousAnticipe, { debutPrevu: debut, finPrevue: debut ? dans(heures(80)) : null, geste }));

  it.each(["demarrer", "terminer", "facturer"] as const)("s'affiche pour « %s » trois jours avant le rendez-vous, et dit que rien n'est bloqué", (geste) => {
    const t = texte(rendu(dans(heures(72)), geste));
    expect(t).toContain("Rendez-vous confirmé avec le locataire");
    expect(t).toContain("rien ne vous en empêche");
    expect(t).toContain("dossier de l’incident");
  });

  it("ne s'affiche pas à moins de deux heures du rendez-vous", () => {
    expect(rendu(dans(heures(1)), "demarrer")).toBe("");
  });
  it("ne s'affiche pas une fois le rendez-vous passé", () => {
    expect(rendu(dans(-heures(3)), "terminer")).toBe("");
  });
  it("ne s'affiche pas sans rendez-vous confirmé", () => {
    expect(rendu(null, "facturer")).toBe("");
  });
  it("la phrase de chaque geste ne parle jamais d'interdiction", () => {
    for (const geste of ["demarrer", "terminer", "facturer"] as const) {
      expect(phraseAvantLeGeste(geste)).not.toMatch(/interdit|impossible|refus|bloqu/i);
    }
  });
});

describe("l'écart écrit à la chronologie", () => {
  const formater = (iso: string) => `[${iso}]`;

  it("se lit en jours quand l'écart dépasse une journée", () => {
    expect(
      mentionEcartChronologie({ avant_rendez_vous: true, debut_prevu: "2026-10-19T09:00:00Z", ecart_minutes: 7199 }, formater)
    ).toBe("4 jours avant le rendez-vous prévu le [2026-10-19T09:00:00Z]");
  });
  it("se lit en heures sous une journée", () => {
    expect(
      mentionEcartChronologie({ avant_rendez_vous: true, debut_prevu: "2026-10-19T09:00:00Z", ecart_minutes: 150 }, formater)
    ).toBe("2 h avant le rendez-vous prévu le [2026-10-19T09:00:00Z]");
  });
  it("ne dit rien d'un événement sans écart", () => {
    expect(mentionEcartChronologie({ intervention_id: "x" }, formater)).toBeNull();
    expect(mentionEcartChronologie(null, formater)).toBeNull();
    expect(mentionEcartChronologie({ avant_rendez_vous: false, debut_prevu: "2026-10-19T09:00:00Z" }, formater)).toBeNull();
    expect(mentionEcartChronologie({ avant_rendez_vous: true }, formater)).toBeNull();
  });
  it("ecartEnMots : 2 h, 23 h, 1 jour, 5 jours", () => {
    expect(ecartEnMots(120)).toBe("2 h");
    expect(ecartEnMots(1439)).toBe("23 h");
    expect(ecartEnMots(1440)).toBe("1 jour");
    expect(ecartEnMots(7200)).toBe("5 jours");
  });
});

describe("les écrans de l'artisan portent l'avertissement", () => {
  // 14/10/2026 11:00 à Paris ; rendez-vous le 19/10 de 09:00 à 11:00 à Paris (07:00Z - 09:00Z).
  const MAINTENANT = "2026-10-14T09:00:00.000Z";
  const DEBUT = "2026-10-19T07:00:00.000Z";
  const FIN = "2026-10-19T09:00:00.000Z";
  const CRENEAU = "lun. 19 oct. · 09:00 – 11:00";
  const AVERTISSEMENT = `Rendez-vous confirmé avec le locataire : ${CRENEAU}.`;
  const PHRASE_DEMARRER = "Vous pouvez démarrer dès maintenant, rien ne vous en empêche";
  const PHRASE_TERMINER = "Vous pouvez rendre compte dès maintenant, rien ne vous en empêche";
  const PHRASE_FACTURER = "Vous pouvez déposer votre facture dès maintenant, rien ne vous en empêche";

  const ligne = (statut: string, autres: Ligne = {}): Record<string, unknown> => ({
    intervention_id: "m1",
    organization_id: "org",
    agence_nom: "Agence Test",
    incident_numero: "INC-0001",
    statut,
    debut_prevu: DEBUT,
    fin_prevue: FIN,
    categorie: "plomberie_canalisation",
    description: "Fuite sous l'évier",
    urgence: "normale",
    piece: null,
    nature_travaux: "entretien_courant",
    adresse: "1 rue du Test",
    code_postal: "75011",
    ville: "Paris",
    lot_nom: "Lot 1",
    etage: null,
    occupant_nom: null,
    occupant_prenom: null,
    occupant_telephone: null,
    montant_ttc_cents: 48000,
    compte_rendu_depose: false,
    photo_apres_deposee: false,
    creneaux_en_attente: 0,
    dates_locataire_en_attente: 0,
    montant_plafond_cents: 48000,
    montant_final_cents: null,
    facture_deposee: false,
    ...autres,
  });

  const props = { params: Promise.resolve({ interventionId: "m1" }), searchParams: Promise.resolve({}) } as never;
  const mission = async (agenda: Record<string, unknown>) => {
    etat.agenda = [agenda];
    return texte(renderToStaticMarkup((await PageMission(props)) as never));
  };
  const compteRendu = async (agenda: Record<string, unknown>) => {
    etat.agenda = [agenda];
    return texte(renderToStaticMarkup((await PageComptePhoto(props)) as never));
  };
  const facture = async (agenda: Record<string, unknown>) => {
    etat.agenda = [agenda];
    return texte(renderToStaticMarkup((await PageFacture(props)) as never));
  };
  const facturable = (autres: Ligne = {}) =>
    ligne("terminee", { compte_rendu_depose: true, photo_apres_deposee: true, ...autres });

  /** L'avertissement est là, dit le bon geste, et précède le repère donné (le geste reste disponible). */
  const attendu = (t: string, phrase: string, repere: string) => {
    expect(t).toContain(`${AVERTISSEMENT} ${phrase}`);
    expect(t).toContain(repere);
    expect(t.indexOf(AVERTISSEMENT)).toBeLessThan(t.indexOf(repere, t.indexOf(AVERTISSEMENT)));
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
  });
  afterEach(() => vi.useRealTimers());

  describe("la mission", () => {
    it("planifiée, trois jours avant : l'avertissement « démarrer » précède le bouton, qui reste là", async () => {
      attendu(await mission(ligne("planifiee")), PHRASE_DEMARRER, "[bouton démarrer]");
    });
    it("planifiée : le rendez-vous de l'avertissement est le début prévu, pas la fin", async () => {
      const t = await mission(ligne("planifiee"));
      expect(t).not.toContain("lun. 19 oct. · 11:00 – 11:00");
    });
    it("en cours, trois jours avant : l'avertissement « rendre compte » précède le lien, qui reste là", async () => {
      attendu(await mission(ligne("en_cours")), PHRASE_TERMINER, "Rendre compte du travail");
    });
    it("à moins de deux heures du rendez-vous : aucun avertissement, le geste reste", async () => {
      vi.setSystemTime(new Date("2026-10-19T05:30:00.000Z"));
      const t = await mission(ligne("planifiee"));
      expect(t).not.toContain("Rendez-vous confirmé avec le locataire");
      expect(t).toContain("[bouton démarrer]");
    });
    it("sans rendez-vous confirmé (dépannage) : aucun avertissement", async () => {
      const t = await mission(ligne("planifiee", { debut_prevu: null, fin_prevue: null }));
      expect(t).not.toContain("Rendez-vous confirmé avec le locataire");
      expect(t).toContain("[bouton démarrer]");
    });
    it("mission acceptée, sans rendez-vous encore calé : aucun avertissement", async () => {
      expect(await mission(ligne("acceptee", { debut_prevu: null, fin_prevue: null }))).not.toContain(
        "Rendez-vous confirmé avec le locataire"
      );
    });
  });

  describe("le compte rendu", () => {
    it("pas encore démarrée : l'avertissement « démarrer » précède le bouton de démarrage", async () => {
      attendu(await compteRendu(ligne("planifiee")), PHRASE_DEMARRER, "[bouton démarrer]");
    });
    it("démarrée : l'avertissement « rendre compte » précède la photo du travail", async () => {
      attendu(await compteRendu(ligne("en_cours")), PHRASE_TERMINER, "[photo du chantier]");
    });
    it("sans rendez-vous confirmé : aucun avertissement, ni avant ni après le démarrage", async () => {
      const sans = { debut_prevu: null, fin_prevue: null };
      expect(await compteRendu(ligne("planifiee", sans))).not.toContain("Rendez-vous confirmé avec le locataire");
      expect(await compteRendu(ligne("en_cours", sans))).not.toContain("Rendez-vous confirmé avec le locataire");
    });
    it("à moins de deux heures du rendez-vous : aucun avertissement, la photo reste", async () => {
      vi.setSystemTime(new Date("2026-10-19T06:00:00.000Z"));
      const t = await compteRendu(ligne("en_cours"));
      expect(t).not.toContain("Rendez-vous confirmé avec le locataire");
      expect(t).toContain("[photo du chantier]");
    });
  });

  describe("la facture", () => {
    it("l'avertissement « facturer » précède le formulaire de dépôt, qui reste là", async () => {
      attendu(await facture(facturable()), PHRASE_FACTURER, "[formulaire de facture]");
    });
    it("sans rendez-vous confirmé : aucun avertissement", async () => {
      const t = await facture(facturable({ debut_prevu: null, fin_prevue: null }));
      expect(t).not.toContain("Rendez-vous confirmé avec le locataire");
      expect(t).toContain("[formulaire de facture]");
    });
    it("à moins de deux heures du rendez-vous : aucun avertissement", async () => {
      vi.setSystemTime(new Date("2026-10-19T08:00:00.000Z"));
      expect(await facture(facturable())).not.toContain("Rendez-vous confirmé avec le locataire");
    });
  });
});

describe("l'écran de validation de la facture : rendez-vous prévu / intervention terminée", () => {
  const ORG = "org-a";
  const AUTRE_ORG = "org-b";
  const INCIDENT = "inc-1";
  const facture = (id: string, intervention: string, numero: string, organisation = ORG): Ligne => ({
    id,
    organization_id: organisation,
    intervention_id: intervention,
    numero,
    montant_ttc_cents: 48000,
    montant_reference_cents: 48000,
    ecart_justification: null,
    document_id: "d1",
    validee_le: null,
    decision_motif: null,
    imputation_validee: null,
  });
  const mission = (id: string, debut: string | null, fin: string | null, incident = INCIDENT, organisation = ORG): Ligne => ({
    id,
    organization_id: organisation,
    incident_id: incident,
    debut_prevu: debut,
    terminee_le: fin,
  });

  /**
   * La mission de l'incident (m1) et sa facture, plus trois leurres que l'écran ne doit PAS afficher : la facture d'un
   * autre incident de la même agence, une facture d'une autre agence qui vise la même mission, et une facture de
   * cette agence qui viserait la mission d'une autre agence.
   */
  function afficher(mission1: Ligne) {
    const banc: BancFaux = {
      incident_interventions: table("incident_interventions", [
        mission1,
        mission("m-autre-incident", "2026-10-19T07:00:00.000Z", null, "inc-autre"),
        mission("m-autre-agence", "2026-10-19T07:00:00.000Z", null, INCIDENT, AUTRE_ORG),
      ]),
      intervention_factures: table("intervention_factures", [
        facture("f1", "m1", "F-1"),
        facture("f2", "m-autre-incident", "F-AUTRE-INCIDENT"),
        facture("f3", "m1", "F-AUTRE-AGENCE", AUTRE_ORG),
        facture("f4", "m-autre-agence", "F-INCOHERENTE"),
      ]),
    };
    etat.supabase = fauxClient(banc);
    return FacturesIncident({ orgId: ORG, incidentId: INCIDENT }).then((e) => renderToStaticMarkup(e as never));
  }

  it("écrit le rendez-vous prévu et la fin de l'intervention, chacun à sa place", async () => {
    const html = await afficher(mission("m1", "2026-10-19T07:00:00.000Z", "2026-10-19T09:30:00.000Z"));
    const t = texte(html);
    expect(t).toContain("Facture F-1");
    expect(t).toContain("Rendez-vous prévu le 19/10/2026 09:00 · Intervention terminée le 19/10/2026 11:30");
    expect(t).not.toContain("avant le rendez-vous confirmé");
    expect(html).not.toContain('role="note"');
  });

  it("prévient quand l'artisan a terminé plus de deux heures avant le rendez-vous, sans bloquer la validation", async () => {
    const html = await afficher(mission("m1", "2026-10-19T07:00:00.000Z", "2026-10-14T10:00:00.000Z"));
    const t = texte(html);
    expect(t).toContain("Rendez-vous prévu le 19/10/2026 09:00 · Intervention terminée le 14/10/2026 12:00");
    expect(t).toContain("avant le rendez-vous confirmé avec le locataire");
    expect(html).toContain('role="note"');
    expect(t).toContain("Consulter la facture avant de décider");
  });

  it("ne prévient pas quand l'intervention est terminée à moins de deux heures du rendez-vous", async () => {
    const html = await afficher(mission("m1", "2026-10-19T07:00:00.000Z", "2026-10-19T05:30:00.000Z"));
    expect(texte(html)).not.toContain("avant le rendez-vous confirmé");
    expect(html).not.toContain('role="note"');
  });

  it("rendez-vous prévu mais intervention pas terminée : ne dit que le rendez-vous, sans avertir (pas de 1970)", async () => {
    const html = await afficher(mission("m1", "2026-10-19T07:00:00.000Z", null));
    const t = texte(html);
    expect(t).toContain("Rendez-vous prévu le 19/10/2026 09:00");
    expect(t).not.toContain("Intervention terminée");
    expect(t).not.toContain("avant le rendez-vous confirmé");
    expect(html).not.toContain('role="note"');
  });

  it("sans rendez-vous confirmé, ne dit que la fin de l'intervention", async () => {
    const html = await afficher(mission("m1", null, "2026-10-14T10:00:00.000Z"));
    const t = texte(html);
    expect(t).not.toContain("Rendez-vous prévu");
    expect(t).toContain("Intervention terminée le 14/10/2026 12:00");
    expect(t).not.toContain("avant le rendez-vous confirmé");
  });

  it("n'affiche que les factures de cet incident et de cette agence", async () => {
    const t = texte(await afficher(mission("m1", "2026-10-19T07:00:00.000Z", "2026-10-19T09:30:00.000Z")));
    expect(t).toContain("Facture F-1");
    expect(t).not.toContain("F-AUTRE-INCIDENT");
    expect(t).not.toContain("F-AUTRE-AGENCE");
    expect(t).not.toContain("F-INCOHERENTE");
  });
});
