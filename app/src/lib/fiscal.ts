/** Aide 2044, règles 2026-10-12. Le journal reste immuable. Les mots-clés
 * proposent une rubrique ; seuls les faits figés et choix justifiés chiffrent
 * les totaux confirmés. Aucun prorata n'utilise le bail ou le lot actuel. */
export type EcritureFiscale={id?:string;categorie:string;sens:string;montant:number|string;date_piece:string;contre_ecriture_de?:string|null;lot_id?:string|null;bail_id?:string|null;encaissement_id?:string|null;libelle?:string|null};
export type QualificationFiscale={ecriture_id:string;lot_id?:string|null;nature:'recette'|'deductible'|'non_deductible'|'hors_2044'|'a_qualifier';rubrique:string|null;justification:string;loyer_hc?:number|string|null;charges?:number|string|null;version?:number;auteur?:string;cree_le?:string};
export type ComposantesFiscales={ecriture_id:string;loyer_hc:number|string;charges:number|string;non_ventile:number|string;appels?:unknown;version_regle?:number};
export type PeriodeFiscale={debut:string;fin:string;quote_part:number;regime:'nu'|'meuble'|'hors_perimetre'};
export type ExerciceFiscalLot={lot_id:string;annee:number;periodes:PeriodeFiscale[];justification:string;regularisation230:number|string|null;quote_part230:number|string;justification230:string|null;version?:number};
export type OptionsFiscales={qualifications?:Map<string,QualificationFiscale>;composantes?:Map<string,ComposantesFiscales>;exercices?:Map<string,ExerciceFiscalLot>;exigerPerimetre?:boolean;
 /** Compatibilité des lecteurs internes ; jamais alimenté par l'état courant dans l'interface fiscale. */
 quoteParts?:Map<string,number>;lotsMeubles?:Set<string>;ventilationLoyers?:Map<string,{loyerHc:number;charges:number}>;chargesCoproRecuperables?:Map<string,number>};
export type RubriqueFiscale={code:string;libelle:string;sens:'recette'|'depense';montant:number;montantQuotePart:number;aCompleter?:boolean;categories:string[];reintegration?:boolean};
export type RecapitulatifFiscal={annee:number;versionRegles:string;rubriques:RubriqueFiscale[];fondsTravauxAlur:number;totalRecettes:number;totalCharges:number;revenuNet:number;totalRecettesQuotePart:number;totalChargesQuotePart:number;revenuNetQuotePart:number;ventile:boolean;meuble:{recettes:number;depenses:number;nbEcritures:number};nbEcritures:number;chargesRecuperees:number;teomExclue:number;coproRecuperableExclue:number;aQualifier:number;nonDeductible:number;incomplet:boolean;alertes:string[];ecrituresAQualifier:string[]};
export const RUBRIQUES_FISCALES=[
 {code:'211',libelle:'Loyers bruts encaissés hors charges',sens:'recette'},
 {code:'212',libelle:'Dépenses mises par convention à la charge des locataires',sens:'recette'},
 {code:'213',libelle:'Recettes brutes diverses',sens:'recette'},
 {code:'221',libelle:'Frais d’administration et de gestion',sens:'depense'},
 {code:'222',libelle:'Autres frais de gestion : forfait à compléter',sens:'depense'},
 {code:'223',libelle:'Primes d’assurance',sens:'depense'},
 {code:'224',libelle:'Réparation, entretien et amélioration admissibles',sens:'depense'},
 {code:'225',libelle:'Charges récupérables non récupérées au départ du locataire',sens:'depense'},
 {code:'227',libelle:'Taxe foncière hors TEOM',sens:'depense'},
 {code:'229',libelle:'Provisions de copropriété effectivement versées dans l’année',sens:'depense'},
 {code:'230',libelle:'Régularisation des provisions de l’année précédente à réintégrer',sens:'depense'},
 {code:'250',libelle:'Intérêts d’emprunt',sens:'depense'},
] as const;
export const HORS_2044='hors';
const normaliser=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
/** Proposition seulement, jamais une validation de déductibilité. */
export function rubriqueDe(categorie:string,sens:string):string{
 const c=normaliser(categorie);
 if(/construction|reconstruction|agrandissement|achat.*terrain|nouvel.*etage/.test(c))return 'non_deductible';
 if(/teom|ordures/.test(c))return HORS_2044;
 if(sens==='recette')return /charge|provision|regularisation/.test(c)?HORS_2044:/loyer/.test(c)?'211':'213';
 for(const [code,mots] of [['229',/copro|syndic|appel de charges/],['221',/honoraire|gestion|administration/],['223',/assurance|pno|gli/],['224',/travaux|reparation|entretien|plomb|electric|chauff|peinture|amelioration|intervention/],['227',/taxe|foncier|impot/],['250',/interet|emprunt/]] as const)if(mots.test(c))return code;
 return 'autres';
}
export const estFondsTravauxAlur=(categorie:string)=>/fonds (de )?travaux|fonds alur|alur/.test(normaliser(categorie));
const arrondir=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
/** Fonction d'arrondi conservée pour les consommateurs ; ne reconstitue plus
 * les anciennes recettes depuis un bail courant. */
