/**
 * Courriels des alertes de conservation (plan de conformité du 23/10/2026, lot 1E ; lib/alertes-conservation.ts).
 * Sans base, sans envoi réel : la base est une doublure de `rpc`, l'expéditeur une doublure d'`envoyerEmail`.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleCourrielConservation,
  dateFrancaise,
  envoyerAlertesConservation,
  lienAlerteConservation,
  messageAlerteConservation,
  type AlerteConservation,
  type ExpediteurAlerte,
} from "../src/lib/alertes-conservation";
import { ArretSupervision } from "../src/lib/controle-effets";

const ORG = "11111111-1111-4111-8111-111111111111";
const BAIL = "22222222-2222-4222-8222-222222222222";
const PERSONNE = "33333333-3333-4333-8333-333333333333";
const TEXTE_J30 = "Les pièces suivantes du bail Lot A · Camille Exemple seront supprimées le 23/11/2026, au terme de leur durée de conservation (page confidentialité) : Bail signé. Téléchargez celles que vous devez conserver. Si un litige est en cours, signalez-le depuis la fiche du bail pour suspendre la suppression.";
const TEXTE_J15 = "Les pièces de Dominique Exemple, qui n'est rattachée à aucun bail, seront supprimées le 08/11/2026. Si cette personne est locataire ou caution d'un bail, rattachez-la au bail avant cette date.";

function alerte(partiel: Partial<AlerteConservation> = {}): AlerteConservation {
  return {
    alerte_id: "44444444-4444-4444-8444-444444444444",
    organization_id: ORG,
    organisation: "Espace fictif",
    proprietaire_direct: true,
    type: "conservation_echeance",
    titre: TEXTE_J30,
    details: { bail_id: BAIL, echeance: "2026-11-23" },
    destinataires: ["gerant@example.invalid"],
    ...partiel,
  };
}

/** Une base fictive : la file d'attente et les notations successives. */
function base(alertes: AlerteConservation[], reservation = true) {
  const notes: [string, string][] = [];
  const rpc = vi.fn(async (nom: string, args: Record<string, unknown>) => {
    if (nom === "alertes_conservation_a_envoyer") return { data: alertes, error: null };
    if (nom === "noter_courriel_alerte_conservation") {
      notes.push([String(args.p_alerte), String(args.p_etat)]);
      return { data: args.p_etat === "reserve" ? reservation : true, error: null };
    }
    return { data: null, error: { message: "inconnu" } };
  });
  return { db: { rpc } as unknown as SupabaseClient, notes, rpc };
}

describe("alertes de conservation — textes", () => {
  it("le courriel reprend le texte de l'alerte (celui du plan), sans donnée personnelle dans le sujet, avec un seul lien", () => {
    const m = messageAlerteConservation(alerte(), "https://gerimmo.example");
    // Relecture du 24/10 : le sujet annonce une suppression à venir, il ne se lit pas comme un fait accompli.
    expect(m.sujet).toBe("Des pièces d’un bail seront supprimées le 23/11/2026");
    expect(m.sujet).not.toMatch(/Camille/);
    expect(m.html).toContain("Les pièces suivantes du bail Lot A · Camille Exemple seront supprimées le 23/11/2026");
    expect(m.html).toContain(`https://gerimmo.example/espace/${ORG}/baux/${BAIL}#conservation`);
    expect(m.html).toContain("Ouvrir la fiche du bail");
    const j15 = messageAlerteConservation(alerte({ type: "conservation_sans_bail", titre: TEXTE_J15, details: { person_id: PERSONNE, echeance: "2026-11-08" }, proprietaire_direct: false }), "https://gerimmo.example");
    expect(j15.sujet).toBe("Des pièces d’une personne sans bail seront supprimées le 08/11/2026");
    expect(j15.html).toContain("qui n&#39;est rattachée à aucun bail");
    expect(j15.html).toContain(`https://gerimmo.example/agence/${ORG}/personnes/${PERSONNE}#pieces`);
  });

  it("J-30 des documents rattachés à aucun bail : sujet, texte de l'alerte, lien vers les documents de l'espace", () => {
    const texte = "Les documents suivants, qui ne sont rattachés à aucun bail, seront supprimés le 20/11/2026, au terme de leur durée de conservation (page confidentialité) : Note. Téléchargez ceux que vous devez conserver.";
    const m = messageAlerteConservation(alerte({ type: "conservation_documents", titre: texte, details: { echeance: "2026-11-20" } }), "https://gerimmo.example");
    expect(m.sujet).toBe("Des documents seront supprimés le 20/11/2026");
    expect(m.html).toContain("Les documents suivants, qui ne sont rattachés à aucun bail, seront supprimés le 20/11/2026");
    expect(m.html).toContain(`https://gerimmo.example/espace/${ORG}/documents`);
    expect(m.html).toContain("Ouvrir les documents de l’espace");
  });

  it("sans adresse du site, aucun lien n'est promis ; un identifiant mal formé ne fabrique pas de lien", () => {
    expect(lienAlerteConservation(alerte(), null)).toBeNull();
    expect(lienAlerteConservation(alerte({ details: { bail_id: "../x", echeance: "2026-11-23" } }), "https://gerimmo.example")).toBeNull();
    expect(messageAlerteConservation(alerte(), null).html).toContain("connectez-vous à votre espace");
    expect(dateFrancaise("2026-01-05")).toBe("05/01/2026");
  });

  it("la clé d'idempotence est stable par alerte et destinataire, sans l'adresse en clair", () => {
    const a = cleCourrielConservation("a1", "Gerant@Example.invalid ");
    expect(a).toBe(cleCourrielConservation("a1", "gerant@example.invalid"));
    expect(a).not.toContain("example");
    expect(a).not.toBe(cleCourrielConservation("a2", "gerant@example.invalid"));
  });
});

