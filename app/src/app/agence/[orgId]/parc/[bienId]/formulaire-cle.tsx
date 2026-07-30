"use client";

import { useActionState, useState } from "react";
import { validerCle, type EtatParc } from "@/app/actions/parc";
import { MODES_CLE, proposerCle } from "@/lib/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LotCle = {
  id: string;
  nom: string;
  surface_m2: number | null;
  tantieme: number | null;
};

// Validation d'une nouvelle clé (l'ancienne est invalidée, jamais éditée —
// RM-0.4.4). La proposition se calcule selon le mode ; les pourcentages
// restent ajustables, la base valide le 100,00 exact.
export function FormulaireCle({
  orgId,
  bienId,
  lots,
}: {
  orgId: string;
  bienId: string;
  lots: LotCle[];
}) {
  const actionLiee = validerCle.bind(null, orgId, bienId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const [mode, setMode] = useState<"surface" | "tantiemes" | "parts_egales">("surface");
  const [parts, setParts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      proposerCle("surface", lots).map((l) => [l.lot_id, String(l.pourcentage)])
    )
  );

  const proposer = (nouveau: "surface" | "tantiemes" | "parts_egales") => {
    setMode(nouveau);
    setParts(
      Object.fromEntries(
        proposerCle(nouveau, lots).map((l) => [l.lot_id, String(l.pourcentage)])
      )
    );
  };

  const total = Object.values(parts).reduce((s, p) => s + (Number(p) || 0), 0);
  const totalArrondi = Math.round(total * 100) / 100;

  return (
    <form action={action} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">Valider une nouvelle clé</p>
      <div className="space-y-1.5">
        <Label htmlFor="cle-mode">Mode de calcul</Label>
        <select
          id="cle-mode"
          name="mode"
          value={mode}
          onChange={(e) => proposer(e.target.value as typeof mode)}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {Object.entries(MODES_CLE).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        {lots.map((lot) => (
          <div key={lot.id} className="flex items-center gap-2">
            <input type="hidden" name="ligne_lot_id" value={lot.id} />
            <span className="min-w-0 flex-1 truncate text-sm">{lot.nom}</span>
            <Input
              name="ligne_pourcentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              required
              value={parts[lot.id] ?? ""}
              onChange={(e) =>
                setParts((p) => ({ ...p, [lot.id]: e.target.value }))
              }
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        ))}
      </div>
      <p
        className={`text-sm ${totalArrondi === 100 ? "text-muted-foreground" : "text-destructive"}`}
      >
        Total : {totalArrondi} % {totalArrondi !== 100 && "— il faut exactement 100 %"}
      </p>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Validation…" : "Valider la clé"}
      </Button>
    </form>
  );
}
