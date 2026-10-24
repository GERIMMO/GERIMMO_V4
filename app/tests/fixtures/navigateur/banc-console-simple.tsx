import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConsoleSection } from "../../../src/components/console-section";
import { IdentiteEditeur } from "../../../src/app/admin/parametres/identite";
import { TitreEcran } from "../../../src/components/titre-ecran";

const identite = new URLSearchParams(location.search).get("vue") === "identite";
const valeurs = { denomination: "Gerimmo — démonstration", email: "contact@example.invalid", telephone: "0100000000", siege: "Adresse fictive", forme: "Entreprise individuelle", siret: "00000000000000", rcs: "Exemple", directeurPublication: "Responsable fictif", mediateurNom: "Médiateur fictif", coordonneesSupabase: "Prestataire fictif conservé" };
function Banc() {
  const [page, setPage] = useState(1);
  return <main className="mx-auto max-w-4xl p-4 sm:p-7">
  <header className="entete-page"><TitreEcran rubrique="profil">{identite ? "Paramètres généraux" : "Contrôles de la console"}</TitreEcran></header>
  {identite ? <IdentiteEditeur valeurs={valeurs} revision={12}/> : <>
    <a href="#preuve" className="btn-secondaire">Ouvrir une preuve</a>
    <button className="btn-secondaire" onClick={() => {
      // Une navigation interne conserve les composants et n’émet pas hashchange.
      history.pushState(null, "", `?page=${page + 1}#preuve`);
      setPage(page + 1);
    }}>Afficher la page suivante du journal</button>
    <ConsoleSection titre="Historique" description="Retrouver les événements." icone="historique" ton="violet">
      <ConsoleSection titre="Sauvegardes" icone="documents" ton="vert"><p id="preuve">Archive fictive relue</p><p>Page du journal : {page}</p></ConsoleSection>
    </ConsoleSection>
    <form onSubmit={e => { e.preventDefault(); (window as unknown as { __envois: number }).__envois = 1; }}>
      <ConsoleSection titre="Réglage à confirmer" icone="securite" ton="ambre"><label>Raison du changement<input required name="motif" className="champ block"/></label></ConsoleSection>
      <button className="btn-or">Enregistrer le réglage</button>
    </form>
  </>}
</main>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><Banc/></StrictMode>);
