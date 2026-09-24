import { Suspense } from "react";
import { CoquilleAuth } from "@/components/coquille-auth";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata = { title: "Connexion — Gerimmo" };

export default function PageConnexion() {
  return (
    <CoquilleAuth
      promesse="La gestion locative, tenue au carré."
      sousPromesse="Baux, quittances, régularisations, rapports de gestion et interventions — pour les agences, les propriétaires bailleurs, leurs locataires et les artisans."
      mention="Un seul compte, tous vos espaces"
      titre="Connexion"
      chapo="Un seul compte, tous vos espaces."
    >
      <Suspense>
        <FormulaireConnexion />
      </Suspense>
    </CoquilleAuth>
  );
}
