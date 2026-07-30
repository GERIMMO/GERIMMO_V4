"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { decouperBien, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FormulaireDecoupage({
  orgId,
  bienId,
}: {
  orgId: string;
  bienId: string;
}) {
  const actionLiee = decouperBien.bind(null, orgId, bienId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const [nbLignes, setNbLignes] = useState(1);
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!etat.succes) return;
    formulaire.current?.reset();
    const minuterie = setTimeout(() => setNbLignes(1), 0);
    return () => clearTimeout(minuterie);
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-3">
      {Array.from({ length: nbLignes }, (_, i) => (
        <div key={i} className="flex gap-2">
          <Input
            name="lot_nom"
            maxLength={120}
            placeholder={`Nom du lot (ex. Lot ${i + 2} — RDC gauche)`}
            className="flex-1"
          />
          <Input
            name="lot_surface"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="m²"
            className="w-24"
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setNbLignes((n) => n + 1)}
        >
          + Ajouter une ligne
        </Button>
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "Découpage…" : "Créer les lots"}
        </Button>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
    </form>
  );
}
