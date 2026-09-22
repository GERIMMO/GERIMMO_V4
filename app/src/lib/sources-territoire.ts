import type { Marche } from '@/lib/score-territoire';

const INSEE = 'https://api.insee.fr/melodi';
export const DEFINITION_LOCATIONS = 'Résidences principales du parc privé louées vides. Les meublés sont exclus. Chiffre du recensement arrondi à l’unité.';
export const DEFINITION_ENTREPRISES = 'Entreprises actives d’activité principale agences immobilières ou administration de biens (68.31Z/68.32A), avec un établissement référencé dans le département. Ce nombre ne mesure ni les agences ouvertes au public ni les concurrents directs.';
type ObservationInsee = { dimensions: Record<string, string>; attributes: { OBS_STATUS?: string }; measures: { OBS_VALUE_NIVEAU?: { value?: number } } };
export function lireLocationsInsee(resultat: { observations?: ObservationInsee[]; paging?: { next?: string } }, annee: number): Map<string, number> {
  if (resultat.paging?.next || !Array.isArray(resultat.observations)) throw new Error('Réponse statistique incomplète');
  const chiffres = new Map<string, number>();
  for (const o of resultat.observations) {
    const d = o.dimensions; const code = d.GEO?.match(/-DEP-(\d{2,3}|2[AB])$/)?.[1]; const v = o.measures?.OBS_VALUE_NIVEAU?.value;
    if (!code) continue;
    if (d.TSH !== '211' || d.RP_MEASURE !== 'DWELLINGS' || d.OCS !== 'DW_MAIN' || d.TIME_PERIOD !== String(annee) || ['CARS','BUILD_END','NRG_SRC','TDW','CARPARK','NOR','L_STAY'].some(k => d[k] !== '_T')) throw new Error('Catégorie statistique inattendue');
    if (o.attributes?.OBS_STATUS !== 'A' || typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    if (chiffres.has(code)) throw new Error('Département reçu deux fois');
    chiffres.set(code, Math.round(v));
  }
  if (!chiffres.size) throw new Error('Aucune statistique exploitable');
  return chiffres;
}
async function lireJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Gerimmo-donnees-territoriales/1.0' } });
  if (!r.ok) throw new Error('Source publique momentanément indisponible');
  return r.json();
}
/** Le passage quotidien actualise au plus sept départements, en commençant par les plus anciens.
 * Les sources déjà contrôlées depuis moins d'un mois sont conservées. Aucun accès payant. */
