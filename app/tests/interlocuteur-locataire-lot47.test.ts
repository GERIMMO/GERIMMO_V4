/**
 * Phase 3, lot 47 — « votre gestionnaire » seulement dans un espace d'agence, aussi hors des PDF.
 *
 * Le lot 37 avait posé la règle dans les documents (interlocuteurLocataire) : « votre gestionnaire » en agence, « votre
 * bailleur » ailleurs. Les e-mails et les écrans du locataire disaient encore « votre gestionnaire » à tous, y compris
 * au locataire d'un propriétaire qui gère lui-même et n'a pas de gestionnaire (T22, T23). Ces tests fixent :
 *  1. la règle unique et ses lectures (identité du locataire, vue `organisations_portail`, refus écrits en base) ;
 *  2. les e-mails au locataire et à la caution (relances, rendez-vous, réponse), rendus sans envoi réel ;
 *  3. la tâche planifiée des relances, qui lit le type de chaque espace et s'arrête si elle ne le peut pas ;
 *  4. les écrans du locataire, rendus en HTML, et un garde-fou sur leurs textes.
 * Aucun e-mail n'est envoyé : le service d'e-mail est remplacé par une doublure qui garde le message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const banc = vi.hoisted(() => ({
  envoyes: [] as { to: string; subject: string; html: string }[],
  rpc: null as null | ((nom: string, args?: Record<string, unknown>) => unknown),
  types: new Map<string, string>(),
  lectureTypesEnEchec: false,
}));

vi.mock("@/lib/email", () => ({
  envoyerEmail: async (p: { to: string; subject: string; html: string }) => {
    banc.envoyes.push({ to: p.to, subject: p.subject, html: p.html });
    return { id: `fictif-${banc.envoyes.length}` };
  },
}));
// La tâche planifiée lit avec le client de service ; les notifications le consultent pour la file capturée.
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () =>
    banc.rpc
      ? {
          rpc: async (nom: string, args?: Record<string, unknown>) => banc.rpc!(nom, args),
          from: () => ({
            select: () => ({
              in: async (_colonne: string, ids: string[]) =>
                banc.lectureTypesEnEchec
                  ? { data: null, error: { message: "lecture refusée" } }
                  : { data: ids.map((id) => ({ id, type: banc.types.get(id) ?? null })), error: null },
            }),
          }),
        }
      : null,
}));

import { interlocuteurLocataire, interlocuteurMajuscule, messageDeLaBasePourLocataire } from "@/lib/interlocuteur-locataire";
import { interlocuteurLocataire as interlocuteurDesModeles } from "@/lib/documents/modeles/communs";
import { lireInterlocuteurLocataire } from "@/lib/interlocuteur-locataire-serveur";
import { identiteContactLocataire, interlocuteurDeLIdentite } from "@/lib/identite-contact-locataire";
import { corpsInformationCaution, corpsRelanceLoyer, type RelanceLoyer } from "@/lib/relance-loyer-email";
import { messageRendezVousFixe, messageReponseGestionnaire, messageReponseReportRdv, notifierReponseGestionnaire } from "@/lib/notifications";
import { libelleEtatLocataire } from "@/lib/incidents";
import { etatDemandeLocataire, raisonSansReport, type RendezVousLocataire } from "@/lib/rendez-vous-locataire";
import { corpsCourrier, corpsRappelInvitationLocataire } from "@/lib/lien-mot-de-passe";
import { SuiviInterventionLocataire, type SuiviIntervention } from "@/app/locataire/[orgId]/demandes/suivi-intervention";
import { IncidentsLocataire } from "@/app/locataire/[orgId]/incidents-locataire";
import { ReflexesUrgence } from "@/app/locataire/[orgId]/reflexes-urgence";
import { PanneLecture } from "@/app/locataire/[orgId]/panne-lecture";
import { noteSignalementFerme } from "@/app/locataire/[orgId]/types";
import { CarteConge } from "@/app/locataire/[orgId]/logement/carte-conge";
import { PlanApurementLocataire, type MonPlanApurement } from "@/components/plan-apurement-locataire";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replaceAll("&#x27;", "'").replaceAll("&nbsp;", " ").replace(/\s+/g, " ").trim();

beforeEach(() => {
  banc.envoyes = [];
  banc.rpc = null;
  banc.types = new Map();
  banc.lectureTypesEnEchec = false;
});
afterEach(() => vi.unstubAllEnvs());

// ─── 1. La règle et ses lectures ─────────────────────────────────────────────────────────────────────────────────────
describe("une seule règle : « gestionnaire » seulement dans un espace d'agence", () => {
  it("agence → gestionnaire ; propriétaire, type inconnu ou illisible → bailleur", () => {
    expect(interlocuteurLocataire("agence")).toBe("gestionnaire");
    expect(interlocuteurLocataire("proprietaire_direct")).toBe("bailleur");
    expect(interlocuteurLocataire(null)).toBe("bailleur");
    expect(interlocuteurLocataire(undefined)).toBe("bailleur");
    expect(interlocuteurMajuscule("gestionnaire")).toBe("Gestionnaire");
    expect(interlocuteurMajuscule("bailleur")).toBe("Bailleur");
  });

  it("les modèles de documents (lot 37) reprennent la même fonction, pas une copie", () => {
    expect(interlocuteurDesModeles).toBe(interlocuteurLocataire);
  });

  it("les écrans la tirent de la même identité que le titre « Mon gestionnaire » / « Mon bailleur »", () => {
    const agence = identiteContactLocataire({ type: "agence", nom: "Agence des Lilas" });
    const proprietaire = identiteContactLocataire({ type: "proprietaire_direct", bailleurs: [{ prenom: "Élise", nom: "Morel" }] });
    expect([agence.titre, interlocuteurDeLIdentite(agence)]).toEqual(["Mon gestionnaire", "gestionnaire"]);
    expect([proprietaire.titre, interlocuteurDeLIdentite(proprietaire)]).toEqual(["Mon bailleur", "bailleur"]);
    expect(interlocuteurDeLIdentite(identiteContactLocataire(null))).toBe("bailleur");
  });

  it("les actions du locataire la lisent dans organisations_portail, sans jamais lever", async () => {
    const lu: string[] = [];
    const db = (reponse: () => Promise<unknown>) =>
      ({
        from: (table: string) => {
          lu.push(table);
          return { select: () => ({ eq: () => ({ maybeSingle: reponse }) }) };
        },
      }) as unknown as SupabaseClient;
    expect(await lireInterlocuteurLocataire(db(async () => ({ data: { type: "agence" }, error: null })), "org")).toBe("gestionnaire");
    expect(await lireInterlocuteurLocataire(db(async () => ({ data: { type: "proprietaire_direct" }, error: null })), "org")).toBe("bailleur");
    expect(await lireInterlocuteurLocataire(db(async () => ({ data: { type: "agence" }, error: { message: "x" } })), "org")).toBe("bailleur");
    expect(await lireInterlocuteurLocataire(db(async () => { throw new Error("réseau"); }), "org")).toBe("bailleur");
    expect(new Set(lu)).toEqual(new Set(["organisations_portail"]));
  });

  it("les refus écrits en base pour le locataire disent « votre bailleur » hors agence, rien d'autre ne change", () => {
    const base = [
      "Ce rendez-vous a déjà fait l'objet de 2 demandes de report : pour un nouveau changement, contactez votre gestionnaire",
      "Le rendez-vous est dans moins de 24 heures : il ne peut plus être reporté ici. Vous pouvez encore l'annuler, ou appeler votre gestionnaire",
      "Votre demande est déjà transmise — votre gestionnaire la confirmera à réception de votre lettre recommandée",
      "Ce rendez-vous est passé ou a commencé : il ne peut plus être annulé ici. Contactez votre gestionnaire",
    ];
    for (const m of base) {
      expect(messageDeLaBasePourLocataire(m, "gestionnaire")).toBe(m);
      const chezProprietaire = messageDeLaBasePourLocataire(m, "bailleur");
      expect(chezProprietaire).not.toContain("gestionnaire");
      expect(chezProprietaire).toBe(m.replace("votre gestionnaire", "votre bailleur"));
    }
    expect(messageDeLaBasePourLocataire("Accès refusé.", "bailleur")).toBe("Accès refusé.");
  });
});

// ─── 2. Les e-mails ──────────────────────────────────────────────────────────────────────────────────────────────────
const relance = (niveau: RelanceLoyer["niveau"], interlocuteur: RelanceLoyer["interlocuteur"]): RelanceLoyer => ({
  niveau, prenom: "Zoé", emetteur: "Claire Moreau", lot: "Appartement Jardin", periode: "2026-10-01", dateEcheance: "2026-10-05",
  reste: 750, totalDu: 750, lien: "https://exemple.invalid/locataire/org/loyers", interlocuteur,
});

describe("e-mails de relance de loyer (T22)", () => {
  it("chez un propriétaire : payer, être mis en demeure et écrire, c'est avec « votre bailleur »", () => {
    const premiere = texteDe(corpsRelanceLoyer(relance("relance_1", "bailleur")));
    const seconde = texteDe(corpsRelanceLoyer(relance("relance_2", "bailleur")));
    expect(premiere).toContain("vous pouvez le régler par virement à votre bailleur, aux coordonnées habituelles.");
    expect(seconde).toContain("votre bailleur pourra vous adresser une mise en demeure par lettre recommandée");
    for (const t of [premiere, seconde]) {
      expect(t).toContain("Une difficulté de paiement ? Écrivez à votre bailleur : une solution se trouve toujours plus tôt que tard.");
      expect(t).not.toMatch(/gestionnaire/i);
    }
  });

  it("en agence : le texte d'avant, « votre gestionnaire »", () => {
    expect(texteDe(corpsRelanceLoyer(relance("relance_1", "gestionnaire")))).toContain("par virement à votre gestionnaire, aux coordonnées habituelles.");
    expect(texteDe(corpsRelanceLoyer(relance("relance_2", "gestionnaire")))).toContain("votre gestionnaire pourra vous adresser une mise en demeure");
  });

  it("l'information de la caution renvoie au bailleur chez un propriétaire, au gestionnaire du bail en agence", () => {
    const c = { emetteur: "Claire Moreau", locataire: "Zoé Martin", lot: "Appartement Jardin", periode: "2026-10-01", dateEcheance: "2026-10-05", totalDu: 750 };
    const proprietaire = texteDe(corpsInformationCaution({ ...c, interlocuteur: "bailleur" }));
    expect(proprietaire).toContain("Pour toute question, écrivez au bailleur.");
    expect(proprietaire).not.toMatch(/gestionnaire/i);
    expect(texteDe(corpsInformationCaution({ ...c, interlocuteur: "gestionnaire" }))).toContain("Pour toute question, écrivez au gestionnaire du bail.");
  });
});

describe("e-mails d'intervention et de messagerie (T22)", () => {
  const rdv = { emetteur: "Claire Moreau", prenom: "Zoé", categorie: "plomberie_canalisation", debut: "2026-12-03T07:00:00Z", fin: "2026-12-03T09:00:00Z", adresse: null, artisan: "Plomberie Dubois", lien: null };
  it("rendez-vous fixé : le locataire prévient son bailleur chez un propriétaire, son gestionnaire en agence", () => {
    expect(texteDe(messageRendezVousFixe({ ...rdv, destinataire: "locataire", interlocuteur: "bailleur" }).html))
      .toContain("Si vous ne pouvez pas être présent, prévenez votre bailleur au plus tôt.");
    expect(texteDe(messageRendezVousFixe({ ...rdv, destinataire: "locataire", interlocuteur: "gestionnaire" }).html))
      .toContain("prévenez votre gestionnaire au plus tôt.");
    // L'artisan ne lit aucune de ces deux phrases.
    expect(texteDe(messageRendezVousFixe({ ...rdv, destinataire: "artisan", interlocuteur: "bailleur" }).html)).not.toMatch(/prévenez votre/);
  });

  it("report refusé par l'artisan : c'est le bailleur qui appelle, chez un propriétaire", () => {
    const m = messageReponseReportRdv({
      emetteur: "Claire Moreau", prenom: "Zoé", categorie: "plomberie_canalisation", reponse: { type: "refusee", motif: null },
      rdvDebut: "2026-12-03T07:00:00Z", rdvFin: "2026-12-03T09:00:00Z", lien: null, interlocuteur: "bailleur",
    });
    expect(texteDe(m.html)).toContain("Votre bailleur va vous appeler pour trouver une solution.");
    expect(texteDe(m.html)).not.toMatch(/gestionnaire/i);
  });

  it("réponse à un message : « Votre bailleur a répondu » chez un propriétaire", () => {
    expect(texteDe(messageReponseGestionnaire({ emetteur: "Claire Moreau", prenom: "Zoé", lien: null, interlocuteur: "bailleur" }).html))
      .toContain("Votre bailleur a répondu à votre message.");
    expect(texteDe(messageReponseGestionnaire({ emetteur: "Agence des Lilas", prenom: "Zoé", lien: null, interlocuteur: "gestionnaire" }).html))
      .toContain("Votre gestionnaire a répondu à votre message.");
  });

  /** Un client de gérant fictif : la personne, l'organisation (nom et type), le dernier message non lu. */
  function clientGerant(type: string | null) {
    const lignes: Record<string, unknown> = {
      persons: { email: "zoe@exemple.invalid", prenom: "Zoé" },
      organizations: { name: "ESSAI espace", nom_portail: null, type },
      messages: { id: "msg-1" },
    };
    const chaine = (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order", "limit", "in"]) c[m] = () => c;
      c.maybeSingle = async () => ({ data: lignes[table] ?? null, error: null });
      return c;
    };
    return { from: (table: string) => chaine(table), rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
  }

  it("la notification de réponse lit le type de l'espace avant d'écrire au locataire", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.invalid");
    expect(await notifierReponseGestionnaire(clientGerant("proprietaire_direct"), "org-1", "p-1")).toMatchObject({ envoyee: true });
    expect(await notifierReponseGestionnaire(clientGerant("agence"), "org-2", "p-1")).toMatchObject({ envoyee: true });
    expect(texteDe(banc.envoyes[0].html)).toContain("Votre bailleur a répondu à votre message.");
    expect(texteDe(banc.envoyes[1].html)).toContain("Votre gestionnaire a répondu à votre message.");
  });
});

