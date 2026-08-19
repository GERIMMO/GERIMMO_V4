import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { FormulaireReinitialisation } from "./formulaire-reinitialisation";

export const metadata = { title: "Mot de passe oublié — Gerimmo" };

export default function PageMotDePasseOublie() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <MarqueGerimmo />
          </div>
          <h1>Mot de passe oublié</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Indiquez votre adresse email : si un compte existe, vous recevrez
            un lien de réinitialisation valable une heure.
          </p>
        </div>
        <FormulaireReinitialisation />
      </div>
    </main>
  );
}
