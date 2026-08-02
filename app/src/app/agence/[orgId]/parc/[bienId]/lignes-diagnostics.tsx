"use client";

import { useState } from "react";
import {
  TYPES_DIAGNOSTIC,
  COULEURS_STATUT_DIAGNOSTIC,
  LIBELLES_STATUT_DIAGNOSTIC,
  statutDiagnostic,
  type NiveauDiagnostic,
} from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import { Button } from "@/components/ui/button";
import { FormulaireDiagnostic } from "./formulaire-diagnostic";

export type DiagnosticDepose = {
  id: string;
  type: string;
  date_realisation: string;
  date_expiration: string | null;
  diagnostiqueur: string | null;
  document_id: string | null;
};

// Une ligne par diagnostic ATTENDU, déposé ou non — le manque se voit au même
// endroit que le reste, au lieu d'être relégué à une phrase sous la liste.
// Chaque ligne porte son action : déposer si absent, consulter et remplacer
// sinon (le remplacement archive l'ancien et lève seul le blocage, RM-0.8.5).
export function LignesDiagnostics({
  orgId,
  bienId,
  lotId,
  niveau,
  attendus,
  diagnostics,
}: {
  orgId: string;
  bienId: string;
  lotId: string | null;
  niveau: NiveauDiagnostic;
  attendus: string[];
  diagnostics: DiagnosticDepose[];
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);

  // Les attendus d'abord, puis les diagnostics déposés hors obligation
  const deposesParType = new Map(diagnostics.map((d) => [d.type, d]));
  const enPlus = diagnostics
    .map((d) => d.type)
    .filter((t) => !attendus.includes(t));
  const lignes = [...attendus, ...new Set(enPlus)];

  if (lignes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun diagnostic attendu à ce niveau.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {lignes.map((type) => {
        const d = deposesParType.get(type);
        const statut = d ? statutDiagnostic(d.date_expiration) : null;
        const manquant = !d;
        const obligatoire = attendus.includes(type);
        const enAlerte = (manquant && obligatoire) || statut === "expire";

        return (
          <li key={type} className="py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">
                {TYPES_DIAGNOSTIC[type]?.libelle ?? type}
                {!obligatoire && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (hors obligation)
                  </span>
                )}
              </span>

              {manquant ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    obligatoire
                      ? "bg-destructive-soft text-destructive-soft-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {obligatoire ? "⚠ Manquant" : "Non déposé"}
                </span>
              ) : (
                <>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.date_expiration
                      ? `expire le ${formaterDate(d.date_expiration)}`
                      : "validité illimitée"}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${COULEURS_STATUT_DIAGNOSTIC[statut!]}`}
                  >
                    {statut === "expire" ? "⚠ " : ""}
                    {LIBELLES_STATUT_DIAGNOSTIC[statut!]}
                  </span>
                </>
              )}

              {d?.document_id && (
                <a
                  href={`/agence/${orgId}/documents/${d.document_id}/fichier`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  Voir
                </a>
              )}
              <Button
                type="button"
                size="sm"
                variant={enAlerte ? "default" : "outline"}
                onClick={() => setOuvert((o) => (o === type ? null : type))}
              >
                {ouvert === type ? "Annuler" : manquant ? "Déposer" : "Remplacer"}
              </Button>
            </div>

            {d?.diagnostiqueur && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Réalisé le {formaterDate(d.date_realisation)} — {d.diagnostiqueur}
              </p>
            )}

            {ouvert === type && (
              <div className="mt-2 rounded-lg border border-border p-3">
                <FormulaireDiagnostic
                  orgId={orgId}
                  bienId={bienId}
                  lotId={lotId}
                  niveau={niveau}
                  typeInitial={type}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