export function ventilerLoyer(montant:number,loyerHc:number,charges:number){const total=loyerHc+charges;if(!(charges>0)||!(total>0))return{part211:montant,part212:0};const part212=Math.sign(montant)*Math.round(Math.abs(montant)*charges/total*100)/100;return{part211:arrondir(montant-part212),part212};}
export function recapitulatifFiscal(ecritures:EcritureFiscale[],annee:number,options:OptionsFiscales={}):RecapitulatifFiscal{
 const montants=new Map<string,number>(),parts=new Map<string,number>(),categories=new Map<string,Set<string>>(),alertes=new Set<string>(),aQualifierIds=new Set<string>(),lots=new Set<string>();
 let fondsTravauxAlur=0,chargesRecuperees=0,teomExclue=0,aQualifier=0,nonDeductible=0,nbEcritures=0,ventile=false;
 const meuble={recettes:0,depenses:0,nbEcritures:0};
 const ajouter=(code:string,montant:number,quote:number,categorie:string)=>{montants.set(code,(montants.get(code)??0)+montant);parts.set(code,(parts.get(code)??0)+montant*quote/100);if(!categories.has(code))categories.set(code,new Set());categories.get(code)!.add(categorie);};
 const inconnue=(e:EcritureFiscale,montant:number,motif:string)=>{aQualifier+=montant;if(e.id)aQualifierIds.add(e.contre_ecriture_de??e.id);alertes.add(motif);};
 for(const e of ecritures){
  if(!e.date_piece?.startsWith(String(annee))||!['recette','depense'].includes(e.sens)||e.categorie==='depot_garantie')continue;
  nbEcritures++;
  const signe=e.contre_ecriture_de?-1:1,sens=e.contre_ecriture_de?(e.sens==='recette'?'depense':'recette'):e.sens;
  const brut=Number(e.montant);if(!Number.isFinite(brut)||brut<=0){alertes.add('Une pièce porte un montant invalide.');continue;}
  const montant=brut*signe;
  const id=e.contre_ecriture_de??e.id;
  const q=id?options.qualifications?.get(id):undefined;
  const lot=e.lot_id??q?.lot_id;
  if(lot)lots.add(lot);
  const exercice=lot?options.exercices?.get(lot):undefined;
  const periode=exercice?.periodes.find(p=>p.debut<=e.date_piece&&p.fin>=e.date_piece);
  if(options.exigerPerimetre&&(!lot||!periode)){inconnue(e,montant,'Confirmez le lot, le régime et la quote-part à la date de chaque pièce.');continue;}
  if(periode?.regime==='hors_perimetre')continue;
  const quote=periode?.quote_part??(lot?options.quoteParts?.get(lot):undefined)??100;
  if(quote!==100)ventile=true;
  if(periode?.regime==='meuble'||(!options.exigerPerimetre&&e.lot_id&&options.lotsMeubles?.has(e.lot_id))){meuble.nbEcritures++;if(sens==='recette')meuble.recettes+=montant;else meuble.depenses+=montant;continue;}
  const capture=(e.id?options.composantes?.get(e.id):undefined)??(id?options.composantes?.get(id):undefined);
  if(sens==='depense'&&estFondsTravauxAlur(e.categorie)){fondsTravauxAlur+=montant;continue;}
  if(q?.nature==='non_deductible'){nonDeductible+=montant;continue;}
  if(q?.nature==='hors_2044'){if(sens==='recette')chargesRecuperees+=montant;else teomExclue+=montant;continue;}
  const loyer=sens==='recette'&&(e.encaissement_id!=null||normaliser(e.categorie).includes('loyer'));
  if(loyer&&(capture||q?.nature==='recette'&&q.rubrique==='211')){
   const manuel=q?.loyer_hc!=null&&q?.charges!=null&&(!capture||Number(capture.non_ventile)>0);
   const hc=Number(manuel?q.loyer_hc:capture?.loyer_hc),ch=Number(manuel?q.charges:capture?.charges),reste=manuel?0:Number(capture?.non_ventile);
   if(![hc,ch,reste].every(Number.isFinite)||hc<0||ch<0||reste<0||Math.abs(hc+ch+reste-brut)>.005){inconnue(e,montant,'Des encaissements attendent leur ventilation historique loyer / charges.');continue;}
   ajouter('211',hc*signe,quote,e.categorie);chargesRecuperees+=ch*signe;
   if(reste){inconnue(e,reste*signe,'Une avance ou une part d’encaissement ne correspond pas encore à un appel historique vérifié.');}
   continue;
  }
  if(loyer){inconnue(e,montant,'Des encaissements attendent leur ventilation historique loyer / charges.');continue;}
  if(!q||q.nature==='a_qualifier'||!q.rubrique){inconnue(e,montant,'Des pièces attendent une qualification fiscale justifiée.');continue;}
  const regle=RUBRIQUES_FISCALES.find(r=>r.code===q.rubrique&&r.sens===sens);
  if(!regle||!['recette','deductible'].includes(q.nature)){inconnue(e,montant,'Une qualification fiscale ne correspond pas au sens de la pièce.');continue;}
  ajouter(regle.code,montant,quote,e.categorie);
 }
 // 230 est une réintégration : elle diminue les charges déductibles et augmente
 // le revenu net. Un zéro confirmé diffère d'une donnée absente.
 let manque230=false;
 for(const lot of new Set([...lots,...(options.exercices?.keys()??[])])){
  const x=options.exercices?.get(lot);if(!x||x.annee!==annee||x.regularisation230===null){manque230=true;continue;}
  const m=Number(x.regularisation230),q=Number(x.quote_part230);
  if(!Number.isFinite(m)||m<0||!Number.isFinite(q)||q<0||q>100||!x.justification230){manque230=true;continue;}
  ajouter('230',m,q,'Régularisation N−1 confirmée');if(q!==100)ventile=true;
 }
 if(manque230)alertes.add('La régularisation 230 de l’année précédente est à compléter ou à confirmer à zéro.');
 const rubriques:RubriqueFiscale[]=RUBRIQUES_FISCALES.map(r=>({...r,montant:arrondir(montants.get(r.code)??0),montantQuotePart:arrondir(parts.get(r.code)??0),categories:[...(categories.get(r.code)??[])],aCompleter:r.code==='230'?manque230:(r.code==='222'||r.code==='250')&&!montants.has(r.code),reintegration:r.code==='230'}));
 const somme=(sens:string,part:boolean)=>arrondir(rubriques.filter(r=>r.sens===sens).reduce((s,r)=>s+(r.reintegration?-1:1)*(part?r.montantQuotePart:r.montant),0));
 const totalRecettes=somme('recette',false),totalCharges=somme('depense',false),totalRecettesQuotePart=somme('recette',true),totalChargesQuotePart=somme('depense',true);
 return{annee,versionRegles:'2026-10-12-v1',rubriques,fondsTravauxAlur:arrondir(fondsTravauxAlur),totalRecettes,totalCharges,revenuNet:arrondir(totalRecettes-totalCharges),totalRecettesQuotePart,totalChargesQuotePart,revenuNetQuotePart:arrondir(totalRecettesQuotePart-totalChargesQuotePart),ventile,meuble:{recettes:arrondir(meuble.recettes),depenses:arrondir(meuble.depenses),nbEcritures:meuble.nbEcritures},nbEcritures,chargesRecuperees:arrondir(chargesRecuperees),teomExclue:arrondir(teomExclue),coproRecuperableExclue:0,aQualifier:arrondir(aQualifier),nonDeductible:arrondir(nonDeductible),incomplet:alertes.size>0,alertes:[...alertes],ecrituresAQualifier:[...aQualifierIds]};
}
