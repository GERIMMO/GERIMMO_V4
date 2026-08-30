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
  section,
  tableau,
  titre,
} from "../gabarit";
import {
  chargerContexteBail,
  expediteur,
  nomsBailleurs,
  nomsLocataires,
  adresseLogement,
  nomPersonne,
  referenceCourte,
} from "./communs";
import type { Assemblage } from "./index";

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
  f: Fusion;
};

export function construireRecuDepot(d: DonneesRecuDepot) {
  const f = d.f;
  const reste = (d.depotConvenu ?? 0) - d.totalEncaisse;
  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: d.dateVersement })}
    ${titre("Reçu de dépôt de garantie", `Versement du ${f.date(d.dateVersement)}`, [
      "Articles 22 de la loi n° 89-462 du 6 juillet 1989",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")} du ${f.date(d.dateBail)}`],
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
    ${section("Conditions de restitution")}
    <div class="mentions">
      <p>Le montant du dépôt ne peut excéder ${d.plafond} (plafond légal applicable à ce bail).
      Il ne porte pas intérêt et n'est pas révisé en cours de bail.</p>
      <p>Il sera restitué dans un délai maximal d'un mois après la remise des clés si l'état des
      lieux de sortie est conforme à celui d'entrée, de deux mois dans le cas contraire, déduction
      faite, le cas échéant, des sommes restant dues au bailleur dûment justifiées.</p>
    </div>
    ${faitA(f, d.exp.ville, d.dateVersement)}
  `;
  return assemblerPage({
    f,
    titreDocument: "Reçu de dépôt de garantie",
    nomPied: "Reçu de dépôt de garantie",
    reference: d.reference,
    corps,
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
  const document = construireRecuDepot({
    reference: referenceCourte("DEPOT", e.id),
    dateVersement: e.date_encaissement,
    montantVerse: Number(e.montant),
    moyen: e.moyen,
    versant: e.versant_libelle ?? nomPersonne(versantPersonne),
    depotConvenu: ctx.bail.depot_garantie === null ? null : Number(ctx.bail.depot_garantie),
    totalEncaisse: (tous ?? []).reduce((s, x) => s + Number(x.montant), 0),
    plafond: ctx.lot.meuble ? "deux mois de loyer hors charges" : "un mois de loyer hors charges",
    meuble: ctx.lot.meuble,
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    dateBail: ctx.bail.date_debut,
    exp: expediteur(ctx),
    f,
  });

  return {
    document,
    titreGed: "Reçu de dépôt de garantie",
    nomFichier: `recu-depot-${e.date_encaissement}`,
    liens: [
      { entite: "bail", entiteId: e.bail_id },
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
