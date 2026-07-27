import { Suspense } from "react";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata = { title: "Connexion — Gerimmo" };

export default function PageConnexion() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold">Gerimmo</h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">
          Connectez-vous à votre espace
        </p>
        <Suspense>
          <FormulaireConnexion />
        </Suspense>
      </div>
    </main>
  );
}
