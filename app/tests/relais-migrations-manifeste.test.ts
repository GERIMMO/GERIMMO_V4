/**
 * D46-B (lot « relais-alertes ») — place des trois migrations du lot dans le manifeste et dans la procédure de retour.
 *
 *  — le manifeste (`e2e/local/ordre-migrations.txt`) suit l'ordre de la PRODUCTION, pas celui des noms (en-tête de
 *    `e2e/local/preparer-base.sh`). Les migrations déjà appliquées en production avant ce lot (PR #189 : 820000 et
 *    821000 ; PR #190 : 830000, 720000, 730000 et 710000) y restent devant ; celles du lot (810000, 811000, 812000), qui
 *    le seront après, ferment la liste, dans leur ordre ;
 *  — la chaîne « Ordre complet si tout doit être défait » du LISEZ-MOI des retours (section « fuseau-suite », la seule
 *    qui donne la chaîne entière) commence par les trois retours du lot, dans l'ordre inverse du manifeste : 812000
 *    (il modifie des fonctions des deux autres), 811000, puis 810000.
 *
 * Sans base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LOT = [
  "20261014810000_relais_alerte_quotidienne.sql",
  "20261014811000_relais_urgences_immediates.sql",
  "20261014812000_relais_urgences_passage_frequent.sql",
];
/** Appliquées en production avant ce lot, dans cet ordre (messages des PR #189 et #190). */
const DEJA_EN_PRODUCTION = [
  "20261014820000_jour_de_paris_depot_et_journal.sql",
  "20261014821000_jour_de_paris_irl_terme_charges_rapports.sql",
  "20261014830000_relances_invitations_locataires.sql",
  "20261014720000_recherche_reference_supervision.sql",
  "20261014730000_plafond_appels_ia.sql",
  "20261014710000_artisan_avoir_facture_externe.sql",
];

const manifeste = () => readFileSync("e2e/local/ordre-migrations.txt", "utf8").trim().split(/\r?\n/);

describe("lot relais-alertes — manifeste et procédure de retour (sans base)", () => {
  it("les trois migrations du lot se suivent, dans leur ordre, une seule fois chacune ; seules celles du lot invitation-artisan viennent après", () => {
    const lignes = manifeste();
    for (const nom of LOT) expect(lignes.filter((l) => l === nom), nom).toHaveLength(1);
    const premiere = lignes.indexOf(LOT[0]);
    expect(lignes.slice(premiere, premiere + LOT.length)).toEqual(LOT);
    // Fusion du lot invitation-artisan (16/10/2026) : ses migrations (20261014840000 à 20261014849000) passeront en
    // production après celles du relais ; elles seules ferment le manifeste, en ajout.
    const apres = lignes.slice(premiere + LOT.length);
    expect(apres.every((nom) => /^2026101484\d{4}_/.test(nom)), apres.join(", ")).toBe(true);
  });

  it("les migrations déjà appliquées en production (820000, 821000, puis celles de la PR #190) restent devant celles du lot", () => {
    const lignes = manifeste();
    const premiere = lignes.indexOf(LOT[0]);
    const positions = DEJA_EN_PRODUCTION.map((nom) => {
      const i = lignes.indexOf(nom);
      expect(i, `${nom} : absente du manifeste`).toBeGreaterThanOrEqual(0);
      expect(i, `${nom} : placée après ${LOT[0]}`).toBeLessThan(premiere);
      return i;
    });
    expect(positions, "ordre de la production").toEqual([...positions].sort((a, b) => a - b));
  });

  it("le LISEZ-MOI ne donne qu'une chaîne complète, et elle défait d'abord 812000, puis 811000, puis 810000", () => {
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    const chaines = [...lisezMoi.matchAll(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/g)];
    expect(chaines, "une seule chaîne complète").toHaveLength(1);
    const codes = [...chaines[0][1].matchAll(/`(\d{6})`/g)].map((m) => m[1]);
    expect(codes.slice(0, 3)).toEqual(["812000", "811000", "810000"]);
    // Les retours du lot précèdent ceux des migrations appliquées avant lui en production.
    for (const code of ["710000", "730000", "830000", "821000", "820000", "610000"]) expect(codes.indexOf(code), code).toBeGreaterThan(2);
  });
});
