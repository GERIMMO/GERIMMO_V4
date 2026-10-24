import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersonnesBail, type PersonneBail } from "../../../src/app/agence/[orgId]/baux/[bailId]/personnes-bail";
const proprietaire: PersonneBail = {
  id: "proprietaire", nom: "Bailleur exemple", prenom: null, qualite: "Personne morale",
  email: "bailleur@example.test", telephone: "", date_naissance: null, commune_naissance: null,
  address_line1: "1 rue Exemple", postal_code: "86000", city: "Poitiers", archived_at: null,
};
declare global { interface Window { __personnesBailEnvois: Record<string, string>[] } }
window.__personnesBailEnvois = [];
createRoot(document.getElementById("racine")!).render(<StrictMode><PersonnesBail
  orgId="org" bailId="bail" personnes={[proprietaire]} detentions={[{ id: "detention", person_id: proprietaire.id, quote_part: 100, date_debut: "2026-01-01" }]}
  participants={[]} principalId={null} personneConnecteeId={proprietaire.id} colocation={false} proprietairesHref="/proprietaires"
/></StrictMode>);
