/**
 * Le point du matin (25/09) : la fonction pure qui assemble, pour chaque
 * équipe, ce qui a été fait, ce qui a échoué et les décisions soumises.
 */
import {describe,expect,it,vi} from 'vitest';
import {ATTENTES_VIDES,assemblerPoints,bilanDuPassage,genererPointsDuMatin,jourDuPoint,lireAttentes,type Attentes,type PassageLu} from '../src/lib/point-du-matin';
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
   // r4 : un problème signalé reçoit N2 par défaut (audit du 23/10) ; r5 est déjà pris en charge, r3 requalifié mineur.
   retours:[{id:'r1',titre:'Exporter en CSV',nature:'idee',gravite:'N2',etat:'nouveau'},{id:'r2',titre:'Écran blanc',nature:'bug',gravite:'N1',etat:'nouveau'},{id:'r3',titre:'Bug mineur',nature:'bug',gravite:'N3',etat:'nouveau'},
    {id:'r4',titre:'Quittance illisible',nature:'bug',gravite:'N2',etat:'en_examen'},{id:'r5',titre:'Déjà pris en charge',nature:'bug',gravite:'N2',etat:'en_cours'}],
   veille:[{id:'v1',titre:'Nouveau plafond',source_nom:'Service Public',etude:{resume:'Un résumé suffisamment long pour être diffusé.',action:'Vérifier les baux.',publics:['bailleur']}},{id:'v2',titre:'Sans étude',source_nom:'ANIL',etude:null}],
  };
  const points=assemblerPoints({passages:[],journaux:[],attentes,maintenant});
  const par=(e:string)=>points.find(p=>p.equipe===e)!.decisions;
  expect(par('qualite').map(d=>[d.cle,d.validation,d.refus])).toEqual([['developpement:d1',true,true],['developpement:d2',false,true],['retour:r1',true,true],['retour:r2',true,false],['retour:r4',true,false]]);
  const majeur=par('qualite').find(d=>d.cle==='retour:r4')!;
  expect(majeur.titre).toBe('Prendre en charge le problème majeur « Quittance illisible »');
  expect(majeur.options).toEqual(['Prendre en charge']);
  expect(majeur.lien).toBe('/admin/retours?nature=bug');
  expect(par('qualite').find(d=>d.cle==='retour:r2')!.titre).toBe('Prendre en charge le bug bloquant « Écran blanc »');
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

describe('Génération du point — lectures incomplètes',()=>{
 function lecteur(sourceEnPanne?:string){
  const resultat=(source:string)=>source===sourceEnPanne
   ? {data:null,error:{message:'Détail fournisseur privé à ne pas exposer'}}
   : {data:[],error:null};
  const requete=(source:string):unknown=>new Proxy({}, {get:(_cible,propriete)=>
   propriete==='then'?Promise.resolve(resultat(source)).then.bind(Promise.resolve(resultat(source))):()=>requete(source)});
  const rpc=vi.fn(async(_nom:string,_arguments?:unknown)=>({data:'point-fictif',error:null}));
  return {db:{from:(source:string)=>requete(source),rpc} as unknown as Parameters<typeof genererPointsDuMatin>[0],rpc};
 }
 it.each([
  ['agent_passages','passages'],['tech_log','journal technique'],
  ['development_proposals','évolutions'],['publications','publications'],
  ['artisans','artisans'],['retours_utilisateurs','retours'],['regulatory_watch','veille'],
 ])('préserve les points et décisions si %s est indisponible',async(source,libelle)=>{
  const {db,rpc}=lecteur(source);
  const resultat=await genererPointsDuMatin(db,maintenant);
  expect(resultat.enregistres).toBe(0);
  expect(resultat.erreur).toContain(libelle);
  expect(resultat.erreur).toContain('dernier point connu est conservé');
  expect(resultat.erreur).not.toContain('privé');
  expect(rpc.mock.calls.filter(([nom])=>nom==='enregistrer_point_du_matin')).toHaveLength(0);
 });
 it('enregistre les sept équipes quand toutes les lectures sont disponibles',async()=>{
  const {db,rpc}=lecteur();
  expect(await genererPointsDuMatin(db,maintenant)).toEqual({enregistres:7,erreur:undefined});
  expect(rpc.mock.calls.filter(([nom])=>nom==='enregistrer_point_du_matin')).toHaveLength(7);
 });
});

