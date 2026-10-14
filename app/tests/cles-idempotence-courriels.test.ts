/**
 * Les clés anti-doublon des e-mails de tâche (décision D47, fiche IA-04).
 *
 * Une clé doit être STABLE (la même d'une passe à l'autre pour le même objet et
 * le même destinataire), DISTINCTE (deux destinataires, deux niveaux ou deux
 * rendez-vous ne se confondent jamais), et ne jamais porter d'adresse e-mail.
 * Le service d'e-mail limite une clé à 256 caractères.
 */
import { describe, expect, it } from "vitest";
import {
  cleAvisEcheance,
  cleQuittance,
  cleRappelGeste,
  cleRappelRendezVous,
  cleRelanceLoyer,
  LONGUEUR_MAX_CLE,
} from "../src/lib/cles-idempotence-courriels";

const BAIL = "b41d0000-0000-4000-8000-000000000002";

describe("quittance", () => {
  it("suit le patron « quittance/<id> » donné par la décision", () => {
    expect(cleQuittance("9ccce3bb-0000-4000-8000-000000000001")).toBe("quittance/9ccce3bb-0000-4000-8000-000000000001");
  });
});

describe("avis d'échéance", () => {
  it("est stable pour un même avis et un même destinataire, quelle que soit la casse de l'adresse", () => {
    expect(cleAvisEcheance("a-1", "Marc@Exemple.fr")).toBe(cleAvisEcheance("a-1", " marc@exemple.fr "));
  });
  it("distingue les destinataires d'un même avis et les avis entre eux", () => {
    expect(cleAvisEcheance("a-1", "marc@exemple.fr")).not.toBe(cleAvisEcheance("a-1", "lea@exemple.fr"));
    expect(cleAvisEcheance("a-1", "marc@exemple.fr")).not.toBe(cleAvisEcheance("a-2", "marc@exemple.fr"));
  });
  it("ne contient pas l'adresse", () => {
    expect(cleAvisEcheance("a-1", "marc@exemple.fr")).not.toMatch(/marc|exemple|@/);
  });
});

describe("relance de loyer", () => {
  const base = { bailId: BAIL, niveau: "relance_1", dateEcheance: "2026-09-05", destinataire: "marc@exemple.fr", role: "locataire" as const };
  it("est stable d'une passe à l'autre", () => {
    expect(cleRelanceLoyer(base)).toBe(cleRelanceLoyer({ ...base }));
  });
  it("distingue le niveau, le terme relancé, le destinataire et le rôle (locataire ou caution)", () => {
    const cle = cleRelanceLoyer(base);
    expect(cleRelanceLoyer({ ...base, niveau: "relance_2" })).not.toBe(cle);
    expect(cleRelanceLoyer({ ...base, dateEcheance: "2026-10-05" })).not.toBe(cle);
    expect(cleRelanceLoyer({ ...base, destinataire: "lea@exemple.fr" })).not.toBe(cle);
    expect(cleRelanceLoyer({ ...base, role: "caution" })).not.toBe(cle);
  });
  it("ne contient pas l'adresse", () => {
    expect(cleRelanceLoyer(base)).not.toMatch(/marc|exemple|@/);
  });
});

describe("rappel de rendez-vous", () => {
  const base = { interventionId: "iv-1", echeance: "veille", destinataire: "locataire", debutPrevu: "2026-10-20T08:00:00+00:00" };
  it("dit la même chose pour un même instant, quel que soit le format de la date", () => {
    expect(cleRappelRendezVous(base)).toBe("rappel/iv-1/veille/locataire/2026-10-20T08:00:00.000Z");
    expect(cleRappelRendezVous({ ...base, debutPrevu: "2026-10-20T10:00:00+02:00" })).toBe(cleRappelRendezVous(base));
  });
  it("distingue l'échéance, le destinataire et un rendez-vous déplacé", () => {
    const cle = cleRappelRendezVous(base);
    expect(cleRappelRendezVous({ ...base, echeance: "j7" })).not.toBe(cle);
    expect(cleRappelRendezVous({ ...base, destinataire: "artisan" })).not.toBe(cle);
    expect(cleRappelRendezVous({ ...base, debutPrevu: "2026-10-21T08:00:00+00:00" })).not.toBe(cle);
  });
  it("garde une date illisible telle quelle plutôt que de lever", () => {
    expect(cleRappelRendezVous({ ...base, debutPrevu: "bientot" })).toBe("rappel/iv-1/veille/locataire/bientot");
  });
});

describe("rappel de geste", () => {
  it("reprend la clé « type:objet » déjà utilisée pour la trace", () => {
    expect(cleRappelGeste("piece_demandee:p1")).toBe("rappel-geste/piece_demandee:p1");
  });
});

describe("longueur", () => {
  it("reste sous la limite du service, même avec des identifiants démesurés", () => {
    const long = "x".repeat(400);
    for (const cle of [
      cleQuittance(long),
      cleAvisEcheance(long, "a@b.fr"),
      cleRelanceLoyer({ bailId: long, niveau: "relance_2", dateEcheance: "2026-09-05", destinataire: "a@b.fr", role: "caution" }),
      cleRappelRendezVous({ interventionId: long, echeance: "j7", destinataire: "artisan", debutPrevu: "2026-10-20T08:00:00Z" }),
      cleRappelGeste(long),
    ]) {
      expect(cle.length).toBeLessThanOrEqual(LONGUEUR_MAX_CLE);
    }
    // Replié, elle reste stable.
    expect(cleQuittance(long)).toBe(cleQuittance(long));
  });
  it("une clé qui sortirait de l'ASCII imprimable (inacceptable dans un en-tête HTTP) est repliée, de façon stable", () => {
    const cle = cleRappelRendezVous({ interventionId: "iv-1", echeance: "veille", destinataire: "locataire", debutPrevu: "bientôt" });
    expect(cle).toMatch(/^replie\/[0-9a-f]{64}$/);
    expect(cle).toBe(cleRappelRendezVous({ interventionId: "iv-1", echeance: "veille", destinataire: "locataire", debutPrevu: "bientôt" }));
  });
  it("les clés ordinaires ne sont pas repliées", () => {
    expect(cleAvisEcheance("a0000000-0000-4000-8000-000000000003", "marc@exemple.fr").length).toBeLessThan(LONGUEUR_MAX_CLE);
    expect(cleAvisEcheance("a0000000-0000-4000-8000-000000000003", "marc@exemple.fr")).toMatch(/^avis-echeance\//);
  });
});
