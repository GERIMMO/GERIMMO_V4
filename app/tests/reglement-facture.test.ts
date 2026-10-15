/**
 * Décision D23 (option A) : les règles d'écran du règlement déclaratif de la facture d'intervention, sans base.
 *  - l'état calculé (déposée → validée → partiellement réglée → réglée) et ses phrases, côté gérant et côté artisan ;
 *  - la lecture du formulaire (moyen, date au jour de Paris) ;
 *  - l'e-mail à l'artisan : date et moyen, jamais de référence ni de montant de règlement, aucune promesse de virement ;
 *  - critère 10 : aucun fournisseur de paiement n'est appelé par la migration, l'action ni le module.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  etatReglementFacture,
  imputationAuLocataire,
  LIBELLES_ETAT_REGLEMENT,
  ligneReglementPourArtisan,
  lireMoyenReglement,
  MESSAGE_IMPUTATION_LOCATAIRE,
  moyenEnToutesLettres,
  phraseEtatPourArtisan,
  phraseEtatReglement,
  verifierDateReglement,
} from "../src/lib/reglement-facture";
import { messageFactureReglee } from "../src/lib/notifications";
import { eur } from "../src/lib/ged";
import { annulationHorsJournal } from "../src/lib/ecritures";
import { TYPES_EVENEMENT_INCIDENT } from "../src/lib/incidents";
import { libelleActionAudit, libelleEvenement } from "../src/lib/libelles-journaux";

const RACINE = join(__dirname, "..");
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), "utf8");

describe("l'état d'une facture d'intervention (B.4)", () => {
  const facture = (validee: boolean) => ({ montant_ttc_cents: 23968, validee_le: validee ? "2026-10-09T10:00:00Z" : null });

  it("déposée tant qu'elle n'est pas validée, même avec des lignes (la base ne les admet pas)", () => {
    expect(etatReglementFacture(facture(false), [])).toEqual({ etat: "deposee", totalRegleCents: 0, resteCents: 23968 });
  });

  it("validée sans règlement, partiellement réglée, réglée ; les règlements retirés ne comptent pas", () => {
    expect(etatReglementFacture(facture(true), []).etat).toBe("validee");
    const partiel = etatReglementFacture(facture(true), [{ montant_cents: "10000", retire_le: null }]);
    expect(partiel).toEqual({ etat: "partiellement_reglee", totalRegleCents: 10000, resteCents: 13968 });
    const soldee = etatReglementFacture(facture(true), [{ montant_cents: 10000, retire_le: null }, { montant_cents: 13968, retire_le: null }]);
    expect(soldee).toEqual({ etat: "reglee", totalRegleCents: 23968, resteCents: 0 });
    const retire = etatReglementFacture(facture(true), [{ montant_cents: 10000, retire_le: "2026-10-12T08:00:00Z" }, { montant_cents: 13968, retire_le: null }]);
    expect(retire).toEqual({ etat: "partiellement_reglee", totalRegleCents: 13968, resteCents: 10000 });
  });

  it("ne présume rien : un total au-delà de la facture (impossible en base) donne un reste à zéro, jamais négatif", () => {
    expect(etatReglementFacture(facture(true), [{ montant_cents: 30000, retire_le: null }]).resteCents).toBe(0);
  });

  it("chaque état a un libellé français pour le gérant", () => {
    expect(Object.keys(LIBELLES_ETAT_REGLEMENT).sort()).toEqual(["deposee", "partiellement_reglee", "reglee", "validee"]);
    for (const libelle of Object.values(LIBELLES_ETAT_REGLEMENT)) expect(libelle).toMatch(/^[A-ZÉ]/);
  });

  it("la phrase du gérant dit la date du règlement total ou le reste à régler", () => {
    expect(phraseEtatReglement("reglee", 0, "2026-10-12")).toBe("Réglée le 12/10/2026");
    // `eur` pose une espace insécable fine entre le nombre et le symbole : on compare à lui, pas à une chaîne tapée.
    expect(phraseEtatReglement("partiellement_reglee", 13968, null)).toBe(`Reste à régler : ${eur(139.68)}`);
    expect(phraseEtatReglement("validee", 23968, null)).toBe(`Reste à régler : ${eur(239.68)}`);
    expect(phraseEtatReglement("deposee", 23968, null)).toContain("à contrôler");
  });
});

describe("ce que l'artisan lit (B.8, réponse 3 de B.15 : la date et le moyen seulement)", () => {
  it("réglée : la date du règlement total et le moyen du dernier, « déclaré par votre client »", () => {
    expect(phraseEtatPourArtisan({ etat: "reglee", reglee_le: "2026-10-12", reglements: [{ date_reglement: "2026-10-01", moyen: "virement" }, { date_reglement: "2026-10-12", moyen: "cheque" }] }))
      .toBe("Réglée le 12/10/2026 par chèque (déclaré par votre client)");
  });

  it("partiellement réglée : le nombre de règlements, sans montant", () => {
    const phrase = phraseEtatPourArtisan({ etat: "partiellement_reglee", reglee_le: null, reglements: [{ date_reglement: "2026-10-01", moyen: "virement" }] });
    expect(phrase).toBe("Partiellement réglée : 1 règlement déclaré par votre client");
    expect(phrase).not.toMatch(/€|\d{3,}/);
    expect(phraseEtatPourArtisan({ etat: "partiellement_reglee", reglee_le: null, reglements: [{ date_reglement: "2026-10-01", moyen: "virement" }, { date_reglement: "2026-10-05", moyen: "especes" }] }))
      .toBe("Partiellement réglée : 2 règlements déclarés par votre client");
  });

  it("validée ou déposée : l'attente, dans ses mots", () => {
    expect(phraseEtatPourArtisan({ etat: "validee", reglee_le: null, reglements: [] })).toBe("Validée par votre client, règlement à venir");
    expect(phraseEtatPourArtisan({ etat: "deposee", reglee_le: null, reglements: [] })).toBe("Déposée, en attente de contrôle");
  });

  it("une ligne de règlement : « Règlement déclaré le … par … », moyen inconnu toléré", () => {
    expect(ligneReglementPourArtisan({ date_reglement: "2026-10-01", moyen: "virement" })).toBe("Règlement déclaré le 01/10/2026 par virement");
    expect(ligneReglementPourArtisan({ date_reglement: "2026-10-01", moyen: "autre" })).toBe("Règlement déclaré le 01/10/2026 par un autre moyen");
    expect(ligneReglementPourArtisan({ date_reglement: "2026-10-01", moyen: "inconnu" })).toBe("Règlement déclaré le 01/10/2026");
    expect(moyenEnToutesLettres("especes")).toBe("par espèces");
  });
});

describe("la lecture du formulaire", () => {
  it("le moyen : une des cinq valeurs du registre de l'artisan, sinon un refus qui les nomme", () => {
    expect(lireMoyenReglement("virement")).toEqual({ moyen: "virement" });
    expect(lireMoyenReglement(" cheque ")).toEqual({ moyen: "cheque" });
    expect(lireMoyenReglement("bitcoin")).toEqual({ erreur: "Choisissez le moyen de règlement : virement, chèque, espèces, carte ou autre." });
    expect(lireMoyenReglement(null)).toHaveProperty("erreur");
    // Une propriété héritée d'Object n'est pas un moyen.
    expect(lireMoyenReglement("constructor")).toHaveProperty("erreur");
  });

  it("la date : obligatoire, valide, jamais dans le futur au jour de Paris (le refus dit la date d'aujourd'hui)", () => {
    expect(verifierDateReglement("2026-10-14", "2026-10-15")).toBeNull();
    expect(verifierDateReglement("2026-10-15", "2026-10-15")).toBeNull();
    expect(verifierDateReglement("2026-10-16", "2026-10-15")).toBe("La date du règlement ne peut pas être dans le futur (aujourd'hui : 15/10/2026).");
    expect(verifierDateReglement("", "2026-10-15")).toBe("Indiquez la date du règlement.");
    expect(verifierDateReglement(null, "2026-10-15")).toBe("Indiquez la date du règlement.");
    expect(verifierDateReglement("2026-02-30", "2026-10-15")).toBe("La date du règlement n'est pas valide.");
    expect(verifierDateReglement("15/10/2026", "2026-10-15")).toBe("La date du règlement n'est pas valide.");
  });

  it("le bandeau « locataire » s'affiche pour les deux imputations à sa charge et dit qu'aucune créance n'est créée", () => {
    expect(imputationAuLocataire("locataire")).toBe(true);
    expect(imputationAuLocataire("degradation_fautive")).toBe(true);
    expect(imputationAuLocataire("proprietaire")).toBe(false);
    expect(imputationAuLocataire(null)).toBe(false);
    expect(MESSAGE_IMPUTATION_LOCATAIRE).toContain("refacturation au locataire n'est pas gérée");
    expect(MESSAGE_IMPUTATION_LOCATAIRE).toContain("aucune créance n'est créée sur le bail");
  });

  it("l'action lit le montant avec lireMontant, jamais Number() sur la saisie, et appelle la fonction de la base avec des centimes", () => {
    const action = lire("src/app/actions/reglement-facture.ts");
    expect(action).toContain('lireMontant(formData.get("montant"))');
    expect(action).not.toMatch(/Number\(\s*formData/);
    expect(action).not.toMatch(/parseFloat/);
    expect(action).toContain("p_montant_cents: montantCents");
    expect(action).toContain("Math.round(lu.montant * 100)");
    // D08 : chaque geste financier se nomme à la porte des gestes.
    expect(action).toContain('geste: "reglement_facture", cible: factureId');
    expect(action).toContain('geste: "retrait_reglement_facture", cible: reglementId');
    // L'e-mail part APRÈS le succès de la fonction, par notifierEnCoulisses.
    expect(action.indexOf('rpc("enregistrer_reglement_facture"')).toBeLessThan(action.indexOf("notifierEnCoulisses("));
  });
});

describe("l'e-mail à l'artisan (réponse 4 de B.15 : automatique, après le succès)", () => {
  const base = { emetteur: "Cabinet Martin", numero: "F-2026-17", dateReglement: "2026-10-12", moyen: "cheque", lien: "https://exemple.fr/artisan/facturation" };

  it("dit le règlement déclaré, la date et le moyen, et que Gerimmo ne paie rien", () => {
    const m = messageFactureReglee({ ...base, partiel: false });
    expect(m.sujet).toBe("Votre client a déclaré le règlement de la facture n° F-2026-17");
    expect(m.html).toContain("Cabinet Martin a déclaré le règlement de votre facture n° F-2026-17, le 12/10/2026 par chèque.");
    expect(m.html).toContain("Gerimmo n&#39;effectue aucun paiement");
    expect(m.html).toContain("https://exemple.fr/artisan/facturation");
    expect(m.html).not.toMatch(/€/);
    expect(m.html).not.toMatch(/IBAN|référence/i);
  });

  it("un règlement partiel se dit partiel", () => {
    const m = messageFactureReglee({ ...base, partiel: true, moyen: "virement" });
    expect(m.html).toContain("Règlement partiel déclaré par votre client");
    expect(m.html).toContain("a déclaré un règlement partiel de votre facture n° F-2026-17, le 12/10/2026 par virement.");
    expect(m.html).toContain("reste partiellement réglée");
  });

  it("échappe le numéro et l'émetteur venus de la saisie", () => {
    const m = messageFactureReglee({ ...base, numero: "<b>F</b>", emetteur: "A & B", partiel: false });
    expect(m.html).not.toContain("<b>F</b>");
    expect(m.html).toContain("&lt;b&gt;F&lt;/b&gt;");
    expect(m.html).toContain("A &amp; B");
  });
});

describe("le journal, le fil et les traces nomment le règlement", () => {
  it("le journal comptable dit où se retire une écriture née d'un règlement", () => {
    expect(annulationHorsJournal({ systeme: false, contre_ecriture_de: null, reglement_facture: "F-2026-17" }))
      .toBe("née du règlement de la facture n° F-2026-17 : se retire depuis la fiche de l’incident");
    // Une contre-écriture reste « annulation » ; une écriture libre reste annulable.
    expect(annulationHorsJournal({ systeme: false, contre_ecriture_de: "x", reglement_facture: "F-2026-17" })).toBe("annulation");
    expect(annulationHorsJournal({ systeme: false, contre_ecriture_de: null })).toBeNull();
  });

  it("les deux événements du fil ont un libellé (jamais un code technique à l'écran)", () => {
    expect(TYPES_EVENEMENT_INCIDENT.facture_reglee).toBe("Règlement de facture enregistré");
    expect(TYPES_EVENEMENT_INCIDENT.reglement_retire).toBe("Règlement de facture retiré");
  });

  it("les trois actions d'audit et l'événement technique ont un libellé français", () => {
    for (const action of ["facture_validee", "reglement_facture_enregistre", "reglement_facture_retire"]) {
      expect(libelleActionAudit(action)).not.toBe("Action enregistrée (libellé manquant)");
      expect(libelleActionAudit(action)).toMatch(/facture/i);
    }
    expect(libelleEvenement("facture_reglee")).toBe("Règlement de facture déclaré à l’artisan");
  });
});

describe("critère 10 : aucun fournisseur de paiement n'est appelé (vérification statique)", () => {
  const FOURNISSEURS = /stripe|gocardless|mollie|paypal|sepa|prelev|virement_sortant|payout|transfer|iban\b/i;
  it.each([
    "supabase/migrations/20261014610000_reglement_facture_intervention.sql",
    "src/app/actions/reglement-facture.ts",
    "src/lib/reglement-facture.ts",
    "src/app/agence/[orgId]/incidents/reglement-facture.tsx",
    "src/app/agence/[orgId]/incidents/factures-incident.tsx",
  ])("%s ne nomme aucun fournisseur ni ordre de paiement", (chemin) => {
    const source = lire(chemin);
    // Le mot « virement » désigne le MOYEN déclaré par le propriétaire (liste fermée), jamais un ordre émis par Gerimmo.
    const sansMoyens = source.replace(/'virement'|"virement"|virement: "Virement"|par virement|Virement/g, "");
    expect(sansMoyens).not.toMatch(FOURNISSEURS);
    expect(source).not.toMatch(/fetch\(|https?:\/\/api\./);
  });

  it("la migration dit elle-même qu'aucun paiement n'est déclenché, et ferme les fonctions à anon", () => {
    const sql = lire("supabase/migrations/20261014610000_reglement_facture_intervention.sql");
    expect(sql).toMatch(/AUCUN paiement, virement ni prélèvement n'est déclenché/);
    expect(sql).toContain("select public.fermer_fonctions_a_anon();");
    expect(sql).toContain("supabase/retours-arriere/20261014610000_reglement_facture_intervention.retour.sql");
    expect(sql).not.toMatch(/\bcurrent_date\b/i);
  });
});