describe("invitation du locataire : un texte vrai dans les deux espaces", () => {
  it("l'invitation et sa relance ne disent plus « votre gestionnaire » seul", () => {
    const invitation = texteDe(corpsCourrier("invitation_locataire", "https://exemple.invalid/l", "https://exemple.invalid"));
    const rappel = texteDe(corpsRappelInvitationLocataire("https://exemple.invalid/l", "https://exemple.invalid", "2026-12-14T10:00:00Z"));
    expect(invitation).toContain("Votre bailleur, ou son gestionnaire, vous propose un espace locataire sur Gerimmo.");
    expect(rappel).toContain("Votre bailleur, ou son gestionnaire, vous a proposé un espace locataire sur Gerimmo");
    for (const t of [invitation, rappel]) expect(t).not.toMatch(/Votre gestionnaire vous/);
  });
});

// ─── 3. La tâche planifiée des relances ──────────────────────────────────────────────────────────────────────────────
describe("tâche planifiée des relances : le type de chaque espace", () => {
  const SECRET = "secret-de-recette-suffisamment-long";
  const ligne = (org: string, destinataire: string) => ({
    bail_id: `bail-${org}`, organization_id: org, niveau: "relance_2", destinataire, prenom: "Zoé", emetteur: "ESSAI",
    lot: "Lot A", periode: "2026-10-01", date_echeance: "2026-10-05", reste: "700.00", jours_retard: 30, total_du: "700.00",
    autres_destinataires: [], garants: [`caution-${org}@exemple.invalid`], locataire: "Zoé Martin",
  });
  const passe = async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.invalid");
    const { traiterRelances } = await import("../src/lib/missions-planifiees/relances");
    return traiterRelances(new Request("https://exemple.invalid/api/cron/relances", { headers: { authorization: `Bearer ${SECRET}` } }));
  };
  const rpcDu = (lignes: unknown[]) => async (nom: string) => {
    if (nom === "relances_loyer_dues") return { data: lignes, error: null };
    if (["verifier_arret_supervision", "relance_loyer_envoi_confirme"].includes(nom)) return { data: true, error: null };
    if (nom === "envoi_automatique_ouvert") return { data: false, error: null };
    return { data: null, error: null };
  };

  it("une agence et un propriétaire dans la même passe : chacun son interlocuteur, locataire et caution", async () => {
    banc.types = new Map([["org-agence", "agence"], ["org-proprio", "proprietaire_direct"]]);
    banc.rpc = rpcDu([ligne("org-agence", "loc-agence@exemple.invalid"), ligne("org-proprio", "loc-proprio@exemple.invalid")]);
    await passe();
    const pour = (to: string) => texteDe(banc.envoyes.find((e) => e.to === to)?.html ?? "");
    expect(pour("loc-agence@exemple.invalid")).toContain("votre gestionnaire pourra vous adresser une mise en demeure");
    expect(pour("caution-org-agence@exemple.invalid")).toContain("écrivez au gestionnaire du bail.");
    expect(pour("loc-proprio@exemple.invalid")).toContain("votre bailleur pourra vous adresser une mise en demeure");
    expect(pour("loc-proprio@exemple.invalid")).not.toMatch(/gestionnaire/i);
    expect(pour("caution-org-proprio@exemple.invalid")).toContain("écrivez au bailleur.");
  });

  it("type illisible : la passe s'arrête avant tout envoi (500), comme une lecture des relances en échec", async () => {
    banc.lectureTypesEnEchec = true;
    banc.rpc = rpcDu([ligne("org-proprio", "loc-proprio@exemple.invalid")]);
    const r = await passe();
    expect(r.status).toBe(500);
    expect(banc.envoyes).toHaveLength(0);
  });
});

