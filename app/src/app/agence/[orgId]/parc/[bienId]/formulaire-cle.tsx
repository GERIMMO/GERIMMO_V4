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

// Formulations courtes pour le bouton de validation (MODES_CLE porte « (défaut) »)
const LIBELLE_BOUTON: Record<string, string> = {
  surface: "Valider la clé par surface",
  tantiemes: "Valider la clé par tantièmes",
  parts_egales: "Valider la clé en parts égales",
};

// Validation d'une nouvelle clé (l'ancienne est invalidée, jamais éditée —
// RM-0.4.4). La surface est le mode par défaut (RM-0.4.3) : la proposition est
// affichée telle quelle et se valide en un clic. RM-0.3.3 impose qu'un humain
// valide — d'où le clic, mais pas la saisie. « Modifier » ouvre l'ajustement
// (autre mode, ou pourcentages libres) ; la base valide le 100,00 exact.
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
  const [modifier, setModifier] = useState(false);
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
  // Sans surface saisie sur les lots, la proposition par surface n'a pas de sens
  const surfacesConnues = lots.every((l) => l.surface_m2 !== null && l.surface_m2 > 0);

  return (
    <form action={action} className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {modifier ? "Ajuster la clé" : "Clé proposée"}
          <span className="ml-1.5 font-normal text-muted-foreground">
            {modifier ? "" : `— ${MODES_CLE[mode]}`}
          </span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setModifier((m) => !m)}
        >
          {modifier ? "Revenir à la proposition" : "Modifier"}
        </Button>
      </div>

      {!surfacesConnues && !modifier && (
        <p className="text-sm text-warning-soft-foreground">
          Certains lots n&apos;ont pas de surface : la répartition par surface est
          incomplète. Renseignez les surfaces, ou ajustez la clé à la main.
        </p>
      )}

      {modifier && (
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
      )}
      {!modifier && <input type="hidden" name="mode" value={mode} />}

      <div className="space-y-2">
        {lots.map((lot) => (
          <div key={lot.id} className="flex items-center gap-2">
            <input type="hidden" name="ligne_lot_id" value={lot.id} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {lot.nom}
              {lot.surface_m2 !== null && (
                <span className="text-muted-foreground"> — {lot.surface_m2} m²</span>
              )}
            </span>
            {modifier ? (
              <>
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
              </>
            ) : (
              <>
                <input type="hidden" name="ligne_pourcentage" value={parts[lot.id] ?? ""} />
                <span className="w-20 text-right text-sm font-medium">
                  {parts[lot.id] ?? "—"} %
                </span>
              </>
            )}
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
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours
          ? "Validation…"
          : modifier
            ? "Valider la clé ajustée"
            : LIBELLE_BOUTON[mode]}
      </Button>
    </form>
  );
}
