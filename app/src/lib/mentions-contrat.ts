export type MentionsContrat = {
  date_conclusion_prevue?: string | null;
  servitude_residence_principale?: boolean | null;
  encadrement_loyer?: boolean | null;
  zone_honoraires?: string | null;
  honoraires_edl_bailleur?: number | null;
  honoraires_edl_locataire?: number | null;
  dpe_depenses_min?: number | null;
  dpe_depenses_max?: number | null;
  dpe_annees_reference?: string | null;
  clause_resolutoire_assurance?: boolean;
  clause_resolutoire_troubles?: boolean;
  clause_resolutoire_servitude?: boolean;
};

export const CHAMPS_MENTIONS_CONTRAT = [
  'date_conclusion_prevue', 'servitude_residence_principale', 'encadrement_loyer',
  'zone_honoraires', 'honoraires_edl_bailleur', 'honoraires_edl_locataire',
  'dpe_depenses_min', 'dpe_depenses_max', 'dpe_annees_reference',
  'clause_resolutoire_assurance', 'clause_resolutoire_troubles', 'clause_resolutoire_servitude',
] as const;

// Plafonds TTC par m² de surface habitable des honoraires à la charge du
// locataire (décret n° 2014-890 du 1er août 2014, art. 1 et 2), par zone.
// Barèmes datés, du plus ancien au plus récent : chacun s'applique aux baux
// conclus à partir de sa date. Audit gestion du 29/09 : au-delà du dernier
// barème connu, c'est ce DERNIER qui s'applique (plus de « pas de plafond »
// pour 2027) — à compléter ici à chaque nouvel arrêté de révision.
export const BAREMES_HONORAIRES: readonly {
  depuis: string;
  location: Readonly<Record<'tres_tendue' | 'tendue' | 'autre', number>>;
  edl: number;
  source: string;
}[] = [
  { depuis: '2014-09-15', location: { tres_tendue: 12, tendue: 10, autre: 8 }, edl: 3, source: 'décret n° 2014-890' },
  { depuis: '2026-01-01', location: { tres_tendue: 12.10, tendue: 10.09, autre: 8.07 }, edl: 3.03, source: 'arrêté du 13 novembre 2025' },
];

export function plafondsHonoraires(date: string | null | undefined, zone: string | null | undefined) {
  const jour = date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
  const bareme = jour ? [...BAREMES_HONORAIRES].reverse().find((b) => jour >= b.depuis) ?? null : null;
  return {
    location: bareme && zone && zone in bareme.location ? bareme.location[zone as keyof typeof bareme.location] : null,
    edl: bareme ? bareme.edl : null,
  };
}

export function lireMentionsContrat(form: FormData): { mentions: MentionsContrat; erreur?: string } {
  const mentions: MentionsContrat = {};
  // Un ancien formulaire encore ouvert ne doit pas effacer les nouveaux champs.
  for (const champ of CHAMPS_MENTIONS_CONTRAT) {
    if (!form.has(champ)) continue;
    const brut = String(form.get(champ) ?? '').trim();
    if (['honoraires_edl_bailleur', 'honoraires_edl_locataire', 'dpe_depenses_min', 'dpe_depenses_max'].includes(champ)) {
      const n = brut ? Number(brut.replace(',', '.')) : null;
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 99999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001))
        return { mentions, erreur: 'Saisissez des montants positifs ou nuls, avec au plus deux décimales.' };
      Object.assign(mentions, { [champ]: n });
    } else if (champ === 'servitude_residence_principale' || champ === 'encadrement_loyer' || champ.startsWith('clause_resolutoire_')) {
      if (!['', 'true', 'false'].includes(brut) || (!brut && champ.startsWith('clause_resolutoire_')))
        return { mentions, erreur: 'Choisissez une réponse dans les conditions du contrat.' };
      Object.assign(mentions, { [champ]: brut === '' ? null : brut === 'true' });
    } else if (champ === 'date_conclusion_prevue') {
      if (brut && (!/^\d{4}-\d{2}-\d{2}$/.test(brut) || !Number.isFinite(Date.parse(brut)) || new Date(brut).toISOString().slice(0, 10) !== brut))
        return { mentions, erreur: 'La date prévue de conclusion est invalide.' };
      mentions.date_conclusion_prevue = brut || null;
    } else if (champ === 'zone_honoraires') {
      if (!['', 'tres_tendue', 'tendue', 'autre'].includes(brut)) return { mentions, erreur: 'La zone des honoraires est invalide.' };
      mentions.zone_honoraires = brut || null;
    } else {
      if (brut.length > 100) return { mentions, erreur: 'Les années de référence du DPE sont limitées à 100 caractères.' };
      mentions.dpe_annees_reference = brut || null;
    }
  }
  if (mentions.dpe_depenses_min != null && mentions.dpe_depenses_max != null && mentions.dpe_depenses_max < mentions.dpe_depenses_min)
    return { mentions, erreur: 'Le maximum des dépenses d’énergie doit être supérieur ou égal au minimum.' };
  if (mentions.clause_resolutoire_servitude && mentions.servitude_residence_principale !== true)
    return { mentions, erreur: 'La clause de résidence principale nécessite de confirmer la servitude du logement.' };
  return { mentions };
}

export function verifierHonorairesContrat(b: MentionsContrat & { honoraires_bailleur?: number | null; honoraires_locataire?: number | null }, surface: number | null): string | null {
  const plafonds = plafondsHonoraires(b.date_conclusion_prevue, b.zone_honoraires);
  // Audit métier du 27/09 : sans date prévue de conclusion ni zone, le plafond
  // valait null et n'importe quelle part locataire passait le contrôle.
  const partLocataire = Number(b.honoraires_locataire ?? 0) > 0 || Number(b.honoraires_edl_locataire ?? 0) > 0;
  if (partLocataire && (!b.date_conclusion_prevue || !b.zone_honoraires))
    return 'Honoraires à la charge du locataire : renseignez la date prévue de conclusion et la zone des honoraires, sans lesquelles le plafond réglementaire ne peut pas être vérifié.';
  // Audit gestion du 29/09 : sans surface, le plafond (€/m²) ne se calcule
  // pas — la part du locataire passait alors sans contrôle.
  if (partLocataire && !(surface != null && surface > 0))
    return 'Honoraires à la charge du locataire : renseignez la surface habitable du logement, sans laquelle le plafond réglementaire (en €/m²) ne peut pas être vérifié.';
  for (const [titre, bailleur, locataire, plafond] of [
    ['Visite, dossier et bail', b.honoraires_bailleur, b.honoraires_locataire, plafonds.location],
    ['État des lieux', b.honoraires_edl_bailleur, b.honoraires_edl_locataire, plafonds.edl],
  ] as const) {
    // Une part locataire sans part bailleur saisie se compare à zéro : la loi
    // (art. 5 loi 89-462) plafonne la part du locataire à celle du bailleur.
    if (Number(locataire ?? 0) > 0 && Number(locataire) > Number(bailleur ?? 0))
      return `${titre} : la part du locataire ne peut pas dépasser celle du bailleur${bailleur == null ? ' (non renseignée, comptée pour 0 €)' : ''}.`;
    if (Number(locataire ?? 0) > 0 && plafond != null && surface != null && surface > 0 && Math.round(Number(locataire) * 100) > Math.round(plafond * surface * 100))
      return `${titre} : la part du locataire dépasse le plafond de ${(Math.round(plafond * surface * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € TTC pour ce logement.`;
  }
  return null;
}