// ─── 4. Les écrans du locataire ──────────────────────────────────────────────────────────────────────────────────────
const rv = (partiel: Partial<RendezVousLocataire>): RendezVousLocataire => ({
  intervention_id: "iv", incident_id: "inc", statut_mission: "planifiee", rdv_debut: "2026-12-03T07:00:00Z", rdv_fin: "2026-12-03T09:00:00Z",
  report_possible: false, annulation_possible: true, reports_restants: 0, demande_id: null, demande_type: null, demande_statut: null,
  demande_motif_code: null, demandee_le: null, expire_le: null, repondu_le: null, reponse_motif: null, demande_rdv_debut: null,
  demande_rdv_fin: null, nouveau_debut: null, nouvelle_fin: null, tardive: false, annulation_tardive: false, ...partiel,
});
const suivi = (partiel: Partial<SuiviIntervention>): SuiviIntervention => ({
  incident_id: "inc", etape: "recherche", intervention_id: "iv", artisan: null, nb_artisans_consultes: 0, nb_devis_recus: 0,
  rdv_debut: null, rdv_fin: null, terminee_le: null, creneaux_a_choisir: 0, mes_creneaux_en_attente: 0, creneaux_refuses: 0,
  arbitrage: false, travaux_realises: null, nouvelle_intervention_necessaire: false, photos_apres: [], deja_notee: false, ...partiel,
});

