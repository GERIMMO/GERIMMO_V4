import type { SupabaseClient } from "@supabase/supabase-js";
import { Fusion, echapper, eur, section } from "../gabarit";
import { lireLignes, lignesTableau, montant, texte, type LigneDocument } from "./catalogue-bail";

const centimes = (v: unknown) => Math.round(montant(v) * 100);
export function syntheseOperations(operations: LigneDocument[]) {
  const recettes = operations.filter(e => e.sens === "recette").reduce((s,e) => s + centimes(e.montant), 0);
  const depenses = operations.filter(e => e.sens === "depense").reduce((s,e) => s + centimes(e.montant), 0);
  return { recettes: recettes / 100, depenses: depenses / 100, net: (recettes - depenses) / 100 };
}

// Montants issus des écritures, sans recalcul d'honoraires ni ordre de virement.
// Les impayés et incidents sont des informations distinctes du net à reverser.
export async function detailRapportGestion(db: SupabaseClient, orgId: string, f: Fusion,
  lots: LigneDocument[], lignes: LigneDocument[], operations: LigneDocument[], debut: string, fin: string) {
  const perimetre = lignes.filter(l => texte(l.date_debut) < fin && (!l.date_fin || texte(l.date_fin) >= debut));
  const ids = [...new Set(perimetre.map(l => texte(l.lot_id)))];
  const lotsDuMois = lots.filter(l => ids.includes(texte(l.id)));
  const biensIds = [...new Set(lotsDuMois.map(l => texte(l.bien_id)).filter(Boolean))];
  const lire = (table: string) => db.from(table).select("*").eq("organization_id", orgId);
  const [biens, baux, incidents] = await Promise.all([
    biensIds.length ? lireLignes(lire("biens").in("id", biensIds).order("id")) : [],
    ids.length ? lireLignes(lire("baux").in("lot_id", ids).order("id")) : [],
    ids.length ? lireLignes(lire("incidents").in("lot_id", ids).is("clos_le", null).lt("created_at", fin).order("created_at")) : [],
  ]);
  const termes: LigneDocument[] = [];
  for (let i = 0; i < baux.length; i += 10) {
    const groupes = await Promise.all(baux.slice(i, i + 10).map(async b =>
      (await lireLignes(db.rpc("etat_loyers_bail", { p_bail: b.id }).lt("periode", fin)))
        .filter(t => texte(t.periode) < fin).map(t => ({ ...t, bail_id: b.id }))));
    termes.push(...groupes.flat());
  }
  const parBien = new Map<string, LigneDocument[]>();
  for (const lot of lotsDuMois) {
    const bien = texte(lot.bien_id);
    parBien.set(bien, [...(parBien.get(bien) ?? []), lot]);
  }
  const recap = [...parBien].map(([id, groupe]) => {
    const bien = biens.find(b => b.id === id);
    const ops = operations.filter(e => groupe.some(l => l.id === e.lot_id));
    return { id, groupe, bien, nom: texte(bien?.nom) || [bien?.address_line1, bien?.city].filter(Boolean).join(" ") || "Bien à renseigner", ...syntheseOperations(ops) };
  });
  const total = syntheseOperations(operations);
  let html = `${section("Récapitulatif consolidé")}
    ${recap.length ? lignesTableau(f,recap,[["Bien","nom","texte"],["Recettes encaissées","recettes","montant"],["Dépenses enregistrées","depenses","montant"],["Net du bien","net","montant"]]) : "<p>Aucun lot couvert par le mandat sur cette période.</p>"}
    <p>Recettes : ${eur(total.recettes)} ; dépenses, honoraires enregistrés inclus : ${eur(total.depenses)}. <strong>${total.net < 0 ? "Appel de fonds" : "Net à reverser"} : ${eur(Math.abs(total.net))}.</strong></p>`;
  for (const bien of recap) {
    const listeLots = bien.groupe.map(l => texte(l.id));
    const ops = operations.filter(e => listeLots.includes(texte(e.lot_id)));
    const detailsLots = bien.groupe.map(l => {
      const taux = [...new Set(perimetre.filter(m => m.lot_id === l.id).map(m => texte(m.taux_honoraires)))];
      return { lot: l.nom, taux: taux.length ? taux.join(" / ") : "Non renseigné", ...syntheseOperations(ops.filter(e => e.lot_id === l.id)) };
    });
    const familles = new Map<string, number>();
    for (const e of ops.filter(e => e.sens === "depense")) {
      const categorie = texte(e.categorie) || "Non renseignée";
      familles.set(categorie, (familles.get(categorie) ?? 0) + centimes(e.montant));
    }
    const idsBaux = baux.filter(b => listeLots.includes(texte(b.lot_id))).map(b => texte(b.id));
    const impayes = termes.filter(t => idsBaux.includes(texte(t.bail_id)) && centimes(t.montant_du) > centimes(t.montant_couvert)).map(t => {
      const bail = baux.find(b => b.id === t.bail_id);
      return { lot: bien.groupe.find(l => l.id === bail?.lot_id)?.nom, periode: t.periode, reste: (centimes(t.montant_du) - centimes(t.montant_couvert)) / 100 };
    });
    const ouverts = incidents.filter(i => listeLots.includes(texte(i.lot_id)) && i.etat !== "clos");
    html += `<div class="saut"></div>${section(bien.nom)}<p>${echapper([bien.bien?.address_line1, bien.bien?.postal_code, bien.bien?.city].filter(Boolean).join(" "))}</p>
      ${lignesTableau(f,detailsLots,[["Lot","lot","texte"],["Recettes","recettes","montant"],["Dépenses","depenses","montant"],["Net","net","montant"],["Taux au mandat (%)","taux","texte"]])}
      <p>Net du bien : ${eur(bien.net)}. Les taux sont rappelés à titre de lecture du mandat ; les honoraires inclus dans le net sont ceux des écritures enregistrées.</p>
      ${section("Dépenses par famille")}${familles.size ? lignesTableau(f,[...familles].map(([famille,n]) => ({famille: famille.replaceAll("_"," "), montant:n/100})),[["Famille","famille","texte"],["Montant","montant","montant"]]) : "<p>Aucune dépense enregistrée ce mois.</p>"}
      ${section("Impayés à suivre")}
      <p>Échéances jusqu’à la fin du mois du rapport, restant dues lors de l’édition. Ces sommes ne sont pas comptées dans le net à reverser.</p>
      ${impayes.length ? lignesTableau(f,impayes,[["Lot","lot","texte"],["Période","periode","date"],["Reste dû","reste","montant"]]) : "<p>Aucun impayé constaté sur ces échéances lors de l’édition.</p>"}
      ${section("Incidents à suivre")}
      <p>Signalements antérieurs à la fin du mois du rapport, encore ouverts lors de l’édition.</p>
      ${ouverts.length ? lignesTableau(f,ouverts,[["Référence","numero","texte"],["Signalement","description","texte"],["État","etat","texte"]]) : "<p>Aucun incident ouvert dans ce périmètre lors de l’édition.</p>"}`;
  }
  html += `${recap.length && operations.length ? '<div class="saut"></div>' : ""}${section("Annexe — détail des écritures")}`;
  return html;
}
