import { StrictMode, useContext } from "react";
import { createRoot } from "react-dom/client";
import { AssistantBail } from "../../../src/app/agence/[orgId]/baux/[bailId]/assistant-bail";
import { EtapeComplementsBail } from "../../../src/lib/etape-complements-bail";
declare global { interface Window { __navigationBail: { invalides: number; envois: number } } }
window.__navigationBail = { invalides: 0, envois: 0 };
function Formulaire() {
  const parcours = useContext(EtapeComplementsBail);
  return <form id="form-parcours-bail" data-saisie-libre onSubmit={e => { e.preventDefault(); window.__navigationBail.envois++; }}>
    <fieldset hidden={parcours?.etape !== "loyer"} disabled={parcours?.etape !== "loyer"}>
      <label>Loyer d’essai<input name="loyer" required onInvalid={() => { window.__navigationBail.invalides++; }} /></label>
    </fieldset>
  </form>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><AssistantBail
  orgId="org" bailId="bail" controleInitial={{ manquants: [] }} contenus={Array.from({ length: 7 }, () => null)} formulaire={<Formulaire />}
/></StrictMode>);
