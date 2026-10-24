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
import { corpsRelance, courrierResiliationImpaye, sujetRelance, type Palier, type RelancePaiement } from "@/lib/relance-paiement-email";
import { euros } from "@/lib/tarifs";

function relance(palier: Palier, joursRestants: number): RelancePaiement {
  return {
    palier,
    organisation: "Cabinet Martin",
    periodicite: "mensuel",
    montantPeriodeCents: 1797,
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
    // Plan du 23/10 (R26) : plus de « tout rouvre à la seconde » ; la réouverture suppose un abonnement non résilié.
    expect(corpsRelance(relance(3, 0))).toContain("Tout rouvre dès que le paiement est enregistré, tant que l'abonnement n'est pas résilié");
    expect(corpsRelance(relance(3, 0))).toContain("Rien n'est supprimé du fait de l'impayé.");
    expect(corpsRelance(relance(3, 0))).not.toContain("à la seconde");
  });
});

describe("Plan du 23/10 : mise en demeure, premier prélèvement, envois interrompus (R06, R23, R26)", () => {
  it("le courrier du jour de l'échec dit la date de résiliation possible et renvoie à l'article 15 des conditions générales", () => {
    const c = corpsRelance({ ...relance(0, 15), resiliableLe: "2026-10-12" });
    expect(c).toContain(
      "Sans règlement au 12 octobre 2026, l'abonnement pourra être résilié en application de l'article 15\n        des conditions générales ; vos données resteront consultables et exportables."
    );
    expect(c).not.toMatch(/15\.4|8\.10/);
    // Les autres paliers ne la répètent pas.
    expect(corpsRelance({ ...relance(1, 8), resiliableLe: "2026-10-12" })).not.toContain("pourra être résilié");
  });

  it("le premier prélèvement échoué a son objet et son texte : saisie et envois suspendus depuis l'échec", () => {
    const r = { ...relance(0, 15), premierPrelevement: true, enDefautDepuis: "2026-09-12", resiliableLe: "2026-10-12" };
    expect(sujetRelance(r)).toBe("Votre premier prélèvement Gerimmo n'est pas passé");
    const c = corpsRelance(r);
    expect(c).toContain(`Le premier prélèvement de votre abonnement (<strong>${euros(1797)} par mois</strong>) n'a pas abouti.`);
    expect(c).toContain("la saisie de nouvelles données et les envois automatiques à vos locataires sont suspendus depuis le 12 septembre 2026");
    expect(c).toContain("Dès que le paiement aboutit, la saisie et les envois reprennent pour l'avenir.");
    expect(c).toContain("Sans règlement au 12 octobre 2026, l'abonnement pourra être résilié en application de l'article 15\n        des conditions générales.");
    // Jamais « reste ouvert jusqu'au » : ce compte est gelé dès l'échec.
    expect(c).not.toContain("reste entièrement ouvert");
  });

  it("l'avis de la veille annonce aussi l'arrêt des envois automatiques", () => {
    expect(corpsRelance(relance(2, 1))).toContain("Les envois automatiques à vos locataires s'arrêteront aussi.");
  });

  it("chaque courrier dit que les envois automatiques sont interrompus en lecture seule, sans rattrapage complet", () => {
    for (const p of [0, 1, 2, 3] as Palier[]) {
      const c = corpsRelance(relance(p, 3)).replace(/\s+/g, " ");
      expect(c, `palier ${p}`).toContain("tout reste consultable et exportable, même en lecture seule");
      expect(c, `palier ${p}`).toContain("les envois automatiques à vos locataires (appels de loyer, quittances, relances) sont interrompus jusqu'au règlement ; ceux de la période d'interruption ne sont pas tous rattrapés.");
    }
  });

  it("le courrier de résiliation pour impayé : date, article 15, sort de la facture, données conservées", () => {
    const annulee = courrierResiliationImpaye({ organisation: "Cabinet Martin", resilieLe: "2026-11-12", factures: "annulees", lien: "https://gerimmo.app/espace/abc/abonnement", apresMiseEnDemeure: true });
    const texte = annulee.html.replace(/\s+/g, " ");
    expect(texte).toContain("Faute de règlement, votre abonnement Gerimmo est résilié depuis le 12 novembre 2026, en application de l'article 15 des conditions générales. La facture restée impayée est annulée.");
    expect(texte).toContain("Vos données restent consultables et exportables en lecture seule ; rien n'est supprimé du fait de cette résiliation. Pour reprendre la saisie, souscrivez de nouveau depuis « Mon abonnement ».");
    expect(courrierResiliationImpaye({ organisation: "X", resilieLe: "2026-11-12", factures: "aucune", lien: null, apresMiseEnDemeure: true }).html).not.toContain("facture");
    expect(courrierResiliationImpaye({ organisation: "X", resilieLe: "2026-11-12", factures: "a_annuler", lien: null, apresMiseEnDemeure: true }).html).toContain("sera annulée : vous n'avez rien à régler");
  });

  it("relecture adverse du 24/10 (I1) : avant trente jours de mise en demeure, les faits sans l'article 15", () => {
    const t = courrierResiliationImpaye({ organisation: "X", resilieLe: "2026-11-03", factures: "annulees", lien: null, apresMiseEnDemeure: false }).html.replace(/\s+/g, " ");
    expect(t).toContain("Faute de règlement, votre abonnement Gerimmo a été résilié le 3 novembre 2026. La facture restée impayée est annulée.");
    expect(t).not.toContain("article 15");
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

describe("Le montant annoncé est celui que le prélèvement demandait", () => {
  // Audit du 19/10 (lot mineurs, a) : pour un abonnement annuel, `montant_mensuel` est un douzième calculé ; le
  // courrier disait « 4,99 € par mois » quand la banque avait refusé 59,90 € pour l'année.
  it("abonnement mensuel : le montant du mois, « par mois »", () => {
    expect(corpsRelance(relance(0, 15))).toContain(`${euros(1797)} par mois`);
  });

  it("abonnement annuel : le montant de l'année, « par an » — jamais un douzième « par mois »", () => {
    const c = corpsRelance({ ...relance(0, 15), periodicite: "annuel", montantPeriodeCents: 5990 });
    expect(c).toContain(`${euros(5990)} par an`);
    expect(c).not.toContain("par mois");
    expect(c).not.toContain("4,99");
  });
});
