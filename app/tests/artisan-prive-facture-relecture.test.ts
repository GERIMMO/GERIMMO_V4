/**
 * D24-B (fiches ARC-07, ARC-04) : l'écran de relecture avant le dépôt d'une facture externe.
 *
 * Une facture déposée ne se modifie plus (depuis D24-C, la seule correction est son annulation par un avoir) : avant de l'envoyer,
 * l'artisan relit le numéro, le montant, l'écart avec le devis et la pièce, et l'écran dit que le dépôt est
 * définitif. Le résumé est calculé par une fonction pure ; la page et le formulaire sont rendus comme Next le fait.
 */
process.env.TZ = "UTC";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({ activite: null as unknown }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("@/app/artisan/acces", () => ({
  verifierAccesArtisan: async () => ({}),
  chargerAgenda: async () => ({ lignes: [] }),
}));
vi.mock("@/lib/artisan-prive", async () => {
  const reel = await vi.importActual<typeof import("@/lib/artisan-prive")>("@/lib/artisan-prive");
  return {
    ...reel,
    environnementArtisanLocal: () => true,
    activationArtisanLocale: () => true,
    chargerActivitePrivee: async () => ({ data: etat.activite }),
  };
});

import PageChantier from "@/app/artisan/chantiers/[chantierId]/page";
import { RelectureFacture } from "@/app/artisan/clients/relecture-facture";
import {
  JUSTIFICATION_ECART_MIN,
  MESSAGE_FACTURE_DEFINITIVE,
  resumerFacture,
  type EntreesRelectureFacture,
} from "@/lib/artisan-prive-facture";

const fichier = { nom: "facture-ART-2026-0001.pdf", taille: 123_456 };
const entrees = (surcharge: Partial<EntreesRelectureFacture> = {}): EntreesRelectureFacture => ({
  numero: "ART-2026-0001", montant: "55,00", justification: "", fichier, devisTtcCents: 5500, ...surcharge,
});

describe("resumerFacture — ce que l'artisan relit, et ce qui bloque le dépôt", () => {
  it("une facture conforme au devis : prête, aucun écart, montant au centime", () => {
    const r = resumerFacture(entrees());
    expect(r).toMatchObject({ numero: "ART-2026-0001", montantCents: 5500, ecartCents: 0, pret: true, alertes: [] });
    expect(r.piece).toEqual({ nom: "facture-ART-2026-0001.pdf", taille: "121 Ko" });
  });

  it("le numéro est montré tel qu'il sera enregistré : espaces de bord retirés, casse conservée", () => {
    expect(resumerFacture(entrees({ numero: "  Art-2026-0007  " })).numero).toBe("Art-2026-0007");
  });

  it("le montant se lit comme le fait l'action serveur : virgule ou point, deux décimales, jamais de flottant", () => {
    expect(resumerFacture(entrees({ montant: "1234,5" })).montantCents).toBe(123450);
    expect(resumerFacture(entrees({ montant: "1234.50" })).montantCents).toBe(123450);
    expect(resumerFacture(entrees({ montant: "0,29" })).montantCents).toBe(29);
    expect(resumerFacture(entrees({ montant: "19,99 €" })).montantCents).toBe(1999);
  });

  it.each(["", "abc", "12,345", "-5", "0", "0,00", "1e3"])("le montant « %s » est refusé avec le message de l'action serveur", (montant) => {
    const r = resumerFacture(entrees({ montant }));
    expect(r.montantCents).toBeNull();
    expect(r.alertes).toContain("Indiquez un montant positif, au centime.");
    expect(r.pret).toBe(false);
  });

  it("un montant différent du devis exige une justification d'au moins dix caractères", () => {
    const sans = resumerFacture(entrees({ montant: "60,00" }));
    expect(sans.ecartCents).toBe(500);
    expect(sans.pret).toBe(false);
    expect(sans.alertes[0]).toMatch(/expliquez l’écart \(10 caractères au moins\)/);
    expect(resumerFacture(entrees({ montant: "60,00", justification: "court" })).pret).toBe(false);
    const avec = resumerFacture(entrees({ montant: "60,00", justification: "Fourniture supplémentaire demandée sur place" }));
    expect(avec.pret).toBe(true);
    expect(JUSTIFICATION_ECART_MIN).toBe(10);
  });

  it("un montant inférieur au devis est un écart négatif, justifié de la même façon", () => {
    const r = resumerFacture(entrees({ montant: "50,00" }));
    expect(r.ecartCents).toBe(-500);
    expect(r.pret).toBe(false);
  });

  it("sans devis connu, aucun écart n'est calculé", () => {
    expect(resumerFacture(entrees({ devisTtcCents: null })).ecartCents).toBeNull();
  });

  it("numéro vide ou pièce absente : le dépôt est bloqué", () => {
    expect(resumerFacture(entrees({ numero: "   " })).alertes).toContain("Indiquez le numéro figurant sur la facture.");
    const r = resumerFacture(entrees({ fichier: null }));
    expect(r.alertes).toContain("Joignez la facture (PDF, JPEG ou PNG).");
    expect(r.piece).toBeNull();
    expect(r.pret).toBe(false);
  });
});

describe("RelectureFacture — l'écran", () => {
  const rendu = (surcharge: Partial<EntreesRelectureFacture> = {}) =>
    renderToStaticMarkup(createElement(RelectureFacture, { resume: resumerFacture(entrees(surcharge)) }));

  it("dit que le dépôt est définitif et montre numéro, montant TTC et pièce", () => {
    const html = rendu();
    expect(html).toContain("Relisez votre facture avant de la déposer");
    expect(html).toContain(MESSAGE_FACTURE_DEFINITIVE);
    expect(html).toContain("ART-2026-0001");
    expect(html).toMatch(/55,00\s€/);
    expect(html).toContain("facture-ART-2026-0001.pdf");
    expect(html).toContain("121 Ko");
  });

  it("sans écart : pas de ligne d'écart ; avec écart : dit de combien et dans quel sens, avec la justification", () => {
    expect(rendu()).not.toContain("Écart avec le devis");
    const plus = rendu({ montant: "60,00", justification: "Fourniture supplémentaire demandée sur place" });
    expect(plus).toContain("Écart avec le devis accepté");
    expect(plus).toMatch(/supérieur de 5,00\s€/);
    expect(plus).toContain("Fourniture supplémentaire demandée sur place");
    expect(rendu({ montant: "50,00", justification: "Une prestation n’a pas été réalisée" })).toMatch(/inférieur de 5,00\s€/);
  });

  it("un blocage est annoncé en alerte", () => {
    const html = rendu({ montant: "abc" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Indiquez un montant positif, au centime.");
  });

  it("le texte est en français soigné : jamais de code interne ni de jargon", () => {
    const html = rendu({ montant: "60,00", justification: "Fourniture supplémentaire demandée sur place" });
    expect(html).not.toMatch(/undefined|null|NaN|cents|\[object/i);
  });
});

function chantierTermine() {
  return {
    clients: [{ id: "c1", nom: "Mme Test", type: "particulier", email: "", telephone: "", adresse: "1 rue des Tests", revision: 1, archive_le: null }],
    chantiers: [{ id: "h1", client_id: "c1", titre: "Chantier TEST", adresse: "1 rue des Tests", description: "Fuite sous l’évier", statut: "termine", revision: 7, bilan: "Fuite réparée", photo_id: "p9" }],
    devis: [{
      id: "d1", chantier_id: "h1", version: 1, statut: "accepte", description: "Réparation", lignes: [], montant_ht_cents: 10000,
      montant_tva_cents: 2000, montant_ttc_cents: 12000, entreprise: { nom: "Atelier TEST", siret: "12345678901234", telephone: null, email: null, adresse: "2 rue de l’Atelier", mentions: "" },
      client: { nom: "Mme Test" }, valide_jusqu_au: "2026-11-12", pdf_id: null, preuve_acceptation_id: null, created_at: "2026-10-13T20:00:00.000Z",
    }],
    rendez_vous: [], factures: [], pieces: [], reglements: [], evenements: [],
    activation: { clients: true, reglements: true },
  };
}
const html = async (element: unknown) => renderToStaticMarkup((await element) as never);

describe("fiche du chantier terminé — le formulaire de facture passe par la relecture", () => {
  beforeEach(() => { etat.activite = chantierTermine(); });

  it("prévient avant la saisie que la facture ne se modifiera plus (seulement l'annuler par un avoir) et que le numéro doit être unique", async () => {
    const page = await html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    expect(page).toContain("Déposer la facture");
    expect(page).toContain("Une facture déposée ne se modifie plus : en cas d’erreur, vous pourrez l’annuler par un avoir");
    expect(page).toContain("les majuscules et les espaces autour ne comptent pas");
  });

  it("le premier bouton relit au lieu de déposer : le dépôt n'est possible qu'après la relecture", async () => {
    const page = await html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    expect(page).toContain("Relire avant de déposer");
    expect(page).not.toContain(">Déposer ma facture<");
    expect(page).not.toContain("Confirmer et déposer ma facture");
  });

  it("le montant proposé est celui du devis accepté, au format que la relecture lit", async () => {
    const page = await html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    const champ = page.match(/<input[^>]*inputMode="decimal"[^>]*>/)?.[0] ?? "";
    expect(champ).toContain('value="120.00"');
  });

  it("une fois la facture déposée, il n'y a plus de formulaire de dépôt", async () => {
    etat.activite = { ...chantierTermine(), factures: [{ id: "f1", origine: "externe", chantier_id: "h1", numero: "ART-1", montant_ttc_cents: 12000, piece_id: "p1", client: "Mme Test", created_at: "2026-10-13T23:30:00.000Z" }] };
    const page = await html(PageChantier({ params: Promise.resolve({ chantierId: "h1" }) }));
    expect(page).not.toContain("Relire avant de déposer");
    expect(page).toContain("Facture ART-1");
  });
});
