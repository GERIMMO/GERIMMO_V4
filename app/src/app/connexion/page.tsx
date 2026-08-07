import { Suspense } from "react";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata = { title: "Connexion — Gerimmo" };

// Écran d'entrée de la maquette : panneau encre (marque + promesse) à gauche,
// formulaire à droite ; sur téléphone, seul le formulaire reste.
export default function PageConnexion() {
  return (
    <main className="grid min-h-full flex-1 md:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-[var(--encre)] p-13 text-[var(--sur-encre)] md:flex">
        <MarqueGerimmo surEncre />
        <div>
          <h1 className="max-w-[11em] leading-[1.2] text-[var(--sur-encre)]">
            La gestion locative, tenue au carré.
          </h1>
          <p className="mt-3.5 max-w-[26em] text-sm text-[var(--sur-encre)]/65">
            Baux, quittances, régularisations, rapports de gestion et
            interventions — pour les agences et les propriétaires bailleurs.
          </p>
        </div>
        <p className="mono-discret text-[var(--sur-encre)]/40">
          Un seul compte, tous vos espaces
        </p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-[340px]">
          <div className="mb-6 md:hidden">
            <MarqueGerimmo />
          </div>
          <h2>Connexion</h2>
          <p className="mt-1.5 mb-5 text-sm text-muted-foreground">
            Un seul compte, tous vos espaces.
          </p>
          <Suspense>
            <FormulaireConnexion />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
