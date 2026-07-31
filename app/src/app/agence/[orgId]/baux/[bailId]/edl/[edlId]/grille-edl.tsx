"use client";

import { useActionState } from "react";
import { majGrilleEdl, signerEdl, type EtatEdl } from "@/app/actions/edl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ETATS_ELEMENT: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon",
  usage: "Usagé",
  mauvais: "Mauvais",
  absent: "Absent",
};

type Ligne = {
  id: string;
  categorie: string;
  libelle: string;
  etat: string | null;
  commentaire: string | null;
};

export function GrilleEdl({
  orgId,
  bailId,
  edlId,
  lignes,
  signe,
}: {
  orgId: string;
  bailId: string;
  edlId: string;
  lignes: Ligne[];
  signe: boolean;
}) {
  const actionMaj = majGrilleEdl.bind(null, orgId, bailId, edlId);
  const [etatMaj, formMaj, enCoursMaj] = useActionState<EtatEdl, FormData>(actionMaj, {});
  const actionSigne = signerEdl.bind(null, orgId, bailId, edlId);
  const [etatSigne, formSigne, enCoursSigne] = useActionState<EtatEdl, FormData>(actionSigne, {});

  if (signe) {
    return (
      <div className="space-y-1">
        {lignes.map((l) => (
          <div key={l.id} className="flex items-center gap-3 border-b border-border py-1.5 text-sm">
            <span className="w-40 shrink-0 truncate">{l.libelle}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
              {l.etat ? ETATS_ELEMENT[l.etat] ?? l.etat : "—"}
            </span>
            {l.commentaire && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.commentaire}</span>
            )}
          </div>
        ))}
        <p className="pt-3 text-sm text-success-soft-foreground">
          ✓ État des lieux signé et figé — plus aucune modification possible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={formMaj} className="space-y-1">
        {lignes.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5">
            <span className="w-36 shrink-0 truncate text-sm">{l.libelle}</span>
            <select
              name={`etat_${l.id}`}
              defaultValue={l.etat ?? ""}
              className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">— état —</option>
              {Object.entries(ETATS_ELEMENT).map(([v, lib]) => (
                <option key={v} value={v}>
                  {lib}
                </option>
              ))}
            </select>
            <Input
              name={`commentaire_${l.id}`}
              defaultValue={l.commentaire ?? ""}
              placeholder="commentaire"
              className="h-8 min-w-40 flex-1 text-sm"
            />
          </div>
        ))}
        <div className="flex items-center gap-3 pt-3">
          <Button type="submit" size="sm" variant="outline" disabled={enCoursMaj}>
            {enCoursMaj ? "Enregistrement…" : "Enregistrer la grille"}
          </Button>
          {etatMaj.succes && (
            <span className="text-sm text-success-soft-foreground">{etatMaj.succes}</span>
          )}
          {etatMaj.erreur && <span className="text-sm text-destructive">{etatMaj.erreur}</span>}
        </div>
      </form>

      <form action={formSigne} className="border-t border-border pt-4">
        <p className="mb-2 text-sm text-muted-foreground">
          La signature fige l&apos;état des lieux : chaque ligne doit avoir un état.
        </p>
        <Button type="submit" size="sm" disabled={enCoursSigne}>
          {enCoursSigne ? "Signature…" : "Signer l'état des lieux"}
        </Button>
        {etatSigne.erreur && <p className="mt-1 text-sm text-destructive">{etatSigne.erreur}</p>}
      </form>
    </div>
  );
}
