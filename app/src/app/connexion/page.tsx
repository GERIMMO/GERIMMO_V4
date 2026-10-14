import { Suspense } from "react";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Card } from "@/components/ui/card";
import { FormulaireConnexion } from "./formulaire-connexion";
import { PurgerCopiesALaDeconnexion } from "@/components/purger-copies-a-la-deconnexion";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Connexion — Gerimmo",
  description:
    "Connectez-vous à Gerimmo pour retrouver vos espaces de gestion locative : propriétaire bailleur, locataire ou artisan.",
  chemin: "/connexion",
});

/**
 * Audit du 13/10 (PRF-01) : le formulaire lit l'URL (useSearchParams), il se rend donc côté client, sous ce <Suspense>.
 * Sans repli, la page s'affichait d'abord réduite au titre et au chapeau, centrés à mi-hauteur, puis le formulaire
 * arrivait et le bloc remontait de 220 px (CLS 0,212 en mobile sur réseau lent). Le repli garde la place : la carte du
 * formulaire mesure 439 px (27,4 rem), le repli en réserve 440.
 */
function PlaceDuFormulaire() {
  return <Card aria-hidden="true" data-squelette-connexion className="min-h-[27.5rem]" />;
}

export default function PageConnexion() {
  return (
    <CoquilleAuth
      promesse="La gestion locative, tenue au carré."
      sousPromesse="Baux, quittances, régularisations, rapports de gestion et interventions — pour les propriétaires bailleurs, leurs locataires et les artisans."
      mention="Un seul compte, tous vos espaces"
      titre="Connexion"
      // 24/09 : le chapo répétait mot pour mot la mention du panneau.
      chapo="Propriétaire, locataire ou artisan : la même adresse e-mail ouvre votre espace."
    >
      <Suspense fallback={<PlaceDuFormulaire />}>
        <PurgerCopiesALaDeconnexion />
        <FormulaireConnexion />
      </Suspense>
    </CoquilleAuth>
  );
}
