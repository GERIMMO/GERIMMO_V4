import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActionDuJour } from "@/lib/actions-du-jour";
import { construireTachesAccueil, lieuTache, regrouperTachesAccueil, SEUIL_REGROUPEMENT_TACHES, type GroupeTaches } from "@/lib/taches-accueil-proprietaire";
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
const alerte = (id: string, type: string, titre: string, details: Record<string, unknown> | null = null, echeance: string | null = null, detail: string | null = null): ActionDuJour => ({
  cle: `a-${id}`, source: "alerte", type, nature: "Alerte normale", criticite: "normale", titre, detail, echeance, href: null,
  alerte: { id, type, titre, criticite: "normale", echeance, details, created_at: "2026-10-26", assignee_account_id: null, assigned_all: true, escalades: null },
});
// Relecture TRV-09 : 10 colocations de 3 chambres, un bail par chambre sans état des lieux — 30 baux, 10 lots.
const colocations = () => construireTachesAccueil({ base, lots, lotsSansBail: [], preparation: [], diagnostics: [], actions:
  lots.slice(0, 10).flatMap(lot => [1, 2, 3].map(ch => attendue(`edl-bail-${lot.id}-${ch}`, `État des lieux d'entrée à signer — ${lot.nom} · Chambre ${ch}`, `${base}/baux/bail-${lot.id}-${ch}#edl`, "Décrire l’état du logement avec le locataire à la remise des clés"))) });

