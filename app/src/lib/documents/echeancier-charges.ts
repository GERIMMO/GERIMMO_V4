import {assemblerPage,Fusion,echapper,eur,formaterDateFr,tableau,titre,section} from './gabarit';
import type {EcheancierCharges} from '@/lib/echeanciers-charges';
export function documentEcheancierCharges(p:EcheancierCharges,c:{locataire:string;logement:string;adresse:string;emetteur:string;annee:number;charges:number;provisions:number}){
 const f=new Fusion();
 const corps=titre('Décompte et proposition d’échéancier',`Charges ${c.annee}`,[])+
 `<p>Émetteur : ${f.champ(c.emetteur,'Identité du bailleur')}<br>Locataire : ${f.champ(c.locataire,'Identité du locataire')}<br>Logement : ${f.champ(c.logement,'Logement')}<br>${f.champ(c.adresse,'Adresse du logement')}</p>`+
 tableau([{libelle:'Décompte'},{libelle:'Montant',droite:true}],[[`Charges réelles de l’exercice ${c.annee}`,eur(c.charges)],['Provisions déjà appelées',eur(c.provisions)],['Complément de charges',eur(p.total_cents/100)]])+
 `<p>Le décompte détaillé et ses justificatifs sont consultables dans votre espace. Les provisions impayées restent suivies séparément ; elles ne sont pas réclamées une seconde fois ici.</p>`+
 section('Proposition de paiement')+tableau([{libelle:'Échéance'},{libelle:'Date'},{libelle:'Montant',droite:true}],p.echeances.map(e=>[String(e.rang),formaterDateFr(e.date),eur(e.du_cents/100)]))+
 `<p>Cet échéancier est une proposition en attente de votre accord dans Gerimmo. Il ne vaut ni prélèvement, ni quittance, ni preuve de paiement. Le propriétaire confirmera chaque réception après vérification.</p><p>Référence du décompte : ${echapper(p.regularisation_id)}.</p>`;
 return assemblerPage({f,titreDocument:`Échéancier de charges ${c.annee}`,nomPied:'Suivi des charges',reference:`ECH-${p.id}`,corps});
}
