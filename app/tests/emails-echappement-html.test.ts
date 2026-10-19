/**
 * Audit du 13/10/2026 (AUD-B-01) : toute valeur saisie qui entre dans le HTML d'un
 * courrier (prénom, nom de lot, émetteur, adresse, motif, nom d'organisation)
 * est échappée. Un « <b>… » saisi en prénom ne doit jamais devenir une balise
 * dans le message que le locataire ou l'artisan reçoit — c'est déjà la règle de
 * la quittance (audit agence du 27/09) ; elle manquait aux relances, aux avis
 * d'échéance, aux rappels de rendez-vous et aux courriers d'abonnement.
 */
import { describe, expect, it } from "vitest";
import { corpsAvisEcheance } from "../src/lib/appel-email";
import { corpsRappel } from "../src/lib/rappel-email";
import { corpsRelance } from "../src/lib/relance-paiement-email";
import { corpsInformationCaution, corpsRelanceLoyer } from "../src/lib/relance-loyer-email";

const HOSTILE = `<img src=x onerror=alert(1)> "Dupont" & fils`;
const ECHAPPE = "&lt;img src=x onerror=alert(1)&gt; &quot;Dupont&quot; &amp; fils";

function sansBaliseInjectee(html: string) {
  expect(html).not.toContain("<img");
  expect(html).not.toContain("onerror=alert(1)>");
  expect(html).toContain(ECHAPPE);
}

describe("les courriers n'interprètent jamais une valeur saisie comme du HTML", () => {
  it("relance de loyer : prénom, lot, émetteur", () => {
    const html = corpsRelanceLoyer({
      niveau: "relance_1",
      prenom: HOSTILE,
      emetteur: HOSTILE,
      lot: HOSTILE,
      periode: "2026-09-01",
      dateEcheance: "2026-09-01",
      reste: 400,
      lien: "https://gerimmo.fr/locataire/org/loyers",
    });
    sansBaliseInjectee(html);
  });

  it("information de la caution : locataire, lot, émetteur", () => {
    const html = corpsInformationCaution({
      emetteur: HOSTILE,
      locataire: HOSTILE,
      lot: HOSTILE,
      periode: "2026-09-01",
      dateEcheance: "2026-09-01",
      totalDu: 800,
    });
    sansBaliseInjectee(html);
  });

  it("avis d'échéance : prénom et émetteur", () => {
    const html = corpsAvisEcheance({
      periode: "2026-10-01",
      loyerHc: 700,
      charges: 50,
      resteDu: 750,
      dateEcheance: "2026-10-01",
      prorata: false,
      arriere: 0,
      emetteur: HOSTILE,
      prenom: HOSTILE,
      lien: "https://gerimmo.fr/locataire/org/loyers",
    });
    sansBaliseInjectee(html);
  });

  it.each(["locataire", "artisan"] as const)("rappel de rendez-vous (%s) : tous les champs saisis", (destinataire) => {
    const html = corpsRappel({
      echeance: "veille",
      destinataire,
      prenom: HOSTILE,
      emetteur: HOSTILE,
      artisan: HOSTILE,
      lot: HOSTILE,
      adresseBien: HOSTILE,
      debutPrevu: "2026-10-15T08:00:00Z",
      finPrevue: "2026-10-15T10:00:00Z",
      incidentNumero: HOSTILE,
      categorie: HOSTILE,
    });
    sansBaliseInjectee(html);
  });

  it("relance d'abonnement : nom de l'organisation", () => {
    const html = corpsRelance({
      palier: 0,
      organisation: HOSTILE,
      periodicite: "mensuel",
      montantPeriodeCents: 2900,
      joursRestants: 7,
      lectureSeuleLe: "2026-10-20",
      lien: "https://gerimmo.fr/abonnement",
    });
    sansBaliseInjectee(html);
  });

  it("un lien portant une esperluette reste une URL valide dans l'attribut", () => {
    const html = corpsAvisEcheance({
      periode: "2026-10-01",
      loyerHc: 700,
      charges: 50,
      resteDu: 750,
      dateEcheance: "2026-10-01",
      prorata: false,
      arriere: 0,
      emetteur: "Parc de Claire Moreau",
      lien: "https://gerimmo.fr/loyers?mois=2026-10&bail=1",
    });
    expect(html).toContain('href="https://gerimmo.fr/loyers?mois=2026-10&amp;bail=1"');
  });
});
