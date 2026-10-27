import { describe, expect, it } from 'vitest';
import { avecEcheanceReglementaire, classerPiecesBail, echeanceReglementaire, erreurDiagnosticBail, erreurEcheanceDpe, expirationCrepPositif, expirationDiagnostic, plafondDpe, statutPieceDiagnostic, type DiagnosticBail, type PieceBail } from '@/lib/documents-bail';

const aujourd = '2026-10-09';
function form(valeurs: Record<string,string> = {}) {
  const f = new FormData();
  Object.entries({type:'dpe',date_realisation:'2026-10-07',date_expiration:'2036-10-07',classe_dpe:'B',...valeurs}).forEach(([k,v])=>f.set(k,v));
  return f;
}
const diagnostic: DiagnosticBail = {id:'d',type:'dpe',date_realisation:'2026-10-07',date_expiration:'2036-10-07',document_id:'fichier',classe_dpe:'B',niveau:'lot'};

describe('Dates des rapports',()=>{
  it('garde le dernier jour réel du mois à la fin de la validité',()=>{
    expect(expirationDiagnostic('erp','2026-08-31')).toBe('2027-02-28');
    expect(expirationDiagnostic('dpe','2024-02-29')).toBe('2034-02-28');
  });
  it('efface une ancienne échéance pour un rapport sans durée fixe',()=>{
    expect(expirationDiagnostic('plomb','2026-10-07')).toBe('');
    expect(expirationDiagnostic('amiante_communes','2026-10-07')).toBe('');
  });
  it.each(['','2026-02-30','texte','2026-99-99'])('ne calcule pas une date à partir de %s',date=>{
    expect(expirationDiagnostic('dpe',date)).toBe('');
  });
  it('accepte les données du rapport et refuse les dates futures ou incohérentes',()=>{
    expect(erreurDiagnosticBail(form(),aujourd)).toBeUndefined();
    expect(erreurDiagnosticBail(form({date_realisation:'2027-01-01'}),aujourd)).toMatch(/non future/);
    expect(erreurDiagnosticBail(form({date_expiration:'2026-10-07'}),aujourd)).toMatch(/postérieure/);
    expect(erreurDiagnosticBail(form({date_expiration:'2026-10-06'}),aujourd)).toMatch(/postérieure/);
    expect(erreurDiagnosticBail(form({date_expiration:''}),aujourd)).toMatch(/expiration/);
  });
  it('exige la classe du DPE sans imposer une échéance au plomb négatif',()=>{
    expect(erreurDiagnosticBail(form({classe_dpe:''}),aujourd)).toMatch(/A à G/);
    expect(erreurDiagnosticBail(form({type:'plomb',date_expiration:'',classe_dpe:''}),aujourd)).toBeUndefined();
  });
});

describe('État des pièces',()=>{
  it('ne montre pas un fichier absent comme disponible',()=>{
    expect(statutPieceDiagnostic({...diagnostic,document_id:null},aujourd)).toEqual({libelle:'Fichier manquant',ton:'attention'});
    expect(statutPieceDiagnostic({...diagnostic,date_expiration:'2026-10-08'},aujourd).libelle).toBe('Expiré');
    expect(statutPieceDiagnostic({...diagnostic,date_expiration:null},aujourd).libelle).toBe('Date à compléter');
    expect(statutPieceDiagnostic({...diagnostic,classe_dpe:null},aujourd).libelle).toBe('Classe à compléter');
    expect(statutPieceDiagnostic(diagnostic,aujourd).libelle).toBe('Disponible');
  });
  it('sépare notice et justificatifs sans doubler les PDF du contrat',()=>{
    const p=(id:string,type='autre',titre=id,purged_at:string|null=null):PieceBail=>({id,type,titre,purged_at});
    const pieces=[p('bail','bail'),p('edl','etat_des_lieux'),p('diag','diagnostic'),p('copro'),p('n','courrier',"Notice d'information (annexe au bail)"),p('assurance'),p('assurance'),p('retire','autre','Retiré','2026-10-08'),p('diag-legacy')];
    const resultat=classerPiecesBail(pieces,['diag','diag-legacy'],'copro');
    expect(resultat.notices.map(p=>p.id)).toEqual(['n']);
    expect(resultat.autres.map(p=>p.id)).toEqual(['assurance']);
  });
});

