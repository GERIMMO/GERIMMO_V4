import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConversationProprietaire } from "../../../src/app/agence/[orgId]/messages/conversation-proprietaire";
import type { MessagePersonne } from "../../../src/app/agence/[orgId]/personnes/[personId]/carte-messages";

function Banc() {
  const [messages, changer] = useState<MessagePersonne[]>(Array.from({ length: 20 }, (_, index) => ({
    id: `message-${index}`, auteur: "locataire", texte: `Message fictif ${index + 1} — Informations concernant le logement.`, cree_le: `2026-10-26T10:${String(index).padStart(2, "0")}:00Z`,
  })));
  useEffect(() => {
    const reponse = (event: Event) => changer(liste => [...liste, {
      id: `message-${liste.length}`, auteur: "gerant", texte: (event as CustomEvent<string>).detail, cree_le: "2026-10-26T12:00:00Z",
    }]);
    window.addEventListener("reponse-fictive", reponse);
    return () => window.removeEventListener("reponse-fictive", reponse);
  }, []);
  return <main>
    <h1>Conversation fictive</h1>
    <button type="button" onClick={() => changer(liste => [...liste, {
      id: `message-${liste.length}`, auteur: "locataire", texte: "Nouveau message du locataire", cree_le: "2026-10-26T12:00:00Z",
    }])}>Recevoir un message fictif</button>
    <ConversationProprietaire orgId="org-fictive" personId="personne-fictive" prenom="Alex" messages={messages} />
  </main>;
}
createRoot(document.getElementById("racine")!).render(<StrictMode><Banc /></StrictMode>);
