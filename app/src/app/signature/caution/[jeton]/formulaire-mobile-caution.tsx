"use client";

import { useActionState } from "react";
import { confirmerMobileCaution, type EtatConfirmationCaution } from "@/app/actions/confirmation-caution";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

// La caution saisit DEUX FOIS son numéro (jamais prérempli) et dit qu'il est le sien. Un formulaire public, à usage
// unique, hors des espaces suivis : pas de protection de saisie (data-saisie-libre).
export function FormulaireMobileCaution({ jeton }: { jeton: string }) {
  const [etat, action, enCours] = useActionState<EtatConfirmationCaution, FormData>(confirmerMobileCaution.bind(null, jeton), {});
  if (etat.succes) return <p role="status" className="rounded-xl bg-success-soft p-3 font-medium">{etat.succes}</p>;
  return (
    <form data-saisie-libre action={action} className="space-y-4" aria-busy={enCours}>
      <div className="space-y-1.5">
        <Label htmlFor="mobile">Votre numéro de mobile</Label>
        <Input id="mobile" name="mobile" type="tel" inputMode="tel" autoComplete="off" maxLength={40} required placeholder="06 12 34 56 78" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mobile_confirmation">Saisissez-le une seconde fois</Label>
        <Input id="mobile_confirmation" name="mobile_confirmation" type="tel" inputMode="tel" autoComplete="off" maxLength={40} required />
        <p className="text-xs text-muted-foreground">Hors de France, commencez par l’indicatif du pays, par exemple +32.</p>
      </div>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="personnel" value="oui" required className="mt-0.5 size-4 shrink-0 accent-primary" />
        <span>Ce numéro est mon numéro de mobile personnel. Il recevra le code de signature par SMS.</span>
      </label>
      {etat.erreur && <p role="alert" className="text-destructive">{etat.erreur}</p>}
      <Button type="submit" disabled={enCours} className="w-full">
        {enCours ? <><Spinner /> Confirmation…</> : "Confirmer mon numéro"}
      </Button>
    </form>
  );
}
