import { createRoot } from "react-dom/client";
import { FormulaireSouscription } from "@/app/agence/[orgId]/abonnement/formulaire-souscription";
import { ProtectionSaisie } from "@/components/protection-saisie";
import { FournisseurRacineEspace } from "@/components/racine-espace-contexte";

// Vrai composant, vrais calculs et vraie protection de saisie. Seule la frontière
// serveur est simulée par le test ; ce fichier n'appartient à aucune route Next.
createRoot(document.getElementById("racine")!).render(
  <FournisseurRacineEspace racine="/espace">
    <ProtectionSaisie />
    <FormulaireSouscription orgId="org-fictive" publicTarif="proprietaire_direct"
      nomEspace="Patrimoine fictif" unites={2} regime={{ nature: "franchise" }}
      premierPrelevement={null} ferme={false} motifIndisponible={null}
      conditionsAAccepter={true} dateLimiteRetractation="2 décembre 2026" />
  </FournisseurRacineEspace>,
);
