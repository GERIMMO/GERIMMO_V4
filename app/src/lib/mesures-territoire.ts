import type { SupabaseClient } from '@supabase/supabase-js';
import { DEPARTEMENTS, departementDuCodePostal } from '@/lib/territoire';
import type { Marche, MarcheDepartement } from '@/lib/score-territoire';

export type ObservationTerritoriale = { observe_le: string; recupere_le: string; source: string; url?: string; definition?: string };
export type LigneMarche = {
  departement: string; logements_locatifs: number | null; agences_locales: number | null; tension_marche: number | null;
  concurrence: number | null; artisans_disponibles: number | null; cout_publicitaire_cents: number | null;
  clics_publicitaires: number | null; prospects: number | null; clients_gagnes: number | null;
  cout_acquisition_cents: number | null; cout_prospect_cents: number | null;
  periode_publicite_debut: string | null; periode_publicite_fin: string | null;
  observations: Record<string, ObservationTerritoriale>; mesure_le: string;
};
export const COLONNES_MARCHE = 'departement,logements_locatifs,agences_locales,tension_marche,concurrence,artisans_disponibles,cout_publicitaire_cents,clics_publicitaires,prospects,clients_gagnes,cout_acquisition_cents,cout_prospect_cents,periode_publicite_debut,periode_publicite_fin,observations,mesure_le';
export const LIBELLES_MARCHE: Record<string, string> = {
  logements_loues_prive: 'logements privés loués vides', agences: 'entreprises immobilières', communes_zone_tendue: 'communes en zone tendue',
  artisans_disponibles: 'artisans vérifiés', concurrence: 'concurrence directe', cout_acquisition_cents: 'coût par nouveau client',
};
const CORRESPONDANCE = {
  logements_loues_prive: 'logements_locatifs', agences: 'agences_locales', communes_zone_tendue: 'tension_marche',
  concurrence: 'concurrence', artisans_disponibles: 'artisans_disponibles', cout_acquisition_cents: 'cout_acquisition_cents',
} as const;
export const DUREE_FRAICHEUR_JOURS: Record<string, number> = {
  logements_loues_prive: 400, agences: 100, communes_zone_tendue: 400, concurrence: 100,
  artisans_disponibles: 35, cout_acquisition_cents: 62,
};
export function observationFraiche(o: ObservationTerritoriale | undefined, cle: string, maintenant = new Date()): boolean {
  if (!o?.source || !o.recupere_le || !o.observe_le) return false;
  const date = Date.parse(o.recupere_le);
  const age = maintenant.getTime() - date;
  return Number.isFinite(date) && age >= -86400000 && age <= (DUREE_FRAICHEUR_JOURS[cle] ?? 100) * 86400000;
}
/** Fusion champ par champ ; un recalcul ne rajeunit jamais une ancienne source. */
export function fusionnerMarche(fichier: Marche, lignes: LigneMarche[], maintenant = new Date()): Marche {
  const parCode = new Map(lignes.map(l => [l.departement, l]));
  return { sources: fichier.sources, departements: Object.fromEntries(DEPARTEMENTS.map(({ code }) => {
    const base = fichier.departements[code];
    const ligne = parCode.get(code);
    const resultat: MarcheDepartement = { logements_loues_prive: null, agences: null, communes_zone_tendue: null, observations: {}, perimees: [] };
    for (const [cle, colonne] of Object.entries(CORRESPONDANCE) as [keyof typeof CORRESPONDANCE, typeof CORRESPONDANCE[keyof typeof CORRESPONDANCE]][]) {
      const oFichier = base?.observations?.[cle];
      const oBase = ligne?.observations?.[cle];
      const utiliserBase = oBase && (!oFichier || Date.parse(oBase.recupere_le) >= Date.parse(oFichier.recupere_le));
      const observation = utiliserBase ? oBase : oFichier;
      let valeur = utiliserBase ? ligne?.[colonne] : base?.[cle];
      if (cle === 'cout_acquisition_cents' && utiliserBase) {
        valeur = ligne?.clients_gagnes != null && ligne.clients_gagnes > 0 && ligne.cout_publicitaire_cents != null && ligne.cout_publicitaire_cents >= 0 && ligne.periode_publicite_debut && ligne.periode_publicite_fin ? Math.round(ligne.cout_publicitaire_cents / ligne.clients_gagnes) : null;
      }
      if (observation) resultat.observations![cle] = observation;
      if (typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0 && observationFraiche(observation, cle, maintenant)) resultat[cle] = valeur;
      else { resultat[cle] = null; if (valeur != null) resultat.perimees!.push(cle); }
    }
    resultat.clients_gagnes = ligne?.clients_gagnes ?? null;
    resultat.prospects = ligne?.prospects ?? null;
    resultat.cout_publicitaire_cents = ligne?.cout_publicitaire_cents ?? null;
    resultat.clics_publicitaires = ligne?.clics_publicitaires ?? null;
    resultat.cout_prospect_cents = ligne?.cout_prospect_cents ?? null;
    resultat.periode_publicite_debut = ligne?.periode_publicite_debut ?? null;
    resultat.periode_publicite_fin = ligne?.periode_publicite_fin ?? null;
    return [code, resultat];
  })) };
}