describe("regroupement des tâches d’un grand parc", () => {
  it("réunit 630 tâches en trois lignes, une par obligation, qui gardent chaque lot et son lien", () => {
    const taches = parc300();
    expect(taches).toHaveLength(630);
    const entrees = regrouperTachesAccueil(taches) as GroupeTaches[];
    expect(entrees.map(e => [e.titre, e.unite, e.detail, e.taches.length])).toEqual([
      ["300 lots : DPE absent ou expiré", "lots", "Obligatoire en habitation (au lot)", 300],
      ["300 baux : État des lieux d'entrée à signer", "baux", "Décrire l’état du logement avec le locataire à la remise des clés", 300],
      ["30 biens : ERP absent ou expiré", "biens", "État des risques, validité 6 mois (à l'immeuble)", 30],
    ]);
    expect(entrees[0].taches[7]).toMatchObject({ cle: "dpe-lot-7", href: `${base}/parc/bien-7/lots/lot-7#diagnostics` });
  });

  it("colocation : 10 lots, 30 baux sans EDL → « 30 baux », une ligne par chambre dans le dépliage", () => {
    const taches = colocations();
    expect(taches).toHaveLength(30);
    const [groupe] = regrouperTachesAccueil([...taches, ...petitParc(0), ...parc300().slice(600, 630)]) as GroupeTaches[];
    expect(groupe.titre).toBe("30 baux : État des lieux d'entrée à signer");
    expect(groupe.unite).toBe("baux");
    expect(groupe.titre).not.toContain("lots");
    const libelles = groupe.taches.map(lieuTache);
    expect(new Set(libelles).size).toBe(30);
    expect(libelles.slice(0, 4)).toEqual(["Lot 1-1 · Chambre 1", "Lot 1-1 · Chambre 2", "Lot 1-1 · Chambre 3", "Lot 1-2 · Chambre 1"]);
  });

  it("trie le dépliage par lot, dans l'ordre naturel (Lot 1-2 avant Lot 1-10), et compte en lots ce qui se pose par lot", () => {
    const melange = [...lots].reverse();
    const taches = construireTachesAccueil({ base, lots, lotsSansBail: melange.slice(0, 30), preparation: [], diagnostics: [], actions: [] });
    const [groupe] = regrouperTachesAccueil(taches) as GroupeTaches[];
    expect(groupe.titre).toBe("30 lots : Préparer la location");
    expect(groupe.taches.map(lieuTache).slice(0, 12)).toEqual(["Lot 28-1", "Lot 28-2", "Lot 28-3", "Lot 28-4", "Lot 28-5", "Lot 28-6", "Lot 28-7", "Lot 28-8", "Lot 28-9", "Lot 28-10", "Lot 29-1", "Lot 29-2"]);
  });

  it("compte les alertes en demandes, garde leur titre entier et nomme le lot dans le dépliage", () => {
    // Deux devis sur le même lot, une zone tendue dont le titre contient « — » sans que ce soit un lot (avec et sans lot connu).
    const taches = construireTachesAccueil({ base, lots, lotsSansBail: lots.slice(0, 25), preparation: [], diagnostics: [], actions: [
      alerte("d1", "devis_recu", "Devis reçu, à décider", { lot_id: "lot-0", montant: 1200 }, "2026-11-05", "1 200,00 €"),
      alerte("d2", "devis_recu", "Devis reçu, à décider", { lot_id: "lot-0", montant: 850 }, "2026-11-02", "850,00 €"),
      alerte("z1", "zone_tendue_a_verifier", "Zone tendue non renseignée — préavis du locataire à vérifier", { lot_id: "lot-3" }),
      alerte("z2", "zone_tendue_a_verifier", "Zone tendue non renseignée — préavis du locataire à vérifier", null),
      alerte("i1", "loyer_impaye", "Loyer impayé — Lot 1-2 : 780,00 € dus depuis le 5 octobre", { lot_id: "lot-1" }),
      alerte("i2", "loyer_impaye", "Loyer impayé — Lot 1-3 : 780,00 € dus depuis le 5 octobre", { lot_id: "lot-2" }),
    ] });
    const [devis, zones, impayes] = regrouperTachesAccueil(taches) as GroupeTaches[];
    expect(devis).toMatchObject({ titre: "2 demandes : Devis reçu, à décider", unite: "demandes", detail: null, echeance: "2026-11-02" });
    expect(devis.taches.map(t => [lieuTache(t), t.detail, t.href])).toEqual([
      ["Lot 1-1", "1 200,00 €", `${base}/alertes?traiter=d1`], ["Lot 1-1", "850,00 €", `${base}/alertes?traiter=d2`],
    ]);
    expect(zones.titre).toBe("2 demandes : Zone tendue non renseignée — préavis du locataire à vérifier");
    expect(zones.taches.map(lieuTache)).toEqual(["Lot 1-4", "Zone tendue non renseignée — préavis du locataire à vérifier"]);
    // Le titre d'une alerte qui finit par le lot connu se découpe comme une action calculée.
    expect(impayes.titre).toBe("2 demandes : Loyer impayé");
    expect(impayes.taches.map(lieuTache)).toEqual(["Lot 1-2 : 780,00 € dus depuis le 5 octobre", "Lot 1-3 : 780,00 € dus depuis le 5 octobre"]);
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

  it("colocation : la ligne annonce des baux et le dépliage distingue chaque chambre, sans préchargement des fiches", () => {
    const html = rendre([...colocations(), ...parc300().slice(600, 630)]);
    expect(html).toContain("<b>30 baux : État des lieux d&#x27;entrée à signer</b>");
    expect(html).not.toContain("30 lots");
    expect(html).toContain("Voir les baux");
    expect(html.match(/>Lot 1-\d+ · Chambre \d</g)).toHaveLength(30);
    expect(html).toContain(">Lot 1-1 · Chambre 1<");
  });

  it("montre l'échéance la plus proche sur la ligne d'un groupe d'alertes datées", () => {
    const html = rendre(construireTachesAccueil({ base, lots, lotsSansBail: lots.slice(0, 25), preparation: [], diagnostics: [], actions: [
      alerte("d1", "devis_recu", "Devis reçu, à décider", { lot_id: "lot-0" }, "2026-11-05"), alerte("d2", "devis_recu", "Devis reçu, à décider", { lot_id: "lot-1" }, "2026-11-02"),
    ] }));
    expect(html).toContain("<b>2 demandes : Devis reçu, à décider</b><small>Prochaine échéance : <time dateTime=\"2026-11-02\">");
    expect(html.match(/Échéance : <time/g)).toHaveLength(2);
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