export async function actualiserMarchePublic(entree: Marche, maintenant = new Date()) {
  const marche = structuredClone(entree);
  const echecs: string[] = []; let logements = 0; let agences = 0; let tension = 0;
  const date = maintenant.toISOString(); const limite = Date.now() + 23000;
  const ancien = (value?: string) => !value || maintenant.getTime() - Date.parse(value) > 30 * 86400000;
  const sourceLogements = marche.sources.find(s => s.cle === 'logements_loues_prive');
  const datesLogements = Object.values(marche.departements).map(m => m.observations?.logements_loues_prive?.recupere_le).filter((v): v is string => Boolean(v));
  if (datesLogements.length < 100 || datesLogements.some(ancien)) {
    try {
      const catalogue = await lireJson<{ temporal?: { endPeriod?: string }; modified?: string }>(`${INSEE}/catalog/DS_RP_LOGEMENT_PRINC`);
      const annee = Number(catalogue.temporal?.endPeriod?.slice(0,4));
      if (!Number.isInteger(annee) || annee < 2020 || annee > maintenant.getFullYear()) throw new Error('Année statistique absente');
      const url = `${INSEE}/data/DS_RP_LOGEMENT_PRINC?GEO=DEP&TSH=211&TIME_PERIOD=${annee}&RP_MEASURE=DWELLINGS&OCS=DW_MAIN&maxResult=1000`;
      const resultat = await lireJson<Parameters<typeof lireLocationsInsee>[0]>(url);
      const chiffres = lireLocationsInsee(resultat, annee);
      for (const [code,v] of chiffres) {
        const m = marche.departements[code]; if (!m) continue;
        m.logements_loues_prive = v; m.observations ??= {};
        m.observations.logements_loues_prive = { observe_le: `${annee}-12-31`, recupere_le: date, source: 'INSEE — recensement', url, definition: DEFINITION_LOCATIONS }; logements++;
      }
      if (sourceLogements) { sourceLogements.recupere_le = date; sourceLogements.url = url; }
    } catch { echecs.push('Statistiques de logements INSEE'); }
  }
  const datesTension = Object.values(marche.departements).map(m => m.observations?.communes_zone_tendue?.recupere_le).filter((v): v is string => Boolean(v));
  if (datesTension.length < 101 || datesTension.some(ancien)) {
    try {
      const meta = await lireJson<{ organization?: { id?: string }; resources?: { format?: string; url?: string; last_modified?: string }[] }>('https://www.data.gouv.fr/api/1/datasets/liste-des-communes-selon-le-zonage-tlv-1/');
      if (meta.organization?.id !== '534fff8da3a7292c64a77eee') throw new Error('Producteur officiel non reconnu');
      const ressource = meta.resources?.find(r => r.format === 'csv');
      const url = new URL(ressource?.url ?? '');
      if (url.protocol !== 'https:' || url.hostname !== 'static.data.gouv.fr') throw new Error('Source de zonage non reconnue');
      const r = await fetch(url.href, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error('Zonage indisponible');
      const chiffres = lireZonesTenduesCsv(await r.text());
      if (chiffres.size !== 101) throw new Error('Couverture du zonage incomplète');
      for (const [code,v] of chiffres) {
        const m = marche.departements[code]; if (!m) continue;
        m.communes_zone_tendue = v; m.observations ??= {};
        m.observations.communes_zone_tendue = { observe_le: '2025-12-22', recupere_le: date, source: 'Ministère de la Transition écologique — zonage officiel', url: SOURCE_ZONAGE, definition: DEFINITION_ZONAGE }; tension++;
      }
    } catch { echecs.push('Zonage officiel des communes'); }
  }
  const aActualiser = Object.entries(marche.departements).filter(([,m]) => ancien(m.observations?.agences?.recupere_le)).sort((a,b) => (Date.parse(a[1].observations?.agences?.recupere_le ?? '') || 0) - (Date.parse(b[1].observations?.agences?.recupere_le ?? '') || 0)).slice(0,7);
  for (const [code,m] of aActualiser) {
    if (Date.now() > limite) { echecs.push('Collecte poursuivie au prochain passage'); break; }
    const url = `https://recherche-entreprises.api.gouv.fr/search?activite_principale=68.31Z%2C68.32A&departement=${code}&etat_administratif=A&page=1&per_page=1`;
    try {
      const r = await lireJson<{ total_results?: number }>(url);
      if (!Number.isSafeInteger(r.total_results) || Number(r.total_results) < 0) throw new Error('Total absent');
      m.agences = Number(r.total_results); m.observations ??= {};
      m.observations.agences = { observe_le: date.slice(0,10), recupere_le: date, source: 'Annuaire des entreprises — données publiques Sirene', url, definition: DEFINITION_ENTREPRISES }; agences++;
    } catch { echecs.push(`Entreprises immobilières (${code})`); }
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  return { marche, bilan: { logements, agences, tension, echecs } };
}

export const SOURCE_ZONAGE = 'https://www.data.gouv.fr/datasets/liste-des-communes-selon-le-zonage-tlv-1';
export const DEFINITION_ZONAGE = 'Nombre de communes classées tendues ou touristiques et tendues dans le fichier du ministère relatif au décret du 22 décembre 2025. Indicateur de marché, sans décision fiscale ou locative automatique.';
export function lireZonesTenduesCsv(texte: string): Map<string, number> {
  const lignes: string[][] = []; let ligne: string[] = []; let champ = ''; let cite = false;
  texte = texte.replace(/^\uFEFF/, '');
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === '"') { if (cite && texte[i+1] === '"') { champ += '"'; i++; } else cite = !cite; }
    else if (c === ';' && !cite) { ligne.push(champ); champ = ''; }
    else if (c === '\n' && !cite) { ligne.push(champ.replace(/\r$/, '')); if (ligne.some(Boolean)) lignes.push(ligne); ligne = []; champ = ''; }
    else champ += c;
  }
  if (cite) throw new Error('Fichier officiel incomplet');
  if (champ || ligne.length) { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); }
  const entete = lignes.shift() ?? []; const dep = entete.indexOf('DEP'); const commune = entete.indexOf('CODGEO25'); const zone = entete.indexOf('Zonage TLV post décret 22/12/2025');
  if ([dep, commune, zone].some(i => i < 0)) throw new Error('Structure officielle du zonage modifiée');
  const resultat = new Map<string, number>(); const communes = new Set<string>();
  for (const l of lignes) {
    const d = l[dep]; const code = l[commune]; const z = l[zone];
    if (!/^(\d{2,3}|2[AB])$/.test(d) || !/^(\d{5}|2[AB]\d{3})$/.test(code) || communes.has(code) || !['1. Zone tendue','2. Zone touristique et tendue','3. Non tendue'].includes(z)) throw new Error('Ligne de zonage invalide ou en double');
    communes.add(code); resultat.set(d, (resultat.get(d) ?? 0) + (z.startsWith('3.') ? 0 : 1));
  }
  if (!resultat.size) throw new Error('Zonage vide');
  return resultat;
}
