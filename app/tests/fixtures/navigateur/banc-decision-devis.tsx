/**
 * Le banc navigateur des deux décisions motivées sur un devis reçu (D18) : « Refuser » et « Demander une révision ».
 *
 * Il monte, dans un vrai Chromium et sous <StrictMode>, les VRAIS composants `BoutonRefuserDevis` et
 * `BoutonDemanderRevision` ; seules les actions du serveur sont simulées (`actions-incidents-neutre.ts`).
 *
 * Il est assemblé par `tests/devis-decision-accessibilite-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BoutonDemanderRevision, BoutonRefuserDevis } from "../../../src/app/agence/[orgId]/incidents/formulaires-artisan";

window.__bancDecision = { envois: [], reponses: [] };
createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <main>
      <section data-banc="refus">
        <BoutonRefuserDevis orgId="org" devisId="devis-1" raisonSociale="Plomberie Durand" />
      </section>
      <section data-banc="revision">
        <BoutonDemanderRevision orgId="org" devisId="devis-2" raisonSociale="Plomberie Martin" version={1} echeance="22/10/2026" />
      </section>
    </main>
  </StrictMode>,
);
