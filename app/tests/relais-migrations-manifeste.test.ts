/**
 * D46-B (lot « relais-alertes ») — place des trois migrations du lot dans le manifeste et dans la procédure de retour.
 *
 *  — le manifeste (`e2e/local/ordre-migrations.txt`) suit l'ordre de la PRODUCTION, pas celui des noms (en-tête de
 *    `e2e/local/preparer-base.sh`). Les migrations déjà appliquées en production avant ce lot (PR #189 : 820000 et
 *    821000 ; PR #190 : 830000, 720000, 730000 et 710000) y restent devant ; celles du lot (810000, 811000, 812000), qui
 *    le seront après, se suivent dans leur ordre, et seules les migrations des lots POSTÉRIEURS (16/10, lot
 *    « correctifs-base » : 850000, 851000) viennent après elles ;
 *  — la chaîne « Ordre complet si tout doit être défait » du LISEZ-MOI des retours (section « fuseau-suite », la seule
 *    qui donne la chaîne entière) donne les trois retours du lot dans l'ordre inverse du manifeste : 812000 (il modifie des
 *    fonctions des deux autres), 811000, puis 810000 ; seuls les retours des lots postérieurs les précèdent.
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
/** Lots postérieurs, qui passent en production après celui-ci (16/10, lot « correctifs-base »), dans l'ordre du manifeste. */
const POSTERIEURES = [
  // Lot invitation-artisan (décision du 15/10), puis correctifs du tour final (16/10), en ajout.
  "20261014840000_invitation_artisan_proprietaire.sql",
  "20261014841000_metiers_zones_sans_proprietaire.sql",
  "20261014842000_artisans_colonnes_internes.sql",
  "20261014843000_liste_noire_locale_relation_prealable.sql",
  "20261014844000_invitation_artisan_budget_distinct.sql",
  "20261014845000_invitation_artisan_soi_meme.sql",
  "20261014846000_invitation_artisan_annulation_suspendue.sql",
  "20261014847000_invitation_artisan_echeance_jour_paris.sql",
  "20261014848000_carnet_artisans_bien.sql",
  "20261014849000_liste_noire_levee_sans_rattachement.sql",
  "20261014850000_retention_registres_relais_ia.sql",
  "20261014851000_jour_de_paris_restitution_depot.sql",
];
/** Mission du 16/10 : ajout après la chaîne déjà publiée ; aucun réordonnancement historique. */
const MISSION_OCTOBRE = [
  "20261016110000_devis_pdf_versions_alerte.sql",
  "20261016110100_rdv_relance_accuse_agenda.sql",
  "20261016150000_confirmation_auth.sql",
  "20261016172453_traversee_lecture_seule.sql",
  "20261016180000_relais_retention_sentinelle.sql",
  "20261016190000_relance_report_reprise_sans_envoi.sql",
  "20261016200000_jour_paris_complements.sql",
  "20261016210000_retour_adresse_confirmee.sql",
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
  it("les trois migrations du lot se suivent dans leur ordre, une seule fois chacune ; seules celles des lots postérieurs les suivent", () => {
    const lignes = manifeste();
    for (const nom of LOT) expect(lignes.filter((l) => l === nom), nom).toHaveLength(1);
    const premiere = lignes.indexOf(LOT[0]);
    expect(lignes.slice(premiere, premiere + LOT.length)).toEqual(LOT);
    expect(lignes.slice(premiere + LOT.length)).toEqual([...POSTERIEURES, ...MISSION_OCTOBRE]);
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

  it("le LISEZ-MOI ne donne qu'une chaîne complète : les retours des lots postérieurs, puis 812000, 811000 et 810000", () => {
    const lisezMoi = readFileSync("supabase/retours-arriere/LISEZ-MOI.md", "utf8");
    const chaines = [...lisezMoi.matchAll(/Ordre complet si tout doit être défait :([\s\S]*?)puis `500000`/g)];
    expect(chaines, "une seule chaîne complète").toHaveLength(1);
    const codes = [...chaines[0][1].matchAll(/`(\d{6})`/g)].map((m) => m[1]);
    // Devant le lot : les seuls lots postérieurs qui citent la fonction du jour, dans l'ordre inverse du manifeste. Les
    // migrations de l'invitation d'artisan (840000 à 849000) n'entrent pas dans cette chaîne : aucune ne cite
    // aujourdhui_paris() (847000 ne la nomme que dans un commentaire et calcule le jour de Paris dans l'expression même).
    const avant = POSTERIEURES.filter((nom) => !/^2026101484\d{4}_/.test(nom)).map((nom) => nom.slice(8, 14)).reverse();
    expect(codes.slice(0, avant.length)).toEqual(avant);
    expect(codes.slice(avant.length, avant.length + 3)).toEqual(["812000", "811000", "810000"]);
    // Les retours du lot précèdent ceux des migrations appliquées avant lui en production.
    for (const code of ["710000", "730000", "830000", "821000", "820000", "610000"]) expect(codes.indexOf(code), code).toBeGreaterThan(avant.length + 2);
  });
});
