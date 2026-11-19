import { createRoot } from "react-dom/client";
import { OngletsFicheLogement } from "../../../src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/onglets-fiche-logement";
function Banc() { return <main><h1>Appartement des Tilleuls</h1>
<a href="#note">Compléter le logement</a><a href="#preuve">Voir le diagnostic</a>
<form onSubmit={e=>{e.preventDefault();(window as unknown as {envois:number}).envois=1;}}>
<OngletsFicheLogement initiale="resume-logement" rubriques={[
 {id:"resume-logement",titre:"Résumé",contenu:<p>50 m² · Bail en cours · 780 € charges comprises</p>},
 {id:"location-logement",titre:"Location",contenu:<p>Locataires et garants</p>},
 {id:"argent-logement",titre:"Argent",contenu:<p>Consommations et charges</p>},
 {id:"documents-logement",titre:"Documents",contenu:<details><summary>Diagnostics</summary><a id="preuve" href="/preuve.pdf">DPE original</a></details>},
 {id:"caracteristiques-logement",titre:"Caractéristiques",contenu:<details><summary>Modifier le logement</summary><label>Note du logement<input id="note" required defaultValue="Chauffage individuel" /></label></details>},
]}/><button type="submit">Enregistrer</button></form></main> }
createRoot(document.getElementById("racine")!).render(<Banc />);
