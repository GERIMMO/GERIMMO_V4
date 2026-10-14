/**
 * Les clés anti-doublon des e-mails de tâche (décision D47, fiche IA-04).
 *
 * Une clé doit être STABLE (la même d'une passe à l'autre pour le même objet et
 * le même destinataire), DISTINCTE (deux destinataires, deux niveaux ou deux
 * rendez-vous ne se confondent jamais), et ne jamais porter d'adresse e-mail.
 * Le service d'e-mail limite une clé à 256 caractères.
 *
 * Elle doit aussi SUIVRE LE CONTENU (relecture du 14/10) : le service refuse
 * (409) une clé réutilisée avec un autre contenu. Quand l'état de l'objet change
 * entre deux passes — un reçu devient quittance, un règlement réduit le montant
 * dû —, le courrier change et la clé avec lui ; tant qu'il ne change pas, la clé
 * ne bouge pas.
 */
import { describe, expect, it } from "vitest";
import {
  centimes,
  cleAvisEcheance,
  cleQuittance,
  cleRappelGeste,
  cleRappelRendezVous,
  cleRelanceAbonnement,
  cleRelanceLoyer,
  LONGUEUR_MAX_CLE,
} from "../src/lib/cles-idempotence-courriels";

const BAIL = "b41d0000-0000-4000-8000-000000000002";

describe("montant en centimes", () => {
  it("écrit « 700 » et « 700.00 » de la même façon, sans passer par un calcul flottant", () => {
    expect(centimes(700)).toBe("70000");
    expect(centimes("700.00")).toBe("70000");
    expect(centimes("700")).toBe("70000");
    expect(centimes(700.1)).toBe("70010");
    expect(centimes("0.50")).toBe("50");
    expect(centimes(0)).toBe("0");
    expect(centimes(1234567.89)).toBe("123456789");
    expect(centimes(0.1 + 0.2)).toBe("30");
  });
  it("garde une valeur absente ou illisible telle quelle plutôt que de lever, de façon stable", () => {
    expect(centimes(null)).toBe("aucun");
    expect(centimes(undefined)).toBe("aucun");
    expect(centimes("beaucoup")).toMatch(/^brut-[0-9a-f]{12}$/);
    expect(centimes("beaucoup")).toBe(centimes("beaucoup"));
    expect(centimes(Number.NaN)).toMatch(/^brut-/);
  });
});

