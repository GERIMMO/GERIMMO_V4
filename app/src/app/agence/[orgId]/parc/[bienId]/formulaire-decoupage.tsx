"use client";

import { useActionState, useEffect, useState } from "react";
import { decouperBien, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LigneSaisie = { nom: string; surface: string };

// Formulaire entièrement contrôlé (revue 23/08) : les champs répétés
// `lot_nom`/`lot_surface` ne survivent pas au reset React après une erreur —
// six lignes saisies disparaissaient sur un refus du découpage. L'état
// React est la seule source, le reset ne peut plus rien effacer.
export function FormulaireDecoupage({
  orgId,
  bienId,
}: {
  orgId: string;
  bienId: string;
}) {
  const actionLiee = decouperBien.bind(null, orgId, bienId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const [lignes, setLignes] = useState<LigneSaisie[]>([{ nom: "", surface: "" }]);

  useEffect(() => {
    if (!etat.succes) return;
    // Découpage réussi : on repart d'une ligne vide (piloté par la réponse
    // du serveur, même idiome que l'assistant personnes)
    /* eslint-disable react-hooks/set-state-in-effect */
    setLignes([{ nom: "", surface: "" }]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [etat]);

  const majLigne = (i: number, champ: keyof LigneSaisie, valeur: string) =>
    setLignes((prev) => prev.map((l, n) => (n === i ? { ...l, [champ]: valeur } : l)));

  return (
    <form action={action} className="space-y-3">
      {lignes.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input
            name="lot_nom"
            maxLength={120}
            placeholder={`Nom du lot (ex. Lot ${i + 2} — RDC gauche)`}
            className="flex-1"
            value={l.nom}
            onChange={(e) => majLigne(i, "nom", e.target.value)}
          />
          <Input
            name="lot_surface"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="m²"
            className="w-24"
            value={l.surface}
            onChange={(e) => majLigne(i, "surface", e.target.value)}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setLignes((prev) => [...prev, { nom: "", surface: "" }])}
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
