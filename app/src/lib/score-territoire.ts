import { DEPARTEMENTS, type EmpreinteDepartement } from '@/lib/territoire';
import type { ObservationTerritoriale } from '@/lib/mesures-territoire';

export type MarcheDepartement = {
  logements_loues_prive: number | null; agences: number | null; communes_zone_tendue: number | null;
  artisans_disponibles?: number | null; concurrence?: number | null; cout_acquisition_cents?: number | null;
  clients_gagnes?: number | null; prospects?: number | null; cout_publicitaire_cents?: number | null; clics_publicitaires?: number | null;
  cout_prospect_cents?: number | null; periode_publicite_debut?: string | null; periode_publicite_fin?: string | null;
  observations?: Record<string, ObservationTerritoriale>; perimees?: string[];
};
export type Marche = {
  sources: { cle: string; libelle: string; fournisseur: string; url: string; recupere_le: string | null }[];
  departements: Record<string, MarcheDepartement>;
};
export type Voisinage = Record<string, string[]>;
/** Poids de pilotage explicites, pas une probabilité de réussite commerciale. */
export const POIDS = { marche: .30, agences: .15, tension: .10, proximite: .15, artisans: .15, acquisition: .10, concurrence: .05 } as const;
export const SEUIL_PERTINENCE = 20;
const CLES = ['logements_loues_prive', 'agences', 'communes_zone_tendue', 'artisans_disponibles', 'cout_acquisition_cents', 'concurrence'] as const;
export type Candidat = {
  code: string; nom: string; region: string; score: number;
  composantes: Record<keyof typeof POIDS, number>; voisinsOuverts: string[]; manquants: string[];
  couverture: number; perimees: string[];
};
export function departementsOuverts(empreinte: EmpreinteDepartement[]): Set<string> {
  return new Set(empreinte.filter(l => l.agences + l.proprietairesDirects > 0 || l.biens > 0).map(l => l.code));
}
/** Aucun classement n'invente de valeur absolue. Les ex aequo ont le même rang. */
function centiles(valeurs: (number | null | undefined)[], inverse = false): number[] {
  const presentes = valeurs.filter((v): v is number => v != null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  return valeurs.map(v => {
    if (v == null || !Number.isFinite(v) || v < 0) return 0;
    if (presentes.length < 2 || presentes[0] === presentes.at(-1)) return v === 0 && !inverse ? 0 : 50;
    const rang = presentes.filter(p => inverse ? p > v : p < v).length / (presentes.length - 1);
    return Math.round(rang * 100);
  });
}
export function noterCandidats(entree: { empreinte: EmpreinteDepartement[]; marche: Marche; voisinage: Voisinage }): Candidat[] {
  const ouverts = departementsOuverts(entree.empreinte);
  const candidats = DEPARTEMENTS.filter(d => !ouverts.has(d.code));
  const ms = candidats.map(d => entree.marche.departements[d.code] ?? { logements_loues_prive: null, agences: null, communes_zone_tendue: null });
  const rangs = {
    marche: centiles(ms.map(m => m.logements_loues_prive)), agences: centiles(ms.map(m => m.agences)), tension: centiles(ms.map(m => m.communes_zone_tendue)),
    artisans: centiles(ms.map(m => m.artisans_disponibles)), acquisition: centiles(ms.map(m => m.cout_acquisition_cents), true), concurrence: centiles(ms.map(m => m.concurrence), true),
  };
  return candidats.map((d, i) => {
    const m = ms[i]; const voisins = entree.voisinage[d.code] ?? []; const voisinsOuverts = voisins.filter(v => ouverts.has(v)).sort();
    const composantes = { marche: rangs.marche[i], agences: rangs.agences[i], tension: rangs.tension[i], artisans: rangs.artisans[i], acquisition: rangs.acquisition[i], concurrence: rangs.concurrence[i], proximite: voisins.length ? Math.round(100 * voisinsOuverts.length / voisins.length) : 0 };
    const score = Math.round((Object.keys(POIDS) as (keyof typeof POIDS)[]).reduce((n, cle) => n + composantes[cle] * POIDS[cle], 0));
    const manquants = CLES.filter(cle => m[cle] == null);
    return { code: d.code, nom: d.nom, region: d.region, score, composantes, voisinsOuverts, manquants, couverture: Math.round(100 * (CLES.length - manquants.length) / CLES.length), perimees: m.perimees ?? [] };
  }).sort((a, b) => b.score - a.score || b.couverture - a.couverture || b.composantes.proximite - a.composantes.proximite || a.code.localeCompare(b.code));
}
export type Decision = { regionCourante: string | null; prochain: Candidat | null; changementDeRegion: boolean; raison: string };
/** Une recommandation d'étude, jamais une autorisation de lancement ou de dépense. */
export function decider(empreinte: EmpreinteDepartement[], candidats: Candidat[], seuil = SEUIL_PERTINENCE): Decision {
  const regionCourante = empreinte[0]?.region ?? null;
  const renseignes = candidats.filter(c => !c.manquants.includes('logements_loues_prive') || !c.manquants.includes('agences'));
  if (!renseignes.length) return { regionCourante, prochain: null, changementDeRegion: false, raison: candidats.length ? 'Les données de marché sont insuffisantes pour choisir un département. La prochaine étape est de compléter les sources.' : 'Gerimmo est déjà présent dans tous les départements.' };
  const p = renseignes.find(c => c.region === regionCourante && c.score >= seuil) ?? renseignes[0];
  const changementDeRegion = regionCourante !== null && p.region !== regionCourante;
  return { regionCourante, prochain: p, changementDeRegion, raison: `${p.nom} (${p.code}) est le département à étudier en priorité${changementDeRegion ? ', dans une nouvelle région' : ''}. Son indice est de ${p.score}/100, avec ${p.couverture} % des indicateurs renseignés. Ce classement ne mesure pas une probabilité de réussite.` };
}
export type PrioriteTerritoriale = { public: 'donnees' | 'artisans' | 'agences' | 'proprietaires'; titre: string; raison: string; etapes: string[]; pilotePreparable: boolean };
export function prioriteTerritoriale(m: MarcheDepartement): PrioriteTerritoriale {
  if (m.artisans_disponibles == null) return { public: 'donnees', titre: 'Vérifier le réseau d’artisans', raison: 'La couverture artisanale n’est pas encore connue. Il faut la vérifier avant de proposer la prise en charge des incidents.', etapes: ['Actualiser les artisans vérifiés et leurs zones.', 'Vérifier les métiers couverts et les assurances avant toute affectation.'], pilotePreparable: false };
  if (m.artisans_disponibles < 3) return { public: 'artisans', titre: 'Recruter des artisans en premier', raison: `${m.artisans_disponibles} artisan${m.artisans_disponibles > 1 ? 's' : ''} vérifié${m.artisans_disponibles > 1 ? 's' : ''} dans le réseau public. Le repère de démarrage est trois entreprises, pour avoir plusieurs solutions face à un incident.`, etapes: ['Compléter le réseau en plomberie, électricité et dépannage.', 'Faire vérifier chaque candidature par la supervision.', 'Confirmer les délais d’intervention avant les premiers clients.'], pilotePreparable: false };
  if (m.logements_loues_prive == null || m.agences == null) return { public: 'donnees', titre: 'Compléter l’étude du marché', raison: 'Le réseau existe, mais les volumes locatifs ou les entreprises immobilières manquent pour choisir le public à recruter.', etapes: ['Récupérer les statistiques publiques manquantes.', 'Comparer ensuite le besoin des bailleurs et celui des agences.'], pilotePreparable: false };
  const agences = m.agences >= 20 && m.logements_loues_prive > 0 && m.agences / m.logements_loues_prive >= .001;
  return { public: agences ? 'agences' : 'proprietaires', titre: agences ? 'Préparer un essai avec des agences' : 'Préparer un essai avec des propriétaires bailleurs',
    raison: agences ? `${m.agences.toLocaleString('fr-FR')} entreprises immobilières sont référencées pour ${m.logements_loues_prive.toLocaleString('fr-FR')} locations privées vides. La présence d’intermédiaires justifie de commencer par un petit essai en marque blanche.` : 'Le réseau artisanal permet de préparer un petit essai local. La densité d’entreprises immobilières mesurée invite à commencer par les propriétaires bailleurs.',
    etapes: ['Vérifier la qualité du service et la disponibilité des artisans.', 'Préparer une page locale et un contenu adapté au public choisi.', 'Faire valider le public, le montant et la durée avant toute publicité payante.', 'Mesurer les demandes, les clients réellement gagnés et leur coût avant d’élargir.'], pilotePreparable: true };
}
