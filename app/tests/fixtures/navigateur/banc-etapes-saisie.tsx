import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EtapesSaisie } from "../../../src/components/etapes-saisie";

function Banc() {
  return <main>
    <a href="#relances">Régler les envois</a>
    <a href="#coordonn%C3%A9es">Voir les coordonnées</a>
    <a href="#hors-formulaire">Voir la signature</a>
    <form onSubmit={event => event.preventDefault()}>
      <EtapesSaisie titre="Mon profil" etapes={[
        { titre: "Identité", detail: "Vos coordonnées." },
        { titre: "Paiement", detail: "Votre compte." },
        { titre: "Préférences", detail: "Vos envois." },
      ]} contenus={[
        <div key="identite" id="coordonnées"><label>Nom<input name="nom" required defaultValue="Camille" /></label></div>,
        <div key="paiement" id="paiement"><label>IBAN<input name="iban" /></label></div>,
        <div key="preferences" id="envois"><div id="relances"><label><input type="checkbox" name="automatique" />Relances automatiques</label></div></div>,
      ]} conclusion={<button type="submit">Enregistrer</button>} />
    </form>
    <section id="hors-formulaire">Signature</section>
  </main>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><Banc /></StrictMode>);
