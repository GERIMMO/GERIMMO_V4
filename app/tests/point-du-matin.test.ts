/**
 * Le point du matin (25/09) : la fonction pure qui assemble, pour chaque
 * équipe, ce qui a été fait, ce qui a échoué et les décisions soumises.
 */
import {describe,expect,it} from 'vitest';
import {ATTENTES_VIDES,assemblerPoints,bilanDuPassage,jourDuPoint,type Attentes,type PassageLu} from '../src/lib/point-du-matin';
import {EQUIPES,MISSIONS,missionsDeLEquipe} from '../src/lib/missions';

const maintenant=new Date('2026-09-25T07:30:00Z');
const il_y_a=(h:number)=>new Date(maintenant.getTime()-h*3_600_000).toISOString();
const passage=(mission:string,extra:Partial<PassageLu>={}):PassageLu=>({id:`${mission}-${extra.debut??'x'}`,mission,debut:il_y_a(3),fin:il_y_a(2.9),etat:'reussi',compte:0,bilan:null,...extra});
const point=(equipe:string,entree:Partial<Parameters<typeof assemblerPoints>[0]>={})=>assemblerPoints({passages:[],journaux:[],attentes:ATTENTES_VIDES,maintenant,...entree}).find(p=>p.equipe===equipe)!;

describe('Le point du matin',()=>{
 it('produit un point par équipe, chaque mission rattachée à une équipe connue',()=>{
  const points=assemblerPoints({passages:[],journaux:[],attentes:ATTENTES_VIDES,maintenant});
  expect(points.map(p=>p.equipe).sort()).toEqual(Object.keys(EQUIPES).sort());
  for(const m of Object.values(MISSIONS))expect(Object.hasOwn(EQUIPES,m.equipe)).toBe(true);
  expect(missionsDeLEquipe('finance')).toEqual(['quittances','relances','abonnements']);
  expect(missionsDeLEquipe('qualite')).toEqual([]);
 });
 it('lit les comptes réels du passage, jamais une phrase constante',()=>{
  const p=point('finance',{passages:[passage('quittances',{bilan:{envoyees:12,echecs:0},compte:12})]});
  expect(p.contenu.realisations).toEqual(['Quittances : envois réussis : 12, actions à reprendre : 0']);
  expect(p.contenu.echecs).toEqual([]);
  expect(p.contenu.sans_passage).toEqual(['Relances de loyers','Abonnements']);
 });
 it('retrouve le bilan dans le journal quand le passage ne l’a pas gardé',()=>{
  const p=passage('rappels',{debut:il_y_a(3),fin:il_y_a(2.9)});
  const journaux=[
   {evenement:'tache_rappels',details:{rappeles:9,echecs:0},created_at:il_y_a(2.95)},
   {evenement:'tache_rappels',details:{rappeles:99,echecs:0},created_at:il_y_a(27)},
   {evenement:'tache_appels',details:{envoyees:5},created_at:il_y_a(2.95)},
  ];
  expect(bilanDuPassage(p,journaux)).toEqual({rappeles:9,echecs:0});
  expect(point('incidents',{passages:[p],journaux}).contenu.realisations[0]).toContain('rappels envoyés : 9');
 });
 it('signale un échec sur un passage à vérifier ou un bilan avec des échecs',()=>{
  const p=point('conformite',{passages:[passage('signatures',{etat:'a_reprendre'}),passage('veille',{bilan:{preparees:3,echecs:2}})]});
  expect(p.contenu.echecs.sort()).toEqual(['Signatures et classement : passage à vérifier.','Veille réglementaire : des éléments ont échoué (nouvelles actualités collectées : 3, actions à reprendre : 2).']);
 });
 it('ignore les passages hors de la fenêtre et retient le plus récent',()=>{
  const p=point('exploitation',{passages:[passage('appels',{debut:il_y_a(30),bilan:{envoyees:99}}),passage('appels',{debut:il_y_a(2),bilan:{envoyees:4}})]});
  expect(p.contenu.passages).toHaveLength(1);
  expect(p.contenu.realisations).toEqual(['Avis d’échéance : envois réussis : 4']);
 });
 it('transforme chaque file d’attente en décision de l’équipe concernée, avec ses gardes',()=>{
  const attentes:Attentes={
   developpements:[{id:'d1',titre:'Corriger le tri',probleme:'Le tri est instable.',risque:'faible',statut:'autorisation',revision:'a'.repeat(40)},{id:'d2',titre:'Sans version',probleme:null,risque:'moyen',statut:'autorisation',revision:null},{id:'d3',titre:'Pas prête',probleme:null,risque:'moyen',statut:'en_test',revision:null}],
   publications:[{id:'p1',titre:'Le dépôt de garantie',statut:'brouillon',corps:'x'.repeat(300)},{id:'p2',titre:'À compléter',statut:'brouillon',corps:'[[à compléter]]'}],
   artisans:[{artisan_id:'a1',raison_sociale:'Plomberie Durand',siret_etat:'verifie',decennale_valide:true,rc_pro_deposee:true,nb_pieces:3},{artisan_id:'a2',raison_sociale:'Élec Martin',siret_etat:'declare',decennale_valide:false,rc_pro_deposee:false,nb_pieces:0}],
   retours:[{id:'r1',titre:'Exporter en CSV',nature:'idee',gravite:'N2',etat:'nouveau'},{id:'r2',titre:'Écran blanc',nature:'bug',gravite:'N1',etat:'nouveau'},{id:'r3',titre:'Bug mineur',nature:'bug',gravite:'N3',etat:'nouveau'}],
   veille:[{id:'v1',titre:'Nouveau plafond',source_nom:'Service Public',etude:{resume:'Un résumé suffisamment long pour être diffusé.',action:'Vérifier les baux.',publics:['bailleur']}},{id:'v2',titre:'Sans étude',source_nom:'ANIL',etude:null}],
  };
  const points=assemblerPoints({passages:[],journaux:[],attentes,maintenant});
  const par=(e:string)=>points.find(p=>p.equipe===e)!.decisions;
  expect(par('qualite').map(d=>[d.cle,d.validation,d.refus])).toEqual([['developpement:d1',true,true],['developpement:d2',false,true],['retour:r1',true,true],['retour:r2',true,false]]);
  expect(par('marketing').map(d=>[d.cle,d.validation])).toEqual([['publication:p1',true],['publication:p2',false]]);
  expect(par('incidents').map(d=>[d.cle,d.validation,Boolean(d.attestation)])).toEqual([['artisan:a1',true,true],['artisan:a2',false,false]]);
  expect(par('conformite').map(d=>[d.cle,d.validation])).toEqual([['veille:v1',true],['veille:v2',false]]);
  expect(par('finance')).toEqual([]);
  for(const d of points.flatMap(p=>p.decisions)){expect(d.titre.length).toBeGreaterThan(3);expect(d.options.length).toBeGreaterThan(0);expect(d.lien.startsWith('/admin/')).toBe(true);expect(d.recommandation.length).toBeGreaterThan(10);}
 });
 it('date le point à l’heure de Paris',()=>{
  expect(jourDuPoint(new Date('2026-09-24T22:30:00Z'))).toBe('2026-09-25');
  expect(jourDuPoint(new Date('2026-01-31T23:30:00Z'))).toBe('2026-02-01');
 });
});
