/**
 * Les quatre courriers de relance : ce qu'ils disent, et ce qu'ils ne disent pas.
 *
 * Un courrier de relance est lu une fois, vite, souvent sur un téléphone. Ce
 * qu'on teste ici n'est pas la mise en forme : c'est que chaque palier dit
 * quelque chose que le précédent ne disait pas, que la DATE y figure, et
 * qu'aucun ne laisse croire à une perte de données — c'est la peur qui fait
 * partir un client, pas la facture.
 */
import { describe, expect, it } from "vitest";
import { corpsRelance, sujetRelance, type Palier } from "@/lib/relance-paiement-email";

function relance(palier: Palier, joursRestants: number) {
  return {
    palier,
    organisation: "Cabinet Martin",
    montantMensuel: 17.97,
    joursRestants,
    lectureSeuleLe: "2026-09-27",
    lien: "https://gerimmo.app/agence/abc/abonnement",
  };
}

describe("Chaque palier dit autre chose", () => {
  it("les quatre sujets sont distincts", () => {
    const sujets = ([0, 1, 2, 3] as Palier[]).map((p) => sujetRelance(relance(p, 15 - p * 7)));
    expect(new Set(sujets).size).toBe(4);
  });

  it("l'alerte annonce l'échec et la date, pas la fermeture", () => {
    const c = corpsRelance(relance(0, 15));
    expect(c).toContain("n'a pas abouti");
    expect(c).toContain("27 septembre 2026");
    expect(c).toContain("reste entièrement ouvert");
  });

  it("le rappel compte les jours", () => {
    expect(sujetRelance(relance(1, 8))).toContain("8 jours");
    expect(sujetRelance(relance(1, 1))).toContain("1 jour");
    // Un « 1 jours » dans un objet d'e-mail se voit tout de suite.
    expect(sujetRelance(relance(1, 1))).not.toContain("1 jours");
  });

  it("l'avis dit « demain », le constat dit que c'est fait", () => {
    expect(corpsRelance(relance(2, 1))).toContain("Demain");
    expect(corpsRelance(relance(3, 0))).toContain("lecture seule");
    expect(corpsRelance(relance(3, 0))).toContain("rouvre à la seconde");
  });
});

describe("Ce qu'aucun courrier ne fait", () => {
  it("aucun ne laisse croire à une perte de données", () => {
    for (const p of [0, 1, 2, 3] as Palier[]) {
      const c = corpsRelance(relance(p, 15 - p * 5));
      expect(c, `palier ${p}`).toContain("vos données restent entières");
      expect(c, `palier ${p}`).toContain("exportable");
    }
  });

  it("aucun ne parle le langage de Stripe", () => {
    for (const p of [0, 1, 2, 3] as Palier[]) {
      const c = corpsRelance(relance(p, 3)).toLowerCase();
      for (const jargon of ["past_due", "unpaid", "subscription", "webhook", "stripe"]) {
        expect(c, `palier ${p} : « ${jargon} »`).not.toContain(jargon);
      }
    }
  });

  it("chacun porte le geste à faire, en un lien", () => {
    for (const p of [0, 1, 2, 3] as Palier[]) {
      const c = corpsRelance(relance(p, 3));
      expect(c).toContain("https://gerimmo.app/agence/abc/abonnement");
    }
    // Le dernier ne dit pas « mettre à jour » mais « rouvrir » : ce n'est plus
    // le même geste du point de vue de celui qui le lit.
    expect(corpsRelance(relance(3, 0))).toContain("rouvrir mon compte");
  });

  it("le montant est écrit en euros, pas en centimes", () => {
    expect(corpsRelance(relance(0, 15))).toContain("17,97");
    expect(corpsRelance(relance(0, 15))).not.toContain("1797");
  });
});
