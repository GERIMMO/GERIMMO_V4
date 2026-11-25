// 20 — Reçu de dépôt de garantie : le versement, le total encaissé, les
// conditions de restitution. Cible : l'encaissement de dépôt.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Fusion,
  assemblerPage,
  cartouches,
  enTete,
  eur,
  faitA,
  blocSignatureEmetteur,
  section,
  tableau,
  titre,
} from "../gabarit";
import { moisDepotGarantie } from "@/lib/depot-garantie";
import {
  chargerContexteBail,
  expediteur,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  nomPersonne,
  referenceCourte,
  signatureOrganisation,
  liensLocataires,
} from "./communs";
import type { Assemblage } from "./index";
import { libelleMode } from "./quittance";

export type DonneesRecuDepot = {
  reference: string;
  dateVersement: string;
  montantVerse: number;
  moyen: string | null;
  versant: string | null;
  depotConvenu: number | null;
  totalEncaisse: number;
  plafond: string;
  meuble: boolean;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  dateBail: string | null;
  exp: ReturnType<typeof expediteur>;
  // Signature préenregistrée de l'émetteur (data-URI) — null : zone vierge
  signatureImg?: string | null;
  f: Fusion;
};

export function construireRecuDepot(d: DonneesRecuDepot) {
  const f = d.f;
  const reste = (d.depotConvenu ?? 0) - d.totalEncaisse;
  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: d.dateVersement })}
    ${titre("Reçu de dépôt de garantie", `Versement du ${f.date(d.dateVersement)}`, [
      // Reprise T3R-7 : l'article 22 fixe le plafond d'un mois (location nue). Le plafond de deux mois d'un bail meublé
      // relève d'un autre article, absent du recueil : sous ce seul en-tête, « deux mois » semblait venir de l'article 22.
      // Bail meublé : la loi est citée sans article.
      d.meuble ? "Loi n° 89-462 du 6 juillet 1989" : "Article 22 de la loi n° 89-462 du 6 juillet 1989",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      // Phase 3, lot 51 (W11, même défaut que C14) : la date imprimée est la prise d'effet du bail, pas sa conclusion ; « du »
      // la présentait comme la date du contrat (un reçu du 28/06 renvoyait à un bail « du 01/07 »).
      // Lot 53 (reprise du lot 51, W19) : « prise d’effet » avec l'apostrophe typographique des documents du dossier du bail.
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} — prise d’effet le ${f.date(d.dateBail)}`],
    ])}
    <p>Je soussigné(e) ${d.bailleurNom}, bailleur du logement désigné ci-dessus, reconnais avoir reçu
    ${d.versant ? `de ${f.champ(d.versant, "versant")}` : `de ${d.locatairesNoms}`}
    la somme de <b>${eur(d.montantVerse)}</b> au titre du dépôt de garantie prévu au bail.</p>
    ${section("Détail du versement")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        ["Versement reçu ce jour", f.montant(d.montantVerse)],
        ["Mode de règlement", f.champ(d.moyen, "virement, chèque…")],
        ["Dépôt de garantie convenu au bail", f.montant(d.depotConvenu, "montant mensuel")],
        ["Total encaissé à ce jour", f.montant(d.totalEncaisse)],
        ...(reste > 0 ? [["Reste à percevoir", f.montant(reste)]] : []),
      ]
    )}
    <div class="bloc-signataires">
    ${section("Conditions de restitution")}
    <div class="mentions">
      <p>Le montant du dépôt ne peut excéder ${d.plafond} (plafond légal applicable à ce bail).
      Il ne porte pas intérêt et n'est pas révisé en cours de bail.</p>
      <p>Il sera restitué dans un délai maximal d'un mois après la remise des clés si l'état des
      lieux de sortie est conforme à celui d'entrée, de deux mois dans le cas contraire, déduction
      faite, le cas échéant, des sommes restant dues au bailleur dûment justifiées.</p>
    </div>
    ${faitA(f, d.exp.ville, d.dateVersement)}
    ${blocSignatureEmetteur(d.exp.nom, d.signatureImg ?? null)}
    </div>
  `;
  return assemblerPage({
    f,
    titreDocument: "Reçu de dépôt de garantie",
    nomPied: "Reçu de dépôt de garantie",
    reference: d.reference,
    // Phase 3, lot 51 (W14) : à la taille commune (23 pt), le titre passait sur deux lignes (« REÇU DE DÉPÔT DE » / « GARANTIE »)
    // et le bloc des conditions de restitution, de la date et de la signature (insécable) partait seul en page 2. La mise en
    // page compacte des documents du catalogue (catalogue-bail.ts, catalogue-gestion.ts : titre à 19 pt, marges réduites) garde
    // le titre sur une ligne et ce reçu d'une page sur une seule feuille.
    corps: `<style>.bloc-titre{padding:10pt 0;margin-bottom:8pt}h1{font-size:19pt;letter-spacing:.2em}h2{margin:14pt 0 8pt}.cartouches{margin:10pt 0}p{margin:4pt 0}</style>${corps}`,
  });
}

export async function assemblerRecuDepot(
  supabase: SupabaseClient,
  orgId: string,
  encaissementId: string
): Promise<Assemblage> {
  const { data: e } = await supabase
    .from("depot_encaissements")
    .select("id, bail_id, montant, date_encaissement, moyen, versant_libelle, versant_person_id")
    .eq("id", encaissementId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!e) return { erreur: "Encaissement de dépôt introuvable." };

  const ctx = await chargerContexteBail(supabase, orgId, e.bail_id);
  if ("erreur" in ctx) return ctx;

  const [{ data: tous }, { data: versantPersonne }] = await Promise.all([
    supabase.from("depot_encaissements").select("montant").eq("bail_id", e.bail_id),
    e.versant_person_id
      ? supabase.from("persons").select("nom, prenom").eq("id", e.versant_person_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const f = new Fusion();
  const meubleSelonBail = moisDepotGarantie(ctx.bail.type, ctx.lot.meuble) === 2;
  // Phase 3 (lot 36) : le code du sélecteur « Payé par » (« virement », « cheque ») s'imprime avec le libellé de la quittance,
  // initiale en capitale ; un moyen saisi en clair (« Virement bancaire ») reste tel quel.
  const moyen = libelleMode(e.moyen);
  const document = construireRecuDepot({
    reference: referenceCourte("DEPOT", e.id),
    dateVersement: e.date_encaissement,
    montantVerse: Number(e.montant),
    moyen: moyen ? moyen.charAt(0).toLocaleUpperCase("fr-FR") + moyen.slice(1) : null,
    versant: e.versant_libelle ?? nomPersonne(versantPersonne),
    depotConvenu: ctx.bail.depot_garantie === null ? null : Number(ctx.bail.depot_garantie),
    totalEncaisse: (tous ?? []).reduce((s, x) => s + Number(x.montant), 0),
    // Lot T3 (R11-A2) : le plafond imprimé suit le BAIL, avec la règle même de la base (plafond_depot_mois) : bail meublé
    // → deux mois, bail nu → un mois, bail « colocation » → selon l'ameublement du logement. Avant, seul le logement
    // décidait : un bail nu signé sur un logement coché « meublé » recevait un reçu « deux mois » alors que la base et
    // le bail disaient un mois (et l'inverse pour un bail meublé sur un logement non coché).
    plafond: meubleSelonBail ? "deux mois de loyer hors charges" : "un mois de loyer hors charges",
    meuble: meubleSelonBail,
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    dateBail: ctx.bail.date_debut,
    exp: expediteur(ctx),
    signatureImg: await signatureOrganisation(supabase, orgId),
    f,
  });

  return {
    document,
    titreGed: "Reçu de dépôt de garantie",
    nomFichier: `recu-depot-${e.date_encaissement}`,
    liens: [
      { entite: "bail", entiteId: e.bail_id },
      ...liensLocataires(ctx),
    ],
  };
}