describe('Retours à traiter — les problèmes de gravité N2 arrivent au point (audit du 23/10)',()=>{
 // Un problème signalé depuis « Aide et retours » reçoit N2 par défaut : la lecture ne retenait que N1.
 type Appel={table:string;methode:string;arguments:unknown[]};
 function lecteurDeRetours(retours:Record<string,unknown>[]){
  const appels:Appel[]=[];
  const resultat=(source:string)=>({data:source==='retours_utilisateurs'?retours:[],error:null});
  const requete=(source:string):unknown=>new Proxy({}, {get:(_cible,propriete)=>{
   if(propriete==='then')return Promise.resolve(resultat(source)).then.bind(Promise.resolve(resultat(source)));
   return (...args:unknown[])=>{appels.push({table:source,methode:String(propriete),arguments:args});return requete(source);};
  }});
  const rpc=vi.fn(async(_nom:string,_arguments?:unknown)=>({data:'point-fictif',error:null}));
  return {db:{from:(source:string)=>requete(source),rpc} as unknown as Parameters<typeof genererPointsDuMatin>[0],rpc,appels};
 }
 it('demande les idées et les problèmes N1 ou N2 nouveaux ou en examen',async()=>{
  const {db,appels}=lecteurDeRetours([]);
  await lireAttentes(db,maintenant);
  const surRetours=appels.filter(a=>a.table==='retours_utilisateurs');
  expect(surRetours.find(a=>a.methode==='in')!.arguments).toEqual(['etat',['nouveau','en_examen']]);
  expect(surRetours.find(a=>a.methode==='or')!.arguments).toEqual(['nature.eq.idee,and(nature.eq.bug,gravite.in.(N1,N2))']);
 });
 it('enregistre le problème N2 nouveau dans le point de l’équipe qualité, à prendre en charge',async()=>{
  const {db,rpc}=lecteurDeRetours([{id:'r-n2',titre:'Bouton inactif',nature:'bug',gravite:'N2',etat:'nouveau'}]);
  expect(await genererPointsDuMatin(db,maintenant)).toEqual({enregistres:7,erreur:undefined});
  const appel=rpc.mock.calls.find(([nom,args])=>nom==='enregistrer_point_du_matin'&&(args as {p_equipe:string}).p_equipe==='qualite');
  const decisions=(appel![1] as {p_decisions:{cle:string;titre:string;source:string;gestes:{validation:boolean;refus:boolean}}[]}).p_decisions;
  expect(decisions.map(d=>[d.cle,d.source,d.gestes])).toEqual([['retour:r-n2','retour',{validation:true,refus:false}]]);
  expect(decisions[0].titre).toContain('problème majeur « Bouton inactif »');
 });
});

