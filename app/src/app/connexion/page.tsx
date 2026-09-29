import { Suspense } from "react";
import { CoquilleAuth } from "@/components/coquille-auth";
import { FormulaireConnexion } from "./formulaire-connexion";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Connexion — Gerimmo",
  description:
    "Connectez-vous à Gerimmo pour retrouver vos espaces de gestion locative : agence, propriétaire bailleur, locataire ou artisan.",
  chemin: "/connexion",
});

export default function PageConnexion() {
  return (
    <CoquilleAuth
      promesse="La gestion locative, tenue au carré."
      sousPromesse="Baux, quittances, régularisations, rapports de gestion et interventions — pour les agences, les propriétaires bailleurs, leurs locataires et les artisans."
      mention="Un seul compte, tous vos espaces"
      titre="Connexion"
      // 24/09 : le chapo répétait mot pour mot la mention du panneau.
      chapo="Agence, propriétaire, locataire ou artisan : la même adresse e-mail ouvre votre espace."
    >
      <Suspense>
        <FormulaireConnexion />
      </Suspense>
    </CoquilleAuth>
  );
}
