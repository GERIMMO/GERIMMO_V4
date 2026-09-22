import { describe, expect, it } from 'vitest';
import { artisansVerifiesParDepartement, fusionnerMarche, moisPrecedent, publiciteParDepartement, type ArtisanTerritorial, type LigneMarche, type MesurePublicitaire } from '../src/lib/mesures-territoire';
import { lireLocationsInsee, lireZonesTenduesCsv } from '../src/lib/sources-territoire';
import type { Marche } from '../src/lib/score-territoire';
const maintenant = new Date('2026-09-22T12:00:00Z');
const source = { source: 'INSEE', observe_le: '2023-12-31', recupere_le: '2026-09-21T12:00:00Z' };
const marche: Marche = { sources: [], departements: { '91': { logements_loues_prive: 100, agences: 5, communes_zone_tendue: null, observations: { logements_loues_prive: source, agences: { ...source, source:'Sirene' } } } } };
describe('sources et fraîcheur territoriales', () => {
  it('préfère la mesure sourcée la plus récente et conserve son année réelle', () => {
    const ligne = { departement: '91', logements_locatifs: 120, observations: { logements_loues_prive: { ...source, recupere_le: '2026-09-22T01:00:00Z' } } } as unknown as LigneMarche;
    const m = fusionnerMarche(marche, [ligne], maintenant).departements['91'];
    expect(m.logements_loues_prive).toBe(120); expect(m.agences).toBe(5);
    expect(m.observations?.logements_loues_prive.observe_le).toBe('2023-12-31');
  });
  it('un recalcul aujourd’hui ne rajeunit pas une statistique trop ancienne', () => {
    const ligne = { departement:'91', agences_locales:800, mesure_le:maintenant.toISOString(), observations:{ agences: { ...source, recupere_le:'2024-01-01' } } } as unknown as LigneMarche;
    expect(fusionnerMarche(marche,[ligne],maintenant).departements['91'].agences).toBe(5);
    const ancien: Marche = { sources:[], departements:{ '91':{ logements_loues_prive:null, agences:800, communes_zone_tendue:null, observations:ligne.observations } } };
    const m = fusionnerMarche(ancien,[],maintenant).departements['91'];
    expect(m.agences).toBeNull(); expect(m.perimees).toContain('agences');
  });
  it('une valeur sans origine ni date reste inconnue', () => {
    const m = fusionnerMarche({sources:[],departements:{'91':{logements_loues_prive:100,agences:30,communes_zone_tendue:2}}},[],maintenant).departements['91'];
    expect(m.logements_loues_prive).toBeNull(); expect(m.agences).toBeNull();
  });
});
describe('réseau réellement vérifié', () => {
  it('exclut les profils en attente, privés, exclus et non vérifiés ; dédouble les communes', () => {
    const valide: ArtisanTerritorial = { id:'a',statut_plateforme:'valide',siret_etat:'verifie',blacklist_globale_le:null,visibilite:'publique' };
    const artisans = [valide,{...valide,id:'b',statut_plateforme:'en_attente'},{...valide,id:'c',visibilite:'privee'},{...valide,id:'d',blacklist_globale_le:'2026-01-01'},{...valide,id:'e',siret_etat:'non_verifie'}];
    const zones = artisans.flatMap(a=>[{artisan_id:a.id,code_postal:'91000'},{artisan_id:a.id,code_postal:'91200'}]);
    const comptes = artisansVerifiesParDepartement(artisans,zones);
    expect(comptes.get('91')).toBe(1); expect(comptes.get('92')).toBe(0);
  });
});
function mesure(extra: Partial<MesurePublicitaire> = {}): MesurePublicitaire {
  return { id:1,campagne_id:'c1',meta_ad_id:null,depense_cents:100,clics:10,prospects:2,mesure_le:'2026-09-01T10:00:00Z',details:{niveau:'campagne',mode:'cumul_periode',departement:'91',periode_debut:'2026-08-01',periode_fin:'2026-08-31',attribution_geographique_verifiee:true,attribution_clients_verifiee:true,clients_gagnes:1},...extra };
}
describe('publicité attribuée au territoire', () => {
  const compter = (ms: MesurePublicitaire[]) => publiciteParDepartement(ms,'2026-08-01','2026-08-31',maintenant);
  it('retient le dernier relevé de chaque campagne, même lorsque Meta corrige le total à la baisse', () => {
    const ancien = mesure({depense_cents:800});
    const recent = mesure({id:2,mesure_le:'2026-09-02T10:00:00Z',depense_cents:600,prospects:3});
    const autre = mesure({id:3,campagne_id:'c2',depense_cents:400});
    expect(compter([recent,autre,ancien]).departements.get('91')).toMatchObject({depense:1000,prospects:5,clients:2,coutClient:500,coutProspect:200});
  });
  it('refuse les cumuls à vie, les périodes différentes et l’attribution absente', () => {
    const base = mesure();
    const ms=[mesure({details:{}}),mesure({id:2,details:{...base.details,periode_debut:'2026-07-01'}}),mesure({id:3,details:{...base.details,attribution_geographique_verifiee:false}})];
    expect(compter(ms).departements.size).toBe(0); expect(compter(ms).ignorees).toBe(3);
  });
  it('ne présente jamais un coût par prospect comme un coût par client', () => {
    const base=mesure(); const r=compter([mesure({details:{...base.details,attribution_clients_verifiee:false}})]).departements.get('91');
    expect(r).toMatchObject({coutProspect:50,coutClient:null,clients:null});
  });
  it('garde le coût client inconnu si aucun client n’a été gagné', () => {
    const base=mesure(); expect(compter([mesure({details:{...base.details,clients_gagnes:0}})]).departements.get('91')?.coutClient).toBeNull();
  });
  it('calcule le mois civil précédent à Paris, y compris au changement d’année', () => {
    expect(moisPrecedent(new Date('2026-01-15T10:00:00Z'))).toEqual({debut:'2025-12-01',fin:'2025-12-31'});
    expect(moisPrecedent(new Date('2026-08-31T22:30:00Z'))).toEqual({debut:'2026-08-01',fin:'2026-08-31'});
  });
});
describe('import INSEE', () => {
  const o = { dimensions:{GEO:'2026-DEP-91',TSH:'211',RP_MEASURE:'DWELLINGS',OCS:'DW_MAIN',TIME_PERIOD:'2023',CARS:'_T',BUILD_END:'_T',NRG_SRC:'_T',TDW:'_T',CARPARK:'_T',NOR:'_T',L_STAY:'_T'},attributes:{OBS_STATUS:'A'},measures:{OBS_VALUE_NIVEAU:{value:100.51}} };
  it('importe la seule catégorie documentée et arrondit le recensement', () => expect(lireLocationsInsee({observations:[o]},2023).get('91')).toBe(101));
  it('refuse le parc social et les réponses partielles plutôt que de doubler les logements', () => {
    expect(()=>lireLocationsInsee({observations:[{...o,dimensions:{...o.dimensions,TSH:'221'}}]},2023)).toThrow();
    expect(()=>lireLocationsInsee({observations:[o,o]},2023)).toThrow();
    expect(()=>lireLocationsInsee({observations:[o],paging:{next:'suite'}},2023)).toThrow();
  });
});


describe('zonage officiel', () => {
  const enTete = 'CODGEO25;DEP;LIBGEO;Zonage TLV post décret 22/12/2025\n';
  it('compte les deux catégories tendues, distingue zéro de département absent et lit les guillemets', () => {
    const texte = enTete + '91001;91;"Ville; A";1. Zone tendue\n91002;91;B;2. Zone touristique et tendue\n92001;92;C;3. Non tendue\n';
    const r = lireZonesTenduesCsv(texte); expect(r.get('91')).toBe(2); expect(r.get('92')).toBe(0); expect(r.get('93')).toBeUndefined();
  });
  it('refuse les doublons et un changement de catégorie du producteur', () => {
    const ligne = '91001;91;Ville;1. Zone tendue\n';
    expect(() => lireZonesTenduesCsv(enTete+ligne+ligne)).toThrow();
    expect(() => lireZonesTenduesCsv(enTete+'91001;91;Ville;Nouvelle catégorie\n')).toThrow();
  });
});