describe("quittance", () => {
  const base = { quittanceId: "9ccce3bb-0000-4000-8000-000000000001", estQuittance: true, montant: 700, destinataire: "marc@exemple.fr" };
  it("part de « quittance/<id> » donné par la décision, puis dit ce que le document est : quittance ou reçu, et pour quel montant", () => {
    expect(cleQuittance(base)).toMatch(/^quittance\/9ccce3bb-0000-4000-8000-000000000001\/q\/70000\/[0-9a-f]{64}$/);
    expect(cleQuittance({ ...base, estQuittance: false, montant: 400 })).toMatch(/\/r\/40000\//);
  });
  it("est stable pour un même document, quelle que soit l'écriture du montant ou la casse de l'adresse", () => {
    expect(cleQuittance(base)).toBe(cleQuittance({ ...base, montant: "700.00", destinataire: " Marc@Exemple.fr " }));
  });
  it("change quand le reçu devient quittance, quand le montant change ou quand l'adresse change", () => {
    const cle = cleQuittance({ ...base, estQuittance: false, montant: 400 });
    expect(cleQuittance({ ...base, estQuittance: true, montant: 400 })).not.toBe(cle);
    expect(cleQuittance({ ...base, estQuittance: false, montant: 700 })).not.toBe(cle);
    expect(cleQuittance({ ...base, estQuittance: false, montant: 400, destinataire: "lea@exemple.fr" })).not.toBe(cle);
    expect(cleQuittance({ ...base, quittanceId: "autre" })).not.toBe(cleQuittance(base));
  });
  it("ne contient pas l'adresse", () => {
    expect(cleQuittance(base)).not.toMatch(/marc|exemple|@/);
  });
});

describe("avis d'échéance", () => {
  const base = { appelId: "a-1", destinataire: "marc@exemple.fr", resteDu: 750, arriere: 0 };
  it("est stable pour un même avis et un même destinataire, quelle que soit la casse de l'adresse", () => {
    expect(cleAvisEcheance({ ...base, destinataire: "Marc@Exemple.fr" })).toBe(cleAvisEcheance({ ...base, destinataire: " marc@exemple.fr " }));
  });
  it("distingue les destinataires d'un même avis et les avis entre eux", () => {
    expect(cleAvisEcheance(base)).not.toBe(cleAvisEcheance({ ...base, destinataire: "lea@exemple.fr" }));
    expect(cleAvisEcheance(base)).not.toBe(cleAvisEcheance({ ...base, appelId: "a-2" }));
  });
  it("suit le montant de l'échéance et l'arriéré que l'avis annonce", () => {
    expect(cleAvisEcheance({ ...base, resteDu: 250 })).not.toBe(cleAvisEcheance(base));
    expect(cleAvisEcheance({ ...base, arriere: 120 })).not.toBe(cleAvisEcheance(base));
    expect(cleAvisEcheance({ ...base, resteDu: "750.00" })).toBe(cleAvisEcheance(base));
  });
  it("ne contient pas l'adresse", () => {
    expect(cleAvisEcheance(base)).not.toMatch(/marc|exemple|@/);
  });
});

describe("relance de loyer", () => {
  const base = { bailId: BAIL, niveau: "relance_1", dateEcheance: "2026-09-05", destinataire: "marc@exemple.fr", role: "locataire" as const, reste: "700.00", totalDu: "700.00" as string | null };
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
  it("suit le reste dû et le total que le courrier annonce, pas leur écriture", () => {
    const cle = cleRelanceLoyer(base);
    expect(cleRelanceLoyer({ ...base, reste: "400.00" })).not.toBe(cle);
    expect(cleRelanceLoyer({ ...base, totalDu: "1400.00" })).not.toBe(cle);
    expect(cleRelanceLoyer({ ...base, reste: 700, totalDu: 700 })).toBe(cle);
    expect(cleRelanceLoyer({ ...base, totalDu: null })).not.toBe(cle);
  });
  it("ne contient pas l'adresse", () => {
    expect(cleRelanceLoyer(base)).not.toMatch(/marc|exemple|@/);
  });
});

describe("relance de paiement d'abonnement", () => {
  const base = { organisationId: "org-1", palier: 0 as 0 | 1 | 2 | 3, lectureSeuleLe: "2026-10-28", joursRestants: 14, montantMensuel: 49, destinataire: "gerant@exemple.fr" };
  it("est stable d'une passe à l'autre, quelle que soit la casse de l'adresse", () => {
    expect(cleRelanceAbonnement(base)).toBe(cleRelanceAbonnement({ ...base, destinataire: " Gerant@Exemple.fr" }));
  });
  it("distingue l'organisation, le palier, la date de lecture seule et le destinataire", () => {
    const cle = cleRelanceAbonnement(base);
    expect(cleRelanceAbonnement({ ...base, organisationId: "org-2" })).not.toBe(cle);
    expect(cleRelanceAbonnement({ ...base, palier: 2 })).not.toBe(cle);
    expect(cleRelanceAbonnement({ ...base, lectureSeuleLe: "2026-11-04" })).not.toBe(cle);
    expect(cleRelanceAbonnement({ ...base, destinataire: "autre@exemple.fr" })).not.toBe(cle);
  });
  it("ne contient pas l'adresse", () => {
    expect(cleRelanceAbonnement(base)).not.toMatch(/gerant|exemple|@/);
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
      cleQuittance({ quittanceId: long, estQuittance: true, montant: 700, destinataire: "a@b.fr" }),
      cleAvisEcheance({ appelId: long, destinataire: "a@b.fr", resteDu: 750, arriere: 0 }),
      cleRelanceLoyer({ bailId: long, niveau: "relance_2", dateEcheance: "2026-09-05", destinataire: "a@b.fr", role: "caution", reste: 700, totalDu: 700 }),
      cleRelanceAbonnement({ organisationId: long, palier: 1, lectureSeuleLe: "2026-10-28", joursRestants: 5, montantMensuel: 49, destinataire: "a@b.fr" }),
      cleRappelRendezVous({ interventionId: long, echeance: "j7", destinataire: "artisan", debutPrevu: "2026-10-20T08:00:00Z" }),
      cleRappelGeste(long),
    ]) {
      expect(cle.length).toBeLessThanOrEqual(LONGUEUR_MAX_CLE);
    }
    // Replié, elle reste stable.
    const quittance = { quittanceId: long, estQuittance: true, montant: 700, destinataire: "a@b.fr" };
    expect(cleQuittance(quittance)).toBe(cleQuittance(quittance));
  });
  it("une clé qui sortirait de l'ASCII imprimable (inacceptable dans un en-tête HTTP) est repliée, de façon stable", () => {
    const cle = cleRappelRendezVous({ interventionId: "iv-1", echeance: "veille", destinataire: "locataire", debutPrevu: "bientôt" });
    expect(cle).toMatch(/^replie\/[0-9a-f]{64}$/);
    expect(cle).toBe(cleRappelRendezVous({ interventionId: "iv-1", echeance: "veille", destinataire: "locataire", debutPrevu: "bientôt" }));
  });
  it("les clés ordinaires ne sont pas repliées", () => {
    const avis = { appelId: "a0000000-0000-4000-8000-000000000003", destinataire: "marc@exemple.fr", resteDu: 750, arriere: 0 };
    expect(cleAvisEcheance(avis).length).toBeLessThan(LONGUEUR_MAX_CLE);
    expect(cleAvisEcheance(avis)).toMatch(/^avis-echeance\//);
  });
});
