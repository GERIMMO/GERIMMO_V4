import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Modale } from "../../../src/components/ui/modale";
import { Tiroir } from "../../../src/components/ui/tiroir";
import { RechercheEspace } from "../../../src/components/recherche-espace";
import { installerProtectionSaisie } from "../../../src/lib/protection-saisie";

function Banc() {
  const [ouverte, ouvrir] = useState<"modale" | "tiroir" | null>(null);
  const [confirmation, confirmer] = useState(false);
  const native = useRef<HTMLDialogElement>(null);
  // Comme le layout racine (components/protection-saisie.tsx) : les formulaires suivis le sont aussi dans une fenêtre.
  useEffect(() => installerProtectionSaisie(), []);
  const contenu = <>
    <label>Note du dossier<input /></label>
    <form data-saisie-confirmee onSubmit={e => e.preventDefault()}><label>Commentaire<textarea name="commentaire" /></label></form>
    <button type="button" onClick={() => confirmer(true)}>Ouvrir la confirmation</button>
    <button type="button" onClick={() => native.current?.showModal()}>Ouvrir le dialogue natif</button>
    <button type="button">Dernier contrôle</button>
    <button type="button" hidden>Contrôle masqué</button>
    <button type="button" style={{ visibility: "hidden" }}>Contrôle invisible</button>
    <fieldset disabled><button type="button">Contrôle désactivé</button></fieldset>
    <div inert><button type="button">Contrôle inerte</button></div>
  </>;
  return <main>
    <h1>Dossier fictif</h1>
    <button type="button" onClick={() => ouvrir("modale")}>Ouvrir la fenêtre</button>
    <button type="button" onClick={() => ouvrir("tiroir")}>Ouvrir le menu</button>
    <button type="button" id="arriere-plan">Contrôle derrière la fenêtre</button>
    <RechercheEspace orgId="org-fictive" racine="/espace" />
    {/* Une fenêtre gardée montée mais refermée (prop `ouverte`, comme la carte « À vérifier »). */}
    <Modale titre="Fenêtre gardée" ouverte={false} fermer={() => {}}><p>Saisie conservée</p></Modale>
    {ouverte === "modale" && <Modale titre="Dossier" fermer={() => ouvrir(null)}>{contenu}</Modale>}
    {ouverte === "tiroir" && <Tiroir titre="Menu du dossier" fermer={() => ouvrir(null)}>{contenu}</Tiroir>}
    {confirmation && <Modale titre="Confirmation" fermer={() => confirmer(false)}><button type="button" onClick={() => confirmer(false)}>Retour au dossier</button></Modale>}
    <dialog ref={native} aria-label="Fenêtre native"><button type="button" onClick={() => native.current?.close()}>Fermer le dialogue natif</button></dialog>
    {/* Hauteur à défiler derrière les fenêtres (verrou de défilement). */}
    <div style={{ height: 3000 }} />
  </main>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><Banc /></StrictMode>);
