import type { SupabaseClient } from "@supabase/supabase-js";
import type { RubriqueFiscale } from "./fiscal";
import { lireParIdentifiants } from "./lectures-fiscales";

export type Justificatif2044 = { href: string; titre: string };

export async function lireJustificatifs2044(
  db: SupabaseClient, orgId: string, base: string, rubriques: RubriqueFiscale[],
) {
  const contributions = rubriques.flatMap(r => r.detail).filter(c => "ecriture" in c);
  const ids = [...new Set(contributions.flatMap(({ ecriture }) => {
    const id = ecriture.contre_ecriture_de ?? ecriture.id;
    return id ? [id] : [];
  }))];
  const appelsParEcriture = new Map<string, Set<string>>();
  for (const { ecriture, appels } of contributions) {
    if (!ecriture.id || !Array.isArray(appels)) continue;
    appelsParEcriture.set(ecriture.id, new Set(appels.flatMap(a =>
      typeof a?.appel_id === "string" ? [a.appel_id] : [],
    )));
  }
  const appelIds = [...new Set([...appelsParEcriture.values()].flatMap(ids => [...ids]))];
  const [avis, fournitures, interventions, quittances] = await Promise.all([
    lireParIdentifiants<{ id: string; avis_fiscal_id: string }>(ids, paquet =>
      db.from("ecritures").select("id,avis_fiscal_id").eq("organization_id", orgId).in("id", paquet).not("avis_fiscal_id", "is", null)),
    lireParIdentifiants<{ ecriture_id: string; paiement_id: string }>(ids, paquet =>
      db.from("ecritures_factures_fourniture").select("ecriture_id,paiement_id").in("ecriture_id", paquet)),
    lireParIdentifiants<{ ecriture_id: string; facture_id: string }>(ids, paquet =>
      db.from("intervention_facture_reglements").select("ecriture_id,facture_id").eq("organization_id", orgId).in("ecriture_id", paquet)),
    lireParIdentifiants<{ id: string; appel_id: string; est_quittance: boolean }>(appelIds, paquet =>
      db.from("quittances").select("id,appel_id,est_quittance").eq("organization_id", orgId).in("appel_id", paquet)),
  ]);

  // La table de liaison des fournitures n’a pas de colonne organisation.
  // Elle est lue sur les seuls identifiants du journal autorisé, sous RLS.
  type PieceLiee = { id: string; document_id: string };
  const [paiements, factures] = await Promise.all([
    lireParIdentifiants<PieceLiee>([...new Set(fournitures.data?.map(f => f.paiement_id))], paquet =>
      db.from("paiements_factures_fourniture").select("id,document_id").eq("organization_id", orgId).in("id", paquet)),
    lireParIdentifiants<PieceLiee>([...new Set(interventions.data?.map(f => f.facture_id))], paquet =>
      db.from("intervention_factures").select("id,document_id").eq("organization_id", orgId).in("id", paquet)),
  ]);
  const paiementDocument = new Map(paiements.data?.map(p => [p.id, p.document_id]));
  const factureDocument = new Map(factures.data?.map(f => [f.id, f.document_id]));
  const references = [
    ...(avis.data ?? []).map(a => [a.id, a.avis_fiscal_id] as const),
    ...(fournitures.data ?? []).map(f => [f.ecriture_id, paiementDocument.get(f.paiement_id)] as const),
    ...(interventions.data ?? []).map(f => [f.ecriture_id, factureDocument.get(f.facture_id)] as const),
  ];
  const documents = await lireParIdentifiants<{ id: string; titre: string }>(
    [...new Set(references.flatMap(([, id]) => id ? [id] : []))],
    paquet => db.from("documents").select("id,titre").eq("organization_id", orgId).in("id", paquet).is("purged_at", null).not("storage_path", "is", null),
  );
  const titres = new Map(documents.data?.map(d => [d.id, d.titre]));
  const parOrigine = new Map<string, Justificatif2044[]>();
  for (const [origine, id] of references) {
    if (!id) continue;
    const titre = titres.get(id);
    if (!titre) continue;
    const liens = parOrigine.get(origine) ?? [];
    const href = `${base}/documents/${id}/fichier`;
    if (!liens.some(l => l.href === href)) liens.push({ titre, href });
    parOrigine.set(origine, liens);
  }

  const quittanceParAppel = new Map(quittances.data?.map(q => [q.appel_id, q]));
  const parEcriture = new Map<string, Justificatif2044[]>();
  for (const { ecriture } of contributions) {
    if (!ecriture.id) continue;
    const liens = [...(parOrigine.get(ecriture.contre_ecriture_de ?? ecriture.id) ?? [])];
    for (const appel of appelsParEcriture.get(ecriture.id) ?? []) {
      const q = quittanceParAppel.get(appel);
      if (q) liens.push({ href: `/quittance/${q.id}`, titre: q.est_quittance ? "Quittance du terme" : "Reçu partiel du terme" });
    }
    parEcriture.set(ecriture.id, liens);
  }
  return {
    parEcriture,
    incomplet: [avis, fournitures, interventions, quittances, paiements, factures, documents].some(l => l.error || l.tronquee),
  };
}
