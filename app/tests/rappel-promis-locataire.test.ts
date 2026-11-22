/**
 * LE RAPPEL DE LA VEILLE N'EST PROMIS AU LOCATAIRE QUE S'IL PART — audit palier 1, P1-08 (complément du 23/11/2026).
 *
 * Le rappel de rendez-vous est l'un des quatre envois automatiques « prêts, fermés » (lot 15) : il ne part que si le
 * superviseur l'a ouvert. Or trois textes le promettaient sans condition : sous le rendez-vous confirmé, après un
 * report accepté, et dans l'e-mail du report accepté. Un locataire qui compte sur un rappel qui ne vient pas manque
 * son rendez-vous. Ce fichier tient :
 *  - fermé (le défaut, ou état illisible) : aucun texte ne promet le rappel ; l'écran dit de noter la date ;
 *  - ouvert : la promesse revient, mot pour mot comme avant ;
 *  - la page lit l'état une fois et le transmet ; l'e-mail le lit au moment d'être composé ;
 *  - il ne reste aucune promesse de rappel écrite en dur ailleurs dans le code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/incidents-locataire", () => ({
  choisirMonCreneau: vi.fn(), noterMonIntervention: vi.fn(), proposerMesCreneaux: vi.fn(),
  annulerRdvLocataire: vi.fn(), demanderReportRdv: vi.fn(), retirerDemandeRdv: vi.fn(),
}));

import { SuiviInterventionLocataire, type SuiviIntervention } from "@/app/locataire/[orgId]/demandes/suivi-intervention";
import { messageReponseReportRdv } from "@/lib/notifications";
import { etatDemandeLocataire, PHRASES_RAPPEL, phraseRappel, type RendezVousLocataire } from "@/lib/rendez-vous-locataire";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ");
const PROMESSE = /rappeller(ons|a)\b/i;

function rv(partiel: Partial<RendezVousLocataire> = {}): RendezVousLocataire {
  return {
    intervention_id: "iv", incident_id: "inc", statut_mission: "planifiee",
    rdv_debut: "2026-12-03T07:00:00Z", rdv_fin: "2026-12-03T09:00:00Z",
    report_possible: true, annulation_possible: true, reports_restants: 2,
    demande_id: null, demande_type: null, demande_statut: null, demande_motif_code: null,
    demandee_le: null, expire_le: null, repondu_le: null, reponse_motif: null,
    demande_rdv_debut: null, demande_rdv_fin: null, nouveau_debut: null, nouvelle_fin: null, tardive: false, annulation_tardive: false,
    ...partiel,
  };
}
const suivi = (partiel: Partial<SuiviIntervention> = {}): SuiviIntervention => ({
  incident_id: "inc", etape: "planifiee", intervention_id: "iv", artisan: "Plomberie Dubois",
  nb_artisans_consultes: 1, nb_devis_recus: 1, rdv_debut: "2026-12-03T07:00:00Z", rdv_fin: "2026-12-03T09:00:00Z",
  terminee_le: null, creneaux_a_choisir: 0, mes_creneaux_en_attente: 0, creneaux_refuses: 0, arbitrage: false,
  travaux_realises: null, nouvelle_intervention_necessaire: false, photos_apres: [], deja_notee: false, ...partiel,
});
const ecran = (props: Record<string, unknown>) =>
  texteDe(renderToStaticMarkup(createElement(SuiviInterventionLocataire, { orgId: "org", suivi: suivi(), creneaux: [], peutAgir: true, ...props } as never)));

describe("les phrases", () => {
  it("quatre phrases, deux par contexte ; fermé, aucune ne promet", () => {
    expect(phraseRappel(true)).toBe("Nous vous le rappellerons la veille.");
    expect(phraseRappel(false)).toBe("Notez bien cette date : aucun rappel ne vous sera envoyé.");
    expect(phraseRappel(true, "report")).toBe("Nous vous rappellerons le nouveau la veille.");
    expect(phraseRappel(false, "report")).toBe("Notez bien la nouvelle date : aucun rappel ne vous sera envoyé.");
    for (const p of Object.values(PHRASES_RAPPEL)) { expect(p.promis).toMatch(PROMESSE); expect(p.sans).not.toMatch(PROMESSE); }
  });
});

describe("sous le rendez-vous confirmé", () => {
  it("envoi fermé (le défaut) : l'écran ne promet rien et dit de noter la date", () => {
    for (const texte of [ecran({}), ecran({ rappelPromis: false })]) {
      expect(texte).toContain("Plomberie Dubois intervient chez vous. Prévoyez d'être présent, ou de faire ouvrir. Notez bien cette date : aucun rappel ne vous sera envoyé.");
      expect(texte).not.toMatch(PROMESSE);
    }
  });

  it("envoi ouvert par le superviseur : la promesse revient", () => {
    const texte = ecran({ rappelPromis: true });
    expect(texte).toContain("Prévoyez d'être présent, ou de faire ouvrir. Nous vous le rappellerons la veille.");
    expect(texte).not.toContain("aucun rappel ne vous sera envoyé");
  });

  it("aux autres étapes, il n'est question de rappel dans aucun des deux états", () => {
    for (const etape of ["creneaux_attendus", "creneau_a_choisir", "ma_proposition", "en_cours", "terminee"]) {
      for (const rappelPromis of [true, false]) {
        const texte = ecran({ suivi: suivi({ etape, rdv_debut: null, rdv_fin: null }), rappelPromis });
        expect(texte, `${etape} / ${rappelPromis}`).not.toMatch(/rappel/i);
      }
    }
  });
});

describe("après un report accepté par l'artisan", () => {
  const accepte = rv({ demande_id: "d1", demande_type: "report", demande_statut: "acceptee", nouveau_debut: "2026-12-05T13:00:00Z", nouvelle_fin: "2026-12-05T17:00:00Z" });

  it("fermé ou non précisé : « notez bien la nouvelle date » ; ouvert : la promesse", () => {
    for (const etat of [etatDemandeLocataire(accepte), etatDemandeLocataire(accepte, {}), etatDemandeLocataire(accepte, { rappelPromis: false })]) {
      expect(etat?.detail).toBe("Votre ancien rendez-vous est annulé. Notez bien la nouvelle date : aucun rappel ne vous sera envoyé.");
    }
    expect(etatDemandeLocataire(accepte, { rappelPromis: true })?.detail).toBe("Votre ancien rendez-vous est annulé. Nous vous rappellerons le nouveau la veille.");
  });

  it("l'écran du locataire transmet l'état jusqu'à cette phrase", () => {
    const ferme = ecran({ rendezVous: accepte });
    expect(ferme).toContain("Votre ancien rendez-vous est annulé. Notez bien la nouvelle date : aucun rappel ne vous sera envoyé.");
    expect(ferme).not.toMatch(PROMESSE);
    const ouvert = ecran({ rendezVous: accepte, rappelPromis: true });
    expect(ouvert).toContain("Votre ancien rendez-vous est annulé. Nous vous rappellerons le nouveau la veille.");
  });

  it("les autres réponses (refus, expiration, attente) ne parlent pas de rappel", () => {
    for (const demande_statut of ["en_attente", "refusee", "expiree"] as const) {
      for (const rappelPromis of [true, false]) {
        const etat = etatDemandeLocataire(rv({ demande_id: "d1", demande_type: "report", demande_statut }), { rappelPromis });
        expect(`${etat?.titre} ${etat?.detail}`, demande_statut).not.toMatch(/rappel/i);
      }
    }
  });
});

describe("l'e-mail « votre report est accepté »", () => {
  const base = {
    emetteur: "Jo Exemple", prenom: "Camille", categorie: "plomberie_canalisation",
    reponse: { type: "acceptee" as const, debut: "2026-12-05T13:00:00Z", fin: "2026-12-05T17:00:00Z" },
    rdvDebut: "2026-12-03T07:00:00Z", rdvFin: "2026-12-03T09:00:00Z", lien: "https://exemple.invalid/locataire/org/demandes",
  };

  it("fermé ou non précisé : l'e-mail ne promet pas de rappel", () => {
    for (const message of [messageReponseReportRdv(base), messageReponseReportRdv({ ...base, rappelPromis: false })]) {
      const texte = texteDe(message.html);
      expect(texte).toContain("L'ancien rendez-vous est annulé. Notez bien la nouvelle date : aucun rappel ne vous sera envoyé.");
      expect(texte).not.toMatch(PROMESSE);
    }
  });

  it("ouvert : la promesse d'avant, mot pour mot", () => {
    expect(texteDe(messageReponseReportRdv({ ...base, rappelPromis: true }).html)).toContain("L'ancien rendez-vous est annulé. Nous vous rappellerons le nouveau la veille.");
  });

  it("un report refusé ne parle pas de rappel", () => {
    const refus = messageReponseReportRdv({ ...base, reponse: { type: "refusee", motif: "Indisponible" }, rappelPromis: true });
    expect(texteDe(refus.html)).not.toMatch(/rappel/i);
  });

  it("l'état est lu au moment de composer l'e-mail, seulement pour un report accepté", () => {
    const source = readFileSync("src/lib/notifications.ts", "utf8");
    expect(source).toContain('rappelPromis: d.statut === "acceptee" ? (await lireEnvoisProposes(db)).rappel_rendez_vous : false,');
  });
});

describe("la page et le reste du code", () => {
  it("la page « Mes demandes » lit l'état une fois et le transmet", () => {
    const page = readFileSync("src/app/locataire/[orgId]/demandes/page.tsx", "utf8");
    expect(page).toContain("const rappelPromis = (await lireEnvoisProposes(supabase)).rappel_rendez_vous;");
    expect(page).toContain("rappelPromis={rappelPromis}");
    const carte = readFileSync("src/app/locataire/[orgId]/incidents-locataire.tsx", "utf8");
    expect(carte.match(/rappelPromis=\{rappelPromis\}/g)).toHaveLength(3);
  });

  it("aucune promesse de rappel n'est écrite en dur ailleurs que dans les quatre phrases", () => {
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx)$/.test(nom)) fichiers.push(chemin);
      }
    };
    parcourir("src");
    const fautifs = fichiers.filter((f) => {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return /nous vous (le |la |les )?rappellerons|vous recevrez un rappel|un rappel vous sera envoyé/i.test(code);
    });
    expect(fautifs).toEqual(["src/lib/rendez-vous-locataire.ts"]);
  });
});
