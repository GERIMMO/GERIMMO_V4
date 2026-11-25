/** Repères éditoriaux vérifiés le 12/10/2026, pas un barème réglementaire.
 * Le centre d'une fourchette n'est jamais appelé « moyenne nationale ».
 * Ne pas convertir un prix TTC en HT en supposant le régime de TVA. */
export const REFERENCES_TRAVAUX = [
  { code: "plomberie_heure", metier: "plomberie", libelle: "Main-d’œuvre de plomberie", unite: "h", min: 4000, max: 9000,
    url: "https://www.travaux.com/plomberie/guide-des-prix/prix-de-linstallation-dun-robinet" },
  { code: "electricite_depannage_heure", metier: "electricite", libelle: "Dépannage électrique en heures ouvrées", unite: "h", min: 5000, max: 9000,
    url: "https://www.travaux.com/electricite/guide-des-prix/prix-dun-electricien" },
  { code: "peinture_pose_m2", metier: "peinture", libelle: "Application de deux couches sur support préparé, hors fourniture", unite: "m²", min: 800, max: 1800,
    url: "https://www.travaux.com/peinture/guide-des-prix/prix-pose-peinture" },
  { code: "peinture_fourniture_m2", metier: "peinture", libelle: "Fourniture de peinture professionnelle standard", unite: "m²", min: 200, max: 1000,
    url: "https://www.travaux.com/peinture/guide-des-prix/prix-pose-peinture" },
] as const;
/** Le jour où ces repères ont été relus à leur source. */
export const REFERENCES_VERIFIEES_LE = "2026-10-12";

/**
 * Les repères d'un métier, tels qu'on les montre au propriétaire AVANT qu'il sollicite un artisan (audit palier 1,
 * P2-07). Un ordre de grandeur, dit avec sa fourchette entière : ni centre, ni moyenne, ni prix conseillé. Un métier
 * sans repère sourcé ne rend rien : aucun chiffre n'est inventé.
 */
export function reperesDuMetier(metier: string): { code: string; libelle: string; fourchette: string; url: string }[] {
  const nombre = (centimes: number) => (centimes / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return REFERENCES_TRAVAUX.filter((r) => r.metier === metier).map((r) => ({
    code: r.code,
    libelle: r.libelle,
    fourchette: `${nombre(r.min)} à ${nombre(r.max)} € HT par ${r.unite === "h" ? "heure" : r.unite}`,
    url: r.url,
  }));
}

export type RepereHistorique = { code: string; nombre: number; artisans: number; moyenne_ht_cents: number; plus_ancien: string; plus_recent: string };
export function prixPropose(code: string, historique: RepereHistorique[]) {
  const reference = REFERENCES_TRAVAUX.find(r => r.code === code);
  if (!reference) return null;
  const h = historique.find(h => h.code === code && h.nombre >= 10 && h.artisans >= 3 && Number.isSafeInteger(Number(h.moyenne_ht_cents)) && Number(h.moyenne_ht_cents) > 0);
  return {
    code, libelle: reference.libelle, unite: reference.unite,
    prix_unitaire_ht_cents: h ? Number(h.moyenne_ht_cents) : Math.round((reference.min + reference.max) / 2),
    origine: h ? "gerimmo" : "reference",
    detail: h ? `Moyenne de ${h.nombre} interventions comparables, factures validées (${h.plus_ancien} au ${h.plus_recent}).` : `Repère France : ${reference.min / 100} à ${reference.max / 100} € HT/${reference.unite}. Centre de fourchette, hors déplacement et prestations non indiquées.`,
    url: h ? null : reference.url,
    verifie_le: REFERENCES_VERIFIEES_LE,
  };
}