// DOC-01 (audit #264) : décret n° 2020-1610, art. 1 — DPE réalisés du 01/01/2013 au 31/12/2017 valables jusqu'au
// 31/12/2022, du 01/01/2018 au 30/06/2021 jusqu'au 31/12/2024, ensuite dix ans.
describe('Validité réglementaire du DPE',()=>{
  it('plafonne l’échéance pré-remplie des DPE réalisés avant le 1er juillet 2021',()=>{
    expect(expirationDiagnostic('dpe','2019-05-10')).toBe('2024-12-31');
    expect(expirationDiagnostic('dpe','2018-01-01')).toBe('2024-12-31');
    expect(expirationDiagnostic('dpe','2021-06-30')).toBe('2024-12-31');
    expect(expirationDiagnostic('dpe','2015-01-01')).toBe('2022-12-31');
    expect(expirationDiagnostic('dpe','2013-01-01')).toBe('2022-12-31');
    expect(expirationDiagnostic('dpe','2017-12-31')).toBe('2022-12-31');
    expect(expirationDiagnostic('dpe','2021-07-01')).toBe('2031-07-01');
    expect(expirationDiagnostic('dpe','2012-12-31')).toBe('2022-12-31');
    expect(plafondDpe('2012-06-01')).toBeNull();
    expect(plafondDpe('2021-07-01')).toBeNull();
    // Le plafond ne concerne que le DPE.
    expect(expirationDiagnostic('erp','2019-05-10')).toBe('2019-11-10');
  });
  it('plafonne à la lecture une échéance enregistrée sans réécrire les autres',()=>{
    expect(echeanceReglementaire('dpe','2019-05-10','2029-05-10')).toBe('2024-12-31');
    expect(echeanceReglementaire('dpe','2019-05-10','2023-01-01')).toBe('2023-01-01');
    expect(echeanceReglementaire('dpe','2014-03-10',null)).toBe('2022-12-31');
    expect(echeanceReglementaire('dpe','2022-03-15','2032-03-15')).toBe('2032-03-15');
    expect(echeanceReglementaire('electricite','2019-05-10','2025-05-10')).toBe('2025-05-10');
    const lignes=[{id:'a',type:'dpe',date_realisation:'2019-05-10',date_expiration:'2029-05-10'},{id:'b',type:'erp',date_realisation:'2026-10-01',date_expiration:'2027-04-01'}];
    expect(avecEcheanceReglementaire(lignes).map(l=>l.date_expiration)).toEqual(['2024-12-31','2027-04-01']);
    expect(avecEcheanceReglementaire(lignes)[1]).toBe(lignes[1]);
    expect(lignes[0].date_expiration).toBe('2029-05-10');
  });
  it('refuse une échéance saisie au-delà du plafond, avec la règle et sa source',()=>{
    expect(erreurEcheanceDpe('dpe','2019-05-10','2029-05-10')).toMatch(/1er janvier 2018 et le 30 juin 2021.*31\/12\/2024.*2020-1610/);
    expect(erreurEcheanceDpe('dpe','2015-01-01','2025-01-01')).toMatch(/1er janvier 2013 et le 31 décembre 2017.*31\/12\/2022/);
    expect(erreurEcheanceDpe('dpe','2019-05-10','2024-12-31')).toBeUndefined();
    expect(erreurEcheanceDpe('dpe','2021-07-01','2031-07-01')).toBeUndefined();
    expect(erreurEcheanceDpe('erp','2019-05-10','2029-05-10')).toBeUndefined();
  });
});

// DOC-07 (audit #264) : CREP positif, six ans pour la location (art. R. 1334-11 du code de la santé publique).
describe('Constat de risque d’exposition au plomb',()=>{
  it('pré-remplit six ans après la réalisation quand le constat relève du plomb',()=>{
    expect(expirationCrepPositif('2015-06-01')).toBe('2021-06-01');
    expect(expirationCrepPositif('2024-02-29')).toBe('2030-02-28');
    expect(expirationCrepPositif('')).toBe('');
  });
});