describe("écrans du locataire d'un propriétaire (T23)", () => {
  it("l'état d'un signalement : « votre bailleur l'examine »", () => {
    expect(libelleEtatLocataire("declare", null, "bailleur")).toBe("Reçu — votre bailleur l'examine");
    expect(libelleEtatLocataire("declare", null, "gestionnaire")).toBe("Reçu — votre gestionnaire l'examine");
  });

  it("le rendez-vous : refus, échéance, arbitrage et raisons de ne plus reporter nomment le bailleur", () => {
    const qui = { interlocuteur: "bailleur" as const };
    expect(etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "refusee" }), qui)?.titre)
      .toBe("L'artisan ne peut pas : votre bailleur va vous appeler");
    expect(etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "expiree" }), qui)?.detail)
      .toBe("Votre rendez-vous actuel est maintenu. Votre bailleur est prévenu et peut vous appeler.");
    expect(etatDemandeLocataire(rv({ demande_id: "d", demande_type: "report", demande_statut: "arbitree" }), qui)?.titre)
      .toBe("Votre bailleur a fixé le rendez-vous");
    expect(etatDemandeLocataire(rv({ statut_mission: "acceptee", demande_id: "d", demande_type: "annulation", demande_statut: "acceptee" }), qui)?.detail)
      .toContain("L'artisan et votre bailleur sont prévenus.");
    expect(raisonSansReport(rv({ reports_restants: 0 }), "bailleur")).toMatch(/pour le changer encore, appelez votre bailleur\.$/);
    expect(raisonSansReport(rv({ reports_restants: 1, annulation_tardive: true }), "bailleur")).toMatch(/ou appeler votre bailleur\.$/);
  });

  it("le suivi d'intervention dit qui consulte, compare et appelle", () => {
    const ecran = (s: Partial<SuiviIntervention>) =>
      texteDe(renderToStaticMarkup(createElement(SuiviInterventionLocataire, { orgId: "org", suivi: suivi(s), creneaux: [], peutAgir: true, interlocuteur: "bailleur" })));
    expect(ecran({ etape: "recherche" })).toContain("Votre bailleur consulte des artisans pour cette réparation.");
    expect(ecran({ etape: "devis_recus", nb_devis_recus: 2 })).toContain("Votre bailleur les compare et choisit l'artisan.");
    expect(ecran({ etape: "creneaux_attendus", arbitrage: true })).toContain("Votre bailleur va vous appeler");
    for (const etape of ["recherche", "devis_recus", "reaffectation", "reaffectation_agence"]) expect(ecran({ etape })).not.toMatch(/gestionnaire/i);
  });

  it("la liste des demandes, le bail pas encore actif : le contrat signé est déposé par le bailleur", () => {
    const html = texteDe(renderToStaticMarkup(createElement(IncidentsLocataire, { orgId: "org", incidents: [], peutSignaler: false, interlocuteur: "bailleur" })));
    expect(html).toContain(noteSignalementFerme("bailleur"));
    expect(noteSignalementFerme("bailleur")).toMatch(/déposé par votre bailleur\.$/);
    expect(noteSignalementFerme("gestionnaire")).toMatch(/déposé par votre gestionnaire\.$/);
  });

  it("la carte d'urgence, le bandeau de panne et le plan de paiement", () => {
    expect(texteDe(renderToStaticMarkup(ReflexesUrgence({ hrefSignalement: "/x", interlocuteur: "bailleur" })))).toContain("votre bailleur est alors prévenu par e-mail.");
    expect(texteDe(renderToStaticMarkup(ReflexesUrgence({ interlocuteur: "bailleur" })))).toContain("Prévenez ensuite votre bailleur pour organiser le suivi.");
    expect(texteDe(renderToStaticMarkup(PanneLecture({ quoi: "vos documents", interlocuteur: "bailleur" })))).toContain("si cela dure, prévenez votre bailleur.");
    const plan = {
      plan_id: "p", etat: "propose", date_arrete: "2026-10-01", dette_initiale: 1400, acompte: 0, mensualite: 200, nombre_tranches: 7,
      premiere_echeance: "2026-11-05", date_acceptation: null, conditions: null, document_id: null, document_signe_id: null, dette_restante: 1400,
      tranches: [], demande_en_cours: false,
    } as MonPlanApurement;
    const html = texteDe(renderToStaticMarkup(createElement(PlanApurementLocataire, { orgId: "org", plan, demandeEnCours: false, detteEchue: 1400, interlocuteur: "bailleur" })));
    expect(html).toContain("Proposé par votre bailleur");
    expect(html).toContain("Votre bailleur vous a proposé ce plan.");
    expect(html).not.toMatch(/gestionnaire/i);
  });

  it("l'annonce du départ : « Bailleur prévenu », et la lettre recommandée adressée au bailleur", () => {
    const html = texteDe(renderToStaticMarkup(createElement(CarteConge, { orgId: "org", enPreavis: false, dateFin: null, preavisMois: 3, intentionDu: "2026-11-02", interlocuteur: "bailleur" })));
    expect(html).toContain("Bailleur prévenu le 02/11/2026");
    expect(html).toContain("à votre bailleur — c'est elle qui fait courir votre préavis");
    expect(html).not.toMatch(/gestionnaire/i);
  });
});

