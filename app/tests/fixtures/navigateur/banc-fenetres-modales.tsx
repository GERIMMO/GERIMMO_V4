import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Modale } from "../../../src/components/ui/modale";
import { Tiroir } from "../../../src/components/ui/tiroir";

function Banc() {
  const [ouverte, ouvrir] = useState<"modale" | "tiroir" | null>(null);
  const [confirmation, confirmer] = useState(false);
  const native = useRef<HTMLDialogElement>(null);
  const contenu = <>
    <label>Note du dossier<input /></label>
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
    {ouverte === "modale" && <Modale titre="Dossier" fermer={() => ouvrir(null)}>{contenu}</Modale>}
    {ouverte === "tiroir" && <Tiroir titre="Menu du dossier" fermer={() => ouvrir(null)}>{contenu}</Tiroir>}
    {confirmation && <Modale titre="Confirmation" fermer={() => confirmer(false)}><button type="button" onClick={() => confirmer(false)}>Retour au dossier</button></Modale>}
    <dialog ref={native} aria-label="Fenêtre native"><button type="button" onClick={() => native.current?.close()}>Fermer le dialogue natif</button></dialog>
  </main>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><Banc /></StrictMode>);