describe('Artisans en attente — lus par le client de service',()=>{
 // `artisans_a_valider()` exige une session humaine au second facteur (`is_super_admin()`) :
 // le client de service qui génère le point après chaque mission la refuse toujours.
 // Constat du 14/10/2026 : le point était figé depuis le 13/10.
 type Ligne=Record<string,unknown>;
 type Appel={table:string;methode:string;arguments:unknown[]};
 function clientDeService(donnees:{artisans?:Ligne[];enPanne?:string[]}={}){
  const enPanne=donnees.enPanne??[];
  const appels:Appel[]=[];
  const resultat=(source:string)=>enPanne.includes(source)
   ? {data:null,error:{message:'Détail fournisseur privé à ne pas exposer',code:'42501'}}
   : {data:source==='artisans'?donnees.artisans??[]:[],error:null};
  // Chaque appel chaîné est enregistré : les filtres font partie de ce que le test vérifie.
  const requete=(source:string):unknown=>new Proxy({}, {get:(_cible,propriete)=>{
   if(propriete==='then')return Promise.resolve(resultat(source)).then.bind(Promise.resolve(resultat(source)));
   return (...args:unknown[])=>{appels.push({table:source,methode:String(propriete),arguments:args});return requete(source);};
  }});
  const rpc=vi.fn(async(nom:string,_arguments?:unknown)=>nom==='artisans_a_valider'?{data:null,error:{message:'Accès refusé'}}:{data:'point-fictif',error:null});
  return {db:{from:(source:string)=>requete(source),rpc} as unknown as Parameters<typeof genererPointsDuMatin>[0],rpc,appels};
 }
 const durand={id:'a1',raison_sociale:'Plomberie Durand',siret_etat:'verifie',artisan_pieces:[]};
 it('enregistre les sept équipes sans appeler artisans_a_valider',async()=>{
  const {db,rpc}=clientDeService({artisans:[durand]});
  expect(await genererPointsDuMatin(db,maintenant)).toEqual({enregistres:7,erreur:undefined});
  expect(rpc.mock.calls.filter(([nom])=>nom==='artisans_a_valider')).toHaveLength(0);
 });
 it('soumet les artisans en attente à l’équipe incidents',async()=>{
  const {db,rpc}=clientDeService({artisans:[durand]});
  await genererPointsDuMatin(db,maintenant);
  const appel=rpc.mock.calls.find(([nom,args])=>nom==='enregistrer_point_du_matin'&&(args as {p_equipe:string}).p_equipe==='incidents');
  expect((appel![1] as {p_decisions:{cle:string}[]}).p_decisions.map(d=>d.cle)).toEqual(['artisan:a1']);
 });
 it('ne demande que les artisans en attente, du plus ancien au plus récent, justificatifs imbriqués',async()=>{
  const {db,appels}=clientDeService({artisans:[durand]});
  await lireAttentes(db,maintenant);
  const surArtisans=appels.filter(a=>a.table==='artisans');
  expect(surArtisans.find(a=>a.methode==='select')!.arguments[0]).toBe('id,raison_sociale,siret_etat,artisan_pieces(type,expire_le,retiree_le)');
  expect(surArtisans.find(a=>a.methode==='eq')!.arguments).toEqual(['statut_plateforme','en_attente']);
  expect(surArtisans.find(a=>a.methode==='order')!.arguments).toEqual(['created_at',{ascending:true}]);
  // Aucune seconde requête : pas de liste d’identifiants dans l’adresse.
  expect(appels.filter(a=>a.table==='artisan_pieces')).toEqual([]);
 });
 it('lit décennale, RC pro et justificatifs comme la fonction SQL',async()=>{
  const {db}=clientDeService({artisans:[
   {...durand,artisan_pieces:[
    // décennale qui expire aujourd’hui (valide), RC pro à venir, autres justificatifs, un justificatif retiré (ignoré).
    {type:'decennale',expire_le:'2026-09-25',retiree_le:null},{type:'rc_pro',expire_le:'2026-09-26',retiree_le:null},
    {type:'kbis',expire_le:'2027-01-01',retiree_le:null},{type:'certification',expire_le:null,retiree_le:null},
    {type:'urssaf',expire_le:'2026-09-24',retiree_le:'2026-09-20T00:00:00Z'},
   ]},
   {id:'a2',raison_sociale:'Élec Martin',siret_etat:'non_verifie',artisan_pieces:[
    // échues hier ; la décennale encore valide mais retirée ne compte pas.
    {type:'decennale',expire_le:'2026-09-24',retiree_le:null},{type:'rc_pro',expire_le:'2026-09-24',retiree_le:null},
    {type:'decennale',expire_le:'2027-01-01',retiree_le:'2026-09-20T00:00:00Z'},
   ]},
   {id:'a3',raison_sociale:'Peinture Roux',siret_etat:'invalide',artisan_pieces:[]},
   {id:'a4',raison_sociale:'Sols Petit',siret_etat:'non_verifie',artisan_pieces:null},
   // La base interdit une échéance nulle pour une RC pro ; la fonction SQL l’accepte, le code aussi.
   {id:'a5',raison_sociale:'Toitures Blanc',siret_etat:'verifie',artisan_pieces:[{type:'rc_pro',expire_le:null,retiree_le:null},{type:'decennale',expire_le:null,retiree_le:null}]},
  ]});
  const {attentes,indisponibles}=await lireAttentes(db,maintenant);
  expect(indisponibles).toEqual([]);
  expect(attentes.artisans).toEqual([
   {artisan_id:'a1',raison_sociale:'Plomberie Durand',siret_etat:'verifie',decennale_valide:true,rc_pro_deposee:true,nb_pieces:4},
   {artisan_id:'a2',raison_sociale:'Élec Martin',siret_etat:'non_verifie',decennale_valide:false,rc_pro_deposee:false,nb_pieces:2},
   {artisan_id:'a3',raison_sociale:'Peinture Roux',siret_etat:'invalide',decennale_valide:false,rc_pro_deposee:false,nb_pieces:0},
   {artisan_id:'a4',raison_sociale:'Sols Petit',siret_etat:'non_verifie',decennale_valide:false,rc_pro_deposee:false,nb_pieces:0},
   {artisan_id:'a5',raison_sociale:'Toitures Blanc',siret_etat:'verifie',decennale_valide:false,rc_pro_deposee:true,nb_pieces:2},
  ]);
 });
 it('compare les échéances au jour de Paris, pas au jour UTC',async()=>{
  const piece=[{...durand,artisan_pieces:[{type:'decennale',expire_le:'2026-10-14',retiree_le:null}]}];
  // 21 h 30 UTC : il est 23 h 30 à Paris le 14 octobre, la décennale du 14 est encore valable.
  const avant=await lireAttentes(clientDeService({artisans:piece}).db,new Date('2026-10-14T21:30:00Z'));
  expect(avant.attentes.artisans[0].decennale_valide).toBe(true);
  // 22 h 30 UTC : il est 00 h 30 à Paris le 15 octobre, elle est échue.
  const apres=await lireAttentes(clientDeService({artisans:piece}).db,new Date('2026-10-14T22:30:00Z'));
  expect(apres.attentes.artisans[0].decennale_valide).toBe(false);
 });
 it('rend une liste vide quand aucun artisan n’attend',async()=>{
  const {db}=clientDeService({artisans:[]});
  const {attentes,indisponibles}=await lireAttentes(db,maintenant);
  expect(indisponibles).toEqual([]);
  expect(attentes.artisans).toEqual([]);
 });
 it('préserve le dernier point si les artisans sont illisibles, et ne journalise que le code',async()=>{
  const erreurs=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   const {db,rpc}=clientDeService({artisans:[durand],enPanne:['artisans']});
   const resultat=await genererPointsDuMatin(db,maintenant);
   expect(resultat.enregistres).toBe(0);
   expect(resultat.erreur).toContain('artisans');
   expect(resultat.erreur).toContain('dernier point connu est conservé');
   expect(resultat.erreur).not.toContain('privé');
   expect(rpc.mock.calls.filter(([nom])=>nom==='enregistrer_point_du_matin')).toHaveLength(0);
   expect(erreurs).toHaveBeenCalledWith('[point du matin] lecture impossible :','artisans','42501');
   expect(JSON.stringify(erreurs.mock.calls)).not.toContain('privé');
  }finally{erreurs.mockRestore();}
 });
});
