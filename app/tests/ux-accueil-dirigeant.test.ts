import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccueilDirigeant, resumerAccueil, type DonneesAccueil } from "@/app/admin/brief/aujourdhui";
import { inTrial, paymentIssue, type FinancialAccount } from "@/lib/finances-supervision";
import type { FaitsDirection } from "@/lib/faits-direction";

const compte = (id: string, stripe_statut: string | null = null, status = "essai"): FinancialAccount => ({id,name:`Client ${id}`,type:"proprietaire_direct",status,stripe_statut,essai_fin:"2026-11-22",periode_fin:null,paiement_en_defaut_depuis:null} as FinancialAccount);
const base = (): DonneesAccueil => ({finance:{total:3,organisations:[compte("a"),compte("b","active","active"),compte("c","past_due","active")]},assistance:4,aujourd:"2026-11-18",faits:null,erreurFaits:false,echecsEquipes:0,decisions:{jour:"2026-11-18",pointPrepare:false,decisions:[],reserve:[],signaux:[],artisans:0,santeBloquants:0,tachesIllisibles:false,total:0,indisponibles:[]}});
const rendu=(d:DonneesAccueil)=>renderToStaticMarkup(createElement(AccueilDirigeant,d));
describe("Accueil du dirigeant — présentation sans décision automatique",()=>{
 it("affiche six repères issus des sources et des mêmes règles que les finances",()=>{
  const d=base(),r=resumerAccueil(d);expect(r.indicateurs).toHaveLength(6);
  expect(r.indicateurs.map(x=>x.valeur)).toEqual([3,"1","1","1",4,0]);
  expect(Number(r.indicateurs[1].valeur)).toBe(d.finance!.organisations.filter(inTrial).length);
  expect(Number(r.indicateurs[3].valeur)).toBe(d.finance!.organisations.filter(paymentIssue).length);
  expect(r.indicateurs[0].detail).toContain("pas personnes uniques");
 });
 it("ne remplace pas les lectures indisponibles par zéro",()=>{
  const d=base();d.finance=null;d.assistance=null;d.decisions.tachesIllisibles=true;d.decisions.indisponibles=["tâches"];
  const r=resumerAccueil(d);expect(r.indicateurs.every(x=>x.valeur==="À vérifier")).toBe(true);
  const h=rendu(d);expect(h).toContain("L’état du service reste à vérifier");expect(h).not.toContain("Aucune décision en attente");
 });
 it("annonce les sous-totaux partiels comme des minimums",()=>{
  const d=base();d.finance!.total=100;const r=resumerAccueil(d);expect(r.partiel).toBe(true);
  expect(r.indicateurs[0].valeur).toBe(100);expect(r.indicateurs[2].valeur).toBe("≥ 1");expect(rendu(d)).toContain("3 espaces lus sur 100");
 });
 it("conserve les liens exacts et n’affiche que trois actions prioritaires",()=>{
  const d=base();d.decisions.signaux=Array.from({length:5},(_,i)=>({cle:i===0?"sante":"bugs",titre:`Incident ${i}`,detail:"À examiner",href:`/admin/retours?incident=${i}`,action:"Examiner"}));d.decisions.total=5;
  const h=rendu(d);expect(h.match(/data-probleme=/g)).toHaveLength(3);
  for(let i=0;i<3;i++)expect(h).toContain(`/admin/retours?incident=${i}`);
  expect(h).toContain("Voir les 5 problèmes");expect(h).toContain("dont 2 non affichés");expect(h).toContain("categorie=incidents");
 });
 it("un signal sans lien garde le bouton d’alertes existant",()=>{
  const d=base();d.decisions.signaux=[{cle:"alertes",titre:"Alertes critiques",detail:"1 alerte",action:"Ouvrir les alertes"}];d.decisions.total=1;
  const h=rendu(d);expect(h).toContain("Ouvrir les alertes");expect(h).toContain("<button");
 });
 it("place le problème avant une proposition marketing et ne valide rien",()=>{
  const d=base();d.decisions.decisions=[{cle:"publication:x",titre:"Relire",pourquoi:"Texte",lien:"/admin/publications/x",source:"publication",source_id:"x",equipe:"marketing"}];d.decisions.signaux=[{cle:"sante",titre:"Panne",detail:"Vérifier",href:"/admin/sante",action:"Ouvrir la santé"}];d.decisions.total=2;
  expect(resumerAccueil(d).entrees.map(e=>e.cle)).toEqual(["signal:sante","publication:x"]);const h=rendu(d);expect(h).toContain('/admin/publications/x');expect(h).not.toContain("<form");
 });
 it("sans urgence, indique l’absence de décision sans certifier une disponibilité absolue",()=>{
  const h=rendu(base());expect(h).toContain("Aucune décision en attente");expect(h).toContain("contrôles disponibles");expect(h).toContain("reste à préparer");expect(h).not.toContain("Tout fonctionne");
 });
 it("garde les incidents et erreurs du relevé visibles, même si les détails sont repliés",()=>{
  const d=base();d.echecsEquipes=2;d.faits={id:"s",jour:d.aujourd,genere_le:"2026-11-17T10:00:00Z",version_regles:1,indisponibles:["incidents"],sources:Object.fromEntries(["incidents","echeances","service","interventions","loyers"].map(s=>[s,{statut:s==="incidents"?"indisponible":"disponible",observe_le:"2026-11-17T10:00:00Z",donnees:{mesures:s==="incidents"?{urgents_ouverts:3}:s==="echeances"?{alertes_critiques:1}:s==="service"?{passages_en_echec_24h:2}:{},faits:[]}}]))} as unknown as FaitsDirection;
  const h=rendu(d);for(const t of ["3 incidents urgents","1 alertes critiques","2 traitements interrompus", "dernier état connu", "2 échec(s)"])expect(h).toContain(t);
  expect(h).toContain('href="#faits-direction"');expect(h).toContain('href="#equipes"');
 });
 it("conserve les états d’abonnement et le tableau source",()=>{
  const d=base(),copie=JSON.stringify(d);rendu(d);expect(JSON.stringify(d)).toBe(copie);
 });
});
