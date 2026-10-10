import { describe, expect, it } from 'vitest';
import { classerPiecesBail, erreurDiagnosticBail, expirationDiagnostic, statutPieceDiagnostic, type DiagnosticBail, type PieceBail } from '@/lib/documents-bail';

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
