import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { construireTachesAccueil, regrouperTachesAccueil, SEUIL_REGROUPEMENT_TACHES, type GroupeTaches } from "@/lib/taches-accueil-proprietaire";
import { CarteTachesProprietaire } from "@/components/carte-taches-proprietaire";

// Décision du 27/10 (audit #264, TRV-09) : au-delà du seuil, les tâches d'une même obligation se présentent en une
// ligne « N lots : <obligation> » dépliable ; en dessous, une ligne par lot comme avant.
const base = "/espace/org";
const lots = Array.from({ length: 300 }, (_, i) => ({ id: `lot-${i}`, bien_id: `bien-${i % 30}`, nom: `Lot ${Math.floor(i / 10) + 1}-${i % 10 + 1}`, etat: "loue" }));
const attendue = (cle: string, titre: string, href: string, detail: string | null = null): ActionDuJour => ({
  cle, source: "bail", nature: "Sur un bail", criticite: "normale", titre, detail, echeance: null, href,
});
// Le parc de l'auditeur : 300 lots sans DPE, 300 baux sans état des lieux, 30 immeubles sans ERP.
const parc300 = () => construireTachesAccueil({ base, lots, lotsSansBail: [], preparation: [], diagnostics: [], actions: [
  ...lots.map(lot => attendue(`dpe-${lot.id}`, `DPE absent ou expiré — ${lot.nom}`, `${base}/parc/${lot.bien_id}/lots/${lot.id}#diagnostics`, "Obligatoire en habitation (au lot)")),
  ...lots.map((lot, i) => attendue(`edl-bail-${i}`, `État des lieux d'entrée à signer — ${lot.nom}`, `${base}/baux/bail-${i}#edl`, "Décrire l’état du logement avec le locataire à la remise des clés")),
  ...Array.from({ length: 30 }, (_, i) => attendue(`erp-bien-${i}`, `ERP absent ou expiré — Immeuble ${i + 1}`, `${base}/parc/bien-${i}#diagnostics`, "État des risques, validité 6 mois (à l'immeuble)")),
] });
const petitParc = (n: number) => construireTachesAccueil({ base, lots, lotsSansBail: lots.slice(0, n), preparation: [], diagnostics: [], actions: [] });

describe("regroupement des tâches d’un grand parc", () => {
  it("réunit 630 tâches en trois lignes, une par obligation, qui gardent chaque lot et son lien", () => {
    const taches = parc300();
    expect(taches).toHaveLength(630);
    const entrees = regrouperTachesAccueil(taches) as GroupeTaches[];
    expect(entrees.map(e => [e.titre, e.unite, e.detail, e.taches.length])).toEqual([
      ["300 lots : DPE absent ou expiré", "lots", "Obligatoire en habitation (au lot)", 300],
      ["300 lots : État des lieux d'entrée à signer", "lots", "Décrire l’état du logement avec le locataire à la remise des clés", 300],
      ["30 biens : ERP absent ou expiré", "biens", "État des risques, validité 6 mois (à l'immeuble)", 30],
    ]);
    expect(entrees[0].taches[7]).toMatchObject({ cle: "dpe-lot-7", href: `${base}/parc/bien-7/lots/lot-7#diagnostics` });
  });

  it("laisse une obligation isolée sur sa propre ligne et respecte l’ordre d’apparition", () => {
    const taches = [...petitParc(SEUIL_REGROUPEMENT_TACHES), ...construireTachesAccueil({ base, lots, lotsSansBail: [], preparation: [], diagnostics: [],
      actions: [attendue("piece-1", "Pièce expirée — Attestation", `${base}/documents?sel=1`)] })];
    const entrees = regrouperTachesAccueil(taches);
    expect(entrees).toHaveLength(2);
    expect(entrees[0]).toMatchObject({ titre: `${SEUIL_REGROUPEMENT_TACHES} lots : Préparer la location`, detail: null });
    expect(entrees[1]).toMatchObject({ cle: "piece-1", titre: "Pièce expirée — Attestation" });
  });

  it("ne change rien jusqu’au seuil : une ligne par lot", () => {
    const taches = petitParc(SEUIL_REGROUPEMENT_TACHES);
    expect(regrouperTachesAccueil(taches)).toBe(taches);
    expect(regrouperTachesAccueil(petitParc(SEUIL_REGROUPEMENT_TACHES + 1))).toHaveLength(1);
  });

  it("distingue deux obligations de même type mais de titres différents, et deux types de même titre", () => {
    const taches = construireTachesAccueil({ base, lots, lotsSansBail: [], preparation: [], diagnostics: [], actions: [
      ...Array.from({ length: 13 }, (_, i) => attendue(`dpe-${i}`, `DPE absent ou expiré — Lot ${i}`, `${base}/parc/b/lots/${i}#diagnostics`)),
      ...Array.from({ length: 13 }, (_, i) => attendue(`erp-${i}`, `DPE absent ou expiré — Immeuble ${i}`, `${base}/parc/${i}#diagnostics`)),
    ] });
    expect(regrouperTachesAccueil(taches).map(e => e.titre)).toEqual(["13 lots : DPE absent ou expiré", "13 biens : DPE absent ou expiré"]);
  });
});

describe("carte des tâches d’un grand parc", () => {
  const rendre = (taches = parc300()) => renderToStaticMarkup(createElement(CarteTachesProprietaire, { taches, base, indisponible: false, prioritesPresentes: false }));

  it("annonce toujours le nombre de tâches, présente les groupes dépliables et chaque lien de fiche", () => {
    const html = rendre();
    expect(html).toContain('aria-label="630 tâches"');
    expect(html).toContain("300 lots : DPE absent ou expiré");
    expect(html).toContain("30 biens : ERP absent ou expiré");
    expect(html.match(/<details/g)).toHaveLength(3);
    expect(html).not.toContain("autres tâches");
    expect(html.match(/<a href="\/espace\/org\/parc\/bien-\d+\/lots\/lot-\d+#diagnostics"/g)).toHaveLength(300);
    expect(html).toContain(">Lot 1-1<");
    // Le détail commun se lit une fois dans la ligne du groupe, pas 300 fois.
    expect(html.match(/Obligatoire en habitation/g)).toHaveLength(1);
    // Moins de 3 000 balises pour 630 tâches (10 000 nœuds avant la correction).
    expect(html.match(/<[a-z]/g)!.length).toBeLessThan(3000);
  });

  it("compte les tâches, pas les lignes, dans « Voir les N autres tâches »", () => {
    // Six lignes : trois groupes, deux tâches isolées, puis un groupe de deux lots à préparer, replié dans la suite.
    const taches = [...parc300(), ...construireTachesAccueil({ base, lots, lotsSansBail: [], preparation: [], diagnostics: [],
      actions: [attendue("piece-1", "Pièce expirée — A", `${base}/documents?sel=1`), attendue("impaye-1", "Loyer impayé — Lot 1", `${base}/baux/1#loyers`)] }), ...petitParc(2)];
    expect(rendre(taches)).toContain("Voir les 2 autres tâches");
    expect(rendre(taches.slice(0, -1))).toContain("Voir l’autre tâche");
  });

  it("garde l’affichage ligne par ligne d’un petit parc", () => {
    const html = rendre(petitParc(SEUIL_REGROUPEMENT_TACHES));
    expect(html).not.toContain("lots :");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain(`Voir les ${SEUIL_REGROUPEMENT_TACHES - 5} autres tâches`);
  });
});