export type ArtisanTerritorial = { id: string; statut_plateforme: string; siret_etat: string; blacklist_globale_le: string | null; visibilite: string };
export function artisansVerifiesParDepartement(artisans: ArtisanTerritorial[], zones: { artisan_id: string; code_postal: string }[]): Map<string, number> {
  const autorises = new Set(artisans.filter(a => a.statut_plateforme === 'valide' && a.siret_etat === 'verifie' && a.blacklist_globale_le === null && a.visibilite === 'publique').map(a => a.id));
  const ensembles = new Map<string, Set<string>>();
  for (const zone of zones) {
    const code = departementDuCodePostal(zone.code_postal);
    if (!code || !DEPARTEMENTS.some(d => d.code === code) || !autorises.has(zone.artisan_id)) continue;
    const ids = ensembles.get(code) ?? new Set<string>(); ids.add(zone.artisan_id); ensembles.set(code, ids);
  }
  return new Map(DEPARTEMENTS.map(d => [d.code, ensembles.get(d.code)?.size ?? 0]));
}

export type MesurePublicitaire = { id: number; campagne_id: string | null; meta_ad_id: string | null; depense_cents: number; clics: number; prospects: number; mesure_le: string; details: Record<string, unknown> };
export type PubliciteDepartement = { depense: number; clics: number; prospects: number; clients: number | null; coutClient: number | null; coutProspect: number | null; mesureLe: string };
/** Les photographies sont cumulatives. On retient la dernière par campagne et département,
 * pour une période exactement définie. Une somme à vie ne devient jamais une dépense mensuelle.
 * Les campagnes sans ventilation géographique vérifiée restent hors du calcul territorial. */
export function publiciteParDepartement(mesures: MesurePublicitaire[], debut: string, fin: string, maintenant = new Date()) {
  const dernieres = new Map<string, MesurePublicitaire>();
  let ignorees = 0;
  for (const m of mesures) {
    const d = m.details ?? {};
    const date = Date.parse(m.mesure_le);
    if (!m.campagne_id || d.niveau !== 'campagne' || d.mode !== 'cumul_periode' || d.periode_debut !== debut || d.periode_fin !== fin || d.attribution_geographique_verifiee !== true || !DEPARTEMENTS.some(x => x.code === d.departement) || !Number.isFinite(date) || date > maintenant.getTime() || [m.depense_cents, m.clics, m.prospects].some(n => !Number.isSafeInteger(n) || n < 0)) { ignorees++; continue; }
    const cle = `${m.campagne_id}:${d.departement}`;
    const precedente = dernieres.get(cle);
    if (!precedente || date > Date.parse(precedente.mesure_le) || (date === Date.parse(precedente.mesure_le) && m.id > precedente.id)) dernieres.set(cle, m);
  }
  const resultat = new Map<string, PubliciteDepartement>();
  for (const m of dernieres.values()) {
    const code = String(m.details.departement);
    const total = resultat.get(code) ?? { depense: 0, clics: 0, prospects: 0, clients: 0, coutClient: null, coutProspect: null, mesureLe: m.mesure_le };
    total.depense += m.depense_cents; total.clics += m.clics; total.prospects += m.prospects;
    const clients = m.details.clients_gagnes;
    if (total.clients !== null && m.details.attribution_clients_verifiee === true && Number.isSafeInteger(clients) && Number(clients) >= 0) total.clients += Number(clients); else total.clients = null;
    if (m.mesure_le < total.mesureLe) total.mesureLe = m.mesure_le;
    total.coutClient = total.clients ? Math.round(total.depense / total.clients) : null;
    total.coutProspect = total.prospects ? Math.round(total.depense / total.prospects) : null;
    resultat.set(code, total);
  }
  return { departements: resultat, ignorees };
}
export function moisPrecedent(maintenant = new Date()) {
  const dateParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(maintenant);
  const [annee, mois] = dateParis.split('-').map(Number);
  return { debut: new Date(Date.UTC(annee, mois - 2, 1)).toISOString().slice(0,10), fin: new Date(Date.UTC(annee, mois - 1, 0)).toISOString().slice(0,10) };
}

/** Toutes les pages sont lues : le portefeuille n'est pas tronqué au premier millier. */
export async function lireTerritoire(supabase: SupabaseClient, table: string, colonnes: string, ordre = ['id']) {
  const lignes: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    let q = supabase.from(table).select(colonnes);
    for (const col of ordre) q = q.order(col, { ascending: true });
    const r = await q.range(page * 1000, page * 1000 + 999);
    if (r.error) return { data: null, error: r.error };
    const lot = (r.data ?? []) as unknown as Record<string, unknown>[];
    lignes.push(...lot);
    if (lot.length < 1000) return { data: lignes, error: null };
  }
}