describe("alertes de conservation — envoi", () => {
  it("réserve, envoie à chaque gérant, puis note « envoye »", async () => {
    const { db, notes } = base([alerte({ destinataires: ["a@example.invalid", "b@example.invalid", "a@example.invalid"] })]);
    const expedier = vi.fn(async () => ({ id: "msg" })) as unknown as ExpediteurAlerte;
    const bilan = await envoyerAlertesConservation(db, { expedier, site: "https://gerimmo.example" });
    expect(bilan).toMatchObject({ envoyees: 1, echecs: 0, incertaines: 0 });
    expect(expedier).toHaveBeenCalledTimes(2);
    expect(notes.map((n) => n[1])).toEqual(["reserve", "envoye"]);
  });

  it("refus certain : « echec » (repris plus tard) ; délai dépassé : « incertain » (jamais renvoyé) ; aucun gérant : « sans_destinataire »", async () => {
    const refus = base([alerte()]);
    expect(await envoyerAlertesConservation(refus.db, { expedier: (async () => ({ erreur: "refus" })) as unknown as ExpediteurAlerte })).toMatchObject({ echecs: 1 });
    expect(refus.notes.map((n) => n[1])).toEqual(["reserve", "echec"]);
    const delai = base([alerte()]);
    expect(await envoyerAlertesConservation(delai.db, { expedier: (async () => ({ erreur: "délai", incertain: true })) as unknown as ExpediteurAlerte })).toMatchObject({ incertaines: 1 });
    expect(delai.notes.map((n) => n[1])).toEqual(["reserve", "incertain"]);
    const seul = base([alerte({ destinataires: [] })]);
    const expedier = vi.fn();
    expect(await envoyerAlertesConservation(seul.db, { expedier: expedier as unknown as ExpediteurAlerte })).toMatchObject({ sans_destinataire: 1 });
    expect(expedier).not.toHaveBeenCalled();
  });

  it("une alerte déjà réservée n'est pas renvoyée ; la file illisible est dite, sans envoi", async () => {
    const deja = base([alerte()], false);
    const expedier = vi.fn();
    expect(await envoyerAlertesConservation(deja.db, { expedier: expedier as unknown as ExpediteurAlerte })).toMatchObject({ ignorees: 1, envoyees: 0 });
    expect(expedier).not.toHaveBeenCalled();
    const illisible = { rpc: vi.fn(async () => ({ data: null, error: { message: "x" } })) } as unknown as SupabaseClient;
    expect(await envoyerAlertesConservation(illisible, { expedier: expedier as unknown as ExpediteurAlerte })).toMatchObject({ lecture_impossible: true });
  });

  it("un arrêt d'urgence interrompt la passe : la réservation en cours est retirée, rien d'autre ne part", async () => {
    const { db, notes } = base([alerte(), alerte({ alerte_id: "55555555-5555-4555-8555-555555555555" })]);
    let appels = 0;
    const avantEffet = async () => { if (++appels === 2) throw new ArretSupervision("rappels"); };
    const expedier = (async (p: { avantEnvoi?: () => Promise<void> }) => { await p.avantEnvoi?.(); return { id: "x" }; }) as unknown as ExpediteurAlerte;
    await expect(envoyerAlertesConservation(db, { expedier, avantEffet })).rejects.toBeInstanceOf(ArretSupervision);
    expect(notes).toEqual([["44444444-4444-4444-8444-444444444444", "reserve"], ["44444444-4444-4444-8444-444444444444", "echec"]]);
  });
});
