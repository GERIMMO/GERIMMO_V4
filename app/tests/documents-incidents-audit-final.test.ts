/**
 * Audit final du 28/10/2026, domaine documents et incidents — les calculs purs corrigés, sans base.
 *  · DOC-02 : un devis à décider passe avant « Organiser la résolution » dans la carte « Prochaine étape ».
 *  · DOC-03 : le registre de l'artisan ne dit plus « Aucun règlement déclaré » quand le client a déclaré le règlement.
 *  · DOC-11 : chaque valeur de l'énumération document_type a un libellé.
 *  · DOC-14 : « Lot 2 » avant « Lot 10 ».
 *  · DOC-17 : « 1er janvier », pas « 1 janvier ».
 *  · DOC-22 : une pièce produite par l'application n'est pas « À vérifier ».
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prochaineActionIncident } from "@/app/agence/[orgId]/incidents/prochaine-action";
import { bilanReglements, type FactureArtisanPrivee } from "@/lib/artisan-prive";
import { TYPES_DOCUMENT } from "@/lib/ged";
import { comparerNaturel } from "@/lib/tri-naturel";
import { dateSimple, jourCourt, jourLong } from "@/app/artisan/libelles";
import { presentationDocument } from "@/lib/presentation-document";

describe("DOC-02 — prochaine étape d'un incident", () => {
  it("qualifié avec un devis déposé : décider du devis", () => {
    const p = prochaineActionIncident({ etat: "qualifie", aQualifier: true, decisionRequise: false, devisADecider: true });
    expect(p.titre).toBe("Décider du devis reçu");
    expect(p.cible).toBe("intervention");
  });
  it("qualifié sans devis : organiser la résolution, comme avant", () => {
    expect(prochaineActionIncident({ etat: "qualifie", aQualifier: true, decisionRequise: false, devisADecider: false }).titre)
      .toBe("Organiser la résolution");
  });
  it("la décision de prise en charge reste prioritaire, et un dossier clos ne parle plus de devis", () => {
    expect(prochaineActionIncident({ etat: "declare", aQualifier: true, decisionRequise: true, devisADecider: true }).titre)
      .toBe("Indiquer qui prend en charge");
    expect(prochaineActionIncident({ etat: "clos", aQualifier: false, decisionRequise: false, devisADecider: true }).titre)
      .toBe("Dossier clos");
  });
});

describe("DOC-03 — registre de l'artisan et règlement déclaré par le client", () => {
  const facture = { id: "f1", origine: "gerimmo", intervention_id: "i1", numero: "F-2026-001", montant_ttc_cents: 35000, client: "Agence Alpha", created_at: "2026-10-27T10:00:00Z" } as FactureArtisanPrivee;
  it("rien pointé, client « réglée » : le résumé le dit et le solde devient « Reste à pointer »", () => {
    const b = bilanReglements(facture, [], [], { etat: "reglee", reglee_le: "2026-10-27" });
    expect(b.etat).toBe("Réglée le 27/10/2026 selon votre client · réception à pointer");
    expect(b.etat).not.toContain("Aucun règlement déclaré");
    expect(b.libelleSolde).toBe("Reste à pointer");
    expect(b.solde).toBe(35000);
  });
  it("sans déclaration du client, ou facture externe : comme avant", () => {
    expect(bilanReglements(facture, [], [], { etat: "validee", reglee_le: null }).etat).toBe("Aucun règlement déclaré");
    expect(bilanReglements({ ...facture, origine: "externe" }, [], [], { etat: "reglee", reglee_le: "2026-10-27" }).libelleSolde).toBe("Solde");
  });
});

describe("DOC-11 — chaque type de document a un libellé", () => {
  it("toutes les valeurs de l'énumération document_type des migrations", () => {
    const valeurs = new Set<string>();
    for (const nom of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(`supabase/migrations/${nom}`, "utf8");
      const creation = /create type public\.document_type as enum \(([^)]*)\)/i.exec(sql);
      if (creation) for (const m of creation[1].matchAll(/'([a-z_]+)'/g)) valeurs.add(m[1]);
      for (const m of sql.matchAll(/alter type public\.document_type add value if not exists '([a-z_]+)'/gi)) valeurs.add(m[1]);
    }
    expect(valeurs.has("devis")).toBe(true);
    for (const v of valeurs) expect(TYPES_DOCUMENT[v], v).toBeTruthy();
    expect(TYPES_DOCUMENT.devis).toBe("Devis d'artisan");
  });
});

describe("DOC-14 — tri naturel des lots", () => {
  it("Lot 1, Lot 2, Lot 10", () => {
    expect(["Lot 10", "Lot 2", "Lot 1", "lot 3"].sort(comparerNaturel)).toEqual(["Lot 1", "Lot 2", "lot 3", "Lot 10"]);
  });
});

describe("DOC-17 — le premier du mois", () => {
  it("« 1er » au premier jour, le nombre seul ensuite", () => {
    expect(dateSimple("2027-01-01T12:00:00Z")).toBe("1er janvier 2027");
    expect(dateSimple("2027-01-02T12:00:00Z")).toBe("2 janvier 2027");
    expect(jourLong("2027-01-01T12:00:00Z")).toBe("vendredi 1er janvier 2027");
    expect(jourCourt("2027-01-01T12:00:00Z")).toBe("ven. 1er janv.");
    expect(dateSimple("2027-01-11T12:00:00Z")).toBe("11 janvier 2027");
  });
});

describe("DOC-22 — étiquette des pièces sans échéance", () => {
  it("pièce produite par l'application : « Classé » ; pièce à contrôler : « À vérifier »", () => {
    for (const type of ["photo_incident", "facture_artisan", "devis", "quittance", "rapport_gestion"]) {
      expect(presentationDocument({ type }).libelle, type).toBe("Classé");
    }
    for (const type of ["diagnostic", "attestation_assurance", "piece_identite", "justificatif"]) {
      expect(presentationDocument({ type }).libelle, type).toBe("À vérifier");
    }
    expect(presentationDocument({ type: "photo_incident", expire_le: "2099-01-01" }).libelle).toBe("Valide");
  });
});
