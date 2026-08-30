// 23 — Révision annuelle du loyer (IRL) : nouveau montant, indices retenus,
// note de calcul. Cible : la révision enregistrée.

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
  referenceCourte,
} from "./communs";
import type { Assemblage } from "./index";

export type DonneesRevisionIrl = {
  reference: string;
  dateEffet: string;
  ancienLoyer: number;
  nouveauLoyer: number;
  irlReference: number | null;
  irlNouveau: number | null;
  trimestre: string | null;
  charges: number | null;
  bailleurNom: string;
  locatairesNoms: string;
  logementAdresse: string;
  referenceBail: string;
  exp: ReturnType<typeof expediteur>;
  f: Fusion;
};

export function construireRevisionIrl(d: DonneesRevisionIrl) {
  const f = d.f;
  const variation =
    d.irlReference && d.irlNouveau
      ? (((d.irlNouveau - d.irlReference) / d.irlReference) * 100).toLocaleString("fr-FR", {
          maximumFractionDigits: 2,
        }) + " %"
      : null;
  const rapport =
    d.irlReference && d.irlNouveau
      ? `${eur(d.ancienLoyer)} × ${d.irlNouveau.toLocaleString("fr-FR")} / ${d.irlReference.toLocaleString("fr-FR")}`
      : null;

  const corps = `
    ${enTete(f, d.exp, { libelle: "Contrat", reference: d.referenceBail, etabliLe: new Date().toISOString() })}
    ${titre("Révision du loyer", `Échéance annuelle du ${f.date(d.dateEffet)}`, [
      "Article 17-1 de la loi n° 89-462 du 6 juillet 1989 — indice de référence des loyers (IRL)",
    ])}
    ${cartouches([
      ["Bailleur", `<div>${d.bailleurNom}</div>`],
      ["Locataire", `<div>${d.locatairesNoms}</div>`],
      ["Logement loué", `<div>${f.champ(d.logementAdresse, "adresse complète, étage, porte")}</div>`],
      ["Bail", `Réf. ${f.champ(d.referenceBail, "référence du bail")}`],
    ])}
    <p>Conformément à la clause de révision du bail, le loyer est révisé à sa date anniversaire selon
    la variation de l'indice de référence des loyers publié par l'INSEE.</p>
    ${section("Nouveau montant")}
    ${tableau(
      [{ libelle: "Nature" }, { libelle: "Montant", droite: true }],
      [
        ["Loyer hors charges avant révision", f.montant(d.ancienLoyer)],
        [`<b>Loyer hors charges révisé, à compter du ${f.date(d.dateEffet)}</b>`, `<b>${f.montant(d.nouveauLoyer)}</b>`],
        ["Provision ou forfait de charges (inchangé)", f.montant(d.charges, "montant inchangé")],
      ]
    )}
    ${section("Indices retenus")}
    ${tableau(
      [{ libelle: "Référence" }, { libelle: "Valeur", droite: true }],
      [
        ["Trimestre de référence du bail", f.champ(d.trimestre, "ex. 2e trimestre")],
        ["Indice de l'année écoulée", f.champ(d.irlNouveau?.toLocaleString("fr-FR"), "indice année en cours")],
        ["Indice de l'année précédente", f.champ(d.irlReference?.toLocaleString("fr-FR"), "indice année précédente")],
        ["Variation", f.champ(variation, "en pourcentage")],
      ]
    )}
    ${section("Note de calcul")}
    <p>${f.champ(rapport, "rapport des indices")} = ${f.montant(d.nouveauLoyer, "montant avant arrondi")}
    (arrondi au centime le plus proche).</p>
    ${section("Mentions")}
    <div class="mentions">
      <p>La révision ne peut excéder la variation de l'IRL. Elle prend effet à la date anniversaire
      prévue au bail ; le bailleur dispose d'un an pour en faire la demande — passé ce délai, la
      révision est prescrite pour l'année écoulée (loi n° 2014-366 du 24 mars 2014).</p>
    </div>
    ${faitA(f, d.exp.ville, new Date().toISOString())}
  `;
  return assemblerPage({
    f,
    titreDocument: "Révision du loyer",
    nomPied: "Révision du loyer (IRL)",
    reference: d.reference,
    corps,
  });
}

export async function assemblerRevisionIrl(
  supabase: SupabaseClient,
  orgId: string,
  revisionId: string
): Promise<Assemblage> {
  const { data: r } = await supabase
    .from("revisions_loyer")
    .select("id, bail_id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau")
    .eq("id", revisionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!r) return { erreur: "Révision introuvable." };

  const ctx = await chargerContexteBail(supabase, orgId, r.bail_id);
  if ("erreur" in ctx) return ctx;

  const f = new Fusion();
  const document = construireRevisionIrl({
    reference: referenceCourte("IRL", r.id),
    dateEffet: r.date_effet,
    ancienLoyer: Number(r.ancien_loyer),
    nouveauLoyer: Number(r.nouveau_loyer),
    irlReference: r.irl_reference === null ? null : Number(r.irl_reference),
    irlNouveau: r.irl_nouveau === null ? null : Number(r.irl_nouveau),
    trimestre: ctx.bail.irl_trimestre,
    charges: ctx.bail.charges === null ? null : Number(ctx.bail.charges),
    bailleurNom: nomsBailleurs(f, ctx.bailleurs),
    locatairesNoms: nomsLocataires(f, ctx.locataires),
    logementAdresse: adresseLogement(ctx.lot, ctx.bien),
    referenceBail: referenceCourte("BAIL", ctx.bail.id),
    exp: expediteur(ctx),
    f,
  });

  return {
    document,
    titreGed: `Révision IRL — effet au ${r.date_effet}`,
    nomFichier: `revision-irl-${r.date_effet}`,
    liens: [
      { entite: "bail", entiteId: r.bail_id },
      ...(ctx.bail.locataire_principal
        ? [{ entite: "personne" as const, entiteId: ctx.bail.locataire_principal }]
        : []),
    ],
  };
}
