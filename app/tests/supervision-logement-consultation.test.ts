import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-action-formulaire", () => ({ useActionFormulaire: () => ({ etat: {}, soumettre: vi.fn(), enCours: false }) }));
vi.mock("@/lib/use-action-state-protegee", () => ({ useActionStateProtegee: () => [{}, vi.fn(), false] }));
vi.mock("@/app/actions/chambres", () => ({ enregistrerChambre: vi.fn(), enregistrerPlafondColocation: vi.fn() }));
vi.mock("@/app/actions/appels-charges", () => ({ creerAppelCharges: vi.fn(), ajouterPosteCharge: vi.fn(), modifierPosteCharge: vi.fn(), supprimerPosteCharge: vi.fn(), validerVentilation: vi.fn(), supprimerAppelCharges: vi.fn() }));
vi.mock("@/app/agence/[orgId]/parc/[bienId]/formulaire-classe-dpe-lot", () => ({ FormulaireClasseDpeLot: () => createElement("form", { "aria-label": "Modifier DPE" }) }));
vi.mock("@/app/agence/[orgId]/parc/[bienId]/formulaire-diagnostic", () => ({ FormulaireDiagnostic: () => createElement("form", { "aria-label": "Déposer diagnostic" }) }));
vi.mock("@/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/grille-edl", () => ({ ETATS_ELEMENT: { bon: "Bon", usage: "Usagé" } }));
import { LignesDiagnostics } from "@/app/agence/[orgId]/parc/[bienId]/lignes-diagnostics";
import { ChambresLogement } from "@/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/chambres-logement";
import { AppelsCharges } from "@/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-appels-charges";
import { SuiviBailLecture } from "@/app/agence/[orgId]/baux/[bailId]/suivi-bail-lecture";
import { EdlConsultation } from "@/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/edl-consultation";
const cible = { orgId:"org", bienId:"bien", lotId:"lot" };
const sansCommande = (html: string) => expect(html).not.toMatch(/<(form|input|textarea|select|button)\b/);

describe("Consultation superadmin : les données restent, les commandes de gestion disparaissent", () => {
  it.each([true,false])("diagnostics, lecture seule=%s : conserve les fichiers, dates et classes", lectureSeule => {
    const html=renderToStaticMarkup(createElement(LignesDiagnostics, { ...cible, niveau:"lot", lectureSeule, attendus:["dpe","plomb"], diagnostics:[{id:"d",type:"dpe",date_realisation:"2019-01-01",date_expiration:"2020-01-01",document_id:"pdf",diagnostiqueur:"Cabinet témoin",classe_dpe:"B"}] }));
    expect(html).toContain("/documents/pdf/fichier"); expect(html).toContain("Classe B"); expect(html).toContain("Cabinet témoin"); expect(html).toContain("Expiré");
    if(lectureSeule){sansCommande(html);expect(html).toContain("Aucun fichier déposé");expect(html).not.toContain("modifications");}
    else {expect(html).toContain("Renouveler");expect(html).toContain("Modifier la classe DPE");expect(html).toContain("Ajouter le fichier");}
  });
  it.each([true,false])("chambres, lecture seule=%s : détails privés et communs visibles", lectureSeule => {
    const html=renderToStaticMarkup(createElement(ChambresLogement, {...cible, lectureSeule, plafond:900, chambres:[{id:"c",nom:"Jardin",surface_m2:12,volume_m3:30,description:"Porte indépendante",espaces_partages:"Cuisine commune",equipements:"Bureau"}]}));
    expect(html).toContain("Jardin");expect(html).toContain("Cuisine commune");expect(html).toContain("Bureau");
    if(lectureSeule){sansCommande(html);expect(html).not.toContain("Créer le contrat");}else expect(html).toContain("Enregistrer la chambre");
  });
  it.each([true,false])("appel de copropriété brouillon, lecture seule=%s : montant et réserve visibles", lectureSeule => {
    const html=renderToStaticMarkup(createElement(AppelsCharges, {...cible, lectureSeule, anneeCourante:2026, appels:[{id:"a",exercice:2026,date_reception:"2026-01-01",total:300,statut:"brouillon",document_id:"appel",postes:[{id:"p",libelle:"Entretien",montant:200,nature:"a_qualifier",fonds_alur:false,propose:false}]}]}));
    expect(html).toContain("Entretien");expect(html).toContain("qualifier");expect(html).toContain("écart");expect(html).toContain("appel du syndic");
    if(lectureSeule)sansCommande(html);else expect(html).toContain("<form");
  });
  it("une lecture des loyers en échec n'affiche pas un faux historique vide", () => {
    const html=renderToStaticMarkup(createElement(SuiviBailLecture, {base:"/espace/org",bailId:"b",echeances:[],encaissements:[],edls:[],indisponibles:{loyers:true,encaissements:true,edls:true}}));
    sansCommande(html);expect(html).toContain("indisponibles");expect(html).not.toContain("Aucun");
  });
  it("l'état des lieux en préparation conserve mentions, constats, compteurs et clés sans envoi ni saisie", () => {
    const html=renderToStaticMarkup(createElement(EdlConsultation, {mentions:{personnes_presentes:"Locataire témoin",detecteur_fumee_present:true,detecteur_fumee_etat:"Testé",attestation_assurance_fournie:false,adresse_restitution_depot:null,observations:"Observation témoin"},lignes:[{id:"l",piece:"Cuisine",libelle:"Mur",etat:"usage",commentaire:"Rayure"}],compteurs:[{id:"c",type:"eau_froide",numero:"E123",releve:42}],cles:[{id:"k",libelle:"Entrée",nombre:2,reference:"A"}]}));
    sansCommande(html);for(const texte of ["Locataire témoin","Observation témoin","Rayure","Usagé","E123","42","Entrée"])expect(html).toContain(texte);
    expect(html).not.toContain("signé et figé");
  });
});