// Garde-fou : aucun texte de l'espace locataire ne dit plus « gestionnaire » en dur. Les commentaires ne comptent pas ;
// seuls les choix explicites selon l'espace sont admis (`agence ?` de l'identité, `=== "gestionnaire" ?`).
describe("garde-fou sur les textes de l'espace locataire", () => {
  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap((n) => {
      const p = join(dossier, n);
      return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
  }
  const sansCommentaires = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const sources = [
    ...fichiers("src/app/locataire"),
    "src/components/plan-apurement-locataire.tsx",
    "src/lib/rendez-vous-locataire.ts",
    "src/lib/relance-loyer-email.ts",
    "src/app/actions/incidents-locataire.ts",
    "src/app/actions/conge-locataire.ts",
    "src/app/actions/attestation-locataire.ts",
    "src/app/actions/signature-locataire.ts",
    "src/app/actions/pieces-demandees.ts",
    "src/app/actions/plan-apurement.ts",
  ];
  it.each(sources)("%s", (fichier) => {
    const lignes = sansCommentaires(readFileSync(fichier, "utf8"))
      .split("\n")
      .filter((l) => /([Vv]otre|[Mm]on|au) gestionnaire\b/.test(l) && !/agence \?|=== "gestionnaire" \?/.test(l));
    expect(lignes).toEqual([]);
  });
});
