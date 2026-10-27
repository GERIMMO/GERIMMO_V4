import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersonnesBail, type PersonneBail } from "../../../src/app/agence/[orgId]/baux/[bailId]/personnes-bail";
const proprietaire: PersonneBail = {
  id: "proprietaire", nom: "Bailleur exemple", prenom: null, qualite: "Personne morale",
  email: "bailleur@example.test", telephone: "", date_naissance: null, commune_naissance: null,
  address_line1: "1 rue Exemple", postal_code: "86000", city: "Poitiers", archived_at: null,
};
const principal: PersonneBail = { ...proprietaire, id:"principal", nom:"Durand", prenom:"Camille", qualite:"Personne physique", email:"camille@example.test", date_naissance:"1990-02-03", commune_naissance:"Lyon", address_line1:"18 rue des Acacias", postal_code:"69003", city:"Lyon" };
const existante: PersonneBail = { ...principal, id:"existante", nom:"Leroy", prenom:"Hélène", email:"helene@example.test", telephone:"0601020304" };
const autre: PersonneBail = { ...principal, id:"autre", nom:"Martin", prenom:"Sam", email:"sam@example.test" };
const scenario = new URLSearchParams(window.location.search).get("scenario");
const colocation = scenario === "colocation" || scenario === "colocation_plusieurs";
declare global { interface Window { __personnesBailEnvois: Record<string, string>[]; __personnesBailEchecCreation: number } }
window.__personnesBailEnvois = [];
window.__personnesBailEchecCreation = 0;
createRoot(document.getElementById("racine")!).render(<StrictMode><PersonnesBail
  orgId="org" bailId="bail" personnes={scenario ? [proprietaire,principal,existante,autre] : [proprietaire]} detentions={[{ id: "detention", person_id: proprietaire.id, quote_part: 100, date_debut: "2026-01-01" }]}
  participants={scenario === "colocation_plusieurs" ? [{id:"participant",person_id:autre.id,role:"colocataire",garant_de:null}] : []} principalId={colocation ? principal.id : null} personneConnecteeId={proprietaire.id} colocation={colocation} proprietairesHref="/proprietaires"
/></StrictMode>);
