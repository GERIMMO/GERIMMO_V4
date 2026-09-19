"use client";

import { useActionState } from "react";
import { changerMonMotDePasse, type EtatMotDePasse } from "@/app/actions/compte";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LONGUEUR_MINIMALE } from "@/lib/compte";

// Trois champs, aucun état local : React remet le formulaire à zéro quand
// l'action rend la main, ce qui est exactement ce qu'on veut de trois champs
// de mot de passe — réussite comme échec, on ne laisse pas traîner la saisie.
export function FormulaireMotDePasse() {
  const [etat, action] = useActionState<EtatMotDePasse, FormData>(changerMonMotDePasse, {});

  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mot_de_passe_actuel">Mot de passe actuel</Label>
        <Input
          id="mot_de_passe_actuel"
          name="mot_de_passe_actuel"
          type="password"
          autoComplete="current-password"
          required
          className="max-w-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mot_de_passe">Nouveau mot de passe</Label>
        <Input
          id="mot_de_passe"
          name="mot_de_passe"
          type="password"
          autoComplete="new-password"
          required
          minLength={LONGUEUR_MINIMALE}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {LONGUEUR_MINIMALE} caractères minimum. Il est vérifié contre les
          fuites de données connues : un mot de passe déjà exposé ailleurs est
          refusé ici.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmation">Confirmation</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={LONGUEUR_MINIMALE}
          className="max-w-sm"
        />
      </div>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat.message && (
        <p
          role="status"
          className="border-l-[3px] border-l-success bg-success-soft p-3 text-sm text-success-soft-foreground"
        >
          {etat.message}
        </p>
      )}
      <BoutonEnvoi enCoursTexte="Enregistrement…">Changer le mot de passe</BoutonEnvoi>
    </form>
  );
}
