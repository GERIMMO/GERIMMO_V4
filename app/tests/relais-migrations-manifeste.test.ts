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
  "20261017180829_supervision_finances.sql",
  "20261018061548_supervision_complete.sql",
  "20261018071556_supervision_index_relations.sql",
  "20261018085521_circuit_signature_bail.sql",
  "20261018100243_prestataire_signature_bail.sql",
  "20261018143644_certificat_commun_zoho.sql",
  "20261018185515_signatures_documents_budget.sql",
  "20261018193308_signature_devis_accord_client.sql",
  "20261018231827_abonnement_jour_paris.sql",
  // Lot M2 de l'audit du 19/10 : la table liste_attente (créée hors dépôt le 29/09) entre au dépôt et se borne.
  "20261019120000_liste_attente_bornee.sql",
  "20261019120500_relance_abonnement_periodicite.sql",
  "20261019121000_droits_anon_contact_articles_et_prospects.sql",
  // M16 (audit du 19/10) : les demandes de contact du site vitrine comptées dans l'e-mail de 5 h.
  "20261019122000_relais_point_demandes_contact.sql",
  // 19/10, lot « pages légales » : clés des prestataires dans supervision_identite.
  "20261019123000_identite_editeur_prestataires.sql",
  // Audit du 19/10, lot B5 : sort du devis signé et jour de Paris des devis.
  "20261019124000_devis_signes_sort_et_jour_de_paris.sql",
  "20261020010000_abonnement_client_service.sql",
  "20261020011000_session_origine_verifiee.sql",
  "20261020020000_stripe_reprises_durables.sql",
  "20261020030000_stockage_gabarits_roles.sql",
  "20261020011556_signature_preparation_abandon.sql",
  "20261020083058_signature_suivi_reprises_relances.sql",
  "20261020084651_depots_directs_temporaires.sql",
  // 20/10, décision du dirigeant : liste d'attente des agences de gestion (distincte de liste_attente du 29/09).
  "20261020120000_liste_attente_agences.sql",
  "20261021133650_relais_point_agences.sql",
  "20261021140836_ouverture_activite_artisan.sql",
  "20261021175930_nettoyage_initial_comptes.sql",
  "20261022210326_reglage_blocage_souscription_identite.sql",
  "20261022213731_conservation_preuves_et_invitations.sql",
  // Audit du 23/10, A03 : les deux agrégats de charges contrôlent aussi le portefeuille de l'agent restreint.
  "20261023161500_charges_agregats_portefeuille.sql",
  // 23/10, défauts A01 et A02 de la facturation : une intention de souscription par organisation, trace des hausses.
  "20261023162446_souscription_unique_et_trace_hausse.sql",
  // 23/10, décision du dirigeant : le réseau d'artisans suit la zone et les métiers choisis par l'artisan.
  "20261023180000_reseau_zone_choisie_par_artisan.sql",
  // Relecture adverse du 23/10 : le locataire lit ses annonces au jour de Paris, comme la fiche agence du bien.
  "20261023184512_annonces_locataire_jour_paris.sql",
  // 23/10, PR #242 (Codex) : inventaire global des souscriptions Stripe, appliquée en production APRÈS 184512
  // (chantier 40026422737, 21 h 23 UTC) : l'ordre du manifeste suit celui de la production, pas l'horodatage.
  "20261023164629_stripe_inventaire_global.sql",
  // 24/10, plan de conformité (lot 1A, R12) : versions archivées des conditions, document des acceptations, archive des comptes.
  "20261024090000_versions_conditions_et_archives_comptes.sql",
  // 24/10, plan de conformité (lot 1A, R10 et R19) : artisans classés par note à partir de trois évaluations ;
  // non-reconduction faute d'accord à une version substantielle des conditions.
  "20261024100000_acceptation_conditions_et_classement_artisans.sql",
  // 24/10, plan de conformité (lots 1B et 1C) : vente au consommateur (rétractation, confirmation, résiliation) et impayé.
  "20261024110000_vente_et_impaye.sql",
  // 24/10, plan de conformité (lot 1D, décision du 23/10) : la caution confirme son mobile, l'état des lieux sa visite sur place.
  "20261024120000_signature_caution_mobile_et_edl_sur_place.sql",
  // 24/10, plan de conformité (lot 1E, R14, R15, R49, R51) : fermeture des comptes, inactivité, export complet.
  "20261024130000_fermeture_comptes.sql",
  // 24/10, plan de conformité (lot 2, lot 1F, alertes et gel du lot 1E) : conservation et prospection.
  "20261024140000_conservation_et_prospection.sql",
  // 24/10, intégration des textes de la V1 : la règle d'inactivité (compte:inactif) s'active avec la V1 des conditions.
  "20261024150000_activation_inactivite_v1.sql",
  "20261024105901_reglages_conservation_superadmin.sql",
  "20261025192344_mois_offerts_superadmin.sql",
  "20261026090335_rappels_loyers_proprietaire.sql",
  "20261026110449_reception_loyer_idempotence_durable.sql",
  "20261026213652_qualifications_diagnostics_lot.sql",
  "20261026214857_qualification_diagnostic_annee_installation.sql",
  "20261026232941_pieces_attendues_bail.sql",
  // 27/10, audit de la PR #264 (LAT-01) : l'alerte d'impayé suit les encaissements.
  "20261027100000_alerte_impaye_suit_encaissements.sql",
  // Audit de la PR #264, FL-01 (27/10) : l'incident ouvert par le gérant ne se rattache qu'au bail choisi ou au seul bail en cours.
  "20261027100100_incident_gerant_bail_explicite.sql",
  // 27/10, audit de la refonte #264 (diagnostics) : validité réglementaire du DPE, rapport déjà rangé, rapports à renouveler.
  "20261027100200_diagnostics_validite_dpe_et_rapports.sql",
  // 27/10, audit #264 (création du bail) : l'assurance du locataire suit l'activation ; libellé de l'étape « Le bail ».
  "20261027100300_bail_assurance_activation_et_libelle_colocation.sql",
  // 27/10, audit #264 (CB-16) : « N baux en cours » dans le parcours de démarrage.
  "20261027100500_parcours_demarrage_pluriel_baux.sql",
  // 28/10, audit final (BAIL-05, BAIL-02) : contrôle de l'import identique à l'insertion ; trimestre IRL daté.
  "20261028100300_import_controle_complet_et_trimestre_irl_annee.sql",

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
