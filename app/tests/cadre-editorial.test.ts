import {describe,it,expect} from "vitest";
import {selectionnerDemandes,sujetDansPerimetre} from "@/lib/cadre-editorial";
import {evaluerPertinence} from "@/lib/pertinence-veille";
import {lireFluxVeille} from "@/lib/veille-reglementaire";
describe("périmètre demandé après la file hors sujet du 24 octobre",()=>{
 it.each([
  "AAH : faut-il déclarer ses ressources ?", "Allocation aux adultes handicapés et ASS",
  "Kinésithérapeutes : réaliser un bilan de prévention", "Taxe sur les salaires : échéance de janvier",
  "Artisans : facturation électronique", "Micro-entrepreneurs : cotisations et TVA",
  "CVAE : exonérations dans les zones urbaines", "Vente d’un fonds de commerce",
  "Décarb Flash Artisan : électrification des équipements", "Bail commercial : vente du fonds",
  "Location de véhicules : assurance obligatoire", "La baillive et les allocations",
 ])("écarte le sujet réel ou ambigu : %s",titre=>expect(sujetDansPerimetre(titre)).toBe(false));
 it.each([
  "Indice de référence des loyers : nouveau trimestre", "IRL du trimestre",
  "DPE : quels logements peuvent être loués ?", "Copropriété : réparation des parties communes",
  "Trêve hivernale : droits du locataire", "APL : montant des aides au logement",
  "Pompes à chaleur : une prime pour l’installation", "Artisans du bâtiment : devis obligatoires",
  "Assurance décennale des artisans", "Certification RGE : conditions", "MaPrimeRénov : aides",
 ])("conserve un besoin direct : %s",titre=>expect(sujetDansPerimetre(titre)).toBe(true));
 it("un résumé et des mots réglables ne réintroduisent pas les sujets hors périmètre",()=>{
  expect(evaluerPertinence({titre:"Taxe sur les salaires",resume:"Les bailleurs et artisans du logement sont concernés.",publics:["bailleur"]},{inclus:["bailleur","salaires"],exclus:[]}).pertinent).toBe(false);
  const xml='<rss><item><title>AAH et ASS</title><link>https://www.service-public.gouv.fr/actualites/A1</link><description>Voir aussi : logement, loyer, artisan du bâtiment</description></item></rss>';
  expect(lireFluxVeille(xml,"SP")).toEqual([]);
 });
 it("conserve les décisions sans les modifier, réserve les excédents et ne plafonne jamais les bugs",()=>{
  const demandes=[{source:"veille",titre:"Taxe sur les salaires"},...Array.from({length:8},(_,i)=>({source:"veille",titre:`DPE ${i}`})),...Array.from({length:4},(_,i)=>({source:"publication",titre:`Article ${i}`})),...Array.from({length:50},(_,i)=>({source:"retour",titre:`Bug ${i}`}))];
  const copie=structuredClone(demandes);const {decisions,reserve}=selectionnerDemandes(demandes);
  expect(decisions.filter(d=>d.source==="veille")).toHaveLength(5);
  expect(decisions.filter(d=>d.source==="publication")).toHaveLength(2);
  expect(decisions.filter(d=>d.source==="retour")).toHaveLength(50);
  expect(reserve.filter(d=>d.motif==="hors_perimetre")).toHaveLength(1);
  expect([...decisions,...reserve.map(r=>r.decision)]).toHaveLength(demandes.length);
  expect(demandes).toEqual(copie);
 });
});
