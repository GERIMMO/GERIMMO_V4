import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { FormulaireInscription } from "./formulaire-inscription";

export const metadata = { title: "Ouvrir mon espace propriétaire — Gerimmo" };

// Auto-inscription du propriétaire bailleur en gestion directe (S9a) : la
// seule porte d'entrée publique — une agence, elle, est créée par le super
// admin après contrat. Même écran scindé que la connexion.
export default function PageInscription() {
  return (
    <main className="grid min-h-full flex-1 md:grid-cols-[1.05fr_1fr]">
      <div className="hidden flex-col justify-between bg-[var(--encre)] p-13 text-[var(--sur-encre)] md:flex">
        <MarqueGerimmo surEncre />
        <div>
          <h1 className="max-w-[11em] leading-[1.2] text-[var(--sur-encre)]">
            Gérez vos locations vous-même, au carré.
          </h1>
          <p className="mt-3.5 max-w-[26em] text-sm text-[var(--sur-encre)]/65">
            Vos lots, vos baux, vos quittances, votre livre recettes-dépenses
            et l&apos;aide à la déclaration des revenus fonciers — sans agence,
            sans commission.
          </p>
        </div>
        <p className="mono-discret text-[var(--sur-encre)]/60">
          14 jours d&apos;essai, sans carte bancaire
        </p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-6 md:hidden">
            <MarqueGerimmo />
          </div>
          <h2>Ouvrir mon espace propriétaire</h2>
          <p className="mt-1.5 mb-5 text-sm text-muted-foreground">
            Un compte, votre parc, 14 jours pour l&apos;essayer.
          </p>
          <FormulaireInscription />
        </div>
      </div>
    </main>
  );
}
