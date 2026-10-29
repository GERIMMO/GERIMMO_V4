import type { Ligne } from "./base-simulee";

/** Précondition explicite des anciens scénarios 2044 : détenteurs particuliers au réel, confirmés pour chaque année testée. */
export function avecDetenteursAuReel(tables: Record<string, Ligne[]>): Record<string, Ligne[]> {
  const lots = tables.lots ?? [];
  const organisations = [...new Set(lots.map(l => String(l.organization_id ?? "org")))];
  const personnes = organisations.map(org => ({ id: `proprietaire-fiscal-${org}`, organization_id: org, nom: "TEST Propriétaire", prenom: "Fiscal", qualite: "Personne physique" }));
  const annees = [...new Set((tables.fiscal_exercices_lots ?? []).map(x => Number(x.annee)))];
  return {
    ...tables,
    organizations: [...(tables.organizations ?? []), ...organisations.filter(id => !(tables.organizations ?? []).some(o => o.id === id)).map(id => ({ id, type: "proprietaire_direct" }))],
    persons: [...(tables.persons ?? []), ...personnes],
    detentions: [...(tables.detentions ?? []), ...lots.map(l => ({ id: `detention-${l.organization_id ?? "org"}-${l.id}`, organization_id: l.organization_id ?? "org", lot_id: l.id, person_id: `proprietaire-fiscal-${l.organization_id ?? "org"}`, date_debut: "1970-01-01", date_fin: null, quote_part: 100 }))],
    fiscal_profils_detenteurs: [...(tables.fiscal_profils_detenteurs ?? []), ...personnes.flatMap(p => annees.map(annee => ({ id: `profil-${p.id}-${annee}`, person_id: p.id, organization_id: p.organization_id, annee, version: 1, qualite: p.qualite, imposition: "ir", location_nue: "reel", location_meublee: "non_concerne", justification: "Déclaration fictive au réel confirmée", cree_le: "2026-10-28" })))],
  };
}
