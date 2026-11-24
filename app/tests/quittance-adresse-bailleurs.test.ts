/**
 * Phase 3 de la mission palier 1, lot 48 (U07) — la quittance délivrée au locataire d'un propriétaire qui gère lui-même
 * imprime l'adresse des bailleurs, comme le PDF de la même quittance.
 *
 * Le défaut : la page /quittance/[id] (et le document de « Mes documents », et le lien des e-mails de quittance) associait le
 * NOM des bailleurs à l'ADRESSE du profil de l'espace ; le PDF (documents/modeles/quittance.ts, `expediteur`) imprime le nom
 * ET l'adresse des détenteurs. Deux adresses d'émetteur pour la même quittance. `quittance_document` rend désormais l'adresse
 * des bailleurs chez un propriétaire direct (migration 20261123230000, vérifiée en base dans
 * tests/quittance-adresse-bailleurs-base.test.ts).
 * Chaque cas ci-dessous échouait avant le correctif (sauf les deux témoins « inchangé »).
 */
import { describe, expect, it } from "vitest";
import { assemblerQuittanceDelivree, manquantsQuittance } from "@/lib/quittance-conforme";
import { expediteur } from "@/lib/documents/modeles/communs";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { personne } from "./fixtures/contexte-document";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[\s  ]+/g, " ").trim();
const enTeteDe = (html: string) => texte(html.split('<div class="cartouche-ref">')[0].split('<header class="entete">')[1] ?? "");

const ORGANISATION = {
  type: "proprietaire_direct", nom: "Parc de Claire Moreau", siret: null, carte_pro: null,
  adresse: "8 avenue des Tilleuls", code_postal: "69006", ville: "Lyon", telephone: null, email: "parc@exemple.fr",
};
/** La quittance d'un propriétaire direct telle que `quittance_document` la rend après la migration 20261123230000. */
const delivree = (bailleurs: Record<string, unknown>[]) =>
  quittanceDocumentComplete({ organisation: { ...ORGANISATION }, bailleurs: bailleurs as never });

describe("U07 — quittance délivrée d'un propriétaire qui gère lui-même : l'en-tête des bailleurs, comme le PDF", () => {
  it("le nom ET l'adresse de la bailleresse, sa commune au « Fait à » ; plus l'adresse du profil de l'espace", () => {
    const doc = assemblerQuittanceDelivree(delivree([{ nom: "Moreau", prenom: "Claire", adresse: "3 rue du Domicile", code_postal: "69100", ville: "Villeurbanne" }]));
    expect(enTeteDe(doc.html)).toContain("Moreau Claire");
    expect(enTeteDe(doc.html)).toContain("3 rue du Domicile, 69100 Villeurbanne");
    expect(enTeteDe(doc.html)).not.toContain("8 avenue des Tilleuls");
    expect(texte(doc.html)).toMatch(/Fait à Villeurbanne ?, le 05\/09\/2026/);
    expect(doc.emetteur).toBe("detenteurs");
    expect(manquantsQuittance(doc)).toEqual([]);
  });

  it("la même adresse que le PDF de la quittance (expediteur), deux bailleurs à deux adresses compris", () => {
    const fiches = [
      personne({ id: "p1", nom: "Moreau", prenom: "Claire", address_line1: "3 rue du Domicile", postal_code: "69002", city: "Lyon" }),
      personne({ id: "p2", nom: "Petit", prenom: "Marc", address_line1: "12 quai Perrache", postal_code: "69002", city: "Lyon" }),
    ];
    const pdf = expediteur({ organisation: { name: ORGANISATION.nom, type: "proprietaire_direct", address_line1: ORGANISATION.adresse, postal_code: ORGANISATION.code_postal, city: ORGANISATION.ville, telephone: null, email_contact: ORGANISATION.email }, bailleurs: fiches });
    const doc = assemblerQuittanceDelivree(delivree(fiches.map((p) => ({ nom: p.nom, prenom: p.prenom, adresse: p.address_line1, code_postal: p.postal_code, ville: p.city }))));
    // L'adresse est celle du PDF, mot pour mot (les noms, eux, se joignent déjà chacun à sa façon, hors de ce correctif).
    expect(enTeteDe(doc.html)).toContain(`${pdf.adresse}`);
    expect(pdf.adresse).toBe("3 rue du Domicile, 69002 Lyon · 12 quai Perrache, 69002 Lyon");
  });

  it("un bailleur sans adresse : à renseigner sur sa fiche, comme le PDF ; la quittance n'est pas délivrée", () => {
    const q = delivree([{ nom: "Moreau", prenom: "Claire", adresse: null, code_postal: null, ville: null }]);
    const doc = assemblerQuittanceDelivree(q);
    expect(enTeteDe(doc.html)).not.toContain("8 avenue des Tilleuls");
    expect(manquantsQuittance(doc)).toEqual(expect.arrayContaining(["domicile ou siège social", "commune"]));
    for (const m of ["domicile ou siège social", "commune"]) {
      expect(lienPourManquant(m, q.organization_id, [{ entite: "bail", entiteId: q.bail_id }], "quittance", "/espace", doc.emetteur)?.href).toBe("/espace/org-1/personnes");
    }
  });

  it("inchangé : sans les clés d'adresse (migration pas encore appliquée), l'en-tête reste celui d'avant", () => {
    const doc = assemblerQuittanceDelivree(delivree([{ nom: "Moreau", prenom: "Claire" }]));
    expect(enTeteDe(doc.html)).toContain("8 avenue des Tilleuls, 69006 Lyon");
    expect(doc.emetteur).toBe("espace");
  });

  it("inchangé : en agence, l'agence émet à l'adresse de son profil", () => {
    const doc = assemblerQuittanceDelivree(quittanceDocumentComplete());
    expect(enTeteDe(doc.html)).toContain("Agence Alpha");
    expect(enTeteDe(doc.html)).toContain("3 place de la Mairie, 75004 Paris");
    expect(doc.emetteur).toBe("espace");
  });
});
