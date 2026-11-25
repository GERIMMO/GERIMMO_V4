import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OngletsDossier } from "../../../src/components/onglets-dossier";
import { SectionLot } from "../../../src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/section-lot";
import { RubriqueDossier } from "../../../src/components/rubrique-dossier";
// Un nouveau rendu sans changement d'adresse (comme la réponse d'une action serveur qui rafraîchit la page).
function Banc() { const [rendus,setRendus]=useState(1); return <main><h1>Appartement des Tilleuls</h1>
<button type="button" onClick={()=>setRendus(n=>n+1)}>Actualiser l’affichage</button><p>Affichage {rendus}</p>
<a href="#note">Compléter le logement</a>
<a href="#note" onClick={e=>{e.preventDefault();history.pushState(history.state,"","#note");}}>Navigation interne vers le logement</a>
<a href="#preuve" onClick={e=>{e.preventDefault();history.pushState(history.state,"","#preuve");}}>Navigation interne vers la preuve</a>
<form onSubmit={e=>{e.preventDefault();(window as unknown as {__envois:number}).__envois=1;}}><OngletsDossier rubriques={[
 {id:"resume",titre:"Résumé",contenu:<p>50 m² · Deux pièces</p>},
 {id:"logement",titre:"Logement",contenu:<SectionLot id="caracteristiques" titre="Caractéristiques" resume="Chauffage et eau chaude"><label>Note du logement<input id="note" required defaultValue="Chauffage individuel" /></label></SectionLot>},
 {id:"documents",titre:"Documents",contenu:<><h2>Vos documents</h2><p>DPE · À jour</p><p>ERP · Fichier à joindre</p><p>Termites · Obligation à confirmer</p><RubriqueDossier id="rapports" titre="Rapports" resume="Consulter la preuve"><a id="preuve" href="/preuve.pdf">Rapport original</a></RubriqueDossier></>},
 {id:"contrats",titre:"Contrats",contenu:<p>Un bail en préparation</p>},
]} /><button type="submit">Enregistrer le logement</button></form>
<a href="#preuve">Voir la preuve</a>
</main> }
createRoot(document.getElementById("racine")!).render(<Banc />);
